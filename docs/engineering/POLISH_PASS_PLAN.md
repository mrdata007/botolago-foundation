# Premium polish pass — token audit and execution plan

Scope is finish quality only: typography, spacing, colour precision, surfaces and
depth, the pitch, player cards, icons, motion, states, RTL parity, pixel
alignment. No new screens, features, navigation, information architecture, copy,
data, routes or RPCs. Anything needing one of those is logged, not done.

## Sequencing — the lanes have landed, this is now running

> **Status, 2026-09-21.** All five design-migration lanes (BG-0118 foundation,
> BG-0119 squad/picker, BG-0120 pitch/points, BG-0121 leagues/players, BG-0122
> the ten-item batch) are merged into `chief/launch-fixes-3`. The pass is
> unblocked and the first token item, the leading ramp, has shipped — see
> BG-0124 and `docs/qa/polish/README.md`.

The original reason for staging, kept because it is the reason the merge was
reviewable: the pass is specified token → component → screen, and "most fixes
should land in tokens and the kit, not in route files". While four lanes were
converting the kit's consumers, those two facts were in direct tension —
consolidating six radii into two, or changing the body weight, re-renders every
screen four agents are mid-way through, and every one of their diffs would
conflict. The cost of waiting was time; the cost of not waiting would have been
four lanes rebasing onto shifting tokens.

## Audit of the existing token layer, against the ten standards

Measured on `src/styles.css` and `src/components/ui-kit/tokens.ts` at the head of
`chief/launch-fixes-3`.

### 1. One type scale — partially present, two gaps

Nine size tokens exist, but named by usage rather than by the semantic scale the
standard asks for:

| present               | px  | maps to    |
| --------------------- | --- | ---------- |
| `--ui-text-hero`      | 34  | display    |
| `--ui-text-title`     | 19  | h1         |
| `--ui-text-section`   | 17  | h2         |
| `--ui-text-subtitle`  | 16  | h3         |
| `--ui-text-body`      | 15  | body       |
| `--ui-text-secondary` | 14  | body-small |
| `--ui-text-meta`      | 13  | —          |
| `--ui-text-label`     | 12  | label      |
| `--ui-text-micro`     | 11  | caption    |

**Gap A — no line-height and no letter-spacing tokens existed at all.**

The leading half is **done** (BG-0124): `--ui-leading-flat` / `-copy` /
`-prose` now hang off `:root`, every step of `ui.text.*` and `STAT_BASE` draws
from them, and they are redeclared under `:lang(ar)` / `[dir="rtl"]`. This was
not a tidiness gap. `leading-none` on `ui.text.micro` and the stat ramp gave a
line box exactly the font size, and inside a `truncate` — whose `overflow:
hidden` exists for a horizontal ellipsis — that cut 2px off the Latin descender
and 31% of the Arabic ink on the bottom nav. Across the app the probe counted
1200 clipped text leaves; it now counts 0. Two contract tests hold the line.

**Still open: `--ui-track-*`.** Heading tightening (−0.01 to −0.02em) and label
loosening (+0.04 to +0.08em) have nowhere to live. Note that any such token has
to be `ltr:`-only, like `--ui-stat-tracking` already is — letter-spacing breaks
Arabic letterform joins (BG-0069).

**Gap B — the weight ramp has no normal weight.** The four weights are 600, 700,
800, 900, and `--ui-weight-body` is **600**. Body copy is semibold everywhere,
which reads as emphatic rather than composed, and it removes the contrast that
makes a heading feel like a heading. A normal (400–450) and a medium (500) step
are needed before any of the "restraint" in this standard is achievable.

Nine steps is also one more than the standard's eight; `meta` (13) and
`secondary` (14) are close enough to merge, which is worth doing while the
renaming happens.

### 2. Spacing rhythm — present

`--ui-space-1` … `--ui-space-6`, plus `--ui-gap`, `--ui-gap-lg`, `--ui-row-min`
and `--ui-tap-min`. Needs an off-grid audit across screens rather than new
tokens.

### 3. Surfaces and depth — over-supplied

Three surface levels exist (`--ui-page`, `--ui-surface`, `--ui-surface-sunken`),
but the third is _sunken_, not _raised_, so the hierarchy the standard describes
(page, card, raised) is not expressible — a raised element currently borrows the
card surface and adds a shadow.

**Four shadow tokens exist where the standard allows one:** `--ui-shadow-card`,
`--ui-shadow-raised`, `--ui-shadow-overlay`, `--ui-shadow-column`. And
`--ui-shadow-raised` is `0 -1px 0` — a top hairline, not a shadow at all. It is
misnamed, which is how it ended up used as both.

