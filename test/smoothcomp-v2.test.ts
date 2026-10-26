import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { smoothcompAdapter, sportOf, countryCodeOf } from '../src/adapters/smoothcomp.js';
import { normalizeEvents } from '../src/normalize/index.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(DIR, 'fixtures', 'smoothcomp-v2.html'), 'utf8');
const NOW = new Date('2026-10-25T12:00:00Z'); // meio-dia UTC: o dia é o mesmo em qualquer fuso do CI

const parsed = smoothcompAdapter.parse(html);
const byId = (id: number) => parsed.find((e) => e.sourceId === `smoothcomp:${id}`)!;

describe('smoothcomp v2 — filtro por modalidade', () => {
  it('publica bjj + grappling e descarta judô/MMA/wrestling', () => {
    const ids = parsed.map((e) => e.sourceId);
    expect(ids).not.toContain('smoothcomp:33828'); // wrestling (32)
    expect(ids).not.toContain('smoothcomp:34559'); // judô (26)
    expect(ids).not.toContain('smoothcomp:32717'); // judô (26)
    expect(ids).not.toContain('smoothcomp:34981'); // MMA (19)
    expect(ids).not.toContain('smoothcomp:29225'); // MMA (19)
    expect(parsed).toHaveLength(18);
    expect(new Set(parsed.map((e) => e.sport))).toEqual(new Set(['bjj', 'grappling']));
  });

  it('sportOf: a modalidade mais específica vence; sem tabela é other', () => {
    expect(sportOf(['1', '7', '3'])).toBe('bjj');
    expect(sportOf(['3'])).toBe('grappling');
    expect(sportOf(['26', '3'])).toBe('grappling');
    expect(sportOf(['19', '37'])).toBe('mma');
    expect(sportOf(['9'])).toBe('other');
    expect(sportOf(undefined)).toBe('other');
  });
});

describe('smoothcomp v2 — campos estruturados', () => {
  it('sourceId, datas, país e coordenadas', () => {
    const e = byId(27746);
    expect(e.rawDate).toBe('2026-10-25');
    expect(e.rawEndDate).toBe('2026-10-25');
    expect(e.countryCode).toBe('CR');
    expect(e.city).toBe('Barreal de Heredia');
    expect(e.state).toBeUndefined();
    expect(e.lat).toBeCloseTo(9.9759165);
    expect(e.lng).toBeCloseTo(-84.1511479);
    expect(e.organizer).toBeUndefined(); // quem organiza sai da base, na normalização
    expect(e.gi).toBe(true);
    expect(e.nogi).toBe(false);
    expect(e.kids).toBe(false);
    expect(e.location).toBe('Barreal de Heredia, Costa Rica'); // v1 intacto
  });

  it('cidade limpa: ZIP, estado por extenso, UF grudada, caixa alta', () => {
    expect(byId(34463)).toMatchObject({ city: 'Van Nuys', state: 'CA', countryCode: 'US' });
    expect(byId(24801)).toMatchObject({ city: 'Dallas', state: 'TX' });
    expect(byId(34454)).toMatchObject({ city: 'Feira de Santana', state: 'BA', countryCode: 'BR' });
    expect(byId(33770)).toMatchObject({ city: 'Tijucas', state: 'SC' });
    expect(byId(31001)).toMatchObject({ city: 'Patos de Minas', state: 'MG' });
    expect(byId(34970)).toMatchObject({ city: 'Natal', state: 'RN' });
    expect(byId(34323)).toMatchObject({ city: 'Newcastle-Upon-Tyne', countryCode: 'GB' });
    expect(byId(29250)).toMatchObject({ city: 'London', countryCode: 'GB' });
    expect(byId(28209)).toMatchObject({ city: 'Mississauga', state: 'ON', countryCode: 'CA' });
    expect(byId(34107)).toMatchObject({ city: 'Francisco Beltrão', countryCode: 'BR' });
  });

  it('BR só com a cidade ganha a UF da tabela', () => {
    expect(byId(34107)).toMatchObject({ city: 'Francisco Beltrão', state: 'PR' });
  });

  it('countryCodeOf: ISO puro e subdivisão "GB-SCT" → "GB"; lixo fica ausente', () => {
    expect(countryCodeOf('BR')).toBe('BR');
    expect(countryCodeOf('GB-SCT')).toBe('GB');
    expect(countryCodeOf('GB-NIR')).toBe('GB');
    expect(countryCodeOf('Brazil')).toBeUndefined();
    expect(countryCodeOf(null)).toBeUndefined();
  });

  it('só o estado, sem cidade', () => {
    const e = byId(34258);
    expect(e.city).toBeUndefined();
    expect(e.state).toBe('MG');
    expect(e.location).toBe('MINAS GERAIS, Brazil');
  });

  it('coordenadas 0,0 ou nulas ficam ausentes', () => {
    expect(byId(35648).lat).toBeUndefined(); // "0.0000000"
    expect(byId(35648).lng).toBeUndefined();
  });

  it('gi/nogi por categoria', () => {
    expect(byId(34463)).toMatchObject({ gi: false, nogi: true }); // só 7
    expect(byId(24801)).toMatchObject({ gi: true, nogi: true }); // 1+7
    expect(byId(29071)).toMatchObject({ gi: false, nogi: true, sport: 'grappling' }); // 4
    expect(byId(35648).gi).toBeUndefined(); // 2+23: categoria sem gi/nogi conhecido
  });

  it('kids pelo título', () => {
    expect(byId(33303).kids).toBe(true); // "Brave Kids Los Angeles"
    expect(byId(32995).kids).toBe(false);
  });
});

