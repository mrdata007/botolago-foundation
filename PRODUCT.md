# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

BotolaGO is a mobile-first web app served from https://botolago.com. It is rendered on the server, in
French and Arabic. The owner plans to distribute it later through a Capacitor wrapper. That work has
not started: as of 2026-10-05 the repository has no Capacitor or native project, no web manifest and
no service worker. A wrapper around this website does not make its design language native, so the
platform stays `web` until the owner decides otherwise.

How this record was made: on 2026-10-05 the repository's docs, code and production records were read,
and the public site was checked with plain unauthenticated requests. The owner then answered four
questions; those answers are marked "owner, 2026-10-05". Anything still open is marked **Unknown**.
Status that changes week to week (gameweeks, switches, counts) lives in
[docs/product/PRODUCT_CONTEXT_2026-10-05.md](docs/product/PRODUCT_CONTEXT_2026-10-05.md), together
with the evidence behind each line here.

## Users

**Primary (owner, 2026-10-05): fans first, and Fantasy grows from there.** The core user is a Moroccan
football supporter, at home or abroad, who follows the Botola Pro. They check scores, results,
fixtures, the table and club news, mostly on a phone and around each round of matches (the
_journée_). Fantasy is the main thing BotolaGO wants these fans to sign up for. The free games
(Fantasy, Pronostics and Pépites) are built on the same match data the fans already come to read.

