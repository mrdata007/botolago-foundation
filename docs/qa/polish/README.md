# Polish pass — measured before/after

Evidence for BG-0113 and for the integration fixes that precede it. Every entry
states what was measured, with what, and at which viewport, so a reader can
re-run it rather than take the screenshot's word for it.

Measurements are taken against a dev server this session started on its own
port — **never 4173**. That port is shared with other worktrees in this
sandbox, and a Playwright run that reuses an existing server there measures a
different tree entirely. That has already produced one false failure in this
project (`docs/engineering/LAUNCH_LEDGER.yaml`, BG-0091 notes).

The language chooser is a full-screen dialog on first load and will be the
`[role="dialog"]` any naive selector finds. Set `botolago.language` in
`localStorage` via an init script before navigating, or you will measure the
chooser and believe it is the sheet.

---

## `UiSheet` width — the sheet did not follow the column

**When** 2026-09-21, integrating lane BG-0118 (shell/hub) into
`chief/launch-fixes-3`.

**What changed upstream.** BG-0118 moved `FantasyFrame` off the 480px
`--ui-column-max` phone canvas onto `max-w-2xl` (672px), the same rule
`UiScreen width="content"` uses and the one Home, Matches, Standings and
Profile have used since the shell migration. That fixed the owner's desktop
complaint. `UiSheet` stayed pinned to `--ui-column-max`, deliberately, on the
reasoning that a bottom sheet should stay thumb-width.

**Why that reasoning inverts.** The 480px cap has no effect below 672px — the
sheet is already full-bleed on every phone. The only place it showed was
desktop, where thumb reach is not a constraint and a 480px sheet centred under
a 672px screen reads as a mistake. It is also where the picker's price and form
columns have room to come back.

**Measured**, `/fantasy/transfers` → "Ajouter un joueur", bounding boxes read
from the live DOM rather than from the screenshot:

| viewport | frame | sheet before | sheet after                      |
| -------- | ----- | ------------ | -------------------------------- |
| 390px    | 390px | 390px @x=0   | 390px @x=0 — unchanged           |
| 1440px   | 672px | 480px @x=480 | 672px @x=384 — matches the frame |

At 1440 the sheet now sits at x=384 with 384px of gutter on both sides, so it
is centred on the same axis as the column rather than inset within it. Phones
are untouched, which is the point: this was only ever a desktop defect.

![before](sheet-width-1440-before.png)
![after](sheet-width-1440-after.png)

`ui-kit.contract.test.ts` 98 pass / 0 fail.

---

## BG-0124 — the type ramp had no leading, and it was cutting glyphs

**When** 2026-09-21, the first item of the polish pass proper.

**What was wrong.** `ui.text.micro` and the whole stat ramp carried
`leading-none`: a line box exactly the font size. No font's ink fits inside
its own em, so the line box was always too short. That is invisible until
something hides the overflow — and `truncate` does, because it sets
`overflow: hidden` to get a horizontal ellipsis and clips the vertical axis as
a side effect. CSS gives no way out of that pairing: set `overflow-x: hidden`
and `overflow-y` computes to `auto`, never `visible`. The only fix is
vertical room.

**Measured from the font's own metrics** (canvas `TextMetrics`, on the live
bottom nav at 390px — the most-seen element in the product):

|                         | line box | ink extent | cut                                      |
| ----------------------- | -------- | ---------- | ---------------------------------------- |
| **before** fr "Fantasy" | 0 … 11   | 2 … 13     | 2px of descender                         |
| **before** ar "فانتازي" | 0 … 11   | −1 … 15    | 1px top + 4px bottom, **31% of the ink** |
| **after** fr            | 0 … 15   | 4.2 … 15.2 | none                                     |
| **after** ar            | 0 … 21   | 4.2 … 20.2 | none                                     |

**The fix.** `--ui-leading-flat` / `-copy` / `-prose` on `:root`, applied
through every step of the ramp, redeclared under `:lang(ar)` / `[dir="rtl"]`.
Three steps rather than more, because anything below the Latin floor is
unusable and "tight" therefore _is_ the floor.

The Arabic values are arithmetic, not taste. For a line box `L` and a font of
ascent `A`, descent `D` and ink descent `d`, the baseline sits at
`(L − A − D)/2 + A`, so ink clears the bottom edge only once `L ≥ A − D + 2d`.
At 11px: Manrope needs 15px (ratio **1.36**), Noto Sans Arabic needs 19px
(**1.73**). Those are font properties, which is exactly why one leading value
cannot serve both scripts.

