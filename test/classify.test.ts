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

describe('classifyType — não-competições que o Smoothcomp lista', () => {
  it('curso de regras e formação de árbitros/staff viram seminar (EN/PT/ES/FR/SE/NO/DE)', () => {
    // Linhas reais do feed de 2026-10-26.
    expect(classifyType('OJA OFFICIAL RULES COURSE - October 2026')).toBe('seminar');
    expect(classifyType('ADCC Referee Course with Marko Leisten')).toBe('seminar');
    expect(classifyType('Premier Grappling Officials: Rules Course (Level 1) - Manchester')).toBe('seminar');
    expect(classifyType('AMMASA + League Boxing Officials Course')).toBe('seminar'); // "League" não salva
    expect(classifyType('FQJJB - Formation sur le règlement IBJJF (Entraîneurs, Arbitres, Compétiteurs)')).toBe('seminar');
    expect(classifyType('Formação Marcadores 2026')).toBe('seminar');
    expect(classifyType('Curso de Árbitros FPJJ')).toBe('seminar');
    expect(classifyType('Capacitación de Árbitros 2026')).toBe('seminar');
    expect(classifyType('Domarutbildning SBJJF')).toBe('seminar');
    expect(classifyType('Dommerkurs NKF 2026')).toBe('seminar');
    expect(classifyType('Kampfrichterlehrgang 2026')).toBe('seminar');
    expect(classifyType('Referee Training Day')).toBe('seminar');
    expect(classifyType('Séminaire avec Rodolfo Vieira')).toBe('seminar');
  });
  it('camp sem palavra de competição vira seminar', () => {
    expect(classifyType('Spårvägen BJJ Höstlovsläger 2026')).toBe('seminar');
    expect(classifyType('Sommerleir 2026')).toBe('seminar');
    expect(classifyType('BJJ Summer Camp 2026')).toBe('seminar');
    expect(classifyType('Trainingslager Grappling')).toBe('seminar');
    expect(classifyType('Camp Pendleton Open 2026')).toBe('competition');
  });
  it('open mat em várias línguas', () => {
    expect(classifyType('PARKROLL LONDON - OPEN MAT')).toBe('open_mat');
    expect(classifyType('Öppen matta fredag')).toBe('open_mat');
    expect(classifyType('Entrenamiento abierto Madrid')).toBe('open_mat');
  });
  it('competições com palavras parecidas continuam competição', () => {
    expect(classifyType('Verde Valley Training Grounds Winter Classic')).toBe('competition');
    expect(classifyType('HOA Jiujitsu League - Stage 2')).toBe('competition');
    expect(classifyType('Konkurs BJJ Warszawa')).toBe('competition');
    expect(classifyType('NORTHERN GI + NOGI BJJ IBJJF & SUBMISSION ONLY RULESET OPEN 11 IN SHEFFIELD')).toBe('competition');
    expect(classifyType('Grand Concours de Jiu-Jitsu')).toBe('competition');
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
