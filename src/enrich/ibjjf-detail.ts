// Página de detalhe de um evento IBJJF/CBJJ (pageUrl). A API do calendário
// não traz imagem, prazo de inscrição nem endereço estruturado — a página traz
// os três no mesmo CMS, em EN (ibjjf.com) e PT (cbjj.com.br):
//   <div class='registration-deadline'> … <div class='date'>October 30th, 2026
//   <div class='price-string'>$138.00 (USD) until October 9th, 2026</div>
//   <address><div class='local'>Hy Vee Arena</div> … <div class='complement'>Kansas City</div>
//            <div class='complement2'>MO - 64102</div><div class='country'>United States of America</div>
// Uma busca por evento, cacheada pelo orquestrador (ver index.ts).

import { httpGet } from '../http.js';
import { extractBgLogo } from './ibjjf-image.js';
import { parseToDate, toISODate } from '../normalize/dates.js';
import { regionCode } from '../normalize/places.js';
// País por extenso → ISO vive em normalize/countries.ts (SJJIF e JJWL usam a mesma tabela).
import { countryCodeOfName } from '../normalize/countries.js';

export interface EventDetail {
  imageUrl?: string;
  registrationDeadlineISO?: string;
  venue?: string;
  city?: string;
  state?: string;
  countryCode?: string;
}

/** Texto de um <div class='X'>…</div> simples (sem div aninhado). */
function divText(html: string, cls: string): string | undefined {
  const m = html.match(new RegExp(`<div class=['"]${cls}['"][^>]*>([^<]*)`, 'i'));
  const t = m?.[1]?.replace(/\s+/g, ' ').trim();
  return t || undefined;
}

/** "October 30th, 2026" / "22 de outubro de 2026" → "2026-10-30". */
export function parseDeadlineDate(text: string): string | undefined {
  const cleaned = text.replace(/\s+/g, ' ').replace(/(\d)(st|nd|rd|th)\b/i, '$1').trim();
  const d = parseToDate(cleaned);
  return d ? toISODate(d) : undefined;
}

/**
 * Prazo de inscrição declarado na página. 1º o bloco "Registration deadline" /
 * "Prazo de Inscrição"; senão, a última faixa de preço ("until …" / "até …"),
 * que é quando a inscrição fecha. Sem nenhum dos dois → undefined.
 */
export function extractRegistrationDeadline(html: string): string | undefined {
  const block = html.match(/<div class=['"]registration-deadline['"]>[\s\S]*?<div class=['"]date['"]>\s*([^<]+)/i);
  if (block) {
    const iso = parseDeadlineDate(block[1]!);
    if (iso) return iso;
  }
  const tiers = [...html.matchAll(/<div class=['"]price-string['"][^>]*>[^<]*?\b(?:until|até)\s+([^<]+)</gi)]
    .map((m) => parseDeadlineDate(m[1]!))
    .filter((d): d is string => !!d)
    .sort();
  return tiers.length ? tiers[tiers.length - 1] : undefined;
}

/** Endereço estruturado do bloco <address>. */
export function extractAddress(html: string): Pick<EventDetail, 'venue' | 'city' | 'state' | 'countryCode'> {
  const addr = html.match(/<address>([\s\S]*?)<\/address>/i)?.[1];
  if (!addr) return {};
  const out: Pick<EventDetail, 'venue' | 'city' | 'state' | 'countryCode'> = {};
  const venue = divText(addr, 'local');
  const city = divText(addr, 'complement');
  const country = divText(addr, 'country');
  const cc = countryCodeOfName(country);
  if (venue) out.venue = venue;
  if (city) out.city = city;
  if (cc) out.countryCode = cc;
  else if (country) console.warn(`[ibjjf-detail] país fora da tabela: "${country}"`);
  // "MO - 64102", "PE - 51210-001": sigla antes do CEP, válida só no país da página.
  const comp2 = addr.match(/<div class=['"]complement2['"][^>]*>(?:<div[^>]*>)?\s*([A-Za-z]{2,3})\s*-/i)?.[1];
  const state = comp2 && cc ? regionCode(comp2, cc) : undefined;
  if (state) out.state = state;
  return out;
}

/** Tudo que a página de detalhe sabe sobre o evento. Função pura → testável. */
export function parseDetailPage(html: string, origin: string): EventDetail {
  const imageUrl = extractBgLogo(html, origin) ?? undefined;
  const registrationDeadlineISO = extractRegistrationDeadline(html);
  return {
    ...(imageUrl ? { imageUrl } : {}),
    ...(registrationDeadlineISO ? { registrationDeadlineISO } : {}),
    ...extractAddress(html),
  };
}

/** Busca a página de detalhe e devolve o que ela declara. Lança em erro de rede. */
export async function fetchEventDetail(sourceUrl: string): Promise<EventDetail> {
  const origin = new URL(sourceUrl).origin;
  const html = await httpGet<string>(sourceUrl, { json: false });
  return parseDetailPage(html, origin);
}
