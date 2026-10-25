// Cidade do calendário IBJJF/CBJJ → país (ISO alpha-2), região e nome canônico.
// A API só manda `city` e `region` (continente); o país vem daqui — e só daqui:
// cidade fora da tabela fica SEM countryCode (o contrato proíbe chute). A lista
// nasce do PAIS_BY_CITY/UF_BY_CITY do sensei-web mais tudo que o calendário
// listou em 2024–2026. Chave = cidade normalizada (sem acento, minúscula);
// nomes ambíguos levam o continente: "birmingham|europe" vs "birmingham".

export type Place = { cc: string; state?: string; name?: string };

type Row = [cc: string, state?: string, name?: string];

const BR: Record<string, string> = {
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
// Grafias que o CMS da federação usa e não bate com a tabela.
const BR_ALIASES: Record<string, string> = {
  'balneario camburiu': 'Balneário Camboriú',
  'me. de deus': 'Madre de Deus',
  curitba: 'Curitiba',
};

const US: Record<string, string | null> = {
  'las vegas': 'NV', 'fort lauderdale': 'FL', 'ft. lauderdale': 'FL', waco: 'TX', dallas: 'TX',
  'college park': 'MD', 'kansas city': 'MO', secaucus: 'NJ', 'san antonio': 'TX', 'costa mesa': 'CA',
  boston: 'MA', houston: 'TX', sacramento: 'CA', franklin: 'TN', 'long beach': 'CA', anaheim: 'CA',
  irvine: 'CA', orlando: 'FL', kissimmee: 'FL', miami: 'FL', tampa: 'FL', atlanta: 'GA', chicago: 'IL',
  'new york': 'NY', hempstead: 'NY', 'los angeles': 'CA', 'san diego': 'CA', 'san jose': 'CA',
  seattle: 'WA', denver: 'CO', phoenix: 'AZ', austin: 'TX', charlotte: 'NC', philadelphia: 'PA',
  washington: 'DC', columbus: 'OH', 'salt lake city': 'UT', nashville: 'TN', raleigh: 'NC',
  memphis: 'TN', 'round rock': 'TX', 'jersey city': 'NJ', newark: 'NJ', brooklyn: 'NY',
  fullerton: 'CA', 'north richland hills': 'TX', 'bedford park': 'IL', indianapolis: 'IN', mesa: 'AZ',
  portland: 'OR', chesterfield: 'MO', murfreesboro: 'TN', 'wesley chapel': 'FL', albuquerque: 'NM',
  'dearborn heights': 'MI', kenner: 'LA', katy: 'TX', wahiawa: 'HI', bethany: 'OK', 'baton rouge': 'LA',
  cleveland: 'OH', 'north charleston': 'SC', puyallup: 'WA', 'santa cruz': 'CA', duncanville: 'TX',
  birmingham: 'AL', 'fort worth': 'TX', 'san francisco': 'CA', honolulu: 'HI', minneapolis: 'MN',
  'st. louis': 'MO', detroit: 'MI', pittsburgh: 'PA', baltimore: 'MD', 'oklahoma city': 'OK',
  'new orleans': 'LA', providence: 'RI', hartford: 'CT', 'virginia beach': 'VA', tucson: 'AZ',
  'el paso': 'TX', boise: 'ID', reno: 'NV', tacoma: 'WA', oakland: 'CA', 'santa clara': 'CA',
  pasadena: 'CA', carson: 'CA', torrance: 'CA', 'daly city': 'CA', 'santa ana': 'CA', pomona: 'CA',
  // sem estado: há mais de uma cidade com esse nome em circuito da IBJJF
  concord: null, fredericksburg: null,
};
const US_ALIASES: Record<string, string> = { 'ft. lauderdale': 'Fort Lauderdale' };

const WORLD: Record<string, Row> = {
  // Canadá
  toronto: ['CA', 'ON'], scarborough: ['CA', 'ON'], montreal: ['CA', 'QC'], vancouver: ['CA', 'BC'],
  calgary: ['CA', 'AB'], mississauga: ['CA', 'ON'], ottawa: ['CA', 'ON'], edmonton: ['CA', 'AB'],
  // México
  'mexico city': ['MX'], 'cidade do mexico': ['MX', undefined, 'Mexico City'], 'ciudad de mexico': ['MX', undefined, 'Mexico City'],
  monterrey: ['MX'], guadalajara: ['MX'], cancun: ['MX'],
  // América do Sul fora do Brasil
  santiago: ['CL'], 'buenos aires': ['AR'], lima: ['PE'], bogota: ['CO'], montevideo: ['UY'],
  asuncion: ['PY'], quito: ['EC'], caracas: ['VE'],
  // Europa
  lisbon: ['PT'], lisboa: ['PT', undefined, 'Lisbon'], odivelas: ['PT'], porto: ['PT'], portimao: ['PT'],
  'lido di ostia': ['IT'], roma: ['IT', undefined, 'Rome'], rome: ['IT'], torino: ['IT', undefined, 'Turin'],
  turin: ['IT'], milano: ['IT', undefined, 'Milan'], milan: ['IT'], 'lido di jesolo': ['IT'],
  paris: ['FR'], dublin: ['IE'], london: ['GB'], manchester: ['GB'], edinburgh: ['GB'], glasgow: ['GB'],
  madrid: ['ES'], barcelona: ['ES'], berlin: ['DE'], munich: ['DE'], amsterdam: ['NL'],
  zurich: ['CH'], 'petit-lancy': ['CH'], vernier: ['CH'], brussels: ['BE'], vienna: ['AT'],
  prague: ['CZ'], warsaw: ['PL'], stockholm: ['SE'], oslo: ['NO'], copenhagen: ['DK'], helsinki: ['FI'],
  athens: ['GR'],
  // Ásia
  nagoya: ['JP'], tokyo: ['JP'], osaka: ['JP'], takasaki: ['JP'], chiba: ['JP'], seoul: ['KR'],
  suwon: ['KR'], 'abu dhabi': ['AE'], dubai: ['AE'], cyberjaya: ['MY'], 'kuala lumpur': ['MY'],
  singapore: ['SG'], bangkok: ['TH'], manila: ['PH'], 'hong kong': ['HK'], doha: ['QA'],
  riyadh: ['SA'], jeddah: ['SA'],
  // Oceania
  sydney: ['AU', 'NSW'], brisbane: ['AU', 'QLD'], perth: ['AU', 'WA'], adelaide: ['AU', 'SA'],
  'gold coast': ['AU', 'QLD'], canberra: ['AU', 'ACT'], auckland: ['NZ'], wellington: ['NZ'],
  // Ambíguas: o continente decide
  'melbourne|oceania': ['AU', 'VIC'], 'melbourne|north america': ['US', 'FL'],
  'birmingham|europe': ['GB'], 'chesterfield|europe': ['GB'], 'vitoria|europe': ['ES', undefined, 'Vitoria-Gasteiz'],
  'santa maria|north america': ['US', 'CA'], 'santa cruz|south america': ['BO'],
  'san jose|north america': ['US', 'CA'],
};

const TABLE: Record<string, Place> = {};
for (const [k, state] of Object.entries(BR)) TABLE[k] = { cc: 'BR', state };
for (const [k, name] of Object.entries(BR_ALIASES)) TABLE[k] = { cc: 'BR', state: BR[normKey(name)], name };
for (const [k, state] of Object.entries(US)) TABLE[k] = { cc: 'US', ...(state ? { state } : {}), ...(US_ALIASES[k] ? { name: US_ALIASES[k] } : {}) };
for (const [k, [cc, state, name]] of Object.entries(WORLD)) {
  TABLE[k] = { cc, ...(state ? { state } : {}), ...(name ? { name } : {}) };
}

// Continente da API ("region") → país. Só desempata homônimos e avisa quando
// contradiz a tabela: o campo é ruidoso no CMS (Sacramento já veio como "South
// America", Fortaleza como "North America"), então a tabela — curada para as
// strings exatas do calendário — vence. Um "Vitória" na Europa tem entrada própria.
const CONTINENT_OF: Record<string, string> = {
  BR: 'south america', AR: 'south america', CL: 'south america', PE: 'south america', CO: 'south america',
  UY: 'south america', PY: 'south america', EC: 'south america', VE: 'south america', BO: 'south america',
  US: 'north america', CA: 'north america', MX: 'north america', CR: 'north america',
  PT: 'europe', ES: 'europe', FR: 'europe', IT: 'europe', DE: 'europe', GB: 'europe', IE: 'europe',
  NL: 'europe', CH: 'europe', BE: 'europe', AT: 'europe', CZ: 'europe', PL: 'europe', SE: 'europe',
  NO: 'europe', DK: 'europe', FI: 'europe', GR: 'europe',
  JP: 'asia', KR: 'asia', AE: 'asia', MY: 'asia', SG: 'asia', TH: 'asia', PH: 'asia', HK: 'asia',
  QA: 'asia', SA: 'asia',
  AU: 'oceania', NZ: 'oceania',
};

export function normKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[,;]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Curitiba Summer" / "Round Rock," / "Hempstead  " → "Curitiba" / "Round Rock" / "Hempstead". */
export function cleanIbjjfCity(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/[,;.\s]+$/g, '')
    .replace(/\s+(summer|fall|winter|spring|autumn)$/i, '') // estação vazada do nome do evento
    .trim();
}

/**
 * País/região/nome canônico de uma cidade do calendário.
 * @param city texto da API (já limpo ou não)
 * @param region continente da API ("North America"); desempata homônimos
 */
export function placeOfIbjjfCity(city: string, region?: string): Place | undefined {
  const key = normKey(cleanIbjjfCity(city));
  const reg = region ? normKey(region) : '';
  const hit = (reg && TABLE[`${key}|${reg}`]) || TABLE[key];
  if (!hit) return undefined;
  if (reg && CONTINENT_OF[hit.cc] && CONTINENT_OF[hit.cc] !== reg) {
    console.warn(`[ibjjf] região "${region}" contradiz a tabela para "${city}" (${hit.cc}); mantendo a tabela`);
  }
  return hit;
}
