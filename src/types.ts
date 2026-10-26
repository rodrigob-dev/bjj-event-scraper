// Contrato compartilhado com o app BJJ Avatar.
// Espelha `lib/types.ts` do app — fonte da verdade do schema de saída.
// Mantenha `BJJEvent` e `EventType` idênticos ao app.

export type EventType = 'competition' | 'promotion' | 'open_mat' | 'seminar';

export interface BJJEvent {
  id: string;
  title: string;
  type: EventType;
  date: string; // display string PT-BR, e.g. "24 de Janeiro, 2026"
  location: string;
  ctaLabel: string;
  icon: string;
}

// Modalidade, derivada das categorias da fonte. O feed só publica bjj + grappling
// (ver EMITTED_SPORTS no adapter); os outros valores existem para o mapeamento
// ser auditável e a ampliação ser uma linha.
export type Sport = 'bjj' | 'grappling' | 'judo' | 'wrestling' | 'mma' | 'other';

// Campos v2 (contrato events-v2): todos opcionais e aditivos — um consumidor v1
// continua lendo o JSON, e cada fonte preenche só o que tem. Ausente significa
// "desconhecido", nunca um chute.
export interface EventDetails {
  sourceId?: string; // chave estável da fonte: "smoothcomp:27746", "ibjjf:3121"
  venue?: string; // nome da arena/ginásio — nunca cidade
  city?: string; // só a cidade, sem UF/estado grudado
  state?: string; // UF brasileira ou código de estado US/CA/AU (2–3 letras maiúsculas)
  countryCode?: string; // ISO 3166-1 alpha-2
  lat?: number; // WGS84
  lng?: number;
  gi?: boolean;
  nogi?: boolean;
  kids?: boolean;
  // Quem organiza, p/ wordmark e chip: o `nome` de uma entrada de data/organizadores.json
  // ("IBJJF", "NAGA", "Grappling Industries"), nunca o Smoothcomp nem um subdomínio cru.
  // No RawEvent é o que o adapter declara; a normalização troca pelo da base.
  organizer?: string;
  organizerId?: string; // `id` da mesma entrada ("naga"); vem junto com organizer
  sport?: Sport;
  registrationDeadlineISO?: string; // YYYY-MM-DD, só quando a fonte declara — nunca a data do evento
}

export type GeoSource = 'source' | 'table' | 'nominatim';

// Evento normalizado e versionado em data/events.json.
// Estende BJJEvent com proveniência. O app pode ignorar os campos extras
// ou usar `sourceUrl` como href do CTA.
export interface ScrapedEvent extends BJJEvent, EventDetails {
  dateISO: string; // "2026-01-24" — canônico p/ ordenar e dedup
  endDateISO?: string; // último dia; igual a dateISO em evento de 1 dia
  // De onde vieram lat/lng: a própria fonte, a tabela de cidades ou o Nominatim
  // (cache em data/geocode-cache.json). Sempre presente quando há lat/lng.
  geo?: GeoSource;
  source: string; // "ibjjf" | "cbjj" | "smoothcomp"
  sourceUrl: string; // URL de detalhe/inscrição
  imageUrl?: string; // foto/capa real do evento (ex: Smoothcomp cover_image)
  accentColor?: string; // cor hex da federação p/ banner estilizado (ex: IBJJF logoBaseColor)
  scrapedAt: string; // ISO timestamp da coleta
}

// Estratégia de coleta de um adapter.
// 'http' é o default desejado (bate o endpoint JSON interno direto).
// 'browser' é fallback isolado: usa Playwright (browser.ts) só quando
// não há endpoint utilizável.
export type FetchStrategy = 'http' | 'browser';

// Evento cru, como sai de uma fonte — antes de normalizar data/dedup.
// Os campos v2 (EventDetails) já vêm estruturados do adapter, que é quem
// conhece o formato da fonte; o normalizador só valida e repassa.
export interface RawEvent extends EventDetails {
  title: string;
  rawDate: string; // texto como veio: "Jan 24, 2026" / "24/01/2026"
  rawEndDate?: string; // último dia, mesmo formato; ausente = evento de 1 dia
  location: string;
  url: string;
  typeHint?: string; // categoria da fonte, se houver
  imageUrl?: string; // capa real do evento, se a fonte fornecer
  accentColor?: string; // cor hex da federação, se a fonte fornecer
}

export interface SourceAdapter {
  name: string;
  strategy: FetchStrategy;
  /** Prioridade em dedup: maior vence em colisão (federação oficial > agregador). */
  priority: number;
  /** Coleta o payload bruto. Pode lançar — o orquestrador isola falhas por fonte. */
  fetchRaw(): Promise<unknown>;
  /**
   * Transforma o bruto em eventos parciais. Não normaliza datas nem deduplica.
   * `now` (default: agora) só serve a filtros de ruído que dependem do dia da coleta.
   */
  parse(raw: unknown, now?: Date): RawEvent[];
}
