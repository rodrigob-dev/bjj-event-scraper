import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIbjjfApiAdapter, endDateOf } from '../src/adapters/ibjjf-api.js';
import { smoothcompAdapter, extractEventsArray } from '../src/adapters/smoothcomp.js';
import { normalizeEvents } from '../src/normalize/index.js';
import { dedupe } from '../src/normalize/dedup.js';
import type { ScrapedEvent } from '../src/types.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const fixture = (f: string) => readFileSync(resolve(DIR, 'fixtures', f), 'utf8');
const NOW = new Date('2026-05-01T00:00:00Z');

describe('ibjjf adapter', () => {
  const adapter = createIbjjfApiAdapter({ name: 'ibjjf', baseUrl: 'https://ibjjf.com', priority: 2 });
  const raw = JSON.parse(fixture('ibjjf-sample.json'));

  it('descarta eventos finished e constrói data ISO de year+month+startDay', () => {
    const parsed = adapter.parse(raw);
    expect(parsed).toHaveLength(7); // 8 no fixture, 1 finished descartado
    expect(parsed[0]!.rawDate).toBe('2026-06-05');
    expect(parsed[0]!.url).toBe('https://ibjjf.com/events/rio-fall-2026');
  });

  it('aceita mês em PT (ago) e pageUrl null cai no calendário', () => {
    const parsed = adapter.parse(raw);
    const pt = parsed.find((e) => e.title.includes('Campeonato PT'))!;
    expect(pt.rawDate).toBe('2026-08-10');
    expect(pt.url).toBe('https://ibjjf.com/events/calendar');
    expect(pt.location).toBe('São Paulo'); // local null filtrado
  });
});

describe('smoothcomp adapter', () => {
  const html = fixture('smoothcomp-sample.html');

  it('extrai o array var events inline', () => {
    expect(extractEventsArray(html)).toHaveLength(3);
  });

  it('cobertura mundial: mantém BR e GB, descarta encerrado', () => {
    const parsed = smoothcompAdapter.parse(html);
    expect(parsed).toHaveLength(2); // BR-passado-encerrado excluído; GB entra (v2)
    expect(parsed[0]!.title).toContain('PERNAMBUCANO');
    expect(parsed[0]!.url).toBe('https://fijjd.smoothcomp.com/en/event/100');
    expect(parsed[0]!.location).toBe('Garanhuns, PE, Brazil'); // v1 intacto
    expect(parsed[1]!.countryCode).toBe('GB');
  });
});

describe('hardening de input externo', () => {
  it('extractEventsArray não lança com array ausente', () => {
    expect(extractEventsArray('<html>sem var events</html>')).toEqual([]);
  });

  it('ibjjf descarta startDay fora de 1..31 e year insano', () => {
    const adapter = createIbjjfApiAdapter({ name: 'ibjjf', baseUrl: 'https://ibjjf.com', priority: 2 });
    const raw = {
      infosite_events: [
        { name: 'Bad day 0', year: 2026, month: 'Jun', startDay: 0, status: 'published', pageUrl: '/x' },
        { name: 'Bad day 99', year: 2026, month: 'Jun', startDay: 99, status: 'published', pageUrl: '/x' },
        { name: 'Bad year', year: 9999, month: 'Jun', startDay: 5, status: 'published', pageUrl: '/x' },
      ],
    };
    expect(adapter.parse(raw)).toHaveLength(0);
  });

  it('normalize descarta url não-http (ex: javascript:)', () => {
    const ev = normalizeEvents(
      [{ title: 'XSS', rawDate: '2026-12-01', location: 'X', url: "javascript:alert('x')" }],
      { source: 'smoothcomp', scrapedAt: '2026-05-01T00:00:00.000Z', now: NOW },
    );
    expect(ev).toHaveLength(0);
  });

  it('normalize aceita url https', () => {
    const ev = normalizeEvents(
      [{ title: 'OK', rawDate: '2026-12-01', location: 'X', url: 'https://ibjjf.com/events/x' }],
      { source: 'ibjjf', scrapedAt: '2026-05-01T00:00:00.000Z', now: NOW },
    );
    expect(ev).toHaveLength(1);
  });
});

