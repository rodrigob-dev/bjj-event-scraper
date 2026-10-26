// Coordenadas para as linhas que só têm cidade + país (IBJJF, CBJJ, JJWL, SJJIF,
// FPJJ… e Smoothcomp sem location_lat). Ordem: a tabela de cidades em
// places.ts → o cache data/geocode-cache.json → o Nominatim (OpenStreetMap), e
// este só com GEOCODE=1. Toda linha com lat/lng ganha `geo` dizendo de onde
// vieram. O cache é commitado: a coleta diária não faz nenhuma requisição, e
// uma cidade nova só é buscada quando alguém roda com GEOCODE=1. Um miss fica
// no cache como null (apague a entrada para tentar de novo) e nunca é
// repetido na mesma rodada.
//
// Política do Nominatim (operations.osmfoundation.org/policies/nominatim):
// no máximo 1 requisição/s, User-Agent que identifique a aplicação, resultados
// cacheados — tudo cumprido aqui. O robots.txt deles proíbe /search a crawlers
// genéricos; o acesso de uma aplicação é regido pela política de uso, por isso
// a chamada pula a checagem de robots (skipRobots) com o intervalo de 1 s.

import { readFile, writeFile } from 'node:fs/promises';
import { httpGet } from '../http.js';
import type { ScrapedEvent } from '../types.js';
import { coordsOfPlace, placeKey, regionName } from './places.js';
import { countryNameOfCode } from './countries.js';

export interface GeoHit {
  lat: number;
  lng: number;
  /** display_name do Nominatim: p/ conferir à mão que é a cidade certa. */
  label?: string;
}

/** Chave placeKey → acerto (com a data) ou null = o Nominatim não achou. */
export type GeocodeCache = Record<string, (GeoHit & { at: string }) | null>;

export type Lookup = (query: string, countryCode: string) => Promise<GeoHit | null>;

export interface GeocodeOptions {
  cache: GeocodeCache;
  /** Pode chamar o Nominatim (GEOCODE=1). Sem isso, só tabela e cache. */
  online: boolean;
  lookup?: Lookup;
  now?: Date;
}

export interface GeocodeReport {
  source: number;
  table: number;
  nominatim: number;
  requests: number;
  /** Chaves (cidade|região|país) que ficaram sem coordenadas. */
  unresolved: string[];
  /** O cache ganhou entradas e precisa ser gravado. */
  cacheChanged: boolean;
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
// Depois de tantas falhas de rede seguidas, o resto da rodada fica offline:
// não adianta martelar um serviço que está recusando.
const MAX_CONSECUTIVE_FAILURES = 3;

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** "Las Vegas" + "NV" + "US" → "Las Vegas, Nevada, United States". */
export function queryFor(city: string, state: string | undefined, countryCode: string): string {
  const region = state ? (regionName(state, countryCode) ?? state) : undefined;
  return [city.trim(), region, countryNameOfCode(countryCode)].filter(Boolean).join(', ');
}

/** Uma busca no Nominatim; null quando não há resultado utilizável. */
export const nominatimLookup: Lookup = async (query, countryCode) => {
  const res = await httpGet<Array<{ lat?: string; lon?: string; display_name?: string }>>(NOMINATIM_URL, {
    params: { format: 'json', limit: 1, q: query, countrycodes: countryCode.toLowerCase(), 'accept-language': 'en' },
    minIntervalMs: 1000,
    skipRobots: true,
  });
  const first = Array.isArray(res) ? res[0] : undefined;
  if (!first) return null;
  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat: round4(lat), lng: round4(lng), ...(first.display_name ? { label: first.display_name } : {}) };
};

/**
 * Preenche lat/lng/geo in place. Linhas com coordenadas da fonte só ganham a
 * marca; linhas sem cidade ou país ficam como estão (não há o que buscar).
 */
export async function geocodeEvents(events: ScrapedEvent[], opts: GeocodeOptions): Promise<GeocodeReport> {
  const report: GeocodeReport = { source: 0, table: 0, nominatim: 0, requests: 0, unresolved: [], cacheChanged: false };
  const unresolved = new Set<string>();
  const missedThisRun = new Set<string>();
  const today = (opts.now ?? new Date()).toISOString().slice(0, 10);
  let online = opts.online && !!opts.lookup;
  let failures = 0;

  for (const ev of events) {
    if (ev.lat !== undefined && ev.lng !== undefined) {
      ev.geo ??= 'source';
      report[ev.geo]++;
      continue;
    }
    delete ev.geo; // sem coordenadas não há proveniência (linha preservada de outra rodada)
    if (!ev.city || !ev.countryCode) continue;
    const key = placeKey(ev.city, ev.state, ev.countryCode);

    const fromTable = coordsOfPlace(ev.city, ev.state, ev.countryCode);
    if (fromTable) {
      [ev.lat, ev.lng] = fromTable;
      ev.geo = 'table';
      report.table++;
      continue;
    }

    let hit: GeoHit | null | undefined = opts.cache[key];
    if (hit === undefined && online && !missedThisRun.has(key)) {
      try {
        hit = await opts.lookup!(queryFor(ev.city, ev.state, ev.countryCode), ev.countryCode);
        report.requests++;
        failures = 0;
        opts.cache[key] = hit ? { ...hit, at: today } : null;
        report.cacheChanged = true;
        if (!hit) missedThisRun.add(key);
      } catch (err) {
        // Falha de rede não é miss: fica fora do cache para tentar na próxima rodada.
        console.warn(`[geocode] Nominatim falhou para "${key}": ${err instanceof Error ? err.message : err}`);
        hit = undefined;
        if (++failures >= MAX_CONSECUTIVE_FAILURES) {
          console.warn(`::warning::[geocode] ${failures} falhas seguidas; o resto da rodada segue sem Nominatim`);
          online = false;
        }
      }
    }

    if (hit) {
      ev.lat = hit.lat;
      ev.lng = hit.lng;
      ev.geo = 'nominatim';
      report.nominatim++;
    } else {
      unresolved.add(key);
    }
  }

  report.unresolved = [...unresolved].sort();
  return report;
}

export async function loadGeocodeCache(path: string): Promise<GeocodeCache> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as GeocodeCache) : {};
  } catch {
    return {};
  }
}

/** Grava com as chaves em ordem: o diff do commit mostra só a cidade nova. */
export async function saveGeocodeCache(path: string, cache: GeocodeCache): Promise<void> {
  const sorted = Object.fromEntries(Object.keys(cache).sort().map((k) => [k, cache[k]]));
  await writeFile(path, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
}
