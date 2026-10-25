import { describe, it, expect } from 'vitest';
import { classifyType, kidsFromTitle } from '../src/normalize/classify.js';

describe('classifyType — fronteiras de palavra', () => {
  it('"Beltrão" é cidade, não "belt"', () => {
    expect(classifyType('COMPNET DE PRIMAVERA FRANCISCO BELTRÃO 2026')).toBe('competition');
  });
  it('"Belt" como palavra vira promotion', () => {
    expect(classifyType('Black Belt Promotion Ceremony')).toBe('promotion');
    expect(classifyType('Graduação de Faixas 2026')).toBe('promotion');
    expect(classifyType('Belt Graduation Night')).toBe('promotion');
  });
  it('faixa como divisão de torneio não é graduação', () => {
    expect(classifyType('Precision White and Grey Belt SUB ONLY')).toBe('competition');
    expect(classifyType('RISE BJJ - WHITE & BLUE BELT ROUND ROBIN TOURNAMENT')).toBe('competition');
    expect(classifyType('Dream BJJ Kids Gi: White Belt Edition 2027')).toBe('competition');
    expect(classifyType('Blue Belt Ceremony')).toBe('competition'); // divisão colorida sem palavra de graduação
    expect(classifyType('Belt Ceremony 2026')).toBe('promotion');
    expect(classifyType('Black Belt Promotion Ceremony')).toBe('promotion');
  });

  it('"Copa Faixa Preta" e "Open" seguem competição', () => {
    expect(classifyType('Copa Faixa Preta de Jiu-Jitsu')).toBe('competition');
    expect(classifyType('Rio Fall International Open IBJJF Jiu-Jitsu Championship 2026')).toBe('competition');
    expect(classifyType('Belton Open 2026')).toBe('competition'); // "Belton" ≠ "belt"
  });
  it('seminar / open mat', () => {
    expect(classifyType('Seminário com Roger Gracie')).toBe('seminar');
    expect(classifyType('Open Mat de Natal')).toBe('open_mat');
    expect(classifyType('Semi-final Open 2026')).toBe('competition');
  });
  it('typeHint da fonte prevalece quando é explícito', () => {
    expect(classifyType('Encontro de Verão', 'seminar')).toBe('seminar');
    expect(classifyType('Qualquer coisa', 'competition')).toBe('competition');
  });
});

describe('kidsFromTitle', () => {
  it('kids, juvenil, infantil, youth, crianças', () => {
    expect(kidsFromTitle('Pan Kids IBJJF 2026')).toBe(true);
    expect(kidsFromTitle("Brave Kid's Cup")).toBe(true);
    expect(kidsFromTitle('Copa Juvenil de Jiu-Jitsu')).toBe(true);
    expect(kidsFromTitle('Campeonato Sul Americano - Crianças 2026')).toBe(true);
    expect(kidsFromTitle('NSW Youth Championships')).toBe(true);
  });
  it('não dispara em "Kidston" nem em títulos adultos', () => {
    expect(kidsFromTitle('Kidston Open 2026')).toBe(false);
    expect(kidsFromTitle('World Master IBJJF 2026')).toBe(false);
  });
});
