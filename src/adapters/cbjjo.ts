// CBJJO (Confederação Brasileira de Jiu-Jitsu Olímpico). O calendário em
// cbjjo.com.br é uma imagem JPG; a lista legível por máquina é o portal de
// inscrições (Portal Samurai) em cbjjo.beta.portalsamurai.com, renderizado no
// servidor: um card por evento com título, modalidade (GI/NOGI/FESTIVAL),
// local e mês/dias — sem o ano. Card futuro aponta para Evento.php?ID_EVENTO=N;
// card passado, para evento_resultados.php. A página do evento completa o
// resto: "DE: 07/11/2026 ATÉ 08/11/2026", "Inscrições ATÉ 02/11/2026", "Local".
// Uma requisição por evento futuro (meia dúzia). Sem robots.txt no portal.

import * as cheerio from 'cheerio';
import { httpGet } from '../http.js';
import type { SourceAdapter, RawEvent } from '../types.js';
import { parseBrNumeric, monthNumber } from '../normalize/text-dates.js';
import { titleCaseIfShouting, ufOfBrazilianCity, regionCode } from '../normalize/places.js';
import { kidsFromTitle } from '../normalize/classify.js';

const ORIGIN = 'https://cbjjo.beta.portalsamurai.com';
const LIST_URL = `${ORIGIN}/views/site/index.php`;
const MAX_DETAILS = 40;

export interface CbjjoCard {
  id: string;
  title: string;
  modalidade?: string; // GI | NOGI | FESTIVAL
  uf?: string;
  location?: string;
  imageUrl?: string;
  url: string;
  monthName?: string;
  days: number[];
}

export interface CbjjoDetail {
  title?: string;
  start?: string;
  end?: string;
  deadline?: string;
  local?: string;
}

export interface CbjjoRaw {
  list: string;
  details: Record<string, string>; // ID_EVENTO → HTML da página do evento
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Cards futuros da listagem (os com link para Evento.php). */
export function extractCards(html: string): CbjjoCard[] {
  const $ = cheerio.load(html);
  const out: CbjjoCard[] = [];
  const seen = new Set<string>();
  $('a[href*="Evento.php?ID_EVENTO="]').each((_, a) => {
    const el = $(a);
    const card = el.find('.evt-card').first();
    if (!card.length) return; // link do carrossel: sem dados
    const href = el.attr('href') ?? '';
    const id = href.match(/ID_EVENTO=(\d+)/)?.[1];
    if (!id || seen.has(id)) return;
    const wrapper = el.parent();
    const title = clean(card.find('.evt-card-title').first().text()) || clean(wrapper.find('.evt-titulo').attr('value') ?? '');
    if (!title) return;
    seen.add(id);
    const modalidade = clean(wrapper.find('.evt-modalidade').attr('value') ?? '').toUpperCase() || undefined;
    const uf = clean(wrapper.find('.evt-uf').attr('value') ?? '').toUpperCase() || undefined;
    const location = clean(card.find('.evt-card-location').text()).replace(/\s*-\s*$/, '') || undefined;
    const img = card.find('img.evt-card-img').attr('src');
    const monthName = clean(card.find('.evt-badge-month').first().text()) || undefined;
    const days = card
      .find('.evt-badge-day')
      .toArray()
      .map((d) => Number(clean($(d).text())))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 31);
    out.push({
      id,
      title,
      ...(modalidade ? { modalidade } : {}),
      ...(uf ? { uf } : {}),
      ...(location ? { location } : {}),
      ...(img ? { imageUrl: new URL(img, LIST_URL).toString() } : {}),
      url: new URL(href, LIST_URL).toString(),
      ...(monthName ? { monthName } : {}),
      days,
    });
  });
  return out;
}

/** Título, datas, prazo e local da página do evento. */
export function parseDetail(html: string): CbjjoDetail {
  const $ = cheerio.load(html);
  const out: CbjjoDetail = {};
  const title = clean($('h4.evc-title').first().text());
  if (title) out.title = title;
  $('.evc-info-row').each((_, row) => {
    const label = clean($(row).find('.evc-info-label').text()).toLowerCase();
    const value = clean($(row).find('.evc-info-value').text());
    if (!value) return;
    if (label.startsWith('data')) {
      const m = value.match(/DE:\s*(\d{1,2}\/\d{1,2}\/\d{4})(?:\s*AT[ÉE]\s*(\d{1,2}\/\d{1,2}\/\d{4}))?/i);
      const start = m ? parseBrNumeric(m[1]!) : parseBrNumeric(value);
      const end = m?.[2] ? parseBrNumeric(m[2]) : undefined;
      if (start) out.start = start;
      if (end) out.end = end;
    } else if (label.startsWith('inscri')) {
      const d = parseBrNumeric(value);
      if (d) out.deadline = d;
    } else if (label.startsWith('local')) {
      out.local = value;
    }
  });
  return out;
}

