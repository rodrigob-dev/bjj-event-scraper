// Helpers compartilhados pelas fontes HTML: datas por extenso (EN/PT), país por
// extenso → ISO, Crawl-delay do robots.txt.
import { describe, it, expect } from 'vitest';
import { parseEnRange, parsePtRange, parseBrNumeric, monthNumber } from '../src/normalize/text-dates.js';
import { countryCodeOfName } from '../src/normalize/countries.js';
import { parseRobots } from '../src/http.js';

describe('text-dates — datas por extenso', () => {
  it('EN: um dia, intervalo no mês, intervalo entre meses, virada de ano', () => {
    expect(parseEnRange('November 07, 2026')).toEqual({ start: '2026-11-07', end: '2026-11-07' });
    expect(parseEnRange('November 7 - 8, 2026')).toEqual({ start: '2026-11-07', end: '2026-11-08' });
    expect(parseEnRange('November 30 - December 1, 2026')).toEqual({ start: '2026-11-30', end: '2026-12-01' });
    expect(parseEnRange('December 31, 2026 - January 2, 2027')).toEqual({ start: '2026-12-31', end: '2027-01-02' });
    expect(parseEnRange('November  7th, 2026')).toEqual({ start: '2026-11-07', end: '2026-11-07' });
    expect(parseEnRange('Nov 4th, 2026')?.start).toBe('2026-11-04');
  });

  it('PT: dia da semana, "05 e 06 de dezembro 2026", dois meses, ano da página', () => {
    expect(parsePtRange('sábado, 24 de outubro de 2026')).toEqual({ start: '2026-10-24', end: '2026-10-24' });
    expect(parsePtRange('sábado e domingo, 05 e 06 de dezembro 2026')).toEqual({ start: '2026-12-05', end: '2026-12-06' });
    expect(parsePtRange('31 de outubro e 01 de novembro de 2026')).toEqual({ start: '2026-10-31', end: '2026-11-01' });
    expect(parsePtRange('23 de Abril a 03 de Maio', 2026)).toEqual({ start: '2026-04-23', end: '2026-05-03' });
    expect(parsePtRange('14 - 15 de Março', 2026)).toEqual({ start: '2026-03-14', end: '2026-03-15' });
    expect(parsePtRange('31 de dezembro e 1 de janeiro de 2027')).toEqual({ start: '2026-12-31', end: '2027-01-01' });
  });

  it('rejeita sem mês, sem ano ou dia inexistente', () => {
    expect(parsePtRange('14 - 15 de Março')).toBeUndefined(); // sem ano e sem default
    expect(parseEnRange('Coming soon 2026')).toBeUndefined();
    expect(parseEnRange('February 30, 2026')).toBeUndefined();
    expect(parseBrNumeric('07/11/2026')).toBe('2026-11-07');
    expect(parseBrNumeric('31/02/2026')).toBeUndefined();
    expect(monthNumber('Outubro')).toBe(10);
    expect(monthNumber('sept')).toBe(9);
    expect(monthNumber('sábado')).toBeUndefined();
  });
});

describe('countries + robots', () => {
  it('nome por extenso → ISO; desconhecido fica sem país', () => {
    expect(countryCodeOfName('United States of America')).toBe('US');
    expect(countryCodeOfName('Guam')).toBe('GU');
    expect(countryCodeOfName('Japan')).toBe('JP');
    expect(countryCodeOfName('Atlantis')).toBeUndefined();
    expect(countryCodeOfName(undefined)).toBeUndefined();
  });

  it('Crawl-delay do bloco * entra (com teto); de outro agente não', () => {
    expect(parseRobots('User-agent: *\nDisallow: /order/\nCrawl-delay: 10\n')).toEqual({ disallow: ['/order/'], crawlDelayMs: 10_000 });
    expect(parseRobots('User-agent: SemrushBot\nCrawl-delay: 10\n').crawlDelayMs).toBeUndefined();
    expect(parseRobots('User-agent: *\nCrawl-delay: 99999\n').crawlDelayMs).toBe(60_000);
    expect(parseRobots('User-agent: *\nCrawl-delay: abc\n').crawlDelayMs).toBeUndefined();
  });
});
