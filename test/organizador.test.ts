import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ORGANIZER_BASE_PATH,
  applyOrganizer,
  baseErrors,
  buildOrganizerBase,
  compilePattern,
  organizerBase,
  organizerEntrySchema,
  resolveOrganizer,
  smoothcompSubdomain,
  type OrganizerEntry,
} from '../src/normalize/organizador.js';
import { normalizeEvents } from '../src/normalize/index.js';

const raw = JSON.parse(readFileSync(ORGANIZER_BASE_PATH, 'utf8')) as OrganizerEntry[];
const base = organizerBase();
const GENERIC = 'https://smoothcomp.com/en/event/1';
const idOf = (url: string, title: string, declared?: string) => resolveOrganizer({ url, title, declared })?.entry.id;

// Base sintética: a mecânica do resolvedor sem depender da curadoria do repo.
const entry = (id: string, padroes: string[], hosts: string[] = []): OrganizerEntry => ({
  id, nome: id.toUpperCase(), tipo: 'organizador', site: `https://${id}.example.com`, hosts, padroes,
});
const toy = buildOrganizerBase([
  entry('naga', ['NAGA']),
  entry('copa-gaucha', ['Copa Gaúcha']),
  entry('grappling', ['Grappling']),
  entry('grappling-industries', ['Grappling Industries'], ['grapplingindustries']),
  entry('adcc', ['ADCC']),
]);
const toyId = (title: string, url = GENERIC) => resolveOrganizer({ url, title }, toy)?.entry.id;

