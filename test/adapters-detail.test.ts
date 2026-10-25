// Fontes que precisam da página do evento: JJWL (uma página por evento), FJJRIO
// e CBJJO (prazo/datas na página). Fixtures são trechos reais (2026-10-25).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ajpAdapter } from '../src/adapters/ajp.js';
import { sjjifAdapter } from '../src/adapters/sjjif.js';
import { jjwlAdapter, extractEventSlugs, parseEventPage } from '../src/adapters/jjwl.js';
import { fjjrioAdapter, extractUpcomingCards, extractDeadline, sourceIdOf } from '../src/adapters/fjjrio.js';
import { cbjjoAdapter, extractCards as cbjjoCards, parseDetail, placeOfLocal } from '../src/adapters/cbjjo.js';
import { normalizeEvents } from '../src/normalize/index.js';
import { priorityBySource } from '../src/adapters/registry.js';
import { scrapedEventSchema } from '../src/schema.js';
import type { RawEvent } from '../src/types.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const fixture = (f: string) => readFileSync(resolve(DIR, 'fixtures', f), 'utf8');
// Meio-dia UTC, antes do 1º evento das fixtures (REI DO RIO, 24/10): nada é passado.
const NOW = new Date('2026-10-20T12:00:00Z');
const normalize = (source: string, raws: RawEvent[]) =>
  normalizeEvents(raws, { source, scrapedAt: '2026-10-20T12:00:00.000Z', now: NOW });

