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
