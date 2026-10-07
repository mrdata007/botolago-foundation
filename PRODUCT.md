# Product

<!-- impeccable:product-schema 1 -->

How this record was made: on 2026-10-05 the repository's docs, code and production `APPLIED_*`
records were read (no database was queried), and the public site was checked with plain
unauthenticated requests. The owner then answered four questions and gave a short brief. Product facts
taken from those are marked "owner, 2026-10-05"; the fourth answer is a workflow setting and is not
recorded here. Facts inferred from the repository are labelled as inferred, and anything still open is
marked **Unknown**. Status that changes week to week (gameweeks, switches, counts) lives in
[docs/product/PRODUCT_CONTEXT_2026-10-05.md](docs/product/PRODUCT_CONTEXT_2026-10-05.md), together
with the evidence behind the feature-status lines here.

## Platform

web

BotolaGO is a mobile-first web app served from https://botolago.com, with an interface in French and
Arabic. The server renders every page in French (`<html lang="fr" dir="ltr">`). A reader's Arabic
choice is stored in the browser and applied after the page loads, so Arabic readers see a French first
paint (`docs/engineering/LANGUAGE_URLS.md`).

The owner plans to distribute the app through a Capacitor wrapper. Its groundwork was merged to
`main` later on 2026-10-05 (`docs/mobile/PHONE_APP.md`):

- a native shell that opens the live site (`capacitor.config.ts`);
- push-alert code for the phone;
- a Codemagic cloud build.

The shell builds for iPhone (iPhone only, no iPad) and for Android, and both builds hold the screen upright (`docs/mobile/PHONE_APP.md`). No build has run and nothing has been tried on a phone. There is still no web manifest and no service
worker. The shell shows the same website, so its design language is the web's, and the platform stays
`web` until the owner decides otherwise.

## Users

**Primary (owner, 2026-10-05): fans first, and Fantasy grows from there.** The core user is a Moroccan
football supporter, at home or abroad, who follows the Botola Pro and checks scores, results and the
table. The product also serves them fixtures and club news. Fantasy is the main thing BotolaGO wants
these fans to sign up for. The free games (Fantasy and Pronostics) and the Pépites under-23 ranking
are built on the same match data the fans already come to read.

