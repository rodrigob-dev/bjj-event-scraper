// FJJRIO (Federação de Jiu-Jitsu do Estado do Rio de Janeiro). A home
// (fjjrio.com.br) renderiza no servidor o bloco "Próximos Eventos", um card por
// evento até o título "Eventos Passados":
//   <div class="entry3"><figure><a href="evento.php?id=<opaco>"><img src="app/img/eventos/x.jpg"></a></figure>
//     <span class="post-category …">Campeonato Kids NOGI</span>
//     <h2><a href="evento.php?id=…">REI DO RIO KIDS NOGI 2026</a></h2>
//     <span class="post-meta">sábado e domingo, 05 e 06 de dezembro 2026</span>
//     <span class="post-meta"><span class="icon-map-marker"></span> ARENA CARIOCA 1</span>
// A página do evento traz "Término da Inscrição" (prazo) — uma requisição por
// evento futuro (meia dúzia). Federação estadual: tudo é BR/RJ; a cidade só
// entra quando o ginásio é conhecido. robots.txt proíbe /app/ (não buscamos).

import * as cheerio from 'cheerio';
import { httpGet } from '../http.js';
import type { SourceAdapter, RawEvent } from '../types.js';
import { parsePtRange } from '../normalize/text-dates.js';
import { titleCaseIfShouting, norm } from '../normalize/places.js';
import { kidsFromTitle } from '../normalize/classify.js';

const BASE = 'https://fjjrio.com.br';
const HOME_URL = `${BASE}/`;
const UPCOMING_MARKER = 'Próximos Eventos';
const PAST_MARKER = 'Eventos Passados';
const MAX_DETAILS = 30;

// Ginásios que a federação usa → cidade (fato, não chute). Fora daqui: sem cidade.
const CITY_BY_VENUE: Record<string, string> = {
  'arena carioca 1': 'Rio de Janeiro', 'arena carioca 2': 'Rio de Janeiro', 'arena carioca 3': 'Rio de Janeiro',
  'arena carioca': 'Rio de Janeiro', 'parque olimpico': 'Rio de Janeiro', 'maracanazinho': 'Rio de Janeiro',
  'ginasio do maracanazinho': 'Rio de Janeiro', 'centro esportivo miecimo da silva': 'Rio de Janeiro',
  'arena da juventude': 'Rio de Janeiro', 'ginasio tijuca tenis clube': 'Rio de Janeiro',
};

export interface FjjrioCard {
  id: string;
  title: string;
  category?: string;
  dateText: string;
  venue?: string;
  imageUrl?: string;
  url: string;
}

export interface FjjrioRaw {
  home: string;
  details: Record<string, string>; // id → HTML da página do evento
}

/** Cards entre "Próximos Eventos" e "Eventos Passados". */
export function extractUpcomingCards(html: string): FjjrioCard[] {
  const start = html.indexOf(UPCOMING_MARKER);
  if (start === -1) return [];
  const end = html.indexOf(PAST_MARKER, start);
  const $ = cheerio.load(html.slice(start, end === -1 ? undefined : end));
  const out: FjjrioCard[] = [];
  $('.entry3').each((_, card) => {
    const el = $(card);
    const href = el.find('h2 a[href*="evento.php?id="]').first().attr('href') ?? '';
    const id = href.match(/id=([^&#]+)/)?.[1];
    const title = el.find('h2 a').first().text().replace(/\s+/g, ' ').trim();
    if (!id || !title) return;
    const category = el.find('.post-category').first().text().replace(/\s+/g, ' ').trim() || undefined;
    const metas = el.find('.post-meta').toArray();
    const venueEl = metas.find((m) => $(m).find('.icon-map-marker').length > 0);
    const dateEl = metas.find((m) => m !== venueEl);
    const dateText = dateEl ? $(dateEl).text().replace(/\s+/g, ' ').trim() : '';
    if (!dateText) return;
    const venue = venueEl ? $(venueEl).text().replace(/\s+/g, ' ').trim() : undefined;
    const img = el.find('figure img').first().attr('src');
    out.push({
      id,
      title,
      ...(category ? { category } : {}),
      dateText,
      ...(venue ? { venue } : {}),
      ...(img ? { imageUrl: new URL(encodeURI(img), BASE).toString() } : {}),
      url: `${BASE}/evento.php?id=${encodeURIComponent(id)}`,
    });
  });
  return out;
}

/** "Término da Inscrição" da página do evento → ISO; ausente quando a página não diz. */
export function extractDeadline(html: string): string | undefined {
  const m = html.match(/T[ée]rmino da Inscri[çc][ãa]o<\/b><\/i>\s*<br\s*\/?>\s*([^<]+)/i);
  return m ? parsePtRange(m[1]!)?.start : undefined;
}

/** O id é base64 ("ME8x…QT09"): sourceId aceita só [A-Za-z0-9_-], então vira base64url sem "=". */
export function sourceIdOf(id: string): string {
  return `fjjrio:${id.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

export const fjjrioAdapter: SourceAdapter = {
  name: 'fjjrio',
  strategy: 'http',
  priority: 3, // federação oficial (estadual), como a CBJJ
  async fetchRaw(): Promise<FjjrioRaw> {
    const home = await httpGet<string>(HOME_URL, { json: false });
    const details: Record<string, string> = {};
    for (const card of extractUpcomingCards(home).slice(0, MAX_DETAILS)) {
      try {
        details[card.id] = await httpGet<string>(card.url, { json: false });
      } catch (err) {
        // Sem a página só se perde o prazo; o evento continua vindo do card.
        console.warn(`[fjjrio] página do evento falhou: ${card.title} (${err instanceof Error ? err.message : err})`);
      }
    }
    return { home, details };
  },
  parse(raw): RawEvent[] {
    const { home, details } = raw as FjjrioRaw;
    const out: RawEvent[] = [];
    for (const c of extractUpcomingCards(home)) {
      const range = parsePtRange(c.dateText);
      if (!range) {
        console.warn(`[fjjrio] data não reconhecida, descartado: "${c.dateText}" (${c.title})`);
        continue;
      }
      const text = `${c.category ?? ''} ${c.title}`;
      const nogi = /\bno-?gi\b|sem kimono/i.test(text);
      const venue = c.venue ? titleCaseIfShouting(c.venue) : undefined;
      const city = c.venue ? CITY_BY_VENUE[norm(c.venue)] : undefined;
      const detail = details?.[c.id];
      const deadline = detail ? extractDeadline(detail) : undefined;

      out.push({
        title: c.title,
        rawDate: range.start,
        rawEndDate: range.end,
        location: [c.venue, 'Rio de Janeiro'].filter(Boolean).join(', '),
        url: c.url,
        typeHint: 'competition',
        ...(c.imageUrl ? { imageUrl: c.imageUrl } : {}),
        sourceId: sourceIdOf(c.id),
        ...(venue ? { venue } : {}),
        ...(city ? { city } : {}),
        state: 'RJ',
        countryCode: 'BR',
        gi: !nogi,
        nogi,
        kids: kidsFromTitle(text),
        sport: 'bjj',
        organizer: 'FJJRIO',
        ...(deadline && deadline < range.start ? { registrationDeadlineISO: deadline } : {}),
      });
    }
    return out;
  },
};
