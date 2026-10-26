// Pipeline de normalização: RawEvent[] (de um adapter) → ScrapedEvent[].
// Faz parse de data, descarta inválidos/passados, classifica tipo e monta
// o id estável (slug+dateISO) usado também no dedup. Os campos v2 vêm
// estruturados do adapter; aqui só se valida formato e range.

import type { RawEvent, ScrapedEvent, EventDetails } from '../types.js';
import { parseToDate, toISODate, toDisplayPtBr, isPast } from './dates.js';
import { classifyType, iconFor, ctaFor } from './classify.js';
import { dedupKey } from './dedup.js';
import { organizerFields, resolveOrganizer } from './organizador.js';

export interface NormalizeContext {
  source: string;
  scrapedAt: string;
  now?: Date;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Copia só os campos v2 bem formados; o resto cai fora em silêncio (ausente = desconhecido).
 * organizer/organizerId ficam de fora: vêm do resolvedor, nunca direto do adapter.
 */
export function pickDetails(raw: EventDetails): EventDetails {
  const d: EventDetails = {};
  if (raw.sourceId) d.sourceId = raw.sourceId;
  if (raw.venue?.trim()) d.venue = raw.venue.trim();
  if (raw.city?.trim()) d.city = raw.city.trim();
  if (raw.state && /^[A-Z]{2,3}$/.test(raw.state)) d.state = raw.state;
  if (raw.countryCode && /^[A-Z]{2}$/.test(raw.countryCode)) d.countryCode = raw.countryCode;
  if (
    typeof raw.lat === 'number' && typeof raw.lng === 'number' &&
    Number.isFinite(raw.lat) && Number.isFinite(raw.lng) &&
    Math.abs(raw.lat) <= 90 && Math.abs(raw.lng) <= 180 &&
    !(raw.lat === 0 && raw.lng === 0)
  ) {
    d.lat = raw.lat;
    d.lng = raw.lng;
  }
  if (typeof raw.gi === 'boolean') d.gi = raw.gi;
  if (typeof raw.nogi === 'boolean') d.nogi = raw.nogi;
  if (typeof raw.kids === 'boolean') d.kids = raw.kids;
  if (raw.sport) d.sport = raw.sport;
  if (raw.registrationDeadlineISO && ISO_DAY.test(raw.registrationDeadlineISO)) {
    d.registrationDeadlineISO = raw.registrationDeadlineISO;
  }
  return d;
}

/**
 * Normaliza os eventos de uma fonte. Eventos com data não-parseável ou já
 * passada são descartados (com aviso no log). Retorna lista pronta p/ dedup.
 */
export function normalizeEvents(raws: RawEvent[], ctx: NormalizeContext): ScrapedEvent[] {
  const out: ScrapedEvent[] = [];
  const unknownDeclared = new Set<string>();
  for (const raw of raws) {
    const d = parseToDate(raw.rawDate);
    if (!d) {
      console.warn(`[${ctx.source}] data não-parseável, descartado: "${raw.rawDate}" (${raw.title})`);
      continue;
    }
    const dateISO = toISODate(d);

    // Último dia: só se parsear e não vier antes do primeiro (fonte com os dois
    // trocados cai em evento de 1 dia). Um evento em andamento ainda é futuro.
    const end = raw.rawEndDate ? parseToDate(raw.rawEndDate) : null;
    const endISO = end ? toISODate(end) : dateISO;
    const endDateISO = endISO >= dateISO ? endISO : dateISO;
    if (isPast(endDateISO, ctx.now)) continue; // evento passado, ignora silenciosamente

    // Só aceita URLs http(s) — barra schemes perigosos vindos da fonte.
    if (!/^https?:\/\//i.test(raw.url)) {
      console.warn(`[${ctx.source}] url não-http descartada: "${raw.url}" (${raw.title})`);
      continue;
    }

    // Imagem só se for http(s); senão ignora (não bloqueia o evento).
    const imageUrl =
      raw.imageUrl && /^https?:\/\//i.test(raw.imageUrl) ? raw.imageUrl : undefined;

    const type = classifyType(raw.title, raw.typeHint);
    const declared = raw.organizer?.trim() || undefined;
    const org = resolveOrganizer({ url: raw.url, title: raw.title, declared });
    if (declared && org?.via !== 'declared') unknownDeclared.add(declared);
    out.push({
      id: dedupKey(raw.title, dateISO),
      title: raw.title.trim(),
      type,
      date: toDisplayPtBr(dateISO),
      location: raw.location.trim(),
      ctaLabel: ctaFor(type),
      icon: iconFor(type),
      dateISO,
      endDateISO,
      source: ctx.source,
      sourceUrl: raw.url,
      ...(imageUrl ? { imageUrl } : {}),
      ...(raw.accentColor ? { accentColor: raw.accentColor } : {}),
      scrapedAt: ctx.scrapedAt,
      ...pickDetails(raw),
      ...organizerFields(org),
    });
  }
  // Federação nova assinando eventos: entra na base com site, senão a linha fica sem organizer.
  for (const name of unknownDeclared) {
    console.warn(`::notice::[${ctx.source}] organizador "${name}" fora de data/organizadores.json`);
  }
  return out;
}
