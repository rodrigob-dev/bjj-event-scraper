import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIbjjfApiAdapter } from '../src/adapters/ibjjf-api.js';
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
    expect(parsed).toHaveLength(2); // 3 no fixture, 1 finished descartado
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
    expect(ev).toHaveLength(2);
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
