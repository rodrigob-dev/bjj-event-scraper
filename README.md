# bjj-event-scraper

Coleta datas de competições futuras de federações de jiu-jitsu e gera um
`data/events.json` versionado, consumido pelo app **BJJ Avatar**.

## Como funciona

Padrão **git-scraping**: um GitHub Action roda todo dia (06:00 UTC), coleta os
eventos, valida e commita o `events.json` se mudou — e, se mudou, dispara o
`repository_dispatch` `scraper-updated` no sensei-web (secret
`SENSEI_WEB_DISPATCH_TOKEN`; sem ele o passo é pulado). O app lê esse JSON via fetch com ISR
(revalidação diária) — sem backend.

**Coleta HTTP-first**: cada fonte é batida por requisição HTTP direta no seu
endpoint JSON interno. Playwright (headless) existe só como *fallback* isolado
(`src/browser.ts`), caso uma fonte futura não exponha dados sem navegador. Hoje
**nenhuma fonte precisa de browser**.

## Fontes

| Fonte | Estratégia | Como entrega os dados |
|-------|-----------|------------------------|
| IBJJF | `http` | `GET /api/v1/events/calendar.json` (headers de XHR) → `infosite_events[]` |
| CBJJ | `http` | mesma API do IBJJF em `cbjj.com.br` (CMS compartilhado) |
| Smoothcomp | `http` | array `var events = [...]` embutido no HTML de `/en/events/upcoming`; mundo inteiro, só eventos cujas categorias mapeiam para `bjj`/`grappling` (tabela em `src/adapters/smoothcomp.ts`) |
| AJP (UAEJJF) | `http` | `ajptour.com/en/events/upcoming` é um Smoothcomp em marca própria: mesmo `var events` (data/país ISO, coordenadas); modalidade pelo título. robots pede `Crawl-delay: 10`, respeitado |
| SJJIF | `http` | home `sjjif.com/` renderiza "Upcoming Events" (SJJIF) + "Sanctioned Events" (SJJCF, ASJJF, SJJJF…): título, data por extenso, local, país por extenso. `/calendar/upcomingEvents` é só JS |
| JJWL | `http` | menu TOURNAMENTS de `/jjwl/tournaments` lista `/events/<slug>` (um por GI/NoGI × Youth/Adults); cada página traz "Event Day", "Event Address", "Application deadline" — ~32 páginas por coleta |
| FJJRIO | `http` | home `fjjrio.com.br/` renderiza "Próximos Eventos" (categoria, data PT, ginásio); a página do evento dá "Término da Inscrição" |
| CBJJO | `http` | o calendário em cbjjo.com.br é JPG; a lista é o portal de inscrições `cbjjo.beta.portalsamurai.com` (cards) + página do evento ("DE … ATÉ …", "Inscrições ATÉ", "Local") |
| NABJJF | `http` | `nabjjf.com/tournaments` (Next.js SSR) tem a aba "Upcoming" com `/events/<slug>`; a página do evento traz `<dl>` Date / Venue + endereço / Format (Gi & No-Gi, Kids…) e o prazo na escada de preços ("Closes Jan 13"). ~5 páginas por coleta; robots proíbe `/api/` (não usado) |
| FPJJ | `http` | fpjj.com.br → `www.fpjjcompetidor.com.br/calendario-<ano>/` (WordPress) traz um `const eventsData = [...]` inline (título, data PT sem ano, `local` "Cidade - SP" ou ginásio, `realizacao` FPJJ ou CBJJ/FPJJ); sem link de inscrição, sourceUrl é o calendário. Busca o ano corrente e o seguinte (404 até publicarem) |

