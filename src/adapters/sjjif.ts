// SJJIF (Sport Jiu Jitsu International Federation). A página /calendar/
// upcomingEvents carrega a lista por JS, mas a home (sjjif.com/) renderiza no
// servidor dois blocos — "Upcoming Events" (eventos da própria SJJIF) e
// "Sanctioned Events" (federações filiadas: SJJCF China, ASJJF Ásia, SJJJF
// Japão…) — cada um assim:
//   <h4 class="section-title uppercase"><a href="/public/eventInfo/2124">título</a></h4>
//   <div class="event-info …"><a href=…><img src="…banner…"></a></div>
//   <div class="capitalize event-info"><a href=…>December 12, 2026<br>Local, Cidade<br>China<br></a></div>
// Títulos vêm em minúsculas (o CSS põe em caixa alta): aqui ganham Title Case
// com as siglas preservadas. O país vem por extenso → tabela compartilhada.

import * as cheerio from 'cheerio';
import { httpGet } from '../http.js';
import type { SourceAdapter, RawEvent } from '../types.js';
import { parseEnRange } from '../normalize/text-dates.js';
import { countryCodeOfName } from '../normalize/countries.js';
import { titleCaseIfShouting, ufOfBrazilianCity } from '../normalize/places.js';
import { placeOfIbjjfCity } from './ibjjf-places.js';
import { kidsFromTitle } from '../normalize/classify.js';

const ORIGIN = 'https://sjjif.com';
const HOME_URL = `${ORIGIN}/`;
const SANCTIONED_MARKER = 'Sanctioned Events';

// Federações que assinam o título ("sjjcf shenyang…"): viram o organizer.
const FEDERATIONS = ['SJJIF', 'SJJCF', 'ASJJF', 'SJJJF', 'NABJJF', 'SJJBF', 'JBJJF'];
const ACRONYM_RE = new RegExp(`\\b(${[...FEDERATIONS, 'BJJ', 'JJ', 'USA', 'UK', 'UAE', 'JJIF'].join('|')})\\b`, 'gi');

export interface SjjifCard {
  id: string;
  title: string;
  dateText: string;
  venueLine?: string;
  countryLine?: string;
  imageUrl?: string;
  url: string;
  section: 'upcoming' | 'sanctioned';
}

/** "sjjcf zhejiang jiu jitsu championship 2026(gi event)" → "SJJCF Zhejiang Jiu Jitsu Championship 2026 (Gi Event)". */
export function cleanTitle(raw: string): string {
  const spaced = raw.replace(/\s+/g, ' ').replace(/(\S)\(/g, '$1 (').trim();
  return titleCaseIfShouting(spaced)
    .replace(/\(([a-z])/g, (_, c: string) => `(${c.toUpperCase()}`) // "(gi event)" → "(Gi Event)"
    .replace(ACRONYM_RE, (m) => m.toUpperCase());
}

function cardsIn(html: string, section: SjjifCard['section']): SjjifCard[] {
  const $ = cheerio.load(html);
  const out: SjjifCard[] = [];
  $('h4.section-title a[href*="/public/eventInfo/"]').each((_, a) => {
    const href = $(a).attr('href') ?? '';
    const id = href.match(/eventInfo\/(\d+)/)?.[1];
    const title = $(a).text().replace(/\s+/g, ' ').trim();
    if (!id || !title) return;
    const info = $(`div.capitalize.event-info a[href="${href}"]`).first();
    if (!info.length) return;
    // Linhas separadas por <br>: data, local (opcional), país (opcional).
    const lines: string[] = [];
    let cur = '';
    info.contents().each((__, node) => {
      if (node.type === 'tag' && node.name === 'br') {
        if (cur.trim()) lines.push(cur.replace(/\s+/g, ' ').trim());
        cur = '';
      } else {
        cur += $(node).text();
      }
    });
    if (cur.trim()) lines.push(cur.replace(/\s+/g, ' ').trim());
    const dateText = lines[0];
    if (!dateText) return;
    const rest = lines.slice(1);
    const last = rest[rest.length - 1];
    const countryLine = last && countryCodeOfName(last) ? rest.pop() : undefined;
    const venueLine = rest.join(', ') || undefined;
    const img = $(`div.event-info a[href="${href}"] img`).first().attr('src');
    out.push({
      id,
      title,
      dateText,
      ...(venueLine ? { venueLine } : {}),
      ...(countryLine ? { countryLine } : {}),
      ...(img ? { imageUrl: img } : {}),
      url: `${ORIGIN}${href}`,
      section,
    });
  });
  return out;
}

/** Cards da home: os de "Upcoming Events" antes do marcador, "Sanctioned Events" depois. */
export function extractCards(html: string): SjjifCard[] {
  const idx = html.indexOf(SANCTIONED_MARKER);
  if (idx === -1) return cardsIn(html, 'upcoming');
  return [...cardsIn(html.slice(0, idx), 'upcoming'), ...cardsIn(html.slice(idx), 'sanctioned')];
}

/** Federação que assina o título; evento sem assinatura é da SJJIF (seção própria ou sancionado). */
export function organizerOf(title: string): string {
  const first = title.trim().split(/\s+/)[0]?.toUpperCase() ?? '';
  return FEDERATIONS.includes(first) ? first : 'SJJIF';
}

export const sjjifAdapter: SourceAdapter = {
  name: 'sjjif',
  strategy: 'http',
  priority: 2,
  async fetchRaw() {
    return httpGet<string>(HOME_URL, { json: false });
  },
  parse(raw): RawEvent[] {
    const out: RawEvent[] = [];
    for (const c of extractCards(raw as string)) {
      const range = parseEnRange(c.dateText);
      if (!range) {
        console.warn(`[sjjif] data não reconhecida, descartado: "${c.dateText}" (${c.title})`);
        continue;
      }
      const title = cleanTitle(c.title);
      const countryCode = countryCodeOfName(c.countryLine);
      // "Chaparral High School, las vegas" → local + cidade; só um trecho = só o local.
      const parts = (c.venueLine ?? '').split(',').map((p) => p.trim().replace(/\.$/, '')).filter(Boolean);
      const venue = parts[0];
      const city = parts.length >= 2 ? titleCaseIfShouting(parts[parts.length - 1]!) : undefined;
      let state: string | undefined;
      if (city && countryCode === 'US') {
        const p = placeOfIbjjfCity(city);
        if (p?.cc === 'US') state = p.state;
      } else if (city && countryCode === 'BR') {
        state = ufOfBrazilianCity(city);
      }
      const nogi = /\bno-?gi\b/i.test(c.title);
      const gi = /(^|[^-])\bgi\b/i.test(c.title);

      out.push({
        title,
        rawDate: range.start,
        rawEndDate: range.end,
        location: [c.venueLine, c.countryLine].filter(Boolean).join(', '),
        url: c.url,
        typeHint: 'competition',
        ...(c.imageUrl ? { imageUrl: c.imageUrl } : {}),
        sourceId: `sjjif:${c.id}`,
        ...(venue ? { venue } : {}),
        ...(city ? { city } : {}),
        ...(state ? { state } : {}),
        ...(countryCode ? { countryCode } : {}),
        // Só afirma modalidade quando o título a nomeia ("(gi event)", "no-gi championship").
        ...(gi || nogi ? { gi, nogi } : {}),
        kids: kidsFromTitle(title),
        sport: 'bjj',
        organizer: organizerOf(c.title),
      });
    }
    return out;
  },
};
