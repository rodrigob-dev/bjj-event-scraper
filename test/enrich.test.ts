import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractBgLogo } from '../src/enrich/ibjjf-image.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const fixture = (f: string) => readFileSync(resolve(DIR, 'fixtures', f), 'utf8');

describe('extractBgLogo', () => {
  const html = fixture('ibjjf-detail.html');

  it('extrai a URL do bg-logo do CSS inline (parando na extensão, ignorando &#39;)', () => {
    const url = extractBgLogo(html, 'https://ibjjf.com');
    expect(url).toBe(
      'https://ibjjf.com/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaHBBbTVKIn19--15770b55e09f43be71c72904bbd5cd385fe56e64/bg-logo_european-kids-ibjjf-2026.jpg',
    );
  });

  it('prefixa o origin certo (CBJJ)', () => {
    const url = extractBgLogo(html, 'https://cbjj.com.br');
    expect(url?.startsWith('https://cbjj.com.br/rails/active_storage/')).toBe(true);
  });

  it('retorna null quando não há bg-logo', () => {
    expect(extractBgLogo('<html><body>sem imagem</body></html>', 'https://ibjjf.com')).toBeNull();
  });

  it('não captura o website-white-logo (só bg-logo)', () => {
    const url = extractBgLogo(html, 'https://ibjjf.com');
    expect(url).toContain('bg-logo');
    expect(url).not.toContain('website-white-logo');
  });
});

import { parseDetailPage, extractRegistrationDeadline, extractAddress, parseDeadlineDate } from '../src/enrich/ibjjf-detail.js';

describe('página de detalhe IBJJF (EN) — Kansas City Open 2026', () => {
  const html = fixture('ibjjf-detail-kansas-2026.html');
  const detail = parseDetailPage(html, 'https://ibjjf.com');

  it('prazo de inscrição do bloco "Registration deadline"', () => {
    expect(detail.registrationDeadlineISO).toBe('2026-10-30');
  });
  it('endereço estruturado: arena, cidade, estado, país', () => {
    expect(detail).toMatchObject({ venue: 'Hy Vee Arena', city: 'Kansas City', state: 'MO', countryCode: 'US' });
  });
  it('imagem do banner', () => {
    expect(detail.imageUrl).toMatch(/^https:\/\/ibjjf\.com\/rails\/active_storage\/.*bg-logo.*\.jpg$/);
  });
});

describe('página de detalhe CBJJ (PT) — Recife Spring Open 2026', () => {
  const html = fixture('cbjj-detail-recife-2026.html');
  const detail = parseDetailPage(html, 'https://cbjj.com.br');

  it('prazo de inscrição do bloco "Prazo de Inscrição" (não o prazo de cadastro, 06/10)', () => {
    expect(detail.registrationDeadlineISO).toBe('2026-10-22');
  });
  it('endereço em PT: Brasil → BR, UF antes do CEP', () => {
    expect(detail).toMatchObject({ venue: 'Ginásio Geraldão', city: 'Recife', state: 'PE', countryCode: 'BR' });
  });
});

describe('prazo de inscrição — fallbacks', () => {
  it('sem bloco de prazo, usa a última faixa de preço ("until …")', () => {
    const html = `<div class='prices'><div class='price-string'>$134.00 (USD)   until October 10th, 2025</div>
      <div class='price-string'>$162.00 (USD)   until November 1st, 2025</div></div>`;
    expect(extractRegistrationDeadline(html)).toBe('2025-11-01');
  });
  it('faixas em PT ("até …")', () => {
    const html = `<div class='price-string'>R$ 258,00 (BRL) até 25 de setembro de 2026</div>
      <div class='price-string'>R$ 281,00 (BRL) até 22 de outubro de 2026</div>`;
    expect(extractRegistrationDeadline(html)).toBe('2026-10-22');
  });
  it('sem prazo na página → undefined (nunca a data do evento)', () => {
    expect(extractRegistrationDeadline('<html><body>Event on June 5, 2026</body></html>')).toBeUndefined();
    expect(parseDetailPage('<html></html>', 'https://ibjjf.com')).toEqual({});
  });
  it('parseDeadlineDate aceita ordinal EN e extenso PT', () => {
    expect(parseDeadlineDate('October 30th, 2026')).toBe('2026-10-30');
    expect(parseDeadlineDate('22 de outubro de 2026')).toBe('2026-10-22');
    expect(parseDeadlineDate('a definir')).toBeUndefined();
  });
  it('endereço com país fora da tabela fica sem countryCode e sem estado', () => {
    const html = `<address><div class='local'>Arena</div><div class='complement'>Cidade</div>
      <div class='complement2'><div class="complement2">XX - 123</div></div><div class='country'>Atlantis</div></address>`;
    expect(extractAddress(html)).toEqual({ venue: 'Arena', city: 'Cidade' });
  });
});