Prioridade em dedup: federações nacionais/estaduais (`cbjj`, `cbjjo`, `fjjrio`, `fpjj` = 3) >
organizadores dos próprios eventos (`ibjjf`, `ajp`, `jjwl`, `nabjjf`, `sjjif` = 2) > agregador (`smoothcomp` = 1).
Em empate fica o primeiro do registry (CBJJ antes da FPJJ; NABJJF antes da SJJIF, que lista os eventos dela).
Duas passadas: chave exata `slug(título)|dateISO`, depois o mesmo evento com outro título em outra fonte
(`dedupeSameEvent` em `src/normalize/dedup.ts`: mesma cidade ou ≤ 15 km, dias que se cruzam, um título contém o
outro sem as palavras genéricas; nunca kids × adulto, gi × no-gi, título só com a cidade, nem duas linhas da mesma
fonte). Quem fica herda de quem sai coordenadas, prazo, ginásio e capa que não tiver. O log lista cada par fundido.

Sondada e deixada de fora (2026-10-25): **BJJ Tour** (4 eventos, inscrição no smoothcomp.com — já
no feed; página com spam injetado). A NABJJF entrou mesmo com os 4 eventos já no feed (2 pela SJJIF,
2 só pelo Smoothcomp): é a única fonte que dá o prazo, o ginásio com endereço e o formato deles.

## Scripts

```bash
npm install
npm run scrape     # coleta as fontes e grava data/events.json
npm run validate   # valida o JSON (schema zod + datas futuras + sem duplicatas)
npm test           # testes de parse/datas/dedup com fixtures (offline)
npm run typecheck  # tsc --noEmit
npm run discover -- <url>   # Playwright: descobre endpoint JSON de uma fonte nova
```

## Adicionar uma fonte nova

1. Rode `npm run discover -- <url-da-fonte>` e capture as requisições de rede.
   Se houver endpoint JSON utilizável → adapter `strategy: 'http'`. Se não →
   `strategy: 'browser'` (usa `withPage` de `src/browser.ts`).
2. Crie `src/adapters/<fonte>.ts` implementando `SourceAdapter` (`fetchRaw` +  
   `parse` → `RawEvent[]`).
3. Registre em `src/adapters/registry.ts` com uma `priority`.
4. Adicione um fixture em `test/fixtures/` e um teste em `test/adapters.test.ts`.

## Schema de saída (`data/events.json`)

`ScrapedEvent[]` — estende o `BJJEvent` do app com proveniência
(`dateISO`, `source`, `sourceUrl`, `scrapedAt`). Ordenado por `dateISO`.

### Campos v2

Aditivos e opcionais (`src/schema.ts`): um leitor v1 continua funcionando, e
cada fonte preenche só o que sabe. **Ausente = desconhecido, nunca chute.**
`id` segue `slug(title)|dateISO` — inscrições em produção apontam pra ele.

| campo | regra |
|-------|-------|
| `sourceId` | chave estável da fonte: `ibjjf:3121`, `cbjj:2968`, `smoothcomp:27746`. Única no JSON. |
| `endDateISO` | último dia (`endDay` IBJJF, `enddate` Smoothcomp); igual a `dateISO` em evento de 1 dia. "Passado" = depois do último dia. |
| `venue` | arena/ginásio (IBJJF `local`), nunca cidade |
| `city` / `state` / `countryCode` | cidade limpa (`src/normalize/places.ts`: tira CEP, UF grudada, caixa alta); `state` = UF ou código US/CA/AU; `countryCode` ISO alpha-2 — Smoothcomp `location_country`, IBJJF pela tabela `src/adapters/ibjjf-places.ts` e pelo `<address>` da página de detalhe, CBJJ sempre `BR` |
| `lat` / `lng` | Smoothcomp/AJP (`0,0` e `null` ficam ausentes); as outras fontes ganham o centro da cidade pelo geocodificador (abaixo) |
| `geo` | de onde vieram `lat`/`lng`: `source` (a fonte, nível de ginásio) · `table` (`COORDS_BY_PLACE` em `src/normalize/places.ts`) · `nominatim` (cache `data/geocode-cache.json`). Sempre presente quando há coordenadas |
| `gi` / `nogi` / `kids` | IBJJF `eventGroups` + título; Smoothcomp `categoryGroups` (`1` gi; `7`/`3`/`4`/`24` no-gi) + título |
| `organizer` / `organizerId` | `nome` e `id` de uma entrada da base aprovada `data/organizadores.json` (`NAGA`/`naga`, `IBJJF`/`ibjjf`). Nunca "Smoothcomp" (é a plataforma de inscrição, não uma federação) nem subdomínio cru; sem casamento, os dois ficam ausentes. Ver **Organizadores** abaixo |
| `sport` | `bjj` · `grappling` (os únicos publicados) · `judo` · `wrestling` · `mma` · `other` |
| `registrationDeadlineISO` | só quando a página IBJJF/CBJJ declara ("Registration deadline" / "Prazo de Inscrição", ou a última faixa de preço); sempre anterior ao evento. Smoothcomp não expõe sem JS (Cloudflare) |

