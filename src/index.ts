// Orquestrador. Roda cada adapter isolado (falha de um não derruba os outros),
// normaliza, faz merge NÃO-DESTRUTIVO (fonte que falha preserva seus eventos
// futuros do JSON anterior), deduplica, ordena por data e grava events.json.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ScrapedEvent } from './types.js';
import { adapters, priorityBySource } from './adapters/registry.js';
import { normalizeEvents } from './normalize/index.js';
import { dedupe, dedupeSameEvent } from './normalize/dedup.js';
import { isPast, daysUntil } from './normalize/dates.js';
import { closeBrowser } from './browser.js';
import { hasDatabase, upsertEvents } from './db.js';
import { fetchEventDetail, type EventDetail } from './enrich/ibjjf-detail.js';
import { geocodeEvents, loadGeocodeCache, nominatimLookup, saveGeocodeCache } from './normalize/geocode.js';
import { applyOrganizer } from './normalize/organizador.js';

// Federações cuja imagem, prazo de inscrição e endereço vivem na página de
// detalhe (não na API do calendário).
const ENRICH_SOURCES = new Set(['ibjjf', 'cbjj']);
// Janela em que o prazo pode mudar (prorrogação): perto dele, rebusca a página.
const DEADLINE_RECHECK_DAYS = 14;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = resolve(ROOT, 'data/events.json');
const GEOCODE_CACHE = resolve(ROOT, 'data/geocode-cache.json');

/** Remove a DATABASE_URL de mensagens de erro — logs do Action são públicos. */
function redactSecret(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const url = process.env.DATABASE_URL;
  return url ? raw.split(url).join('[REDACTED]') : raw;
}

async function loadPrevious(): Promise<ScrapedEvent[]> {
  try {
    return JSON.parse(await readFile(OUTPUT, 'utf8')) as ScrapedEvent[];
  } catch {
    return [];
  }
}

/**
 * Aplica o que a página (ou o cache do run anterior) sabe. País/estado da
 * página vencem a tabela de cidades; o prazo nunca pode ser a data do evento.
 */
function applyDetail(ev: ScrapedEvent, detail: EventDetail, prev?: ScrapedEvent): void {
  const imageUrl = detail.imageUrl ?? prev?.imageUrl;
  if (imageUrl && !ev.imageUrl) ev.imageUrl = imageUrl;

  const deadline = detail.registrationDeadlineISO ?? prev?.registrationDeadlineISO;
  if (deadline && deadline < ev.dateISO) ev.registrationDeadlineISO = deadline;

  const countryCode = detail.countryCode ?? prev?.countryCode;
  if (countryCode) {
    if (ev.countryCode && ev.countryCode !== countryCode) {
      console.warn(`::warning::[${ev.source}] tabela diz ${ev.countryCode}, página diz ${countryCode}: "${ev.title}" (${ev.city})`);
    }
    ev.countryCode = countryCode;
  }
  const state = detail.state ?? prev?.state;
  if (state && (detail.state || !ev.state)) ev.state = state;
  if (!ev.venue && detail.venue) ev.venue = detail.venue;
}

