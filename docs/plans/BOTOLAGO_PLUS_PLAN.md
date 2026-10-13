# BotolaGO+ — premium subscription plan

**Status:** plan for the owner's approval, 2026-10-12. Nothing is built. No app code, database,
migration or deployment was touched to write it. The visual sketch to approve is
[`botolago-plus-sketch.html`](botolago-plus-sketch.html) in this folder (open it in a browser). Since
2026-10-13 it shows the four-screen flow of section 3.0c.

**Working name:** BotolaGO+ (French « BotolaGO+ », Arabic « BotolaGO+ » — the name stays in Latin
script in both languages, like `app.name`).

**What the owner asked for (2026-10-12):** a monthly premium offer with a detailed history of your
stats, comparisons with friends, card designs and no ads; a premium page built with React Bits and
Motion; the plan first, then a sketch to approve visually, then the build in a later session.

**Read with:** `AGENTS.md`, `CLAUDE.md`, `PRODUCT.md`, `docs/engineering/DESIGN_SYSTEM_V2.md`,
`docs/backend/MANAGER_CARD_DOMAIN_PLAN.md`, `docs/backend/MANAGER_CARD_GAP_PLAN.md`,
`docs/backend/MANAGER_CARD_OPERATIONS_RUNBOOK.md`, `docs/product/MANAGER_CARD_SECTION_PLAN.md`,
`docs/engineering/MANAGER_CARD_COLLECTIBLE_MOTION.md`, `src/components/manager-card/eclat/README.md`.

Anything this plan could not confirm from the repository is marked **to confirm**. Anything legal,
tax or app-store related is marked **to confirm with a lawyer/accountant** and must not be treated
as settled.

---

## Contents

