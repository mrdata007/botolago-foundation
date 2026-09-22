# BotolaGO Design System V2

This is the contract every screen is converted against. It is written for an
agent who has never seen this codebase and has to convert a screen **without
inventing anything**: if you need a colour, a size, a radius, a shadow or a
component that is not in here, that is a gap in the system — say so, do not
invent a local one.

Two files hold the whole system:

| File                     | What it is                                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/styles.css`         | the `--ui-*` custom properties, light and dark, plus the `--fpl-*` alias layer                                                               |
| `src/components/ui-kit/` | `tokens.ts` (typed manifest + class tokens), `primitives.tsx` (components), `index.ts` (barrel), `ui-kit.contract.test.ts` (the enforcement) |

Import from the barrel only:

```ts
import { ui, UiCard, UiSheet, UiTable } from "@/components/ui-kit";
```

Owned by the foundation lane (BG-0091). Screen lanes do not edit
`src/components/ui-kit/**` or the token blocks in `src/styles.css`; they
consume them. If something is missing, raise it rather than patching the kit.

---

## 1. The five rules

1. **Logical properties, never physical.** `ms-`/`me-`, `ps-`/`pe-`,
   `start-`/`end-`, `border-s`/`border-e`, `rounded-s`/`rounded-e`,
   `text-start`/`text-end`. Never `ml-`, `pr-`, `left-`, `text-right`,
   `border-l`. Arabic is a first-class language here, not a mirror mode.
2. **Every `tracking-*` is `ltr:`-prefixed.** Arabic letterforms join;
   letter-spacing in either direction pulls the joins apart and renders a word
   as loose disconnected glyphs (defect BG-0069). Write
   `ltr:tracking-wide`, never `tracking-wide`.
3. **A gradient angle is physical too.** `linear-gradient(135deg, …)` lands on
   the opposite edge under `dir="rtl"`. Use `to bottom`, or a centred radial
   origin (`at 50% 0%`). The contract test fails a `deg` angle in the kit and
   in any `--ui-grad-*` token.
4. **Stats are tabular.** Any figure a reader scans — points, price, rank,
   score, GW total — uses `ui.stat.*` (or `ui.text.tabular` at minimum), which
   sets `font-variant-numeric: tabular-nums`. Digits must line up column to
   column.
5. **44px tap floor.** Every control clears `--ui-tap-min` (2.75rem). Heights
   come from `--ui-tap-min` / `--ui-row-min`, never from a literal like
   `min-h-10`.

And the one that caused BG-0083:

6. **`--ui-ink` is a fill/border colour, never a foreground.** It is a dark
   navy in _both_ themes. Brand-coloured text and icons use `--ui-ink-fg`
   (`ui.tone.ink`). Text sitting _on_ an ink fill uses `--ui-on-ink` (cyan) or
   `--ui-on-ink-plain`. Text on the header/hero band uses
   `--ui-on-grad-header`. Text on the action gradient uses `--ui-ink-deep`.

---

## 2. Token reference

Every token below is declared in `src/styles.css` and listed in `UI_TOKENS`
(`src/components/ui-kit/tokens.ts`). The contract test fails if the two ever
disagree, in either direction, and if a colour-bearing token has no dark
counterpart.

### 2.1 Type ramp — `ui.text.*`

| Token                 | Value | Class token                                           | Used for                            |
| --------------------- | ----- | ----------------------------------------------------- | ----------------------------------- |
| `--ui-text-hero`      | 34px  | `ui.text.hero` (900)                                  | hub title                           |
| `--ui-text-title`     | 19px  | `ui.text.title` (800)                                 | screen header title                 |
| `--ui-text-section`   | 17px  | `ui.text.section` (800)                               | section heading                     |
| `--ui-text-subtitle`  | 16px  | `ui.text.subtitle` (800)                              | header title flanked both sides     |
| `--ui-text-body`      | 15px  | `ui.text.body` (600), `ui.text.bodyStrong` (800)      | body, buttons, rows                 |
| `--ui-text-secondary` | 14px  | `ui.text.secondary`                                   | supporting copy, pills              |
| `--ui-text-meta`      | 13px  | `ui.text.meta` (600)                                  | meta lines, tab labels, table cells |
| `--ui-text-label`     | 12px  | `ui.text.label` (800, uppercase, `ltr:tracking-wide`) | badges, column heads                |
| `--ui-text-micro`     | 11px  | `ui.text.micro` (600)                                 | nav labels, plate text              |

Weights: `--ui-weight-body: 600`, `--ui-weight-strong: 700`,
`--ui-weight-heavy: 800`, `--ui-weight-hero: 900`. Fantasy never uses 400 for
structural text. Apply with `[font-weight:var(--ui-weight-heavy)]`.

### 2.2 Stat ramp — `ui.stat.*`

Numerals only. Each step is tabular, has its own weight and an `ltr:`-only
tightening of `--ui-stat-tracking` (-0.01em).

| Token            | Value | Class token          | Used for                         |
| ---------------- | ----- | -------------------- | -------------------------------- |
| `--ui-stat-hero` | 30px  | `ui.stat.hero` (900) | the one number a screen is about |
| `--ui-stat-lg`   | 22px  | `ui.stat.lg` (900)   | summary tiles                    |
| `--ui-stat-md`   | 17px  | `ui.stat.md` (800)   | table totals, row emphasis       |
| `--ui-stat-sm`   | 13px  | `ui.stat.sm` (700)   | dense table cells, picker rows   |

Do not use `ui.text.*` for a figure and do not hand-roll `tabular-nums`.

### 2.3 Colour

Light and dark are given as the resolved oklch. `ui.tone.*` / `ui.surface.*`
are the class tokens; prefer them over spelling `text-[color:var(…)]`.

**Surfaces**

| Token                 | Light                    | Dark                   | Meaning                                                    |
| --------------------- | ------------------------ | ---------------------- | ---------------------------------------------------------- |
| `--ui-page`           | `oklch(0.975 0.004 250)` | `oklch(0.15 0.03 260)` | the page behind everything (`ui.surface.page`)             |
| `--ui-surface`        | `oklch(1 0 0)`           | `oklch(0.22 0.03 260)` | card / bar / sheet (`ui.surface.card`, `.bar`, `.overlay`) |
| `--ui-surface-sunken` | `oklch(0.93 0.006 250)`  | `oklch(0.26 0.03 260)` | tracks, table heads, chips (`ui.surface.sunken`)           |
| `--ui-rule`           | `oklch(0.93 0.006 250)`  | white 14%              | 1px divider (`ui.rule.*`)                                  |
| `--ui-scrim`          | ink 45%                  | near-black 68%         | the dim behind a sheet/modal                               |

**Foregrounds**

| Token                   | Light                   | Dark                   | Meaning                                               |
| ----------------------- | ----------------------- | ---------------------- | ----------------------------------------------------- |
| `--ui-on-surface`       | `oklch(0.16 0.03 260)`  | `oklch(0.97 0.01 250)` | body copy (`ui.tone.default`)                         |
| `--ui-on-surface-muted` | `oklch(0.45 0.02 258)`  | `oklch(0.76 0.02 258)` | secondary copy (`ui.tone.muted`)                      |
| `--ui-on-surface-faint` | `oklch(0.555 0.02 258)` | `oklch(0.64 0.02 258)` | placeholders, disabled (`ui.tone.faint`)              |
| `--ui-ink-fg`           | `oklch(0.32 0.1 258)`   | `oklch(0.86 0.08 232)` | **brand text/icons** (`ui.tone.ink`)                  |
| `--ui-on-ink`           | `oklch(0.88 0.11 205)`  | same                   | cyan text on an ink fill (`ui.tone.onInk`)            |
| `--ui-on-ink-plain`     | `oklch(1 0 0)`          | `oklch(0.97 0.01 250)` | plain text on an ink fill (`ui.tone.onInkPlain`)      |
| `--ui-on-grad-header`   | `oklch(0.24 0.09 258)`  | `oklch(0.97 0.01 250)` | text on the header/hero band (`ui.tone.onGradHeader`) |
| `--ui-on-mesh`          | = `--ui-on-ink-plain`   | follows it             | text on the dark mesh (`ui.tone.onMesh`)              |
| `--ui-on-mesh-muted`    | it at 78%               | follows it             | its quieter step (`ui.tone.onMeshMuted`)              |
| `--ui-on-mesh-faint`    | it at 62%               | follows it             | its quietest step (`ui.tone.onMeshFaint`)             |
| `--ui-ink-deep`         | `oklch(0.24 0.09 258)`  | `oklch(0.22 0.07 260)` | text on the **action gradient**; dark scrim fills     |
| `--ui-on-pitch`         | `oklch(0.18 0.04 260)`  | `oklch(0.97 0.01 250)` | labels on the turf                                    |

**Fills and accents**

| Token                | Light                                          | Dark                   | Meaning                                         |
| -------------------- | ---------------------------------------------- | ---------------------- | ----------------------------------------------- |
| `--ui-ink`           | `var(--brand-primary)` = `oklch(0.32 0.1 258)` | `oklch(0.3 0.08 260)`  | brand FILL / border only                        |
| `--ui-accent-spring` | `oklch(0.88 0.19 152)`                         | `oklch(0.82 0.18 152)` | action-gradient start stop                      |
| `--ui-accent-sky`    | `oklch(0.88 0.11 205)`                         | `oklch(0.82 0.11 205)` | action-gradient end stop                        |
| `--ui-positive`      | `oklch(0.52 0.14 150)`                         | `oklch(0.78 0.17 150)` | gains, up movement — legible as text            |
| `--ui-negative`      | `oklch(0.55 0.22 355)`                         | `oklch(0.75 0.19 355)` | losses, down movement, errors — legible as text |
| `--ui-caution`       | `oklch(0.82 0.17 80)`                          | `oklch(0.85 0.16 80)`  | amber FILL; its foreground is `--ui-on-caution` |
| `--ui-on-positive`   | = `--ui-on-ink-plain`                          | = `--ui-ink-deep`      | text ON a positive fill (`ui.tone.onPositive`)  |
| `--ui-on-negative`   | = `--ui-on-ink-plain`                          | = `--ui-ink-deep`      | text ON a negative fill (`ui.tone.onNegative`)  |
| `--ui-on-caution`    | = `--ui-ink-deep`                              | = `--ui-ink-deep`      | text ON an amber fill (`ui.tone.onCaution`)     |
| `--ui-live`          | `oklch(0.62 0.22 27)`                          | `oklch(0.68 0.22 27)`  | a match in progress: the dot, the minute bar    |
| `--ui-live-fg`       | `oklch(0.5 0.22 27)`                           | `oklch(0.78 0.18 27)`  | the same state as TEXT (`ui.tone.live`)         |
| `--ui-mesh-glass`    | `--ui-on-ink-plain` at 10%                     | follows it             | the glass tile on the mesh (`ui.surface.mesh`)  |
| `--ui-mesh-rule`     | `--ui-on-ink-plain` at 20%                     | follows it             | its hairline                                    |

**The dark mesh.** The welcome screen, the auth screens and the first-launch
language chooser sit on a deep mesh rather than on `--ui-page`. It is a
deliberate second register — a focused room with one job — and the page
tokens do not serve it, so it has its own: `ui.tone.onMesh*`,
`ui.surface.mesh` and `ui.focusOnMesh`. Never write `text-white/80` or
`bg-white/10` there; a literal white is un-themed and says "light theme" in a
file that does not know which theme it is in.

`ui.focusOnMesh` is not a convenience. `ui.focus` draws its ring in
`--ui-ink-fg`, a deep navy in the light theme, which on the mesh is a ring
you cannot see.

**Third-party brand marks are exempt from the colour rule.** Google's
sign-in mark has a fixed brand colour that this design system is not entitled
to change, and no token matches it. Leave the hex, and say in a comment that
it is a brand mark.

**Gradients** (all direction-neutral)

| Token              | Light                        | Dark              | Foreground to use     |
| ------------------ | ---------------------------- | ----------------- | --------------------- |
| `--ui-grad-action` | spring → sky, `to bottom`    | follows its stops | `--ui-ink-deep`       |
| `--ui-grad-header` | cyan → indigo, `to bottom`   | deepened          | `--ui-on-grad-header` |
| `--ui-grad-hero`   | centred radial + cyan→indigo | deepened          | `--ui-on-grad-header` |

**Elevation** — one set, four steps. `--ui-shadow-card` (the only card
shadow), `--ui-shadow-raised` (a bar lifted off content, e.g. the bottom nav),
`--ui-shadow-overlay` (sheet/modal), `--ui-shadow-column` (the desktop phone
column). There is no second shadow scale; do not reach for `shadow-lg`.

**Fantasy domain** — promoted into the kit because they have no general
equivalent, but they live under the kit's naming and contract and have dark
counterparts.

| Token                             | Light                                      | Dark                   |
| --------------------------------- | ------------------------------------------ | ---------------------- |
| `--ui-pitch-turf-a`               | `oklch(0.71 0.17 146)`                     | `oklch(0.45 0.11 146)` |
| `--ui-pitch-turf-b`               | `oklch(0.67 0.17 146)`                     | `oklch(0.42 0.11 146)` |
| `--ui-pitch-bench`                | `oklch(0.8 0.12 146)`                      | `oklch(0.36 0.08 146)` |
| `--ui-pitch-line`                 | white 92%                                  | white 72%              |
| `--ui-fdr-1` … `--ui-fdr-5`       | green → grey → pink → deep magenta         | deepened per step      |
| `--ui-on-fdr-1` … `--ui-on-fdr-5` | the foreground that clears AA on that step | ditto                  |

Never pick an FDR foreground yourself — use `--ui-on-fdr-N`, or
`UiDifficultyCell`, which does it for you.

**The same rule applies to the status fills.** `--ui-positive` and
`--ui-negative` invert across the themes — a mid-tone in light, a light tint
in dark — so one foreground cannot serve both, and a filled control that
picks its own gets it wrong in exactly one theme. Measured against the fills:
positive 5.17 / 9.28, negative 5.49 / 6.93, caution 9.34 / 10.65. A filled
destructive button written as white-on-negative measured **2.31:1** in dark
before `--ui-on-negative` existed.

`--ui-live` is the exception, and only because nothing draws text on it: it
is the pulsing dot and the minute bar. Text about a live match sits on a 14%
tint and uses `--ui-live-fg`.

### 2.4 Spacing, density, radius

One 4px step scale: `--ui-space-1` 0.25rem, `-2` 0.5, `-3` 0.75, `-4` 1,
`-5` 1.5, `-6` 2rem. The named density tokens are **aliases of it**, not new
numbers:

| Token             | Value               | Class token       |
| ----------------- | ------------------- | ----------------- |
| `--ui-gutter`     | `var(--ui-space-4)` | `ui.space.gutter` |
| `--ui-gap`        | `var(--ui-space-2)` | —                 |
| `--ui-gap-lg`     | `var(--ui-space-3)` | —                 |
| `--ui-tap-min`    | 2.75rem (44px)      | `ui.space.tap`    |
| `--ui-row-min`    | 3rem (48px)         | `ui.space.row`    |
| `--ui-column-max` | 480px               | `ui.space.column` |

Radius set — six steps, no others:

| Token                 | Value | Class token         | Used for                         |
| --------------------- | ----- | ------------------- | -------------------------------- |
| `--ui-radius-tight`   | 4px   | `ui.radius.tight`   | FDR squares, player plates       |
| `--ui-radius-control` | 6px   | `ui.radius.control` | buttons, cards, pills, banners   |
| `--ui-radius-segment` | 8px   | `ui.radius.segment` | the selected tab                 |
| `--ui-radius-track`   | 10px  | `ui.radius.track`   | segmented track, inputs, selects |
| `--ui-radius-sheet`   | 16px  | `ui.radius.sheet`   | bottom sheet, modal              |
| `--ui-radius-column`  | 28px  | —                   | the desktop phone column         |

Plus `ui.radius.full` for a circle/pill.

### 2.5 Other class tokens

- `ui.focus` — the one focus ring, drawn in `--ui-ink-fg` so it is visible in
  both themes. Put it on every interactive element you build.
- `ui.safe.top` / `ui.safe.bottom` — safe-area padding.
- `ui.rule.block` / `.blockStart` / `.inline` / `.all` — hairline dividers on
  logical edges.

---

## 3. The `--fpl-*` → kit mapping

`--fpl-*` was a second, light-only palette. It is now an **alias layer**:
every Fantasy token is exactly one `--ui-*` token and carries no colour of its
own, so the inner screens follow the theme today. The contract test fails if
any `--fpl-*` value stops being a plain `var(--ui-…)`.

When you convert a Fantasy screen, replace the left column with the right one.

| `--fpl-*`                                                | Now resolves to                                 | When converting, write                                                                | Note                                                           |
| -------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `--fpl-bg`                                               | `--ui-page`                                     | `ui.surface.page`                                                                     |                                                                |
| `--fpl-ink` (as a **fill**: `bg-`, `border-`, `ring-`)   | `--ui-ink`                                      | `ui.surface.ink` / `ui.surface.inkPlain`                                              |                                                                |
| `--fpl-ink` (as **text**: `text-[color:var(--fpl-ink)]`) | `--ui-ink`                                      | **`ui.tone.ink`** (`--ui-ink-fg`)                                                     | this is the BG-0083 defect; a straight alias would keep it     |
| `--fpl-ink-deep`                                         | `--ui-ink-deep`                                 | `--ui-ink-deep` on the action gradient; `--ui-on-grad-header` on the header/hero band |                                                                |
| `--fpl-cyan`                                             | `--ui-on-ink`                                   | `ui.tone.onInk` — only on an ink fill                                                 | it fails AA on white (measured 1.38:1); never use it on a card |
| `--fpl-green`                                            | `--ui-accent-spring`                            | gradient stop only                                                                    |                                                                |
| `--fpl-pink`                                             | `--ui-negative`                                 | `ui.tone.negative`                                                                    |                                                                |
| `--fpl-amber`                                            | `--ui-caution`                                  | fill only, text `--ui-ink-deep`                                                       |                                                                |
| `--fpl-grey`                                             | `--ui-surface-sunken`                           | `ui.surface.sunken` or `ui.rule.*`                                                    | it was doing both jobs; pick the right one                     |
| `--fpl-grey-text`                                        | `--ui-on-surface-muted`                         | `ui.tone.muted`                                                                       |                                                                |
| `--fpl-grad`                                             | `--ui-grad-action`                              | `UiButton variant="gradient"`                                                         | now runs `to bottom`                                           |
| `--fpl-header`                                           | `--ui-grad-header`                              | `UiHeader tone="gradient"`                                                            |                                                                |
| `--fpl-hero`                                             | `--ui-grad-hero`                                | `--ui-grad-hero`                                                                      | centred radial, `to bottom`                                    |
| `--fpl-pitch-a` / `-b` / `-bench`                        | `--ui-pitch-turf-a` / `-b` / `--ui-pitch-bench` | `UiPitchSurface`                                                                      |                                                                |
| `--fpl-fdr-1…5`                                          | `--ui-fdr-1…5`                                  | `UiDifficultyCell`                                                                    | pairs the fill with `--ui-on-fdr-N`                            |

Two things the alias layer cannot fix for you, and that a screen lane must:

- **literal `bg-white` / `text-white`** in Fantasy screens — an un-themed
  surface that leaves themed text invisible. Replace with `ui.surface.card` /
  `ui.surface.page` / `ui.tone.onInkPlain`.
- **`--fpl-ink` / `--fpl-ink-deep` used as a text colour** — see the table
  above.

---

## 4. Primitive catalogue

All exported from `@/components/ui-kit`. Props marked \* are required.

### Frame and chrome

| Primitive       | Props                                                                                                                                                 | Notes                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `UiScreen`      | `children*`, `width?: "column" \| "content" \| "wide"`, `bottomNav?`, `raised?`, `className?`                                                         | the page canvas; `column` is the 480px phone column                                                                      |
| `UiHeader`      | `title*`, `backTo?`, `onBack?`, `showBack?`, `leading?`, `trailing?`, `children?`, `tone?: "gradient" \| "ink" \| "surface"`, `sticky?`, `className?` | `[back] — centred title — [trailing]` on a 1fr/auto/1fr grid; `children` renders a band underneath (deadline line, tabs) |
| `UiCard`        | `children*`, `as?`, `padding?: "none" \| "sm" \| "md" \| "lg"`, `interactive?`, `className?`                                                          | opaque, 6px, one shadow, no glass                                                                                        |
| `UiDivider`     | `className?`                                                                                                                                          |                                                                                                                          |
| `UiBanner`      | `children*`, `className?`                                                                                                                             | full-bleed ink strip, one emphatic line                                                                                  |
| `UiKeyValueRow` | `label*`, `value*`, `className?`                                                                                                                      |                                                                                                                          |

### Controls

| Primitive        | Props                                                                                                                                             | Notes                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UiButton`       | all `<button>` props + `variant?: "gradient" \| "ink" \| "light" \| "outline" \| "ghost"`, `size?: "sm" \| "md"`                                  | `md` is full-width at `--ui-row-min`; `sm` is inline at `--ui-tap-min`                                                                                                  |
| `UiLinkButton`   | same + `to*`, `params?`, `search?`                                                                                                                | router `Link` in button clothing                                                                                                                                        |
| `UiSegmented<T>` | `value*`, `onChange*`, `options*: {value,label,disabled?}[]`, `tone?: "onSurface" \| "onGradient"`, `size?: "md" \| "lg"`, `label?`, `className?` | `md` (default) = 44px at the meta size and fits four French labels at 390px; `lg` = 48px at body size                                                                   |
| `UiChip`         | all `<button>` props + `children*`, `selected?`, `ref?`, `aria-current?`                                                                          | interactive filter/day chip; give `aria-current` for "this is the current one" and it drops `aria-pressed`                                                              |
| `UiInput`        | all `<input>` props + `label?`, `hint?`, `error?`, `reserveError?`, `trailing?`, `fieldClassName?`, `ref?`                                        | renders and wires its own `<label>`; `error` sets `aria-invalid`, announces as `role="alert"`, and is ADDED to any `aria-describedby` you pass rather than replacing it |
| `UiSelect`       | all `<select>` props + `label?`, `hint?`, `error?`, `reserveError?`, `options?: {value,label,disabled?}[]`, `placeholder?`, `ref?`                | native `<select>` — already localised, already keyboard-correct, opens the platform picker                                                                              |

`trailing` is the slot for a control that lives INSIDE the field box on its
inline-end edge — the show/hide-password eye, a clear button, a unit. It has
to be a prop rather than something you compose at the call site: the field
frame is one flex column holding label, box and error, so an absolutely
positioned child anchored to the frame stretches across all three.

`reserveError` keeps the error line's height whether or not there is an
error, and announces it politely. Use it on a form that validates on submit.
Without it the message appears silently, and the line is inserted rather than
filled — which on a phone pushes the submit button down, out from under the
thumb already travelling toward it. The reserved height is one line box of
the field's own type (`calc(var(--ui-text-meta)*var(--ui-leading-flat))`),
not a literal, because the Arabic leading is 1.95 against 1.4 and a fixed
16px under-reserves it.

### Overlays

| Primitive | Props                                                                                                               | Notes                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UiSheet` | `open*`, `onOpenChange*`, `title*`, `titleHidden?`, `description?`, `header?`, `footer?`, `children?`, `className?` | bottom sheet; focus-trapped dialog, Escape closes, close control labelled `t("fpl.close")`. `title` is required — a dialog with no accessible name is a defect |
| `UiModal` | `open*`, `onOpenChange*`, `title*`, `description?`, `footer?`, `children?`                                          | centred confirmation/short form                                                                                                                                |

Use the sheet for anything a thumb scrolls through on a phone; the modal for a
short confirmation. Neither takes an English "Close" — the kit provides it.

### Data display

| Primitive             | Props                                                                                  | Notes                                                                 |
| --------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `UiTable`             | `children*`, `caption?`, `captionHidden?`, `tableClassName?`                           | wrapper + `<table>`; scrolls horizontally instead of pushing the page |
| `UiTHead` / `UiTBody` | `children*`, `className?`                                                              | head sits on `ui.surface.sunken`                                      |
| `UiTR`                | `children*`, `highlighted?`, `onClick?`                                                | `highlighted` = "this row is you"                                     |
| `UiTH`                | `<th>` props + `numeric?`                                                              | `numeric` aligns to the inline-end edge                               |
| `UiTD`                | `<td>` props + `numeric?`, `strong?`                                                   | `numeric` also switches to `ui.stat.sm` (tabular)                     |
| `UiRankMovement`      | `rank*`, `previousRank*`, `labels*: {up,down,same}`                                    | glyph **and** accessible name; you pass translated labels             |
| `UiStatBlock`         | `value*`, `label?`, `sub?`, `size?: "sm" \| "md" \| "lg" \| "hero"`, `tone?`, `align?` | a number and what it means                                            |

**League standings stay a table.** Rank / manager / GW / total / movement are
scanned one column at a time; a card grid destroys that. The intended shape:

```tsx
<UiTable caption={t("league.standings")}>
  <UiTHead>
    <UiTR>
      <UiTH numeric>{t("league.rank")}</UiTH>
      <UiTH>{t("league.manager")}</UiTH>
      <UiTH numeric>{t("league.gw")}</UiTH>
      <UiTH numeric>{t("league.total")}</UiTH>
      <UiTH>
        <span className="sr-only">{t("league.movement")}</span>
      </UiTH>
    </UiTR>
  </UiTHead>
  <UiTBody>
    {rows.map((row) => (
      <UiTR key={row.id} highlighted={row.isMe}>
        <UiTD numeric>{row.rank}</UiTD>
        <UiTD strong>{row.manager}</UiTD>
        <UiTD numeric>{row.gw}</UiTD>
        <UiTD numeric strong>
          {row.total}
        </UiTD>
        <UiTD>
          <UiRankMovement rank={row.rank} previousRank={row.previousRank} labels={movementLabels} />
        </UiTD>
      </UiTR>
    ))}
  </UiTBody>
</UiTable>
```

### Fantasy units

| Primitive          | Props                                                                                                                             | Notes                                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UiPlayerPlate`    | `name*`, `visual?`, `sub?`, `badge?`, `flag?`, `state?: "default" \| "selected" \| "doubtful" \| "out"`, `onClick?`, `ariaLabel?` | the pitch's core unit: shirt, ink name plate, sub plate (price / fixture / points). A `<button>` only when `onClick` is given, so an empty slot is not a fake control |
| `UiPlayerRow`      | `name*`, `meta?`, `visual?`, `stats?: {key,value,label?}[]`, `trailing?`, `selected?`, `disabled?`, `onClick?`                    | the list/picker unit; the figures are `ui.stat.sm`, so a picker scans like a table                                                                                    |
| `UiPitchSurface`   | `rows*: ReactNode[][]`, `bench?`, `benchLabels?`, `benchHighlighted?`                                                             | turf, markings and slot geometry only — it knows nothing about formations, squad rules or substitutions. `rows` is GK → DEF → MID → FWD                               |
| `UiDifficultyCell` | `difficulty*: 1\|2\|3\|4\|5`, `children*`, `title?`                                                                               | FDR square with the matching foreground                                                                                                                               |

`UiPitchSurface` takes already-rendered nodes, so squad logic stays in the
screen: build `UiPlayerPlate`s from your own data and hand them over.

### Badge / Chip / Pill — which one

There were five overlapping variants. Reconciled:

| Use                                                | Primitive                                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| a static emphatic label ("Journée 14", "Gardiens") | `UiPill` — `tone: "ink" \| "action" \| "sunken"`                                             |
| a status token in a row or card ("ACTIF", "+3")    | `UiBadge` — `tone: "neutral" \| "action" \| "positive" \| "negative"`, label type, uppercase |
| something the user taps to filter/select           | `UiChip` — interactive, 44px, `selected` or `aria-current`                                   |

`src/components/ui/badge.tsx` (shadcn) is the legacy V1 badge; do not use it
in converted screens.

### States

| Primitive                       | Props                                                                                               | Notes                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `UiSkeleton`                    | `className?`                                                                                        | shimmer block on the sunken surface                                                   |
| `UiStatePanel`                  | `kind*: "loading" \| "empty" \| "error"`, `title?`, `body?`, `action?`, `onRetry?`                  | the three non-ready states in one shape                                               |
| `UiEmptyState` / `UiErrorState` | same minus `kind`                                                                                   | prefer these — they say what they are                                                 |
| `UiAlert`                       | `tone?: "info" \| "positive" \| "caution" \| "negative"`, `title?`, `children?`, `icon?`, `action?` | an inline message about the screen you are on; `negative` announces as `role="alert"` |

`UiAlert` is not a toast and not a state replacement. If the screen has no
data, that is `UiEmptyState`; if the fetch failed, `UiErrorState`.

---

## 5. Converting a screen — checklist

1. Frame it: `UiScreen` (+ `UiHeader` if the screen has its own header).
2. Replace every colour with a token. `grep` your file for `bg-white`,
   `text-white`, `#`, `rgb(`, `--fpl-` and `--brand-` — each is a conversion.
3. Replace every size with a ramp step: prose → `ui.text.*`, figures →
   `ui.stat.*`.
4. Replace physical utilities with logical ones; prefix every `tracking-*`
   with `ltr:`.
5. Replace bespoke components with primitives. A sheet is `UiSheet`, a table
   is `UiTable`, an empty block is `UiEmptyState`.
6. Check every control clears 44px and carries `ui.focus`.
7. Check the screen at 390px in FR **and** AR: no horizontal page scroll, no
   element box past the viewport except inside a deliberate `overflow-x-auto`.

## 6. What the contract test enforces

`bun test src/components/ui-kit/` — 98 tests. It fails if the kit:

- uses a physical direction utility or a `deg` gradient angle;
- writes a `tracking-*` without `ltr:`, or a raw `letter-spacing`;
- hardcodes a colour (`#`, `rgb(`, `bg-white`, `text-black`);
- uses `--ui-ink` as a foreground (BG-0083);
- references a `--ui-*` token that is not declared, or declares one that is
  not in the manifest (both directions);
- leaves a colour-bearing token without a dark counterpart — or, for a derived
  token, composes it from anything that is not itself themed;
- lets a `--fpl-*` token carry a value that is not exactly one `--ui-*` token,
  or redeclares one under `.dark`;
- repeats a value inside the type ramp, stat ramp, radius set or spacing
  scale, or lets a density token be a new number instead of an alias;
- drops one of the required primitives, or exports one that the barrel does
  not re-export;
- states a control height as a literal instead of a token;
- spells a Close control in English;
- reaches into `--fpl-*` from the kit;
- lets the shared shell (`AppShell`, `TopBar`, `BottomNav`, `PageBackground`)
  drift off the kit.