describe('smoothcomp v2 — normalização', () => {
  const events = normalizeEvents(parsed, { source: 'smoothcomp', scrapedAt: '2026-10-25T00:00:00.000Z', now: NOW });
  const find = (id: number) => events.find((e) => e.sourceId === `smoothcomp:${id}`)!;

  it('id v1 inalterado e campos v2 presentes', () => {
    const e = find(27746);
    expect(e.id).toBe('ligabjj-winter-2026|2026-10-25');
    expect(e.endDateISO).toBe('2026-10-25');
    expect(e.countryCode).toBe('CR');
    expect(e.sport).toBe('bjj');
  });

  it('organizador pela base: subdomínio mapeado, subdomínio cru vira ausente', () => {
    expect(parsed.every((e) => e.organizer === undefined)).toBe(true); // o adapter não nomeia
    expect(find(27746)).toMatchObject({ organizer: 'LigaBJJ', organizerId: 'ligabjj' });
    expect(find(32995)).toMatchObject({ organizer: 'NAGA', organizerId: 'naga' });
    expect(find(27054)).toMatchObject({ organizer: 'Grappling Industries', organizerId: 'grappling-industries' });
    expect(find(29071)).toMatchObject({ organizer: 'ADCC', organizerId: 'adcc' });
    expect(find(24801)).toMatchObject({ organizer: 'ABJJC', organizerId: 'abjjc' });
    expect(find(29250)).toMatchObject({ organizer: 'BJJ247', organizerId: 'bjj247' });
    // ibjjff.smoothcomp.com ("Brave Kids") não está na base: nada, nunca "ibjjff".
    expect(find(33303).organizer).toBeUndefined();
    expect(find(33303).organizerId).toBeUndefined();
    expect(find(34463).organizer).toBeUndefined(); // host genérico, título sem marca
  });

  it('enddate antes do startdate vira evento de 1 dia', () => {
    const e = find(35417); // HOA: 2026-10-31 → 2026-10-30
    expect(e.dateISO).toBe('2026-10-31');
    expect(e.endDateISO).toBe('2026-10-31');
  });

  it('evento em andamento (começou ontem, termina amanhã) continua no feed', () => {
    const raws = [
      { title: 'Em andamento', rawDate: '2026-10-24', rawEndDate: '2026-10-26', location: 'X', url: 'https://x/' },
      { title: 'Acabou ontem', rawDate: '2026-10-23', rawEndDate: '2026-10-24', location: 'X', url: 'https://x/' },
    ];
    const out = normalizeEvents(raws, { source: 'smoothcomp', scrapedAt: '2026-10-25T00:00:00.000Z', now: NOW });
    expect(out.map((e) => e.title)).toEqual(['Em andamento']);
  });

  it('descarta lat/lng fora do range', () => {
    const out = normalizeEvents(
      [{ title: 'X', rawDate: '2026-12-01', location: 'X', url: 'https://x/', lat: 95, lng: 10 }],
      { source: 'smoothcomp', scrapedAt: '2026-10-25T00:00:00.000Z', now: NOW },
    );
    expect(out[0]!.lat).toBeUndefined();
  });
});
