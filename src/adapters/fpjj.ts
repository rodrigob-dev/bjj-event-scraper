// FPJJ (Federação Paulista de Jiu-Jitsu). fpjj.com.br redireciona para
// www.fpjjcompetidor.com.br; o calendário do ano (/calendario-<ano>/) é uma
// página WordPress com os eventos num array JS inline que o próprio site
// renderiza no cliente:
//   const eventsData = [
//     { id: 8, title: "CAMPEONATO PAULISTA 2026", date: "16-18 de Outubro",
//       local: "Barueri - SP", confirmacao: "confirmado", realizacao: "FPJJ", highlight: true, mes: "Outubro" },
//     ...
//   ];
// Sem link de inscrição nem página por evento: sourceUrl é o calendário. A data
// não traz o ano — é o da URL. `local` é "Cidade - SP" ou só o ginásio
// ("Pelezão"): só vira cidade o que a tabela de UFs confirma; o resto é venue.
// Também busca o calendário do ano seguinte (404 enquanto não publicarem).
// robots.txt só proíbe /wp-admin/.

import { httpGet } from '../http.js';
import type { SourceAdapter, RawEvent } from '../types.js';
import { parsePtRange } from '../normalize/text-dates.js';
import { parsePlace, ufOfBrazilianCity } from '../normalize/places.js';
import { kidsFromTitle } from '../normalize/classify.js';

const BASE = 'https://www.fpjjcompetidor.com.br';
export const calendarUrl = (year: number) => `${BASE}/calendario-${year}/`;

export interface FpjjItem {
  id: string;
  title: string;
  date: string;
  local?: string;
  confirmacao?: string;
  realizacao?: string;
}

/** ano → HTML do calendário daquele ano. */
export type FpjjRaw = Record<string, string>;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Lê o array `const eventsData = [...]` sem executar JS: cada `{...}` vira um
 * objeto pelas chaves `nome: "valor"` / `nome: 123` / `nome: true`. Comentários
 * de linha ("// MARÇO") caem fora antes.
 */
export function extractEventsData(html: string): FpjjItem[] {
  const m = html.match(/const\s+eventsData\s*=\s*\[([\s\S]*?)\];/);
  if (!m) return [];
  const body = m[1]!.replace(/^\s*\/\/.*$/gm, '');
  const out: FpjjItem[] = [];
  for (const obj of body.matchAll(/\{([^{}]*)\}/g)) {
    const fields: Record<string, string> = {};
    for (const kv of obj[1]!.matchAll(/(\w+)\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(true|false|-?\d+(?:\.\d+)?))/g)) {
      const value = kv[2] ?? kv[3] ?? kv[4] ?? '';
      fields[kv[1]!] = clean(value.replace(/\\(["'\\])/g, '$1'));
    }
    if (!fields.id || !fields.title || !fields.date) continue;
    out.push({
      id: fields.id,
      title: fields.title,
      date: fields.date,
      ...(fields.local ? { local: fields.local } : {}),
      ...(fields.confirmacao ? { confirmacao: fields.confirmacao } : {}),
      ...(fields.realizacao ? { realizacao: fields.realizacao } : {}),
    });
  }
  return out;
}

/** "Barueri - SP" → cidade/UF; "Pelezão" → só o ginásio (cidade não comprovada). */
export function placeOfLocal(local: string | undefined): { city?: string; state?: string; venue?: string } {
  if (!local) return {};
  const place = parsePlace(local, 'BR', 'Brasil');
  const state = place.state ?? (place.city ? ufOfBrazilianCity(place.city) : undefined);
  if (place.city && state) return { city: place.city, state };
  return { venue: local };
}

/** Eventos de um calendário anual; o ano vem da URL, não do texto. */
export function parseCalendar(html: string, year: number): RawEvent[] {
  const out: RawEvent[] = [];
  for (const item of extractEventsData(html)) {
    if (/cancel/i.test(item.confirmacao ?? '')) continue;
    const range = parsePtRange(item.date, year);
    if (!range) {
      console.warn(`[fpjj] data não reconhecida, descartado: "${item.date}" (${item.title})`);
      continue;
    }
    const nogi = /sem kimono|\bno[- ]?gi\b/i.test(item.title); // "NO GI Clash" vem com espaço
    const place = placeOfLocal(item.local);
    // Quem realiza, como a federação escreve: "FPJJ" ou "CBJJ/FPJJ" (etapa nacional em SP).
    const organizer = clean(item.realizacao ?? '').toUpperCase() || 'FPJJ';

    out.push({
      title: item.title,
      rawDate: range.start,
      rawEndDate: range.end,
      location: item.local ?? '',
      url: calendarUrl(year),
      typeHint: 'competition',
      sourceId: `fpjj:${year}-${item.id}`,
      ...place,
      countryCode: 'BR',
      gi: !nogi,
      nogi,
      kids: kidsFromTitle(item.title),
      sport: 'bjj',
      organizer,
    });
  }
  return out;
}

export const fpjjAdapter: SourceAdapter = {
  name: 'fpjj',
  strategy: 'http',
  priority: 3, // federação estadual, como a FJJRIO
  async fetchRaw(now: Date = new Date()): Promise<FpjjRaw> {
    const year = now.getFullYear();
    const raw: FpjjRaw = {};
    raw[year] = await httpGet<string>(calendarUrl(year), { json: false });
    // O calendário seguinte costuma sair no fim do ano; até lá é 404 e segue sem ele.
    try {
      raw[year + 1] = await httpGet<string>(calendarUrl(year + 1), { json: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/HTTP 404\b/.test(msg)) console.warn(`[fpjj] calendário ${year + 1} falhou: ${msg}`);
    }
    return raw;
  },
  parse(raw): RawEvent[] {
    const out: RawEvent[] = [];
    for (const [year, html] of Object.entries((raw as FpjjRaw) ?? {})) {
      if (!/^\d{4}$/.test(year)) continue;
      out.push(...parseCalendar(html, Number(year)));
    }
    return out;
  },
};
