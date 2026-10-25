// Adapters ativos. Prioridade maior vence em colisão de dedup:
// federações nacionais (CBJJ) = 3 > organizadores dos próprios eventos
// (IBJJF, AJP, SJJIF) = 2 > agregador (Smoothcomp) = 1.

import type { SourceAdapter } from '../types.js';
import { createIbjjfApiAdapter } from './ibjjf-api.js';
import { smoothcompAdapter } from './smoothcomp.js';
import { ajpAdapter } from './ajp.js';
import { sjjifAdapter } from './sjjif.js';

export const adapters: SourceAdapter[] = [
  createIbjjfApiAdapter({ name: 'cbjj', baseUrl: 'https://cbjj.com.br', priority: 3 }),
  createIbjjfApiAdapter({ name: 'ibjjf', baseUrl: 'https://ibjjf.com', priority: 2 }),
  ajpAdapter,
  sjjifAdapter,
  smoothcompAdapter,
];

/** Mapa source → prioridade, derivado dos adapters. Usado no dedup. */
export const priorityBySource: Record<string, number> = Object.fromEntries(
  adapters.map((a) => [a.name, a.priority]),
);
