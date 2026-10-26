// Quem organiza cada linha, a partir da base aprovada em data/organizadores.json.
// O Smoothcomp é a plataforma de inscrição, não uma federação: o feed mostra a
// federação, liga, circuito ou marca que roda o evento. Só uma entrada da base
// vira `organizer` — subdomínio cru ("ufcbjj") ou texto livre do título nunca
// chegam ao app, porque viram wordmark e chip de filtro.
//
// Ordem por linha:
//   1. o que a própria fonte afirma: no Smoothcomp, o subdomínio do evento
//      (`naga.smoothcomp.com` → NAGA); num calendário de federação, o organizador
//      que o adapter declara ("IBJJF", "CBJJ/FPJJ" → o primeiro nome da base).
//      Exceção: a conta de uma federação no Smoothcomp lista também os eventos que
//      ela só sanciona, então uma marca com `tituloVenceHost` que é o melhor
//      casamento do título ("Grappling Industries TORONTO" na conta da Ontario)
//      vence o subdomínio;
//   2. os padrões de título da base (sem acento e sem caixa, com borda de palavra;
//      o trecho casado mais longo vence, empate fica com o que aparece antes);
//   3. nada: `organizer`/`organizerId` ausentes ("Other" no filtro do app).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const ORGANIZER_BASE_PATH = fileURLToPath(new URL('../../data/organizadores.json', import.meta.url));

export const organizerTipoSchema = z.enum(['federacao', 'liga', 'circuito', 'organizador']);
export const KEBAB_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Rótulo de DNS: é o que vem antes de `.smoothcomp.com`.
const SUBDOMAIN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_PATTERN = 3;

export const organizerEntrySchema = z
  .object({
    id: z.string().regex(KEBAB_ID, 'id deve ser kebab-case'),
    nome: z.string().trim().min(1),
    tipo: organizerTipoSchema,
    // A evidência de que a organização existe: o site oficial ou, sem um, a casa
    // dela no Smoothcomp. https só — vira link no app.
    site: z.string().url().refine((u) => u.startsWith('https://'), 'site deve ser https'),
    hosts: z.array(z.string().regex(SUBDOMAIN, 'host é só o subdomínio do Smoothcomp, minúsculo')),
    padroes: z.array(z.string().min(MIN_PATTERN, `padrão com menos de ${MIN_PATTERN} caracteres casa demais`)),
    cor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'cor deve ser #RRGGBB').optional(),
    // Marca que sempre roda o próprio evento: citada no título, vence o host. Opt-in
    // por entrada porque "organizador no título vence federação no host" em geral
    // viraria os ADCC Opens que a BJJFP e a SSWF de fato organizam.
    tituloVenceHost: z.boolean().optional(),
  })
  .strict();

export type OrganizerEntry = z.infer<typeof organizerEntrySchema>;
export type OrganizerVia = 'host' | 'declared' | 'title';

export interface OrganizerMatch {
  entry: OrganizerEntry;
  via: OrganizerVia;
}

interface CompiledPattern {
  re: RegExp;
  entry: OrganizerEntry;
  order: number;
}

export interface OrganizerBase {
  entries: OrganizerEntry[];
  byId: Map<string, OrganizerEntry>;
  byHost: Map<string, OrganizerEntry>;
  byName: Map<string, OrganizerEntry>; // id e nome, dobrados
  patterns: CompiledPattern[];
}

const stripMarks = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '');

