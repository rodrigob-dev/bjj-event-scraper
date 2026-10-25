import { describe, it, expect } from 'vitest';
import { parsePlace, titleCaseIfShouting, regionCode } from '../src/normalize/places.js';

describe('parsePlace — formatos vistos no Smoothcomp', () => {
  const cases: Array<[string, string | undefined, string | undefined, { city?: string; state?: string }]> = [
    ['Atlanta, GA', 'US', 'United States', { city: 'Atlanta', state: 'GA' }],
    ['Van Nuys, CA 91406', 'US', undefined, { city: 'Van Nuys', state: 'CA' }],
    ['MURRIETA, CA 92562', 'US', undefined, { city: 'Murrieta', state: 'CA' }],
    ['Vernon Hills, Illinois', 'US', undefined, { city: 'Vernon Hills', state: 'IL' }],
    ['Dallas Texas', 'US', undefined, { city: 'Dallas', state: 'TX' }],
    ['Los Angeles, CA ', 'US', undefined, { city: 'Los Angeles', state: 'CA' }],
    ['Chicago, IL  ', 'US', undefined, { city: 'Chicago', state: 'IL' }],
    ['New York City', 'US', undefined, { city: 'New York City' }],
    ['New York', 'US', undefined, { city: 'New York' }],
    ['Washington D.C.', 'US', undefined, { city: 'Washington D.C.' }],
    ['DFW', 'US', undefined, { city: 'DFW' }],
    ['Tijucas / SC', 'BR', 'Brazil', { city: 'Tijucas', state: 'SC' }],
    ['Florianópolis/SC', 'BR', 'Brazil', { city: 'Florianópolis', state: 'SC' }],
    ['Blumenau-SC', 'BR', 'Brazil', { city: 'Blumenau', state: 'SC' }],
    ['Patos de Minas -MG', 'BR', 'Brazil', { city: 'Patos de Minas', state: 'MG' }],
    ['FEIRA DE SANTANA - BAHIA - BRASIL', 'BR', 'Brazil', { city: 'Feira de Santana', state: 'BA' }],
    ['RECIFE - PE', 'BR', 'Brazil', { city: 'Recife', state: 'PE' }],
    ['Natal, RN', 'BR', 'Brazil', { city: 'Natal', state: 'RN' }],
    ['Uberlândia, Minas Gerais', 'BR', 'Brazil', { city: 'Uberlândia', state: 'MG' }],
    ['SÃO JOSÉ DOS CAMPOS', 'BR', 'Brazil', { city: 'São José dos Campos' }],
    ['parauapebas', 'BR', 'Brazil', { city: 'Parauapebas' }],
    ['MINAS GERAIS', 'BR', 'Brazil', { state: 'MG' }],
    ['Rio de Janeiro', 'BR', 'Brazil', { city: 'Rio de Janeiro' }],
    ['FRANCISCO BELTRÃO', 'BR', 'Brazil', { city: 'Francisco Beltrão' }],
    ['Newcastle-Upon-Tyne', 'GB', 'United Kingdom', { city: 'Newcastle-Upon-Tyne' }],
    ['London, England', 'GB', 'United Kingdom', { city: 'London' }],
    ['Brisbane, Queensland', 'AU', 'Australia', { city: 'Brisbane', state: 'QLD' }],
    ['Gold Coast, Australia', 'AU', 'Australia', { city: 'Gold Coast' }],
    ['Melbourne, VIC', 'AU', 'Australia', { city: 'Melbourne', state: 'VIC' }],
    ['sydney', 'AU', 'Australia', { city: 'Sydney' }],
    ['Mississauga, ON', 'CA', 'Canada', { city: 'Mississauga', state: 'ON' }],
    ['Amherst, Nova Scotia', 'CA', 'Canada', { city: 'Amherst', state: 'NS' }],
    ['Quebec', 'CA', 'Canada', { city: 'Quebec' }],
    ['63743 Aschaffenburg', 'DE', 'Germany', { city: 'Aschaffenburg' }],
    ['La Paz, Baja California Sur', 'MX', 'Mexico', { city: 'La Paz' }],
    ['CDMX', 'MX', 'Mexico', { city: 'CDMX' }],
    ['', 'US', undefined, {}],
  ];
  for (const [raw, cc, human, expected] of cases) {
    it(`${JSON.stringify(raw)} (${cc})`, () => {
      expect(parsePlace(raw, cc, human)).toEqual(expected);
    });
  }
});

describe('titleCaseIfShouting', () => {
  it('só mexe em caixa alta/baixa total', () => {
    expect(titleCaseIfShouting('AFOGADOS DA INGAZEIRA')).toBe('Afogados da Ingazeira');
    expect(titleCaseIfShouting('NEWCASTLE-UPON-TYNE')).toBe('Newcastle-upon-Tyne');
    expect(titleCaseIfShouting('McAllen')).toBe('McAllen');
  });
});

describe('regionCode', () => {
  it('aceita sigla e nome, por país', () => {
    expect(regionCode('sc', 'BR')).toBe('SC');
    expect(regionCode('Bahia', 'BR')).toBe('BA');
    expect(regionCode('SC', 'US')).toBe('SC');
    expect(regionCode('Bahia', 'US')).toBeUndefined();
    expect(regionCode('NSW', 'AU')).toBe('NSW');
    expect(regionCode('SC', 'PT')).toBeUndefined();
  });
});
