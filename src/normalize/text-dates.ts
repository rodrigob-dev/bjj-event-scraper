// Datas escritas por extenso, como as federações publicam em listas HTML:
//   EN  "November 07, 2026" · "November 7 - 8, 2026" · "November 30 - December 1, 2026"
//   PT  "sábado, 24 de outubro de 2026" · "sábado e domingo, 05 e 06 de dezembro 2026"
//       · "31 de outubro e 01 de novembro de 2026" · "23 de Abril a 03 de Maio" (ano da página)
// O texto vira uma sequência de dias, meses e anos; cada dia pega o mês mais
// próximo (antes dele em EN, depois dele em PT) e o ano mais próximo depois.
// Dia da semana, "de", "e", "a", "até", "-" não importam. Primeiro dia = início,
// último dia = fim.

const MONTHS: Record<string, number> = {
  // EN
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6,
  july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12,
  // PT
  janeiro: 1, fevereiro: 2, fev: 2, marco: 3, abril: 4, abr: 4, maio: 5, mai: 5, junho: 6, julho: 7,
  agosto: 8, ago: 8, setembro: 9, set: 9, outubro: 10, out: 10, novembro: 11, dezembro: 12, dez: 12,
};

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** "November" / "nov" / "Outubro" / "out" → 1..12; outra palavra → undefined. */
export function monthNumber(word: string): number | undefined {
  return MONTHS[norm(word).replace(/\.$/, '')];
}

export interface DayRange {
  start: string; // YYYY-MM-DD
  end: string;
}

type Token = { kind: 'day' | 'year' | 'month'; n: number };

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(/(\d{1,4})(?:st|nd|rd|th|º|°|ª)?|([A-Za-zÀ-ÿ]+)/g)) {
    if (m[1] !== undefined) {
      const n = Number(m[1]);
      if (m[1].length === 4) out.push({ kind: 'year', n });
      else if (m[1].length <= 2 && n >= 1 && n <= 31) out.push({ kind: 'day', n });
    } else if (m[2]) {
      const month = monthNumber(m[2]);
      if (month) out.push({ kind: 'month', n: month });
    }
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO só se a data existir no calendário (30 de fevereiro não passa). */
function isoOf(y: number, m: number, d: number): string | undefined {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return undefined;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function parseRange(text: string, monthFirst: boolean, defaultYear?: number): DayRange | undefined {
  const tokens = tokenize(text);
  const days: Array<{ d: number; m?: number; y?: number }> = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.kind !== 'day') continue;
    let m: number | undefined;
    if (monthFirst) {
      for (let k = i - 1; k >= 0; k--) if (tokens[k]!.kind === 'month') { m = tokens[k]!.n; break; }
    } else {
      for (let k = i + 1; k < tokens.length; k++) if (tokens[k]!.kind === 'month') { m = tokens[k]!.n; break; }
    }
    let y: number | undefined;
    for (let k = i + 1; k < tokens.length; k++) if (tokens[k]!.kind === 'year') { y = tokens[k]!.n; break; }
    days.push({ d: t.n, m, y: y ?? defaultYear });
  }
  if (days.length === 0) return undefined;
  const first = days[0]!;
  const last = days[days.length - 1]!;
  if (!first.m || !first.y || !last.m || !last.y) return undefined;
  let startYear = first.y;
  // "31 de dezembro e 1 de janeiro de 2027": só um ano no texto, e ele é o do fim.
  if (first.y === last.y && (first.m > last.m || (first.m === last.m && first.d > last.d))) startYear--;
  const start = isoOf(startYear, first.m, first.d);
  const end = isoOf(last.y, last.m, last.d);
  if (!start || !end || end < start) return undefined;
  return { start, end };
}

/** EN, mês antes do dia: "November 7 - 8, 2026". */
export function parseEnRange(text: string, defaultYear?: number): DayRange | undefined {
  return parseRange(text, true, defaultYear);
}

/** PT, dia antes do mês: "sábado e domingo, 05 e 06 de dezembro 2026". */
export function parsePtRange(text: string, defaultYear?: number): DayRange | undefined {
  return parseRange(text, false, defaultYear);
}

/** "07/11/2026" (dd/mm/yyyy, BR) → "2026-11-07". */
export function parseBrNumeric(text: string): string | undefined {
  const m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return undefined;
  return isoOf(Number(m[3]), Number(m[2]), Number(m[1]));
}