describe('normalize + dedup ponta-a-ponta', () => {
  it('normaliza, descarta passados e formata display', () => {
    const adapter = createIbjjfApiAdapter({ name: 'ibjjf', baseUrl: 'https://ibjjf.com', priority: 2 });
    const ev = normalizeEvents(adapter.parse(JSON.parse(fixture('ibjjf-sample.json'))), {
      source: 'ibjjf',
      scrapedAt: '2026-05-01T00:00:00.000Z',
      now: NOW,
    });
    expect(ev).toHaveLength(7);
    expect(ev[0]!.date).toBe('5 de Junho, 2026');
    expect(ev[0]!.type).toBe('competition');
  });

  it('dedup mantém a fonte de maior prioridade em colisão', () => {
    const base = {
      title: 'Rio Open 2026',
      type: 'competition' as const,
      date: '5 de Junho, 2026',
      location: 'Rio',
      ctaLabel: 'Ver Detalhes',
      icon: '🏆',
      dateISO: '2026-06-05',
      sourceUrl: 'https://x',
      scrapedAt: '2026-05-01T00:00:00.000Z',
    };
    const events: ScrapedEvent[] = [
      { ...base, id: 'rio-open-2026|2026-06-05', source: 'smoothcomp' },
      { ...base, id: 'rio-open-2026|2026-06-05', source: 'cbjj' },
    ];
    const out = dedupe(events, { cbjj: 3, ibjjf: 2, smoothcomp: 1 });
    expect(out).toHaveLength(1);
    expect(out[0]!.source).toBe('cbjj');
  });

  it('dedup: quem fica herda lat/lng de quem sai (federação sem coordenadas × Smoothcomp com)', () => {
    const mk = (source: string, extra: Partial<ScrapedEvent> = {}): ScrapedEvent => ({
      id: 'x|2026-06-05', title: 'Copa X', type: 'competition', date: '5 de Junho, 2026', location: 'SP',
      ctaLabel: 'Ver Detalhes', icon: '🏆', dateISO: '2026-06-05', source, sourceUrl: 'https://x',
      scrapedAt: '2026-05-01T00:00:00.000Z', ...extra,
    });
    const p = { cbjj: 3, smoothcomp: 1 };
    const a = dedupe([mk('smoothcomp', { lat: -23.5, lng: -46.6 }), mk('cbjj', { city: 'Barueri' })], p);
    expect(a[0]).toMatchObject({ source: 'cbjj', city: 'Barueri', lat: -23.5, lng: -46.6 });
    const b = dedupe([mk('cbjj', { city: 'Barueri' }), mk('smoothcomp', { lat: -23.5, lng: -46.6 })], p);
    expect(b[0]).toMatchObject({ source: 'cbjj', lat: -23.5, lng: -46.6 });
    const c = dedupe([mk('cbjj', { lat: 1, lng: 2 }), mk('smoothcomp', { lat: -23.5, lng: -46.6 })], p);
    expect(c[0]).toMatchObject({ source: 'cbjj', lat: 1, lng: 2 }); // as suas valem mais
  });

  it('dedup trata acento/caixa como mesmo evento', () => {
    const mk = (title: string, source: string): ScrapedEvent => ({
      id: `x|2026-06-05`,
      title,
      type: 'competition',
      date: '5 de Junho, 2026',
      location: 'SP',
      ctaLabel: 'Ver Detalhes',
      icon: '🏆',
      dateISO: '2026-06-05',
      source,
      sourceUrl: 'https://x',
      scrapedAt: '2026-05-01T00:00:00.000Z',
    });
    const out = dedupe(
      [mk('Copa São Paulo', 'smoothcomp'), mk('COPA SAO PAULO', 'cbjj')],
      { cbjj: 3, smoothcomp: 1 },
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.source).toBe('cbjj');
  });
});

