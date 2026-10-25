// Smoothcomp serve a lista de eventos como um array JSON embutido no HTML
// (`var events = [...]`). Não precisa de browser: fetch do HTML + extração
// do array. Cobertura mundial: entra todo evento não encerrado cuja categoria
// mapeie para bjj ou grappling (EMITTED_SPORTS) — judô, wrestling, MMA etc.
// ficam de fora porque o app é de jiu-jitsu.

import { httpGet } from '../http.js';
import type { SourceAdapter, RawEvent, Sport } from '../types.js';
import { parsePlace } from '../normalize/places.js';
import { kidsFromTitle } from '../normalize/classify.js';

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

// Subdomínio do Smoothcomp → nome do organizador. Fora da tabela, o próprio
// subdomínio é o chip (é a marca que o organizador escolheu).
const ORGANIZER_BY_HOST: Record<string, string> = {
  ligabjj: 'LigaBJJ', grapplingindustries: 'Grappling Industries', fujibjj: 'FUJI BJJ',
  allstarsbjj: 'All Stars BJJ', agf: 'AGF', naga: 'NAGA', newbreedbjj: 'NewBreed',
  submissionchallenge: 'Submission Challenge', nzbjjf: 'NZBJJF', compnet: 'Compnet',
  avagrappling: 'AVA Grappling', 'ontario-jiu-jitsu': 'Ontario Jiu-Jitsu', sbjjf: 'SBJJF',
  bjjao: 'BJJAO', subonly: 'Sub Only', pbjjf: 'PBJJF', francegrappling: 'France Grappling',
  grapplingx: 'GrapplingX', bjjfnl: 'BJJF NL', empiregrappling: 'Empire Grappling', dbjj: 'DBJJ',
  adcc: 'ADCC', bjj247: 'BJJ 24/7', nanka: 'NANKA', 'aus-grappling-federation': 'Australian Grappling Federation',
  spainbjjtour: 'Spain BJJ Tour', goodfight: 'Good Fight', afbjj: 'AFBJJ', abjjc: 'ABJJC',
  fijjd: 'FIJJD', sjjif: 'SJJIF', nabjjf: 'NABJJF', copagaucha: 'Copa Gaúcha', jjwl: 'Jiu Jitsu World League',
};
// Host genérico (smoothcomp.com): organizadores grandes que aparecem no título.
const ORGANIZER_BY_TITLE: Array<[RegExp, string]> = [
  [/\bNAGA\b/i, 'NAGA'],
  [/grappling industries/i, 'Grappling Industries'],
  [/\bFUJI\b/i, 'FUJI BJJ'],
  [/\bADCC\b/i, 'ADCC'],
  [/\bnew ?breed\b/i, 'NewBreed'],
  [/\bgood ?fight\b/i, 'Good Fight'],
  [/\bAGF\b/i, 'AGF'],
  [/jiu[ -]?jitsu world league|\bJJWL\b/i, 'Jiu Jitsu World League'],
];

interface SmoothcompEvent {
  id?: number | string;
  title?: string;
  startdate?: string; // "2026-05-31"
  enddate?: string;
  location_city?: string;
  location_country?: string; // ISO alpha-2
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

/** Nome do organizador: subdomínio do evento ou, no host genérico, o título. */
export function organizerOf(url: string, title: string): string | undefined {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  const m = host.match(/^([a-z0-9-]+)\.smoothcomp\.com$/);
  if (m && m[1] !== 'www') return ORGANIZER_BY_HOST[m[1]!] ?? m[1];
  return ORGANIZER_BY_TITLE.find(([re]) => re.test(title))?.[1];
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
  parse(raw): RawEvent[] {
    const html = raw as string;
    const events = extractEventsArray(html);
    const out: RawEvent[] = [];
    for (const e of events) {
      if (e.eventEnded) continue;
      if (typeof e.title !== 'string' || typeof e.startdate !== 'string' || typeof e.url !== 'string') {
        continue; // campos externos com tipo inesperado — descarta
      }
      const groups = Array.isArray(e.categoryGroups) ? e.categoryGroups.map(String) : [];
      const sport = sportOf(groups);
      if (!EMITTED_SPORTS.has(sport)) continue;

      const countryCode =
        typeof e.location_country === 'string' && /^[A-Z]{2}$/.test(e.location_country)
          ? e.location_country
          : undefined;
      const place = parsePlace(e.location_city ?? '', countryCode, e.location_country_human);

      // 0,0 é "não geocodificado" no Smoothcomp, não o Golfo da Guiné.
      let lat = coord(e.location_lat);
      let lng = coord(e.location_long);
      if (lat === undefined || lng === undefined || (lat === 0 && lng === 0)) lat = lng = undefined;

      const gi = groups.some((g) => GI_GROUPS.has(g));
      const nogi = groups.some((g) => NOGI_GROUPS.has(g));
      const organizer = organizerOf(e.url, e.title);

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
        ...(organizer ? { organizer } : {}),
      });
    }
    return out;
  },
};