describe('data/organizadores.json — invariantes da base', () => {
  it('carrega sem erro e fica no tamanho combinado', () => {
    expect(() => buildOrganizerBase(raw)).not.toThrow();
    expect(base.entries.length).toBeGreaterThanOrEqual(40);
    expect(base.entries.length).toBeLessThanOrEqual(90);
  });

  it('ids únicos e kebab; nomes únicos', () => {
    const ids = raw.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    const nomes = raw.map((e) => e.nome.toLowerCase());
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it('todo site é uma URL https', () => {
    for (const e of raw) expect(new URL(e.site).protocol, e.id).toBe('https:');
  });

  it('todo padrão é regex válida com 3+ caracteres', () => {
    for (const e of raw) {
      for (const p of e.padroes) {
        expect(p.length, `${e.id}: ${p}`).toBeGreaterThanOrEqual(3);
        expect(() => compilePattern(p), `${e.id}: ${p}`).not.toThrow();
      }
    }
  });

  it('cada host do Smoothcomp tem um dono só', () => {
    const hosts = raw.flatMap((e) => e.hosts);
    expect(new Set(hosts).size).toBe(hosts.length);
    expect(baseErrors(raw)).toEqual([]);
  });

  it('as federações oficiais estão na base como federação', () => {
    for (const id of ['ibjjf', 'cbjj', 'cbjjo', 'fjjrio', 'ajp', 'sjjif', 'nabjjf', 'fpjj']) {
      expect(base.byId.get(id)?.tipo, id).toBe('federacao');
    }
    // Jiu-Jitsu World League: uma liga (temporada + The Finals), não um órgão que sanciona.
    expect(base.byId.get('jjwl')?.tipo).toBe('liga');
    expect(base.byHost.has('smoothcomp')).toBe(false);
    // Federações com conta no Smoothcomp e linhas no feed de 2026-10-26.
    const contas = ['francejujitsu', 'sajjfederation', 'fbjjf', 'isrjjf', 'federacion-paraguaya-de-jiu-jitsu', 'ajju', 'jjkaz', 'fjj-sc', 'manitobajiujitsu', 'hfbjj', 'usag', 'sjjfnz'];
    for (const h of contas) expect(base.byHost.get(h)?.tipo, h).toBe('federacao');
    expect(raw.some((e) => /smoothcomp/i.test(e.nome))).toBe(false); // plataforma, não organizador
  });

  it('todo organizador que um adapter de federação declara resolve na base', () => {
    const declared = ['IBJJF', 'CBJJ', 'CBJJO', 'FJJRIO', 'FPJJ', 'CBJJ/FPJJ', 'AJP', 'JJWL', 'NABJJF', 'SJJIF', 'SJJCF', 'ASJJF', 'SJJJF', 'JBJJF'];
    for (const d of declared) {
      const m = resolveOrganizer({ url: 'https://example.org/x', title: 'Campeonato', declared: d });
      expect(m?.via, d).toBe('declared');
    }
  });

  it('quem tem site oficial aponta para ele, não para uma página do Smoothcomp', () => {
    // Achados em 2026-10-26: cada um destes sites linka a conta da organização no Smoothcomp ou se apresenta por ela.
    const oficiais: Record<string, string> = {
      sjjjf: 'sjjjf.org', 'bjjf-nl': 'bjjfederatie.nl', 'sport-jiu-jitsu-canada': 'www.sjjcanf.com',
      'fjj-sc': 'www.fjj-sc.com.br', 'manitoba-jiu-jitsu': 'www.manitobajiujitsu.com', 'usa-grappling': 'www.usa-grappling.com',
      'empire-grappling': 'www.empiregrapplingevents.com', 'odd-fox-events': 'oddfoxevents.co.uk', lutador: 'www.lutadoropen.com',
    };
    for (const [id, host] of Object.entries(oficiais)) expect(new URL(base.byId.get(id)!.site).hostname, id).toBe(host);
    // Página de evento como site só fica quando não há site oficial (EJO, SIO).
    const eventos = raw.filter((e) => /smoothcomp\.com\/[a-z]{2}\/event\//.test(e.site)).map((e) => e.id);
    expect(eventos.sort()).toEqual(['ejo', 'sio']);
  });

  it('o schema da entrada barra site http, padrão curto, host com maiúscula e campo a mais', () => {
    const ok = entry('x-y', ['abc'], ['xy']);
    expect(organizerEntrySchema.safeParse(ok).success).toBe(true);
    expect(organizerEntrySchema.safeParse({ ...ok, site: 'http://x.com' }).success).toBe(false);
    expect(organizerEntrySchema.safeParse({ ...ok, padroes: ['ab'] }).success).toBe(false);
    expect(organizerEntrySchema.safeParse({ ...ok, hosts: ['NAGA'] }).success).toBe(false);
    expect(organizerEntrySchema.safeParse({ ...ok, id: 'X Y' }).success).toBe(false);
    expect(organizerEntrySchema.safeParse({ ...ok, tipo: 'academia' }).success).toBe(false);
    expect(organizerEntrySchema.safeParse({ ...ok, cor: 'red' }).success).toBe(false);
    expect(organizerEntrySchema.safeParse({ ...ok, extra: 1 }).success).toBe(false);
    expect(organizerEntrySchema.safeParse({ ...ok, tituloVenceHost: true }).success).toBe(true);
    expect(organizerEntrySchema.safeParse({ ...ok, tituloVenceHost: 'sim' }).success).toBe(false);
  });

  it('baseErrors pega id repetido, host com dois donos e regex quebrada', () => {
    expect(baseErrors([entry('a', []), entry('a', [])]).join()).toMatch(/repetido/);
    expect(baseErrors([entry('a', [], ['h']), entry('b', [], ['h'])]).join()).toMatch(/host "h"/);
    expect(baseErrors([entry('a', ['(abc'])]).join()).toMatch(/inválido/);
    expect(() => buildOrganizerBase([entry('a', ['(abc'])])).toThrow(/organizadores\.json/);
  });
});

describe('resolvedor — ordem host → título → nada', () => {
  it('subdomínio do Smoothcomp na base resolve pelo host', () => {
    const m = resolveOrganizer({ url: 'https://naga.smoothcomp.com/en/event/32995', title: 'Copa X' });
    expect(m).toMatchObject({ via: 'host', entry: { id: 'naga', nome: 'NAGA' } });
    expect(idOf('https://grapplingindustries.smoothcomp.com/en/event/1', 'AMSTERDAM')).toBe('grappling-industries');
  });

  it('host vence o título', () => {
    // A conta da federação filipina hospeda um ADCC Open: quem roda é a BJJFP.
    expect(idOf('https://bjjfphilippines.smoothcomp.com/en/event/1', '2026 ADCC Philippine International Open')).toBe('bjjfp');
  });

  it('subdomínio cru vira uma entrada da base ou nada, nunca ele mesmo', () => {
    expect(resolveOrganizer({ url: 'https://ufcbjj.smoothcomp.com/en/event/1', title: 'UFC BJJ #13' })).toMatchObject({
      via: 'host', entry: { id: 'ufc-bjj', nome: 'UFC BJJ' },
    });
    expect(resolveOrganizer({ url: 'https://ibjjff.smoothcomp.com/en/event/1', title: 'Brave Kids San Diego' })).toBeNull();
    for (const sub of ['ufcbjj', 'ibjjff', 'isbjja', 'sgtperth', 'jjlg', 'francejujitsu']) {
      const m = resolveOrganizer({ url: `https://${sub}.smoothcomp.com/en/event/1`, title: 'Open' });
      if (m) expect(base.byId.get(m.entry.id)).toBe(m.entry);
      expect(m?.entry.nome).not.toBe(sub);
    }
  });

  it('subdomínio fora da base cai para o título', () => {
    expect(resolveOrganizer({ url: 'https://conta-sem-dono.smoothcomp.com/en/event/1', title: 'ADCC OPEN > Auckland' })).toMatchObject({
      via: 'title', entry: { id: 'adcc' },
    });
  });

  it('marca com tituloVenceHost citada no título vence o host da federação', () => {
    // A Ontario lista o GI de Toronto porque sanciona; quem roda é o Grappling Industries.
    expect(resolveOrganizer({ url: 'https://ontario-jiu-jitsu.smoothcomp.com/en/event/34318', title: 'Grappling Industries TORONTO' })).toMatchObject({
      via: 'title', entry: { id: 'grappling-industries' },
    });
    // Sem a flag o host continua valendo: os ADCC Opens são das próprias federações.
    expect(idOf('https://sswf.smoothcomp.com/en/event/33586', 'ADCC Sweden 13')).toBe('sswf');
    expect(idOf('https://sjjfnz.smoothcomp.com/en/event/27673', 'ADCC OPEN > Auckland')).toBe('sjjfnz');
    // Na própria conta da marca, o host.
    expect(resolveOrganizer({ url: 'https://grapplingindustries.smoothcomp.com/en/event/1', title: 'Grappling Industries AMSTERDAM' })?.via).toBe('host');
  });

  it('tituloVenceHost: a marca vence o host só quando é o melhor casamento do título', () => {
    const flagged = buildOrganizerBase([
      { ...entry('fed', [], ['fed']), tipo: 'federacao' },
      { ...entry('marca', ['Marca']), tituloVenceHost: true },
      entry('outra', ['Outra Marca Longa']),
    ]);
    const id = (title: string) => resolveOrganizer({ url: 'https://fed.smoothcomp.com/en/event/1', title }, flagged)?.entry.id;
    expect(id('Marca Toronto')).toBe('marca');
    expect(id('Outra Marca Longa Cup')).toBe('fed'); // o título nomeia a outra marca, sem a flag: fica o host
    expect(id('Open (Marca rules)')).toBe('fed');
    expect(id('Copa da Federação')).toBe('fed');
  });

  it('evento de clube na conta de uma federação fica com a federação (quem sanciona)', () => {
    expect(idOf('https://sbjjf.smoothcomp.com/en/event/35217', 'Battle of Stockholm #25')).toBe('sbjjf');
    expect(idOf('https://bjjfnl.smoothcomp.com/en/event/32254', 'VERSUS Championship 37 - Adults Gi only')).toBe('bjjf-nl');
    expect(idOf('https://usag.smoothcomp.com/en/event/35463', 'Lake Arrowhead Jiu Jitsu Open | Winter 2026')).toBe('usa-grappling');
  });

  it('host genérico (smoothcomp.com, www) vai direto ao título', () => {
    expect(smoothcompSubdomain('https://smoothcomp.com/en/event/1')).toBeNull();
    expect(smoothcompSubdomain('https://www.smoothcomp.com/en/event/1')).toBeNull();
    expect(smoothcompSubdomain('https://naga.smoothcomp.com/en/event/1')).toBe('naga');
    expect(smoothcompSubdomain('https://ibjjf.com/events/1')).toBeUndefined();
    expect(smoothcompSubdomain('não é url')).toBeUndefined();
    expect(idOf('https://www.smoothcomp.com/en/event/1', 'Grappling Industries X')).toBe('grappling-industries');
  });

  it('título: sem acento e sem caixa', () => {
    expect(toyId('COPA GAÚCHA DE JIU-JITSU - 7º Etapa')).toBe('copa-gaucha');
    expect(toyId('copa gaucha 2026')).toBe('copa-gaucha');
    expect(toyId('naga houston')).toBe('naga');
    expect(idOf(GENERIC, 'savage GRAPPLING December 6th')).toBe('savage-grappling');
  });

  it('título: borda de palavra — "Naga" não casa "Nagano"', () => {
    expect(toyId('Nagano Open 2026')).toBeUndefined();
    expect(toyId('Naganaga Cup')).toBeUndefined();
    expect(toyId('Copa Nagaland')).toBeUndefined();
    expect(toyId('2026 NAGA Fort Myers')).toBe('naga');
    expect(toyId('Open (NAGA rules) at Fort Myers')).toBeUndefined(); // regulamento, não organizador
    expect(idOf(GENERIC, 'Nagano Open 2026')).toBeUndefined();
  });

  it('título: o trecho casado mais longo vence; empate, o que vem antes', () => {
    expect(toyId('Grappling Industries Amsterdam')).toBe('grappling-industries'); // > "Grappling"
    expect(toyId('Amsterdam Grappling Open')).toBe('grappling');
    expect(toyId('NAGA x ADCC Superfight')).toBe('naga');
    expect(toyId('ADCC x NAGA Superfight')).toBe('adcc');
  });

  it('título que cita o regulamento não nomeia o organizador', () => {
    expect(idOf(GENERIC, 'CAMPEONATO NACIONAL 2026 GI&NOGI (Reglas IBJJF&ADCC)')).toBeUndefined();
    expect(idOf(GENERIC, 'Copa X - ADCC Rules')).toBeUndefined();
    expect(idOf(GENERIC, 'ADCC Belgium - Rules Seminar')).toBe('adcc');
  });

  it('título que oferece a marca como prêmio ou destino não a nomeia organizadora', () => {
    // Linha real de 2026-10-26: um GP da 6162 que dá patrocínio para o European Trials.
    expect(idOf(GENERIC, '6162 GRAND PRIX: ADCC EUROPEAN TRIALS SPONSORSHIP')).toBeUndefined();
    expect(idOf(GENERIC, 'Copa X - Patrocínio ADCC')).toBeUndefined();
    expect(idOf(GENERIC, 'Road to ADCC 2027')).toBeUndefined();
    // O ADCC que roda o próprio evento continua dele.
    expect(idOf(GENERIC, 'ADCC European Trials 2027')).toBe('adcc');
    expect(idOf(GENERIC, 'ADCC Grappling Superfights #7')).toBe('adcc');
    expect(idOf(GENERIC, 'ADCC Maldives Open 2026')).toBe('adcc');
  });

  it('título sem marca conhecida → null', () => {
    expect(resolveOrganizer({ url: GENERIC, title: 'Copa X' })).toBeNull();
    expect(resolveOrganizer({ url: GENERIC, title: '36 Chambers Invitational III' })).toBeNull();
  });

  it('calendário de federação: o declarado vence; "CBJJ/FPJJ" fica com o primeiro da base', () => {
    expect(resolveOrganizer({ url: 'https://ibjjf.com/events/1', title: 'Pan Kids', declared: 'IBJJF' })).toMatchObject({
      via: 'declared', entry: { id: 'ibjjf' },
    });
    expect(idOf('https://fpjjcompetidor.com.br/x', 'Brasileiro Infantil', 'CBJJ/FPJJ')).toBe('cbjj');
    // Título com "AJP", calendário da CBJJ: quem lista é quem organiza.
    expect(idOf('https://cbjj.com.br/events/1', 'Copa AJP', 'CBJJ')).toBe('cbjj');
    // Declarado fora da base cai para o título; nada no título → null.
    expect(idOf('https://sjjif.com/public/eventInfo/1', 'SJJBF Open', 'SJJBF')).toBeUndefined();
  });

  it('num evento do Smoothcomp o declarado não conta (só host e título)', () => {
    expect(idOf(GENERIC, 'Copa X', 'NAGA')).toBeUndefined();
    expect(idOf('https://ibjjff.smoothcomp.com/en/event/1', 'Brave Kids', 'ibjjff')).toBeUndefined();
  });
});

describe('integração — normalização e linhas preservadas', () => {
  const NOW = new Date('2026-10-25T12:00:00Z');
  const ctx = (source: string) => ({ source, scrapedAt: '2026-10-25T00:00:00.000Z', now: NOW });

  it('normalizeEvents grava organizer = nome da base e organizerId; sem casamento, os dois ausentes', () => {
    const out = normalizeEvents(
      [
        { title: 'NAGA Houston', rawDate: '2026-12-01', location: 'X', url: 'https://smoothcomp.com/en/event/9' },
        { title: 'Copa X', rawDate: '2026-12-01', location: 'X', url: 'https://ibjjff.smoothcomp.com/en/event/8' },
        { title: 'Rio Open', rawDate: '2026-12-02', location: 'X', url: 'https://ibjjf.com/events/7', organizer: 'IBJJF' },
        { title: 'Copa Y', rawDate: '2026-12-03', location: 'X', url: 'https://x.org/6', organizer: 'Liga Inventada' },
      ],
      ctx('mix'),
    );
    expect(out[0]).toMatchObject({ organizer: 'NAGA', organizerId: 'naga' });
    expect(out[1]!.organizer).toBeUndefined();
    expect(out[1]!.organizerId).toBeUndefined();
    expect(out[2]).toMatchObject({ organizer: 'IBJJF', organizerId: 'ibjjf' });
    expect(out[3]!.organizer).toBeUndefined(); // texto livre do adapter não passa
  });

  it('applyOrganizer troca o organizer antigo de uma linha preservada pelo da base', () => {
    const stale = { sourceUrl: 'https://ibjjff.smoothcomp.com/en/event/1', title: 'Brave Kids', organizer: 'ibjjff' };
    expect(applyOrganizer(stale)).toBeNull();
    expect(stale).not.toHaveProperty('organizer');
    expect(stale).not.toHaveProperty('organizerId');
    const old = { sourceUrl: 'https://jjwl.smoothcomp.com/en/event/2', title: 'X', organizer: 'Jiu Jitsu World League' };
    applyOrganizer(old);
    expect(old).toMatchObject({ organizer: 'JJWL', organizerId: 'jjwl' });
  });
});
