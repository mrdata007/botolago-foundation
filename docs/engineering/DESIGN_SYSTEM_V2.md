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

**Option A "Club colours"** is the current look: a display face (Changa) for
titles and standalone scores, 14px cards, fully round controls, one lifted
shadow, and club colours computed per element by `src/lib/club-palette.ts`.
Everything below describes that look; the Fantasy-flat values it replaced are
gone from the tables.

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
   column. The one exception is a figure that stands ALONE — a score box, the
   Fantasy points number, a rank hero, a kickoff time in a list row — which
   may use `ui.score.*` (Changa). Changa has no tabular figures, so a column of
   figures is never `ui.score.*`: rankings, stats values, prices and points in
   lists stay `ui.stat.*` (see §2.2).
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

Leading: `--ui-leading-flat` 1.4, `-copy` 1.55, `-prose` 1.7, plus the two
display leadings below. Every leading token has an Arabic value in the
`:root:lang(ar)` block (flat 1.95, copy 1.9, prose 2, display 1.95; figure is
restated at 1.1 because score digits are the same Latin glyphs in Arabic —
which is why `ui.score.*` carries digits only, see §2.2).

### 2.1a Display face and display ramp — `ui.display.*`, `ui.font.*`

`--ui-font-display` is **Changa** (Google Fonts, 600/700/800, with an Arabic
subset): `"Changa", "Manrope", …` in French and `"Changa", "Noto Sans
Arabic", …` in Arabic. It is for words that announce — hub and screen titles,
section headings, tab labels, team names in headers — and for standalone
figures (`ui.score.*`). The body stays Manrope / Noto Sans Arabic; Changa is
never the body face (the e2e suite and the contract test both check).

Three facts about Changa, read from its tables, decide how it is used:

- **No `tnum`**, proportional digits → never for a column of figures.
- **No U+2032 prime** → a minute in display type puts the prime in the body
  face: `<bdi>63<span className={ui.font.body}>′</span></bdi>`.
- **800 is its heaviest weight** → no display step uses `--ui-weight-hero`.

| Class token           | Size                        | Weight | Used for                                  |
| --------------------- | --------------------------- | ------ | ----------------------------------------- |
| `ui.display.mega`     | `--ui-display-mega` 112px   | 800    | the goal takeover's one word              |
| `ui.display.hero`     | `--ui-display-hero` 46px    | 800    | "Journée 14", a player's surname          |
| `ui.display.title`    | `--ui-text-hero` 34px       | 800    | hub title (`UiPageTitle`), login heading  |
| `ui.display.section`  | `--ui-display-section` 22px | 800    | section heading ("À venir", "Mes ligues") |
| `ui.display.header`   | `--ui-text-title` 19px      | 800    | screen header title (`UiHeader`)          |
| `ui.display.headerSm` | `--ui-text-subtitle` 16px   | 800    | header title with both flanks occupied    |
| `ui.display.tab`      | `--ui-text-subtitle` 16px   | 600    | tab label (`UiTabs` makes the active 800) |
| `ui.display.teamLg`   | `--ui-display-section` 22px | 700    | team name in the split score header       |
| `ui.display.team`     | `--ui-text-title` 19px      | 700    | team name in a card or hero               |
| `ui.display.teamSm`   | `--ui-text-section` 17px    | 700    | team name on a lineup band                |

Every display step carries `leading-[var(--ui-leading-display)]`: **1.25**
Latin (measured on the page: at 1.15 an accented capital rose 0.6px above the
line box at 19px and 46px and was cut by `truncate`), **1.95** Arabic.
`ui.font.display` and `ui.font.body` set the family alone for a one-off.
Uppercase ("JOURNÉE 14") is a class you add; it does nothing in Arabic, and
tracking stays `ltr:`-only as everywhere.

Changing a display or score size with `cn()` drops the step's leading
(`text-*` and `leading-*` are one group to tailwind-merge) — restate the
leading after the size.

### 2.2 Stat ramp — `ui.stat.*` — and score ramp — `ui.score.*`

**Stat ramp: figures read down a column.** Numerals only. Each step is
tabular, Manrope, has its own weight and an `ltr:`-only tightening of
`--ui-stat-tracking` (-0.01em). The contract test fails if it ever picks up
the display face.

| Token            | Value | Class token          | Used for                         |
| ---------------- | ----- | -------------------- | -------------------------------- |
| `--ui-stat-hero` | 30px  | `ui.stat.hero` (900) | the one number a screen is about |
| `--ui-stat-lg`   | 22px  | `ui.stat.lg` (900)   | summary tiles                    |
| `--ui-stat-md`   | 17px  | `ui.stat.md` (800)   | table totals, row emphasis       |
| `--ui-stat-sm`   | 13px  | `ui.stat.sm` (700)   | dense table cells, picker rows   |

**Score ramp: a figure that stands alone.** Changa numerals, NOT tabular (the
contract test fails a score step that claims `tabular-nums`), on
`--ui-leading-figure` (1.1 in both languages).

| Token             | Value | Class token           | Used for                                  |
| ----------------- | ----- | --------------------- | ----------------------------------------- |
| `--ui-score-hero` | 52px  | `ui.score.hero` (800) | match hero score box, Fantasy card points |
| `--ui-score-lg`   | 40px  | `ui.score.lg` (800)   | live card score, H2H tallies, team points |
| `--ui-score-md`   | 30px  | `ui.score.md` (800)   | match-list card score, rank hero          |
| `--ui-score-sm`   | 24px  | `ui.score.sm` (800)   | compact bar score, summary strip          |
| `--ui-score-row`  | 20px  | `ui.score.row` (700)  | kickoff time / score in a list row        |