Shipped Arabic `flat` is **1.95**, not 1.73, and the gap is deliberate: 1.73
is what _one measured string_ needs, and the floor has to hold for the string
nobody measured. Across the product the deepest Arabic ink wanted 66/34,
37/19 and 25/13 — 1.94, 1.95, 1.92 — so 1.95 is an observed ceiling. Only
`flat` is raised that far; `copy` and `prose` wrap, so their overflow is
visible and their ink is free, and inflating them would only make Arabic
paragraphs airy beside French ones.

**Cost, measured.** The bottom nav grows: label box 11px → 15px (fr) and
11px → 21px (ar), nav height 64px (fr) / 70px (ar), both inside the fixed
`--bottomnav-h` and both reporting `scrollHeight <= clientHeight`. Arabic is
6px taller than French, which is the honest consequence of the script needing
more room.

**Across the app**, `scripts/qa/layout-probe.mjs` over 16 routes × 4 widths ×
2 languages: `clipH` **1200 → 0**.

Two call sites were part of it. `BottomNav` set a local `leading-none` that
overrode the ramp on the one element this defect hurt most.
`FantasySummaryCard` carried a `[line-height:1.35]` workaround from BG-0122,
which was itself below the 1.36 Latin floor and far below Arabic's — it is
gone, and the token governs. `CompetitionHeader` was converted off three
literal sizes (13px, 10px, 10px) onto the ramp, which is what was cutting
"البطولة الاحترافية إنوي" on every Matches screen in Arabic.

### A fourth correction to the probe, and the important one

`clipH` over-reported once the leading rose. `scrollHeight` on a text leaf
reflects the **inline box**, sized from the font's _declared_ ascent and
descent — room for the tallest glyph the face can draw, not for the glyphs on
screen. Between the real ink height and that declared box,
`scrollHeight > clientHeight` keeps firing while nothing is visibly cut. The
Arabic hero lands exactly there: a 72px declared box against a 66px line box,
with the ink of "فانتازي" spanning 15.1 … 60.1 — comfortably inside.

The probe now measures ink directly and splits the two, so `clipH` means a cut
glyph and `clipHFontBox` means geometry. Both are printed; neither is dropped.

One more thing this cost: the edit adding `clipHFontBox` to the results guard
silently did not apply, so rows whose only finding was a font-box overflow
were never recorded and the run printed a clean `0`. It looked like the best
possible result, which is the reason to distrust it. Always cross-check a
"clean" run against a single element measured by hand.

---

## The literal-leading sweep, and three more corrections to the audit

**When** 2026-09-21, continuing the token pass after BG-0124 landed.

With the ramp carrying leading per step and per script, every remaining
Tailwind `leading-*` in `src/` became a second source of truth for the same
property — resolved by class order rather than by intent, and carrying no
Arabic adjustment. Fourteen of them, in eleven files, all removed or replaced
with the ramp step that was already the right answer:

| where                      | was                                     | now                                  |
| -------------------------- | --------------------------------------- | ------------------------------------ |
| `AuthShell` subtitle       | `leading-relaxed` + `ui.text.body`      | `ui.text.prose`                      |
| `FantasyAccessGate` body   | `leading-relaxed` + `ui.text.secondary` | `ui.text.prose`                      |
| `FantasyAlertList` message | bare `leading-snug`                     | ramp (parent `ui.text.secondary`)    |
| `FplStatBar` label         | `leading-tight` + `ui.text.micro`       | ramp                                 |
| `PlayerNameplate` ×2       | `leading-tight` on truncated bands      | ramp                                 |
| `DateStrip` ×2             | `leading-tight`, `leading-none`         | ramp                                 |
| `UiFdrSquare`              | `leading-tight`                         | ramp                                 |
| `SquadListTable` head      | `leading-tight`                         | ramp                                 |
| `FantasySummaryCard` value | `leading-none`                          | ramp                                 |
| `LegalDocumentView` ×3     | `leading-relaxed`                       | `ui.text.prose` / `ui.text.meta`     |
| `WelcomeScreen` ×2         | `leading-tight`, `leading-relaxed`      | `--ui-leading-flat`, `ui.text.prose` |

After: `layout-probe` over 16 routes × 4 widths × 2 languages — scroll 0, past
0, clipW 0, **clipH 0**, decorative 0.

### Three audit claims that measurement refuted

The plan document's token audit was written by reading `src/styles.css`. Three
of its findings did not survive being measured, and all three are corrected in
place rather than quietly dropped:

