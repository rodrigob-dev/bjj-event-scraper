// Adapters ativos. Prioridade maior vence em colisão de dedup:
// federações nacionais/estaduais (CBJJ, CBJJO, FJJRIO, FPJJ) = 3 > organizadores dos
// próprios eventos (IBJJF, AJP, JJWL, SJJIF) = 2 > agregador (Smoothcomp) = 1.
// Em empate fica o primeiro da lista: a CBJJ vem antes da FPJJ (etapas nacionais em SP).

import type { SourceAdapter } from '../types.js';
import { createIbjjfApiAdapter } from './ibjjf-api.js';
import { smoothcompAdapter } from './smoothcomp.js';
import { ajpAdapter } from './ajp.js';
import { jjwlAdapter } from './jjwl.js';
import { fjjrioAdapter } from './fjjrio.js';
import { cbjjoAdapter } from './cbjjo.js';
import { sjjifAdapter } from './sjjif.js';
import { fpjjAdapter } from './fpjj.js';

export const adapters: SourceAdapter[] = [
  createIbjjfApiAdapter({ name: 'cbjj', baseUrl: 'https://cbjj.com.br', priority: 3 }),
  cbjjoAdapter,
  fjjrioAdapter,
  fpjjAdapter,
  createIbjjfApiAdapter({ name: 'ibjjf', baseUrl: 'https://ibjjf.com', priority: 2 }),
  ajpAdapter,
  jjwlAdapter,
  sjjifAdapter,
  smoothcompAdapter,
];

/** Mapa source → prioridade, derivado dos adapters. Usado no dedup. */
export const priorityBySource: Record<string, number> = Object.fromEntries(
  adapters.map((a) => [a.name, a.priority]),
);