**Digits and figure punctuation only** (`0-9`, `:`, `–`, `+`, `.`, a
grouping space). The 1.1 line box is sized for Changa's digits, which are the
same Latin glyphs in both languages (ar-MA formats Latin digits), so Arabic
does not raise it. Arabic letters in Changa do not fit it: measured at 20px
(canvas `TextMetrics` against the laid-out line box, Changa 700), "الثالث"
rises about 2px above the line box and `truncate` cuts it, while "3e",
"20:30" and "63" sit 5px inside. So a unit or an ordinal — "pts", the "e"
of "3e", or their Arabic words — is a sibling span in `ui.text.*` or
`ui.display.*`, which carry each language's own leading:

```tsx
<p className="flex items-baseline gap-1">
  <bdi className={ui.score.md}>{formatRank(rank)}</bdi>
  <span className={cn(ui.text.label, ui.tone.muted)}>{t("…ordinal suffix")}</span>
</p>
```

A score is three flex children — home, separator, away — never the string
"1 – 1". The flex container is a plain element that **inherits the page
direction** (a `div` or a `span`, never a `<bdi>`), and each figure is its
own `<bdi>`:

```tsx
<div
  aria-live={live ? "polite" : undefined}
  className={cn("flex items-center gap-2", ui.score.hero)}
>
  <bdi>{home}</bdi>
  <span aria-hidden>–</span>
  <bdi>{away}</bdi>
</div>
```

The container's direction is what puts home on the right in Arabic, on the
same side as the home half of a split header. A `<bdi>` with no `dir` is
`dir="auto"`, and digits and a dash hold no strong character, so it resolves
to LTR and a `<bdi>` flex row prints home on the LEFT in Arabic — measured in
Chromium under `dir="rtl"`: home at x 8 and away at x 40 in a `<bdi>` row,
home at x 1264 and away at x 1232 in a `div` row. The contract test fails a
`<bdi>` flex container in this document or in the kit.

