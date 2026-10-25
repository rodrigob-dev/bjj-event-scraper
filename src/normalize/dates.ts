// Parsing e formatação de datas. Aceita formatos PT-BR e EN comuns nas
// federações; produz `dateISO` canônico (YYYY-MM-DD) e o `date` display
// PT-BR no mesmo formato do mock do app ("24 de Janeiro, 2026").

import { parse, isValid, format, parseISO, isBefore, startOfDay, differenceInCalendarDays } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';

const REFERENCE = new Date(2000, 0, 1); // base p/ campos ausentes no parse

interface FormatAttempt {
  fmt: string;
  locale: typeof ptBR | typeof enUS;
}

// Ordem importa: tenta os mais específicos/comuns primeiro.
const ATTEMPTS: FormatAttempt[] = [
  { fmt: 'yyyy-MM-dd', locale: enUS }, // ISO de APIs
  { fmt: "yyyy-MM-dd'T'HH:mm:ss", locale: enUS },
  { fmt: 'dd/MM/yyyy', locale: ptBR },
  { fmt: 'd/M/yyyy', locale: ptBR },
  { fmt: "d 'de' MMMM 'de' yyyy", locale: ptBR }, // "24 de janeiro de 2026"
  { fmt: "d 'de' MMMM, yyyy", locale: ptBR }, // "24 de Janeiro, 2026"
  { fmt: 'd MMM yyyy', locale: ptBR },
  { fmt: 'MMMM d, yyyy', locale: enUS }, // "January 24, 2026"
  { fmt: 'MMM d, yyyy', locale: enUS }, // "Jan 24, 2026"
  { fmt: 'd MMMM yyyy', locale: enUS },
  { fmt: 'MM/dd/yyyy', locale: enUS },
];

/**
 * Converte texto de data (PT/EN) em Date. Retorna null se nenhum formato casar.
 * Tolera ISO com horário/timezone via parseISO como primeira via rápida.
 */
export function parseToDate(raw: string): Date | null {
  const text = raw.trim();
  if (!text) return null;

  // ISO direto (com ou sem hora/offset)
  const iso = parseISO(text);
  if (isValid(iso)) return iso;

  // Normaliza separadores comuns ("24 jan 2026", "24-01-2026")
  const cleaned = text.replace(/\s+/g, ' ').replace(/(\d{2})-(\d{2})-(\d{4})/, '$1/$2/$3');

  for (const { fmt, locale } of ATTEMPTS) {
    const d = parse(cleaned, fmt, REFERENCE, { locale });
    if (isValid(d)) return d;
  }
  return null;
}

export function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/** Display PT-BR idêntico ao mock do app: "24 de Janeiro, 2026". */
export function toDisplayPtBr(iso: string): string {
  const d = parseISO(iso);
  const formatted = format(d, "d 'de' MMMM, yyyy", { locale: ptBR });
  // date-fns produz mês minúsculo; o mock usa Maiúscula inicial.
  return formatted.replace(/de (\p{Ll})/u, (_, c: string) => `de ${c.toUpperCase()}`);
}

/** true se a data já passou (anterior ao início do dia de `now`). */
export function isPast(iso: string, now: Date = new Date()): boolean {
  return isBefore(parseISO(iso), startOfDay(now));
}

/** Dias de calendário até `iso` (negativo se já passou). */
export function daysUntil(iso: string, now: Date = new Date()): number {
  return differenceInCalendarDays(parseISO(iso), startOfDay(now));
}