async function main() {
  const scrapedAt = new Date().toISOString();
  const previous = await loadPrevious();
  const collected: ScrapedEvent[] = [];
  const failedSources = new Set<string>();
  let usedBrowser = false;

  for (const adapter of adapters) {
    try {
      if (adapter.strategy === 'browser') usedBrowser = true;
      const raw = await adapter.fetchRaw();
      const rawEvents = adapter.parse(raw);
      const normalized = normalizeEvents(rawEvents, { source: adapter.name, scrapedAt });

      // Alerta de regressão: tinha histórico futuro e agora veio vazio.
      const hadHistory = previous.some((e) => e.source === adapter.name);
      if (normalized.length === 0 && hadHistory) {
        console.error(
          `::warning::[${adapter.name}] retornou 0 eventos tendo histórico — possível quebra de layout/endpoint`,
        );
        failedSources.add(adapter.name);
      } else {
        console.log(`[${adapter.name}] ${normalized.length} eventos futuros`);
        collected.push(...normalized);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`::warning::[${adapter.name}] falhou: ${msg}`);
      failedSources.add(adapter.name);
    }
  }

  if (usedBrowser) await closeBrowser();

  // Merge não-destrutivo: para fontes que falharam, reaproveita os eventos
  // futuros do JSON anterior — evita zerar dados por uma queda pontual.
  // "Futuro" olha o último dia: um campeonato de 4 dias em andamento fica.
  const preservedSources = [...failedSources];
  for (const ev of previous) {
    if (preservedSources.includes(ev.source) && !isPast(ev.endDateISO ?? ev.dateISO)) {
      applyOrganizer(ev); // o JSON anterior pode ter um organizer de antes da base (subdomínio cru)
      collected.push(ev);
    }
  }

  // Aborta gravação se TUDO falhou — não sobrescreve com lista vazia.
  if (collected.length === 0) {
    console.error('::error::Nenhum evento coletado de nenhuma fonte. Mantendo events.json anterior.');
    process.exit(1);
  }

  // Enriquecimento IBJJF/CBJJ pela página de detalhe: imagem, prazo de
  // inscrição e endereço (país/estado autoritativos — corrigem a tabela de
  // cidades). Cache incremental pelo sourceId (ou id, p/ JSON anterior v1):
  // só busca eventos novos, sem prazo conhecido ou com prazo a ≤14 dias
  // (quando prorrogações acontecem). O resto reaproveita o run anterior.
  const prevByKey = new Map<string, ScrapedEvent>();
  for (const e of previous) {
    prevByKey.set(e.id, e);
    if (e.sourceId) prevByKey.set(e.sourceId, e);
  }
  let enriched = 0;
  let fetched = 0;
  let withDeadline = 0;
  for (const ev of collected) {
    if (!ENRICH_SOURCES.has(ev.source)) continue;
    if (ev.sourceUrl.endsWith('/events/calendar')) continue; // sem pageUrl: não há página de detalhe
    const prev = (ev.sourceId && prevByKey.get(ev.sourceId)) || prevByKey.get(ev.id);
    const cachedDeadline = prev?.registrationDeadlineISO;
    const nearDeadline =
      cachedDeadline !== undefined && daysUntil(cachedDeadline) >= 0 && daysUntil(cachedDeadline) <= DEADLINE_RECHECK_DAYS;
    const needPage = !prev?.imageUrl || !cachedDeadline || nearDeadline;
    let detail: EventDetail | undefined;
    if (needPage) {
      try {
        detail = await fetchEventDetail(ev.sourceUrl);
        fetched++;
      } catch {
        // página de detalhe falhou — segue com o cache (ou sem nada)
      }
    }
    applyDetail(ev, detail ?? {}, prev);
    if (ev.imageUrl) enriched++;
    if (ev.registrationDeadlineISO) withDeadline++;
  }
  console.log(
    `Detalhe IBJJF/CBJJ: ${enriched} com imagem, ${withDeadline} com prazo de inscrição ` +
      `(${fetched} páginas buscadas, resto via cache).`,
  );

  // 2ª passada: o mesmo evento com outro título em outra fonte ("SÃO PAULO BJJ
  // PRÓ" na FPJJ × "São Paulo BJJ Pro IBJJF Championship 2026" na CBJJ). Antes da
  // geocodificação, p/ o vencedor herdar as coordenadas de ginásio do perdedor.
  const same = dedupeSameEvent(dedupe(collected, priorityBySource), priorityBySource);
  const deduped = same.events;
  console.log(`Dedup por evento: ${same.merges.length} par(es) fundido(s).`);
  for (const { kept, dropped } of same.merges) {
    console.log(`  ${kept.sourceId ?? kept.id} "${kept.title}" ← ${dropped.sourceId ?? dropped.id} "${dropped.title}"`);
  }

  // Coordenadas p/ quem só tem cidade: tabela → cache commitado → Nominatim
  // (só com GEOCODE=1; a coleta diária não faz requisição nenhuma). Depois do
  // dedup, p/ não buscar cidade de linha que vai cair.
  const geoCache = await loadGeocodeCache(GEOCODE_CACHE);
  const geo = await geocodeEvents(deduped, {
    cache: geoCache,
    online: process.env.GEOCODE === '1',
    lookup: nominatimLookup,
  });
  if (geo.cacheChanged) await saveGeocodeCache(GEOCODE_CACHE, geoCache);
  console.log(
    `Geocodificação: ${geo.source} da fonte, ${geo.table} pela tabela, ${geo.nominatim} pelo cache/Nominatim ` +
      `(${geo.requests} requisições${geo.cacheChanged ? ', cache atualizado' : ''}).`,
  );
  if (geo.unresolved.length) {
    console.log(
      `::notice::[geocode] ${geo.unresolved.length} cidade(s) sem coordenadas` +
        (process.env.GEOCODE === '1' ? '' : ' — rode GEOCODE=1 npm run scrape p/ buscar no Nominatim') +
        `: ${geo.unresolved.join(', ')}`,
    );
  }

  deduped.sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(deduped, null, 2) + '\n', 'utf8');
  console.log(
    `\nGravado ${deduped.length} eventos em data/events.json` +
      (failedSources.size ? ` (fontes preservadas: ${preservedSources.join(', ')})` : ''),
  );

  // Persiste no Supabase (fonte permanente). Pula se DATABASE_URL não estiver
  // setada — assim `npm run scrape` local sem credencial só gera o JSON.
  if (hasDatabase()) {
    try {
      const n = await upsertEvents(deduped);
      console.log(`Upsert no Postgres: ${n} eventos.`);
    } catch (err) {
      console.error(`::error::Falha no upsert do banco: ${redactSecret(err)}`);
      process.exit(1);
    }
  } else {
    console.log('DATABASE_URL não setada — upsert no banco pulado (só events.json).');
  }
}

main().catch((err) => {
  console.error('::error::Falha fatal no scraper:', err);
  process.exit(1);
});
