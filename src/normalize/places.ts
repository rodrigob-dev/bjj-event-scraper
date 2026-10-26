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
  // circuito AJP no Brasil
  gramado: 'RS', 'novo hamburgo': 'RS', canoas: 'RS', 'sao goncalo': 'RJ', macae: 'RJ', cabo: 'PE',
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

const NAMES_BY_CODE: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(REGIONS).map(([cc, byName]) => [cc, Object.fromEntries(Object.entries(byName).map(([name, code]) => [code, name]))]),
);

/** "NV" + "US" → "Nevada"; "SP" + "BR" → "Sao Paulo" (sem acento, como a tabela). Sem tabela → undefined. */
export function regionName(code: string, countryCode: string): string | undefined {
  const name = NAMES_BY_CODE[countryCode]?.[code.toUpperCase()];
  return name ? name.replace(/\b\w/g, (c) => c.toUpperCase()) : undefined;
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

// Coordenadas de cidade (centro, WGS84) p/ as fontes que só dizem a cidade:
// IBJJF/CBJJ/JJWL/SJJIF/CBJJO/FJJRIO/FPJJ/NABJJF e Smoothcomp sem location_lat.
// Chave = placeKey (cidade normalizada | região | país). Entradas resolvidas
// pelo Nominatim (OpenStreetMap) na coleta de 2026-10-25 e conferidas à mão
// (seis vieram como região/POI e levaram o centro da cidade);
// cidade nova cai no cache data/geocode-cache.json (ver src/normalize/geocode.ts).
export const COORDS_BY_PLACE: Record<string, [lat: number, lng: number]> = {
  // AO
  'luanda||AO': [-8.8273, 13.244], // Luanda, Municipality of Luanda, Angola
  // AT
  'vienna||AT': [48.2084, 16.3725], // Vienna, Austria
  // AU
  'indooroopilly||AU': [-27.5066, 152.9823], // Indooroopilly, Brisbane, Australia
  'woolgoolga||AU': [-30.1108, 153.2], // Woolgoolga, New South Wales, Australia
  // BE
  'brussels||BE': [50.8467, 4.3525], // Brussels, Brussels-Capital, Belgium
  // BH
  'muharraq||BH': [26.2466, 50.6164], // Muharraq, Muharraq Governorate, Bahrain
  'tubli||BH': [26.1672, 50.5917], // Tubli Bay, Manama, Bahrain
  // BR
  'balneario camboriu|SC|BR': [-27.0075, -48.6139], // Balneário Camboriú, Santa Catarina, Brazil
  'barueri|SP|BR': [-23.5112, -46.8765], // Barueri, São Paulo, Brazil
  'cruzeiro novo|DF|BR': [-15.7961, -47.9392], // Cruzeiro Novo, Cruzeiro, Brazil
  'indaiatuba|SP|BR': [-23.0908, -47.2181], // Indaiatuba, São Paulo, Brazil
  'madre de deus|BA|BR': [-12.7425, -38.6153], // Madre de Deus, Bahia, Brazil
  'recife|PE|BR': [-8.0585, -34.8848], // Recife, Pernambuco, Brazil
  'rio de janeiro|RJ|BR': [-22.9111, -43.2095], // Rio de Janeiro
  'sao paulo|SP|BR': [-23.5507, -46.6334], // São Paulo
  // CA
  'aurora|ON|CA': [43.9997, -79.4675], // Aurora, York Region, Canada
  'regina||CA': [50.448, -104.6159], // Regina, Saskatchewan, Canada
  'truro|NS|CA': [45.3657, -63.2865], // Truro, Town of Truro, Canada
  // CH
  'zurich||CH': [47.3744, 8.541], // Zurich, District Zurich, Switzerland
  // CN
  'guangzhou||CN': [23.1288, 113.259], // Guangzhou City, Guangdong, China
  'jiaxing city||CN': [30.7522, 120.755], // Jiaxing, Zhejiang (Nominatim devolveu um POI 28 km ao sul)
  'shenyang city||CN': [41.8026, 123.4279], // Shenyang City, Liaoning, China
  'tongzhou district||CN': [39.9069, 116.6517], // Tongzhou District, Beijing, China
  // CR
  'barreal de heredia||CR': [9.9764, -84.1424], // Correos de Costa Rica, Vía 106, Costa Rica
  'san jose||CR': [9.9327, -84.0797], // San José, San Jose Province, Costa Rica
  // DK
  'copenhagen||DK': [55.6867, 12.5701], // Copenhagen, Copenhagen Municipality, Denmark
  'kolding||DK': [55.4895, 9.4791], // Kolding, Kolding Municipality, Denmark
  // EC
  'chone||EC': [-0.6975, -80.095], // Chone, Manabí (Nominatim devolveu o cantão)
  // ES
  'arganda del rey||ES': [40.3008, -3.4382], // Arganda del Rey, Community of Madrid, Spain
  'zaragoza||ES': [41.6916, -0.9101], // Zaragoza, Aragon, Spain
  // FR
  'paris||FR': [48.8535, 2.3484], // Paris, Ile-de-France, France
  // GB
  'high wycombe||GB': [51.6317, -0.756], // High Wycombe, Buckinghamshire, United Kingdom
  'london||GB': [51.5074, -0.1278], // Greater London, England, United Kingdom
  // GU
  'guam||GU': [13.4443, 144.7937], // Guam (ilha; o Nominatim não achou "Guam, Guam")
  // IE
  'blanchardstown||IE': [53.3845, -6.3829], // Blanchardstown, Fingal, Ireland
  'dublin||IE': [53.3494, -6.2606], // Dublin, County Dublin, Ireland
  // IT
  'lido di ostia||IT': [41.7318, 12.278], // Lido di Ostia, Rome, Italy
  'occhiobello||IT': [44.9194, 11.602], // Occhiobello, Rovigo, Italy
  // JP
  'handa-shi||JP': [34.8938, 136.937], // Handa, Aichi Prefecture, Japan
  'hekinan||JP': [34.865, 136.9845], // Hekinan, Aichi Prefecture, Japan
  'iwakuni||JP': [34.1665, 132.2191], // Iwakuni, Yamaguchi Prefecture, Japan
  'nagoya||JP': [35.1851, 136.8998], // Nagoya, Aichi Prefecture, Japan
  'takaoka-shi||JP': [36.7362, 137.0187], // Takaoka, Toyama Prefecture, Japan
  '沖縄市||JP': [26.3344, 127.8057], // Okinawa, Okinawa Prefecture, Japan
  '河東郡音更町雄飛が丘||JP': [42.9923, 143.194], // 音更町総合体育館　サンドームおとふけ, 雄飛が丘通, Japan
  '渋谷区||JP': [35.6637, 139.6977], // Shibuya, Tokyo, Japan
  // KZ
  'aktau||KZ': [43.6353, 51.1682], // Aktau, Ақтау қалалық әкімдігі, Kazakhstan
  'aqtobe||KZ': [50.2837, 57.2298], // Aktobe, Almaty District, Kazakhstan
  'atyrau||KZ': [47.1167, 51.8833], // Atyrau (Nominatim devolveu a região, 100 km fora)
  'talgar||KZ': [43.3027, 77.2395], // Talgar, Talgar District, Kazakhstan
  // MY
  'kuala lumpur||MY': [3.1517, 101.6942], // Kuala Lumpur, Malaysia
  // NO
  'sande i vestfold||NO': [59.5873, 10.2075], // Sande, Holmestrand, Norway
  'trondheim||NO': [63.4304, 10.3952], // Trondheim, Trøndelag, Norway
  // NZ
  'tauranga||NZ': [-37.683, 176.1681], // Tauranga, Tauranga City, New Zealand
  // PE
  'lima||PE': [-12.046, -77.0306], // Lima, Province of Lima, Peru
  // PH
  'cebu||PH': [10.3157, 123.8854], // Cebu City (Nominatim devolveu a província)
  'quezon city||PH': [14.6511, 121.0486], // Quezon City, Eastern Manila District, Philippines
  // PT
  'arraiolos||PT': [38.7227, -7.9853], // Arraiolos, Évora, Portugal
  'leiria||PT': [39.7438, -8.8071], // Leiria, Portugal
  'machico||PT': [32.7229, -16.7659], // Machico, Madeira, Portugal
  'odivelas||PT': [38.7904, -9.1793], // Odivelas, Lisbon, Portugal
  // SE
  'molndal||SE': [57.6565, 12.0153], // Mölndal, Mölndals kommun, Sweden
  // SG
  'singapore||SG': [1.2899, 103.8519], // Singapore
  // TH
  'bangkok||TH': [13.7525, 100.4935], // Bangkok, Thailand
  'phuket||TH': [7.8804, 98.3923], // Phuket town (Nominatim devolveu a província)
  // UA
  'mykolayiv||UA': [46.975, 31.9946], // Mykolaiv (Nominatim devolveu uma rua)
  'киів||UA': [50.45, 30.5241], // Kyiv, Ukraine
  // US
  'auburn|AL|US': [32.6099, -85.4808], // Auburn, Lee County, United States
  'boise|ID|US': [43.6166, -116.2009], // Boise, Ada County, United States
  'boston|MA|US': [42.3588, -71.0578], // Boston, Suffolk County, United States
  'college park|GA|US': [33.6534, -84.4494], // College Park, Fulton County, United States
  'college park|MD|US': [38.9807, -76.9369], // College Park, Prince George's County, United States
  'coral springs|FL|US': [26.2712, -80.2706], // Coral Springs, Broward County, United States
  'costa mesa|CA|US': [33.6633, -117.9033], // Costa Mesa, Orange County, United States
  'dallas|TX|US': [32.7763, -96.7969], // Dallas, Dallas County, United States
  'del mar|CA|US': [32.9595, -117.2653], // Del Mar, San Diego County, United States
  'durham|NC|US': [35.9967, -78.9018], // Durham, Durham County, United States
  'franklin|TN|US': [35.9252, -86.8689], // Franklin, Williamson County, United States
  'frisco|TX|US': [33.1506, -96.8238], // Frisco, Collin County, United States
  'jacksonville|FL|US': [30.3262, -81.6579], // Jacksonville, Duval County, United States
  'kansas city|MO|US': [39.1001, -94.5781], // Kansas City, Jackson County, United States
  'kissimmee|FL|US': [28.2919, -81.4076], // Kissimmee, Osceola County, United States
  'knoxville|TN|US': [35.9604, -83.921], // Knoxville, Knox County, United States
  'lakeland|FL|US': [28.0395, -81.9498], // Lakeland, Polk County, United States
  'las vegas|NV|US': [36.1673, -115.1485], // Las Vegas, Nevada
  'long beach|CA|US': [33.769, -118.1916], // Long Beach, Los Angeles County, United States
  'los angeles|CA|US': [34.0537, -118.2428], // Los Angeles, Los Angeles County, United States
  'memphis|TN|US': [35.146, -90.0518], // Memphis, Shelby County, United States
  'nashville|TN|US': [36.1623, -86.7743], // Nashville, Davidson County, United States
  'norco||US': [33.9323, -117.5509], // Norco, Riverside County, United States
  'norwalk|CA|US': [33.9093, -118.0849], // Norwalk, Los Angeles County, United States
  'oak lawn|IL|US': [41.7109, -87.7581], // Oak Lawn, Worth Township, United States
  'raymore|MO|US': [38.8101, -94.4677], // Raymore, Cass County, United States
  'rosenberg|TX|US': [29.558, -95.8068], // Rosenberg, Fort Bend County, United States
  'round rock|TX|US': [30.5086, -97.6788], // Round Rock, Williamson County, United States
  'sacramento||US': [38.5811, -121.4939], // Sacramento, Sacramento County, United States
  'salt lake city||US': [40.7596, -111.8868], // Salt Lake City, Salt Lake County, United States
  'san antonio|TX|US': [29.4246, -98.4951], // San Antonio, Bexar County, United States
  'san diego|CA|US': [32.7157, -117.1638], // San Diego, San Diego County, United States
  'san jose|CA|US': [37.3362, -121.8906], // San Jose, Santa Clara County, United States
  'secaucus|NJ|US': [40.7899, -74.0567], // Secaucus, Hudson County, United States
  'sioux falls|SD|US': [43.5476, -96.7294], // Sioux Falls, Sioux Falls Township, United States
  'stockton|CA|US': [37.9577, -121.2908], // Stockton, San Joaquin County, United States
  'tempe|AZ|US': [33.4255, -111.94], // Tempe, Maricopa County, United States
  'trenton|NJ|US': [40.2203, -74.7659], // Trenton, Mercer County, United States
  'waco|TX|US': [31.5545, -97.1326], // Waco, McLennan County, United States
  'wisconsin dells||US': [43.6256, -89.7716], // Wisconsin Dells, Columbia County, United States
};

/** "Las Vegas" / "NV" / "US" → "las vegas|NV|US"; sem região → "cidade||país". */
export function placeKey(city: string, state: string | undefined, countryCode: string): string {
  return `${norm(city)}|${state ?? ''}|${countryCode}`;
}

/**
 * Coordenadas da tabela. Sem região na linha, aceita a entrada da cidade sem
 * região ou, se só houver uma no país, a com região ("Boston||US" → "boston|MA|US").
 */
export function coordsOfPlace(city: string, state: string | undefined, countryCode: string): [number, number] | undefined {
  const exact = COORDS_BY_PLACE[placeKey(city, state, countryCode)];
  if (exact) return exact;
  const bare = COORDS_BY_PLACE[placeKey(city, undefined, countryCode)];
  if (bare) return bare;
  if (state) return undefined;
  const prefix = `${norm(city)}|`;
  const suffix = `|${countryCode}`;
  const hits = Object.keys(COORDS_BY_PLACE).filter((k) => k.startsWith(prefix) && k.endsWith(suffix));
  return hits.length === 1 ? COORDS_BY_PLACE[hits[0]!] : undefined;
}
