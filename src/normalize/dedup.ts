// Deduplicação entre fontes. Um mesmo campeonato pode aparecer no site da
// federação E no Smoothcomp. Duas passadas:
//   1. chave exata = título normalizado + dateISO (dedupe);
//   2. mesmo evento escrito de outro jeito por outra fonte (dedupeSameEvent):
//      "SÃO PAULO BJJ PRÓ" (FPJJ) × "São Paulo BJJ Pro IBJJF Championship 2026" (CBJJ).
// Em colisão, mantém a entrada de maior `priority` (federação oficial > agregador;
// empate → a primeira, na ordem do registry) e completa o que faltar nela com
// os dados de quem sai (fillFrom).

import type { ScrapedEvent } from '../types.js';
import { coordsOfPlace, norm } from './places.js';

/** Normaliza um título p/ comparação: minúsculo, sem acento, sem pontuação. */
export function slugifyTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacríticos combinantes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function dedupKey(title: string, dateISO: string): string {
  return `${slugifyTitle(title)}|${dateISO}`;
}

/**
 * O vencedor fica com os seus dados e herda do perdedor só o que não tem:
 * coordenadas (o mesmo evento, o mesmo ginásio), prazo (se anterior ao evento
 * que fica), ginásio e capa. Nunca sobrescreve.
 */
export function fillFrom(keep: ScrapedEvent, other: ScrapedEvent): ScrapedEvent {
  const add: Partial<ScrapedEvent> = {};
  if (keep.lat === undefined && other.lat !== undefined && other.lng !== undefined) {
    add.lat = other.lat;
    add.lng = other.lng;
    if (other.geo) add.geo = other.geo;
  }
  if (!keep.registrationDeadlineISO && other.registrationDeadlineISO && other.registrationDeadlineISO < keep.dateISO) {
    add.registrationDeadlineISO = other.registrationDeadlineISO;
  }
  if (!keep.venue && other.venue) add.venue = other.venue;
  if (!keep.imageUrl && other.imageUrl) add.imageUrl = other.imageUrl;
  return Object.keys(add).length ? { ...keep, ...add } : keep;
}

/**
 * Recebe eventos com prioridade de fonte e devolve sem duplicatas.
 * Em colisão, quem fica completa o que lhe falta com os dados de quem sai.
 * @param events eventos já normalizados (com dateISO e id)
 * @param priorityBySource mapa source → prioridade (maior vence)
 */
export function dedupe(
  events: ScrapedEvent[],
  priorityBySource: Record<string, number>,
): ScrapedEvent[] {
  const byKey = new Map<string, ScrapedEvent>();
  for (const ev of events) {
    const key = dedupKey(ev.title, ev.dateISO);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, ev);
      continue;
    }
    const pNew = priorityBySource[ev.source] ?? 0;
    const pOld = priorityBySource[existing.source] ?? 0;
    byKey.set(key, pNew > pOld ? fillFrom(ev, existing) : fillFrom(existing, ev));
  }
  return [...byKey.values()];
}

// ── 2ª passada: o mesmo evento escrito de outro jeito ────────────────────────

// Palavras que não distinguem um evento de outro: ano, sigla de federação,
// "campeonato"/"open"/"international", "jiu-jitsu", preposições.
const STOPWORDS = new Set([
  'ibjjf', 'cbjj', 'cbjjo', 'fpjj', 'fjjrio', 'sjjif', 'nabjjf', 'jjwl', 'ajp', 'uaejjf',
  'championship', 'championships', 'campeonato', 'tournament', 'torneio',
  'open', 'aberto', 'international', 'internacional',
  'jiu', 'jitsu', 'jiujitsu', 'bjj',
  'de', 'do', 'da', 'dos', 'das', 'e', 'the', 'of', 'and', 'a',
]);
// Edição infantil e edição sem kimono são eventos à parte do adulto com kimono.
const KIDS_TITLE_RE = /\bkids?\b|infantil|juvenil|youth|crian[çc]as|festival/i;
const NOGI_TITLE_RE = /\bno[- ]?gi\b|sem kimono/i;
const MAX_KM = 15;
const DAY_MS = 86_400_000;

/** "São Paulo BJJ Pro IBJJF Championship 2026" → {sao, paulo, pro}. */
export function titleTokens(title: string): Set<string> {
  const words = norm(title).split(/[^a-z0-9]+/).filter(Boolean);
  return new Set(words.filter((w) => !STOPWORDS.has(w) && !/^\d{4}$/.test(w)));
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  for (const t of a) if (!b.has(t)) return false;
  return true;
}