- **Language:** French and Arabic readers in roughly equal numbers (owner's estimate, 2026-10-05). The
  repository holds no measured split. Neither language is secondary.
- **Jobs, in the order they happen:**
  1. See what is on today, follow a match live, and check the result and the table. No account is
     needed.
  2. Read Botola news and follow a club.
  3. Build a Fantasy squad, pick a captain, make transfers before each deadline, and compare against
     friends in private leagues.
  4. Predict scores (Pronostics) and follow young players (Pépites).
- **Secondary audiences:** BotolaGO staff use the `/admin` console (MFA-protected): news CMS, user
  moderation, prizes, Pépites data and player mapping. In practice this is the owner. Partners and
  sponsors see the pitch demo at `/demo`, which runs on sample data.
- **Unknown:** age profile, device mix, the share of users abroad, and the number of real (non-test)
  users. The repository has no user research, personas or traffic data. Real use is at a very early
  stage: the Fantasy rounds scored so far include several test accounts.

## Product Purpose

BotolaGO puts the Botola Pro in one place, in French and Arabic, and adds free games built on the
same live data:

- live scores, results, fixtures and the table;
- clubs and licensed news;
- Fantasy, Pronostics (score predictions) and Pépites (an under-23 ranking).

Success means supporters come back every _journée_, both to follow the matches and to play. The main
conversion is creating a Fantasy team and managing it actively. This purpose is stated in
`docs/seo/BOTOLAGO_SEO_OPERATING_SYSTEM.md` (Module 2) and was confirmed by the owner on 2026-10-05.

## Positioning

BotolaGO goes deep on one league, in two languages, with the games tied to the match data. The
documented strategy is not to out-publish generic score sites. In French search those are Flashscore,
Sofascore, FRMF and L'Équipe. BotolaGO aims to win on three things:

1. the most useful Botola Pro match, table, club and player pages in both French and Arabic;
2. the clearest Botola Pro Fantasy game;
3. original reporting, always credited.

What a neighbouring product could not truthfully copy today:

- Fantasy and Pronostics are free and use only Botola Pro players and matches. There is no purchase
  and no betting, and real prizes come from the operator.
- Arabic is a first-class language rather than a mirrored afterthought.
- Fantasy scoring comes only from official provider data and is computed in the database.

The Fantasy game is deliberately modelled on Fantasy Premier League, screen by screen (see
`BOTOLAGO_FPL_SCREEN_MATRIX.md`). It wears BotolaGO's identity, not FPL's.

**Unknown:** no Search Console or traffic data exists yet to validate this positioning.

## Operating Context

- **The rhythm is the _journée_.** 2026/27 is a 16-club Botola Pro season. The league publishes
  fixtures one round at a time, so a Fantasy gameweek can only be set up once the data provider has
  published that round. This creates gaps when new Fantasy teams cannot be created.
  - The Fantasy deadline is 90 minutes before the round's first kick-off.
  - Pronostics locks each match at its own kick-off.
- **Morocco time everywhere.** Match and deadline times are shown in Morocco time (`Africa/Casablanca`)
  by an app-owned clock. That clock treats Morocco as UTC+0 all year from 2026-09-20, citing a decree
  in `src/lib/morocco-time.ts`. **Unknown:** the decree has not been checked outside the code.
- **Phone first.**
  - The design width is 390px. Tests cover 320–1440px in French and Arabic.
  - Below 768px a bottom tab bar holds Accueil, Actualités, Fantasy, Matches and Pépites, with
    Profile in the top bar.
  - Pronostics lives inside Matches.
- **Language.**
  - A first visit asks the reader to choose French or Arabic. The choice is stored on that device only.
  - The server always renders French first, and Arabic switches in after the page loads.
  - There are no `/ar` URLs; they are planned in `docs/engineering/LANGUAGE_URLS.md`, not built.
  - News articles are the exception: each language edition has its own URL.
- **Accounts are optional until saving.**
  - Visitors browse every public page without an account.
  - A Fantasy squad and Pronostics picks can be made as a guest; they are stored on the phone.
  - Saving, ranking and leagues need a free account: email and password, confirmed by an emailed code.
  - The Terms limit accounts to adults (18+), but sign-up does not check age.
- **Sharing goes through WhatsApp first.** Share sheets offer native share, WhatsApp and copy.
- **Data sources.**
  - SportsMonks provides fixtures, live scores, events, lineups and statistics.
  - Sofascore and Flashscore, via RapidAPI, provide Fantasy player data and identity mapping.
  - ElBotola licensed its Botola Pro article archive.
- **One owner runs it.** The owner (GitHub `mrdata007`) makes product decisions and approves every
  production database write. The owner also publishes the frontend by hand from Lovable: a merge to
  `main` is not a deployment. The repository syncs to Lovable, so published git history must never be
  rewritten.

## Capabilities and Constraints

**Live on botolago.com.** The site served repository commit `236afae` on 2026-10-05. Per-feature
production evidence is in the dated snapshot.

- **Matches:**
  - a calendar and live scores (the server checks the provider every 2 minutes during play, and the
    page re-checks every 30 seconds);
  - a match page with Résumé, Stats, Compos and Face à face tabs, plus fan votes;
  - a computed table labelled provisional or unofficial;
  - a 16-club directory and club pages, and following a club.
- **News:**
  - a licensed ElBotola archive, mostly in Arabic, credited "Source : ElBotola" with a link to each
    original;
  - an editorial CMS in `/admin`.
  - The archive import runs only when someone starts it.
- **Fantasy** (rules: `docs/backend/FANTASY_RULES_V1.md`):
  - a 100.0 budget for a 15-player squad (2 GK / 5 DEF / 5 MID / 3 FWD), at most 3 players per club;
  - the captain's points count twice; one free transfer per round, carried over up to 2, and −4 points
    for each extra;
  - Wildcard ×2, Free Hit, Bench Boost and Triple Captain;
  - private leagues joined by invite code, global rankings, and a private gameweek recap.
- **Prizes:** a gameweek prize, a monthly prize and a season prize, all provided by Go Sports
  Technologies. Winners are ID-checked, and staff teams are excluded.
- **Pronostics:** free score predictions scoring 3 points for the exact score and 1 for the right
  outcome. It has round and season boards, and mini-leagues that share Fantasy league codes.
- **Pépites:** an under-23 Botola Pro ranking with a weekly Top 10, player pages, a method page and a
  comparison page.
- **Other:** the landing page (`/jouer`, also shown at `/` to first-time signed-out visitors); optional
  two-step sign-in; account-deletion requests; cookieless analytics (Seline).

**Built, but switched off or not delivering.** Do not design as if these work.

- **Email notifications:** mode `off` at the last record (2026-10-04). As a result, the match reminder
  bell, the Fantasy deadline and recap emails, and the Pépites weekly email send nothing. The in-app
  inbox very probably receives nothing either. Some interface copy still promises these reminders.
- **Dark mode:** built, but switched off.
- **Fantasy Cup, public leagues and head-to-head leagues:** the screens and copy exist, but no backend
  path works.
- **Google and Apple sign-in:** the buttons render, but the providers were last recorded as not enabled
  in Supabase. **Unknown:** whether they work now.
- **AI-written articles and GNews ingestion:** both are switched off or dormant.

**Planned only, not built:**

- language URLs (`/ar`);
- web push and any native or Capacitor app;
- the Morocco national-team section;
- Fantasy advice guides;
- server-made share cards;
- sponsor placements, which appear only in the pitch demo.

**Constraints future work must keep:**

- **Refinement, not redesign** (owner, 2026-10-05). Keep the brand identity, working features, business
  rules and frontend stack. The stack is TanStack Start, React 19, Vite, Tailwind CSS v4, Radix/shadcn,
  and Supabase. It is scaffolded from Lovable and kept in sync with it.
- **Game logic is proven and lives in the database.** This covers Fantasy squad rules, transfers,
  chips, the gameweek lifecycle, scoring and league membership. The interface may present it but must
  not reimplement it, and the browser never recomputes points.
- **Data honesty.**
  - Show only what the data carries. An unknown value is a dash, never 0.
  - Never show a probable XI. Label provisional tables and points as provisional.
  - Never invent user counts, ratings, winners, quotes or statistics.
  - Copy must not promise anything the system does not deliver.
- **Free to play.** No purchase, no stake, no betting, and nothing that looks like betting.
- **Independence.** BotolaGO is not affiliated with the FRMF, the LNFP, the clubs or the players. Their
  names identify; they never imply official status.
- **Image and content rights.**
  - No player photos without a signed release.
  - Club crests come from the provider; two are placeholder shields.
  - There is no Botola Pro competition logo.
  - Licensed news must keep its credit and link.
  - Provider photos and logos never appear in promotion or share images.
- **Production data** changes only through the reviewed path in `CLAUDE.md`.

**Terminology:**

- _Journée_ / الجولة: a round, and a Fantasy gameweek; columns read "J.14".
- _Date limite_: the Fantasy deadline.
- _Manager_: a Fantasy player; the Arabic copy uses مدرب.
- _Joker_: Wildcard; Free Hit and Bench Boost stay in English.
- _Lots à gagner_: prizes.
- _Pronostics_ / التوقعات.
- _Pépites_ / جواهر; the Arabic Top 10 label is not settled (أفضل 10 vs توب 10).
- _Botola Pro Inwi_: the league as the interface names it.
- _Provisoire_: provisional.
- "Matches" (nav) vs "matchs" (page copy) is an open inconsistency in French.

**Open product decisions (Unknown):**

- whether and when Capacitor ships, and how it would load the app (the remote site or a bundled
  client);
- when email notifications switch on;
- whether the Fantasy Cup and public leagues will be built or removed;
- which language-URL plan is adopted;
- the canonical brand blue: the logo file uses `#0151fc`, while the interface's brand token is a deeper
  navy;
- whether an Arabic-script form of the brand name exists.

## Brand Commitments

- **Name:** "BotolaGO": capital B, lower-case "otola", upper-case "GO". It stays in Latin script in
  both languages, by an explicit rule in `src/i18n/i18n-allowlist.ts`. In headings that name the
  product, the wordmark image replaces the typed word (`src/components/brand/BrandedText.tsx`).
- **Assets:**
  - wordmark and "GO" mark SVGs in colour and light versions (`src/assets/brand/`);
  - `public/favicon.png`, `public/apple-touch-icon.png` and `public/og-image.jpg`.
- **Sub-brands:**
  - BotolaGO Fantasy;
  - Pronostics;
  - Pépites, the first "BotolaGO Data" product, which keeps its own look inside BotolaGO.
- **Taglines in use:**
  - "Actualité & Fantasy du football marocain" / "أخبار وفانتازي كرة القدم المغربية";
  - "Le football marocain, réuni." / "كرة القدم المغربية، في مكان واحد.";
  - the landing promise "Vous connaissez la Botola. À vous de jouer." / "أنت تعرف البطولة. الآن دورك."
- **Voice (owner, 2026-10-05: keep it as it is):**
  - French addresses the reader as _vous_. _Tu_ appears only in share and invite messages the user
    sends to friends.
  - Arabic is Modern Standard Arabic, with no Darija.
  - Put the score, deadline or answer first. Be short, direct and specific, with no hype.
  - Say when something is provisional, and never invent.
  - Credit licensed reporting.
  - French should sound native to Moroccan football coverage, and Arabic is written or reviewed as
    Arabic, not translated literally.
- **Visual identity is incumbent and authoritative.** It is "Design System V2", currently the look
  called Option A "Club colours". It is documented in `docs/engineering/DESIGN_SYSTEM_V2.md` and
  implemented in `src/styles.css` and `src/components/ui-kit/`. The Fantasy section is its declared
  source of truth. This record does not restate it, and there is no `DESIGN.md` yet.
- **Operator:** Go Sports Technologies (a company being formed), Agadir, Morocco; contact
  support@botolago.com.

## Evidence on Hand

- **Real data:**
  - live 2026/27 Botola Pro data, plus the 2024/25 and 2025/26 seasons;
  - about 15,690 licensed ElBotola article editions, mostly Arabic. The newest was dated
    23 September 2026 when checked on 2026-10-05.
- **Product rules and texts:**
  - `docs/backend/FANTASY_RULES_V1.md` and `src/content/legal/prize-terms.ts`;
  - the Terms and Privacy Policy in `src/content/legal/documents.ts`;
  - the voice and audience brief in `docs/seo/BOTOLAGO_SEO_OPERATING_SYSTEM.md`.
- **Production records:**
  - `docs/production/APPLIED_*` files, which are dated and the strongest evidence of what is live;
  - QA captures in `docs/qa/fpl-screens/` and `docs/qa/polish/`.
- **Imagery** in `src/assets/` (night-stadium photography and object renders). **Unknown:** who made it
  and under what licence; no record exists.
- **Pitch demo** at `/demo`. Its managers and matches are invented; it is a demonstration, never
  evidence of use.
- **Absent, and must not be fabricated:**
  - user research and personas;
  - testimonials, ratings and user counts;
  - press coverage;
  - Search Console data and real-user performance data;
  - a brand guideline document;
  - published prize winners. None were verified at the last record.
- **Stale sources to treat with care.** Several plans predate what shipped, notably
  `docs/engineering/LAUNCH_LEDGER.yaml` (last updated 2026-09-21), the Pépites plan documents and
  `.lovable/plan.md`. The snapshot lists the conflicts found. Dated `APPLIED_*` records and the code win
  over plans.

## Product Principles

1. **Fans first, Fantasy grows.** Keep following the Botola fast and open to everyone, without an
   account. Offer Fantasy as the natural next step; never put it in the way of the match.
2. **Two languages, equal weight.** French and Arabic readers are roughly even, so Arabic is never a
   mirror mode or an afterthought. A change is not done until it works in both.
3. **Nothing invented.** Show only what the data and the system actually deliver. Label what is
   provisional, show unknowns as unknown, and keep sources visible.
4. **Free, fair and independent.** No money at stake and no betting look. The rules come from the
   database, and nothing implies official league status.
5. **Refine, don't replace.** Improve within the existing identity, features, rules and stack; a
   redesign needs the owner's explicit decision.

## Accessibility & Inclusion

What the design system and tests already enforce:

- AA-level contrast, measured: 4.5:1 for text and 3:1 for control edges.
- A 44px minimum tap target and visible focus rings.
- `prefers-reduced-motion` respected for all motion.
- Alt text on images, and names on icon-only buttons.
- Arabic as a first-class right-to-left language:
  - logical (start/end) layout only;
  - directional icons mirrored once;
  - arrow-key navigation follows the reading direction;
  - no letter-spacing, italics or slanting on Arabic text.
- Western (Latin) digits in both languages, with numbers and codes kept left-to-right inside Arabic
  lines.
- Match times always in Morocco time.

Known gaps (**Unknown** whether intended):

- No formal WCAG conformance level is declared for the public app.
- There is no skip link.
- No screen-reader testing is recorded.
- Arabic readers see a French first paint on full page loads.
- Browser tests run in Chromium only; there is no Safari/WebKit or real-device coverage.
- The viewport meta lacks `viewport-fit=cover`, which safe-area handling in a future Capacitor shell
  would depend on.
