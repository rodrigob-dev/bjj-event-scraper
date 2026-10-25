// Fontes de lista única fora do Smoothcomp: AJP (Smoothcomp em marca própria) e
// SJJIF (home renderizada no servidor). Fixtures são trechos reais (2026-10-25).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ajpAdapter, giNogiOfTitle } from '../src/adapters/ajp.js';
import { sjjifAdapter, extractCards as sjjifCards, cleanTitle, organizerOf } from '../src/adapters/sjjif.js';
import { normalizeEvents } from '../src/normalize/index.js';
import type { RawEvent } from '../src/types.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const fixture = (f: string) => readFileSync(resolve(DIR, 'fixtures', f), 'utf8');
// Meio-dia UTC, antes do 1º evento das fixtures (Marianas Open, 24/10): nada é passado.
const NOW = new Date('2026-10-20T12:00:00Z');
const normalize = (source: string, raws: RawEvent[]) =>
  normalizeEvents(raws, { source, scrapedAt: '2026-10-20T12:00:00.000Z', now: NOW });

describe('ajp — Smoothcomp em marca própria', () => {
  const parsed = ajpAdapter.parse(fixture('ajp-upcoming.html'));
  const byId = (id: number) => parsed.find((e) => e.sourceId === `ajp:${id}`)!;

  it('lê o array var events: 22 eventos, datas ISO, país ISO, coordenadas', () => {
    expect(parsed).toHaveLength(22);
    const t = byId(1494);
    expect(t).toMatchObject({ rawDate: '2026-11-01', rawEndDate: '2026-11-01', city: 'Tashkent', countryCode: 'UZ', organizer: 'AJP', sport: 'bjj' });
    expect(t.lat).toBeCloseTo(41.2982211);
    expect(t.lng).toBeCloseTo(69.2385223);
    expect(t.url).toBe('https://ajptour.com/en/event/1494');
    expect(t.location).toBe('Tashkent, Uzbekistan');
  });

  it('cidade limpa e UF pela tabela: "DUBAI " → Dubai; Gramado RS; Joao Pessoa PB', () => {
    expect(byId(1409)).toMatchObject({ city: 'Dubai', countryCode: 'AE' });
    expect(byId(1521)).toMatchObject({ city: 'Gramado', state: 'RS', countryCode: 'BR' });
    expect(byId(1581)).toMatchObject({ city: 'Joao Pessoa', state: 'PB' });
    expect(byId(1488)).toMatchObject({ city: 'İstanbul', countryCode: 'TR' });
  });

  it('modalidade pelo título, não pelo categoryGroups (sempre ["1"])', () => {
    expect(byId(1494)).toMatchObject({ gi: true, nogi: true }); // GI & NO-GI
    expect(byId(1521)).toMatchObject({ gi: true, nogi: false }); // - GI
    expect(byId(1488)).toMatchObject({ gi: false, nogi: true }); // NO-GI CHAMPIONSHIP
    expect(byId(1532)).toMatchObject({ gi: true, nogi: false }); // sem menção: kimono
    expect(byId(1530).kids).toBe(true); // WORLD YOUTH
    expect(giNogiOfTitle('AJP NO-GI UAE NATIONAL JIU-JITSU CHAMPIONSHIP 2027')).toEqual({ gi: false, nogi: true });
  });

  it('capa só quando é foto (http); o fallback relativo cai no normalizador', () => {
    const ev = normalize('ajp', parsed);
    expect(ev).toHaveLength(22);
    expect(ev.find((e) => e.sourceId === 'ajp:1494')!.imageUrl).toMatch(/^https:\/\/ajptour\.com\/pictures\//);
    expect(ev.find((e) => e.sourceId === 'ajp:1581')!.imageUrl).toBeUndefined();
    expect(ev.find((e) => e.sourceId === 'ajp:1574')!.endDateISO).toBe('2027-01-17');
  });
});

describe('sjjif — home renderizada no servidor', () => {
  const html = fixture('sjjif-home.html');
  const cards = sjjifCards(html);
  const parsed = sjjifAdapter.parse(html);
  const byId = (id: number) => parsed.find((e) => e.sourceId === `sjjif:${id}`)!;

  it('17 cards: 2 da própria SJJIF, 15 sancionados', () => {
    expect(cards).toHaveLength(17);
    expect(cards.filter((c) => c.section === 'upcoming').map((c) => c.id)).toEqual(['2115', '2117']);
    expect(parsed).toHaveLength(17);
  });

  it('título em Title Case com siglas, local + cidade, país por extenso, estado US pela tabela', () => {
    expect(byId(2115)).toMatchObject({
      title: 'Las Vegas Silver State Jiu-Jitsu Open', rawDate: '2026-11-07', rawEndDate: '2026-11-07',
      venue: 'Chaparral High School', city: 'Las Vegas', state: 'NV', countryCode: 'US', organizer: 'SJJIF',
    });
    expect(byId(2115).url).toBe('https://sjjif.com/public/eventInfo/2115');
    expect(byId(2115).imageUrl).toMatch(/^https:\/\/files\.sjjif\.com\//);
    expect(byId(2117)).toMatchObject({ city: 'Norwalk', state: 'CA' });
    expect(byId(2115).location).toBe('Chaparral High School, las vegas, United States of America'); // v1 cru
  });

  it('intervalo de dias, Guam, organizador pela sigla do título, modalidade só quando nomeada', () => {
    expect(byId(2062)).toMatchObject({ rawDate: '2026-10-24', rawEndDate: '2026-10-25', countryCode: 'GU', gi: true, nogi: false });
    expect(byId(2062).title).toBe('2026 Marianas Open International Championship (Gi Tournament)');
    expect(byId(1849)).toMatchObject({ rawDate: '2026-11-07', rawEndDate: '2026-11-08', countryCode: 'JP', organizer: 'ASJJF' });
    expect(byId(1849).gi).toBeUndefined();
    expect(byId(2124)).toMatchObject({ organizer: 'SJJCF', countryCode: 'CN', city: 'Shenyang City' });
    expect(byId(1956)).toMatchObject({ countryCode: 'PH' }); // só "Philippines": sem local nem cidade
    expect(byId(1956).venue).toBeUndefined();
  });

  it('cleanTitle e organizerOf', () => {
    expect(cleanTitle('sjjcf zhejiang jiu jitsu championship 2026(gi event)')).toBe('SJJCF Zhejiang Jiu Jitsu Championship 2026 (Gi Event)');
    expect(cleanTitle('Already Cased Title')).toBe('Already Cased Title');
    expect(organizerOf('asjjf asian open')).toBe('ASJJF');
    expect(organizerOf('art challenge 6')).toBe('SJJIF');
  });

  it('normaliza 17 eventos futuros', () => {
    expect(normalize('sjjif', parsed)).toHaveLength(17);
  });
});