function km(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Coordenadas da linha ou, só p/ comparar, o centro da cidade pela tabela. */
function coordsOf(e: ScrapedEvent): [number, number] | undefined {
  if (e.lat !== undefined && e.lng !== undefined) return [e.lat, e.lng];
  return e.city && e.countryCode ? coordsOfPlace(e.city, e.state, e.countryCode) : undefined;
}

function samePlace(a: ScrapedEvent, b: ScrapedEvent): boolean {
  if (a.city && b.city && a.countryCode && a.countryCode === b.countryCode && norm(a.city) === norm(b.city)) return true;
  const ca = coordsOf(a);
  const cb = coordsOf(b);
  return !!ca && !!cb && km(ca, cb) <= MAX_KM;
}

function sameDays(a: ScrapedEvent, b: ScrapedEvent): boolean {
  const aEnd = a.endDateISO ?? a.dateISO;
  const bEnd = b.endDateISO ?? b.dateISO;
  if (a.dateISO <= bEnd && b.dateISO <= aEnd) return true;
  return Math.abs(Date.parse(a.dateISO) - Date.parse(b.dateISO)) <= DAY_MS;
}

/**
 * Mesmo evento em fontes diferentes: mesmo lugar (cidade + país, ou ≤ 15 km),
 * mesmos dias (intervalos se cruzam ou começam a ≤ 1 dia), e o título de um
 * contém o do outro depois de tirar as palavras genéricas. Nunca quando só um
 * dos títulos é infantil ou só um é sem kimono (gêmeos gi/no-gi, edição kids),
 * nem quando o título menor é só o nome da cidade.
 */
export function isSameEvent(a: ScrapedEvent, b: ScrapedEvent): boolean {
  if (a.source === b.source) return false;
  if (KIDS_TITLE_RE.test(a.title) !== KIDS_TITLE_RE.test(b.title)) return false;
  if (NOGI_TITLE_RE.test(a.title) !== NOGI_TITLE_RE.test(b.title)) return false;
  if (!sameDays(a, b) || !samePlace(a, b)) return false;
  const ta = titleTokens(a.title);
  const tb = titleTokens(b.title);
  const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  if (small.size === 0 || !isSubset(small, big)) return false;
  // Só o nome da cidade não identifica o evento: "Dublin International Open"
  // (Sub Only) e "Dublin Fall International Open IBJJF" são dois eventos no
  // mesmo fim de semana. O título menor precisa de uma palavra além da cidade.
  const cityWords = titleTokens(`${a.city ?? ''} ${b.city ?? ''}`);
  return [...small].some((t) => !cityWords.has(t));
}

export interface SameEventMerge {
  kept: ScrapedEvent;
  dropped: ScrapedEvent;
}

/**
 * 2ª passada, depois de `dedupe`. Percorre da maior prioridade p/ a menor
 * (empate: a ordem das fontes em priorityBySource, que é a do registry — CBJJ
 * antes da FPJJ, NABJJF antes da SJJIF; depois a ordem de entrada); cada linha que é o mesmo
 * evento de uma já mantida, de outra fonte, é absorvida por ela. Duas linhas da
 * mesma fonte nunca se fundem aqui, nem indiretamente (uma linha mantida
 * absorve no máximo uma de cada fonte) — a fonte sabe que são eventos distintos.
 * @returns as linhas mantidas, na ordem de entrada, e os pares fundidos (p/ o log)
 */
export function dedupeSameEvent(
  events: ScrapedEvent[],
  priorityBySource: Record<string, number>,
): { events: ScrapedEvent[]; merges: SameEventMerge[] } {
  const rank = new Map(Object.keys(priorityBySource).map((src, i) => [src, i]));
  const order = events
    .map((ev, i) => ({ ev, i, p: priorityBySource[ev.source] ?? 0, r: rank.get(ev.source) ?? rank.size }))
    .sort((x, y) => y.p - x.p || x.r - y.r || x.i - y.i);
  // `absorbed`: fontes já fundidas em cada linha mantida. Uma linha absorve no
  // máximo uma de cada fonte — duas da mesma fonte são, p/ ela, eventos distintos,
  // e fundir as duas na mesma linha seria fundi-las entre si.
  const kept: Array<{ ev: ScrapedEvent; i: number; absorbed: Set<string> }> = [];
  const merges: SameEventMerge[] = [];
  for (const cur of order) {
    const hit = kept.find((k) => !k.absorbed.has(cur.ev.source) && isSameEvent(k.ev, cur.ev));
    if (hit) {
      merges.push({ kept: hit.ev, dropped: cur.ev });
      hit.ev = fillFrom(hit.ev, cur.ev);
      hit.absorbed.add(cur.ev.source);
    } else {
      kept.push({ ev: cur.ev, i: cur.i, absorbed: new Set() });
    }
  }
  kept.sort((x, y) => x.i - y.i);
  return { events: kept.map((k) => k.ev), merges };
}
