// Smoothcomp serve a lista de eventos como um array JSON embutido no HTML
// (`var events = [...]`). Não precisa de browser: fetch do HTML + extração
// do array. Cobertura mundial: entra todo evento não encerrado cuja categoria
// mapeie para bjj ou grappling (EMITTED_SPORTS) — judô, wrestling, MMA etc.
// ficam de fora porque o app é de jiu-jitsu.

import { httpGet } from '../http.js';
import type { SourceAdapter, RawEvent, Sport } from '../types.js';
import { parsePlace, ufOfBrazilianCity } from '../normalize/places.js';
import { kidsFromTitle } from '../normalize/classify.js';
import { toISODate } from '../normalize/dates.js';

const UPCOMING_URL = 'https://smoothcomp.com/en/events/upcoming';

// categoryGroups → modalidade. Ids inferidos dos títulos de 1557 eventos
// (2026-10-25): 1 "BJJ gi" (LigaBJJ, FUJI BJJ, Copa X), 7 "BJJ no-gi",
// 2/23 ju-jitsu JJIF/ne-waza (Ne-Waza Open, Джиу-Джитсу), 3/4 submission
// grappling (Grappling Industries, ADCC Open, Sub Only), 24 no-gi/sub-only
// (SUBMIT OR LOSE, EMATOM NOGI, ARMMADA GRAPPLING) — o contrato o listava em
// bjj; os títulos dizem grappling. 26 judô; 32/33/34/35 wrestling (UWW
// grappling, Dutch Wrestling Series, Takedown); 10/19/37 muay thai/MMA/K1.
// 51 reúne armwrestling, kung fu, pankration e pingue-pongue — fica em other.
// Ids fora da tabela são 'other' (karatê 9/27/28, taekwondo 29/30, sambo 22,
// wushu 40/44/46, sumô 25, boxe 52...). Ampliar o feed = mexer em EMITTED_SPORTS.
const SPORT_BY_GROUP: Record<string, Sport> = {
  '1': 'bjj', '2': 'bjj', '7': 'bjj', '23': 'bjj',
  '3': 'grappling', '4': 'grappling', '24': 'grappling',
  '26': 'judo',
  '32': 'wrestling', '33': 'wrestling', '34': 'wrestling', '35': 'wrestling',
  '10': 'mma', '19': 'mma', '37': 'mma',
};
// Evento com várias categorias ganha a modalidade mais específica p/ o app.
const SPORT_PRIORITY: Sport[] = ['bjj', 'grappling', 'judo', 'wrestling', 'mma', 'other'];
export const EMITTED_SPORTS: ReadonlySet<Sport> = new Set<Sport>(['bjj', 'grappling']);

const GI_GROUPS = new Set(['1']);
const NOGI_GROUPS = new Set(['7', '3', '4', '24']);

// Ruído da plataforma, que o filtro de "não passou" da normalização deixa entrar:
// o evento de teste do próprio Smoothcomp ("Smoothcomp Test Event", na Antártida,
// cidade "That cold place") e faixas de meses que seguem abertas depois de começar
// (um nacional de 2025 até 2026-12, uma formação de staff de um ano). Um evento de
// verdade de várias semanas que ainda não começou fica: dá para se inscrever nele.
const TEST_EVENT = /\btest event\b/i;
const MAX_SPAN_DAYS = 31;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** Linha que não é um evento: teste da plataforma, Antártida, ou faixa > 31 dias já começada. */
export function isPlatformNoise(
  e: Pick<SmoothcompEvent, 'title' | 'startdate' | 'enddate' | 'location_country'>,
  now: Date = new Date(),
): boolean {
  if (typeof e.title === 'string' && TEST_EVENT.test(e.title)) return true;
  if (countryCodeOf(e.location_country) === 'AQ') return true;
  const start = e.startdate;
  const end = e.enddate;
  if (typeof start !== 'string' || typeof end !== 'string' || !ISO_DAY.test(start) || !ISO_DAY.test(end)) return false;
  // Dias de calendário em UTC: as duas datas são dias sem hora, então não há fuso a errar.
  const spanDays = (Date.parse(end) - Date.parse(start)) / DAY_MS;
  return start < toISODate(now) && spanDays > MAX_SPAN_DAYS;
}

// Quem organiza (o subdomínio do evento ou uma marca no título) não é decidido
// aqui: src/normalize/organizador.ts resolve contra a base aprovada
// data/organizadores.json, igual para todas as fontes.

interface SmoothcompEvent {
  id?: number | string;
  title?: string;
  startdate?: string; // "2026-05-31"
  enddate?: string;
  location_city?: string;
  location_country?: string; // ISO alpha-2 (às vezes subdivisão: "GB-SCT")
  location_country_human?: string;
  location_lat?: string | number | null;
  location_long?: string | number | null;
  categoryGroups?: string[];
  url?: string;
  cover_image?: string; // capa real do evento
  eventEnded?: boolean;
}

