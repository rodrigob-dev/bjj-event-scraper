// Factory para IBJJF e CBJJ — compartilham o mesmo CMS (Rails) e a mesma
// API interna: GET /api/v1/events/calendar.json (exige headers de XHR).
// Resposta: { infosite_events: [{ id, name, year, month, startDay, endDay,
//   intervalDays, region, local, city, status, pageUrl, eventGroups, ... }] }.
// Datas vêm como year + month (abreviação EN no IBJJF, PT no CBJJ) + startDay
// → montamos ISO direto. O último dia vem de endDay, que pode cair no mês
// seguinte ("Jan 31 - Feb 1"): intervalDays diz qual.

import { httpGet } from '../http.js';
import type { SourceAdapter, RawEvent } from '../types.js';
import { kidsFromTitle } from '../normalize/classify.js';
import { cleanIbjjfCity, placeOfIbjjfCity } from './ibjjf-places.js';
import { titleCaseIfShouting } from '../normalize/places.js';

// Mapa bilíngue (EN + PT) de abreviação de mês → número. Lowercase.
const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02', fev: '02',
  mar: '03',
  apr: '04', abr: '04',
  may: '05', mai: '05',
  jun: '06',
  jul: '07',
  aug: '08', ago: '08',
  sep: '09', set: '09',
  oct: '10', out: '10',
  nov: '11',
  dec: '12', dez: '12',
};

interface InfositeEvent {
  id?: number;
  name?: string;
  year?: number;
  month?: string;
  startDay?: number;
  endDay?: number;
  intervalDays?: string | null; // "Jan 31 - Feb 1" | "31 jan até 1 fev" | "May 30* - Jun 2"
  region?: string | null; // continente: "North America"
  local?: string | null;
  city?: string | null;
  status?: string;
  pageUrl?: string | null;
  logoBaseColor?: string | null; // cor hex do evento/federação
  eventGroups?: Array<{ id?: number; name?: string }> | null;
}

interface CalendarResponse {
  infosite_events?: InfositeEvent[];
}

function monthToNum(month: string | undefined | null): string | null {
  if (!month) return null;
  return MONTHS[month.trim().slice(0, 3).toLowerCase()] ?? null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Último dia a partir de endDay. Mesmo mês/ano do início, salvo quando
 * intervalDays nomeia outro mês ("Jan 30 - Feb 1", "31 jan até 1 fev") ou
 * endDay < startDay (virada de mês sem intervalo legível). Exportado p/ teste.
 */
export function endDateOf(e: {
  year: number;
  month: string; // "01".."12"
  startDay: number;
  endDay?: number;
  intervalDays?: string | null;
}): string {
  const endDay = typeof e.endDay === 'number' && e.endDay >= 1 && e.endDay <= 31 ? e.endDay : e.startDay;
  let month = Number(e.month);
  let year = e.year;
  const named = (e.intervalDays ?? '')
    .split(/[^A-Za-zÀ-ÿ]+/)
    .map((w) => monthToNum(w))
    .filter((m): m is string => m !== null);
  const last = named.length >= 2 ? Number(named[named.length - 1]) : null;
  if (last !== null && last !== month) {
    if (last < month) year++;
    month = last;
  } else if (endDay < e.startDay) {
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return `${year}-${pad(month)}-${pad(endDay)}`;
}

export function createIbjjfApiAdapter(opts: {
  name: string;
  baseUrl: string; // ex.: "https://ibjjf.com"
  priority: number;
}): SourceAdapter {
  const { name, baseUrl, priority } = opts;
  const organizer = name.toUpperCase(); // "IBJJF" | "CBJJ"
  const isCbjj = name === 'cbjj';
  return {
    name,
    strategy: 'http',
    priority,
    async fetchRaw() {
      return httpGet<CalendarResponse>(`${baseUrl}/api/v1/events/calendar.json`, {
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json, text/javascript, */*; q=0.01',
          Referer: `${baseUrl}/events/calendar`,
        },
      });
    },
    parse(raw): RawEvent[] {
      const data = raw as CalendarResponse;
      const events = data.infosite_events ?? [];
      const out: RawEvent[] = [];
      for (const e of events) {
        if (e.status === 'finished') continue; // já aconteceu
        const mm = monthToNum(e.month);
        // Valida tipos e ranges dos campos externos antes de montar a data.
        if (!mm || !e.name) continue;
        if (typeof e.year !== 'number' || e.year < 2020 || e.year > 2100) continue;
        if (typeof e.startDay !== 'number' || e.startDay < 1 || e.startDay > 31) continue;
        const day = pad(e.startDay);
        const accentColor =
          typeof e.logoBaseColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(e.logoBaseColor)
            ? e.logoBaseColor
            : undefined;

        const groups = (e.eventGroups ?? []).map((g) => (g?.name ?? '').toLowerCase());
        const nogi = groups.includes('no-gi') || /\bno-?gi\b|sem kimono/i.test(e.name);
        const kids = groups.includes('kids') || kidsFromTitle(e.name);

        const rawCity = typeof e.city === 'string' ? cleanIbjjfCity(e.city) : '';
        const region = typeof e.region === 'string' ? e.region : undefined;
        // CBJJ: a região da API é ruidosa ("North America" em evento no Rio) e o
        // calendário é só Brasil — o país é BR sem consultar o continente.
        const place = placeOfIbjjfCity(rawCity, isCbjj ? undefined : region);
        const countryCode = isCbjj ? 'BR' : place?.cc;
        const state = place && (!isCbjj || place.cc === 'BR') ? place.state : undefined;
        const city = place?.name ?? (rawCity ? titleCaseIfShouting(rawCity) : undefined);
        const venue = typeof e.local === 'string' && e.local.trim() ? e.local.trim() : undefined;

        out.push({
          title: e.name,
          rawDate: `${e.year}-${mm}-${day}`,
          rawEndDate: endDateOf({
            year: e.year,
            month: mm,
            startDay: e.startDay,
            endDay: e.endDay,
            intervalDays: e.intervalDays,
          }),
          location: [e.local, e.city].filter(Boolean).join(', '), // v1: texto de sempre
          url: e.pageUrl ? `${baseUrl}${e.pageUrl}` : `${baseUrl}/events/calendar`,
          typeHint: 'competition',
          accentColor,
          ...(typeof e.id === 'number' ? { sourceId: `${name}:${e.id}` } : {}),
          ...(venue ? { venue } : {}),
          ...(city ? { city } : {}),
          ...(state ? { state } : {}),
          ...(countryCode ? { countryCode } : {}),
          gi: !nogi,
          nogi,
          kids,
          sport: 'bjj',
          organizer,
        });
      }
      return out;
    },
  };
}