Rankings (#, J.14, Total), H2H Pts/Diff, stats values including possession,
prices, points in lists, pitch plate points and shirt numbers all stay
`ui.stat.*`. Do not use `ui.text.*` for a figure and do not hand-roll
`tabular-nums`.

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
| `--ui-rule-strong`    | `oklch(0.64 0.02 258)`   | `oklch(0.52 0.02 258)` | a control edge that must be seen, ≥ 3:1 (`ui.rule.strong`) |
| `--ui-scrim`          | ink 45%                  | near-black 68%         | the dim behind a sheet/modal                               |
| `--ui-scorebox`       | `oklch(1 0 0)`           | `oklch(0.93 0.01 250)` | the score plate on a split header (`ui.surface.scorebox`)  |
| `--ui-on-scorebox`    | = `--ui-ink-deep`        | = `--ui-ink-deep`      | its digits: 16.59 / 14.18                                  |

The score box stays light in the dark theme, like the action gradient: it has
to separate from dark club fills either way.

**Foregrounds**

| Token                     | Light                     | Dark                   | Meaning                                                     |
| ------------------------- | ------------------------- | ---------------------- | ----------------------------------------------------------- |
| `--ui-on-surface`         | `oklch(0.16 0.03 260)`    | `oklch(0.97 0.01 250)` | body copy (`ui.tone.default`)                               |
| `--ui-on-surface-muted`   | `oklch(0.45 0.02 258)`    | `oklch(0.76 0.02 258)` | secondary copy (`ui.tone.muted`)                            |
| `--ui-on-surface-faint`   | `oklch(0.555 0.02 258)`   | `oklch(0.64 0.02 258)` | placeholders, disabled (`ui.tone.faint`)                    |
| `--ui-ink-fg`             | `oklch(0.32 0.1 258)`     | `oklch(0.86 0.08 232)` | **brand text/icons** (`ui.tone.ink`)                        |
| `--ui-on-ink`             | `oklch(0.88 0.11 205)`    | same                   | cyan text on an ink fill (`ui.tone.onInk`)                  |
| `--ui-on-ink-plain`       | `oklch(1 0 0)`            | `oklch(0.97 0.01 250)` | plain text on an ink fill (`ui.tone.onInkPlain`)            |
| `--ui-on-ink-muted`       | on-ink-plain 78% into ink | follows it             | the quieter line on ink: 8.37 / 8.25 (`ui.tone.onInkMuted`) |
| `--ui-on-action-positive` | `oklch(0.4 0.1 155)`      | same                   | a gain ON the action gradient (`ui.tone.onActionPositive`)  |
| `--ui-on-grad-header`     | `oklch(0.24 0.09 258)`    | `oklch(0.97 0.01 250)` | text on the header/hero band (`ui.tone.onGradHeader`)       |
| `--ui-on-mesh`            | = `--ui-on-ink-plain`     | follows it             | text on the dark mesh (`ui.tone.onMesh`)                    |
| `--ui-on-mesh-muted`      | it at 78%                 | follows it             | its quieter step (`ui.tone.onMeshMuted`)                    |
| `--ui-on-mesh-faint`      | it at 62%                 | follows it             | its quietest step (`ui.tone.onMeshFaint`)                   |
| `--ui-ink-deep`           | `oklch(0.24 0.09 258)`    | `oklch(0.22 0.07 260)` | text on the **action gradient**; dark scrim fills           |
| `--ui-on-pitch`           | `oklch(0.18 0.04 260)`    | `oklch(0.97 0.01 250)` | labels on the turf                                          |

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

**The dark mesh.** The welcome screen, the splash and the first-launch
language chooser sit on a deep mesh rather than on `--ui-page` (Option A moved
the auth screens to its light register: a photo band over a white sheet). It is a
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

**Elevation** — one set, five steps (`ui.shadow.*`). `--ui-shadow-card` (the
only card shadow), `--ui-shadow-raised` (a bar lifted off content, e.g. the
bottom nav), `--ui-shadow-lifted` (Option A's one raised step: the score box,
a hero card, the primary call to action — `UiButton variant="gradient"`
carries it), `--ui-shadow-overlay` (sheet/modal), `--ui-shadow-column` (the
desktop phone column). There is no second shadow scale; do not reach for
`shadow-lg`, and do not copy the boards' eight hand-written drop shadows.

**Fantasy domain** — promoted into the kit because they have no general
equivalent, but they live under the kit's naming and contract and have dark
counterparts.

| Token                             | Light                                               | Dark                                            |
| --------------------------------- | --------------------------------------------------- | ----------------------------------------------- |
| `--ui-pitch-turf-a`               | spring 45% over the surface (derived)               | follows it                                      |
| `--ui-pitch-turf-b`               | sky 45% over the surface (derived)                  | follows it                                      |
| `--ui-pitch-bench`                | = `--ui-surface`                                    | = `--ui-surface`                                |
| `--ui-pitch-line`                 | white 92%                                           | white 72%                                       |
| `--ui-plate-figure`               | = `--ui-ink-deep`                                   | `oklch(0.36 0.09 260)`                          |
| `--ui-lineup-turf-a` / `-b`       | `oklch(0.536 0.129 153)` / `oklch(0.502 0.122 152)` | `oklch(0.42 0.1 150)` / `oklch(0.39 0.095 150)` |
| `--ui-fdr-1` … `--ui-fdr-5`       | green → grey → pink → deep magenta                  | deepened per step                               |
| `--ui-on-fdr-1` … `--ui-on-fdr-5` | the foreground that clears AA on that step          | ditto                                           |

`--ui-plate-figure` is the `UiPlayerPlate` figure band (points, price,
fixture) under the surface name band, with `--ui-on-ink-plain` on it: 16.59:1
light, 10.05:1 dark. It is not ink-deep in dark because ink-deep there has
the dark surface's lightness (1.00:1) and the two bands read as one slab;
the dark value sits ΔEok 15 from the surface.

The Fantasy turf is Option A's pastel: `UiPitchSurface` runs it `to bottom`
from turf-a to turf-b under 36px bands of white at 22%. It is derived from the
action-gradient stops, so the dark turf needs no second copy. The **lineup**
turf is the match Compos pitch: a real green, because player names sit on it
directly in `--ui-on-ink-plain` (4.84 / 5.61 light, 7.41 / 8.44 dark, no
text-shadow).

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
tint and uses `--ui-live-fg` — or, in Option A, on the navy `UiLivePill`
(white on ink, 12.81 / 12.60; the dot 3.16 / 4.19 against the ink).

### 2.3a Club colour — `--ui-club*`, `clubStyle()`, `ui.club.*`, `ui.edge.*`

A club's colour never enters the kit as a literal. `src/lib/club-palette.ts`
is the one source, and a screen uses it in exactly one way:

```tsx
import { clubStyle, clubMatchPalettes } from "@/lib/club-palette";

const { home, away } = clubMatchPalettes(match.homeClub, match.awayClub);
<div {...clubStyle(home)} className={cn(ui.club.fill, "flex-1")}>…</div>
<div {...clubStyle(away)} className={cn(ui.club.fill, "flex-1")}>…</div>
```

`clubStyle(club | palette)` returns `{ "data-club": "", style }`: twelve inline
custom properties, `--club-{fill,on,edge,fg,tint,band}-{l,d}`, a light and a dark
answer each. The `[data-club]` layer in `styles.css` maps the current theme's
answer onto six kit tokens on that element, and children inherit them:

| Token            | Default (no club)     | Meaning                                                                                                                              |
| ---------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `--ui-club`      | `--ui-ink`            | the fill: a header half, a crest disc, a bar (`ui.club.fill`/`fillOnly`)                                                             |
| `--ui-on-club`   | `--ui-on-ink-plain`   | text on the fill, ≥ 4.5:1, chosen per theme (`ui.tone.onClub`)                                                                       |
| `--ui-club-edge` | `--ui-ink-fg`         | a 4px edge bar or ring, ≥ 3:1 on the surface (`ui.edge.*`, `ui.club.ring`, `ui.club.edgeFill`)                                       |
| `--ui-club-fg`   | `--ui-ink-fg`         | the club colour as TEXT, ≥ 4.5:1 on the surface and the tint; `--ui-on-surface` in dark (`ui.tone.club`)                             |
| `--ui-club-tint` | `--ui-surface-sunken` | a quiet wash behind an icon disc or a quote (`ui.club.tint`)                                                                         |
| `--ui-club-band` | `--ui-on-ink-plain`   | the `club-stripes` band (`ui.club.stripes`): the text colour the block does NOT use, so the texture never takes its text under 4.5:1 |

**The rule the palette applies** (every value measured, WCAG 2):

- **Source**: a real `#rrggbb` `primaryColor` from data → the kit table in
  `src/lib/kits.ts` (by id, then slug, then a name fragment) → the ink.
  Production has no club colours in the database (BG-0112), so the kit table
  is what renders; `var(--ui-ink)` in the data is not a colour and is skipped.
- **Fill + text, light**: white if white clears 4.5:1; else the smallest OKLab
  step (≤ 15%) toward `--ui-ink-deep` that gets white there (Raja +5%,
  Berkane +6%, Hassania +5%); else the untouched colour with ink-deep text
  (FUS orange 6.83, a yellow kit 11.59, a white kit 16.59).
- **Fill + text, dark**: the light fill mixed 85% into the dark `--ui-page`,
  and the text decided again — FUS keeps ink-deep (white would be 3.09), and
  Berkane's production orange flips from ink-deep in light to white in dark.
- **Edge**: the fill, darkened toward ink-deep (light) or lifted toward
  `--ui-on-surface` (dark) in 1% steps until it clears 3:1 on the surface
  (FUS light +12%, AS FAR dark +25%).
- **Club colour as text**: allowed in light when a ≤ 15% step clears 4.5:1 on
  both the surface and the tint; never in dark — `--ui-on-surface` there.
- **Tint**: 8% of the club over the surface (14% in dark).
- **Headroom**: every choice is made at threshold + 0.02, because a
  rasterised swatch can land one 8-bit step off the arithmetic.
- **Home/away clash** (`clubMatchPalettes`): the test is run on the fills
  the page PAINTS, in both themes — not on the club hexes, because the light
  fill may be darkened for white text and the dark fill is mixed into the
  dark page, which pulls colours together (Berkane #e63946 and Tétouan
  #c00000 are 10.8 apart as hexes but paint 8.9 apart in light and 7.5 in
  dark). When the two fills are within ΔEok 10 in EITHER theme
  (Wydad–Tétouan 3.4 / 2.9, Berkane–Hassania 4.4 / 3.8, Maghreb Fès–DCHE
  10.9 / 9.2), home keeps its colour and away takes its own second colour if
  that clears 10 in both themes, else the ink, else a neutral slate. A split
  header, a stat bar or an H2H bar must use the pair, never two independent
  `clubStyle(club)` calls — and a crest on the away side takes the pair's
  palette too (`<ClubCrest club={…} palette={away} />`).

`club-palette.test.ts` sweeps every kit-table colour through all of this in
both themes, and parses `styles.css` so the token values the palette measures
against cannot drift from the page.

**Edge bars are logical.** The boards drew club edges as
`box-shadow: inset 4px 0 0 <club>` — a physical x offset that stays on the
left in Arabic. Use `ui.edge.start` / `ui.edge.end` (a 4px `border-s`/
`border-e` in `--ui-club-edge`, which tapers into a card's rounded corners
exactly as the inset shadow did), `ui.edge.blockEnd` for a tile's base, or
`ui.edge.bar` as a free-standing 4px flex/grid child. A shadow may only
offset on the block axis (`inset 0 -4px 0`); the contract test fails any kit
shadow with a non-zero x offset.

**Stripes.** `club-stripes` (`ui.club.stripes`) is the diagonal texture on a
club block: 14px bands of the on-ink foreground at `--stripe-alpha` (default
7%) at `--stripe-angle`, which is `-45deg` and flips to `45deg` under
`dir="rtl"`. It sets only `background-image`, so pair it with a background
colour.

**Crests.** A crest is a disc (`ui.radius.full`): with a badge image, the
image on a light disc — `ui.surface.scorebox` stays light in the dark theme
too, which is what a badge drawn for white needs; without one, `ui.club.fill`
with the monogram. Add `ui.club.ring` so a white or yellow kit stays a shape
on a white card (on most clubs the edge IS the fill and the ring is
invisible). On a club block, `ui.club.inverse` is the surface disc with the
club colour as its text.

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

Radius set — seven steps, no others:

| Token                 | Value | Class token         | Used for                                                                          |
| --------------------- | ----- | ------------------- | --------------------------------------------------------------------------------- |
| `--ui-radius-tight`   | 4px   | `ui.radius.tight`   | FDR squares, micro tags, form chips                                               |
| `--ui-radius-control` | 6px   | `ui.radius.control` | alerts, skeletons, menu rows, banners                                             |
| `--ui-radius-segment` | 8px   | `ui.radius.segment` | the selected track segment, player plates                                         |
| `--ui-radius-track`   | 10px  | `ui.radius.track`   | segmented track, inputs, selects, thumbnails                                      |
| `--ui-radius-card`    | 14px  | `ui.radius.card`    | **`UiCard` / `ui.surface.card`**, list groups, event cards                        |
| `--ui-radius-sheet`   | 16px  | `ui.radius.sheet`   | bottom sheet, modal, **feature surfaces**: score header, Fantasy card, hero cards |
| `--ui-radius-column`  | 28px  | —                   | the desktop phone column                                                          |

Plus `ui.radius.full` for a circle/pill — **every control a thumb presses**
in Option A: `UiButton`/`UiLinkButton`, `UiChip`, `UiPill`, `UiIconButton`,
`UiBackButton`, the nav pill, badges and crest discs. Card is 14 rather than a
second 16: the contract test rejects a repeated value in the set, and writing
`1rem` to dodge it would break the one-scale rule it enforces. Do not reach
for `rounded-lg` (the legacy `--radius`) for a card.

### 2.5 Other class tokens

- `ui.focus` — the one focus ring, drawn in `--ui-ink-fg` so it is visible in
  both themes. Put it on every interactive element you build.
- `ui.safe.top` / `ui.safe.bottom` — safe-area padding.
- `ui.rule.block` / `.blockStart` / `.inline` / `.all` — hairline dividers on
  logical edges; `ui.rule.strong` — a ≥ 3:1 control boundary.
- `ui.shadow.card` / `.raised` / `.lifted` / `.overlay` — the elevation set.
- `ui.surface.scorebox` — the light score plate (`--ui-scorebox` +
  `--ui-on-scorebox`).
- `ui.tone.onInkMuted`, `ui.tone.onActionPositive`, `ui.tone.onClub`,
  `ui.tone.club` — see §2.3 and §2.3a.
- `ui.font.display` / `ui.font.body`, `ui.display.*`, `ui.score.*` — §2.1a,
  §2.2.
- `ui.club.*` (`fill`, `fillOnly`, `edgeFill`, `tint`, `ring`, `inverse`,
  `stripes`) and `ui.edge.*` (`start`, `end`, `blockEnd`, `bar`) — §2.3a.

### 2.6 Motion

Motion is calm and quick, and it explains a change rather than decorating the
page — the approach taken from a study of premierleague.com. Content never
waits on an animation to appear.

Every duration and easing comes from the tokens in `src/styles.css`:

| Token              | Value | Use                                                 |
| ------------------ | ----- | --------------------------------------------------- |
| `--duration-tap`   | 120ms | press feedback                                      |
| `--duration-quick` | 180ms | colour changes, tab-panel fade                      |
| `--duration-route` | 260ms | route changes (no animated route change today)      |
| `--duration-sheet` | 320ms | sheets, expand/collapse, the live strip, card hover |
| `--duration-hero`  | 420ms | a live match event arriving                         |

Easing: `--ease-standard` unless there is a reason not to.

Named pieces, in `styles.css`:

- `live-breathe` — the live dot fades in and out, 1.5s a cycle. It replaced an
  expanding "ping" ring, which read as an alarm.
- `event-enter` — a match event that arrives while the page is open fades in
  and opens to its own height. Its one child must be `min-h-0 overflow-hidden`.
- `--livestrip-h` — how much of the live strip (`LiveStrip`) is showing: 0
  unless the strip sets `data-live-strip="shown"` on the root. A sticky bar
  under the top bar uses `top-[calc(var(--topbar-h)+var(--livestrip-h))]` so
  it sits beneath the strip and moves up with it.

Reduced motion is handled once, globally: the `prefers-reduced-motion` block
cuts every animation and transition to nothing and resets animation delays,
so nothing is ever held back. Loops (`.shimmer`, `.mesh-drift`,
`.live-breathe`) are switched off by name. Do not stagger content with
per-item delays.

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

| Primitive       | Props                                                                                                                                                            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `UiScreen`      | `children*`, `width?: "column" \| "content" \| "wide"`, `bottomNav?`, `raised?`, `className?`                                                                    | the page canvas; `column` is the 480px phone column                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `UiHeader`      | `title?`, `kicker?`, `backTo?`, `onBack?`, `showBack?`, `leading?`, `trailing?`, `children?`, `tone?: "gradient" \| "ink" \| "surface"`, `sticky?`, `className?` | `[back] — centred kicker + title — [trailing]` on a 1fr/auto/1fr grid. The back control is `UiBackButton` (glass on `ink`); the title is `ui.display.header` (Changa 19/800, `headerSm` 16 when both flanks are used) and the page's `<h1>`; `kicker` is label type above it. `trailing` holds one or two `UiIconButton`s. Omit `title` only when the kicker labels the bar and the page has its own `<h1>`. The title is centred whenever it fits between two flanks as wide as the wider one; a longer title slides toward the end rather than truncating (at 390px beside the "Retour" pill that slot is ~140px in French), so keep header titles short and put the context in `kicker` |
| `UiPageTitle`   | `title*`, `trailing?`, `children?`, `as?: "h1" \| "h2"`, `width?: "content" \| "column"`, `className?`                                                           | the hub title band (Matches, Actualités, Fantasy, Profil): white band, `ui.display.title` h1, an inline-end control (the season picker: `UiButton variant="soft" size="sm"`), `children` under it (a chip row, a tablist). Full-bleed: render it outside `UiScreen`; on a wide screen its padding lines the title up with the column underneath (`width`, default `content` = every `AppShell` page)                                                                                                                                                                                                                                                                                       |
| `UiCard`        | `children*`, `as?`, `padding?: "none" \| "sm" \| "md" \| "lg"`, `interactive?`, `className?`                                                                     | opaque, 14px (`--ui-radius-card`), one shadow, no glass; a feature surface adds `ui.radius.sheet`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `UiDivider`     | `className?`                                                                                                                                                     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `UiBanner`      | `children*`, `className?`                                                                                                                                        | full-bleed ink strip, one emphatic line                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `UiKeyValueRow` | `label*`, `value*`, `className?`                                                                                                                                 |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### Controls

| Primitive          | Props                                                                                                                                                                            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UiButton`         | all `<button>` props + `variant?: "gradient" \| "ink" \| "light" \| "soft" \| "outline" \| "ghost" \| "destructive"`, `size?: "sm" \| "md"`, `tone?: "onSurface" \| "onMesh"`    | fully round. `md` is full-width at `--ui-row-min`; `sm` is inline at `--ui-tap-min` and never wraps its label (a two-line pill is a circle with the words outside it) — give a growing `sm` button `flex-auto`, not `flex-1`, whose zero basis squeezes it below its label. `gradient` (the primary CTA) carries `--ui-shadow-lifted`; `soft` is the sunken pill for a quiet control                                                                                                                 |
| `UiLinkButton`     | same + `to*`, `params?`, `search?`                                                                                                                                               | router `Link` in button clothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `UiIconButton`     | all `<button>` props + `aria-label*`, `children*` (the icon), `variant?: "soft" \| "glass" \| "ink" \| "ghost"`, `ref?`                                                          | a round 44px control. `soft` = sunken disc, brand icon (top bar, headers); `glass` = a 16% wash of `--ui-on-club` with on-club icon (club blocks, photos — legible on FUS orange too); `ink` = navy disc; `ghost` = no fill. `aria-label` is required by the type. Works as a Radix `asChild` trigger                                                                                                                                                                                                |
| `UiIconLinkButton` | same as `UiIconButton` + `to*`, `params?`, `search?`                                                                                                                             | the link form                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `UiBackButton`     | `to?`, `onClick?`, `label?`, `tone?: "soft" \| "glass"`, `iconOnly?`, `className?`                                                                                               | the soft back pill: arrow + `t("fpl.back")`. A link with `to`, else a button (router history when there is no `onClick`). The arrow is mirrored by `styles.css` — never add `rtl:rotate-180`. `iconOnly` keeps the name for screen readers                                                                                                                                                                                                                                                           |
| `UiTabs<T>`        | `value*`, `onChange*`, `options*: {value,label,disabled?,panelId?}[]`, `label*`, `accent?`, `idBase?`, `className?`                                                              | underline tabs (match tabs, rankings tabs): equal columns on the bar, Changa labels (600 muted / 800 active), a 4px block-end indicator in `accent` (default `var(--ui-ink-fg)`; the match page passes `var(--ui-club-edge)` under the home club's `clubStyle`). Roving tabindex; ArrowLeft/Right follow the reading direction, Home/End jump; a key with Alt/Ctrl/Meta is left to the browser (Alt+ArrowLeft is Back). At 390px four tabs leave ~81px a label: use short labels ("Stats", "Compos") |
| `UiSegmented<T>`   | `value*`, `onChange*`, `options*: {value,label,disabled?}[]`, `tone?: "onSurface" \| "onGradient"`, `size?: "md" \| "lg"`, `variant?: "track" \| "pill"`, `label?`, `className?` | `md` (default) = 44px at the meta size and fits four French labels at 390px; `lg` = 48px at body size. `variant="pill"` is the Option A toggle ("Terrain \| Liste"): a white rounded-full track, the chosen side a navy pill                                                                                                                                                                                                                                                                         |
| `UiChip`           | all `<button>` props + `children*`, `selected?`, `ref?`, `aria-current?`                                                                                                         | interactive filter/day chip, fully round, `px-3` with `gap-1.5` between its children (give an icon or crest inside it no margin of its own); unselected sunken in the default text colour, selected navy with white (`ui.surface.inkPlain`). Give `aria-current` for "this is the current one" and it drops `aria-pressed`                                                                                                                                                                           |
| `UiInput`          | all `<input>` props + `label?`, `hint?`, `error?`, `reserveError?`, `leading?`, `trailing?`, `fieldClassName?`, `ref?`                                                           | renders and wires its own `<label>`; `error` sets `aria-invalid`, announces as `role="alert"`, and is ADDED to any `aria-describedby` you pass rather than replacing it. `leading` / `trailing` are adornment slots inside the box on the inline-start / -end edge                                                                                                                                                                                                                                   |
| `UiSelect`         | all `<select>` props + `label?`, `hint?`, `error?`, `reserveError?`, `options?: {value,label,disabled?}[]`, `placeholder?`, `ref?`                                               | native `<select>` — already localised, already keyboard-correct, opens the platform picker                                                                                                                                                                                                                                                                                                                                                                                                           |

`UiTextarea` is the same frame with a `<textarea>` in the box: same props
minus `trailing`, since a control pinned to the inline-end edge of a
fourteen-row writing surface has nothing to align to.

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

| Primitive             | Props                                                                                              | Notes                                                                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UiTable`             | `children*`, `caption?`, `captionHidden?`, `tableClassName?`                                       | wrapper + `<table>`; scrolls horizontally instead of pushing the page                                                                                                                                    |
| `UiTHead` / `UiTBody` | `children*`, `className?`                                                                          | head sits on `ui.surface.sunken`                                                                                                                                                                         |
| `UiTR`                | `children*`, `highlighted?`, `onClick?`                                                            | `highlighted` = "this row is you"                                                                                                                                                                        |
| `UiTH`                | `<th>` props + `numeric?`                                                                          | `numeric` aligns to the inline-end edge                                                                                                                                                                  |
| `UiTD`                | `<td>` props + `numeric?`, `strong?`                                                               | `numeric` also switches to `ui.stat.sm` (tabular)                                                                                                                                                        |
| `UiRankMovement`      | `rank*`, `previousRank*`, `labels*: {up,down,same}`, `variant?: "disc" \| "quiet"`, `formatDelta?` | glyph **and** accessible name; you pass translated labels. `quiet` is the Option A table cell: a small ▲/▼ and the places moved in the positive/negative text colour on `ui.stat.sm`, "=" when unchanged |
| `UiLivePill`          | `minute?: number \| string`, `label?`, `size?: "sm" \| "md"`, `className?`                         | the navy live pill: breathing `--ui-live` dot, `t("matches.status.live")` (never "LIVE"), the minute in `<bdi>` with its prime. Not a live region — the score is                                         |
| `UiStatBlock`         | `value*`, `label?`, `sub?`, `size?: "sm" \| "md" \| "lg" \| "hero"`, `tone?`, `align?`             | a number and what it means                                                                                                                                                                               |

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

| Primitive          | Props                                                                                                                             | Notes                                                                                                                                                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UiPlayerPlate`    | `name*`, `visual?`, `sub?`, `badge?`, `flag?`, `state?: "default" \| "selected" \| "doubtful" \| "out"`, `onClick?`, `ariaLabel?` | the pitch's core unit: shirt, then one rounded plate — the name on the surface, the sub (price / fixture / points) on `--ui-plate-figure` (ink-deep in light) with white. A `<button>` only when `onClick` is given, so an empty slot is not a fake control |
| `UiPlayerRow`      | `name*`, `meta?`, `visual?`, `stats?: {key,value,label?}[]`, `trailing?`, `selected?`, `disabled?`, `onClick?`                    | the list/picker unit; the figures are `ui.stat.sm`, so a picker scans like a table                                                                                                                                                                          |
| `UiPitchSurface`   | `rows*: ReactNode[][]`, `bench?`, `benchLabels?`, `benchHighlighted?`                                                             | the pastel turf (§2.3), markings and slot geometry only — it knows nothing about formations, squad rules or substitutions. `rows` is GK → DEF → MID → FWD. The bench is a surface strip with muted uppercase labels                                         |
| `UiDifficultyCell` | `difficulty*: 1\|2\|3\|4\|5`, `children*`, `title?`                                                                               | FDR square with the matching foreground                                                                                                                                                                                                                     |

`UiPitchSurface` takes already-rendered nodes, so squad logic stays in the
screen: build `UiPlayerPlate`s from your own data and hand them over.

### Badge / Chip / Pill — which one

There were five overlapping variants. Reconciled:

| Use                                                | Primitive                                                                                                              |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| a static emphatic label ("Journée 14", "Gardiens") | `UiPill` — `tone: "ink" \| "action" \| "sunken"`, fully round; `ink` is white on navy                                  |
| a match in progress                                | `UiLivePill`                                                                                                           |
| a status token in a row or card ("ACTIF", "+3")    | `UiBadge` — `tone: "neutral" \| "outline" \| "action" \| "positive" \| "negative" \| "caution"`, label type, uppercase |
| something the user taps to filter/select           | `UiChip` — interactive, 44px, `selected` or `aria-current`                                                             |

`src/components/ui/badge.tsx` (shadcn) is the legacy V1 badge; do not use it
in converted screens.

Two tones worth naming, because both were being reached for wrongly.
`outline` is a state that must NOT read as spent — `neutral` sits on the
sunken surface, which is how this product draws "used up". And `caution` is
the one status colour that can only ever be a fill: `--ui-caution` measured
1.78:1 as text, so the tone paints the amber and puts `--ui-on-caution` on
it. A pending approval mapped onto `negative` reads as a failure; onto
`neutral` it reads as already dealt with.

### States

| Primitive                       | Props                                                                                                                            | Notes                                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `UiSkeleton`                    | `className?`                                                                                                                     | shimmer block on the sunken surface                                                   |
| `UiStatePanel`                  | `kind*: "loading" \| "empty" \| "error"`, `title?`, `body?`, `action?`, `onRetry?`                                               | the three non-ready states in one shape                                               |
| `UiEmptyState` / `UiErrorState` | same minus `kind`                                                                                                                | prefer these — they say what they are                                                 |
| `UiAlert`                       | `tone?: "info" \| "positive" \| "caution" \| "negative"`, `title?`, `children?`, `icon?`, `action?`, `role?`, `live?`, `testId?` | an inline message about the screen you are on; `negative` announces as `role="alert"` |

`UiAlert` derives its role from its tone, which is the right default and the
wrong answer twice. Pass `role="alert"` when the message is urgent whatever
colour it is — "the revocation worker has not run" is an alert in amber. And
pass `live={false}` for an alert inside a LIST: five alerts is five
simultaneous live regions handing a screen reader five interruptions for one
screen, so the list carries one region, or none, and the items opt out.

`testId` renders `data-testid`, and `UiCard`, `UiSkeleton`, `UiStatePanel`,
`UiEmptyState` and `UiErrorState` take it too. Without it, converting a named
state block meant losing its hook or wrapping it in a spare `div` to carry
one.

`UiAlert` is not a toast and not a state replacement. If the screen has no
data, that is `UiEmptyState`; if the fetch failed, `UiErrorState`.

### Shell and shared blocks (Option A, outside the kit)

These live outside `ui-kit` and are built only from it. They are pinned by
`src/components/shell/shell.option-a.test.tsx` and
`src/components/common/ClubCrest.test.tsx`.

- **`AppShell`** (`src/components/shell`): `topBar?` replaces the global bar
  for a detail screen whose first row is its own `UiHeader`; `pageHeader?`
  is a full-bleed band under the bar and outside the content gutter, for a
  hub's `UiPageTitle`. `--topbar-h` still describes the global bar only.
- **`TopBar`**: the opaque bar with a hairline and no shadow, the wordmark
  (`Logo size="sm"`) at the start, round 44px soft buttons at the end (the
  language trigger is `UiIconButton` showing "FR" / "ع"). The desktop links
  are round and the active one is `ui.surface.inkPlain`. No notifications
  bell until there is an inbox for it to open.
- **`BottomNav`**: the action-gradient pill (32×56) behind the active icon,
  with the icon in `--ui-ink-deep`. The pill is about 1.3:1 against the bar,
  so the active label's weight and colour and `aria-current="page"` stay
  the state cue. Items are `flex-1`: 4 with News off, 5 with it on.
- **`PageBackground`**: flat `--ui-page` for every route family. The
  per-route `--ui-wash-*` tint is retired, so those tokens are unused. `auth`
  still paints the dark mesh for Welcome.
- **`ClubCrest`** (`src/components/common`): a disc coloured by
  `clubStyle()`. Tone `solid` (default) is the club fill with its measured
  foreground and an inner edge ring. Tone `inverse` is a surface disc with
  `--ui-club-fg` letters and the lifted shadow, for a crest on a club block.
  A badge image sits on a `--ui-scorebox` plate, which stays light in dark.
  Sizes: `xs` 28, `sm` 32, `md` 40 (default), `lg` 56. The crest sets
  `data-club` on its own root, so an ancestor's `clubStyle` does not reach it:
  where both sides of a fixture show, pass the side's resolved palette —
  `palette={clubMatchPalettes(home, away).away}` — or the away crest keeps the
  clashing colour the rule re-coloured everywhere else.
- **`LiveIndicator`**: a prop-compatible wrapper over `UiLivePill`.
- **`LiveStrip`** (`src/components/matches`): each live match is a 44px navy
  pill (`ui.surface.inkPlain`): the two clubs' `ClubCrest` `xs` discs side by
  side (colours from `clubMatchPalettes`, passed as `palette`), the codes,
  the score in `ui.score.row` as three flex children, the breathing dot and
  the minute. The boards overlap bare colour dots; a real disc carries a
  monogram or a badge, which an overlap hides. Live matches only: the boards'
  next-kickoff chip would keep the strip and `--livestrip-h` up with nothing
  live.
- **`SectionHeader`**: the title is `ui.display.section`. `action` shares
  the title's line. `SectionHeaderLink` is the 44px "Tout voir" to put there,
  and `SectionGroupHeader` is a muted uppercase group label with a count.
  `Section` spaces sections at 20px on a phone and 32px from `sm`.
- **`States`** (`LoadingState`, `EmptyState`, `ErrorState`, `OfflineBanner`):
  the 14px card radius, filled panels with no dashed outline, and the glyph
  in a round disc.

---

## 5. Converting a screen — checklist

1. Frame it: `UiScreen` (+ `UiHeader` if the screen has its own header).
2. Replace every colour with a token. `grep` your file for `bg-white`,
   `text-white`, `#`, `rgb(`, `--fpl-` and `--brand-` — each is a conversion.
3. Replace every size with a ramp step: prose → `ui.text.*`, titles and
   headings → `ui.display.*`, figures in a column → `ui.stat.*`, a standalone
   figure → `ui.score.*`. The boards' off-ramp sizes (8.5–14.5px) snap to the
   nearest step; their sub-1.2 line-heights are never copied.
4. Replace physical utilities with logical ones; prefix every `tracking-*`
   with `ltr:`. A board's `inset ±4px 0 0` edge is `ui.edge.*`, a `-45deg`
   stripe is `club-stripes`, a `to right` scrim is `to bottom`, `left:50%` +
   `translateX(-50%)` is `inset-x-0 mx-auto`.
5. A club colour comes from `clubStyle()` / `clubMatchPalettes()` and is read
   through `--ui-club*` — never a hex, never `club.primaryColor` directly.
   Render a field only if the data exists; the boards show data the app does
   not have.
6. Replace bespoke components with primitives. A sheet is `UiSheet`, a table
   is `UiTable`, an empty block is `UiEmptyState`, a round icon control is
   `UiIconButton`, section tabs are `UiTabs`, a live badge is `UiLivePill`.
7. Check every control clears 44px and carries `ui.focus`.
8. Check the screen at 390px in FR **and** AR: no horizontal page scroll, no
   element box past the viewport except inside a deliberate `overflow-x-auto`.

## 6. What the contract test enforces

`bun test src/components/ui-kit/` — 175 tests: the contract, plus
`tabs-keyboard.test.ts` for the `UiTabs` roving focus (arrows flipped under
RTL, wrap-around, disabled tabs skipped, the tab-stop fallback, modified keys
left to the browser) and its `${idBase}-tab-${value}` markup. It fails if the
kit:

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
- repeats a value inside the type, stat, display or score ramp, the radius
  set or the spacing scale, or lets a density token be a new number instead
  of an alias;
- lets a `ui.stat.*` step pick up the display face or drop `fpl-tabular`;
  lets a `ui.display.*` / `ui.score.*` step leave Changa or its own leading,
  claim tabular figures, or use the 900 weight Changa does not have;
- shows a `<bdi>` as a score's flex container, in this document, in
  `styles.css` or in a kit file (§2.2);
- leaves `--ui-leading-display`, `--ui-leading-figure`, `--ui-font-display` or
  `--ui-font-body` without an Arabic value, lets `--ui-font-body` drift from
  the body's stack, or declares Changa anywhere but `--ui-font-display`;
- draws `ui.surface.card` on anything but `--ui-radius-card`, or a button,
  chip or pill on anything but `ui.radius.full`;
- leaves a club token unthemed, or the `[data-club]` layer without a light
  and a dark mapping for each;
- draws a shadow with a physical x offset (the boards' `inset 4px 0 0` edge);
- states the `club-stripes` angle anywhere but the `--stripe-angle` property
  that flips under `dir="rtl"`;
- drops one of the required primitives, or exports one that the barrel does
  not re-export;
- states a control height as a literal instead of a token;
- spells a Close control in English;
- reaches into `--fpl-*` from the kit;
- lets the shared shell (`AppShell`, `TopBar`, `BottomNav`, `PageBackground`)
  drift off the kit.
