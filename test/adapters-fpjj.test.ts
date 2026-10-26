// FPJJ: calendário anual com os eventos num array JS inline. Fixture é o bloco
// real de /calendario-2026/ (2026-10-25), com o resto da página cortado.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fpjjAdapter, extractEventsData, parseCalendar, placeOfLocal, calendarUrl } from '../src/adapters/fpjj.js';
import { normalizeEvents } from '../src/normalize/index.js';
import { priorityBySource } from '../src/adapters/registry.js';
import { scrapedEventSchema } from '../src/schema.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const fixture = (f: string) => readFileSync(resolve(DIR, 'fixtures', f), 'utf8');
// 20/10/2026: o Paulista (16–18/10) já passou; sobram os três de novembro.
const NOW = new Date('2026-10-20T12:00:00Z');

describe('fpjj — array eventsData inline', () => {
  const html = fixture('fpjj-calendario-2026.html');
  const items = extractEventsData(html);
  const parsed = parseCalendar(html, 2026);
  const byId = (id: number) => parsed.find((e) => e.sourceId === `fpjj:2026-${id}`)!;

  it('lê os 19 objetos sem executar JS; comentários de mês não atrapalham', () => {
    expect(items).toHaveLength(19);
    expect(items[0]).toEqual({
      id: '12', title: 'I Etapa Do Circuito Sem Kimono', date: '1 de março', local: 'Pelezão',
      confirmacao: 'confirmado', realizacao: 'FPJJ',
    });
    expect(extractEventsData('<html>sem array</html>')).toEqual([]);
  });

  it('datas PT sem ano ganham o ano da URL: 1 dia, "16-18", "20-21-22", virada de mês', () => {
    expect(byId(9)).toMatchObject({ rawDate: '2026-11-14', rawEndDate: '2026-11-14' });
    expect(byId(8)).toMatchObject({ rawDate: '2026-10-16', rawEndDate: '2026-10-18' });
    expect(byId(11)).toMatchObject({ rawDate: '2026-11-20', rawEndDate: '2026-11-22' });
    expect(byId(2)).toMatchObject({ rawDate: '2026-04-23', rawEndDate: '2026-05-03' }); // "23 de Abril a 03 de Maio"
    expect(byId(19)).toMatchObject({ rawDate: '2026-09-14', rawEndDate: '2026-09-15' }); // "14 e 15 Setembro"
  });

  it('"Cidade - SP" vira cidade/UF; só o ginásio vira venue sem cidade', () => {
    expect(byId(8)).toMatchObject({ city: 'Barueri', state: 'SP', countryCode: 'BR' });
    expect(byId(14)).toMatchObject({ city: 'São Caetano do Sul', state: 'SP' });
    expect(byId(9)).toMatchObject({ city: 'Indaiatuba', state: 'SP' });
    expect(byId(12)).toMatchObject({ venue: 'Pelezão', countryCode: 'BR' });
    expect(byId(12).city).toBeUndefined();
    expect(byId(18).venue).toBe('Centro Esportivo Jd. Morada do Sol Rei Pelé');
    expect(placeOfLocal('Guarujá - SP')).toEqual({ city: 'Guarujá', state: 'SP' });
    expect(placeOfLocal(undefined)).toEqual({});
  });

  it('modalidade e kids pelo título; organizer como a federação escreve', () => {
    expect(byId(10)).toMatchObject({ gi: false, nogi: true, kids: false }); // NO GI Clash
    expect(byId(18)).toMatchObject({ gi: false, nogi: true }); // Campeonato Paulista Sem Kimono
    expect(byId(4)).toMatchObject({ gi: true, nogi: false, kids: true, organizer: 'CBJJ/FPJJ' }); // Brasileiro Infantil
    expect(byId(8).organizer).toBe('FPJJ');
    expect(byId(8)).toMatchObject({ sport: 'bjj', location: 'Barueri - SP' });
    expect(byId(8).url).toBe('https://www.fpjjcompetidor.com.br/calendario-2026/');
  });

  it('adapter.parse junta os anos; normaliza só os futuros e passa no schema', () => {
    const raws = fpjjAdapter.parse({ '2026': html, bogus: html });
    expect(raws).toHaveLength(19);
    const ev = normalizeEvents(raws, { source: 'fpjj', scrapedAt: '2026-10-20T12:00:00.000Z', now: NOW });
    expect(ev.map((e) => e.sourceId).sort()).toEqual(['fpjj:2026-10', 'fpjj:2026-11', 'fpjj:2026-9']);
    for (const e of ev) expect(scrapedEventSchema.safeParse(e).success).toBe(true);
    expect(ev.find((e) => e.sourceId === 'fpjj:2026-11')!.endDateISO).toBe('2026-11-22');
    expect(priorityBySource.fpjj).toBe(3);
    expect(calendarUrl(2027)).toBe('https://www.fpjjcompetidor.com.br/calendario-2027/');
  });
});
