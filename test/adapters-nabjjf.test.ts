// NABJJF: aba "Upcoming" de /tournaments + página por evento (Next.js SSR).
// Fixtures são trechos reais de 2026-10-25.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nabjjfAdapter, extractUpcomingSlugs, parseEventPage, deadlineOf } from '../src/adapters/nabjjf.js';
import { normalizeEvents } from '../src/normalize/index.js';
import { dedupe } from '../src/normalize/dedup.js';
import { priorityBySource } from '../src/adapters/registry.js';
import { scrapedEventSchema } from '../src/schema.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const fixture = (f: string) => readFileSync(resolve(DIR, 'fixtures', f), 'utf8');
const NOW = new Date('2026-10-20T12:00:00Z');

describe('nabjjf — aba Upcoming + página do evento', () => {
  const list = fixture('nabjjf-tournaments.html');
  const allAmericas = fixture('nabjjf-event-2027-all-americas.html');
  const nationals = fixture('nabjjf-event-2027-nationals-open.html');

  it('só os 4 slugs da aba Upcoming, na ordem; os passados ficam de fora', () => {
    expect(extractUpcomingSlugs(list)).toEqual([
      'las-vegas-silver-state-jiu-jitsu-open',
      'the-2026-north-american-grand-finale',
      '2027-all-americas-jiu-jitsu-tournament',
      '2027-nationals-jiu-jitsu-open',
    ]);
    expect(extractUpcomingSlugs('<html><body>nada</body></html>')).toEqual([]);
  });

  it('página: título do <title>, data, ginásio + endereço → cidade/estado/US, formato, prazo, capa', () => {
    const ev = parseEventPage('2027-all-americas-jiu-jitsu-tournament', allAmericas)!;
    expect(ev).toMatchObject({
      title: '2027 All Americas Jiu Jitsu Tournament', rawDate: '2027-01-23', rawEndDate: '2027-01-23',
      venue: 'Cerritos College', city: 'Norwalk', state: 'CA', countryCode: 'US',
      gi: true, nogi: true, kids: true, organizer: 'NABJJF', sport: 'bjj',
      registrationDeadlineISO: '2027-01-13', sourceId: 'nabjjf:2027-all-americas-jiu-jitsu-tournament',
      url: 'https://nabjjf.com/events/2027-all-americas-jiu-jitsu-tournament',
    });
    expect(ev.location).toBe('Cerritos College, 11110 Alondra Blvd, Norwalk, CA 90650');
    expect(ev.imageUrl).toBe('https://smoothcomp.com/pictures/t/9564329-sv64/2027-all-americas-jiu-jitsu-tournament.jpg');
  });

  it('prazo "opens Nov 11 · closes Feb 17" e o banner de outro evento não contamina', () => {
    const ev = parseEventPage('2027-nationals-jiu-jitsu-open', nationals)!;
    expect(ev).toMatchObject({ title: '2027 Nationals Jiu-Jitsu Open', rawDate: '2027-02-28', city: 'Fullerton', state: 'CA', registrationDeadlineISO: '2027-02-17' });
    expect(ev.venue).toBe('Hope International University');
  });

  it('deadlineOf: sem ano, cai no ano do evento ou no anterior; nunca depois do evento', () => {
    expect(deadlineOf('<b class="evh-pt">Closes Dec 23</b>', '2027-01-23')).toBe('2026-12-23');
    expect(deadlineOf('<b class="evh-pt">Closes Jan 13</b>', '2027-01-23')).toBe('2027-01-13');
    expect(deadlineOf('<b class="evh-pt">Closes Jan 30</b>', '2027-01-23')).toBeUndefined();
    expect(deadlineOf('<b class="evh-pt">Sold out</b>', '2027-01-23')).toBeUndefined();
    expect(deadlineOf('<p>nada</p>', '2027-01-23')).toBeUndefined();
  });

  it('página sem data é descartada; sem endereço a cidade vem do cabeçalho', () => {
    expect(parseEventPage('x', '<html><head><title>X | NABJJF</title></head></html>')).toBeUndefined();
    const bare =
      '<html><head><title>Y | NABJJF</title></head><body><span class="eyebrow">Nov 7, 2026 · Las Vegas, NV</span>' +
      '<dl class="evh-meta"><div><dt>Date</dt><dd>Sat, Nov 7, 2026</dd></div></dl></body></html>';
    const ev = parseEventPage('y', bare)!;
    expect(ev).toMatchObject({ city: 'Las Vegas', state: 'NV', countryCode: 'US' });
    expect(ev.gi).toBeUndefined();
    expect(ev.venue).toBeUndefined();
  });

  it('adapter.parse junta as páginas; normaliza, passa no schema e vence o Smoothcomp no dedup', () => {
    const raws = nabjjfAdapter.parse({ list, pages: { '2027-all-americas-jiu-jitsu-tournament': allAmericas, broken: '<html></html>' } });
    expect(raws).toHaveLength(1);
    const ev = normalizeEvents(raws, { source: 'nabjjf', scrapedAt: '2026-10-20T12:00:00.000Z', now: NOW });
    expect(ev).toHaveLength(1);
    expect(scrapedEventSchema.safeParse(ev[0]).success).toBe(true);
    expect(ev[0]!.id).toBe('2027-all-americas-jiu-jitsu-tournament|2027-01-23');
    const out = dedupe([{ ...ev[0]!, source: 'smoothcomp' }, ev[0]!], priorityBySource);
    expect(out).toHaveLength(1);
    expect(out[0]!.source).toBe('nabjjf');
  });
});
