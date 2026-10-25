// JJWL (Jiu Jitsu World League, EUA). O corpo de /jjwl/tournaments é uma tabela
// de 2018 que nunca foi atualizada; a lista viva é o menu TOURNAMENTS
// (#header_tournaments_list_container), com um link /events/<slug> por evento
// registrável — cada torneio vira 4 (GI/NoGI × Youth/Adults), em dias que podem
// diferir. A página do evento é HTML do servidor:
//   <div class="font-weight-bold mb-2">Event Day</div><div>… November  7th, 2026</div>
//   <div …>Event Address</div><div>… 2601 Avenue of the Stars, Frisco, TX 75034, United States</div>
//   <div …>Application deadline:</div><div>… Nov 4th, 2026</div>
// Uma requisição por evento (~32 por coleta), dentro do rate-limit. robots.txt
// só proíbe /ajax/, /dynamic/ e /js/.

import * as cheerio from 'cheerio';
import { httpGet } from '../http.js';
import type { SourceAdapter, RawEvent } from '../types.js';
import { parseEnRange } from '../normalize/text-dates.js';
import { countryCodeOfName } from '../normalize/countries.js';
import { parsePlace } from '../normalize/places.js';
import { kidsFromTitle } from '../normalize/classify.js';

const BASE = 'https://www.jjworldleague.com';
const LIST_URL = `${BASE}/jjwl/tournaments`;
// Teto de páginas por coleta: o menu lista ~8 torneios × 4 eventos.
const MAX_PAGES = 60;

export interface JjwlRaw {
  list: string;
  pages: Record<string, string>; // slug → HTML da página do evento
}

/** Slugs do menu de torneios, na ordem, sem repetição. */
export function extractEventSlugs(html: string): string[] {
  const $ = cheerio.load(html);
  const scope = $('#header_tournaments_list_container');
  const links = scope.length ? scope.find('a[href^="/events/"]') : $('a[href^="/events/"]');
  const seen = new Set<string>();
  links.each((_, a) => {
    const slug = ($(a).attr('href') ?? '').replace(/^\/events\//, '').split(/[?#]/)[0] ?? '';
    if (/^[A-Za-z0-9_-]+$/.test(slug)) seen.add(slug);
  });
  return [...seen];
}

const clean = (s: string) => s.replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/**
 * Texto do <div> que segue o rótulo ("Event Day" → "November  7th, 2026"). Regex,
 * não DOM: o parser HTML5 perde o bloco do título no documento inteiro (markup
 * quebrado mais acima), e o padrão rótulo → <div><i/> valor é estável.
 */
function valueAfterLabel(html: string, label: string): string | undefined {
  const re = new RegExp(`>\\s*${label}\\s*</div>\\s*<div[^>]*>\\s*(?:<i[^>]*>\\s*</i>)?\\s*([^<]+)`, 'i');
  const v = html.match(re)?.[1];
  return v ? clean(v) || undefined : undefined;
}

/** Título: o bloco event-name-font; senão o og:title sem o prefixo/sufixo do site. */
function titleOf(html: string): string | undefined {
  const block = html.match(/event-name-font[^>]*>\s*<h2>([^<]+)<\/h2>/i)?.[1];
  if (block && clean(block)) return clean(block);
  const og = html.match(/<meta property="og:title" content="([^"]*)"/i)?.[1];
  if (!og) return undefined;
  const t = clean(og)
    .replace(/^Jiu Jitsu World League\s*-\s*/i, '')
    .replace(/\s*-\s*Jiu Jitsu World League event registration$/i, '');
  return t || undefined;
}

/** Uma página de evento → RawEvent; undefined quando falta título ou data. */
export function parseEventPage(slug: string, html: string): RawEvent | undefined {
  const title = titleOf(html);
  const dayText = valueAfterLabel(html, 'Event Day');
  const range = dayText ? parseEnRange(dayText) : undefined;
  if (!title || !range) return undefined;

  const address = valueAfterLabel(html, 'Event Address');
  const deadlineText = valueAfterLabel(html, 'Application deadline:?');
  const deadline = deadlineText ? parseEnRange(deadlineText)?.start : undefined;
  const image = html.match(/<meta property="og:image" content="([^"]*)"/i)?.[1];

  // "2601 Avenue of the Stars, Frisco, TX 75034, United States": o país é o
  // último trecho; a rua sai antes (o parser de lugares tomaria "2601" por CEP);
  // CEP e estado ficam por conta dele.
  const addrParts = (address ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  const countryName = addrParts[addrParts.length - 1];
  const countryCode = countryCodeOfName(countryName);
  const withoutStreet = addrParts.filter((p, i) => !(i === 0 && /^\d+\s+\S/.test(p))).join(', ');
  const place = withoutStreet ? parsePlace(withoutStreet, countryCode, countryName) : {};

  const nogi = /\bno-?gi\b/i.test(`${slug} ${title}`);
  const gi = !nogi && /\bgi\b/i.test(`${slug} ${title}`);

  return {
    title,
    rawDate: range.start,
    rawEndDate: range.end,
    location: address ?? '',
    url: `${BASE}/events/${slug}`,
    typeHint: 'competition',
    ...(image ? { imageUrl: image } : {}),
    sourceId: `jjwl:${slug}`,
    ...place,
    ...(countryCode ? { countryCode } : {}),
    ...(gi || nogi ? { gi, nogi } : {}),
    kids: kidsFromTitle(title),
    sport: 'bjj',
    organizer: 'JJWL',
    ...(deadline && deadline < range.start ? { registrationDeadlineISO: deadline } : {}),
  };
}

export const jjwlAdapter: SourceAdapter = {
  name: 'jjwl',
  strategy: 'http',
  priority: 2,
  async fetchRaw(): Promise<JjwlRaw> {
    const list = await httpGet<string>(LIST_URL, { json: false });
    const pages: Record<string, string> = {};
    for (const slug of extractEventSlugs(list).slice(0, MAX_PAGES)) {
      try {
        pages[slug] = await httpGet<string>(`${BASE}/events/${slug}`, { json: false });
      } catch (err) {
        // Uma página fora do ar não derruba a fonte; o evento só fica de fora nesta coleta.
        console.warn(`[jjwl] página do evento falhou: ${slug} (${err instanceof Error ? err.message : err})`);
      }
    }
    return { list, pages };
  },
  parse(raw): RawEvent[] {
    const { pages } = raw as JjwlRaw;
    const out: RawEvent[] = [];
    for (const [slug, html] of Object.entries(pages ?? {})) {
      const ev = parseEventPage(slug, html);
      if (ev) out.push(ev);
      else console.warn(`[jjwl] sem título ou data na página, descartado: ${slug}`);
    }
    return out;
  },
};
