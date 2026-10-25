# events.json v2 — contract between bjj-event-scraper (producer) and sensei-web sync (consumer)

Additive: every v1 field stays, with the same meaning. v2 fields are optional in the schema so a
consumer on v1 keeps working and a producer can roll fields out one source at a time.

## ScrapedEvent (one row of data/events.json)

| field | type | v1/v2 | rule |
|---|---|---|---|
| id | string | v1 | `${slug(title)}|${dateISO}` — UNCHANGED (prod enrollments reference it) |
| sourceId | string | v2 | the source's own stable key: IBJJF/CBJJ `id` from calendar.json (string), Smoothcomp numeric `id` as string. Format `${source}:${nativeId}`, e.g. `smoothcomp:27746`, `ibjjf:3121`. Lets the sync keep ONE DB row across retitles/reschedules. |
| title | string | v1 | trimmed, as the source writes it |
| type | enum | v1 | competition · promotion · open_mat · seminar. Classifier must use word boundaries (`\bbelt\b`, `\bgradua`): "Beltrão" is a city. |
| date | string | v1 | display pt-BR, kept for v1 readers |
| dateISO | string | v1 | YYYY-MM-DD, first day |
| endDateISO | string | v2 | YYYY-MM-DD, last day (IBJJF endDay; Smoothcomp enddate). Equal to dateISO for one-day events. |
| location | string | v1 | free text, kept for v1 readers; v2 consumers prefer the structured fields below |
| venue | string? | v2 | arena/hall name (IBJJF `local`), never a city |
| city | string? | v2 | city only, trimmed, title-cased when the source shouts; no UF/state glued on |
| state | string? | v2 | region code: Brazilian UF or US/CA/AU state code, uppercase 2 letters; absent elsewhere |
| countryCode | string? | v2 | ISO 3166-1 alpha-2 (`BR`, `US`, `PT`). Smoothcomp `location_country`; IBJJF derived from city/region tables; CBJJ always `BR`. Absent when unknown — never guessed. |
| lat, lng | number? | v2 | WGS84 decimal degrees. Smoothcomp `location_lat/long` (parseFloat; drop if NaN/0,0). IBJJF/CBJJ: absent (the sync's place table fills them). |
| gi, nogi | boolean? | v2 | IBJJF eventGroups 'No-Gi' → nogi=true gi=false, else gi=true nogi=false; Smoothcomp categoryGroups: '1' gi, '7'/'3'/'4' nogi (can be both). Absent = unknown (consumer keeps its defaults). |
| kids | boolean? | v2 | IBJJF eventGroups 'Kids' or title matches `\bkids?\b|juvenil|infantil|youth`; Smoothcomp same title rule. |
| organizer | string? | v2 | who runs it, for the chip: `IBJJF`, `CBJJ`, or the Smoothcomp host (`ligabjj.smoothcomp.com` → `LigaBJJ`; title-based for naga/grappling industries/fuji/adcc/newbreed/good fight when the subdomain is generic). |
| sport | enum? | v2 | `bjj` · `grappling` · `judo` · `wrestling` · `mma` · `other`. Smoothcomp from categoryGroups (1/2/7/23/24 bjj, 3/4 grappling, 26 judo, 32/51 wrestling, 19/37/10 mma, else other); IBJJF/CBJJ `bjj`. Producer emits ONLY bjj + grappling rows into events.json (the app is a jiu-jitsu app); the mapping lives in code so widening is one line. |
| registrationDeadlineISO | string? | v2 | YYYY-MM-DD when the source states it (IBJJF detail page the enrich step already downloads; Smoothcomp event page `registration closes`). Absent otherwise — NEVER the event date. |
| source | string | v1 | `ibjjf` · `cbjj` · `smoothcomp` (new adapters add their own) |
| sourceUrl | string | v1 | http(s) only |
| imageUrl | string? | v1 | http(s) only |
| accentColor | string? | v1 | #RRGGBB |
| scrapedAt | string | v1 | ISO datetime |

Dedup: still `slug(title)|dateISO`, priority cbjj > ibjjf > smoothcomp. The same physical event on IBJJF and Smoothcomp
with different titles stays two rows (accepted; the consumer may later merge by sourceId tables).

Validation (src/validate.ts): no past rows, no duplicate id, no duplicate sourceId, lat/lng in range, countryCode 2 uppercase letters.

## Consumer rules (sensei-web lib/bjj/syncCompetitions.ts)

1. Match an existing Competition row by `sourceKey` (= sourceId) first, then by `id`, then by manual dedupKey. Update in place; never change a matched row's `id`.
2. `city/state/country/venue`: use v2 fields when present (`country` = Portuguese name from countryCode via one table; unknown code → the code itself, never 'Exterior'); fall back to `parseLocation(location)` only when v2 fields are absent.
3. `lat/lng`: store when present; else `coordsDaCompeticao` at read time as today.
4. `registrationDeadline`: v2 value or NULL (column becomes nullable). Never the event date.
5. `endDate`, `gi/nogi`, `kids`, `organizer`: store; nogi from title (`no-?gi|nogi`) only when the feed has no flag.
6. Retire: after a successful fetch, every scraper-owned row (id contains '|' or sourceKey set) with `date >= today` that is NOT in the feed: delete when it has no CompetitionEnrollment; otherwise keep and set `status = 'closed'`. Past rows are never touched. Log what was retired.
7. `--dry-run` on `prisma/sync-events.ts`: fetch + compute create/update/retire and print them, write nothing. Safe against prod.
8. `prisma/seed-competitions.ts` must never `deleteMany` the table; it upserts its rows by id, and refuses to run when DATABASE_URL looks like production unless `--force`.
