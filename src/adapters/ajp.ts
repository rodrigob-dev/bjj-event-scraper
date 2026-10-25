// AJP (Abu Dhabi Jiu-Jitsu Pro, braço de eventos da UAEJJF) roda sobre o
// Smoothcomp em marca própria: ajptour.com/en/events/upcoming embute o mesmo
// `var events = [...]` com data ISO, país ISO, cidade e coordenadas. Nenhum
// evento AJP aparece na lista geral do smoothcomp.com, então a fonte é nova.
// categoryGroups vem sempre ["1"] (kimono) mesmo em "GI & NO-GI": o título é
// quem diz a modalidade. robots.txt pede Crawl-delay 10 s — http.ts respeita.

import { httpGet } from '../http.js';
import type { SourceAdapter, RawEvent } from '../types.js';
import { extractEventsArray, countryCodeOf } from './smoothcomp.js';
import { parsePlace, ufOfBrazilianCity } from '../normalize/places.js';
import { kidsFromTitle } from '../normalize/classify.js';

const UPCOMING_URL = 'https://ajptour.com/en/events/upcoming';

const NOGI_RE = /\bno-?gi\b/i;
// "GI" que não é o de "NO-GI": "… - GI & NO-GI", "… - GI".
const GI_RE = /(^|[^-])\bgi\b/i;

/** Modalidade pelo título. AJP é kimono por padrão: sem menção nenhuma → gi. */
export function giNogiOfTitle(title: string): { gi: boolean; nogi: boolean } {
  const nogi = NOGI_RE.test(title);
  const gi = GI_RE.test(title) || !nogi;
  return { gi, nogi };
}

function coord(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export const ajpAdapter: SourceAdapter = {
  name: 'ajp',
  strategy: 'http',
  priority: 2, // organizador oficial dos próprios eventos, mesmo patamar da IBJJF
  async fetchRaw() {
    return httpGet<string>(UPCOMING_URL, { json: false });
  },
  parse(raw): RawEvent[] {
    const out: RawEvent[] = [];
    for (const e of extractEventsArray(raw as string)) {
      if (e.eventEnded) continue;
      if (typeof e.title !== 'string' || typeof e.startdate !== 'string' || typeof e.url !== 'string') continue;

      const countryCode = countryCodeOf(e.location_country);
      const place = parsePlace(e.location_city ?? '', countryCode, e.location_country_human);
      if (countryCode === 'BR' && !place.state && place.city) {
        const uf = ufOfBrazilianCity(place.city);
        if (uf) place.state = uf;
      }

      let lat = coord(e.location_lat);
      let lng = coord(e.location_long);
      if (lat === undefined || lng === undefined || (lat === 0 && lng === 0)) lat = lng = undefined;

      const { gi, nogi } = giNogiOfTitle(e.title);
      // cover_image sem foto é um caminho relativo de fallback — o normalizador descarta (não é http).
      const imageUrl = typeof e.cover_image === 'string' ? e.cover_image : undefined;

      out.push({
        title: e.title,
        rawDate: e.startdate,
        ...(typeof e.enddate === 'string' ? { rawEndDate: e.enddate } : {}),
        location: [e.location_city?.trim(), e.location_country_human].filter(Boolean).join(', '),
        url: e.url,
        typeHint: 'competition',
        ...(imageUrl ? { imageUrl } : {}),
        ...(e.id !== undefined && e.id !== null && /^\d+$/.test(String(e.id)) ? { sourceId: `ajp:${e.id}` } : {}),
        ...(countryCode ? { countryCode } : {}),
        ...place,
        ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
        gi,
        nogi,
        kids: kidsFromTitle(e.title),
        sport: 'bjj',
        organizer: 'AJP',
      });
    }
    return out;
  },
};
