// 2ª passada de dedup: o mesmo evento com outro título em outra fonte. Linhas
// modeladas nas reais de 2026-10-25 (CBJJ/FPJJ em Barueri, CBJJ Brasília,
// IBJJF × Sub Only em Dublin).
import { describe, it, expect } from 'vitest';
import { dedupeSameEvent, isSameEvent, titleTokens, fillFrom } from '../src/normalize/dedup.js';
import { priorityBySource } from '../src/adapters/registry.js';
import type { ScrapedEvent } from '../src/types.js';

const mk = (source: string, title: string, over: Partial<ScrapedEvent> = {}): ScrapedEvent => ({
  id: `${title}|${over.dateISO ?? '2026-11-21'}`, title, type: 'competition', date: 'x', location: '',
  ctaLabel: 'Ver Detalhes', icon: '🏆', dateISO: '2026-11-21', endDateISO: '2026-11-21', source,
  sourceUrl: `https://${source}.example/${encodeURIComponent(title)}`, scrapedAt: '2026-10-25T00:00:00.000Z',
  sourceId: `${source}:${Math.abs([...title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7))}`,
  ...over,
});

const barueri = { city: 'Barueri', state: 'SP', countryCode: 'BR' } as const;
const cbjjSp = mk('cbjj', 'São Paulo BJJ Pro IBJJF Championship 2026', {
  ...barueri, dateISO: '2026-11-21', endDateISO: '2026-11-22', venue: 'Ginásio Poliesportivo José Correa',
  registrationDeadlineISO: '2026-11-13', imageUrl: 'https://cbjj.example/sp.jpg',
});
const fpjjSp = mk('fpjj', 'SÃO PAULO BJJ PRÓ', { ...barueri, dateISO: '2026-11-20', endDateISO: '2026-11-22', organizer: 'CBJJ/FPJJ' });

describe('titleTokens', () => {
  it('tira ano, siglas, "championship"/"open"/"international", jiu-jitsu e preposições', () => {
    expect([...titleTokens('São Paulo BJJ Pro IBJJF Championship 2026')]).toEqual(['sao', 'paulo', 'pro']);
    expect([...titleTokens('SÃO PAULO BJJ PRÓ')]).toEqual(['sao', 'paulo', 'pro']);
    expect([...titleTokens('The 2026 North American Grand Finale')]).toEqual(['north', 'american', 'grand', 'finale']);
    expect([...titleTokens('Brasília International Open IBJJF Jiu-Jitsu No-Gi Championship 2026')]).toEqual(['brasilia', 'no', 'gi']);
  });
});

