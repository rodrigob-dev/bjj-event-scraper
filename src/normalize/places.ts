// Limpeza do campo de cidade livre das fontes → { city, state }.
// O Smoothcomp deixa o organizador digitar o que quiser: "Van Nuys, CA 91406",
// "FEIRA DE SANTANA - BAHIA - BRASIL", "Tijucas / SC", "Dallas Texas",
// "63743 Aschaffenburg", "London, England". Aqui só se separa o que dá para
// provar que é região (tabela por país); o resto fica como veio — "Newcastle-
// Upon-Tyne" não vira cidade "Newcastle-Upon" com estado "Tyne".

// Nome por extenso → código. Só os países onde o contrato aceita `state`.
const BR: Record<string, string> = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE',
  'distrito federal': 'DF', 'espirito santo': 'ES', goias: 'GO', maranhao: 'MA',
  'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', para: 'PA',
  paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR',
  'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
};
const US: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
  connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS',
  kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA',
  michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT',
  nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM',
  'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA',
  washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'puerto rico': 'PR',
};
const CA: Record<string, string> = {
  alberta: 'AB', 'british columbia': 'BC', manitoba: 'MB', 'new brunswick': 'NB',
  'newfoundland and labrador': 'NL', 'nova scotia': 'NS', ontario: 'ON',
  'prince edward island': 'PE', quebec: 'QC', saskatchewan: 'SK', 'northwest territories': 'NT',
  nunavut: 'NU', yukon: 'YT',
};
const AU: Record<string, string> = {
  'new south wales': 'NSW', victoria: 'VIC', queensland: 'QLD', 'south australia': 'SA',
  'western australia': 'WA', tasmania: 'TAS', 'australian capital territory': 'ACT',
  'northern territory': 'NT',
};
const REGIONS: Record<string, Record<string, string>> = { BR, US, CA, AU };
const CODES: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(REGIONS).map(([cc, byName]) => [cc, new Set(Object.values(byName))]),
);

// Nomes de região que também são cidade grande: sozinhos no campo, são a cidade.
const ALSO_A_CITY = new Set(['washington', 'new york', 'quebec', 'victoria', 'rio de janeiro', 'sao paulo']);

// Palavras de país que o organizador cola no fim ("London, England", "X - BRASIL").
const COUNTRY_WORDS = new Set([
  'brasil', 'brazil', 'usa', 'u.s.a.', 'us', 'united states', 'united states of america',
  'england', 'scotland', 'wales', 'northern ireland', 'uk', 'united kingdom', 'great britain',
  'australia', 'canada', 'portugal', 'mexico', 'méxico', 'ireland', 'deutschland', 'germany',
  'france', 'españa', 'spain', 'italia', 'italy', 'new zealand', 'nz',
]);