Validação (`npm run validate`): schema + sem passado + sem `id`/`sourceId`
duplicado + `lat`/`lng` no range + `countryCode` `^[A-Z]{2}$` + `geo` em toda
linha com coordenadas + `organizerId` da base com `organizer` igual ao `nome` dela. O contrato completo (produtor ↔ consumidor sensei-web)
está em `docs/events-v2.md`.

### Organizadores

`data/organizadores.json` é a lista curada de quem o feed pode nomear (federações, ligas,
circuitos e marcas de torneio). Cada entrada: `id` (kebab, vira `organizerId`), `nome` (vira
`organizer`), `tipo` (`federacao` · `liga` · `circuito` · `organizador`), `site` (https que prova que
existe: o site oficial, senão a casa dela no Smoothcomp), `hosts` (subdomínios do Smoothcomp),
`padroes` (regex de título, ≥ 3 caracteres, sem acento/caixa, com borda de palavra) e `cor` opcional.

O resolvedor (`src/normalize/organizador.ts`) roda em toda fonte: primeiro o que a fonte afirma
(subdomínio do evento no Smoothcomp; organizador declarado pelo adapter nos calendários de
federação, `CBJJ/FPJJ` → o primeiro da base), depois os padrões de título (o trecho mais longo
vence; casamento colado a "rules"/"reglas"/"regras" não conta), senão nada. Para incluir uma
organização: confirme que ela roda eventos recorrentes (torneio interno de academia não entra),
ache o site, adicione a entrada e rode os testes + `npm run scrape && npm run validate`. Detalhes em
`docs/events-v2.md`.

### Geocodificação

Depois do dedup, toda linha com `city` + `countryCode` e sem `lat`/`lng` passa por
`src/normalize/geocode.ts`: primeiro a tabela `COORDS_BY_PLACE` (`src/normalize/places.ts`,
chave `cidade|região|país`), depois o cache `data/geocode-cache.json` (commitado), e só então —
e só com `GEOCODE=1` — o Nominatim (OpenStreetMap). A coleta diária roda sem `GEOCODE` e não
faz nenhuma requisição; quando o log mostrar `::notice::[geocode] N cidade(s) sem coordenadas`,
rode `GEOCODE=1 npm run scrape` uma vez e commite o cache. Um miss fica no cache como `null`
(apague a entrada para tentar de novo); cidade estável vale promover do cache para a tabela.
Política do Nominatim cumprida: 1 req/s, User-Agent identificável, resultado cacheado. Um
vencedor de dedup sem coordenadas herda as do perdedor (mesmo evento, mesmo ginásio).

## Integração com o app

O app lê via `getEvents()` em `lib/data/activity.ts`, que combina as
competições do scraper com os eventos manuais da academia (graduações/open
mats) e faz fallback para o mock se o fetch falhar. Configure a env
`NEXT_PUBLIC_EVENTS_URL` apontando para o raw deste repo após o primeiro push.

## Ética

robots.txt respeitado por host · rate-limit ~1 req/2.5s · User-Agent
identificável · retry/backoff só em 5xx/timeout · merge não-destrutivo (uma
fonte que cai não zera o JSON).