describe('dedupeSameEvent — o mesmo evento em outra fonte', () => {
  it('São Paulo BJJ Pro: CBJJ fica (empate de prioridade → ordem do registry), mesmo com a FPJJ antes na entrada', () => {
    const { events, merges } = dedupeSameEvent([fpjjSp, cbjjSp], priorityBySource);
    expect(events).toHaveLength(1);
    expect(events[0]!.source).toBe('cbjj');
    expect(events[0]).toMatchObject({ venue: 'Ginásio Poliesportivo José Correa', registrationDeadlineISO: '2026-11-13' });
    expect(merges.map((m) => [m.kept.source, m.dropped.source])).toEqual([['cbjj', 'fpjj']]);
  });

  it('gêmeos gi × no-gi do Brasília International Open ficam separados', () => {
    const where = { city: 'Cruzeiro Novo', state: 'DF', countryCode: 'BR', dateISO: '2026-11-06', endDateISO: '2026-11-07' } as const;
    const gi = mk('cbjj', 'Brasília International Open IBJJF Jiu-Jitsu Championship 2026', where);
    const nogi = mk('ibjjf', 'Brasília International Open IBJJF Jiu-Jitsu No-Gi Championship 2026', where);
    expect(isSameEvent(gi, nogi)).toBe(false);
    expect(dedupeSameEvent([gi, nogi], priorityBySource).events).toHaveLength(2);
    // "Sem Kimono" conta como no-gi
    expect(isSameEvent(mk('fpjj', 'Copa Paulista', barueri), mk('smoothcomp', 'Copa Paulista Sem Kimono', barueri))).toBe(false);
  });

  it('edição kids fica separada do adulto: São Paulo BJJ Pro × Kids International São Paulo', () => {
    const kids = mk('ibjjf', 'Kids International IBJJF Jiu-Jitsu Championship - São Paulo 2026', { ...barueri, dateISO: '2026-11-22', endDateISO: '2026-11-22' });
    expect(isSameEvent(cbjjSp, kids)).toBe(false);
    expect(isSameEvent(mk('fpjj', 'Copa Paulista', barueri), mk('smoothcomp', 'Copa Paulista Infantil', barueri))).toBe(false);
    expect(isSameEvent(mk('fpjj', 'Copa Paulista', barueri), mk('smoothcomp', 'Copa Paulista Festival', barueri))).toBe(false);
    expect(dedupeSameEvent([cbjjSp, kids], priorityBySource).events).toHaveLength(2);
  });

  it('duas linhas da mesma fonte nunca se fundem nesta passada', () => {
    const a = mk('smoothcomp', 'Copa Barueri Pro', barueri);
    const b = mk('smoothcomp', 'Copa Barueri Pro 2026', barueri);
    expect(isSameEvent(a, b)).toBe(false);
    expect(dedupeSameEvent([a, b], priorityBySource).events).toHaveLength(2);
    // nem por tabela: a CBJJ absorve uma delas, a outra fica
    const c = mk('cbjj', 'Copa Barueri Pro IBJJF 2026', barueri);
    const out = dedupeSameEvent([a, b, c], priorityBySource);
    expect(out.events.map((e) => e.source).sort()).toEqual(['cbjj', 'smoothcomp']);
    expect(out.merges).toHaveLength(1);
  });

  it('título que é só a cidade não identifica: Dublin International Open (Sub Only) × Dublin Fall IBJJF', () => {
    const ibjjf = mk('ibjjf', 'Dublin Fall International Open IBJJF Jiu-Jitsu Championship 2026', {
      city: 'Dublin', countryCode: 'IE', dateISO: '2026-12-05', endDateISO: '2026-12-06',
    });
    const subOnly = mk('smoothcomp', 'Dublin International Open 2026', {
      city: 'Dublin', countryCode: 'IE', dateISO: '2026-12-06', endDateISO: '2026-12-06', lat: 53.4008, lng: -6.3798,
    });
    expect(isSameEvent(ibjjf, subOnly)).toBe(false);
  });

  it('lugar: cidade + país, ou ≤ 15 km pelas coordenadas (ou pela tabela); longe não funde', () => {
    const rio = mk('cbjj', 'Rio Winter Open 2026', { city: 'Rio de Janeiro', state: 'RJ', countryCode: 'BR' });
    const niteroi = mk('smoothcomp', 'RIO WINTER OPEN', { city: 'Niterói', state: 'RJ', countryCode: 'BR', lat: -22.8832, lng: -43.1034 });
    expect(isSameEvent(rio, niteroi)).toBe(true); // Rio pela tabela, ~6 km
    const recife = mk('smoothcomp', 'RIO WINTER OPEN', { city: 'Recife', state: 'PE', countryCode: 'BR', lat: -8.0585, lng: -34.8848 });
    expect(isSameEvent(rio, recife)).toBe(false);
    const unknown = mk('smoothcomp', 'RIO WINTER OPEN', { city: 'Atlantis', countryCode: 'BR' });
    expect(isSameEvent(rio, unknown)).toBe(false); // sem coordenadas nem cidade igual
  });

  it('dias: intervalos que se cruzam ou início a ≤ 1 dia; 3 dias de distância não funde', () => {
    const a = mk('cbjj', 'Copa Barueri Pro', { ...barueri, dateISO: '2026-11-21', endDateISO: '2026-11-21' });
    expect(isSameEvent(a, mk('smoothcomp', 'Copa Barueri Pro', { ...barueri, dateISO: '2026-11-22', endDateISO: '2026-11-22' }))).toBe(true);
    expect(isSameEvent(a, mk('smoothcomp', 'Copa Barueri Pro', { ...barueri, dateISO: '2026-11-19', endDateISO: '2026-11-21' }))).toBe(true);
    expect(isSameEvent(a, mk('smoothcomp', 'Copa Barueri Pro', { ...barueri, dateISO: '2026-11-24', endDateISO: '2026-11-24' }))).toBe(false);
  });

  it('um título contém o outro; títulos que só se cruzam ficam separados', () => {
    const a = mk('cbjj', 'Copa Barueri Pro', barueri);
    expect(isSameEvent(a, mk('smoothcomp', 'Copa Barueri Pro Masters', barueri))).toBe(true);
    expect(isSameEvent(a, mk('smoothcomp', 'Copa Barueri Masters', barueri))).toBe(false);
  });

  it('fillFrom: completa coordenadas, prazo anterior ao evento, ginásio e capa; nunca sobrescreve', () => {
    const keep = mk('cbjj', 'X', { dateISO: '2026-11-21', venue: 'Arena' });
    const other = mk('smoothcomp', 'X', {
      lat: -23.5, lng: -46.8, geo: 'source', registrationDeadlineISO: '2026-11-15', venue: 'Outro', imageUrl: 'https://img',
    });
    expect(fillFrom(keep, other)).toMatchObject({
      source: 'cbjj', venue: 'Arena', lat: -23.5, lng: -46.8, geo: 'source', registrationDeadlineISO: '2026-11-15', imageUrl: 'https://img',
    });
    expect(fillFrom(keep, { ...other, registrationDeadlineISO: '2026-11-21' }).registrationDeadlineISO).toBeUndefined();
    expect(fillFrom(keep, mk('smoothcomp', 'X'))).toBe(keep); // nada a herdar: mesma referência
  });
});