/** Texto comparável: sem acento, minúsculo, espaços colapsados ("Submission  Challenge"). */
export function fold(s: string): string {
  return stripMarks(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Padrão da base → RegExp com borda de palavra Unicode. Só tira o acento da
 * fonte do padrão — minúscula ali trocaria `\S` por `\s`; a caixa fica com a flag i.
 */
export function compilePattern(p: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${stripMarks(p)})(?![\\p{L}\\p{N}])`, 'iu');
}

/** Invariantes da base além do schema de cada entrada. Exportado p/ teste. */
export function baseErrors(entries: OrganizerEntry[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  // Um host ou um nome com dois donos tornaria a resolução ambígua.
  const owners = new Map<string, string>();
  const claim = (label: string, key: string, id: string) => {
    const prev = owners.get(`${label}:${key}`);
    if (prev && prev !== id) errors.push(`${label} "${key}" em ${prev} e ${id}`);
    owners.set(`${label}:${key}`, id);
  };
  for (const e of entries) {
    if (ids.has(e.id)) errors.push(`id "${e.id}" repetido`);
    ids.add(e.id);
    for (const h of e.hosts) claim('host', h, e.id);
    claim('nome', fold(e.id), e.id);
    claim('nome', fold(e.nome), e.id);
    for (const p of e.padroes) {
      try {
        compilePattern(p);
      } catch (err) {
        errors.push(`padrão inválido em ${e.id}: ${p} (${(err as Error).message})`);
      }
    }
  }
  return errors;
}

/** Valida e indexa uma base. Lança se ela quebrar o schema ou um invariante. */
export function buildOrganizerBase(json: unknown): OrganizerBase {
  const entries = z.array(organizerEntrySchema).parse(json);
  const errors = baseErrors(entries);
  if (errors.length) throw new Error(`data/organizadores.json inválido:\n - ${errors.join('\n - ')}`);
  const base: OrganizerBase = { entries, byId: new Map(), byHost: new Map(), byName: new Map(), patterns: [] };
  entries.forEach((e, order) => {
    base.byId.set(e.id, e);
    base.byName.set(fold(e.id), e);
    base.byName.set(fold(e.nome), e);
    for (const h of e.hosts) base.byHost.set(h, e);
    for (const p of e.padroes) base.patterns.push({ re: compilePattern(p), entry: e, order });
  });
  return base;
}

let cached: OrganizerBase | undefined;

/** A base do repo, lida e compilada uma vez por processo. */
export function organizerBase(): OrganizerBase {
  cached ??= buildOrganizerBase(JSON.parse(readFileSync(ORGANIZER_BASE_PATH, 'utf8')));
  return cached;
}

/**
 * URL do Smoothcomp → subdomínio do organizador. `undefined` = não é Smoothcomp;
 * `null` = host genérico (smoothcomp.com, www).
 */
export function smoothcompSubdomain(url: string): string | null | undefined {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  if (host === 'smoothcomp.com') return null;
  const m = host.match(/^([a-z0-9-]+)\.smoothcomp\.com$/);
  if (!m) return undefined;
  return m[1] === 'www' ? null : m[1]!;
}

/** "CBJJ/FPJJ" → a primeira parte que é id ou nome de uma entrada. */
export function byDeclared(declared: string, base: OrganizerBase = organizerBase()): OrganizerEntry | undefined {
  for (const part of declared.split('/')) {
    const e = base.byName.get(fold(part));
    if (e) return e;
  }
  return undefined;
}

// "Reglas IBJJF&ADCC", "IBJJF Rules", "règlement IBJJF": o título cita o
// regulamento, não quem organiza. Um casamento colado a uma dessas palavras
// (até duas palavras antes ou depois) não conta.
const RULESET_WORD = /^\(?(?:rules?|ruleset|reglas?|regras?|reglement|regulamento|reglamento|regolamento)\)?$/;

function citesRuleset(text: string, index: number, end: number): boolean {
  const before = text.slice(0, index).split(/[\s&+/,]+/).filter(Boolean).slice(-2);
  const after = text.slice(end).split(/[\s&+/,]+/).filter(Boolean).slice(0, 2);
  return [...before, ...after].some((w) => RULESET_WORD.test(w));
}

// "6162 GRAND PRIX: ADCC EUROPEAN TRIALS SPONSORSHIP", "Road to ADCC": a marca é o
// prêmio (um patrocínio para o evento dela) ou o destino, não quem organiza. A palavra
// do prêmio fecha a frase da marca ("ADCC European Trials Sponsorship"), por isso a
// janela depois é de três palavras; antes, duas ("Patrocínio ADCC", "Road to ADCC").
const PRIZE_WORD = /^(?:sponsorships?|sponsor(?:ed)?|patrocinios?|patrocinado|patrocinio)\)?$/;

function citesPrize(text: string, index: number, end: number): boolean {
  const before = text.slice(0, index).split(/[\s&+/,:|-]+/).filter(Boolean).slice(-2);
  if (/^(?:road|rumo|camino) (?:to|ao|a|al)$/.test(before.join(' '))) return true;
  if (before.some((w) => PRIZE_WORD.test(w))) return true;
  const after = text.slice(end).split(/[\s&+/,:|-]+/).filter(Boolean).slice(0, 3);
  return after.some((w) => PRIZE_WORD.test(w));
}

/** Padrão de título: trecho mais longo vence; empate, o que aparece antes; depois a ordem da base. */
export function byTitle(title: string, base: OrganizerBase = organizerBase()): OrganizerEntry | undefined {
  const text = fold(title);
  let best: { entry: OrganizerEntry; len: number; index: number; order: number } | undefined;
  for (const p of base.patterns) {
    const m = p.re.exec(text);
    if (!m) continue;
    const end = m.index + m[0].length;
    if (citesRuleset(text, m.index, end) || citesPrize(text, m.index, end)) continue;
    const cand = { entry: p.entry, len: m[0].length, index: m.index, order: p.order };
    if (
      !best ||
      cand.len > best.len ||
      (cand.len === best.len && (cand.index < best.index || (cand.index === best.index && cand.order < best.order)))
    ) {
      best = cand;
    }
  }
  return best?.entry;
}

export interface OrganizerInput {
  url: string; // sourceUrl
  title: string;
  declared?: string; // o organizer que o adapter afirma (calendário de federação)
}

/** Quem organiza a linha, ou null. Nunca devolve algo fora da base. */
export function resolveOrganizer(row: OrganizerInput, base: OrganizerBase = organizerBase()): OrganizerMatch | null {
  const sub = smoothcompSubdomain(row.url);
  const t = byTitle(row.title, base);
  if (sub) {
    const e = base.byHost.get(sub);
    // A marca só vence quando é o melhor casamento do título: "Marca" dentro do
    // nome mais longo de outra marca não está nomeando quem organiza.
    if (e) return t?.tituloVenceHost && t !== e ? { entry: t, via: 'title' } : { entry: e, via: 'host' };
  } else if (sub === undefined && row.declared) {
    // Num evento do Smoothcomp o que vale é o subdomínio; "declarado" só existe
    // nos calendários das próprias federações.
    const e = byDeclared(row.declared, base);
    if (e) return { entry: e, via: 'declared' };
  }
  return t ? { entry: t, via: 'title' } : null;
}

/** Os dois campos do feed para um resultado do resolvedor. */
export function organizerFields(m: OrganizerMatch | null): { organizer?: string; organizerId?: string } {
  return m ? { organizer: m.entry.nome, organizerId: m.entry.id } : {};
}

/**
 * Reaplica a base numa linha já normalizada (ex.: eventos preservados do JSON
 * anterior quando a fonte falha), trocando o organizer antigo pelo da base.
 */
export function applyOrganizer(
  ev: { sourceUrl: string; title: string; organizer?: string; organizerId?: string },
  base: OrganizerBase = organizerBase(),
): OrganizerMatch | null {
  const m = resolveOrganizer({ url: ev.sourceUrl, title: ev.title, declared: ev.organizer }, base);
  delete ev.organizer;
  delete ev.organizerId;
  Object.assign(ev, organizerFields(m));
  return m;
}