1. **"Body copy is semibold everywhere."** A tally of rendered characters by
   computed `font-weight` across seven routes: 8,998 of ~12,000 (73%) already
   render at 400. The reading was of `--ui-weight-body: 600`; most text never
   applies `ui.text.body` at all. What the tally _did_ find was `/fantasy/help`
   at 100% weight 800 — 671 characters, the only route with no normal-weight
   text — which the reading had missed entirely.

2. **"Tabular figures are near-absent."** Counted stylesheet occurrences, which
   is the wrong instrument: `STAT_BASE` carries `fpl-tabular`, so the whole stat
   ramp is tabular through `ui.stat.*`. Measured on the pages — every text leaf
   whose content is a bare figure — four of six routes had **zero** proportional
   figures. One real finding: the `UiPlayerPlate` sub band, eleven figures
   stacked down a pitch. Fixed.

3. **"Six radii where the standard wants two."** Counting the call sites and
   opening them says otherwise: `track 10` and `segment 8` are one component's
   outer and inner radius (a concentric nesting pair, not two values), and
   `tight 4` sits on 80px nameplates and ~20px difficulty squares, where a
   6px radius reads as a lozenge. Radius is optical against box size. **Not
   consolidated** — it would cost fidelity to the design the brief names as the
   source of truth, which is the opposite of polish.

The pattern is the same each time: a token file tells you what is _declared_, a
running page tells you what is _rendered_, and only the second one is the
product.

---

## BG-0104 — the live badge, and a contrast probe that had to be corrected four times

**When** 2026-09-21.

**The defect.** `--color-live` is a fill — the pulsing dot, the minute bar —
and at that job its vividness is the point. `LiveIndicator` also used it as
text, on a `color-mix(… 14%, transparent)` tint of _itself_, so foreground and
background were two points on one hue ramp. Measured from rasterised sRGB
against the tint it actually paints (`rgb(253,226,226)`): **3.30:1 at 10px**,
on `/matches`, in light mode, on the live site.

The ledger recorded 4.04:1 — measured against white, which is not what the
component renders. Same shape as BG-0114.

**The fix** is the split this codebase already made for `--ui-ink` /
`--ui-ink-fg`: one token cannot be both a fill and a foreground.
`--color-live-fg: oklch(0.5 0.22 27)` moves only the lightness, 0.62 → 0.50 at
identical chroma and hue, so it reads as the same red one step deeper.
**5.21:1** on the tint, 6.38:1 on white. The dot and the bar keep the vivid
token.

### The instrument, and its four wrong answers

`scripts/qa/contrast-probe.mjs` is committed because getting this right took
four corrections, and the next person should inherit them rather than repeat
them.

1. **Parsing `oklch()` by hand.** Avoided from the start — every colour is
   resolved by making Chromium _paint_ it onto a 1×1 canvas and reading the
   sRGB back.
2. **Compositing only ancestor `background-color`.** `PageBackground` renders
   its mesh as an absolutely-positioned **sibling** at `-z-10`, so the welcome
   screen's white text has no background on its ancestor chain at all. The walk
   composited down to the page's light `background-color` and reported
   white-on-white at 1.04:1 — six confident failures on a screen that measures
   5.77:1 to 15.03:1.
3. **Splitting ink from backdrop by percentile.** Taking the 25th and 98th
   percentile assumes glyphs are ≥2% of the box. True for a sentence, false for
   "18" in a wide plate, where the 98th percentile is still backdrop and the
   ratio comes back **1.00:1**. A dozen of those were reported as failures.
   Replaced by a histogram: the mode is the backdrop at any text density, and
   the ink is the furthest bin still holding ≥0.4% of pixels — which also steps
   over anti-aliasing. Below that threshold it returns `null`, because an
   element too sparse to judge is unmeasured, not passing.
4. **Screenshotting before the entrance animation finished.** The welcome
   screen fades in over 700ms after hydration; a capture at 1300ms contained
   **no glyph pixels at all** — bins 0–3, pure backdrop — and reported
   "Bienvenue sur BotolaGO" at 1.27:1 against a real 15.03:1. Fixed by waiting
   on `document.getAnimations()` rather than guessing a delay.

So pass 1 only ever _nominates_; every nomination is re-measured from rendered
pixels, and only pass 2's number is reported.

**After:** 7 routes × 2 languages, **168 pixel measurements, 0 below AA** — and
that includes all 78 gradient-backed elements pass 1 cannot judge, which
independently agrees with BG-0118's own 978-sample sweep.

---

## What four screenshot comments found that the probe could not

