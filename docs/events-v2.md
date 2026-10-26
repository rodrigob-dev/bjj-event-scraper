# events.json v2 — contract between bjj-event-scraper (producer) and sensei-web sync (consumer)

Additive: every v1 field stays, with the same meaning. v2 fields are optional in the schema so a
consumer on v1 keeps working and a producer can roll fields out one source at a time.

## ScrapedEvent (one row of data/events.json)

| field | type | v1/v2 | rule |
|---|---|---|---|
| id | string | v1 | `${slug(title)}|${dateISO}` — UNCHANGED (prod enrollments reference it) |
| sourceId | string | v2 | the source's own stable key: IBJJF/CBJJ `id` from calendar.json (string), Smoothcomp numeric `id` as string. Format `${source}:${nativeId}`, e.g. `smoothcomp:27746`, `ibjjf:3121`. Lets the sync keep ONE DB row across retitles/reschedules. |
| title | string | v1 | trimmed, as the source writes it |
| type | enum | v1 | competition · promotion · open_mat · seminar. Classifier must use word boundaries (`\bbelt\b`, `\bgradua`): "Beltrão" is a city. Nobody competes at a rules/referee/staff course (`course`, `curso`, `formação`, `formation`, `-kurs`, `-utbildning`, `-lehrgang`) or a camp (`camp`, `-läger`, `-leir`, only without a competition word): `seminar`, so the consumer drops it. |
| date | string | v1 | display pt-BR, kept for v1 readers |
| dateISO | string | v1 | YYYY-MM-DD, first day |
| endDateISO | string | v2 | YYYY-MM-DD, last day (IBJJF endDay; Smoothcomp enddate). Equal to dateISO for one-day events. |
| location | string | v1 | free text, kept for v1 readers; v2 consumers prefer the structured fields below |
| venue | string? | v2 | arena/hall name (IBJJF `local`), never a city |
| city | string? | v2 | city only, trimmed, title-cased when the source shouts; no UF/state glued on |
| state | string? | v2 | region code: Brazilian UF or US/CA/AU state code, uppercase 2 letters; absent elsewhere |
| countryCode | string? | v2 | ISO 3166-1 alpha-2 (`BR`, `US`, `PT`). Smoothcomp `location_country`; IBJJF derived from city/region tables; CBJJ always `BR`. Absent when unknown — never guessed. |
| lat, lng | number? | v2 | WGS84 decimal degrees. Smoothcomp and AJP `location_lat/long` (parseFloat; drop if NaN/0,0). Every other source: filled after dedup from the producer's city table (`src/normalize/places.ts`), else from the committed Nominatim cache (`data/geocode-cache.json`), keyed `city\|state\|countryCode`; a dedup winner without coordinates inherits the loser's. Still absent when the city is unknown to both. |
| geo | enum? | v2 | where lat/lng came from: `source` (the feed's own coordinates, venue-level), `table` (city centre from the producer's table), `nominatim` (city centre from OpenStreetMap, cached). Present on every row that has lat/lng; never without them. A consumer may prefer its own venue lookup over a `table`/`nominatim` city centre. |
| gi, nogi | boolean? | v2 | IBJJF eventGroups 'No-Gi' → nogi=true gi=false, else gi=true nogi=false; Smoothcomp categoryGroups: '1' gi, '7'/'3'/'4' nogi (can be both). Absent = unknown (consumer keeps its defaults). |
| kids | boolean? | v2 | IBJJF eventGroups 'Kids' or title matches `\bkids?\b|juvenil|infantil|youth`; Smoothcomp same title rule. |
| organizer | string? | v2 | who runs it, for the wordmark, card mark, detail chip and Federation filter: the `nome` of an entry of the approved base `data/organizadores.json` (`IBJJF`, `CBJJ`, `NAGA`, `Grappling Industries`, `Compnet`…). Never `Smoothcomp` (the registration platform, not a federation), never a raw Smoothcomp subdomain, never free title text. Absent when the row matches no entry: the app shows no wordmark and files it under "Other". Resolution below. |
| organizerId | string? | v2 | the `id` (kebab) of the same base entry (`naga`, `grappling-industries`). Present exactly when `organizer` is. |
| sport | enum? | v2 | `bjj` · `grappling` · `judo` · `wrestling` · `mma` · `other`. Smoothcomp from categoryGroups (1/2/7/23/24 bjj, 3/4 grappling, 26 judo, 32/51 wrestling, 19/37/10 mma, else other); IBJJF/CBJJ `bjj`. Producer emits ONLY bjj + grappling rows into events.json (the app is a jiu-jitsu app); the mapping lives in code so widening is one line. |
| registrationDeadlineISO | string? | v2 | YYYY-MM-DD when the source states it (IBJJF detail page the enrich step already downloads; JJWL "Application deadline"; NABJJF "Closes Jan 13" on the price ladder (no year: the event's, or the one before for a December→January wrap); FJJRIO "Término da Inscrição"; CBJJO "Inscrições ATÉ" — dropped when the portal closes after the event starts). Absent otherwise — NEVER the event date. Smoothcomp/AJP/SJJIF do not expose it without JS. |
| source | string | v1 | where the row was scraped, never who runs it (`organizer` says that; `smoothcomp` is the registration platform, not a federation): `ibjjf` · `cbjj` · `smoothcomp` · `ajp` · `sjjif` · `jjwl` · `fjjrio` · `cbjjo` · `fpjj` · `nabjjf` (new adapters add their own). sourceId native keys: AJP/SJJIF/CBJJO numeric ids, JJWL and NABJJF the event slug, FJJRIO the opaque id as base64url without padding, FPJJ `<year>-<id>` (ids restart per yearly calendar). |
| sourceUrl | string | v1 | http(s) only |
| imageUrl | string? | v1 | http(s) only |
| accentColor | string? | v1 | #RRGGBB |
| scrapedAt | string | v1 | ISO datetime |

Dedup: still `slug(title)|dateISO`, priority cbjj = cbjjo = fjjrio = fpjj (3) > ibjjf = ajp = jjwl = nabjjf = sjjif (2) > smoothcomp (1); on a tie the registry order wins (cbjj before fpjj, nabjjf before sjjif).
Second pass (`dedupeSameEvent`, after the slug pass, before geocoding): two rows from DIFFERENT sources are one event
when they share city + countryCode (or are ≤ 15 km apart, by own coordinates or the city table), their day ranges
overlap or start ≤ 1 day apart, and one title's token set contains the other's after dropping years, federation
acronyms, championship/campeonato/tournament, open/international, jiu/jitsu/bjj and de/do/da/the/of. Never merged:
only one title kids (kids/infantil/juvenil/youth/crianças/festival), only one title no-gi (no-gi/nogi/sem kimono),
a smaller title that is just the city name, or two rows of the same source (a kept row absorbs at most one row per
source). The kept row is the higher priority (tie: registry order) and fills its missing coordinates, deadline,
venue and image from the dropped one; the slug pass fills the same way. Each merged pair is logged.

Validation (src/validate.ts): no past rows, no duplicate id, no duplicate sourceId, lat/lng in range, countryCode 2 uppercase letters, every row with lat/lng carries `geo`, `organizer` and `organizerId` together, every `organizerId` an entry of `data/organizadores.json` and `organizer` equal to that entry's `nome`.

## Organizer base (data/organizadores.json)

A curated list of the organizations the feed may name, versioned in this repo. Only an entry here can become a row's
`organizer`, so a new brand shows up in the app by adding it here, not by touching an adapter.

| field | rule |
|---|---|
| id | kebab-case, unique; becomes `organizerId` |
| nome | display name, unique; becomes `organizer` (keep the brand's own short form: `NAGA`, `FUJI BJJ`, `Compnet`) |
| tipo | `federacao` (governing body: IBJJF, CBJJ, national federations) · `liga` · `circuito` (tour/series) · `organizador` (promotion or brand) |
| site | https URL proving the organization exists and runs events: its official site, else its own Smoothcomp home (`https://<host>.smoothcomp.com`), else one of its event pages |
| hosts | the Smoothcomp subdomains it publishes under (`naga` for `naga.smoothcomp.com`); a host has one owner |
| padroes | title patterns (JavaScript regex source, ≥ 3 chars), matched against the title without accents or case and with Unicode word boundaries added around them (`NAGA` does not match `Nagano`). Leave empty when the name is generic or cited as a ruleset (IBJJF has none: Smoothcomp titles say "IBJJF rules") |
| cor | optional `#RRGGBB` brand colour, only when the organization's own site or logo shows it (never guessed from the name or a flag). Sources (2026-10-26): Odd Fox `#DB5C15` (oddfoxevents.co.uk CSS `--brand`, same as the logo); NABJJF `#C60A0A` (logo SVG fill, nabjjf.com); FUJI BJJ `#CE0E2D` (logo mark SVG, fujibjj.com); Grappling X `#691C26` (grapplingx.com `theme-color`); AGF `#EA0029` (americangrapplingfederation.com CSS, red of the logo); Chewjitsu Open `#AF001F` (site CSS and the "Deep Red" logo); Pro Sport Grappling `#BE0000` (logo PNG); Lutador `#FF8500` (lutadoropen.com logo); JBJJF `#272681` (jbjjf.com logo); NewBreed `#F3EC1A` (newbreedbjj.com logo) |
| tituloVenceHost | optional `true`: a brand that always runs its own events. When it is the title's best match it beats the Smoothcomp host (`Grappling Industries TORONTO` on the Ontario Jiu-Jitsu account → Grappling Industries). Opt-in per entry, because "a brand in the title beats a federation host" as a general rule would also flip the ADCC Opens that BJJFP and SSWF really run. Set on: `grappling-industries` |

Resolver (`src/normalize/organizador.ts`, applied to every source during normalization and again to rows preserved from
the previous run):

1. What the source itself says. A Smoothcomp event: its subdomain, looked up in `hosts`, unless the title's best match
   (step 2) is an entry flagged `tituloVenceHost`, which then wins. A federation calendar (IBJJF, CBJJ, AJP, SJJIF…): the
   organizer the adapter declares, looked up by `id` or `nome`; `CBJJ/FPJJ` takes the first part that is in the base.
2. Title patterns: the longest matched text wins, then the earliest in the title, then base order. A match next to a
   ruleset word (`rules`, `reglas`, `regras`, `règlement`… within two words) does not count: "Reglas IBJJF&ADCC" names
   the rules, not the organizer.
3. Nothing: both fields absent. A federation name an adapter declares that is not in the base is logged as a
   `::notice::` so it can be added.

Federation = the sanctioning body. Smoothcomp calls every organizer account a "federation" (`/en/federation/<n>/events`),
and a real federation's account lists the events it runs and the ones it only sanctions (bjjsweden.se files the club
events under "Sanktionerade tävlingar"; USA Grappling says it "sanctions competitions across the country"). The feed
does not split the two: a club event on a `federacao` entry's host (`Battle of Stockholm #25` on `sbjjf`, `VERSUS
Championship 37` on `bjjfnl`) gets the federation as `organizer`, which is what a member filtering by their federation
wants: the event runs under its sanction. A brand that runs its own events under a federation's sanction is the
`tituloVenceHost` case above. A separate `sanctionedBy` field was not added: no consumer reads one yet, and it would mean
a web and an app change for the same chip.

Smoothcomp platform noise is dropped in the adapter (`isPlatformNoise` in `src/adapters/smoothcomp.ts`), after the sport
filter: Smoothcomp's own test event (title `\btest event\b`, or `location_country` `AQ`: "Smoothcomp Test Event" sits
in Antarctica, city "That cold place"), and a row that started before today and spans more than 31 days (a 2025 national
left open until 2026-12, a year-long staff course), which the no-past rule would otherwise keep. A long event that has not
started yet stays. The run logs each dropped row.

Adding an entry: confirm the organization runs recurring events (a gym's in-house tournament is not an entry), find the
site, add the object with its Smoothcomp `hosts` and any distinctive `padroes` (a federation whose account is its only
signal gets `padroes: []`; its display name is the one its Smoothcomp home shows), run `npx vitest run --config
./vitest.config.ts` (the base's invariants are tested: unique ids and hosts, https sites, valid patterns) and
`npm run scrape && npm run validate`.

## Consumer rules (sensei-web lib/bjj/syncCompetitions.ts)

1. Match an existing Competition row by `sourceKey` (= sourceId) first, then by `id`, then by manual dedupKey. Update in place; never change a matched row's `id`.
2. `city/state/country/venue`: use v2 fields when present (`country` = Portuguese name from countryCode via one table; unknown code → the code itself, never 'Exterior'); fall back to `parseLocation(location)` only when v2 fields are absent.
3. `lat/lng`: store when present; else `coordsDaCompeticao` at read time as today.
4. `registrationDeadline`: v2 value or NULL (column becomes nullable). Never the event date.
5. `endDate`, `gi/nogi`, `kids`, `organizer` + `organizerId`: store; nogi from title (`no-?gi|nogi`) only when the feed has no flag.
6. Retire: after a successful fetch, every scraper-owned row (id contains '|' or sourceKey set) with `date >= today` that is NOT in the feed: delete when it has no CompetitionEnrollment; otherwise keep and set `status = 'closed'`. Past rows are never touched. Log what was retired.
7. `--dry-run` on `prisma/sync-events.ts`: fetch + compute create/update/retire and print them, write nothing. Safe against prod.
8. `prisma/seed-competitions.ts` must never `deleteMany` the table; it upserts its rows by id, and refuses to run when DATABASE_URL looks like production unless `--force`.
