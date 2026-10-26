// NABJJF (North American Brazilian Jiu-Jitsu Federation, filiada à SJJIF; EUA).
// Site Next.js renderizado no servidor. /tournaments tem duas abas; a primeira
// ("Upcoming") lista <a class="evc" href="/events/<slug>"> por evento. A página
// do evento traz tudo num <dl class="evh-meta">:
//   <dt>Date</dt><dd>Sat, Jan 23, 2027</dd>
//   <dt>Venue</dt><dd>Cerritos College<small>11110 Alondra Blvd, Norwalk, CA 90650</small></dd>
//   <dt>Format</dt><dd>Gi &amp; No-Gi · All belts<small>Kids · Juveniles · Adults &amp; Masters</small></dd>
// e o prazo na escada de preços: <b class="evh-pt">Closes Jan 13</b> (ou
// "General registration opens Nov 11 · closes Feb 17"), sem ano. Uma requisição
// por evento (4–5 por coleta). robots.txt proíbe /api/ — não é usado — e permite
// /events/. A inscrição é no Smoothcomp (nabjjf.smoothcomp.com): o mesmo evento
// com o mesmo título é deduplicado, e esta fonte (organizador) vence o agregador.

import * as cheerio from 'cheerio';
import { httpGet } from '../http.js';
import type { SourceAdapter, RawEvent } from '../types.js';
import { parseEnRange } from '../normalize/text-dates.js';
import { parsePlace, regionCode } from '../normalize/places.js';
import { kidsFromTitle } from '../normalize/classify.js';

const BASE = 'https://nabjjf.com';
const LIST_URL = `${BASE}/tournaments`;
// A aba "Upcoming" tem meia dúzia de eventos; a de "Past" tem mais de cem e não entra.
const MAX_PAGES = 12;

export interface NabjjfRaw {
  list: string;
  pages: Record<string, string>; // slug → HTML da página do evento
}

