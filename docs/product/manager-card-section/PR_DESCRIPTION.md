# Gradins: a new section for what comes after the Manager Card, shipped switched off

**Draft. Do not merge, publish or apply anything without the owner** (AGENTS.md "Screen work", rule 7).

## What this is

**Gradins** (المدرجات, "the stands") is a new section of the app that sells belonging: your own **manager card**, in your name and your club's
colours, made by your decisions journée after journée; your friends' cards beside it, in your leagues' own order; your club and its next match;
your seasons and a replay of each moment; a WhatsApp-first share. It takes Pépites' fifth place in the bottom bar, and Pépites moves inside
Fantasy at the same moment (a tile in the Fantasy hub, the Fantasy tab lit on every Pépites page, a « Fantasy » way back on the Pépites home;
**every Pépites address, canonical, sitemap entry and share link stays as it is**). The approved onboarding of the card lands in the app: inline
in Fantasy where you already are, and in Gradins for the moments that deserve a page. Nothing opens by itself, nothing is held back by an
animation, and the number is never covered.

The card is the **Écharpe** (a knitted supporter's scarf), drawn from the server's data only, in the club's colours, behind an interface so the
direction can change later. Its animations are knitting (« Rang par rang »): seven beats of at most 600 ms, none touching the number, all off under
reduced motion.

## It ships OFF, and what "off" was proven to mean

`MANAGER_CARD_ENABLED = false` in `src/lib/feature-flags.ts`, and the database's own answer is read on the server only. Merging and publishing this change
**nothing anyone sees**. Measured, on the production build of this branch against the production build of `origin/main` `3f9c57fc`, same stub backend, same clock:

- **Pixels:** Home, Fantasy, Pépites and the bottom bar at 390 and 1440, French and Arabic: 30 screenshots, **0.0000% different on every one**.
- **Server HTML:** the `<body>` of `/`, `/fantasy`, `/pepites` and `/matches` (and Home for a returning visitor): **5 of 5 byte-identical** once scripts and asset hashes are removed.
- **Requests and storage:** **no new data or document request, none for the section's code, no new storage key, no console message.** The bundler gave
  14 shared library chunks new file names; the bytes are the same.
- **Addresses:** `/gradins`, `/gradins/carte`, `/gradins/les-votres` and `/gradins/saisons` answer **307 to `/fantasy`**.
- **Code:** a build gate fails if any ordinary page imports the section's code (326 chunks checked), and another fails if a development fixture is in the production bundle (720 files).
- **Browser specs:** the new `tests/e2e/gradins-off.e2e.ts` passes 9 of 9 on the development server and on the production build, and fails 9 of 9 against a server with the preview on, so it can fail.
  The existing suites pass with the switch off: 73 passed, 6 skipped (`fantasy.journey` needs a real account), 0 failed; Pépites 26 of 26; the production-bundle smoke test 3 of 3.

## What the owner does to switch it on, in order

1. **Merge this pull request.** Publishing changes nothing.
2. **Apply the backend plan** ([`docs/backend/MANAGER_CARD_BACKEND_PLAN.md`](docs/backend/MANAGER_CARD_BACKEND_PLAN.md)) through the reviewed migration path, with the database read switch **off**.
   It is a separate pull request and a separate owner decision; this one adds no migration, no function and no database write.
3. **Turn the database read switch on** (`api.manager_card_status()` returns `enabled`).
4. **Set `MANAGER_CARD_ENABLED` to `true`** in a one-line commit and **publish in Lovable.**

The section appears when both the constant and the database switch are on, and not before; either of steps 3 and 4 may come first (plan 3.6). Within about a minute of the switch
going on, every new page load shows Gradins and Pépites in Fantasy. **Rollback:** turn the database switch off (no republish), or set the constant back to `false` and republish.
A status that is off, missing, slow or failing reads as off, silently.

## The screens

At 390 × 844, French; the Arabic pair of each (right to left, mirrored) and the dark theme are in the evidence folder. Repository paths under each picture.

|                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **G1 · Gradins** (home): the card on its rail, its number in text under it, who you are in the stands, **the next round and its deadline in one line**, your people, your club, your seasons, then how the number is made, and the share. ![G1, French, forming card](https://github.com/mrdata007/botolago-foundation/blob/claude/manager-card-section/docs/product/manager-card-section/wp6b/after/g1-forming1-fr-light-390.png?raw=true)<br>`docs/product/manager-card-section/wp6b/after/g1-forming1-fr-light-390.png` | **First rating**: the hero knits the third stripe under the 84, once per session, acknowledged on the server. ![G1, French, first rating](https://github.com/mrdata007/botolago-foundation/blob/claude/manager-card-section/docs/product/manager-card-section/wp6b/after/g1-rated-fr-light-390.png?raw=true)<br>`docs/product/manager-card-section/wp6b/after/g1-rated-fr-light-390.png`                                                                                                                                                                                                                                                                                                                                                                 |
| **The guest**: the base scarf, a club try-on, the way to create a team, nothing invented, « Le jeu est gratuit : sans achat, sans pari. » ![G1, French, guest](https://github.com/mrdata007/botolago-foundation/blob/claude/manager-card-section/docs/product/manager-card-section/wp6b/after/g1-guest-fr-light-390.png?raw=true)<br>`docs/product/manager-card-section/wp6b/after/g1-guest-fr-light-390.png`                                                                                                              | **G2 · Votre carte**: where the number comes from (four statistics with their reasons), the tier, the serial, « Vos moments » to replay. ![G2, French](https://github.com/mrdata007/botolago-foundation/blob/claude/manager-card-section/docs/product/manager-card-section/wp6b/after/g2-rated-fr-light-390.png?raw=true)<br>`docs/product/manager-card-section/wp6b/after/g2-rated-fr-light-390.png`                                                                                                                                                                                                                                                                                                                                                    |
| **G3 · Les vôtres**: your league's cards in the league's own points order (never sorted by rating), your own row marked. ![G3, French, the league](https://github.com/mrdata007/botolago-foundation/blob/claude/manager-card-section/docs/product/manager-card-section/wp3/g3-rated-fr-light-390.png?raw=true)<br>`docs/product/manager-card-section/wp3/g3-rated-fr-light-390.png`                                                                                                                                        | **G4 · Face-à-face**: two cards, four statistics, no share (a friend's rating stays in the app). ![G4, French, face-à-face](https://github.com/mrdata007/botolago-foundation/blob/claude/manager-card-section/docs/product/manager-card-section/wp3/g4-rated-fr-light-390.png?raw=true)<br>`docs/product/manager-card-section/wp3/g4-rated-fr-light-390.png`                                                                                                                                                                                                                                                                                                                                                                                             |
| **G6 · Vos saisons**: the rack of seasons, the line, the table, the moments. ![G6, French, seasons](https://github.com/mrdata007/botolago-foundation/blob/claude/manager-card-section/docs/product/manager-card-section/wp6b/after/g6-rated-fr-light-390.png?raw=true)<br>`docs/product/manager-card-section/wp6b/after/g6-rated-fr-light-390.png`                                                                                                                                                                         | **The share**: a 1080 × 1920 picture, the number, « Provisoire » while it is, WhatsApp first. ![The share picture, French](https://github.com/mrdata007/botolago-foundation/blob/claude/manager-card-section/docs/product/manager-card-section/wp4/share-picture-rated-fr-1080.png?raw=true)<br>`docs/product/manager-card-section/wp4/share-picture-rated-fr-1080.png`                                                                                                                                                                                                                                                                                                                                                                                  |
| **In Fantasy, the team page's born panel**: the card at 96 px, its number when it has one, when the rating comes, and « Inviter des amis »; 213 px so the pitch's first row stays on the first screen. ![The born panel on the team page, French](https://github.com/mrdata007/botolago-foundation/blob/claude/manager-card-section/docs/product/manager-card-section/wp6b/after/team-born-born0Serial-fr-light-390.png?raw=true)<br>`docs/product/manager-card-section/wp6b/after/team-born-born0Serial-fr-light-390.png` | **The Fantasy hub**: the card block under the team card, the Pépites tile under the shortcuts. ![The Fantasy hub with the card block, French](https://github.com/mrdata007/botolago-foundation/blob/claude/manager-card-section/docs/product/manager-card-section/wp5/after/hub-owner-forming-forming1-fr-light-390.png?raw=true)<br>`docs/product/manager-card-section/wp5/after/hub-owner-forming-forming1-fr-light-390.png` ![The Fantasy hub with the Pépites tile, French](https://github.com/mrdata007/botolago-foundation/blob/claude/manager-card-section/docs/product/manager-card-section/wp5/after/hub-pepites-tile-rated-fr-light-390.png?raw=true)<br>`docs/product/manager-card-section/wp5/after/hub-pepites-tile-rated-fr-light-390.png` |

![G1, Arabic, forming card](https://github.com/mrdata007/botolago-foundation/blob/claude/manager-card-section/docs/product/manager-card-section/wp6b/after/g1-forming1-ar-light-390.png?raw=true)<br>`docs/product/manager-card-section/wp6b/after/g1-forming1-ar-light-390.png`

## What changed in the finish review (fixes in this pull request)

- The team page's born panel was 419 px (French) and 406 px (Arabic): the pitch's first row sat under the bottom bar. It is **213 px**, the first row ends at 686 px (fr) and 746 px (ar) against the bar at 768 and 762.
- G1 was built belonging-first, which put « Cette journée » 1,438 px down. Belonging stays first; **one line under the identity line says the next round and its deadline**. The order change is recorded in plan 5.2 item 6.
- The guest card's dash is a shade of the wool, not the neutral charcoal (3.25:1 against the rib's darker column, 6.4:1 against its lighter one). See the owner decisions.
- The guest's 16 club discs wrap (8 + 8 at 390) instead of being cut at the edge. The « Votre club » header lost its side bar. « Vos moments » is the heading of the list and « Revoir » stays the replay button.
- `fill()` isolates a `{k}/{n}` fraction whole, so Arabic never reads « 1/3 » as « 3/1 ».

## The brief (copied in, as AGENTS.md "Screen work" rule 3 asks)

<details><summary>Screen-work brief</summary>

# Gradins (Manager Card section): screen-work brief

AGENTS.md "Screen work" rule 3. Written 2026-10-08 before any interface change on
`claude/manager-card-section`, after inspecting the shell (`primary-nav.ts`, `BottomNav`, `TopBar`),
the Fantasy hub, team, create, rankings, league and transfer screens, the Pépites pages, the auth path
and the lab (`design-lab/manager-cards-claude/`). The full plan is
[`MANAGER_CARD_SECTION_PLAN.md`](MANAGER_CARD_SECTION_PLAN.md); the "before" captures are in
[`manager-card-section/before/`](manager-card-section/before/). Copy this page into the draft pull
request description.

## What must be preserved

- **The shipped app, exactly, while the switch is off.** `MANAGER_CARD_ENABLED = false`: the bar
  (Accueil · Actualités · Fantasy · Matches · Pépites), Home, Fantasy, Pépites, the create flow (team-name
  autofocus, opening step) and every other screen look and behave as on `origin/main` `3f9c57fc`: no new
  element, request, storage key or console message. `/gradins` redirects to `/fantasy`.
- **Pépites.** Every `/pepites/*` address, canonical, sitemap entry, robots rule, share link, test and
  the Home tile.
- **Business rules.** Fantasy scoring, the gameweek lifecycle, deadlines, transfers, chips, leagues,
  prizes, the save's destination and the invite flow. The card is display-only: nothing ranks by it.
  The browser never computes a rating; it shows the server's.
- **Identity.** Design System V2 tokens and kit, Changa ≤ 800, the two blues (Logo Blue only inside the
  card art and the logo), dark mode, the 44 px floor, logical properties, Arabic as a first language
  (MSA, right to left, Western digits isolated, no letter-spacing), « vous » in French.
- **Product truths.** Free to play, independent, nothing invented: unknown is « — », provisional is
  labelled, no counts, no pack, pull, reveal or scarcity wording, the number never held back.
- **The approved onboarding** (lab `ONBOARDING_PLAN.md`, nine decisions approved 2026-10-08) and the
  chosen card, Écharpe v2, as designed.

## The specific improvements

1. A new section, **Gradins / المدرجات** (`/gradins`, icon `UsersRound`), that sells belonging: your
   card in your name and club colours (G1), where its number comes from (G2), your friends' cards in
   your leagues' own order with a face-à-face (G3, G4), your club and city, your seasons and replays
   (G6), and a WhatsApp-first share (G7).
2. When live (build switch on **and** `api.manager_card_status()` enabled, read on the server only),
   Gradins takes Pépites' fifth slot and, in the same render, Pépites moves into Fantasy: a hub tile,
   the Fantasy tab lit on `/pepites/*`, a « Fantasy » back pill on the Pépites home.
3. The approved onboarding lands in the app: inline in Fantasy (intro point, save line, team-page
   panel, hub block, rankings token, recap line, three hints, league band) and in Gradins (first rating,
   tier, founder, season, returning, replay), one hero per session, acknowledged on the server.
4. Non-generic motion, « Rang par rang »: seven knitting beats of Écharpe (cast-on, the journée's
   stripe, the third stripe, a new tassel, the raised scarf, the founder's first stitch, the cast-off),
   each ≤ 600 ms (birth ≤ 700 ms), none touching the number, all off under reduced motion.
5. The card behind a `CardRenderer` interface, client-only, escaped, code-split; development fixtures
   that a production build cannot contain.

## Acceptance criteria

**Visual**

- Switch off: before/after pairs of Home, Fantasy, Pépites and the bar at 390 × 844 and 1440 × 900, in
  French and Arabic, differ by ≤ 0.1% of pixels; server `<body>` markup of `/`, `/fantasy`, `/pepites`,
  `/matches` identical after removing scripts and asset hashes.
- Switch on (development preview with fixtures): every screen and state of plan section 4 captured at
  390 and 1440, French and Arabic, light and dark; the bar reads Accueil · Actualités · Fantasy ·
  Matches · Gradins; Fantasy is lit on Pépites pages.
- Nothing escapes 390 px (element rectangles); text contrast ≥ 4.5:1 (3:1 for display figures) read from
  rasterised pixels, including over the card; the Arabic mirror correct; Changa 800 names.

**Functional**

- No console error or failed request on any screen, state or fixture; a missing or off status reads as
  off silently.
- Every control ≥ 44 × 44; no heading carries a name; « — » never « 0 »; « Provisoire » wherever a
  provisional number shows, the share image included; no banned word; ·26 only for founders.
- The number is on screen at t = 0 of every beat; with reduced motion, no running animation and no
  « Revoir » beat button.
- One hero per session; a coalesced hero acknowledges every key in one call.
- `bun test`, typecheck, lint, format check, build, the i18n gate, the fixture gate and the existing
  Playwright suites pass; the Impeccable detector's findings fixed or listed.
- Draft pull request only. No merge, publish, migration or database write without the owner.

</details>

The full plan is [`docs/product/MANAGER_CARD_SECTION_PLAN.md`](docs/product/MANAGER_CARD_SECTION_PLAN.md).

## Evidence summary

Everything is in [`docs/product/manager-card-section/INDEX.md`](docs/product/manager-card-section/INDEX.md): each criterion of plan section 9, how it was measured, the result and the file.
Overflow is measured from element rectangles, contrast from rasterised pixels; every run used mock data or the production build against a stub backend. No database was touched.

- **Switch on** (development preview, fixtures): the bar and the Pépites moves; 14 screens and states in both languages with no console error or failed request (`tests/e2e/gradins.e2e.ts`, 59 of 59);
  188 screens measured by WP3's probe with 0 findings; nothing past the window edge and no target under 44 px (124 layout checks); page text 3,833 measurements light and 3,833 dark, **0 below AA**; the card's own labels
  (400 boxes in 36 states) 0 below their floor, lowest number 5.99:1, lowest label 5.01:1; Arabic mirror, reduced motion (nothing runs), the number opaque and on top at every frame; no banned word;
  **one hero per session, acknowledged once** (hub « Nouveau », the M2 panel and a G1 hero in one session; Gradins first; the returning manager's two keys in one call).
- **Tests and gates:** `bun test` 7,152 pass, 17 skip, 1 fail (the editorial-session ICU test, on `origin/main` too); typecheck, lint (0 errors), build, i18n gate (baselines unchanged), fixture gate, off-bundle gate,
  migrations check (163, none added) and secrets check pass. `bun run format:check` fails on 78 files on `origin/main` and on this branch alike; none is a file of this work.
- **Performance:** the Écharpe chunk is 26.8 kB gzip (budget 60); drawing the card 1 to 3 ms and a token under 0.01 ms at CPU × 4; G1 data to card 394 to 428 ms on a second visit, **746 ms on a first visit in French on the development server**
  (budget 400 ms: needs a production measurement once the backend exists); an Arabic name with no hand chart takes 59 to 294 ms to draw the first time (budget 60 ms).
- **Impeccable detector:** 5 findings, all in the card's own stylesheet (the app's Arabic face named inside an SVG, four yarn colours of the art), none in a screen.

## Open for the owner

Plan section 11 (name, Arabic tier words, « LEGEND » in French, Logo Blue in the art only, club leagues, the guest try-on, other managers' serials, the five changes to the approved onboarding plan, the trademark check) with the build's default for each, and:

1. **G1's order** is belonging first with a one-line round summary, not the plan's order (recorded as plan 5.2 item 6; how to restore the plan's order is in the index).
2. **The guest card's dash:** a mid-tone and 3:1 against the rib cannot both hold on a pale rib. The build keeps the 3:1 floor, so the dash still reads dark. A thinner or tapered dash, or a lighter rib behind it, would change the card's art.
3. **The team panel** no longer shows « Elle mesurera vos choix… » and shows « Invitez vos amis avant la date limite de la J14… » to screen readers only (as the invite link's description); showing it costs the first row its place on screen.
4. **Arabic names** with no hand chart take long to draw the first time at CPU × 4.
5. **The next-match row** keeps the app's own `MatchCard` colour edges.
6. **`fantasy.journey`** was skipped (it needs a real account): run it on the credentialed workflow before publishing.

## Not in this pull request

- **The backend:** no migration, no Edge Function, no database write, no scheduled job. The app reads what the backend plan specifies and nothing else; with the database switch off or missing it reads as off.
- **A publish, a deploy, a merge to `main`.** The constant stays `false`.
- **Club leagues, a public club page, rankings by rating, XP, badges, a notification dot** (plan 4.9): not built, each with its reason.
- **A real-device performance and share check, and a run against the real database.** None was possible in this environment.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_013C6SU2aCtHRDKbbuxvyeix
