# BotolaGO+ locked sections: the « Nuit de match » look

Screen-work brief (AGENTS.md, "Screen work"). Written before any interface change, on branch
`claude/plus-night-look`, based on `claude/plus-polish` (PR #476 line) with `claude/plus-in-app-teasers`
(PR #478) merged in. Owner-approved 2026-10-14: version 2, « Nuit de match » (night stadium), and
every text in these sections bold, in French and Arabic. The approved static mock lives outside the
repository; this brief records what it asks for.

Visual system only. No copy, data, access or routing change. No database, no migration, no Lovable
action, no deploy.

## What must be preserved

- Every string (`plus-copy`), every number and the data flows: the reader's real points and league
  position clear above the blur, the example season under it, the paid reads not made for a
  non-member. What is free stays free and what is locked stays locked.
- Access logic (`usePlusAccess`), routes (`/curva/plus?step=3`, `/curva/carte#votre-saison`), test ids
  and the member views (« Votre saison », « Détail du duel ») untouched.
- The logo is always `PlusLogo`; the name is never typed. No « débloquer », no EA / FIFA / FUT, no
  prizes. Western digits; Arabic mirrors (logical properties).
- Tokens of `plus-tokens.css` and the CSS lint (`plus-css-lint.test.ts`): 4px grid, token shadows and
  radii, animation only under `prefers-reduced-motion: no-preference`.

## What changes

1. **Scoreboard plate.** The free figure becomes a lit plate: a big glowing number (« 612 » over
   « POINTS »), the rank pill under it; in the duel, both managers' league points as one plate with an
   avatar, name and rank per side.
2. **Night stage.** A deep vignette (edges near black) replaces the flat veil; the stats under the blur
   sink into it; the tabs stay visible and inert on a dark bar.
3. **The « + » floodlight.** A large mint « + » (the logo's shape) glows through the blur and
   breathes.
4. **Lock block.** No flat panel: the logo, one line of title and a mint, glowing « Découvrir »
   button sit straight on the vignette.
5. **Curva home tile.** A dark tile with the « + » glowing through fog, the logo and title, and a
   round glowing arrow button.
6. **All text bold.** Every text node in these sections is font-weight 700 or more.
7. **Motion** (transform and opacity only, all off under `prefers-reduced-motion`): « + » breathes
   4.4s, plate and button glows pulse 3.2s / 2.6s, floodlight fades 6s, plate and lock rise in 0.9s,
   logo « + » tilt (existing).
8. New tokens in `plus-tokens.css` / `plus.css` for the glows and the new spacing steps.

## Acceptance criteria

Visual

- Card, duel and home tile match the approved mock in French and Arabic (390px) and French (1280px),
  as non-member; the member view is unchanged.
- Arabic is mirrored; digits are Western.

Functional

- No horizontal overflow at 390 and 1280 (measured element by element against the viewport, not `clientWidth`, which `overflow-x: clip` hides).
- Smallest text 14px (22px and over on the home tile title); tap targets 44px or more.
- Computed font-weight of every text node in the three sections is 700 or more.
- With `prefers-reduced-motion: reduce` nothing moves.
- Tests: plus, curva and manager-card vitest suites, the CSS lint, lint, typecheck and the ui-kit
  contract tests all stay green.