describe('jjwl — menu de torneios + página por evento', () => {
  const slugs = extractEventSlugs(fixture('jjwl-tournaments.html'));
  const gi = fixture('jjwl-event-texas-finals-2026-gi-adults.html');
  const youth = fixture('jjwl-event-texas-finals-2026-nogi-youth.html');

  it('slugs únicos do menu, na ordem', () => {
    expect(slugs.length).toBeGreaterThanOrEqual(28);
    expect(slugs[0]).toBe('texas-finals-2026-nogi-youth');
    expect(slugs).toContain('ca-champ-II-gi-adults');
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('página: título, dia, endereço → cidade/estado/país, prazo, imagem', () => {
    const ev = parseEventPage('texas-finals-2026-gi-adults', gi)!;
    expect(ev).toMatchObject({
      title: 'The Finals Texas 2026 GI Adults and Masters', rawDate: '2026-11-07', rawEndDate: '2026-11-07',
      city: 'Frisco', state: 'TX', countryCode: 'US', gi: true, nogi: false, kids: false,
      organizer: 'JJWL', sport: 'bjj', registrationDeadlineISO: '2026-11-04',
      sourceId: 'jjwl:texas-finals-2026-gi-adults', url: 'https://www.jjworldleague.com/events/texas-finals-2026-gi-adults',
    });
    expect(ev.imageUrl).toBe('https://jjworldleague.com/uploaded/events/groups/265.png');
    expect(ev.location).toBe('2601 Avenue of the Stars, Frisco, TX 75034, United States');
  });

  it('NoGI Youth: nogi + kids; página sem data é descartada', () => {
    expect(parseEventPage('texas-finals-2026-nogi-youth', youth)).toMatchObject({ gi: false, nogi: true, kids: true });
    expect(parseEventPage('x', '<html><body><div class="event-name-font"><h2>X</h2></div></body></html>')).toBeUndefined();
  });

  it('adapter.parse junta as páginas e ignora falhas', () => {
    const out = jjwlAdapter.parse({ list: '', pages: { 'texas-finals-2026-gi-adults': gi, broken: '<html></html>' } });
    expect(out).toHaveLength(1);
  });
});

describe('fjjrio — "Próximos Eventos" da home + prazo da página', () => {
  const home = fixture('fjjrio-home.html');
  const details = {
    aEhxejNDaFdvS3d2aXRoZGF2OVJ5QT09: fixture('fjjrio-detail-rolls-gracie-2026.html'),
    ME8xYzJXNXphRVhoU2dEck5iamVrQT09: fixture('fjjrio-detail-rei-do-rio-kids-nogi-2026.html'),
  };
  const parsed = fjjrioAdapter.parse({ home, details });
  const byTitle = (t: string) => parsed.find((e) => e.title === t)!;

  it('só os cards futuros (os "Eventos Passados" ficam de fora)', () => {
    expect(extractUpcomingCards(home)).toHaveLength(5);
    expect(parsed.map((e) => e.title)).not.toContain('CARIOCA NOGI 2026');
  });

  it('dois dias, ginásio conhecido → cidade, BR/RJ, prazo da página, imagem absoluta', () => {
    expect(byTitle('ROLLS GRACIE 2026')).toMatchObject({
      rawDate: '2026-12-05', rawEndDate: '2026-12-06', venue: 'Arena Carioca 1', city: 'Rio de Janeiro',
      state: 'RJ', countryCode: 'BR', gi: true, nogi: false, kids: false, organizer: 'FJJRIO',
      registrationDeadlineISO: '2026-11-29', sourceId: 'fjjrio:aEhxejNDaFdvS3d2aXRoZGF2OVJ5QT09',
    });
    expect(byTitle('ROLLS GRACIE 2026').imageUrl).toBe('https://fjjrio.com.br/app/img/eventos/Rolls%20Gracie2b1f15f7e10f3ef3dc39872ac5c8faa3aae62c9a.jpeg');
    expect(byTitle('ROLLS GRACIE 2026').url).toBe('https://fjjrio.com.br/evento.php?id=aEhxejNDaFdvS3d2aXRoZGF2OVJ5QT09');
  });

  it('categoria "Campeonato Kids NOGI" → nogi + kids; sem página, sem prazo', () => {
    expect(byTitle('REI DO RIO KIDS NOGI 2026')).toMatchObject({ gi: false, nogi: true, kids: true, registrationDeadlineISO: '2026-10-18' });
    expect(byTitle('REI DO RIO 2026')).toMatchObject({ gi: true, nogi: false, kids: false, rawDate: '2026-10-24' });
    expect(byTitle('REI DO RIO 2026').registrationDeadlineISO).toBeUndefined();
    expect(extractDeadline('<html></html>')).toBeUndefined();
    expect(sourceIdOf('ab+c/d==')).toBe('fjjrio:ab-c_d');
  });

  it('normaliza 5 eventos válidos no contrato', () => {
    const ev = normalize('fjjrio', parsed);
    expect(ev).toHaveLength(5);
    for (const e of ev) expect(scrapedEventSchema.safeParse(e).success).toBe(true);
  });
});

describe('cbjjo — listagem do Portal Samurai + página por evento', () => {
  const list = fixture('cbjjo-listing.html');
  const details = { '48': fixture('cbjjo-evento-48.html'), '52': fixture('cbjjo-evento-52.html') };
  const parsed = cbjjoAdapter.parse({ list, details });
  const byId = (id: number) => parsed.find((e) => e.sourceId === `cbjjo:${id}`)!;

  it('5 cards futuros; passados (evento_resultados) e links do carrossel ficam de fora', () => {
    expect(cbjjoCards(list).map((c) => c.id)).toEqual(['48', '49', '50', '51', '52']);
    expect(parsed).toHaveLength(5);
  });

  it('página: datas DE/ATÉ, prazo, local → ginásio + cidade + UF', () => {
    expect(parseDetail(details['48'])).toEqual({
      title: 'WORLD CUP 2026 - GI', start: '2026-11-07', end: '2026-11-08', deadline: '2026-11-02',
      local: 'CENTRO POLIESPORTIVO MIÉCIMO DA SILVA, CAMPO GRANDE - RIO DE JANEIRO',
    });
    expect(byId(48)).toMatchObject({
      rawDate: '2026-11-07', rawEndDate: '2026-11-08', venue: 'Centro Poliesportivo Miécimo da Silva', city: 'Rio de Janeiro',
      state: 'RJ', countryCode: 'BR', gi: true, nogi: false, kids: false, organizer: 'CBJJO', registrationDeadlineISO: '2026-11-02',
    });
    expect(byId(48).imageUrl).toBe('https://cbjjo.beta.portalsamurai.com/assets/img/eventos/48_card_1789048332.jpg');
    expect(byId(48).url).toBe('https://cbjjo.beta.portalsamurai.com/views/evento/Evento.php?ID_EVENTO=48');
    expect(placeOfLocal('GINÁSIO X, BAIRRO - NITERÓI')).toEqual({ venue: 'Ginásio X', city: 'Niterói' });
  });

  it('prazo depois do início não vale; título manda na modalidade; festival é infantil', () => {
    expect(byId(52)).toMatchObject({ nogi: true, gi: false });
    expect(byId(52).registrationDeadlineISO).toBeUndefined(); // "ATÉ 09/11" num evento de 07/11
    expect(byId(51)).toMatchObject({ gi: true, nogi: false }); // campo oculto diz NO-GI, título diz GI
    expect(byId(49)).toMatchObject({ gi: false, nogi: true });
    expect(byId(50)).toMatchObject({ kids: true, gi: true });
  });

  it('sem página: mês/dias do card + ano do título, e só o ginásio (o card corta a cidade)', () => {
    expect(byId(49)).toMatchObject({ rawDate: '2026-11-07', rawEndDate: '2026-11-08', venue: 'Centro Poliesportivo Miécimo da Silva', countryCode: 'BR' });
    expect(byId(49).city).toBeUndefined();
    expect(byId(49).state).toBeUndefined();
  });
});

describe('registro + contrato', () => {
  it('prioridades: federações 3, organizadores 2, agregador 1', () => {
    expect(priorityBySource).toMatchObject({ cbjj: 3, cbjjo: 3, fjjrio: 3, ibjjf: 2, ajp: 2, jjwl: 2, sjjif: 2, smoothcomp: 1 });
  });

  it('tudo que as cinco fontes emitem passa no schema v2, com sourceId único', () => {
    const all = [
      ...normalize('ajp', ajpAdapter.parse(fixture('ajp-upcoming.html'))),
      ...normalize('sjjif', sjjifAdapter.parse(fixture('sjjif-home.html'))),
      ...normalize('jjwl', jjwlAdapter.parse({ list: '', pages: { 'texas-finals-2026-gi-adults': fixture('jjwl-event-texas-finals-2026-gi-adults.html') } })),
      ...normalize('cbjjo', cbjjoAdapter.parse({ list: fixture('cbjjo-listing.html'), details: { '48': fixture('cbjjo-evento-48.html') } })),
    ];
    expect(all.length).toBe(22 + 17 + 1 + 5);
    for (const e of all) {
      const r = scrapedEventSchema.safeParse(e);
      expect(r.success, `${e.sourceId}: ${JSON.stringify(r.success ? '' : r.error.issues[0])}`).toBe(true);
    }
    expect(new Set(all.map((e) => e.sourceId)).size).toBe(all.length);
  });
});
