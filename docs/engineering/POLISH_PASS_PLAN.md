# Premium polish pass — token audit and execution plan

Scope is finish quality only: typography, spacing, colour precision, surfaces and
depth, the pitch, player cards, icons, motion, states, RTL parity, pixel
alignment. No new screens, features, navigation, information architecture, copy,
data, routes or RPCs. Anything needing one of those is logged, not done.

## Sequencing: this starts after the in-flight lanes land

Four lanes are editing the kit's consumers right now — the Fantasy shell and
hub, the squad builder and picker, leagues and player screens, and a
seven-item defect batch. The pass is specified token → component → screen, and
"most fixes should land in tokens and the kit, not in route files". Those two
facts are in direct tension while the lanes run: consolidating six radii into
two, or changing the body weight, re-renders every screen four agents are
currently converting, and every one of their diffs would conflict.

So the token work is staged behind them rather than started now. The cost is
waiting; the cost of not waiting is four lanes rebasing onto shifting tokens and
a merge nobody can review. The screenshot baseline is also deliberately deferred
— a `before/` captured now would be stale by the time polish begins and would
misattribute the lanes' changes to this pass.

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

**Gap A — no line-height and no letter-spacing tokens exist at all.** There is no
`--ui-leading-*` and no `--ui-track-*` family. The standard requires each step to
carry size, line-height, weight and letter-spacing; today it carries size and a
weight chosen per component. Heading tightening (−0.01 to −0.02em) and label
loosening (+0.04 to +0.08em) therefore have nowhere to live.

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

### 8. Motion — thin

`prefers-reduced-motion` appears **once** in the entire stylesheet. The standard
requires it to govern every entrance, press and page-mount animation. Duration
tokens (120ms press, 150–250ms entrance) do not exist.

### 9. Designed states — already built

`UiStatePanel`, `UiEmptyState`, `UiErrorState`, `UiSkeleton` all exist from
BG-0091. The work is adoption, not construction.

### 10. RTL — strong, with one real gap

Physical-direction utilities are at **zero** across all of `src/`, and Arabic
letter-spacing was neutralised in BG-0069. The gap is the one the standard names
explicitly: **no Arabic-specific size or line-height adjustment exists.** The
Arabic face's x-height differs from the Latin one, so equal `px` does not mean
equal visual weight. This needs a token pair applied under `:lang(ar)` /
`[dir="rtl"]`, roughly +1px body size and +0.1 line-height, verified by
measurement rather than by eye.

**Tabular figures** are near-absent: two occurrences in the stylesheet, one of
which is a comment. `UiTable`'s `numeric` cells set it, nothing else does. Every
points, price and rank column in the product needs it.

## Order of work, once unblocked

1. **Tokens** — the type scale (line-height, tracking, a normal weight), the
   radius consolidation, one shadow, the raised surface, motion durations, the
   Arabic size/line-height pair, tabular figures as a token.
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