1. [Summary (for the owner)](#1-summary-for-the-owner)
2. [Features](#2-features)
3. [The premium page](#3-the-premium-page)
4. [The Curva ranking and prizes (internal)](#4-the-curva-ranking-and-prizes-internal)
5. [Payments and entitlements](#5-payments-and-entitlements)
6. [Legal and compliance checklist](#6-legal-and-compliance-checklist)
7. [Rollout in phases](#7-rollout-in-phases)
8. [How to continue in a later session](#8-how-to-continue-in-a-later-session)
9. [Open questions for the owner](#9-open-questions-for-the-owner)

---

## 1. Summary (for the owner)

### 1.1 What BotolaGO+ is

BotolaGO+ is an optional monthly membership for the fans who play Fantasy and care about their
Curva card. It gives them **more about themselves**: the full story of their card week by week,
deeper comparisons with the friends they already play with, collectible card designs, and a
promise that their BotolaGO stays free of advertising.

What it never does:

- **It never helps you win.** Fantasy, Pronostics and Pépites stay free and identical for everyone.
  No extra transfer, no extra chip, no hidden statistic that changes a pick. Paying changes what you
  _see about your own past_, never your score, your rating or your rank.
- **It never changes a rating.** Card designs are cosmetic only. The OVR, tier, four stats, number
  and founder mark are computed on the server the same way for everyone
  (`app_private.manager_card_tick`), and the design is drawn on top.
- **It never takes away what is free today.** Everything Curva shows today (the card, the season
  sparkline and table on `/curva/saisons`, the face-à-face sheet on `/curva/les-votres`) stays free.
  BotolaGO+ adds depth beside it.

This is a change to one of `PRODUCT.md`'s constraints ("Free to play. No purchase…"). The games stay
free to play; what becomes paid is an optional membership around them. The owner should confirm
that wording before any copy is written (open question Q1), and the Terms (section 11 says the app
is "financée par le sponsoring") will need a paid-services section (section 6).

### 1.2 Price idea (MAD, monthly)

No market research is in the repository, so these are reasoned starting points, not measured ones.
App-store prices must also land on the stores' fixed price points for Morocco (**to confirm** in
App Store Connect and Play Console).

| Option          | Monthly    | Season pass (one payment, about 10 months, Aug–June) | For                                                           |
| --------------- | ---------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| A. Low entry    | 19 MAD     | 149 MAD                                              | Maximum uptake; thin margin once store fees and TVA come out. |
| **B. Balanced** | **29 MAD** | **199 MAD**                                          | **Recommended.** About the price of a coffee and a sandwich.  |
| C. Collector    | 39 MAD     | 299 MAD                                              | Small, very engaged audience; harder sell at launch.          |

**Recommendation: option B, 29 MAD a month or 199 MAD for the season**, launched on the web first.
Reasons:

- The season pass matches the product's rhythm (the _journée_ and the Botola season), avoids twelve
  separate card payments where recurring card billing is uncertain (section 5.6), and is the
  simplest thing to explain.
- 29 MAD leaves room after the store's cut (15% under the small-business programmes, **to
  confirm**) and 20% TVA (**to confirm**).
- A launch offer can be a "founding member" price (for example 199 MAD for the season, locked for
  members who join before a date) rather than a free trial, because a trial needs reliable renewal
  and cancellation, which is the riskiest part of a Moroccan web checkout.

### 1.3 Free vs BotolaGO+

| Area                         | Free (today, unchanged)                                                        | BotolaGO+ (new)                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Fantasy, Pronostics, Pépites | Everything                                                                     | Nothing extra — no gameplay advantage, ever                                                                         |
| Live scores, news, clubs     | Everything                                                                     | Nothing extra                                                                                                       |
| Curva card                   | The card, OVR, tier, four stats, number, founder mark, moments, share picture  | Same card                                                                                                           |
| Card history                 | Sparkline of OVR per journée and a table (Journée / Note / Palier), per season | **Detailed history**: each stat over time, best and worst weeks, captain hit rate, transfer gains, season vs season |
| Friends                      | League table with mini cards; face-à-face sheet (today's values)               | **Head-to-head over time**: week-by-week duel, stat by stat, across seasons, with league mates only                 |
| Card design                  | The standard Éclat design for your tier                                        | **Collectible designs** (frames, finishes, animated light) — cosmetic only                                          |
| Advertising                  | None today                                                                     | **Guaranteed none**, including when sponsor placements arrive                                                       |
| Badge                        | —                                                                              | A small « + » mark next to your name (optional, can be hidden)                                                      |

---

## 2. Features

Each feature lists what the user sees, why it is worth paying for, the data it needs (existing
tables and RPCs first) and what is new. Every new read follows the house pattern: an `api.*`
function, `security definer`, step-up checked, answering `{available:false}` while switched off,
with pgTAP key-set tests.

### 2a. Detailed stat history « Votre carrière »

**What the user sees** (new screen `/curva/carriere`, or a premium tab on `/curva/saisons`):

1. A hero line: this season's OVR with its change since the first rated journée (« 72 → 81 »),
   counted up with Motion.
2. **The four stats over time**: one small chart per stat (CAP, SEL, TRF, CON) across the evaluated
   journées, provisional points hollow, nulls as gaps (the same honesty rules as the free sparkline).
   A toggle overlays last season's line when there is one.
3. **Best and worst weeks**: the three journées with the highest and lowest team score, each with
   the captain, the captain's points and the rank band (top half or not).
4. **Captain hit rate**: « Votre capitaine était le meilleur de vos titulaires 6 fois sur 11 », plus
   the average share of the best starter's points (the raw CAP figure, explained in words).
5. **Transfer gains**: each transfer's net effect over the next three journées (D4), summed per
   journée and for the season, the best and worst transfer by name, and the points hits paid.
6. **Season vs season**: a compact table of every season's final card (OVR, tier, stats).

**Why it is worth paying for:** it turns a single number into a story the manager can understand
and improve on next time — "why is my CAP 61?" gets an answer. It is about the manager's own past,
so it gives no advantage over other players.

**Data it needs:**

| Need                         | Existing source                                                                                                                                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OVR, tier, stats per journée | `app.manager_card_gameweeks` (`ovr`, `tier`, `cap`, `sel`, `trf`, `con`, `cap_raw` … `con_raw`, `provisional`, `gameweeks_counted`); read today by `api.get_my_manager_card_history(p_season_id, p_before_seq, p_limit)` (migration `20261010120200`), which returns OVR and tier per row, 1–50 rows per page |
| Seasons list, best tier      | `api.get_my_manager_card()` (`seasons`, `bestTier`, `previousSeason`)                                                                                                                                                                                                                                         |
| Team score per journée       | `app.fantasy_team_gameweek_results` (`final_score`, `starting_points`, `chip_type`, `scoring_details`)                                                                                                                                                                                                        |
| Captain and the eleven       | `app.fantasy_lineups`, `app.fantasy_lineup_players` (`slot`, `captain`, `vice_captain`) with `app.fantasy_player_gameweek_points` (`final_points`, `minutes_played`)                                                                                                                                          |
| Transfers                    | `app.fantasy_transfer_batches` (`point_hit`, `transfers_count`, `chip_type`), `app.fantasy_transfers`                                                                                                                                                                                                         |
| Existing points read         | `api.get_my_fantasy_points`, `api.fantasy_gameweek_summary` (for labels and gameweek numbers)                                                                                                                                                                                                                 |

**What is new:**

- `api.get_my_card_career(p_season_id uuid default null) returns jsonb` — premium-gated. One call
  returns per-journée stats (the four stats and their raw values), best/worst weeks, captain hit
  rate, transfer ledger and season summaries, all **only for evaluable gameweeks** (the card's own
  definition: finalised, points final, postwork complete). It reads the tables above and never
  writes. The transfer-gain arithmetic must reuse the card's D4 definition, not a second formula;
  the cleanest way is an `app_private` helper extracted from the card computation, so the two can
  never disagree (pgTAP asserts equality with `manager_card_gameweeks.trf_raw`).
- Raw values are shown in words and plain numbers, never as a second "rating".
- Charts: the app already depends on `recharts` (`package.json`); load the `dataviz` skill before
  drawing. Mobile first: one chart per stat, 120 px tall, full width, tabular figures
  (`ui.stat.*`).

### 2b. Compare with friends « Face-à-face+ »

**What the user sees:** from `/curva/les-votres` (league table) the free face-à-face sheet stays as
it is. BotolaGO+ adds « Voir le duel complet », opening `/curva/duel?ligue=<id>&adversaire=<teamId>`:

1. The two cards side by side (yours at the inline start), as today.
2. **The duel line**: journée by journée, who scored more (« Vous menez 7–4 »), as a two-colour
   strip.
3. **Stat by stat over time**: your CAP vs theirs, and so on, as paired lines.
4. **Highlights**: the journée you won by the most, their best captain pick against you.
5. Season switcher when both played earlier seasons in a shared league.

**Why it is worth paying for:** bragging rights with real numbers, in the leagues friends already
play in. It is the most social part of the offer and the one most likely to be shown to others.

**Privacy rule (law 09-08, CNDP):** a comparison may only show a manager who **already shares a
private league with the viewer**, exactly the rule `api.get_manager_cards(p_team_ids)` applies today
("league-mates and self only", `MANAGER_CARD_BACKEND_PLAN.md` 13.1). The friend's data shown is
what league mates can already see (team score per journée in the league table, card values in the
batch read) plus their stat history — which is new disclosure, so:

- the friend's per-journée stat history is shown only while both are in a shared league, and only
  for the seasons they shared it;
- a member can switch off "show my card history to league mates" in Profil (default on or off is a
  legal question, Q6 and section 6), and the read then answers only today's values;
- no share picture of a friend's figures (D19 already says a friend's rating stays in the app);
- the friend need not be a member: paying unlocks the viewer's screen, not the friend's data (and
  the friend's own privacy switch wins).

**Data it needs:** `app.fantasy_league_memberships` / league standings (`api.fantasy_league_standings`),
`api.get_manager_cards` (today's values), `app.manager_card_gameweeks` (history, both users),
`app.fantasy_team_gameweek_results` (week scores).

**What is new:** `api.get_card_duel(p_league_id uuid, p_opponent_team_id uuid, p_season_id uuid
default null) returns jsonb` — premium-gated for the caller, refuses (`PT404`, no hint why) unless
both teams are active members of `p_league_id`, honours the opponent's privacy switch, and returns
only journées both teams played inside that league's season. A column
`app.user_preferences.card_history_visible boolean` (or a small `app.premium_preferences` table) for
the switch.

### 2c. Premium card designs « Éditions »

**What the user sees:** in `/curva/carte`, a « Design » row under the card. Free members see the
standard design and the premium ones locked (a preview plays once, then a lock). Members pick a
design; the choice applies everywhere their card is drawn (their own screens, league minis, share
picture). Examples:

**Revised 2026-10-12 (owner):** the four styles are now taken from React Bits card components,
and the card art carries a real Botola Pro player photo (the manager's captain of the week, with
name and club), drawn in the sketch. « Onde » (DecayCard) was dropped on 2026-10-12 because warping
the photo distorted the player's face; three candidates replace it for the owner to choose one
(Options A, B and C). **Rule: no style may distort or warp the photo**; effects sit over the card or
round its edge.

The owner chose « Chrome noir » (2026-10-12) from three candidates that replaced « Onde » (Projecteur / SpotlightCard and Étoile filante / StarBorder were not kept).

| Style (FR / AR)             | React Bits component it follows               | Look                                                                                                                      |
| --------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| « Holo » / هولو             | ProfileCard                                   | Holographic foil through a tiled pattern, light follows the pointer or finger; green-to-cyan only, never the LEGEND prism |
| « Électrique » / كهربائي    | ElectricBorder                                | An SVG noise-displaced border that crackles round the card, in the brand green                                            |
| « Pixels » / بكسل           | PixelCard                                     | A canvas of small pixels that shimmer in from the centre over the card                                                    |
| « Chrome noir » / كروم أسود | MetallicPaint (with a GlareHover-style gloss) | A dark gunmetal frame with a gloss sweep every few seconds, darker than the steel tier metal                              |
| Club edition (future)       | —                                             | Frame in the club's colours (`src/lib/club-palette.ts`) — **only with the club's written permission**                     |
| Sponsor edition (future)    | —                                             | A partner's design, sold or given away as a campaign — revenue line, needs a contract                                     |

**Player photo on the card.** The art shows the manager's captain for the latest counted journée
(name and club under it), never a photo the manager uploads. **Photo rights at launch:** only photos
with a BotolaGO release published through the Pépites pipeline
(`app_private.player_photo_releases`, `scripts/backend/pepites-photo-job.ts`) are cleared, and on
2026-10-12 the live ranking read returned none; SportsMonks and Sofascore player images are **not**
cleared (internal placeholders only); Wikimedia Commons photos (used in the sketch, CC BY-SA, credited)
clear copyright with attribution but not the player's image right or club/FRMF marks on the shirt,
so they need the lawyer's view before public use. Without a cleared photo the card keeps today's
club-colour art.

**Rules that keep it honest:**

1. **Cosmetic only.** A design is a layer chosen at draw time; it is never an input to
   `manager_card_tick`, and no function outside the card's own reads the choice. A pgTAP test asserts
   that the compute functions do not reference the designs tables.
2. **A design never mimics a tier.** The tiers already own their metals (`eclat/foil.ts`: STADE
   amber, PRO red, CHAMPION ice blue, LEGEND violet and prism, holo only on CHAMPION and LEGEND). A
   premium design keeps the tier plaque, tier word, number and stats exactly as the tier draws them
   and changes only the backboard, frame material and light. D14 ("textures must not make numbers
   look rarer") extends to "designs must not make a tier look higher". Each design is reviewed
   against all six tier keys in the card gallery (`scripts/qa/manager-card-gallery.ts`).
3. **Built in the renderer, not around it.** Designs are new variants of the Éclat renderer
   (`src/components/manager-card/eclat/`): the backboard (`field.ts`), the frame (`ornament.ts`), the
   foil (`holo.ts`, `eclat.css`). The existing rules hold: no new SVG tag outside
   `markup-safety.ts`'s allow-list, beats ≤ 600 ms (`BEAT_CAP_MS`), `tilt.ts` owns the tilt, nothing
   inside the SVG animates the number. Motion and React Bits ideas (below) apply on the wrappers.
4. **Club and sponsor designs need rights.** Club crests are cleared for in-app display only;
   `PRODUCT.md` says it is **unknown** whether they may appear in share images or marketing. A club
   design is a commercial use of a club's identity and needs that club's written agreement.
5. **Lapsed members.** When membership ends the card falls back to the standard design; the chosen
   design is remembered and comes back on renewal. Share pictures already made stay as they are.

**Data it needs / what is new:** `app.card_designs` (catalogue: `code`, `status`, `premium`,
`starts_at`, `ends_at`, labels FR/AR — readable by everyone), `app.card_design_choices`
(`user_id`, `design_code`, `chosen_at` — written only through `api.choose_card_design(p_code)`,
which checks the entitlement). `api.get_my_manager_card()` and `api.get_manager_cards()` gain one
key, `design`, resolved server-side (`'standard'` when not entitled) — a contract change that needs
the zod schemas in `src/backend/manager-card/contracts.ts` and the key-set tests updated together.

The build should **extend Éclat** with these looks rather than ship React Bits components as a second
renderer: React Bits is the reference for each effect (see 3.4 for the licence).

---

## 3. The premium page

Route: `/plus` (French and Arabic share the URL, as everywhere today; `/ar/plus` once language URLs
exist). Linked from Profil, from locked premium entry points (a lock chip, never a modal that blocks
the free content), and from Curva. Not indexed while the offer is off.

**Placement (owner decision, 2026-10-13): BotolaGO+ lives in Curva**, with no tab of its own.
Card styles on « Votre carte », the detailed career history on « Vos saisons », the detailed
head-to-head on « Les vôtres »; a locked extra opens the four-screen offer. Members manage it in
Profil › BotolaGO+. The logo's « + » is drawn in 3D (lit face, extruded side, soft shadow), as in
the sketch.

**Card format and visibility (owner decisions, 2026-10-13).**

- **Everybody gets the gold card.** The collector shield in gold replaces the current Curva card for
  every manager, free or not (its own approved screen work, separate from BotolaGO+).
- **No photos on the card.** The manager's name is the art: written as a holographic autograph
  (signature script for Latin, Ruq'ah for Arabic), with the initials as a faint foil monogram. No
  player photos, so no image rights to clear.
- **Members' editions are public.** A member's chosen edition (Holo, Électrique, Pixels, Chrome)
  shows wherever their card is drawn: the public Curva ranking, league tables, their profile, share
  images. Lists show a still miniature; opening a card shows the full card with tilt and foil.
- **Ranking order is points only.** The style never changes the order, the rating, the tier or the
  stats, and no badge suggests a member plays better.
- **Expiry.** When membership ends the card returns to gold everywhere; rating and history stay.
- **Privacy.** The existing switch to hide card history from league mates stays; the style itself is
  public, like a profile picture.

**Revised 2026-10-12 after the owner's feedback on the first sketch:** the first contact with
BotolaGO+ is now a **six-step onboarding** (3.0b below, drawn in the sketch). The long scrolling
page of 3.1 stays as `/plus` for people who come back to compare plans or read the questions.

### 3.0a Onboarding patterns from Mobbin

Researched on Mobbin (iOS flows, 2026-10-12). Patterns only: no asset, layout or wording is copied.

| App and flow                                  | What it does well                                                                                                                                                                                                         | What BotolaGO+ takes from it                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Duolingo, "Subscribing to Super" (two flows)  | A numbered progress bar across several value screens, **one benefit per screen** before any price; a free-vs-paid comparison; "most popular" badge on one plan; "cancel anytime" right by the button; a plain "No thanks" | Progress bar, one idea per step, value before price, recommended badge, reassurance under the call to action |
| Strava, "Subscribing to Strava"               | A vertical **timeline** (today / reminder before it ends / when you pay) that removes the fear of a hidden charge; "Skip" always visible; the price restated under the button                                             | Step 5 timeline, switched by plan; skip ("Voir les prix") on every value step                                |
| Grok, "Upgrade a plan"                        | Dark, premium register; a short benefit list with icons; a two-plan selector; one high-contrast button; the renewal line under it; restore purchases in the footer                                                        | Dark aurora register, two-plan selector, single primary button, restore link (store builds)                  |
| Jomo, "Subscribing to Jomo Plus"              | **Personalised** headline (the user's name and their own numbers); a price anchor ("the price of a coffee"); a warm thank-you screen after paying                                                                         | The member's own card and numbers as the hero; « moins de 7 MAD par semaine »; step 6 welcome                |
| Public, "Subscribing to Public"               | A dedicated **welcome** screen once paid that says what is now unlocked                                                                                                                                                   | Step 6 with the two first things to do                                                                       |
| FotMob, "Subscribing to FotMob" (football)    | Honest benefit list for a sports audience, including what the subscription does **not** cover                                                                                                                             | The « le jeu reste gratuit, aucun point en plus » line on step 1 and under the button                        |
| DAZN, "Subscribe to DAZN plan" (football)     | Stadium mood, gold-on-dark comparison, and an explicit hand-off to web checkout                                                                                                                                           | Mood only; the hand-off is a reminder that store builds must not link to web checkout (5.6)                  |
| Fixtured, "Subscribing to Fixtured+" (sports) | Free-vs-Plus table and user reviews next to the plans                                                                                                                                                                     | Table kept on `/plus`; **reviews not used** until real ones exist (no invented social proof)                 |
| KOHO, "Upgrading a plan"                      | A short confirmation ("plan upgraded") back in context                                                                                                                                                                    | After step 6, return the member to the screen they came from                                                 |

What makes them clear and premium, and the rule we keep for each:

1. **Story before price.** Three short value screens, each about the person's own data, then the
   price. Skipping straight to the price is always one tap away.
2. **Show, not list.** Each value screen shows the real thing (the chart, the duel, the card) with
   the member's figures; a sample is labelled « Exemple ».
3. **One primary button per screen**, same verb family (« Découvrir », « Continuer », « Rejoindre »).
4. **Reassurance at the moment of paying:** what happens next, when money moves, how to cancel.
5. **Social proof only when true.** Counts of members or ratings appear only once measured; until
   then the slot is empty, never a placeholder that looks real.
6. **Close and back always visible**; Escape and the arrow keys work; swiping moves between value
   steps (not past the price, so nobody pays by swiping).

### 3.0b The six steps (superseded by 3.0c; kept for the reasoning)

**Revised 2026-10-12 (owner): headlines only.** Each step is one short headline, the visual and
one button. The only other words kept are the honest minimum: « Jeu gratuit pour tous. Aucun point
en plus. », « Exemple » on sample data, « Ligues privées uniquement », « Même note, même palier. »,
the example-price line and the renewal line under the buy button.

| Step | Purpose | French headline                | Arabic headline         | Button              |
| ---- | ------- | ------------------------------ | ----------------------- | ------------------- |
| 1    | Hook    | Votre carte. Votre saison.     | بطاقتك. موسمك.          | Découvrir BotolaGO+ |
| 2    | Season  | Votre saison en un coup d'œil. | موسمك في لمحة.          | Continuer           |
| 3    | Duel    | Défiez vos amis.               | تحدَّ أصدقاءك.          | Continuer           |
| 4    | Styles  | Choisissez votre style.        | اختر أسلوبك.            | Voir les formules   |
| 5    | Plan    | Toute la saison : 199 MAD.     | الموسم كله: 199 درهمًا. | Rejoindre · 199 MAD |
| 6    | Welcome | Bienvenue dans le club.        | مرحبًا بك في النادي.    | Voir ma saison      |

Step 2 visuals: a radial OVR gauge with the tier and the next tier's threshold, four stat tiles
(value, change since last week, sparkline), and points per journée as bars with the best week
highlighted by the captain's photo. All count up or draw in with Motion; static under reduced
motion. Step 5 keeps a three-point timeline (season pass: Aujourd'hui · tout débloqué → Chaque
journée · mise à jour → Fin de saison · fin, sans prélèvement; monthly: Aujourd'hui · 29 MAD → J-3 ·
rappel → Jour 30 · renouvellement) and the line under the button (« Sans renouvellement
automatique. » / « Renouvelé chaque mois. Annulable à tout moment. »).

Copy rules applied: outcome over feature, specific numbers, short sentences, the « tu » voice (the
sketch overrides the `vous` table of 3.2), one verb family for buttons, reassurance under the button,
no hype words, no invented proof. The saving is computed from the calendar, against the monthly
payments needed to cover the same period (3.0d), and must be recomputed if prices change. The owner decided (2026-10-12) that the
monthly renewal reminder is built: an in-app notice 3 days before each monthly renewal (see
"Renewal reminder" below). It is a launch requirement for the monthly plan, so the line stays.
The owner chose « vos amis » over « vos potes » for the duel step.

**Renewal reminder (owner-approved, required before the monthly plan launches).**

- When: 3 days before each monthly renewal date, from the store or payment provider's renewal date.
- Where: an in-app notice on the next app open (a banner on Curva and an entry in the
  notifications list), plus push where the member allowed it. Email stays optional, as email is off.
- Copy (FR): « Votre abonnement BotolaGO+ se renouvelle le {date} pour 29 MAD. Rien à faire
  pour continuer. Pour arrêter, Profil → Abonnement. » Arabic to be written alongside.
- One notice per renewal; never sent for the season pass, which does not renew.
- Tapping it opens Profil → Abonnement, with cancel reachable in two taps.
- Built with the BotolaGO+ subscription work (it needs the renewal date, which exists only once
  payments are built), shipped switched off and tested before the monthly plan goes on sale.

### 3.0c The four-screen flow and two routes (supersedes 3.0b; sketch rebuilt 2026-10-13)

**Owner direction: « my manager, my club, my season ».** The six-step sketch of 3.0b is replaced by
four screens with one visual job each. The sketch (`botolago-plus-sketch.html`) is a design
prototype for approval, not app code; every price, date and name in it is example data.

| #   | Screen            | Visual job                                                                                                                                                                                                                       | Primary button                              |
| --- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | Personal preview  | The member's manager card as the hero, with an inline style selector (Holo, Électrique, Pixels, Chrome noir). The single reassurance « Ta note ne change jamais, seul le style change. » sits above the button (pass 2, 3.0d) | Voir les avantages                          |
| 2   | Premium value     | One football story, « Ta meilleure journée de la saison » (points per journée, best one highlighted), and one rivalry (two manager identities, « Toi 7–4 Sami »). The CAP/SEL/TRF/CON comparison sits behind « Voir le détail ». Then exactly three benefits. | Choisir mon pass                            |
| 3   | Choose your plan  | Two plans side by side, a banner crop of the fan's own card (finish, manager name, earned rating), the billing line next to the button, the terms behind « Voir les conditions ». Stands alone for people who tapped « Voir les prix ». Headline: « Ta carte. Tes rivalités. Toute ta saison. » (never a price). | Activer mon pass / M'abonner (the price sits in the billing line above the button) |
| 4   | Unlocked          | A brief reveal of the chosen card, optional share, one access line with « Gérer dans Profil ». The close button (X) leaves the offer (the sketch shows the toast « Retour à l'app ») and never loops back to screen 1.                              | Ouvrir ma saison                            |

Navigation: « Voir les prix » jumps to screen 3 from screens 1 and 2; swipe and arrow keys cannot
move past screen 3; screen 4 is reached only through the purchase button.

**Two routes**, switched in the desktop storyboard (« Parcours »):

- **Joueur existant**: personal-looking data, starts at screen 1.
- **Nouveau fan**: all data clearly labelled « Exemple », with the note « après ton inscription
  gratuite ». Both routes reach the same plan screen.

**Card hierarchy** (all four screens): manager name and club identity first; the captain photo is
supporting and labelled « Capitaine cette semaine · K. Boutaïb »; OVR and tier sit in their own
quiet box labelled « Note gagnée », visually separate from the BotolaGO+ badge (shown only once the
member holds a pass); stats are secondary, in plain words (CAP = Capitaine, SEL = Titulaires,
TRF = Transferts, CON = Régularité). Rule line: « Ton palier se gagne sur le terrain. BotolaGO+
change le style, jamais la note. » The tier is a plain text label (« Palier Pro »), not a coloured
chip, so it cannot be mistaken for a paid badge.

**Visual system.** Quiet deep-navy background (no aurora, no ambient motion); the card is the only
expressive element; one mint primary button; the club colour is a thin accent on the card. Motion
only on style change (main card) and the unlock reveal; pricing and terms sit on stable
high-contrast surfaces with no motion. Changa for display headlines (28 to 32 px), Manrope 16 px for
body (Noto Sans Arabic in Arabic; Changa for Arabic display), billing text at least 14 px, buttons at
least 48 px tall. French uses « tu » throughout (this overrides the `vous` table of 3.2 for the
sketch; confirm before the build); Arabic is Modern Standard Arabic, second person singular.
Reduced motion is honoured and can change while the page is open.

#### Free vs BotolaGO+ (proposal, pending owner approval)

This is a **proposal — pending owner approval**. It replaces the table of 1.3 for the four-screen
sketch only once approved.

| Area                                                                                                     | Free             | BotolaGO+ |
| -------------------------------------------------------------------------------------------------------- | ---------------- | --------- |
| Fantasy, points, leagues, Pronostics, Pépites                                                            | Everything       | Nothing extra |
| Manager card, OVR and earned tier                                                                        | Yes              | Same, never changed |
| Playing with friends, standings, basic results                                                           | Yes              | Same |
| Premium card styles (Holo, Électrique, Pixels, Chrome noir)                                              | Preview only     | Yes |
| Full season history                                                                                      | Basic            | Yes |
| Detailed head-to-head history with friends                                                               | Today's duel     | Yes |
| Personal weekly recap and season summary                                                                 | No               | Yes |
| No ads                                                                                                   | None today       | Guaranteed |

History and card stay the member's after cancelling. The three benefits shown on screens 2 and 3 are
the styles, the full season history and the detailed duels with friends. **Open point:** the sketch
says « Le style premium revient au style de base » after cancelling; the owner may prefer the
opposite (the last style stays). The three benefits and this line must follow the final table.

#### Pricing rules shown in the sketch

- **Two options:** Pass saison 199 MAD, « jusqu'au 31 mai 2027 », one payment, no automatic
  renewal; Mensuel 29 MAD / mois, with the real next billing date (today plus one month). The
  route note and the credits mark the data as example data; the plan cards carry no « Exemple » tag.
- **Dates come from the calendar, never typed.** The season end is the next 31 May on or after
  today. The next monthly billing date is today plus one month. The reminder is 3 days before each
  renewal; the option shows « Rappel 3 jours avant chaque renouvellement » and the terms repeat it.
- **Saving only with its basis, and the basis must match the pass period.** The sketch counts the
  monthly payments needed to cover the same period (today to 31 May 2027 is 8 payments, so
  « Économie de 33 MAD par rapport à 8 paiements mensuels »). The terms show the sum
  (« 8 paiements mensuels, soit 29 MAD × 8 = 232 MAD ») and say the payments run past 31 May, so
  it is not an identical access. A comparison over a longer period would need the pass to start at
  the season start and say so. The saving is hidden when it is zero or negative, with no promise of
  an offer in its place. Recompute it if prices change.
- **Total due today** is stated on its own, with the renewal terms, the cancel path
  (« Profil › BotolaGO+ › Gérer mon abonnement ») and « Restaurer un achat » on the same screen.
- **The headline never carries a price**; prices appear in the options and the buttons.
- **Terms invented for the sketch, to be decided by the owner:** no automatic renewal for the pass;
  monthly access stays active to the end of the paid period after cancelling; cancel before the
  billing date to avoid the next charge; refund and early stop for the pass (the sketch says the
  rule is to be confirmed). The terms block is labelled « Exemple, à valider » on the screen.
- **Dummy actions:** « Restaurer un achat », « Gérer mon abonnement » and the share button only
  show a message. The manage and cancel screen is not drawn; draw it before approval if the cancel
  path is a concern.

#### Validation plan

1. **Moderated sessions, 5 to 6 per group, in French and in Arabic.** Groups: existing players (their
   own card) and new fans (after the free sign-up). Tasks: choose a style, say what BotolaGO+ adds,
   say what they would pay and when, find how to cancel, say whether the rating can be bought.
   Pass criteria: nobody believes paying changes points; everyone finds the cancel path; the saving
   basis is understood; Arabic reads naturally.
2. **Funnel events**, named once the build starts, in this order: offer viewed, preview interaction
   (a style tried), plan selected, checkout started, payment succeeded (taken from the billing
   events, not from the button), first premium feature used (a premium style applied, the full
   history opened or a detailed duel opened). Split every step by route (existing or new) and
   language. No event is sent from the sketch.
3. **Experiments, in priority order**, each after the previous one has a stable baseline:
   1. Style preview on screen 1 versus a static card (does trying a style lift plan selection?).
   2. Season pass shown first versus monthly first.
   3. The saving line with its basis versus no saving line (trust and conversion).
   4. Screen 2 story (best journée and rivalry) versus the three benefits alone.
   5. The « Voir les prix » shortcut visible on screen 1 versus from screen 2 only.

### 3.0d Pass 2 (2026-10-13): hierarchy and commercial decisions

Owner review of the rebuilt sketch. The visual direction stays. The remaining problem is hierarchy:
reassurance, statistics and subscription details compete with the emotional appeal of owning the
card. This section supersedes the terms in 3.0c where they differ.

#### Hierarchy principles

1. **The card is the hero on every screen.** Anything that is not the card, the benefit it unlocks
   or the one button must earn its space.
2. **One reassurance, said twice at most.** « Ta note ne change jamais, seul le style change. »
   (AR « تقييمك لا يتغيّر أبدًا، الأسلوب وحده يتغيّر ») appears once on screen 1, above the button,
   and once at the purchase decision on screen 3, with the same wording.
   Not below the card, the style selector and the button together; not on the celebration screen.
3. **Details sit behind the decision, not in front of it.** Full terms are collapsed behind
   « Voir les conditions »; only the essential billing line sits next to the button.
4. **Readability before decoration.** The finish pattern is quieter behind text; captain and
   statistic labels are larger.
5. **Show the thing they chose.** The paywall shows a purpose-built banner crop of the fan's own
   card (finish, manager name, club, earned rating), not a scaled-down card and not the club tile.
   The selector label « Chrome noir » is shortened to « Chrome » so all four labels fit one line.
6. **Celebrate first.** Screen 4 is the card plus one access line: plan, until or next date,
   « Gérer dans Profil ». Expiry and cancellation explanations live in subscription management.
7. **Screens 2 and 3.** A shorter chart and a compact rivalry preview so the rivalry and benefits
   show without scrolling at 390 x 844; both plans visible side by side or as two compact rows above
   the fixed purchase area.
8. **Arabic scores never share one string.** Each participant gets a column with crest, name, role
   tag and score, so « أنت 7 ، سامي 4 » cannot read as the scores belonging to the opposite people.
   Names are localised (« سامي », « كريم ب. »); the Latin « VS » becomes « ضد ». Mixed strings
   (matchweek, « 29 MAD × 8 », dates) are isolated with `bdi`; the matchweek label is spelled out in
   Arabic (« الجولة 9 ») and resolves its own direction.
9. **Counted nouns agree with the number.** Arabic uses singular for 1, dual for 2, plural for 3 to
   10 and singular accusative from 11 (« جولة واحدة », « جولتين », « 3 جولات », « 11 جولة »), so the
   saving line stays correct as the monthly-payment count falls from 8 to 1.
10. **Time axis.** The points chart and the won/lost strip follow the reading direction: in Arabic the
    first matchweek is on the right. Deliberate; confirm with the Arabic reviewer.
11. **Prototype notes stay out of the product.** The test price and the late-season rule appear in a
    note under the phone, not in the buyer-facing terms; the terms say what the buyer is promised.

#### Commercial decisions (owner-approved recommendations)

| Topic | Decision |
|---|---|
| Season pass price | **199 MAD is a test price.** No automatic daily reduction. |
| Late-season rule | When the full pass stops beating monthly payments for the time left, offer a **« Reste de la saison »** price instead of cutting the price daily. The sketch shows this as a note, not a third plan. The threshold and the remaining-season price are set before launch and tested. |
| Saving wording | « **par rapport à 8 paiements mensuels** ». 13 October to 31 May is about 7 months and 18 days; 8 monthly charges would cover it and also run past 31 May. Never imply identical 8-month access. Recompute from the calendar; hide when zero or negative. |
| Monthly plan | Cancel at any time. Cancelling stops the next renewal; access stays until the end of the paid billing period, which is the **billing anniversary** (13 November for a purchase on 13 October), not the end of the calendar month. |
| Season pass | **Does not renew.** Access ends on 31 May of the season. |
| After expiry or cancellation | Stays viewable: the card and the earned history (ratings, tier, finished gameweeks). Becomes unavailable: premium analysis, meaning the detailed history views, the detailed duels (Face-à-face+) and the premium styles (the card returns to the base style). The sketch must say exactly this, in subscription management, not on the celebration screen. |
| Refunds | **« À confirmer ».** Left open until the payment platform and the actual policy exist. The sketch keeps the label; nothing is promised. |

Billing line next to the purchase button (essential only, at least 14 px):
season « 199 MAD aujourd'hui · sans renouvellement »; monthly « 29 MAD aujourd'hui · renouvelé le
13 novembre 2026 · annulable à tout moment ». The rest sits behind « Voir les conditions ».

#### Open items for a native Arabic reviewer

- [ ] Rivalry columns: name and score read in the right pairing in RTL, with the free-text name of a
      friend of either script (a Latin name in an Arabic column is isolated with `bdi`).
- [ ] Plural forms (« تتقدّم بفارق جولة واحدة / جولتين / 3 جولات », « دفعة شهرية واحدة », « دفعتين
      شهريتين », « 8 دفعات شهرية »), the saving line « توفير 33 MAD مقارنة بـ 8 دفعات شهرية » and the
      terms sentence « تغطي هذه الفترة لكنها تمتد إلى ما بعد … ».
- [ ] « MAD » versus « د.م. » or « درهم » in Arabic prices (the sketch keeps MAD on purpose, with the
      number and currency isolated), the per-month suffix « / شهريًا », and the masculine imperatives
      « فعّل باقتي » and « اشترك ».
- [ ] Terms wording: « في اليوم نفسه من الشهر » for the billing anniversary, « تاريخ التجديد » used
      for the same date in both sentences, « عند الانتهاء تعود بطاقتك إلى الأسلوب الأساسي ».
- [ ] Chart and strip direction (first matchweek on the right) and the label « جولات الفوز ».
- [ ] Matchweek labels (« الجولة 9 » versus « J.9 ») and their order next to numbers.
- [ ] « MAD × 8 » and « 29 MAD × 8 »: currency, multiplication sign and digit order, Western versus
      Arabic-Indic digits (the sketch uses Western digits).
- [ ] Dates (« 13 نوفمبر 2026 », « 31 مايو 2027 »): month names, order, and the Maghreb spelling.
- [ ] Access line on screen 4 (« شهري · يتجدد في … », « باقة الموسم · حتى … ») and the label
      « إدارة في الملف الشخصي ».
- [ ] The remaining-season offer name and the billing-line wording.
- [ ] Tier « محترف » and OVR kept in Latin letters (still Q12).

### 3.1 Sections (mobile first, 390 px; one 672 px column from 768 px)

1. **Hero** on the dark mesh register (`ui.surface.mesh`, `ui.tone.onMesh*`): aurora background,
   the wordmark with « + » in shiny text, one line of promise, the member's own card tilting (or a
   sample card labelled « Exemple » for guests — never a fake user), primary call to action.
2. **Four benefits** as spotlight cards: Carrière, Face-à-face+, Éditions, Sans publicité.
3. **Your numbers, unlocked**: a preview of 2a using the reader's real data when signed in with a
   card (blurred values after the first chart), a clearly labelled example otherwise. Count-up on
   the headline figures.
4. **Designs gallery**: three designs on a swipeable row (scroll-snap), the reader's tier kept.
5. **Free vs BotolaGO+** table (1.3), short.
6. **Price**: monthly and season pass, the recommended one preselected, all-inclusive price
   (« TTC ») stated, renewal and cancellation stated in one plain line next to the button.
7. **Questions**: cancel any time, what happens to my design, does it help me win (« Non. »),
   which payment methods.
8. Footer links: Conditions de BotolaGO+, Politique de confidentialité, restore purchases (store
   builds only).

### 3.2 Copy direction (FR `vous`, AR Modern Standard Arabic, no hype, answer first)

| Slot         | French                                                                                                         | Arabic (to be written/reviewed as Arabic, not a literal translation)            |
| ------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Kicker       | Abonnement BotolaGO+                                                                                           | اشتراك BotolaGO+                                                                |
| Title        | Votre saison, en entier.                                                                                       | موسمك، كاملًا.                                                                  |
| Sub          | L'historique de votre carte, vos duels entre amis, des éditions de collection. Le jeu reste gratuit pour tous. | سجلّ بطاقتك، مواجهاتك مع أصدقائك، وإصدارات للمجموعة. اللعب يبقى مجانيًا للجميع. |
| CTA          | Rejoindre BotolaGO+                                                                                            | انضمّ إلى BotolaGO+                                                             |
| Honesty line | Cosmétique uniquement : votre note ne change pas.                                                              | تصاميم شكلية فقط: تقييمك لا يتغيّر.                                             |
| No ads       | Jamais de publicité pour les membres.                                                                          | بدون إعلانات للأعضاء، دائمًا.                                                   |
| Price line   | 29 MAD par mois, TTC. Sans engagement.                                                                         | 29 درهمًا شهريًا، شاملة الضريبة. بدون التزام.                                   |

Every string goes through `src/i18n/dictionary-fr.ts` / `dictionary-ar.ts` with keys under
`plus.*`; no letter-spacing on Arabic; digits Latin and isolated in `<bdi>`; « MAD » / « درهم » as
a sibling span, not inside the score-ramp figure (DESIGN_SYSTEM_V2 §2.2). The no-AI-notice rule
(`AGENTS.md`, Public editorial rule) applies to all of it.

**Logo rule (owner, 2026-10-13).** BotolaGO+ is never typed on screen. Every visible
« BotolaGO+ » — the bar at the top of every screen, headings, sentences, the badge on the card,
button labels — is the official BotolaGO wordmark (`src/assets/brand/botolago-wordmark-*.svg`, via
`Logo`) followed by a « + » drawn as part of the logo, in the BotolaGO+ accent. Inside a sentence
it sits at text height. Screen readers still read « BotolaGO+ » (`role="img"` with that label).
The strings in the copy table above show where the logo goes; they are not the rendering. Plain
text is kept only where an image cannot go: the browser tab title, store listings, push
notifications, emails' subject lines and shared text.

### 3.3 Motion choreography

The app already ships Motion (`"motion": "13.4.4"` in `package.json`), loaded lazily through
`src/lib/motion-lib.tsx` so it stays out of the first-load chunk (`MOTION_PLAN_4.md`). The premium
page follows the same rule: its route chunk imports Motion, nothing else does.

| Moment         | Effect                                                                                                     | React Bits reference            |
| -------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Page enters    | Aurora drifts behind the hero (slow, 12–20 s loop); hero text rises 12 px and fades in, staggered 60 ms    | **Aurora**, **BlurText**        |
| Wordmark « + » | One light sweep across the « + » every 6 s; static under reduced motion                                    | **ShinyText**                   |
| Card           | Tilts with pointer or a horizontal finger drag (Éclat's existing spring tilt), holo film follows the light | **ProfileCard**, **TiltedCard** |
| Benefit cards  | A soft radial spotlight follows the pointer on desktop; on phones a one-time glow as each enters view      | **SpotlightCard**               |
| Numbers        | Count up once when scrolled into view (`inView`), 900 ms, spring ease; final value in the server render    | **CountUp**                     |
| Price button   | A thin moving border on the recommended plan                                                               | **StarBorder**                  |

**Performance rules:** transform and opacity only; no filter or blur animation on large areas; the
aurora is CSS gradients (or a single small `ogl` canvas only if measured at 60 fps on a mid-range
Android — React Bits' Aurora depends on `ogl`, a new dependency the owner would have to accept);
the page must keep its Largest Contentful Paint inside the budgets in
`docs/engineering/PERFORMANCE_2026_09_24.md`; animations pause when the tab is hidden; the card
renderer chunk is the one Curva already uses (`preloadCardRenderer`).

**Reduced motion:** under `prefers-reduced-motion: reduce` there is no aurora drift, no sweep, no
tilt, no count-up (final numbers drawn at once), no spotlight following; content appears in place.
The global block in `src/styles.css` covers CSS; every Motion call checks `prefersReducedMotion()`
from `src/lib/motion.ts`.

**RTL:** gradients use `to bottom` or centred radial origins, never a `deg` angle (contract test);
the shiny sweep runs in the reading direction; the card mirrors through Éclat's own mirroring, never
a CSS flip.

### 3.4 React Bits: what it is and how it enters the repo

- React Bits (reactbits.dev, GitHub `DavidHDev/react-bits`) is a collection of animated React
  components distributed **as source to copy**, in four flavours (JS or TS, CSS or Tailwind), by
  hand or through its CLI (`jsrepo` / shadcn registry). It is **not an npm dependency**: the chosen
  files are copied into the repo (proposed folder `src/components/plus/fx/`), adapted to the design
  system (tokens, logical properties, `ltr:`-only tracking, no `deg` gradients) and owned from then on.
- **Licence (checked 2026-10-12):** the repository's `LICENSE.md` reads "MIT + Commons Clause License
  Condition v1.0", allowing use, copy and modification **as part of an application, website, or
  product** but not selling the components themselves. Keep its notice in a header comment of each
  copied file.
- **Dependencies per component (to confirm at copy time):** CountUp, TiltedCard, BlurText use
  `motion` (already in the app); Aurora uses `ogl` (new); ShinyText, SpotlightCard, StarBorder,
  GlareHover and ProfileCard are CSS/React only. ElectricBorder and PixelCard (styles in 2c) use an
  SVG filter or a canvas; MetallicPaint uses WebGL, so Option C reproduces its look in CSS; ReflectiveCard uses WebGL and was not picked.
- Version pinning: record the React Bits commit hash each file was copied from in the header
  comment.

---

## 4. The Curva ranking and prizes (internal)

**This section is internal. None of it appears in the app.**

### 4.1 The ranking

A Curva ranking (managers sorted by Manager Card rating) is being built separately on branch
`claude/curva-ranking`, "for information". BotolaGO+ links to it from the premium page and the
member's career screen (« Votre place au classement Curva »), and nothing in BotolaGO+ changes how
it is computed. The ranking is free to view for everyone.

Two existing written rules collide with it and must be revised by the owner on that branch, not
silently:

- `docs/backend/MANAGER_CARD_OPERATIONS_RUNBOOK.md`, "The one rule: the card is display only": "**No
  prize, ranking, league or Fantasy rule may read card data**", backed by a database test that no
  function outside the card's own reads `app.manager_card*`.
- `docs/product/MANAGER_CARD_SECTION_PLAN.md` §4.5: "OVR may not rank anyone (lab rule,
  D-display-only)", and G3's "never sorted by OVR".

### 4.2 The prize rule (owner decision, 2026-10-12)

- There are **no prizes** on the Curva ranking now.
- Prizes **may later** be offered on it, and **only to BotolaGO+ members**.
- The app must **not** say "just for fun", « juste pour le plaisir », « sans lots » or "no prizes".
  It must equally not hint that prizes exist (data honesty: "copy must not promise anything the
  system does not deliver"). So: **say nothing about prizes on the ranking** until a prize exists.

### 4.3 Legal flag — must be checked by a Moroccan lawyer before any prize launches

Tying prize eligibility to a paid subscription is the riskiest idea in this plan.

- In Morocco, games of chance and betting are a state monopoly (operated by La Marocaine des Jeux et
  des Sports and the Loterie Nationale). A contest where people **pay to be eligible** for a prize
  can be classified as a game of money or a paid lottery even when the ranking is skill-based,
  depending on how the payment and the chance element are read. **To confirm with a lawyer.**
- Promotional contests and "loteries publicitaires" are framed by consumer law (law 31-08) and its
  texts; free participation is usually the safe pattern. **To confirm with a lawyer.**
- BotolaGO's Fantasy prizes today are free to enter, organised by Go Sports Technologies, with
  ID-checked winners and staff excluded (`src/content/legal/prize-terms.ts`). That is the model that
  works now.

Compliant options to put to the lawyer (in order of safety):

1. **Free eligibility, sponsor-funded prizes.** Everyone on the ranking is eligible; a sponsor (or
   Go Sports Technologies) funds the prizes; BotolaGO+ members get a non-prize perk instead (early
   access to a design, a members-only design drop, a badge). Safest.
2. **Free alternative entry.** Members are entered automatically; any non-member can enter the same
   prize period for free with equal standing (for example a one-tap « Je participe » each period, or
   a written request), stated in the prize rules. Common internationally; whether it suffices in
   Morocco is the lawyer's call.
3. **Members-only prizes, paid entry.** What the owner described. **Do not launch** without a written
   legal opinion, and expect it may need an authorisation or may be refused.

Whichever option: the prize rule must not read anything a design or a payment can change; the
ranking must read only the server-computed OVR; a new prize-terms document is needed; and the
runbook rule in 4.1 must be formally revised.

---

## 5. Payments and entitlements

### 5.1 Principles

- **One source of truth for "is this person a member":** the database, not the browser, not the
  store SDK. Every premium read checks it server-side.
- **Only the payment provider's verified events change it.** No browser write. Service-only writes.
- **Ships switched off**, like every recent BotolaGO feature (`app_private.*_settings` +
  `*_configure`), so migrations can be applied long before launch.
- **Respects one writer per database** (`AGENTS.md`): the webhook worker is a new writer and goes on
  the list of scheduled/automatic writers there.

### 5.2 Subscription states

| State                  | Meaning                                                                                                                | Member features?                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `none`                 | Never subscribed                                                                                                       | No                              |
| `active`               | Paid period running                                                                                                    | Yes                             |
| `cancelling`           | Cancelled by the user, period not over (no renewal)                                                                    | Yes, until `current_period_end` |
| `grace`                | Renewal payment failed, provider retrying; grace window (web: 7 days proposed; stores: their own billing grace period) | Yes                             |
| `on_hold`              | Grace over, still unpaid (stores' account hold)                                                                        | No                              |
| `expired`              | Period ended without renewal                                                                                           | No                              |
| `refunded` / `revoked` | Refund or chargeback; store revocation                                                                                 | No, immediately                 |

A season pass is a non-renewing product: `active` until `current_period_end`, then `expired`.

### 5.3 Data model (new, all RLS enabled and forced, no table privileges for `anon`/`authenticated`)

| Table                                         | Holds                                                                                                                                                               | Written by                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `app_private.premium_settings` (one row)      | `mode` (`off` / `preview` / `on`), `checkout_enabled`, price display values                                                                                         | `app_private.premium_configure(...)`, `postgres` only |
| `app_private.premium_products`                | `code` (`plus_monthly`, `plus_season`), provider product ids per store/provider, period, price in MAD                                                               | owner script                                          |
| `app_private.billing_customers`               | `user_id` ↔ provider customer id / store original transaction id / purchase token                                                                                   | webhook worker                                        |
| `app_private.billing_events`                  | every provider event, raw payload, signature check result, `provider_event_id` **unique** (idempotency)                                                             | webhook worker (insert only)                          |
| `app.premium_entitlements`                    | `user_id` (pk), `state`, `product_code`, `source` (`web` / `apple` / `google` / `grant`), `current_period_start`, `current_period_end`, `grace_until`, `updated_at` | `api.service_apply_billing_event` only                |
| `app_private.premium_grants`                  | manual comps (press, partners, support goodwill), with reason and staff id                                                                                          | admin RPC under dual control                          |
| `app.card_designs`, `app.card_design_choices` | section 2c                                                                                                                                                          | owner script / `api.choose_card_design`               |

### 5.4 Functions

- `api.premium_status() returns jsonb` — anonymous, like `api.manager_card_status()`:
  `{enabled, checkoutEnabled, prices}`; never raises.
- `api.get_my_premium() returns jsonb` — signed in: `{available, state, productCode, source,
currentPeriodEnd, cancelAtPeriodEnd}`; `{available:false}` while off.
- `app_private.has_premium(p_user uuid) returns boolean` — the **one** check every premium read
  calls (`active`, `cancelling`, `grace`, or a live grant).
- `api.service_apply_billing_event(p_event jsonb) returns jsonb` — `service_role` only; inserts the
  event (unique id ⇒ a replay is a no-op), then moves the state machine. Never trusts a client.
- `api.create_checkout_session(p_product text) returns jsonb` — signed in; returns a provider
  redirect URL with the user id bound server-side (web only).
- `api.admin_list_premium_members(...)`, `api.admin_get_premium_member(p_user)`,
  `api.admin_grant_premium(...)` — admin console, MFA, audited through the existing admin audit
  (`docs/backend/ADMIN_CONTROL_PLANE_PLAN.md`); grants under the dual-control matrix.
- Every new `api.*` function joins the step-up counts in the
  `ordinary_account_mfa_step_up*.test.sql` tests in the same commit.

### 5.5 Edge Functions and front end

- `supabase/functions/billing-webhook/`: receives provider callbacks (web PSP, Apple App Store
  Server Notifications v2, Google Play Real-time developer notifications), verifies signatures
  (Apple JWS chain, Google Pub/Sub push auth and a Play Developer API lookup, the PSP's hash),
  then calls `api.service_apply_billing_event`. Secrets in Supabase function secrets.
- `supabase/functions/billing-restore/`: for the phone app's "Restaurer mes achats": takes the
  store receipt/purchase token, validates it with the store, applies the event.
- Front end: `src/backend/premium/` (repository + zod contracts, mirroring
  `src/backend/manager-card/`), `src/services/use-premium.ts` (`usePremium()` hook, cached like
  `use-manager-card.ts`), a build flag `PREMIUM_BUILD` in `src/lib/feature-flags.ts`, and the
  route gate pattern of `src/routes/curva.tsx` (`beforeLoad` redirect while off).
- Optional: a subscription platform (RevenueCat or similar) unifies Apple, Google and web
  entitlements and their edge cases; it adds a monthly cost and a data processor. **To confirm**
  (Q4).

### 5.6 Where people pay

| Channel                    | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Status            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Website (botolago.com)     | A Moroccan payment provider. CMI (Centre Monétique Interbancaire) is the national card acquirer, reached through a bank contract; Payzone and other licensed PSPs resell it. **To confirm:** whether recurring/tokenised card payments are offered to BotolaGO's bank; if not, sell the season pass and monthly passes that do not auto-renew. Stripe does not onboard Moroccan companies as merchants (**to confirm**).                                                                                                            | Recommended first |
| iPhone app (Capacitor)     | Apple requires In-App Purchase for digital content unlocked in the app (App Review Guideline 3.1.1). The shell loads the live site, so **the web checkout must be hidden inside the iOS app** (no button, no link to buy elsewhere outside the specific exceptions Apple allows in some countries — **to confirm** none applies to Morocco). Apple's commission: 15% under the Small Business Program / after a subscriber's first year, otherwise 30% (**to confirm** current terms). Needs a native StoreKit plugin in the shell. | Phase 5           |
| Android app                | Google Play Billing is required for digital goods; Play's service fee for subscriptions is 15% (**to confirm** current terms and whether any alternative billing programme covers Morocco).                                                                                                                                                                                                                                                                                                                                         | Phase 5           |
| Members on several devices | A web member who opens the app is recognised (entitlement is per account). The app shows « Gérer mon abonnement sur botolago.com » only where store rules allow (**to confirm**).                                                                                                                                                                                                                                                                                                                                                   | —                 |

### 5.7 Restoring, grace, cancelling, receipts

- **Restore:** stores — the restore button calls `billing-restore`; web — nothing to restore, the
  account carries it.
- **Grace:** stores' billing grace periods are switched on in their consoles and mapped to `grace`;
  web — 7 days of retries and emails (email notifications are off today, `PRODUCT.md`; in-app
  banner as fallback).
- **Cancel:** web — a « Résilier » button in Profil > BotolaGO+ calls the provider and sets
  `cancelling`; stores — deep link to the store's subscription page (cancellation happens there).
  Cancelling must be as easy as subscribing (consumer law, section 6).
- **Receipts:** web — an invoice per payment (number, TTC amount, TVA, company details of Go Sports
  Technologies, **to confirm** invoicing rules with the accountant), emailed and listed in Profil;
  stores — the store sends the receipt.

### 5.8 Account deletion

The automatic deletion (`account-deletion-worker`, `docs/backend/ACCOUNT_DELETION_RUNBOOK.md`) must:
cancel any active web subscription first; delete `app.premium_entitlements`, `card_design_choices`,
preferences; and **pseudonymise rather than delete** `billing_events` / invoices, because accounting
records must be kept for a legal period (Morocco: 10 years is commonly cited for accounting
documents — **to confirm with the accountant**). The deletion's lock list and pgTAP coverage grow
accordingly.

### 5.9 Admin view

`/admin/plus` (MFA, existing admin shell): members count by state (counts only, no list by default),
search a member by user id or email (audited), their state and event timeline, manual grant/revoke
under dual control, product and price settings read-only (changed only by owner scripts). No card or
Fantasy data is shown there.

### 5.10 How the database work is applied

Exactly the house path (`CLAUDE.md`, `docs/backend/MIGRATIONS.md`,
`docs/backend/RELEASE_ACTIVATION_MIGRATION_RUNBOOK.md`):

1. Forward-only migrations, unique timestamps (`bun run backend:migrations:check`), everything off,
   no product rows.
2. pgTAP tests (schema, RLS forced, no privileges, key sets, idempotent replay of a billing event,
   state machine table, has_premium truth table, the designs never read by compute, deletion
   coverage). CI's `database-quality` job is the authority.
3. Staging (`srdrflfrfpwixsllveid`) first, then production (`tkewgajrljbwgwedqsxn`), each through an
   **owner-run guarded script** (`scripts/backend/apply-<timestamp>-premium-*.sql`) with a dry-run
   that ends in a deliberate `raise` carrying the computed state (rolled back), a re-read, then the
   real run.
4. Before each write: list running agents and workflows, pause the jobs `AGENTS.md` names for the
   tables touched (the card tick when touching card tables; account deletion when touching
   deletion), baseline read, write, compare, restore switches.
5. `AGENTS.md` "Check the scheduled jobs too" gains an entry for the billing webhook (and any
   `premium-expiry-tick` if one is added: a pg_cron job every hour that moves `cancelling`/`grace`
   rows past their date to `expired`/`on_hold`, with its pause command
   `select app_private.premium_configure('off', null);`).

---

## 6. Legal and compliance checklist

Everything here is **to confirm with a lawyer/accountant** before launch.

| #   | Topic                           | Question for the professional                                                                                                                                                                                                |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | Prizes tied to membership       | Section 4.3. Is a members-only prize on a skill ranking lawful? Which of the three options is required? Any authorisation needed?                                                                                            |
| L2  | TVA on digital services         | Standard TVA rate (20%) on a Moroccan company's digital subscription to Moroccan consumers? Treatment of sales to members abroad and of store sales (Apple/Google as reseller or agent)?                                     |
| L3  | Prices shown                    | Prices must be shown TTC in MAD; renewal terms shown before payment.                                                                                                                                                         |
| L4  | Consumer protection (law 31-08) | Distance-selling information duties, right of withdrawal and its exception for digital content supplied at once (needs express consent and acknowledgement at checkout), easy cancellation, renewal reminders.               |
| L5  | Terms and privacy               | New « Conditions de BotolaGO+ » document; update Terms section 11 ("financée par le sponsoring") and the Privacy Policy (payment data, processors, retention).                                                               |
| L6  | CNDP (law 09-08)                | Declaration or authorisation update for new processing: payment and billing data, the comparison feature (friends' history), any processor abroad (store, PSP, subscription platform) — transfer authorisation (article 43). |
| L7  | Minors                          | Terms limit accounts to adults (18+) but sign-up does not check age. Payment by a minor: what is required (age confirmation at checkout)?                                                                                    |
| L8  | Accounting                      | Invoicing rules, numbering, record retention (5.8), recognising season-pass revenue over the season.                                                                                                                         |
| L9  | App stores                      | Apple 3.1.1 / 3.1.3 and Google Payments policy as they apply to a Capacitor shell that loads the website; store tax handling in Morocco.                                                                                     |
| L10 | Club and sponsor designs        | Club identity licences; sponsor contracts; "not affiliated" statement kept.                                                                                                                                                  |
| L11 | Company status                  | Go Sports Technologies is "a company being formed" (`PRODUCT.md`): a payment provider contract and invoicing need the company registered (RC, ICE, IF). **Blocking.**                                                        |

---

## 7. Rollout in phases

Each phase ends with the owner's approval. Screen work follows `AGENTS.md` "Screen work": approved
scope only, built in code, a brief committed first (preserved / improvements / acceptance criteria),
its own feature branch, before/after screenshots, mobile and desktop, French and Arabic with RTL,
existing tests, a **draft** PR, no merge or deploy without the owner.

| Phase | What                                                                                                                                                                                                                                      | Writes to a database? | Owner approval needed for                |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------- |
| 0     | This plan and the sketch approved; answers to section 9; lawyer and accountant consulted (L1–L11); provider chosen                                                                                                                        | No                    | Plan, price, provider, legal go-ahead    |
| 1     | Backend foundation: entitlement tables, `has_premium`, status reads, designs catalogue, switches off; pgTAP; staging then production via guarded scripts                                                                                  | Yes (owner-run)       | Each migration apply                     |
| 2     | Premium reads: `api.get_my_card_career`, `api.get_card_duel`, `api.choose_card_design`, card reads gain `design`; privacy switch                                                                                                          | Yes (owner-run)       | Each migration apply                     |
| 3     | Screens behind `PREMIUM_BUILD = false`: `/plus` page, `/curva/carriere`, `/curva/duel`, design picker, first two Éclat designs; React Bits components copied in; preview mode for the owner (`mode = 'preview'`, owner's account granted) | Grant row only        | Brief, draft PR, screenshots             |
| 4     | Web checkout: PSP integration, `billing-webhook`, receipts, cancel, admin `/admin/plus`; end-to-end in the PSP's test mode on staging                                                                                                     | Yes                   | Legal sign-off, draft PR, go-live switch |
| 5     | Phone apps: StoreKit / Play Billing plugin in the Capacitor shell, `billing-restore`, web checkout hidden in store builds                                                                                                                 | Yes                   | Store submission                         |
| 6     | Later: club/sponsor designs, the optional extras, any ranking prize (only after L1)                                                                                                                                                       | Yes                   | Each item separately                     |

Launch order inside phase 4: `mode = 'preview'` (owner and staff grants only) → a small invited
group with 100% comps → `mode = 'on'` with `checkout_enabled = true`.

---

## 8. How to continue in a later session

Start from `origin/main`, read this file and the sketch, then:

1. **Check what is running** (`AGENTS.md`): other agents, workflows, the `claude/curva-ranking`
   lane (it touches card tables — do not overlap card-table migrations with it).
2. **Record the owner's answers** to section 9 at the top of this file (dated), on a branch
   `claude/botolago-plus-<phase>`.
3. **Phase 1 backend** — new files:
   - `supabase/migrations/<ts>_premium_schema.sql` (tables 5.3, RLS, settings row `off`),
   - `supabase/migrations/<ts>_premium_api.sql` (5.4 functions, grants, comments),
   - `supabase/migrations/<ts>_card_designs.sql` (2c tables, `standard` row only),
   - `supabase/tests/database/premium_schema.test.sql`, `premium_api.test.sql`,
     `premium_billing_events.test.sql`, `card_designs.test.sql`; update the step-up count tests and
     `account_deletion_*` tests,
   - `scripts/backend/apply-<ts>-premium-foundation.sql` (guarded, dry-run first),
   - `docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md` (switches, pause commands, rollback),
   - `AGENTS.md` scheduled-writers entry (text drafted in the same PR, applied in its own commit).
   - Run `bun run backend:migrations:check`; regenerate types as `MIGRATIONS.md` says.
4. **Phase 2 reads** — `supabase/migrations/<ts>_premium_card_reads.sql`; extend
   `src/backend/manager-card/contracts.ts` with `design`; keep the card's compute functions untouched.
5. **Phase 3 screens** — write the brief first:
   `docs/product/botolago-plus-brief.md` (preserved / improvements / acceptance criteria), then:
   - `src/lib/feature-flags.ts`: `PREMIUM_BUILD = false`,
   - `src/backend/premium/` (repository, contracts, errors), `src/services/use-premium.ts`,
   - `src/routes/plus.tsx`, `src/routes/curva.carriere.tsx`, `src/routes/curva.duel.tsx`,
   - `src/components/plus/` (page sections) and `src/components/plus/fx/` (copied React Bits
     components with licence header and source commit),
   - Éclat designs: `src/components/manager-card/eclat/` (`field.ts`, `ornament.ts`, `holo.ts`,
     `eclat.css`) behind a `design` profile field; gallery run with
     `scripts/qa/manager-card-gallery.ts` for every tier × design,
   - dictionaries `src/i18n/dictionary-fr.ts`, `src/i18n/dictionary-ar.ts` (`plus.*` keys),
   - tests: unit (contracts, hooks), SSR, e2e `tests/e2e/plus*.e2e.ts` at 390 and 1280, FR and AR.
   - Measure as `CLAUDE.md` (Evidence) says: real overflow, rasterised contrast, own dev server port.
6. **Phase 4 payments** — `supabase/functions/billing-webhook/`, `billing-restore/`; PSP test keys
   in function secrets; `src/routes/admin.plus.tsx`; legal documents in
   `src/content/legal/` (`plus-terms.ts`).
7. **Never**: merge, publish in Lovable, apply migrations or deploy functions without the owner;
   force-push; add any AI-authorship notice.

---

## 9. Open questions for the owner

1. **Q1 Free-to-play wording.** OK to change the product constraint to "the games are free to play;
   BotolaGO+ is an optional membership that never affects a score"?
2. **Q2 Price.** Option B (29 MAD / month, 199 MAD season pass)? Founding-member price?
3. **Q3 Channel.** Web first (CMI/Payzone through your bank), stores later — agreed? Which bank?
4. **Q4 Tools.** Accept a subscription platform (RevenueCat or similar) for Apple/Google, or build
   store verification ourselves?
5. **Q5 Prizes.** Which option of 4.3 should go to the lawyer first (recommendation: option 1)?
6. **Q6 Friends' history.** Should "show my card history to league mates" default to on or off
   (lawyer to advise; recommendation: off until the CNDP point is answered)?
7. **Q7 Designs.** Which three designs first? Any club you could approach for a club edition?
8. **Q8 Company.** Is Go Sports Technologies registered (needed for any payment contract)?
9. **Q9 Free vs paid (3.0c).** Approve the proposed table? After cancelling, does the premium style
   revert to the base style (as the sketch says) or stay?
10. **Q10 Terms.** Confirm: the pass does not renew; monthly access runs to the end of the paid
    period; cancel before the billing date; refund and early-stop rule for the pass.
11. **Q11 Saving.** Compare against the months actually covered (8 today) or start the pass at the
    season start so a 10-month comparison is honest? (Pass 2, 3.0d: use « par rapport à 8 paiements
    mensuels », never identical-access wording; the late-season « Reste de la saison » price and the
    refund terms stay open.)
12. **Q12 Tier and rating names in Arabic.** The sketch shows « محترف » for the tier and keeps OVR in
    Latin letters as a brand token; confirm.
