// Deduplicação entre fontes. Um mesmo campeonato pode aparecer no site da
// federação E no Smoothcomp. Chave = título normalizado + dateISO. Em
// colisão, mantém a entrada de maior `priority` (federação oficial > agregador).

import type { ScrapedEvent } from '../types.js';

/** Normaliza um título p/ comparação: minúsculo, sem acento, sem pontuação. */
export function slugifyTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacríticos combinantes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function dedupKey(title: string, dateISO: string): string {
  return `${slugifyTitle(title)}|${dateISO}`;
}

/** O vencedor sem coordenadas herda as do perdedor: o mesmo evento, o mesmo ginásio. */
function withCoordsFrom(keep: ScrapedEvent, other: ScrapedEvent): ScrapedEvent {
  if (keep.lat !== undefined || other.lat === undefined || other.lng === undefined) return keep;
  return { ...keep, lat: other.lat, lng: other.lng, ...(other.geo ? { geo: other.geo } : {}) };
}

/**
 * Recebe eventos com prioridade de fonte e devolve sem duplicatas.
 * Em colisão, quem fica leva as coordenadas de quem sai, se não tiver as suas.
 * @param events eventos já normalizados (com dateISO e id)
 * @param priorityBySource mapa source → prioridade (maior vence)
 */
export function dedupe(
  events: ScrapedEvent[],
  priorityBySource: Record<string, number>,
): ScrapedEvent[] {
  const byKey = new Map<string, ScrapedEvent>();
  for (const ev of events) {
    const key = dedupKey(ev.title, ev.dateISO);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, ev);
      continue;
    }
    const pNew = priorityBySource[ev.source] ?? 0;
    const pOld = priorityBySource[existing.source] ?? 0;
    byKey.set(key, pNew > pOld ? withCoordsFrom(ev, existing) : withCoordsFrom(existing, ev));
  }
  return [...byKey.values()];
}
