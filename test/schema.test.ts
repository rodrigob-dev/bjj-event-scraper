import { describe, it, expect } from 'vitest';
import { scrapedEventSchema, outputSchema } from '../src/schema.js';
import { findInvariantErrors } from '../src/validate.js';

const base = {
  id: 'rio-open-2026|2026-06-05',
  title: 'Rio Open 2026',
  type: 'competition',
  date: '5 de Junho, 2026',
  location: 'Rio',
  ctaLabel: 'Ver Detalhes',
  icon: '🏆',
  dateISO: '2026-06-05',
  source: 'ibjjf',
  sourceUrl: 'https://ibjjf.com/events/rio',
  scrapedAt: '2026-05-01T00:00:00.000Z',
};
const NOW = new Date('2026-05-01T12:00:00Z');

describe('schema v2', () => {
  it('v1 puro continua válido (campos v2 opcionais)', () => {
    expect(scrapedEventSchema.safeParse(base).success).toBe(true);
  });
  it('aceita a linha v2 completa', () => {
    const full = {
      ...base, sourceId: 'ibjjf:3121', endDateISO: '2026-06-06', venue: 'Arena', city: 'Rio de Janeiro',
      state: 'RJ', countryCode: 'BR', lat: -22.9, lng: -43.2, gi: true, nogi: false, kids: false,
      organizer: 'IBJJF', sport: 'bjj', registrationDeadlineISO: '2026-05-30',
    };
    expect(scrapedEventSchema.safeParse(full).success).toBe(true);
  });
  it('rejeita countryCode fora do padrão ISO e state minúsculo', () => {
    expect(scrapedEventSchema.safeParse({ ...base, countryCode: 'Brasil' }).success).toBe(false);
    expect(scrapedEventSchema.safeParse({ ...base, countryCode: 'br' }).success).toBe(false);
    expect(scrapedEventSchema.safeParse({ ...base, state: 'rj' }).success).toBe(false);
  });
  it('rejeita lat/lng fora do range, 0,0 e só um dos dois', () => {
    expect(scrapedEventSchema.safeParse({ ...base, lat: 91, lng: 0 }).success).toBe(false);
    expect(scrapedEventSchema.safeParse({ ...base, lat: 0, lng: 181 }).success).toBe(false);
    expect(scrapedEventSchema.safeParse({ ...base, lat: 0, lng: 0 }).success).toBe(false);
    expect(scrapedEventSchema.safeParse({ ...base, lat: 10 }).success).toBe(false);
  });
  it('rejeita endDateISO antes de dateISO e prazo na data do evento', () => {
    expect(scrapedEventSchema.safeParse({ ...base, endDateISO: '2026-06-04' }).success).toBe(false);
    expect(scrapedEventSchema.safeParse({ ...base, registrationDeadlineISO: '2026-06-05' }).success).toBe(false);
    expect(scrapedEventSchema.safeParse({ ...base, registrationDeadlineISO: '2026-06-04' }).success).toBe(true);
  });
  it('rejeita sourceId sem o prefixo da fonte e sport fora do enum', () => {
    expect(scrapedEventSchema.safeParse({ ...base, sourceId: '3121' }).success).toBe(false);
    expect(scrapedEventSchema.safeParse({ ...base, sport: 'karate' }).success).toBe(false);
  });
});

describe('invariantes do validate', () => {
  it('sourceId duplicado falha; id duplicado falha', () => {
    const a = outputSchema.parse([{ ...base, sourceId: 'ibjjf:1' }, { ...base, id: 'outro|2026-06-05', sourceId: 'ibjjf:1' }]);
    expect(findInvariantErrors(a, NOW).join()).toMatch(/sourceId/);
    const b = outputSchema.parse([base, base]);
    expect(findInvariantErrors(b, NOW).join()).toMatch(/id\(s\)/);
  });
  it('evento em andamento não é passado (usa endDateISO)', () => {
    const ev = outputSchema.parse([{ ...base, dateISO: '2026-04-30', endDateISO: '2026-05-02' }]);
    expect(findInvariantErrors(ev, NOW)).toEqual([]);
    const past = outputSchema.parse([{ ...base, dateISO: '2026-04-29', endDateISO: '2026-04-30' }]);
    expect(findInvariantErrors(past, NOW).join()).toMatch(/passada/);
  });
});