// Cidade brasileira → UF, p/ quando a fonte manda só a cidade ("Belém, Brazil").
// Capitais + polos de campeonato + tudo que IBJJF/CBJJ/Smoothcomp já listaram.
// Chave normalizada (sem acento, minúscula). Não precisa ser completa: cidade
// fora daqui continua BR, só sem UF.
export const UF_BY_CITY: Record<string, string> = {
  // capitais
  'rio branco': 'AC', maceio: 'AL', macapa: 'AP', manaus: 'AM', salvador: 'BA', fortaleza: 'CE',
  brasilia: 'DF', vitoria: 'ES', goiania: 'GO', 'sao luis': 'MA', cuiaba: 'MT', 'campo grande': 'MS',
  'belo horizonte': 'MG', belem: 'PA', 'joao pessoa': 'PB', curitiba: 'PR', recife: 'PE', teresina: 'PI',
  'rio de janeiro': 'RJ', natal: 'RN', 'porto alegre': 'RS', 'porto velho': 'RO', 'boa vista': 'RR',
  florianopolis: 'SC', 'sao paulo': 'SP', aracaju: 'SE', palmas: 'TO',
  // polos de campeonato
  barueri: 'SP', campinas: 'SP', santos: 'SP', guarulhos: 'SP', osasco: 'SP', 'santo andre': 'SP',
  'sao bernardo do campo': 'SP', 'sao jose dos campos': 'SP', sorocaba: 'SP', 'ribeirao preto': 'SP',
  niteroi: 'RJ', petropolis: 'RJ', 'duque de caxias': 'RJ', 'nova iguacu': 'RJ', teresopolis: 'RJ',
  'juiz de fora': 'MG', uberlandia: 'MG', contagem: 'MG', 'patos de minas': 'MG',
  londrina: 'PR', maringa: 'PR', 'francisco beltrao': 'PR',
  joinville: 'SC', blumenau: 'SC', chapeco: 'SC', itapema: 'SC', tijucas: 'SC', itajai: 'SC',
  'sao jose': 'SC', 'balneario camboriu': 'SC',
  'caxias do sul': 'RS', pelotas: 'RS', 'santa maria': 'RS', cachoeirinha: 'RS', 'julio de castilhos': 'RS',
  'feira de santana': 'BA', 'vitoria da conquista': 'BA', 'madre de deus': 'BA', 'lauro de freitas': 'BA',
  'amelia rodrigues': 'BA',
  'afogados da ingazeira': 'PE', ouricuri: 'PE', garanhuns: 'PE', caruaru: 'PE', olinda: 'PE',
  'jaboatao dos guararapes': 'PE', 'campina grande': 'PB', 'vila velha': 'ES', anapolis: 'GO',
  taguatinga: 'DF', ceilandia: 'DF', 'cruzeiro novo': 'DF', parauapebas: 'PA',
};

/** UF de uma cidade brasileira conhecida, ou undefined. */
export function ufOfBrazilianCity(city: string): string | undefined {
  return UF_BY_CITY[norm(city)];
}

export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Código de região de um trecho ("SC", "Bahia", "New South Wales") no país dado. */
export function regionCode(token: string, countryCode?: string): string | undefined {
  if (!countryCode) return undefined;
  const byName = REGIONS[countryCode];
  if (!byName) return undefined;
  const t = token.trim().replace(/\.$/, '');
  if (/^[A-Za-z]{2,3}$/.test(t) && CODES[countryCode]!.has(t.toUpperCase())) return t.toUpperCase();
  return byName[norm(t)];
}

function isCountryWord(token: string, countryHuman?: string): boolean {
  const t = norm(token).replace(/\.$/, '');
  return COUNTRY_WORDS.has(t) || (!!countryHuman && t === norm(countryHuman));
}

// Trecho que é endereço de rua, não cidade: começa com número ("8 Lambert Rd",
// "205 Wolf street") ou traz "Address:".
const STREET_RE = /^\d+\s+\S|\baddress:/i;

const LOWER_PARTICLES = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'di', 'del', 'della', 'la', 'le', 'les', 'y', 'of',
  'upon', 'on', 'the', 'am', 'an', 'der', 'von', 'van', 'du', 'des', 'sur', 'en', 'el', 'los', 'las',
]);

/** "AFOGADOS DA INGAZEIRA" / "parauapebas" → "Afogados da Ingazeira" / "Parauapebas".
 * Só mexe em texto todo gritado ou todo minúsculo; grafia mista é do organizador. */
