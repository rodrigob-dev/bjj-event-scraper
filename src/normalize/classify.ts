// Heurística para classificar um RawEvent em EventType + ícone + label de CTA.
// Federações publicam majoritariamente competições; default é 'competition'.

import type { EventType } from '../types.js';

const ICON_BY_TYPE: Record<EventType, string> = {
  competition: '🏆',
  promotion: '🥋',
  open_mat: '🤝',
  seminar: '📚',
};

const CTA_BY_TYPE: Record<EventType, string> = {
  competition: 'Ver Detalhes',
  promotion: 'Ver Detalhes',
  open_mat: 'Participar',
  seminar: 'Saiba Mais',
};

// Fronteiras de palavra: "Beltrão" (cidade) não é "belt", "Graduação" é.
const SEMINAR_RE = /\b(seminar|seminário|seminario|workshop)/i;
const OPEN_MAT_RE = /\b(open ?mat|treino aberto)\b/i;
const PROMOTION_RE = /\bpromotion\b|\bgradua/i;
const BELT_RE = /\bbelt\b/i;
// "White Belt Edition", "Blue Belt Round Robin": faixa como divisão, não cerimônia.
const COLOR_BELT_RE = /\b(white|grey|gray|blue|purple|brown|black|coral|red|yellow|orange|green)\s*(&|and|\/)?\s*(white|grey|gray|blue|purple|brown|black|coral|red|yellow|orange|green)?\s*belts?\b/i;
const COMPETITION_RE = /\b(tournament|championship|open|cup|copa|campeonato|round robin|sub[- ]?only|trials|invitational|league|torneio|challenge|series|classic)\b/i;

/** Mapeia um possível `typeHint` da fonte ou o título para um EventType. */
export function classifyType(title: string, typeHint?: string): EventType {
  const text = `${typeHint ?? ''} ${title}`;
  if (SEMINAR_RE.test(text)) return 'seminar';
  if (OPEN_MAT_RE.test(text)) return 'open_mat';
  if (PROMOTION_RE.test(text)) return 'promotion';
  // "belt" sozinho só é graduação quando não nomeia uma divisão de torneio.
  if (BELT_RE.test(text) && !COLOR_BELT_RE.test(text) && !COMPETITION_RE.test(text)) return 'promotion';
  // championship, open, cup, copa, campeonato, taça, gp, trials...
  return 'competition';
}

// Regra do contrato + "crianças" (CBJJ: "Campeonato Sul Americano - Crianças").
const KIDS_RE = /\bkids?\b|juvenil|infantil|youth|crian[çc]as/i;

/** true quando o título indica evento infantil/juvenil. */
export function kidsFromTitle(title: string): boolean {
  return KIDS_RE.test(title);
}

export function iconFor(type: EventType): string {
  return ICON_BY_TYPE[type];
}

export function ctaFor(type: EventType): string {
  return CTA_BY_TYPE[type];
}
