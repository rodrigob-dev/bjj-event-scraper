import { describe, it, expect } from 'vitest';
import { geocodeEvents, queryFor, type GeocodeCache, type Lookup } from '../src/normalize/geocode.js';
import { coordsOfPlace, placeKey } from '../src/normalize/places.js';
import type { ScrapedEvent } from '../src/types.js';

const mk = (over: Partial<ScrapedEvent>): ScrapedEvent => ({
  id: 'x|2026-12-01', title: 'X', type: 'competition', date: '1 de Dezembro, 2026', location: '',
  ctaLabel: 'Ver Detalhes', icon: '🏆', dateISO: '2026-12-01', source: 'ibjjf', sourceUrl: 'https://x',
  scrapedAt: '2026-10-25T00:00:00.000Z', ...over,
});

/** Lookup falso: registra as consultas e responde pela tabela dada. */
function fakeLookup(answers: Record<string, { lat: number; lng: number } | null>) {
  const calls: string[] = [];
  const lookup: Lookup = async (q) => {
    calls.push(q);
    const a = answers[q];
    if (a === undefined) throw new Error(`consulta inesperada: ${q}`);
    return a ? { ...a, label: `${q} (osm)` } : null;
  };
  return { calls, lookup };
}
const NOW = new Date('2026-10-25T12:00:00Z');

describe('geocodeEvents — tabela → cache → Nominatim', () => {
  it('marca a origem: fonte, tabela, cache; não toca em linha sem cidade', async () => {
    const cache: GeocodeCache = { 'lakeland|FL|US': { lat: 28.0395, lng: -81.9498, at: '2026-10-25' } };
    const events = [
      mk({ source: 'smoothcomp', city: 'Lisbon', countryCode: 'PT', lat: 38.7, lng: -9.1 }),
      mk({ city: 'Las Vegas', state: 'NV', countryCode: 'US' }),
      mk({ city: 'Lakeland', state: 'FL', countryCode: 'US' }),
      mk({ location: 'Somewhere' }),
    ];
    const { lookup, calls } = fakeLookup({});
    const r = await geocodeEvents(events, { cache, online: true, lookup, now: NOW });
    expect(events[0]!.geo).toBe('source');
    expect(events[1]).toMatchObject({ lat: 36.1673, lng: -115.1485, geo: 'table' });
    expect(events[2]).toMatchObject({ lat: 28.0395, lng: -81.9498, geo: 'nominatim' });
    expect(events[3]!.lat).toBeUndefined();
    expect(events[3]!.geo).toBeUndefined();
    expect(r).toMatchObject({ source: 1, table: 1, nominatim: 1, requests: 0, unresolved: [], cacheChanged: false });
    expect(calls).toEqual([]);
  });

  it('online: busca uma vez por cidade, grava no cache (acerto e miss) e não repete o miss', async () => {
    const cache: GeocodeCache = {};
    const events = [
      mk({ city: 'Frisco', state: 'TX', countryCode: 'US' }),
      mk({ city: 'FRISCO', state: 'TX', countryCode: 'US' }),
      mk({ city: 'Online Zoom Course', countryCode: 'CA' }),
      mk({ city: 'Online Zoom Course', countryCode: 'CA' }),
    ];
    const { lookup, calls } = fakeLookup({
      'Frisco, Texas, United States': { lat: 33.1507, lng: -96.8236 },
      'Online Zoom Course, Canada': null,
    });
    const r = await geocodeEvents(events, { cache, online: true, lookup, now: NOW });
    expect(calls).toEqual(['Frisco, Texas, United States', 'Online Zoom Course, Canada']);
    expect(events[0]).toMatchObject({ lat: 33.1507, lng: -96.8236, geo: 'nominatim' });
    expect(events[1]).toMatchObject({ lat: 33.1507, geo: 'nominatim' });
    expect(events[2]!.lat).toBeUndefined();
    expect(cache['frisco|TX|US']).toMatchObject({ lat: 33.1507, lng: -96.8236, at: '2026-10-25', label: 'Frisco, Texas, United States (osm)' });
    expect(cache['online zoom course||CA']).toBeNull();
    expect(r).toMatchObject({ nominatim: 2, requests: 2, unresolved: ['online zoom course||CA'], cacheChanged: true });
  });

  it('offline (sem GEOCODE=1): zero requisições; miss do cache não é rebuscado nem online', async () => {
    const cache: GeocodeCache = { 'nowhere||US': null };
    const events = [mk({ city: 'Nowhere', countryCode: 'US' }), mk({ city: 'Frisco', state: 'TX', countryCode: 'US' })];
    const { lookup, calls } = fakeLookup({ 'Frisco, Texas, United States': { lat: 1, lng: 2 } });
    const off = await geocodeEvents(events, { cache, online: false, lookup, now: NOW });
    expect(calls).toEqual([]);
    expect(off.unresolved).toEqual(['frisco|TX|US', 'nowhere||US']);
    expect(off.cacheChanged).toBe(false);
    const on = await geocodeEvents(events, { cache, online: true, lookup, now: NOW });
    expect(calls).toEqual(['Frisco, Texas, United States']); // o miss persistido fica quieto
    expect(on.unresolved).toEqual(['nowhere||US']);
  });

  it('falha de rede não vira miss; três seguidas desligam o resto da rodada', async () => {
    const cache: GeocodeCache = {};
    const events = ['A', 'B', 'C', 'D'].map((c) => mk({ city: c, countryCode: 'FR' }));
    const calls: string[] = [];
    const lookup: Lookup = async (q) => {
      calls.push(q);
      throw new Error('timeout');
    };
    const r = await geocodeEvents(events, { cache, online: true, lookup, now: NOW });
    expect(calls).toHaveLength(3);
    expect(cache).toEqual({});
    expect(r.unresolved).toHaveLength(4);
  });

  it('linha preservada com coordenadas mantém a marca anterior; sem coordenadas perde a marca', async () => {
    const events = [
      mk({ lat: 1, lng: 2, geo: 'nominatim' }),
      mk({ geo: 'table' }),
    ];
    await geocodeEvents(events, { cache: {}, online: false, now: NOW });
    expect(events[0]!.geo).toBe('nominatim');
    expect(events[1]!.geo).toBeUndefined();
  });
});