- **Language:** French and Arabic readers in roughly equal numbers (owner's estimate, 2026-10-05). The
  repository holds no measured split. Neither language is secondary.
- **Jobs, in priority order (owner, 2026-10-05; not measured):**
  1. See what is on today, follow a match live, and check the result and the table. No account is
     needed.
  2. Read Botola news and follow a club.
  3. Build a Fantasy squad, pick a captain, make transfers before each deadline, and compare against
     friends in private leagues.
  4. Predict scores (Pronostics) and follow young players (Pépites).
- **Secondary audiences (inferred from the code, not confirmed by the owner):**
  - BotolaGO staff use the `/admin` console (MFA-protected): news CMS, user moderation, prizes, Pépites
    data and player mapping. In practice this is the owner.
  - Partners and sponsors see the pitch demo at `/demo`, which runs on sample data.
- **Unknown:**
  - whether fans mostly use a phone, and whether their use clusters around each round of matches (the
    _journée_);
  - their age profile, device mix and the share of users abroad;
  - the number of real (non-test) users.

  The repository has no user research, personas or traffic data. Real use is at a very early stage:
  the Fantasy rounds scored so far include several test accounts.

## Product Purpose

BotolaGO puts the Botola Pro in one place, in French and Arabic:

- live scores, results, fixtures and the table;
- clubs and licensed news;
- free games built on the same data, Fantasy and Pronostics (score predictions);
- Pépites, an under-23 player ranking.

Success means supporters come back every _journée_, both to follow the matches and to play. The main
conversion is creating a Fantasy team and managing it actively. This purpose is stated in
`docs/seo/BOTOLAGO_SEO_OPERATING_SYSTEM.md` (Outcome and Module 2; Pépites was added later) and was
confirmed by the owner on 2026-10-05.

## Positioning

BotolaGO goes deep on one league, in two languages, with the games tied to the match data. The
documented strategy (`docs/seo/BOTOLAGO_SEO_OPERATING_SYSTEM.md`, Outcome) is not to out-publish
established score sites. Generic French results are dominated by Flashscore, Sofascore, FRMF,
L'Équipe and similar authorities. BotolaGO aims to win on three things:

1. the most useful Botola Pro match, table, club and player pages in both French and Arabic;
2. the clearest Botola Pro Fantasy game;
3. original, attributable reporting, with licensed reporting always credited to its source.

What sets BotolaGO apart today (no competitor review in the repository confirms that others lack these):

- **Free play.** Fantasy and Pronostics are free and use only Botola Pro players and matches, with no
  purchase and no betting. Fantasy prizes are real and come from the operator, Go Sports
  Technologies. Pronostics has no prizes.
- **Arabic throughout.** The whole interface is translated into Arabic with right-to-left layout, and
  most news editions are Arabic. On the server Arabic is not yet equal: pages render French first, and
  only articles have Arabic URLs.
- **Official scoring data.** Fantasy points come only from official provider data and are computed on
  the server, never in the browser.

The Fantasy game is deliberately modelled on Fantasy Premier League, screen by screen (see
`BOTOLAGO_FPL_SCREEN_MATRIX.md`). It wears BotolaGO's identity, not FPL's.

**Unknown:** the repository holds no Search Console or traffic data to validate this positioning.
Seline analytics has run on botolago.com since 2026-09-25, but what it shows is not recorded here. The
SEO plan (26 Sept) says Search Console was not connected to its project.

## Operating Context

- **The rhythm is the _journée_.** 2026/27 is a 16-club Botola Pro season. The league publishes
  fixtures only a round or two ahead (in the owner's account, one matchday at a time). A Fantasy
  gameweek can only be set up once the data provider has published that round, which creates gaps
  when new Fantasy teams cannot be created.
  - The Fantasy deadline is 90 minutes before the round's first kick-off.
  - Pronostics locks each match at its own kick-off.
- **Morocco time everywhere.** Match and deadline times are shown in Morocco time (`Africa/Casablanca`)
  by an app-owned clock. That clock treats Morocco as UTC+0 all year from 2026-09-20; its legal source
  (decree n° 2.26.530) is cited only in code comments (`src/lib/morocco-time.ts` and
  `supabase/functions/_shared/morocco-time.ts`), never in a document. **Unknown:** whether anyone has
  checked the decree itself.
- **Phone first.** Browser tests cover phone to desktop widths in French and Arabic. The main sections
  are Accueil, Actualités, Fantasy, Matches and Pépites, plus Profile. Pronostics lives inside Matches.
- **Language.**
  - A first visit asks the reader to choose French or Arabic.
  - The interface language is stored on that device only (browser storage). An account also records
    the language in use at sign-up or profile setup, and notifications use that one.
  - The server renders French first, and Arabic switches in after the page loads.
  - There are no `/ar` URLs; they are planned in `docs/engineering/LANGUAGE_URLS.md`, not built.
  - News articles are the exception: each language edition has its own URL.
- **Accounts are optional until saving.**
  - Visitors browse every public page without an account.
  - A Fantasy squad and Pronostics picks can be made as a guest; they are stored on the phone.
  - Saving, ranking and leagues need a free account: email and password, confirmed by an emailed code.
  - The Terms limit accounts to adults (18+), but sign-up does not check age.
- **WhatsApp is the named share channel.**
  - The invite, Pronostics, Pépites and gameweek-recap share sheets offer the phone's share sheet, a
    WhatsApp button and copy link.
  - Image sheets add a download when the phone cannot share a file.
  - Article, match, club and Fantasy player pages offer only the phone's share sheet or copy link.
- **Data sources.**
  - SportsMonks provides fixtures, live scores, events, lineups, squads and statistics. That includes
    the Fantasy player list and the player statistics that scored Fantasy GW1 and GW2.
  - Sofascore and Flashscore (via RapidAPI) are being brought in as Fantasy's player-data sources
    (owner decision, 2026-10-01). On 2026-10-03 production held 191 reviewed Sofascore player identity
    mappings and no Flashscore mappings. The reconciled scoring path is built but has no production
    record. **Unknown:** whether it has been applied since.
  - ElBotola licensed its Botola Pro article archive.
- **One owner runs it.**
  - The owner (GitHub `mrdata007`) makes product decisions and approves every manual production
    database write (migrations and guarded scripts). Once switched on, scheduled jobs (the database
    ticks and the hourly Fantasy orchestrator) write by themselves.
  - The owner publishes the frontend by hand from Lovable: a merge to `main` is not a deployment.
  - The repository syncs to Lovable, so published git history must never be rewritten.

## Capabilities and Constraints

**Live on botolago.com.** The site served repository commit `236afae` on 2026-10-05. Per-feature
production evidence is in the dated snapshot. Work merged to `main` after that check (section 8 of
the snapshot) was not checked against the live site.

- **Matches:**
  - a calendar and live scores (the server checks the provider every 2 minutes during play, and the
    page re-checks every 30 seconds);
  - a match page with Résumé, Stats, Compos and Face à face tabs, plus fan votes;
  - a computed table labelled provisional or unofficial;
  - a 16-club directory and club pages, and following a club.
- **News:**
  - a licensed ElBotola archive, mostly in Arabic. French editions are credited "Source : ElBotola"
    and Arabic ones "المصدر: البطولة", each with a link to the original;
  - an editorial CMS in `/admin`.
  - The archive import runs only when someone starts it.
- **Fantasy** (rules: `docs/backend/FANTASY_RULES_V1.md`):
  - a 100.0 budget for a 15-player squad (2 GK / 5 DEF / 5 MID / 3 FWD), at most 3 players per club;
  - the captain's points count twice; one free transfer per round, carried over up to 2, and −4 points
    for each extra;
  - Wildcard ×2, Free Hit, Bench Boost and Triple Captain;
  - private leagues joined by invite code, global rankings, and a private gameweek recap.
- **Prizes,** all provided by Go Sports Technologies; winners are ID-checked and staff teams are
  excluded:
  - a gameweek prize;
  - a "monthly" prize, labelled "Lot du mois" but awarded per block of 4 gameweeks rather than per
    calendar month;
  - a season prize.
- **Pronostics:** free score predictions scoring 3 points for the exact score and 1 for the right
  outcome. It has round and season boards, and mini-leagues that share Fantasy league codes.
- **Pépites:** an under-23 Botola Pro ranking, with player pages, a method page and a comparison page.
  - On 2026-10-05 it shows the 2025/26 final ranking.
  - The weekly Top 10, chosen by the editors, is built. The first 2026/27 edition comes only after
    round 3, and none had been published at the last record.
- **Other:** the landing page (`/jouer`, also shown at `/` to first-time signed-out visitors); optional
  two-step sign-in; account-deletion requests; cookieless analytics (Seline).
- **Dark mode** (merged after the site check): on (owner decision 2026-10-05, BG-0149, PR #356). It follows the phone's
  setting by default, and Profil > Apparence offers Clair, Sombre and Système. Fantasy has its dark
  version (BG-0084, closed on measurement). In dark the logo is the all-white wordmark.

**Built, but switched off or not delivering.** Do not design as if these work.

- **Email notifications:** mode `off` at the last record (2026-10-04). As a result, the match reminder
  bell, the Fantasy deadline and recap emails, and the Pépites weekly email send nothing. The in-app
  inbox very probably receives nothing either. Since 2026-10-07 the interface hides the reminder bell,
  the Pépites weekly email card and the email and alert switches, and says reminders are not sent yet,
  until `NOTIFICATION_EMAIL_LIVE` (`src/lib/feature-flags.ts`) is switched on with the email mode.
- **Fantasy Cup and public leagues:** the screens and copy exist, but no backend path works. The
  owner decided on 2026-10-07 to keep the Cup screens.
  Head-to-head leagues appear only as a disabled option, with copy saying they will come later.
- **Google and Apple sign-in:** the buttons render, and both providers are enabled in production
  Supabase Auth (its public settings, checked 2026-10-07). No sign-in through either is recorded.
- **AI-written articles and GNews ingestion:** both are switched off or dormant.
- **Phone app and push alerts** (merged after the site check): the shell, the phone's push code and the
  cloud build are in the repository, but no build has run. The push sending side ships with its switch
  off and its dispatcher not deployed (`docs/backend/PUSH_NOTIFICATIONS.md`).
- **Public gameweek recaps** at `/journee/<id>` (merged after the site check): built, with both
  switches off after the migration (`docs/backend/FANTASY_PUBLIC_RECAPS.md`). **Unknown:** whether the
  migration is applied in production.
- **Other built but unused pieces:** a deadline-first home layout (`HOME_DEADLINE_FIRST = false`), and
  several Fantasy components that nothing mounts (FantasyOnboarding, LeagueTable, Pitch and others;
  full list in the dated snapshot). Their copy has not been checked against ruleset v1.

**Planned only, not built:**

- language URLs (`/ar`);
- web push for the website itself (the phone app's push is built but off, above);
- the Morocco national-team section;
- Fantasy advice guides;
- server-made share cards;
- sponsor placements such as "gameweek presented by" and "leaderboard presented by", which appear
  only in the pitch demo. (A per-prize sponsor credit — name and logo, "Offert par …" — is already
  built into `/prizes` and `/admin/prizes`, but unused: Go Sports Technologies provides every prize.)

**Constraints future work must keep:**

- **Refinement, not redesign** (owner, 2026-10-05). Keep the brand identity, working features, business
  rules and frontend stack. The stack is TanStack Start, React 19, Vite, Tailwind CSS v4, Radix/shadcn,
  and Supabase. It is scaffolded from Lovable and kept in sync with it.
- **Game logic runs on the server, never in the browser.**
  - The database enforces Fantasy squad rules, transfers, chips and league membership.
  - Scoring and finalisation run in a server-side worker (`scripts/backend/fantasy-lifecycle-runner.ts`)
    against a sealed database snapshot, and the database checks and stores the results.
  - The browser keeps a copy of the squad limits (`SQUAD_RULES` in `src/types/fantasy.ts`) to guide
    squad building and transfers and to state the rules in copy. The database remains the authority
    and rejects anything the copy lets through.
  - New interface work may present this logic but must not reimplement it, and the browser never
    computes a signed-in manager's points.
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
  - Club crests come from SportsMonks and are cleared for in-app display (owner, 2026-09-23,
    `docs/backend/FOOTBALL_OPERATIONS_RUNBOOK.md`); the landing page shows them. At the last record
    (BG-0135, open), one current club (Amal Tiznit) and one former club (Yacoub El Mansour) carried the
    provider's placeholder shield. **Unknown:** whether crests may appear in share images, marketing
    or store listings. Today's share images use club discs and initials instead.
  - There is no Botola Pro competition logo.
  - Share images show a player's photo only when its release allows social use; any other player
    gets a club disc and initials (`src/components/pepites/share-image.ts`). Provider player images
    are internal placeholders only.
  - BSD, a candidate second data source for Pépites (measured 2026-09-26 in
    `docs/engineering/PEPITES_PLAN.md` §10; not chosen or connected), licenses its photos and logos
    only to identify players inside the app, never in promotion or share images, and its data may not
    be presented as official. These terms apply if it is adopted.
  - Licensed news must keep its credit and link.
- **Production data:** any manual change goes only through the reviewed path in `CLAUDE.md`
  (migrations or guarded scripts the owner runs). Scheduled jobs write on their own only after the
  owner has switched them on.

**Terminology:**

- _Journée_ / الجولة: a round, and a Fantasy gameweek; columns read "J.14".
- _Date limite_: the Fantasy deadline.
- _Manager_: a Fantasy player; the Arabic copy uses مدرب.
- **Chips:** in French, _Joker_ (Wildcard) and _Triple Capitaine_, while Free Hit and Bench Boost stay
  in English. Arabic translates all four: الورقة الحرة, القائد الثلاثي, الضربة الحرة, تعزيز الاحتياط.
- _Lots à gagner_: prizes.
- _Pronostics_ / التوقعات.
- _Pépites_ / جواهر; the Arabic Top 10 label is not settled (أفضل 10 vs توب 10).
- _Botola Pro_ in running copy. _Botola Pro Inwi_ / البطولة الاحترافية إنوي appears only as the
  competition label on match, club and standings headers.
- _Provisoire_: provisional.
- "Matches" vs "Matchs" is an open inconsistency in French.

**Open product decisions (Unknown):**

- when the phone app ships to the app stores (the shell loads the live site, per
  `docs/mobile/PHONE_APP.md`);
- when email notifications switch on;
- whether the Fantasy Cup and public leagues will be built or removed;
- whether language URLs are adopted, and if so which shape (`/ar` beside unprefixed French, or `/fr`
  and `/ar` namespaces);
- whether an Arabic-script form of the brand name is sanctioned.

## Brand Commitments

- **Name:** "BotolaGO": capital B, lower-case "otola", upper-case "GO".
  - The `app.name` key stays in Latin script in both languages; `src/i18n/i18n-allowlist.ts` annotates
    it as deliberately identical.
  - One Arabic string (`home.explore`, `src/i18n/dictionary-ar.ts`) types the Arabic-script form
    بوتولاجو. **Unknown:** whether that form is sanctioned (see Open product decisions).
  - In the section headings that use `src/components/brand/BrandedText.tsx` (a handful of call
    sites), the wordmark image replaces the typed word. Page titles and some other headings keep the
    typed word.
- **Assets:**
  - wordmark and "GO" mark SVGs in colour and light versions (`src/assets/brand/`);
  - `public/favicon.png`, `public/apple-touch-icon.png` and `public/og-image.jpg`.
- **Sub-brands:**
  - BotolaGO Fantasy;
  - Pronostics;
  - Pépites, which uses the main BotolaGO look like every other screen (owner, 2026-10-05: its own
    night bands, energy gradient, mono meta lines and slant are retired; BG-0152). The Pépites plan
    names it the first "BotolaGO Data" product; that label exists only in plan documents, not in
    the product.
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
  called Option A "Club colours". It is documented in `docs/engineering/DESIGN_SYSTEM_V2.md` (which
  trails the code on a few points; see the snapshot, section 7) and implemented in `src/styles.css`
  and `src/components/ui-kit/`, and summarised for agents in `DESIGN.md`. This record does not restate
  it.
- **Brand blue: two blues with two jobs** (owner decision, 2026-10-05). The logo's `#0151fc` is for
  brand assets only (logo, app and home-screen icons, favicon, marketing art) and never an interface
  colour; the interface brand is the deeper navy; in dark mode the logo uses its all-white files. See
  `DESIGN.md` (Colors).
- **Operator:** Go Sports Technologies (a company being formed), Agadir, Morocco; contact
  support@botolago.com.

## Evidence on Hand

- **Real data:**
  - live 2026/27 Botola Pro data;
  - historical 2024/25 and 2025/26 data, uneven in completeness: mainly per-player performance rows
    (see `docs/engineering/PEPITES_HISTORICAL_DATA_REPAIR.md`);
  - about 15,690 licensed ElBotola article editions, mostly Arabic. The newest was dated
    23 September 2026 when checked on 2026-10-05.
- **Product rules and texts:**
  - `docs/backend/FANTASY_RULES_V1.md` and `src/content/legal/prize-terms.ts`;
  - the Terms and Privacy Policy in `src/content/legal/documents.ts`;
  - the voice and audience brief in `docs/seo/BOTOLAGO_SEO_OPERATING_SYSTEM.md`.
- **Production records:**
  - `docs/production/APPLIED_*` files. Each is dated, and the latest is the strongest evidence of what
    is live;
  - QA captures in `docs/qa/fpl-screens/` and `docs/qa/polish/`.
- **Imagery** in `src/assets/`: stadium photography at night, golden hour and daytime, plus object
  renders. **Unknown:** who made it and under what licence; no record exists.
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
  `docs/engineering/LAUNCH_LEDGER.yaml` (its `updated:` header reads 2026-09-21, though entries run to
  2026-09-26), the Pépites plan documents and `.lovable/plan.md`. The snapshot lists the conflicts
  found. The latest dated `APPLIED_*` record and the code win over plans.

## Product Principles

1. **Fans first, Fantasy grows.** Keep following the Botola fast and open to everyone, without an
   account. Offer Fantasy as the natural next step; never put it in the way of the match.
2. **Two languages, equal weight.** French and Arabic readers are roughly even, so Arabic is never a
   mirror mode or an afterthought. A change is not done until it works in both.
3. **Nothing invented.** Show only what the data and the system actually deliver. Label what is
   provisional, show unknowns as unknown, and keep sources visible.
4. **Free, fair and independent.** No money at stake and no betting look. Game rules are enforced on
   the server, and nothing implies official league status.
5. **Refine, don't replace.** Improve within the existing identity, features, rules and stack; a
   redesign needs the owner's explicit decision.

## Accessibility & Inclusion

What the design system and tests already cover:

- **Contrast:** AA-level thresholds (4.5:1 for text, 3:1 for control edges). They are measured per
  token in the design system and test-enforced for computed club colours (`src/lib/club-palette.test.ts`).
  No automated app-wide contrast check exists.
- **Tap targets and focus:** a 44px tap floor for kit controls (`--ui-tap-min`), and visible focus
  rings (`ui.focus`). Known exceptions: the carousel dot buttons in News and Pronostics are 24 × 32px.
- **Reduced motion:** `prefers-reduced-motion` is respected for CSS animations and transitions through
  one global block in `src/styles.css`, and in components that check it (for example GoalMoment).
  Known gap: five JavaScript smooth scrolls do not check it.
- **Images and buttons:** alt text on images, and names on icon-only buttons (a source test).
- **Arabic as a right-to-left language:**
  - logical (start/end) layout only;
  - directional icons mirrored once;
  - arrow-key navigation follows the reading direction;
  - no letter-spacing on Arabic text (contract-tested).
  - Italics and slants are kept Latin-only by convention in components. Known gap: `.editorial-body em`
    (`src/styles.css`) italicises emphasis in Arabic article bodies.
- **Numbers:** Western (Latin) digits in both languages, with numbers and codes kept left-to-right
  inside Arabic lines.
- **Time:** match times always in Morocco time.

Known gaps (**Unknown** whether intended):

- No formal WCAG conformance level is declared for the public app.
- There is no skip link.
- No screen-reader testing is recorded.
- Arabic readers see a French first paint on full page loads.
- Browser tests run in Chromium only; there is no Safari/WebKit or real-device coverage.
- Decided 2026-10-05 (BG-0151): the viewport meta now carries `viewport-fit=cover`, which
  safe-area handling inside the Capacitor shell depends on, with the safe-area fixes it needs.
  It is checked only in Chromium with emulated insets; how it looks on a real notched iPhone (the
  app, and the website in Safari upright and sideways) and on Android phones with a recent and an
  older WebView is not yet checked.