export function titleCaseIfShouting(s: string): string {
  const upper = s.toUpperCase();
  const lower = s.toLowerCase();
  if (s !== upper && s !== lower) return s;
  if (s === upper && /^[A-Z]{2,4}$/.test(s)) return s; // sigla: DFW, CDMX
  return lower
    .split(/(\s+|-)/)
    .map((w, i) => {
      if (!w || /^(\s+|-)$/.test(w)) return w;
      if (i > 0 && LOWER_PARTICLES.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join('');
}

export interface PlaceParts {
  city?: string;
  state?: string;
}

/**
 * Separa cidade e região do campo livre de localização de um evento.
 * @param raw texto como veio da fonte
 * @param countryCode ISO alpha-2 da fonte — decide qual tabela de regiões vale
 * @param countryHuman nome do país como a fonte escreve ("Brazil"), p/ tirar do fim
 */
export function parsePlace(raw: string, countryCode?: string, countryHuman?: string): PlaceParts {
  let s = raw.replace(/\s+/g, ' ').trim();
  if (!s) return {};
  s = s.replace(/^(?:[A-Z]{1,2}-)?\d{4,6}\s+/, ''); // CEP/PLZ na frente: "63743 Aschaffenburg", "A-2344 Maria Enzersdorf"

  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  let state: string | undefined;

  while (parts.length > 1 && isCountryWord(parts[parts.length - 1]!, countryHuman)) parts.pop();
  // Endereço de rua no lugar da cidade ("8 Lambert Rd, Indooroopilly",
  // "Deakin University … Address: 221 Burwood Hwy, Burwood VIC 3125"): a
  // cidade é o trecho seguinte; sozinho, um endereço não é cidade.
  while (parts.length && STREET_RE.test(parts[0]!)) parts.shift();
  if (parts.length === 0) return {};

  // CEP/ZIP no fim do último trecho: "CA 91406", "NY - 11550", "88332-055", "VIC 3125"
  parts[parts.length - 1] = parts[parts.length - 1]!
    .replace(/\s*-?\s*\d{4,5}(-\d{3,4})?$/, '')
    .trim();

  if (parts.length >= 2) {
    const code = regionCode(parts[parts.length - 1]!, countryCode);
    if (code) {
      state = code;
      parts.pop();
    }
  }

  // No Smoothcomp o 1º trecho é a cidade ("Atlanta, GA"); o que sobrar depois é
  // bairro/região sem tabela ("La Paz, Baja California Sur") e fica de fora.
  let city = parts[0]!;

  // UF grudada: "Blumenau-SC", "Tijucas / SC", "FEIRA DE SANTANA - BAHIA - BRASIL".
  // Só corta se o pedaço final for região ou país de verdade.
  for (;;) {
    const m = city.match(/^(.*\S)\s*[/-]\s*([^/-]+)$/);
    if (!m) break;
    const tail = m[2]!.trim();
    if (isCountryWord(tail, countryHuman)) {
      city = m[1]!;
      continue;
    }
    const code = regionCode(tail, countryCode);
    if (!code) break;
    state ??= code;
    city = m[1]!;
  }

  // Sem vírgula: "Dallas Texas", "NEW YORK NY". Nome por extenso (maior primeiro)
  // ou sigla maiúscula, sempre com cidade sobrando na frente.
  const byName = countryCode ? REGIONS[countryCode] : undefined;
  if (byName) {
    const n = norm(city);
    const names = Object.keys(byName).sort((a, b) => b.length - a.length);
    const hit = names.find((name) => n.length > name.length + 1 && n.endsWith(' ' + name));
    if (hit) {
      state ??= byName[hit];
      city = city.slice(0, city.length - hit.length).trim();
    } else {
      const m = city.match(/^(.+\S)\s+([A-Z]{2,3})$/);
      if (m && CODES[countryCode!]!.has(m[2]!)) {
        state ??= m[2];
        city = m[1]!;
      }
    }
  }

  city = city
    .replace(/\s*\(\d+\)$/, '') // "Toulouse (31)": departamento francês
    .replace(/\s+\d{1,2}$/, '') // "Dublin 15": distrito postal
    .replace(/\s+/g, ' ')
    .trim();
  city = titleCaseIfShouting(city);

  // Só a região, sem cidade ("MINAS GERAIS", "Yorkshire" não; "Quebec" é cidade).
  if (city && !ALSO_A_CITY.has(norm(city))) {
    const onlyRegion = regionCode(city, countryCode);
    if (onlyRegion) return { state: state ?? onlyRegion };
  }

  return { ...(city ? { city } : {}), ...(state ? { state } : {}) };
}
