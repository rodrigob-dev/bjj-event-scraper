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
// Tudo testado sobre o título sem acento e minúsculo (`fold`), então "seminário",
// "formação" e "Höstlovsläger" casam pela forma ASCII.
const SEMINAR_RE = /\b(seminar|seminaire|seminario|workshop)/;
const OPEN_MAT_RE = /\b(open ?mat|treino aberto|entrenamiento abierto|tatami abierto|oppen matta|apen matte|offene matte)\b/;
const PROMOTION_RE = /\bpromotion\b|\bgradua/;
const BELT_RE = /\bbelt\b/;
// "White Belt Edition", "Blue Belt Round Robin": faixa como divisão, não cerimônia.
const COLOR_BELT_RE = /\b(white|grey|gray|blue|purple|brown|black|coral|red|yellow|orange|green)\s*(&|and|\/)?\s*(white|grey|gray|blue|purple|brown|black|coral|red|yellow|orange|green)?\s*belts?\b/;
const COMPETITION_RE = /\b(tournament|championships?|open|cup|copa|campeonato|round robin|sub[- ]?only|trials|invitational|league|torneio|torneo|tournoi|challenge|series|classic|nationals?|grand prix|etapa)\b/;

// Curso, formação de árbitros/staff, aula: ninguém compete. Vence palavra de
// competição ("AMMASA + League Boxing Officials Course" é curso, não liga).
// Os compostos escandinavos e alemães terminam na palavra ("domarkurs",
// "dommerkurs", "Kampfrichterlehrgang"), por isso o sufixo sem borda à esquerda;
// "konkurs" (concurso) fica de fora.
const COURSE_RE = new RegExp(
  [
    '\\b(course|curso|cours|capacitacao|capacitacion|formacao|formacoes|formation)s?\\b',
    '\\b(referee|official|judge|coach|staff|arbitr[oae]s?|arbitragem|marcador|mesari)\\w*\\s+(training|clinic)\\b',
    '[a-z]*(?<!kon)(kurs|kursus|utbildning|oppl(?:ae|\u00e6)ring|lehrgang|schulung|ausbildung)\\b',
  ].join('|'),
);
// Camp/acampamento/läger/leir: treino de vários dias. "Camp" pode ser nome de
// lugar ou de equipe ("Camp Pendleton Open"), então só vale sem palavra de competição.
const CAMP_RE = /\b(camps?|bootcamp|acampamento|campamento|clinics?|clinica)\b|[a-z]*(lager|leir)\b/;

const fold = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

/** Mapeia um possível `typeHint` da fonte ou o título para um EventType. */
export function classifyType(title: string, typeHint?: string): EventType {
  const text = fold(`${typeHint ?? ''} ${title}`);
  if (SEMINAR_RE.test(text) || COURSE_RE.test(text)) return 'seminar';
  if (OPEN_MAT_RE.test(text)) return 'open_mat';
  if (PROMOTION_RE.test(text)) return 'promotion';
  const competes = COMPETITION_RE.test(text);
  if (CAMP_RE.test(text) && !competes) return 'seminar';
  // "belt" sozinho só é graduação quando não nomeia uma divisão de torneio.
  if (BELT_RE.test(text) && !COLOR_BELT_RE.test(text) && !competes) return 'promotion';
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