describe('ibjjf/cbjj v2 — campos estruturados', () => {
  const ibjjf = createIbjjfApiAdapter({ name: 'ibjjf', baseUrl: 'https://ibjjf.com', priority: 2 });
  const cbjj = createIbjjfApiAdapter({ name: 'cbjj', baseUrl: 'https://cbjj.com.br', priority: 3 });
  const ib = ibjjf.parse(JSON.parse(fixture('ibjjf-sample.json')));
  const cb = cbjj.parse(JSON.parse(fixture('cbjj-sample.json')));
  const byId = (list: typeof ib, id: string) => list.find((e) => e.sourceId === id)!;

  it('sourceId, venue, cidade, país e UF pela tabela; organizer pela federação', () => {
    const rio = byId(ib, 'ibjjf:1');
    expect(rio).toMatchObject({
      venue: 'Centro Esportivo', city: 'Rio de Janeiro', state: 'RJ', countryCode: 'BR',
      organizer: 'IBJJF', sport: 'bjj', gi: true, nogi: false, kids: false,
    });
    expect(rio.location).toBe('Centro Esportivo, Rio de Janeiro'); // v1 intacto
    expect(byId(ib, 'ibjjf:4')).toMatchObject({ city: 'Los Angeles', state: 'CA', countryCode: 'US' });
  });

  it('endDateISO: mesmo mês, virada de mês por intervalDays, virada de ano', () => {
    expect(byId(ib, 'ibjjf:1').rawEndDate).toBe('2026-06-06');
    expect(byId(ib, 'ibjjf:4').rawEndDate).toBe('2027-02-01'); // "Jan 30 - Feb 1"
    expect(byId(ib, 'ibjjf:5').rawEndDate).toBe('2026-12-12'); // "Dec 10 - Dec 12"
    expect(byId(ib, 'ibjjf:6').rawEndDate).toBe('2027-01-02'); // "Dec 30* - Jan 2"
    expect(byId(ib, 'ibjjf:8').rawEndDate).toBe('2026-11-07'); // 1 dia
  });

  it('endDateOf aceita PT (CBJJ) e asterisco', () => {
    expect(endDateOf({ year: 2027, month: '01', startDay: 30, endDay: 1, intervalDays: '30 jan até 1 fev' })).toBe('2027-02-01');
    expect(endDateOf({ year: 2027, month: '04', startDay: 24, endDay: 2, intervalDays: '24* abr até 2 mai' })).toBe('2027-05-02');
    expect(endDateOf({ year: 2026, month: '12', startDay: 30, endDay: 2, intervalDays: null })).toBe('2027-01-02'); // só endDay < startDay
    expect(endDateOf({ year: 2026, month: '06', startDay: 5, endDay: undefined })).toBe('2026-06-05');
  });

  it('gi/nogi/kids pelos eventGroups e pelo título', () => {
    expect(byId(ib, 'ibjjf:5')).toMatchObject({ gi: false, nogi: true, kids: true });
    expect(byId(ib, 'ibjjf:6')).toMatchObject({ gi: true, nogi: false, kids: false });
    expect(byId(cb, 'cbjj:2968')).toMatchObject({ gi: false, nogi: true, kids: true }); // "Sem Kimono" + grupos
  });

  it('cidade limpa: espaço sobrando e estação vazada', () => {
    expect(byId(ib, 'ibjjf:5')).toMatchObject({ city: 'Hempstead', state: 'NY', countryCode: 'US' });
    expect(byId(ib, 'ibjjf:7')).toMatchObject({ city: 'Curitiba', state: 'PR', countryCode: 'BR' });
  });

  it('cidade fora da tabela fica sem país (nunca chuta)', () => {
    const m = byId(ib, 'ibjjf:8');
    expect(m.city).toBe('Atlantis');
    expect(m.countryCode).toBeUndefined();
    expect(m.state).toBeUndefined();
  });

  it('CBJJ é sempre BR, ignora region ruidosa e corrige grafia da federação', () => {
    expect(byId(cb, 'cbjj:2968')).toMatchObject({ countryCode: 'BR', state: 'RJ', city: 'Rio de Janeiro', organizer: 'CBJJ' });
    expect(byId(cb, 'cbjj:3120')).toMatchObject({ countryCode: 'BR', state: 'SC', city: 'Balneário Camboriú' });
    expect(byId(cb, 'cbjj:3120').rawEndDate).toBe('2027-02-01');
    expect(byId(cb, 'cbjj:3121')).toMatchObject({ city: 'Barueri', state: 'SP' });
    expect(byId(cb, 'cbjj:3121').rawEndDate).toBe('2027-05-02');
  });

  it('normaliza em ScrapedEvent com endDateISO e id v1 inalterado', () => {
    const ev = normalizeEvents(ib, { source: 'ibjjf', scrapedAt: '2026-05-01T00:00:00.000Z', now: NOW });
    const rio = ev.find((e) => e.sourceId === 'ibjjf:1')!;
    expect(rio.id).toBe('rio-fall-international-open-ibjjf-jiu-jitsu-championship-2026|2026-06-05');
    expect(rio.endDateISO).toBe('2026-06-06');
    expect(rio.countryCode).toBe('BR');
  });
});

describe('ibjjf — region ruidosa', () => {
  it('a tabela vence quando o continente da API contradiz (Fortaleza como "North America")', () => {
    const adapter = createIbjjfApiAdapter({ name: 'ibjjf', baseUrl: 'https://ibjjf.com', priority: 2 });
    const raw = {
      infosite_events: [
        { id: 9, name: 'Fortaleza Spring Open 2026', region: 'North America', year: 2026, month: 'Nov', startDay: 7, endDay: 8, local: 'Ginásio', city: 'Fortaleza', status: 'published', pageUrl: '/x' },
        { id: 10, name: 'Melbourne Open 2026', region: 'Oceania', year: 2026, month: 'Nov', startDay: 7, local: 'MSAC', city: 'Melbourne', status: 'published', pageUrl: '/y' },
        { id: 11, name: 'Melbourne Open 2026', region: 'North America', year: 2026, month: 'Nov', startDay: 7, local: 'X', city: 'Melbourne', status: 'published', pageUrl: '/z' },
        { id: 12, name: 'Sem Kimono Open 2026', region: 'South America', year: 2026, month: 'Nov', startDay: 7, local: 'X', city: 'Recife', status: 'published', pageUrl: '/w' },
      ],
    };
    const out = adapter.parse(raw);
    expect(out[0]).toMatchObject({ countryCode: 'BR', state: 'CE' });
    expect(out[1]).toMatchObject({ countryCode: 'AU', state: 'VIC' });
    expect(out[2]).toMatchObject({ countryCode: 'US', state: 'FL' });
    expect(out[3]).toMatchObject({ nogi: true, gi: false });
  });
});