Four "fix the spacing" reports arrived against the published gallery, on two
screens. All four were real, and the layout probe reported zero on both routes
at the time. Two blind spots, both now closed.

### 1. The label that outgrew its tile, with a `truncate` that could not fire

`/fantasy/rankings` at 390px, French:

```
{"text":"Classement général","labelW":140.4,"tileW":103.3,"overflowsTile":37.1,
 "left":13.5,"right":153.9,"whiteSpace":"nowrap","overflow":"hidden",
 "maxWidth":"none","scrollVsClient":"140>140"}
```

The card spans x=16→374. Label 1 starts 2.5px outside it, label 3 ends 3.3px
past it, and labels 1 and 2 overlap by 8.4px.

`scrollVsClient` is the whole story: **140 > 140**. In a `flex-col` box with
`items-center`, a child with `white-space: nowrap` and no `max-width` sizes
itself to its own text. `scrollWidth` therefore equals `clientWidth` — the
element fits the content it was asked to clip — so `text-overflow: ellipsis`
has nothing to act on. The text spills across its siblings instead.

Every existing assertion is blind here by construction. `scroll` sees no
document growth. `past` sees nothing crossing the viewport. `clipW` sees
`scrollWidth === clientWidth`. Nothing is clipped, because nothing is
constrained.

`max-w-full` supplies the bound. The label wraps (`text-balance`) rather than
truncating: these strings are fixed product vocabulary, and half of one reads
as a different word. The sub band keeps `truncate`, since it carries variable
data.

Eight instances, all `UiStatBlock` labels, both languages — fixed once in the
kit. New assertion `spill`: a text leaf that outgrows its own parent while
nothing clips it. **0 over 128 checks.**

### 2. The ellipsis that excused itself

`/fantasy/top-players`, same 390px, same card the fourth report pointed at:

```
"Sélectionné par"  clientWidth 40  scrollWidth 112  → 36% shown  ("SÉLE…")
```

`clipW` skipped it deliberately: `cs.textOverflow !== "ellipsis"`. The
reasoning was sound — an ellipsis is a designed truncation, not a sliced word —
but it is only a design while enough of the word survives to be read. Four
characters of fifteen is a defect wearing a "…".

Cause: three chips share a 326px row, so each is ~103px; minus padding, gap and
a `shrink-0` value, the label had 40px. `flex-wrap` gives it somewhere to go.
Without `truncate` its min-content width is its longest word, so a label that
cannot sit beside its value pushes the value to a second line and reads in
full; the short chips never wrap and are unchanged.

The same card's comparison rows clipped four of five names in a fixed 3.5rem
column ("#4 Lamlaoui" is 67px). The column stays fixed rather than `auto`,
because every bar must start at the same x for the comparison to mean anything;
5.25rem clears the league's surnames and still leaves the bar 186px.

New assertion `starved`: an ellipsis showing less than `PROBE_STARVED` (0.6) of
the text's own width. A fraction rather than a pixel count, so it means the
same thing at every font size and in both languages. It fired on the 36% case
and stayed quiet on the club names on `/matches`, measured at 65–80% against
production-length data — an ordinary tail-trim.

**After both:** `scroll 0 · past 0 · clipW 0 · clipH 0 · spill 0 · starved 0`
over 128 checks (16 routes × 4 widths × 2 languages).

### 3. Crests: four measures all said 21 of 21, and two were placeholders

A fifth comment asked to confirm every Botola Pro club has its logo. Every
check the product had said yes: 21 of 21 active clubs have a `crest_asset_id`,
each with a `storage_path`, `mime_type = image/png`,
`validation_status = 'validated'`, and a URL returning 200. All 21 fetched.

Two of the images are the same file. `football/teams/228516/crest.png` (Amal
Tiznit) and `football/teams/274759/crest.png` (Yacoub El Mansour) are
byte-identical — 2,555 bytes of the provider's generic grey shield, stored
twice under two clubs' names.

A placeholder is a perfectly valid PNG. It validates, fetches, decodes and
draws, and `ClubCrest` paints it over the club's initials plate exactly as it
would a real badge — so the monogram fallback that would have shown the club's
letters never gets a chance, and the screen looks complete.

`scripts/qa/crest-coverage.mjs` tests the only signature available without a
human looking: two clubs sharing byte-identical crest data. It reports
`own crest 19 · shared image 2 · no crest 0`. It cannot catch a
unique-but-wrong badge, and does not pretend to. Replacing the two placeholders
is an owner action — a production write and an image-rights decision — tracked
as BG-0135.