### 4. Colour — the ink ramp is already right

`--ui-on-surface`, `--ui-on-surface-muted`, `--ui-on-surface-faint` give the
three ink levels, and every one of the 46 kit colour pairs was verified at
≥4.5:1 during BG-0091. Ink is a deep navy, not pure black. This rule is largely
satisfied; the work is auditing screens for the single-tint rule on
success/warn/danger and for stray gradients on non-CTA buttons.

### 5. Radius — six, where the standard wants two

`tight 4` · `control 6` · `segment 8` · `track 10` · `sheet 16` · `column 28`.

Consolidating to large (cards, sheets) + small (chips, inputs, buttons) + pill
is the single largest visual change in this pass, and the one most likely to
conflict with in-flight work — another reason for the sequencing above. Note
`column 28` is the desktop phone-column frame and may survive as a third,
structural value rather than a component radius.

### 6–7. Icons and interactive states — audit required

No token-level gap identified yet. Needs a sweep for Lucide stroke width,
optical sizing against the type scale, and the four states (default, hover,
pressed, focus-visible, disabled) on every interactive primitive.

### 8. Motion — already built (corrects an earlier reading of this audit)

An earlier draft of this document counted `prefers-reduced-motion` **once** in
the stylesheet and read that as thin coverage. That was the wrong inference. The
single occurrence, at `src/styles.css:724`, is a blanket rule:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
  .mesh-drift {
    animation: none !important;
  }
  .shimmer {
    animation: none !important;
    background-image: none !important;
  }
}
```

One rule matching every element and both pseudo-elements, with `!important`, is
the strongest form of this, not the weakest — it governs every entrance, press
and page-mount animation in the product including ones not yet written, and the
two named kills handle the decorative loops `!important` alone would only speed
up. Counting occurrences was the wrong measure.

Duration tokens exist too, at `src/styles.css:188-196`: `--duration-tap` 120ms,
`--duration-quick` 180ms, `--duration-route` 260ms, `--duration-sheet` 320ms,
`--duration-hero` 420ms, with `--ease-standard`, `--ease-emphasized` and
`--ease-decelerate`. The press timing the standard asks for (120ms) is exactly
`--duration-tap`, and entrance (150–250ms) is `--duration-quick`.

The remaining work here is adoption, not construction: sweep for components that
hardcode a duration or easing instead of drawing from these, which is a screen
pass, not a token one.

### 9. Designed states — already built

`UiStatePanel`, `UiEmptyState`, `UiErrorState`, `UiSkeleton` all exist from
BG-0091. The work is adoption, not construction.

### 10. RTL — the Arabic adjustment is now in, as leading

Physical-direction utilities are at **zero** across all of `src/`, and Arabic
letter-spacing was neutralised in BG-0069.

The gap the standard named explicitly — no Arabic-specific adjustment — is
**closed**, though not the way this document first guessed. It proposed "+1px
body size and +0.1 line-height". The size half would have been wrong: changing
the Arabic font size breaks the shared spacing grid and makes every mixed
string shift mid-sentence, and this product is full of Latin club names inside
Arabic tables. Leading moves the box, not the glyph, so the whole adjustment
lives there.

The magnitude was also badly underestimated. Not +0.1: Noto Sans Arabic needs
**1.95** against Manrope's 1.4 on single-line text, which is where the ink
actually clears its box — measured across the product, not estimated. The
derivation and the numbers are in BG-0124 and `docs/qa/polish/README.md`.

**Tabular figures** are near-absent: two occurrences in the stylesheet, one of
which is a comment. `UiTable`'s `numeric` cells set it, nothing else does. Every
points, price and rank column in the product needs it.

## Order of work, once unblocked

1. **Tokens** — the type scale (line-height, tracking, a normal weight), the
   radius consolidation, one shadow, the raised surface, the Arabic
   size/line-height pair, tabular figures as a token. Motion is not on this
   list; see §8.
2. **Kit primitives** — adopt the new tokens; add whatever the screen work
   reveals as missing rather than letting route files grow class lists.
3. **Screens** — only what tokens and primitives cannot reach.

Screenshot baseline is captured at the start of step 1, not before.

## Logged rather than done

Anything in the brief that turns out to need a route, RPC, contract, migration,
i18n key beyond shortening a clipping label, or a change under `src/backend`
goes to the ledger. The one already identified: the standard asks for club
crests at 16px with a 1px ring on filter chips, and for kit-coloured shirts —
but `primary_color` and `secondary_color` are **null for all 21 clubs** in
production and `code` is null for 13 of 21, so club colour cannot be rendered
from data that does not exist. Crests are populated for all 21 and are the only
usable identity signal. Recorded as BG-0112.