/** "CENTRO POLIESPORTIVO MIÉCIMO DA SILVA, CAMPO GRANDE - RIO DE JANEIRO" → ginásio + cidade. */
export function placeOfLocal(local: string): { venue?: string; city?: string } {
  const [first, ...rest] = local.split(',').map((p) => p.trim()).filter(Boolean);
  if (!first) return {};
  const venue = titleCaseIfShouting(first);
  // Depois da vírgula vem "BAIRRO - CIDADE"; a cidade é o último trecho.
  const tail = rest.join(', ');
  const city = tail ? titleCaseIfShouting(tail.split(/\s+-\s+/).pop()!.trim()) : undefined;
  return { venue, ...(city ? { city } : {}) };
}

const pad = (n: number) => String(n).padStart(2, '0');

export const cbjjoAdapter: SourceAdapter = {
  name: 'cbjjo',
  strategy: 'http',
  priority: 3, // confederação nacional, como a CBJJ
  async fetchRaw(): Promise<CbjjoRaw> {
    const list = await httpGet<string>(LIST_URL, { json: false });
    const details: Record<string, string> = {};
    for (const card of extractCards(list).slice(0, MAX_DETAILS)) {
      try {
        details[card.id] = await httpGet<string>(card.url, { json: false });
      } catch (err) {
        console.warn(`[cbjjo] página do evento falhou: ${card.title} (${err instanceof Error ? err.message : err})`);
      }
    }
    return { list, details };
  },
  parse(raw): RawEvent[] {
    const { list, details } = raw as CbjjoRaw;
    const out: RawEvent[] = [];
    for (const c of extractCards(list)) {
      const d = details?.[c.id] ? parseDetail(details[c.id]!) : {};
      let start = d.start;
      let end = d.end;
      // Sem a página: mês/dias do card + ano do título ("WORLD CUP 2026 - GI").
      if (!start) {
        const year = Number(c.title.match(/\b(20\d{2})\b/)?.[1]);
        const month = c.monthName ? monthNumber(c.monthName) : undefined;
        if (year && month && c.days.length) {
          start = `${year}-${pad(month)}-${pad(c.days[0]!)}`;
          end = `${year}-${pad(month)}-${pad(c.days[c.days.length - 1]!)}`;
        }
      }
      if (!start) {
        console.warn(`[cbjjo] sem data, descartado: ${c.title}`);
        continue;
      }
      // O card corta o local ("…, CAMPO GRANDE -"): sem a página, só o ginásio é confiável.
      const place = d.local
        ? placeOfLocal(d.local)
        : c.location
          ? { venue: titleCaseIfShouting(c.location.split(',')[0]!.trim()) }
          : {};
      const local = d.local ?? c.location;
      const state = (c.uf && regionCode(c.uf, 'BR')) || (place.city ? ufOfBrazilianCity(place.city) : undefined);
      // O título manda na modalidade ("… - GI"); o campo oculto do card já veio
      // trocado (NO-GI num "SUPER ABSOLUTO - GI") e só desempata quando o título cala.
      const titleNogi = /\bno-?gi\b|sem kimono/i.test(c.title);
      const titleGi = /(^|[^-])\bgi\b|com kimono/i.test(c.title);
      const nogi = titleNogi || (!titleGi && (c.modalidade === 'NO-GI' || c.modalidade === 'NOGI'));
      const gi = titleGi || !nogi;
      // "Festival" é a categoria infantil da CBJJO ("FESTIVAL WORLD CUP", "PANAMERICANO - FESTIVAL KIDS").
      const kids = c.modalidade === 'FESTIVAL' || /\bfestival\b/i.test(c.title) || kidsFromTitle(c.title);

      out.push({
        title: c.title,
        rawDate: start,
        ...(end ? { rawEndDate: end } : {}),
        location: local ?? '',
        url: c.url,
        typeHint: 'competition',
        ...(c.imageUrl ? { imageUrl: c.imageUrl } : {}),
        sourceId: `cbjjo:${c.id}`,
        ...place,
        ...(state ? { state } : {}),
        countryCode: 'BR',
        gi,
        nogi,
        kids,
        sport: 'bjj',
        organizer: 'CBJJO',
        // O portal às vezes fecha inscrição depois do início; só vale prazo anterior ao evento.
        ...(d.deadline && d.deadline < start ? { registrationDeadlineISO: d.deadline } : {}),
      });
    }
    return out;
  },
};