describe('queryFor, placeKey e coordsOfPlace', () => {
  it('consulta por extenso: região pelo nome, país pelo ICU', () => {
    expect(queryFor('Las Vegas', 'NV', 'US')).toBe('Las Vegas, Nevada, United States');
    expect(queryFor('Barueri', 'SP', 'BR')).toBe('Barueri, Sao Paulo, Brazil');
    expect(queryFor('Nagoya', undefined, 'JP')).toBe('Nagoya, Japan');
    expect(queryFor('Guam', undefined, 'GU')).toBe('Guam, Guam');
    expect(queryFor('X', 'ZZ', 'FR')).toBe('X, ZZ, France'); // região sem tabela passa como veio
  });

  it('chave normalizada; tabela aceita sem região quando a cidade é única no país', () => {
    expect(placeKey('São Paulo', 'SP', 'BR')).toBe('sao paulo|SP|BR');
    expect(placeKey('Nagoya', undefined, 'JP')).toBe('nagoya||JP');
    expect(coordsOfPlace('LAS VEGAS', 'NV', 'US')).toEqual([36.1673, -115.1485]);
    expect(coordsOfPlace('Las Vegas', undefined, 'US')).toEqual([36.1673, -115.1485]);
    expect(coordsOfPlace('Las Vegas', 'NM', 'US')).toBeUndefined(); // outra Las Vegas
    expect(coordsOfPlace('Atlantis', undefined, 'US')).toBeUndefined();
  });
});