const clean = (s: string) =>
  s.replace(/<!--.*?-->/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

/** Slugs da aba "Upcoming" de /tournaments, na ordem, sem repetição. */
export function extractUpcomingSlugs(html: string): string[] {
  const $ = cheerio.load(html);
  let panel = $('[role="tabpanel"][id$="-up"]');
  if (!panel.length) panel = $('[role="tabpanel"]').first();
  const seen = new Set<string>();
  panel.find('a[href^="/events/"]').each((_, a) => {
    const slug = ($(a).attr('href') ?? '').replace(/^\/events\//, '').split(/[?#/]/)[0] ?? '';
    if (/^[A-Za-z0-9_-]+$/.test(slug)) seen.add(slug);
  });
  return [...seen];
}

/** Valor do <dd> que segue o <dt> dado; o <small> vira o segundo item. */
function metaOf(html: string, label: string): { main?: string; small?: string } {
  const m = html.match(new RegExp(`<dt>\\s*${label}\\s*</dt>\\s*<dd>([\\s\\S]*?)</dd>`, 'i'));
  if (!m) return {};
  const small = m[1]!.match(/<small>([\s\S]*?)<\/small>/i)?.[1];
  const main = m[1]!.replace(/<small>[\s\S]*?<\/small>/i, '').replace(/<[^>]+>/g, '');
  return { ...(clean(main) ? { main: clean(main) } : {}), ...(small && clean(small) ? { small: clean(small) } : {}) };
}

/** "Closes Jan 13" / "… · closes Feb 17" → ISO no ano do evento (ou no anterior, se cair depois dele). */
export function deadlineOf(html: string, eventStartISO: string): string | undefined {
  const text = html.match(/<b class="evh-pt">([\s\S]*?)<\/b>/i)?.[1];
  const md = text ? clean(text).match(/\bcloses\s+([A-Za-z]{3,9}\.?\s+\d{1,2})\b/i)?.[1] : undefined;
  if (!md) return undefined;
  const year = Number(eventStartISO.slice(0, 4));
  const start = Date.parse(eventStartISO);
  // Mesmo ano do evento; "Closes Dec 23" de um evento em janeiro é a virada para
  // o ano anterior — e só vale perto do evento (≤ 180 dias). "Closes Jan 30" de um
  // evento em 23/jan não é um prazo de um ano atrás: a página mudou, fica sem prazo.
  for (const y of [year, year - 1]) {
    const iso = parseEnRange(`${md}, ${y}`)?.start;
    if (!iso) continue;
    const daysBefore = (start - Date.parse(iso)) / 86_400_000;
    if (daysBefore > 0 && (y === year || daysBefore <= 180)) return iso;
  }
  return undefined;
}

/** Uma página de evento → RawEvent; undefined quando falta título ou data. */
export function parseEventPage(slug: string, html: string): RawEvent | undefined {
  const title = clean(html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '').replace(/\s*\|\s*NABJJF$/i, '');
  const date = metaOf(html, 'Date').main;
  const range = date ? parseEnRange(date) : undefined;
  if (!title || !range) return undefined;

  const venueMeta = metaOf(html, 'Venue');
  const venue = venueMeta.main;
  const address = venueMeta.small;
  const format = metaOf(html, 'Format');
  const formatText = [format.main, format.small].filter(Boolean).join(' · ');
  const image = html.match(/<meta property="og:image" content="([^"]*)"/i)?.[1];

  // "11110 Alondra Blvd, Norwalk, CA 90650": a rua sai, o parser de lugares separa
  // cidade/estado. Estado + ZIP de 5 dígitos é o formato postal dos EUA.
  const addrParts = (address ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  const usTail = (address ?? '').match(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?$/)?.[1];
  const countryCode = usTail && regionCode(usTail, 'US') ? 'US' : undefined;
  const withoutStreet = addrParts.filter((p) => !/^\d+\s+\S/.test(p)).join(', ');
  let place = withoutStreet ? parsePlace(withoutStreet, countryCode) : {};
  // Sem endereço, o cabeçalho "Jan 23, 2027 · Norwalk, CA" ainda dá a cidade.
  if (!place.city) {
    const eyebrow = html.match(/<span class="eyebrow">[^<]*·\s*([^<]+)<\/span>/i)?.[1];
    if (eyebrow) place = parsePlace(clean(eyebrow), countryCode ?? 'US');
  }

  const nogi = /\bno-?gi\b/i.test(formatText);
  const gi = /(^|[^-\w])gi\b/i.test(formatText);
  const deadline = deadlineOf(html, range.start);

  return {
    title,
    rawDate: range.start,
    rawEndDate: range.end,
    location: [venue, address].filter(Boolean).join(', '),
    url: `${BASE}/events/${slug}`,
    typeHint: 'competition',
    ...(image ? { imageUrl: image } : {}),
    sourceId: `nabjjf:${slug}`,
    ...(venue ? { venue } : {}),
    ...place,
    ...(countryCode ? { countryCode } : place.state && regionCode(place.state, 'US') ? { countryCode: 'US' } : {}),
    ...(gi || nogi ? { gi, nogi } : {}),
    kids: kidsFromTitle(`${title} ${formatText}`) || /juvenile/i.test(formatText),
    sport: 'bjj',
    organizer: 'NABJJF',
    ...(deadline ? { registrationDeadlineISO: deadline } : {}),
  };
}

export const nabjjfAdapter: SourceAdapter = {
  name: 'nabjjf',
  strategy: 'http',
  priority: 2, // organizador dos próprios eventos, como SJJIF e JJWL
  async fetchRaw(): Promise<NabjjfRaw> {
    const list = await httpGet<string>(LIST_URL, { json: false });
    const pages: Record<string, string> = {};
    for (const slug of extractUpcomingSlugs(list).slice(0, MAX_PAGES)) {
      try {
        pages[slug] = await httpGet<string>(`${BASE}/events/${slug}`, { json: false });
      } catch (err) {
        // Uma página fora do ar não derruba a fonte; o evento só fica de fora nesta coleta.
        console.warn(`[nabjjf] página do evento falhou: ${slug} (${err instanceof Error ? err.message : err})`);
      }
    }
    return { list, pages };
  },
  parse(raw): RawEvent[] {
    const { pages } = raw as NabjjfRaw;
    const out: RawEvent[] = [];
    for (const [slug, html] of Object.entries(pages ?? {})) {
      const ev = parseEventPage(slug, html);
      if (ev) out.push(ev);
      else console.warn(`[nabjjf] sem título ou data na página, descartado: ${slug}`);
    }
    return out;
  },
};
