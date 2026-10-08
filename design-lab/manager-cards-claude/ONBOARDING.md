# Onboarding screens: build brief

Written 2026-10-08, before any onboarding screen code, as `ONBOARDING_PLAN.md` section 7 asks
("Step 0, brief first"). The owner approved all nine decisions in the plan's section 9 the same
day ("yes to all") and asked for the lab screens to be built. The plan is the source; this page
is the contract the build is checked against.

**Scope.** Lab only, in `design-lab/manager-cards-claude/`. Nothing in the app (`src/` at the
repository root), no route, no database, no network, no external URL. Fictional sample data only.
This is design exploration, not approved product screen work: the product build later follows
AGENTS.md "Screen work" on its own branch.

## What must be preserved

- **The app as it is.** Every screen mocks the existing BotolaGO layout, navigation, controls and
  tokens (`src/app-context.css`): the hub, team page, rankings, league, transfers, profile. The
  card adds inline blocks to screens that already exist; it never adds a route, a dialog that
  opens by itself, an interstitial or an extra tap to the save.
- **Business rules.** Fantasy scoring, the gameweek lifecycle, the deadline flow, the invite
  flow and the save's destination stay exactly as they are. The number is null until 3 final
  gameweeks and provisional until 5 (from the server's rules row, never invented by the client).
- **Brand.** BotolaGO's own tokens, Manrope and Changa, the logo blue `#0151FC`, light and dark.
- **The five chosen card directions as designed.** Écharpe v2, Porte-clés v2, Lucarne, Semelle v2
  and Touchline (reworked). Each direction's gallery rendering stays pixel-identical for a profile
  without the new onboarding fields (CONTRACT.md "Onboarding states").
- **Arabic as a first language.** Right-to-left mirror, Western digits isolated, Changa 800 names,
  no letter-spacing on Arabic, the kit's stat and tier labels.

## The improvements being made

1. **Card states the lab could not draw before:** no number yet (a dash, never 0), counted
   rounds k of 3 drawn natively on each object, serial, founder, club and stats each able to be
   empty, an unnamed guest object, a beat of 600ms or less that never hides the number.
2. **Touchline reworked** into the lab under `CONTRACT.md` (`src/concepts/t1-touchline.*`),
   with CRITIQUE.md's rework: no FUT spine, exact logo blue, the 84 and tier in its badge, long
   names, an Arabic face, the founder year after the name.
3. **The onboarding screens S01–S18 and D1** (plan section 7), from the guest's first view to
   replay, on `onboarding.html`, for every direction, in French and Arabic, light and dark.
4. **Every string in one place** (`src/onboarding/strings.js`) with proposed dictionary keys
   (`card.onboarding.*`) so the product build can lift them.
5. **Captures and measured checks** in `review/onboarding/`, listed in its `INDEX.md`.

## Acceptance criteria

The sixteen in `ONBOARDING_PLAN.md` section 7, each measured, never asserted (CLAUDE.md
"Evidence"). In short:

1. No console error on any screen, direction or fixture.
2. Nothing escapes the 390px width, measured by element rectangles.
3. Every button and link at least 44 × 44.
4. Text contrast at least 4.5:1 (3:1 for the display number and large text), read from
   rasterised pixels in light and dark.
5. The number is never held back: visible, opacity 1 and on top at t = 0 with motion on.
6. A null number renders "—", never "0", and is announced « pas encore de note » / «لا تقييم بعد».
7. « Provisoire » / «مبدئي» on every surface showing a provisional number, the share image too.
8. No banned word (plan section 5) in rendered text; no padlock, lock, question mark or sealed
   icon in any card state.
9. No serial with a leading zero; no serial sentence while the serial is null.
10. No heading contains the manager's name.
11. Arabic: `dir="rtl"`, letter-spacing 0, isolated Western digits, Changa 800 names, kit
    labels, correct plurals for 1, 2, 3, 5 and 11.
12. Reduced motion: no running animation and no « Revoir » beat button.
13. Exactly one expanded hero or panel per screen; `returning` shows one coalesced hero.
14. ·26 and the founder part only in the `founder` fixture.
15. Prettier and the repository lint pass; `build.mjs` still builds the gallery.
16. The judges' fixes hold (plan Appendix A), ticked against the captures.

Semelle captures carry the visible label « Test culturel en attente »: no onboarding moment ships
on Semelle until its cultural test passes (decision 9).
