# BotolaGO+ polish: spacing, elevation, radius and motion systems

Screen-work brief (AGENTS.md, "Screen work"). Written before any interface change, on branch
`claude/plus-polish`, based on `claude/plus-in-app-teasers` (PR #476). Owner-approved 2026-10-14.
Copy it into the draft pull request description. The rules applied come from the Superdesign design
agent: a 4 pt spacing system where every margin, padding, line-height and element size is an exact
multiple; a small fixed set of elevation and radius steps; a motion spec written as
`element: duration easing [property from->to] delay`.

Visual system only. No content, copy, data or behaviour changes. No database, no migration, no
Lovable action.

## What must be preserved

- Every string, number, data flow and route of the offer (4 steps), « Votre saison », « Détail du
  duel », the Curva preview, the member mark, the Profil section and the card page.
- Business logic: Fantasy rules, scoring, gameweek lifecycle, Manager Card rules, pricing.
- Brand identity and the colours of every token (`--po-*`, `--ps-*`, ui-kit). No colour changes.
- Existing motion, with the same durations and curves: line draw, bar grow, bar fill, count-up,
  tab slide, active-tab pill, pulse ring, panel enter, logo tilt, card reveal, lock fade.
- Logical properties, right-to-left mirroring, Western digits, tap targets of at least 44px.
- Every existing test stays green.

## What changes

1. **Spacing scale.** Tokens `--po-space-1` (4px) to `--po-space-16` (64px) in a shared
   `plus-tokens.css`. Every padding, margin, gap and inset uses a token; every box size is a
   multiple of 4. Off-grid values move to the nearest step (3, 5 -> 4; 6 -> 8; 10 -> 12 on padding and
   8 on gaps; 14 -> 16; 18 -> 20; 22, 26 -> 24; 30 -> 32; 34 -> 32; 46 -> 48).
2. **Elevation.** The ad-hoc `box-shadow` values become `--po-shadow-1` (surface highlight),
   `--po-shadow-2` (raised), `--po-shadow-3` (floating) and `--po-glow` (the mint glow). Zero-blur
   selection rings (a 1 to 3px outline in mint, sky or coral) are not elevation; they get
   `--po-ring-*` tokens so no shadow is a literal.
3. **Radius.** `--po-radius-sm` 8px, `--po-radius-md` 16px, `--po-radius-lg` 24px,
   `--po-radius-pill` 999px; circles stay `50%`. One extra step, `--po-radius-xs` 4px, for the ends
   of bars and markers a few pixels wide, where 8px would turn them into capsules.
4. **Motion.** Tokens for duration and easing, and five micro-interactions (table below), all
   `transform` and `opacity`, all off under `prefers-reduced-motion`.
5. **Lint test.** `plus-css-lint.test.ts` parses the three plus stylesheets and the token file.

## Optical allowlist (the only off-grid spacing values permitted)

| Value | Where | Why |
| --- | --- | --- |
| `<= 1px` | borders, hairlines, the 1px tab-pill inset | hairline |
| `2px` | `inline-size` / `block-size` of a rule or marker shape; the `- 2px` in the tab pill width | a 2px line is a hairline, not a box |
| `-2px` | `margin-inline-start` centring a 4px marker on its x position | half of the marker width |

Focus `outline-offset` values moved to 4px; `outline` widths are borders, not spacing.

Everything else is on the 4px grid, or it fails the lint. Font sizes and line-heights are not
spacing and are out of scope.

## Motion spec

Tokens: `--po-dur-fast` 120ms, `--po-dur-base` 200ms, `--po-dur-slow` 600ms, `--po-ease-out`
`cubic-bezier(0.22, 1, 0.36, 1)`. Hover lift uses 180ms (`--po-dur-lift`), the shake 300ms
(`--po-dur-shake`), the shimmer 1600ms (`--po-dur-shimmer`).

Existing (unchanged):

| element: duration easing [property from->to] delay | |
| --- | --- |
| `.plus-logo__tilt`: 3600ms ease-in-out infinite [transform rotate -7deg -> 7deg, scaleX] | logo "+" |
| `.plus-s4-card`: 600ms ease-out-expo [opacity 0->1, transform scale .88->1, translateY 14px->0] | step 4 card reveal |
| `.plus-all svg`: 150ms ease [transform rotate 0->180deg] | plan list chevron |
| `.plus-toast`: 150ms linear [opacity 0->1] | toast |
| `.ps-panel`: 200ms ease-out [opacity 0->1, transform translateY 8px->0] | tab content enter |
| `.ps-pill`: 240ms cubic-bezier(.3,.7,.2,1) [transform translateX k*100%] | active-tab pill slide |
| `.ps-seg button`: 160ms ease-out [color] | tab label colour |
| `.draw`: 700ms ease-out [stroke-dashoffset 1->0] | line draw |
| `.gb`: 420ms ease-out [transform scaleY 0->1] delay i*35ms + d | bar grow |
| `.ps-fx`: 600ms ease-out [transform scaleX 0->1] delay i*60ms | bar fill |
| `.fade`: 300ms ease-out [opacity 0->1] delay 450ms | chart labels |
| `.pulse-ring`: 600ms ease-out [opacity .7->0, transform scale 1->2.8] delay 800ms | pulse |
| count-up (`COUNT_MS` in `plus-season-ui.tsx`): 600ms ease-out cubic [text 0->value] | hero numbers |
| `.pl-lock`: 280ms ease-out [opacity 0->1] | lock overlay |

Added:

| element: duration easing [property from->to] delay | |
| --- | --- |
| press, buttons and tappable cards on `:active`: 120ms ease-out [transform scale 1->.97] | `.plus-btn`, `.plus-icon-btn`, `.plus-swatch`, `.plus-plan`, `.plus-feat`, `.plus-link-btn`, `.ps-seg button`, `.ps-linkbtn`, `.pl-cta`, `.pl-preview`, `.plus-entry` rows |
| hover lift, `(hover: hover) and (pointer: fine)` only: 180ms ease-out [transform translateY 0->-2px, box-shadow -> shadow-2] | cards that are tappable (`.pl-preview`, `.plus-plan`, `.plus-feat`) |
| success, `.plus-offer[data-step="4"] .plus-brand`: 600ms ease-out [transform scale .8->1.06->1, opacity 0->1] once | the logo on the welcome screen, single run |
| loading shimmer, `.pl-skeleton` (member sections while `isPending`): 1600ms ease-in-out, 3 cycles then static [background-position, opacity-free: transform of a sheen layer -100%->100%] | only where the loading branch exists today (`PlusSeasonSection`, `PlusDuelSection`) |
| error shake, failed checkout / restore message: 300ms ease-out [transform translateX 0->-4px->4px->-4px->0] once | `.plus-toast[data-tone="error"]` |

Notes on the added items:

- The welcome screen has no check mark; the success keyframes run on its logo (`.plus-brand`).
- The Profil section's loading state uses the app's own `UiSkeleton`, which is outside the BotolaGO+
  stylesheets; it is left alone.
- The toast is shared by « bientôt » / restore messages (errors) and the share confirmation
  (success). A `data-tone` attribute is set from the call site; no text or timing changes.

## Acceptance criteria (measurable)

1. `plus-css-lint.test.ts`: 0 off-grid spacing values outside the allowlist, 0 literal
   `box-shadow` or `border-radius` values, 0 animations outside a reduced-motion guard.
2. Off-grid spacing values: 126 before, 0 after (excluding the allowlist). `box-shadow` literals:
   22 before, 0 after. `border-radius` literals other than `50%`: all before, 0 after.
3. Full `bun test` as green as on the base branch (same failures, if any, and none new); `bun run
   typecheck`, eslint on changed files and `bun run build` pass.
4. Screenshots before and after, French and Arabic (right to left), at 390 and 1280: offer steps 1
   to 4, step 2 Résumé and duel Course, Profil BotolaGO+ section, card page locked and member, home
   preview. Per element: no horizontal overflow introduced; smallest rendered font unchanged; text
   contrast at least 4.5:1 measured from rasterised pixels; tap targets at least 44px.
5. With `prefers-reduced-motion: reduce`, no animation or transition runs (computed style check).
6. Layout drift from snapping to the grid stays within 8px on any single element and never breaks
   a line of text onto a new line that was not there before (compared in the screenshots).
