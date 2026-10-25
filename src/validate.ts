// Valida data/events.json: schema zod + invariantes (sem datas passadas,
// sem duplicatas de id nem de sourceId). Exit code != 0 falha o CI antes de
// publicar. Imprime também a cobertura dos campos v2 por fonte.

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { outputSchema, type ScrapedEventParsed } from './schema.js';
import { isPast } from './normalize/dates.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = resolve(ROOT, 'data/events.json');

/** Invariantes além do schema. Exportado p/ teste. */
export function findInvariantErrors(events: ScrapedEventParsed[], now: Date = new Date()): string[] {
  const errors: string[] = [];

  // Um evento em andamento (começou, ainda não terminou) continua futuro.
  const past = events.filter((e) => isPast(e.endDateISO ?? e.dateISO, now));
  if (past.length) errors.push(`${past.length} evento(s) com data passada: ${past.slice(0, 5).map((e) => e.id).join(', ')}`);

  const dupOf = (key: (e: ScrapedEventParsed) => string | undefined, label: string) => {
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const e of events) {
      const k = key(e);
      if (k === undefined) continue;
      if (seen.has(k)) dups.push(k);
      seen.add(k);
    }
    if (dups.length) errors.push(`${dups.length} ${label} duplicado(s): ${dups.slice(0, 10).join(', ')}`);
  };
  dupOf((e) => e.id, 'id(s)');
  dupOf((e) => e.sourceId, 'sourceId(s)');

  return errors;
}

/** Cobertura dos campos v2, por fonte — vai pro log do CI p/ pegar regressão de adapter. */
export function coverageSummary(events: ScrapedEventParsed[]): string {
  const sources = [...new Set(events.map((e) => e.source))].sort();
  const lines = sources.map((s) => {
    const rows = events.filter((e) => e.source === s);
    const n = (f: (e: ScrapedEventParsed) => boolean) => rows.filter(f).length;
    return (
      `  ${s}: ${rows.length} eventos · país ${n((e) => !!e.countryCode)} · cidade ${n((e) => !!e.city)} · ` +
      `estado ${n((e) => !!e.state)} · lat/lng ${n((e) => e.lat !== undefined)} · fim ${n((e) => !!e.endDateISO)} · ` +
      `prazo ${n((e) => !!e.registrationDeadlineISO)} · nogi ${n((e) => e.nogi === true)} · kids ${n((e) => e.kids === true)}`
    );
  });
  return lines.join('\n');
}

async function main() {
  const text = await readFile(OUTPUT, 'utf8');
  const json = JSON.parse(text);

  const parsed = outputSchema.safeParse(json);
  if (!parsed.success) {
    console.error('::error::Schema inválido em events.json:');
    console.error(parsed.error.issues.slice(0, 10));
    process.exit(1);
  }

  const events = parsed.data;
  const errors = findInvariantErrors(events);
  if (errors.length) {
    console.error('::error::Validação falhou:\n - ' + errors.join('\n - '));
    process.exit(1);
  }

  console.log(`OK: ${events.length} eventos válidos, sem duplicatas, todos futuros.`);
  console.log(coverageSummary(events));
}

// Só roda como script; importado pelos testes, não faz I/O.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('::error::', err);
    process.exit(1);
  });
}