/**
 * Extrai o array `var events = [...]` do HTML por balanceamento de colchetes
 * (ignora colchetes dentro de strings). Exportado p/ teste com fixtures.
 */
export function extractEventsArray(html: string): SmoothcompEvent[] {
  const marker = 'var events = ';
  const idx = html.indexOf(marker);
  if (idx === -1) return [];
  const start = idx + marker.length;
  let depth = 0;
  let end = -1;
  let inStr = false;
  let esc = false;
  for (let k = start; k < html.length; k++) {
    const c = html[k];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === '\\') {
      esc = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) {
        end = k + 1;
        break;
      }
    }
  }
  if (end === -1) return [];
  try {
    const parsed = JSON.parse(html.slice(start, end));
    return Array.isArray(parsed) ? (parsed as SmoothcompEvent[]) : [];
  } catch {
    // HTML malformado ou estrutura mudou — não deixa o JSON.parse derrubar a fonte.
    console.warn('[smoothcomp] falha ao parsear o array var events (layout mudou?)');
    return [];
  }
}

/** Modalidade de um evento a partir das categorias (a mais específica vence). */
export function sportOf(groups: string[] | undefined): Sport {
  const sports = new Set((groups ?? []).map((g) => SPORT_BY_GROUP[g] ?? 'other'));
  return SPORT_PRIORITY.find((s) => sports.has(s)) ?? 'other';
}

/** ISO alpha-2 do campo location_country. "GB-SCT"/"GB-NIR" (subdivisão ISO 3166-2) vira "GB". */
export function countryCodeOf(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const m = v.trim().toUpperCase().match(/^([A-Z]{2})(?:-[A-Z0-9]{1,3})?$/);
  return m ? m[1] : undefined;
}

function coord(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export const smoothcompAdapter: SourceAdapter = {
  name: 'smoothcomp',
  strategy: 'http',
  priority: 1, // agregador: perde p/ federação oficial em colisão de dedup
  async fetchRaw() {
    return httpGet<string>(UPCOMING_URL, { json: false });
  },
  parse(raw, now = new Date()): RawEvent[] {
    const html = raw as string;
    const events = extractEventsArray(html);
    const out: RawEvent[] = [];
    const noise: string[] = [];
    for (const e of events) {
      if (e.eventEnded) continue;
      if (typeof e.title !== 'string' || typeof e.startdate !== 'string' || typeof e.url !== 'string') {
        continue; // campos externos com tipo inesperado — descarta
      }
      const groups = Array.isArray(e.categoryGroups) ? e.categoryGroups.map(String) : [];
      const sport = sportOf(groups);
      if (!EMITTED_SPORTS.has(sport)) continue;
      // Depois do filtro de modalidade: o log só lista o que entraria no feed.
      if (isPlatformNoise(e, now)) {
        noise.push(`${e.id} "${e.title}"`);
        continue;
      }

      const countryCode = countryCodeOf(e.location_country);
      const place = parsePlace(e.location_city ?? '', countryCode, e.location_country_human);
      // Só a cidade ("Belém, Brazil"): a UF vem da tabela de cidades brasileiras.
      if (countryCode === 'BR' && !place.state && place.city) {
        const uf = ufOfBrazilianCity(place.city);
        if (uf) place.state = uf;
      }

      // 0,0 é "não geocodificado" no Smoothcomp, não o Golfo da Guiné.
      let lat = coord(e.location_lat);
      let lng = coord(e.location_long);
      if (lat === undefined || lng === undefined || (lat === 0 && lng === 0)) lat = lng = undefined;

      const gi = groups.some((g) => GI_GROUPS.has(g));
      const nogi = groups.some((g) => NOGI_GROUPS.has(g));

      out.push({
        title: e.title,
        rawDate: e.startdate,
        ...(typeof e.enddate === 'string' ? { rawEndDate: e.enddate } : {}),
        // v1: mesmo texto de sempre, p/ quem ainda lê `location` cru.
        location: [e.location_city, e.location_country_human].filter(Boolean).join(', '),
        url: e.url,
        typeHint: 'competition',
        imageUrl: typeof e.cover_image === 'string' ? e.cover_image : undefined,
        ...(e.id !== undefined && e.id !== null && /^\d+$/.test(String(e.id))
          ? { sourceId: `smoothcomp:${e.id}` }
          : {}),
        ...(countryCode ? { countryCode } : {}),
        ...place,
        ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
        // Só afirma gi/nogi quando alguma categoria conhecida está presente.
        ...(gi || nogi ? { gi, nogi } : {}),
        kids: kidsFromTitle(e.title),
        sport,
      });
    }
    if (noise.length) console.log(`[smoothcomp] ${noise.length} linha(s) de ruído descartada(s): ${noise.join(', ')}`);
    return out;
  },
};
