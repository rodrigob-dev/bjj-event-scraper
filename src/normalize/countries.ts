// Nome de país por extenso (como as páginas escrevem) → ISO 3166-1 alpha-2.
// Compartilhado pelas fontes que só dizem "United States of America", "Japan",
// "Guam": IBJJF (página de detalhe), SJJIF (home) e JJWL (fim do endereço).
// Fora da tabela fica SEM país — o contrato proíbe chute.

const COUNTRY_BY_NAME: Record<string, string> = {
  'united states of america': 'US', 'united states': 'US', usa: 'US', 'u.s.a.': 'US', 'estados unidos': 'US',
  brasil: 'BR', brazil: 'BR', portugal: 'PT', ireland: 'IE', italy: 'IT', italia: 'IT',
  france: 'FR', spain: 'ES', espana: 'ES', 'united kingdom': 'GB', england: 'GB', scotland: 'GB',
  wales: 'GB', 'great britain': 'GB', uk: 'GB', germany: 'DE', deutschland: 'DE',
  switzerland: 'CH', netherlands: 'NL', belgium: 'BE', austria: 'AT', 'czech republic': 'CZ', czechia: 'CZ',
  poland: 'PL', sweden: 'SE', norway: 'NO', denmark: 'DK', finland: 'FI', greece: 'GR', turkey: 'TR',
  turkiye: 'TR', russia: 'RU', 'russian federation': 'RU', ukraine: 'UA', romania: 'RO', hungary: 'HU',
  croatia: 'HR', serbia: 'RS', slovakia: 'SK', slovenia: 'SI', bulgaria: 'BG', israel: 'IL',
  canada: 'CA', mexico: 'MX', 'costa rica': 'CR', panama: 'PA', guatemala: 'GT', 'dominican republic': 'DO',
  'puerto rico': 'PR', cuba: 'CU', jamaica: 'JM',
  chile: 'CL', argentina: 'AR', peru: 'PE', colombia: 'CO', uruguay: 'UY', paraguay: 'PY',
  ecuador: 'EC', bolivia: 'BO', venezuela: 'VE',
  japan: 'JP', 'south korea': 'KR', 'korea, republic of': 'KR', 'republic of korea': 'KR', korea: 'KR',
  china: 'CN', "people's republic of china": 'CN', taiwan: 'TW', 'hong kong': 'HK', macau: 'MO', macao: 'MO',
  malaysia: 'MY', singapore: 'SG', thailand: 'TH', philippines: 'PH', indonesia: 'ID', vietnam: 'VN',
  'viet nam': 'VN', india: 'IN', pakistan: 'PK', mongolia: 'MN', kazakhstan: 'KZ', uzbekistan: 'UZ',
  'united arab emirates': 'AE', uae: 'AE', qatar: 'QA', 'saudi arabia': 'SA', bahrain: 'BH', kuwait: 'KW',
  oman: 'OM', jordan: 'JO', lebanon: 'LB', egypt: 'EG', morocco: 'MA', 'south africa': 'ZA', nigeria: 'NG',
  australia: 'AU', 'new zealand': 'NZ', guam: 'GU', 'northern mariana islands': 'MP', fiji: 'FJ',
};

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '').trim();
}

/** "US" → "United States" (ICU do Node); código desconhecido volta como veio. */
export function countryNameOfCode(cc: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(cc) ?? cc;
  } catch {
    return cc;
  }
}

/** "United States of America" → "US"; desconhecido → undefined. */
export function countryCodeOfName(name: string | undefined | null): string | undefined {
  if (!name) return undefined;
  return COUNTRY_BY_NAME[norm(name)];
}
