# Club names, signed numbers and news dates: screen brief

Owner request, 2026-10-07: "go" on the critique plan
(`.impeccable/critique/2026-10-06T20-00-17Z__src-routes.md`, priority issue 5, "Club identity,
numbers and dates inconsistent"; command `harden`, with `colorize` for the white club). Branch
`claude/club-names-numbers-dates`, from `main` at `1c12b5b0`.

Five frontend items:

1. News dates are formatted without a time zone, so the server and the browser print different
   days near midnight.
2. A signed goal difference ("+2", "-6") carries no direction of its own in Arabic.
3. A club has several names and its crest letters are not unique (Raja and Zemamra are both
   "RCA"; in Arabic CODM and Maghreb Fès are both "الم").
4. A white club colour (Zemamra) disappears on the white page.
5. Fantasy rankings print 0 for a journée score nobody knows yet.

Related open pull requests, read before writing this (not merged into `main`):

- **#265** (`claude/phase0-unique-club-codes`) makes crest letters unique at run time, inside the
  football presenter: a club with a code in the data keeps it, a club that collides gets a longer
  one ("RCA Zemamra" becomes "RCAZ"). This brief instead writes one code per current club into the
  existing per-club table (`src/lib/kits.ts`). It keeps #265's pick for Zemamra ("RCAZ") and Raja
  ("RCA"). Both change `presentFootballClub` in `src/services/football.ts`, so they conflict there.
- **#268** (`claude/phase0-crest-fallback`) keeps the letters visible while a crest loads. Not
  touched here; the letters it reveals are the ones this brief defines.
- **#272** (`claude/phase0-match-compact-header`) gives the compact match bar a hairline so a
  white half "keeps its edge". This brief fixes the colour in the palette instead, so the white
  half no longer exists in the light theme. The two do not touch the same file.
- **#348** (`claude/beautiful-clarke-ro1m6l`) is the backend change that hides the owner's, staff
  and test accounts from the Fantasy and Pronostics boards (migration
  `20261005100000_rankings_hide_owner_accounts.sql`). Item 5 here covers only the 0-versus-dash
  display and does not redo it.
- **#252** (`codex/local-match-times`) shows times in each visitor's zone. PRODUCT.md's rule is
  Morocco time everywhere, so item 1 follows the Morocco clock.

## What was inspected and measured on untouched `main`

The app ran from this worktree on `127.0.0.1:5305` (`vite dev --mode production`, reading
production through the public key). The server runs in UTC (Node 22.22.0, tz 2025b). Chromium 149
ran with `timezoneId: "Africa/Casablanca"`. Its time-zone data still puts Morocco at UTC+1 after
2026-09-20 (see `src/lib/morocco-time.ts`). Pages were only loaded: nothing was signed in,
submitted or written.

- **Dates.** `formatRelativeTime` and `formatFullDate` (`src/lib/format-time.ts`) and
  `formatArticleDate` (`src/components/news/news-data.ts`) call `Intl.DateTimeFormat` with no
  `timeZone`. They run in `ArticleCard` (the news cards and the home carousel), on the article
  page and in the notifications list. Console on load: `/news` threw
  "Hydration failed because the server rendered text didn't match the client". The article
  `/news/2064690e-…` logged "A tree hydrated but some attributes of the server rendered HTML didn't
  match" (its `title` carries the full date and time, an hour apart). `/` logged nothing at the time
  of the capture: the error needs a card old enough to print a date and published late in the
  evening.
- **Signed numbers.** `formatGoalDifference` returns "+2" / "-6" and is rendered in a `<bdi>` with
  no direction in `StandingsTable`, `HeadToHead` (the "Face à face" table), `ClubOverview` (the
  mini table on the club page) and `ClubHero` (the club page's key numbers). Measured from the
  pixels in Chromium 149, phone and desktop: every cell reads "+2", "-1", "-6" in Arabic. Chromium
  treats a `dir=auto` run with no letters in it as left-to-right. Nothing in the markup says so,
  so the order depends on the engine (WebKit could not be run here). The Fantasy points page already
  sets `dir="ltr"` on its signed figures (`fantasy.points.tsx`).
- **Club names and codes.** Read from production's public team catalog (the read-only RPC the app
  calls, `football_team_catalog`, in French and Arabic): 21 active teams, 16 of them in 2026/27.
  The `code` column is filled for five (RCA, WCA, FUS, UTS, ASFAR). The crest letters for the rest
  are derived from the short name in the language of the response. On the Raja v Zemamra match page
  (`/matches/14e01965-…`) Zemamra is "Renaissance Zemamra" (header, from the full name),
  "Renaissance Club Athletic Ze…" (stats header, the full name) and "RCA Zemam…" (pressure legend,
  the short name). Crests blocked to show the letters: `/clubs` in French reads AMA, COD, DEJ,
  ASFAR (five letters), FUS, HAS, ITT, KAW, MAG, MOG, RCA, **RCA**, RSB, UTS, WID, WCA. The
  Arabic table reads "الم" for both Maghreb Fès and CODM, "اتح", "ودا" and "حسن" for others, but
  Latin "RCA" and "UTS" for the clubs with a code. Pronostics prints "WCA" as Wydad's name
  (`fixture.home.shortName`, Wydad's short name in the data).
- **White club colour.** The kit table gives Zemamra a white primary (`#ffffff`) and a green
  second colour (`#0a7a3c`). The palette keeps the white as the light fill, with dark text on it.
  Measured as painted (ΔEok, the palette's own distance): the light fill is **0.000** from the light
  card and 0.025 from the page. The match header's away half, the stat bars and the club page header
  are white on white. One more club measures the same in dark: FAR's black (`#111111`) paints
  `#0f1012`, **0.054** from the dark card and **0.034** from the dark page. Every other kit colour
  measures 0.13 or more in both themes. The palette's clash rule already treats two fills under
  0.10 apart as one colour and walks a ladder: the second colour, then the ink, then a neutral
  slate. The brand ink in dark measures 0.094 from the dark card. It is the design system's own
  fill, painted on that card by every ink button.
- **Fantasy rankings.** The overall board's payload (guest, read in the browser) carries
  `"gameweekPoints": null` for every row and `gameweekId: null`. `fantasy-runtime.ts` turns it into
  0 (`dto.gameweekPoints ?? 0`), so the "J." column reads 0 for all seven teams. The same `?? 0` is
  in the league standings mapping. The board lists "BG0090 Verif FC", "BotolaGO E2E XI",
  "E2E Botola XI" and "QA Launch 0925". `api.fantasy_overall_standings` reads
  `app.fantasy_rankings` and on `main` excludes no account. Only prize eligibility excludes staff
  (`app_private.fantasy_prize_is_staff`).

Before screenshots: `shots/*__before.png` (see Validation).

## What must be preserved

- Every business rule. Fantasy points, ranks and totals stay exactly as the server sends them.
  The browser computes no points and no rank it did not compute before, and the gameweek sort keeps
  its order.
- The Morocco clock as the only clock (`src/lib/morocco-time.ts`), the date formats ("23 sept.",
  "il y a 3 heures", Moroccan Arabic month names, Latin digits) and the timezone-parity contract.
- The brand: the logo, the brand blues, the design system's tokens and primitives. Every club keeps
  its kit colours wherever they show. The palette's contrast guarantees stay: text ≥ 4.5:1 on a
  fill, edges ≥ 3:1, and no club colour as text in dark. The clash rule keeps its order (second
  colour, ink, neutral).
- Full club names where there is room for them: page headings, the clubs directory, the hero match
  card, share text, search and assistive names. Clubs outside the current 16 (former clubs in
  history and Pépites) keep the names and letters the data gives them.
- The data stays untouched. No migration and no database write. The `code` and `short_name` columns
  are not changed.
- French and Arabic layout (logical properties, no Arabic letter-spacing), the 44px tap floor and
  dark mode.

## Improvements being made

1. **News dates on the Morocco clock.** `formatRelativeTime` (its calendar-date branch),
   `formatFullDate` and `formatArticleDate` format through `moroccoDateTimeFormat`. The server and
   every browser then print the same day and time, and the hydration errors stop. The three
   formatters join the timezone-parity harness. A unit test pins a late-evening UTC instant to its
   Morocco day.
2. **Signed numbers stay left to right.** The goal difference renders with `dir="ltr"` in the
   standings table, the "Face à face" table, the club page's mini table and its key numbers. That is
   the pattern the Fantasy points page already uses. A source test pins it for every caller of
   `formatGoalDifference`.
3. **One short name and one code per club.** The kit table in `src/lib/kits.ts` becomes one entry
   per club (its name fragments, its kit, and for the 16 current clubs its identity): a 3–4 letter
   Latin code, unique in the league and the same in both languages (codes stay left to right, as
   PRODUCT.md says), and one short name in French and in Arabic, written as Arabic. The football,
   news and Pépites presenters take the short name and code from there. The match header and the
   stats header print the short name instead of a cut-down full name, and Pronostics prints it
   instead of the raw data short name. A test pins the 16 codes and names as unique.

   | Club (data name)                  | Code | Français         | العربية          |
   | --------------------------------- | ---- | ---------------- | ---------------- |
   | Amal Tiznit                       | AMT  | Amal Tiznit      | أمل تيزنيت       |
   | CODM Meknès                       | CODM | CODM Meknès      | النادي المكناسي  |
   | Difaâ El Jadida                   | DHJ  | Difaâ El Jadida  | الدفاع الجديدي   |
   | FAR Rabat                         | FAR  | FAR Rabat        | الجيش الملكي     |
   | FUS Rabat                         | FUS  | FUS Rabat        | الفتح الرباطي    |
   | Hassania Agadir                   | HUSA | Hassania Agadir  | حسنية أكادير     |
   | Ittihad Tanger                    | IRT  | Ittihad Tanger   | اتحاد طنجة       |
   | Kawkab Marrakech                  | KACM | Kawkab Marrakech | الكوكب المراكشي  |
   | Maghreb Fès                       | MAS  | Maghreb Fès      | المغرب الفاسي    |
   | Moghreb Tétouan                   | MAT  | Moghreb Tétouan  | المغرب التطواني  |
   | Raja Casablanca                   | RCA  | Raja             | الرجاء           |
   | RSB Berkane                       | RSB  | RS Berkane       | نهضة بركان       |
   | Renaissance Club Athletic Zemamra | RCAZ | Zemamra          | نهضة الزمامرة    |
   | UTS Rabat                         | UTS  | UTS Rabat        | اتحاد تواركة     |
   | Widad Témara                      | WAT  | Widad Témara     | وداد تمارة       |
   | Wydad Casablanca                  | WAC  | Wydad            | الوداد           |

   The names are the ones the clubs go by, and they identify clubs; they claim no official status
   (PRODUCT.md, Independence). Two codes differ from the data's `code` column: Wydad's is "WCA" in
   the data and "WAC" here (the club's own initials, and the code the crest-fit comment already
   cites), and FAR's is "ASFAR" (five letters, too wide for a 28px disc) and "FAR" here. AMT and WAT
   are built from the names because no settled abbreviation was found to check them against. **The
   owner should confirm AMT and WAT**, and whether to align `app.teams.code` with this table.
4. **No club colour vanishes into its surface.** The palette treats a fill closer than the clash
   distance (0.10) to the page or the card of its own theme like a clash. For that theme only, it
   takes the first step of the same ladder that shows there: the club's second colour, then the
   ink, then the neutral slate. Zemamra paints its green in light and keeps its white kit in dark
   (light grey on the dark page, measured 0.65 away). FAR keeps black in light and paints its red in
   dark. The brand ink is not measured: it is the design system's fill. Share images, which paint
   their own navy ground, keep using the palette without this rule. One new test pins the rule
   across every kit and every pairing. The existing contrast sweep stays green.
5. **Unknown journée score is a dash.** A standing whose `gameweekPoints` is null keeps it null
   (`LeagueStanding.gameweekScore: number | null`) and the overall board and league tables print
   "–", as the Fantasy screens already do for unknown values. Points the server sends are shown as
   sent. The gameweek sort puts unknown scores after known ones. The test teams are reported, not
   filtered: see Validation.

## Acceptance criteria (visual and functional)

- `/`, `/news` and `/news/2064690e-15ee-4622-929f-c1e654cf9a29` load with no hydration error in the
  console (Chromium, Morocco zone, French and Arabic). A unit test shows `2026-09-22T23:30:00Z`
  printed as 22 September by every news formatter, whatever the runtime's own zone.
  `bun run test:timezone-parity` passes with the news formatters in it, or the report says why it
  could not run.
- Every goal difference in the standings, "Face à face", club mini table and club key numbers sits
  in an element with `dir="ltr"`. Arabic reads "+2" and "-6", measured from pixels.
- On the Raja v Zemamra match page, Zemamra is "Zemamra" in the header, the stats header and the
  pressure legend (French) and "نهضة الزمامرة" (Arabic). Pronostics reads "Wydad", never "WCA".
  With crests blocked, `/clubs` and the Arabic table show the 16 codes above, all different, in
  Latin letters in both languages. A test fails if two current clubs share a code or a short name.
- On a light page Zemamra's half of the match header, its stat bars and its club page header are
  green, visibly not white. In dark FAR's club header is red, not black on near-black. A test shows
  every fill the palette paints for a single club or a match pair standing at least 0.10 from that
  theme's page and card, the ink apart. The existing contrast and clash tests pass.
- The Fantasy overall board shows "–" in the J. column for rows whose journée score is null, and
  the totals, ranks and movements are unchanged.
- Phone 390×844 and desktop 1440×900, French and Arabic, light, and dark where colour changed: no
  horizontal page scroll, nothing truncated that was not before, Arabic right to left.
- `bun run typecheck`, `bun run lint`, the touched test files and the full `bun run test` pass.
