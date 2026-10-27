# BotolaGO Phase 3 - Mobile, Arabic and Access spec (for prototypes)

Status: STEP 1, written 2026-10-27 by the Mobile/Language/Access operator. Nothing in the repo is changed.
Audience: the UX & Design operator building `phase3/proto/*.html`. I will test every prototype against exactly these numbers.
Finding codes (M1-M9) are from `docs/review/phase1-2026-10-27/4-mobile-language-access.md`.
Measurements marked [M] were taken by me in Chromium (Playwright) from the repo's own tokens and fonts; raw files are in `phase3/mobile-shots/` and `phase3/tools/`. Marked [R] = rule from a standard or from the repo, not measured here. Marked [?] = could not be measured here, see the end.

Fixed, not touched by this spec: logo, core colours, Fantasy pitch, jerseys, Fantasy rules. Every colour below is an ADDITION (new text-only token). No existing token changes value.

---------------------------------------------------------------------
## 1. Type scale (French and Arabic)

### 1.1 Why Arabic needs more px than French [M]
Measured with the repo's own woff2 files at 100 px (`tools/fontm.js`):

| Glyph | ink height above baseline | vs Manrope x-height |
|---|---|---|
| Manrope x-height (French lower case) | 54 | 100 % |
| Noto Sans Arabic, beh body (typical joined letter) | 42 | 78 % |
| Changa (display), beh body | 47 | 87 % |
| Manrope digits 0-9 | 74 | 100 % |
| Noto Sans Arabic digits (scores are Latin digits in ar-MA) | 67 | 91 % |

So at the same px, Arabic body letters are about 22 % smaller than French lower case and digits about 9 % smaller. The repo's BG-0124 fixed only line HEIGHT for Arabic (leading 1.95), not size. Leading prevents clipping; it does not help legibility. Hence "Arabic one step larger" for the small steps only. Matching French x-height exactly would need +28 % (12 px -> 15 px), too big for chips and nav labels; +1 px (about +8 %) is the compromise that keeps the 320 px layouts. Titles (Changa, 87 %) keep the same size.

### 1.2 The scale (px shown, write them as rem: 1rem = 16px, so Android font-size settings can scale them [?])

| Role | Token today | FR new | AR new | FR line-height | AR line-height | Used for |
|---|---|---|---|---|---|---|
| hero | 34 | 34 | 34 | 1.1 | 1.95 (Changa) | hub title, score hero |
| title | 19 | 19 | 19 | 1.25 | 1.95 | screen header |
| section | 17 | 17 | 17 | 1.25 | 1.95 | section heading |
| subtitle | 16 | 16 | 16 | 1.4 | 1.95 | header title between buttons |
| body | 15 | 15 | 16 | 1.55 | 1.9 | rows, buttons, copy |
| secondary | 14 | 14 | 15 | 1.55 | 1.9 | supporting copy, pills |
| meta | 13 | 13 | 14 | 1.4 | 1.95 | table cells, dates |
| label | 12 | 12 | 13 | 1.4 | 1.95 | badges, column heads, chips |
| micro | 11 | **12** | **13** | 1.4 | 1.95 | nav labels, club codes, weekday labels |

- HARD FLOOR: no rendered text under 12 px in French, under 13 px in Arabic. (M5: 11 px used on every screen, 9.6 px club monograms, 9.75 px rank arrows, 8.25 px "M" on transfers; counts of nodes under 12 px at 360 px: Fantasy players 138, Transfers 67, Home 42.)
- FR micro goes 11 -> 12 so micro and label are the same size; keep them as two tokens so the AR step stays correct. Arabic micro/label 13 is the floor for every Arabic string, including inside chips.
- Club monogram inside a crest disc (now `min(1em,40cqi)` = 9.6 px): floor 12 px; if the disc is too small for the letters, show 2 letters, not a smaller font. The disc is not a Fantasy jersey, so this does not touch the jerseys.
- Arabic line-height values are the repo's existing ones (`styles.css` 2248-2259); keep them. French line-heights unchanged.
- Weight: Arabic text below 14 px uses weight 500 minimum (thin Arabic strokes at 13 px fail on cheap LCDs) [R]. French 12 px uses 500-600 as today.
- Letter-spacing: none in Arabic (existing rule `styles.css:747`); keep it. Uppercase tracking in French only.
- Conflict to note: `styles.css` BG-0124 comment says Arabic font size was deliberately NOT raised to keep the spacing grid. My +1 px is a decision for the Lead (see Questions). Prototype it as `:lang(ar)` overrides of the `--ui-text-*` tokens so it is one switch.

### 1.3 Arabic font and the Android fallback
- Body Arabic: Noto Sans Arabic (self-hosted woff2, variable 100-900, 166 KB). Display Arabic: Changa. Latin: Manrope. Keep. [repo]
- Today's fallback is `"Segoe UI Arabic", "Tahoma", sans-serif` (M9c). Neither exists on Android, so on a slow connection the first paint falls to the generic `sans-serif`. New stack, additions only:
  - Arabic body: `"Noto Sans Arabic", system-ui, "Segoe UI Arabic", Tahoma, sans-serif`
  - Arabic display: `"Changa", "Noto Sans Arabic", system-ui, "Segoe UI Arabic", Tahoma, sans-serif`
  - Reason: Android system-ui is Roboto for Latin and falls through to the system Noto Arabic face for Arabic letters [?: Android system font behaviour is from platform knowledge, not measured here]. This is the closest match to Noto Sans Arabic metrics, so the swap-in causes the least reflow.
- Preload only for Arabic readers: the head script that already sets the theme also sets `lang`/`dir` (M2 fix) and, when Arabic, inserts `<link rel=preload as=font type=font/woff2 crossorigin href=/fonts/noto-sans-arabic-arabic-wght-normal.woff2>`. French readers never download the 166 KB file (it is already unicode-range split, so this is the only way to add it without cost to French).
- Keep `font-display: swap`. Add a metric-adjusted fallback `@font-face` with `size-adjust` for Noto Sans Arabic only after it is measured on a real Android [?]; prototypes do not need it.
- Never use `font-synthesis` bold on Arabic; use real weights 500/600/700 from the variable file.

### 1.4 Numbers, scores, minutes, mixed names (isolation)
- Digits: Western digits 0-9 in both languages (ar-MA already does this). Do not switch to Arabic-Indic digits.
- Every number that sits inside running Arabic text, and every Latin club or player name that sits inside Arabic text, is wrapped in `<bdi>` (the repo already has 328 `<bdi>`; keep the habit). If it must be a CSS-only component, `unicode-bidi: isolate`.
- Scores, clocks and minutes get `dir="ltr"` on the bdi: `<bdi dir="ltr">63&prime;</bdi>`, `<bdi dir="ltr">02:15:30</bdi>`. Without dir=ltr a minute like `45+2'` is reordered in RTL (the `+` and the apostrophe jump sides).
- A score is NOT one string. Home digit and away digit are separate boxes placed beside their own team, and the row mirrors in RTL (home on the right in Arabic, as the strip does today). Reason: one LTR string "2 - 1" would put the home score on the left, next to the away team. Prototypes: team, digit, dash, digit, team as 5 flex children, never `"2 – 1"` text. The dash between is `aria-hidden`.
- Prices and units: `<bdi dir="ltr">12.5</bdi>` then unit in a separate span; the pair gets `white-space: nowrap` so "37" and "h" never separate (M9b: Arabic countdown wraps between number and unit at 320).
- Mixed Latin names in Arabic rows: the name element gets `<bdi>`, `min-width:0`, `overflow-wrap:anywhere` on wrap rows, or `truncate` with `dir="auto"` on one-line rows. Arabic names beside Latin codes: show the code in its own bdi chip, not glued to the name.
- Percent and signs: `+3`, `-2`, `12%` as `<bdi dir="ltr">`; the minus is U+2212 (already in the font range).

### 1.5 What flips in RTL, what must not
Flips (mirrors automatically with logical properties; prototypes use `ps-/pe-/ms-/me-/start/end/text-start`, never `left/right/pl/pr/ml/mr/text-left`):
- layout order of rows, tabs, chips, nav items, table column order (rank at the start edge), back/next/chevron icons (global rule `styles.css:753-785`, do NOT add `rtl:rotate-180` or `-scale-x-100` on top, it flips them back), progress bars (fill from start), sticky-column side, drawer side, toast side, form labels, text alignment (`start`), form-guide W/D/L chips (newest at the start edge).
Does NOT flip:
- the Fantasy pitch and formation (physical picture; the container is `dir="ltr"`, goalkeeper at the bottom, left wing stays left; player NAMES inside it are bdi), jerseys, club crests, logos, photos.
- scores digits and clocks (digits stay LTR inside their own box), minute ticks, countdowns.
- icons that are not directional: clock, refresh, play, check, info, search, share, swap arrows (list in `styles.css:760-775`).
- numeric chart axes and sparklines: left-to-right in time (a graph is a picture of a number line). The row of numbers under a chart mirrors only if it is a list, not an axis.
- phone, price, email, URL, code inputs: `dir="ltr"` on the input; placeholder aligned to start.
- the "play/live" pulse dot, and any `deg` gradients are replaced by "to bottom" (existing rule).

---------------------------------------------------------------------
## 2. Tap targets

Token already in the repo: `--ui-tap-min: 2.75rem` (44 px). Helpers in `src/components/ui-kit/tokens.ts:739,755`.

| Control | Painted minimum | Effective hit area | Spacing rule |
|---|---|---|---|
| Bottom nav item | full item, at least 64 x 56 (5 items at 320 px = 64 px wide) | same | label 12 FR / 13 AR, never truncated, never wrapped to 2 lines at 320 |
| Top bar buttons | 44 x 44 | 44 x 44 | 8 px between |
| Tabs / segmented | 44 high, text width + 24 | 44 x 44 | adjacent tabs touch or have >= 4 px gap |
| Filter chips, day strip | 36 high painted is OK | 44 high via `hitFloor` | centre-to-centre >= 44 px along the axis they stack on; side by side chips: 4 px gap max 8 |
| List rows (match, standings, news, player) | 56 high (two lines) / 48 high (one line) | whole row is the target | row separators, not extra links inside a row closer than 44 px centre-to-centre |
| Icon-only buttons (save, share, report) | 32 x 32 painted OK | 44 x 44 via `hitArea` | if two are stacked, their centres are >= 44 apart; at 32 px painted that needs a 12 px gap |
| Fantasy player select / "+" / swap buttons in lists | 36 x 36 painted | 44 x 44 | rows >= 56 so two "+" never overlap; the pitch itself is unchanged |
| Text links in forms (Terms, Privacy, Forgot) | text height | 44 high via `hitFloor` (M6 measured 121 x 16 FR, 84-121 x 24-30 AR) | stack them vertically with >= 8 px gap, or put them on separate lines |
| Inputs, selects, buttons | 44 high min | 44 | primary action buttons 48 |

How to use the helper [R: code read]:
- `ui.hitArea` = fixed 44 x 44 transparent `::after` centred on the element: for a small fixed icon/checkbox.
- `ui.hitFloor` = `max(100%, 44px)` on both axes: for links and chips of variable size; keeps the full width, adds height only when needed. The element must be `relative`, must not be `overflow:hidden`, and neighbours that overlap must sit above it.
- Prototype test I run: `document.elementFromPoint` at the four corners and centre of the 44 x 44 area must return the control; and the painted box is also reported. A control that is under 24 x 24 painted fails regardless of helper (WCAG 2.5.8).
- Never put a hit area on a control that sits inside a horizontally scrolling strip without checking the strip's padding clips it (`overflow-x:auto` clips `::after`): give the strip `py-1` or more.

---------------------------------------------------------------------
## 3. Colour: new text-only tokens (fixes M4)

All colour pairs below were rasterised in Chromium (CSS colour -> canvas -> sRGB pixels, composited over the real background), contrast = WCAG 2.x. Not parsed by hand. Raw table: `phase3/mobile-shots/contrast-pairs.json`. Method script: `phase3/tools/pairs.js`.

### 3.1 The problem, reproduced
Chips in the repo use `color-mix(in oklab, <fill> 12-20%, transparent|surface)` as the background and the fill itself as the text. Worst real case is 20 % on `--ui-surface-sunken` (a chip on a sunken row).

| Light theme text | rgb | on its own 20 % tint (surface) | on its own 20 % tint (sunken) |
|---|---|---|---|
| `--ui-positive` oklch(.52 .14 150) | 10,126,58 | 3.90 | 3.23 |
| `--ui-negative` oklch(.55 .22 355) | 201,15,120 | 3.90 | 3.21 |
| `--ui-live-fg` oklch(.5 .22 27) | 194,0,0 | 4.81 | 3.98 |

(3.90 matches Phase 1's 3.90 measurement for "Journee double" and "NOUV.")

### 3.2 New tokens (additions only; fills and brand colours unchanged)
Add to `:root` (light) and `.dark`. Use ONLY as `color:`; never as a fill; fills keep `--ui-positive` / `--ui-negative`.

```
:root {
  --ui-positive-text: oklch(0.42 0.12 150);   /* rgb(0,94,38)   */
  --ui-negative-text: oklch(0.44 0.19 355);   /* rgb(153,0,88)  */
  --ui-live-text:     oklch(0.45 0.20 27);    /* rgb(169,0,0)   */
  --ui-on-surface-faint-text: oklch(0.50 0.02 258); /* rgb(92,100,111) */
}
.dark {
  --ui-positive-text: var(--ui-positive);            /* oklch(.78 .17 150) already passes */
  --ui-negative-text: oklch(0.78 0.17 355);          /* rgb(255,133,189) */
  --ui-live-text:     var(--ui-live-fg);             /* oklch(.78 .18 27) */
  --ui-on-surface-faint-text: var(--ui-on-surface-faint);
}
```
Hue is kept (150, 355, 27) and chroma stays high, so the text still reads as the same green / magenta / red family; it is darker/lighter, not another colour. Prototype rule: where a chip text uses `--ui-positive` or `--ui-negative` today, use the `-text` token; icons and 3 px+ strokes may keep the fill token (graphics need only 3:1).

### 3.3 Measured results of the new tokens
Light: own tint worst case = 20 % on sunken; surface/page also shown.

| Pair | page | surface | sunken | own tint 12 % / surface | own tint 20 % / surface | own tint 20 % / sunken |
|---|---|---|---|---|---|---|
| positive-text | 7.44 | 7.99 | 6.50 | 6.73 | 6.02 | **4.99** |
| negative-text | 7.84 | 8.42 | 6.85 | 6.86 | 5.97 | **4.92** |
| live-text (own tint) | | | | | | **4.88** (worst of 12-20 % on page/surface/sunken) |
| faint-text | 5.58 | 5.99 | 4.87 | | | |

Dark:

| Pair | page | surface | sunken | own tint 20 % / sunken |
|---|---|---|---|---|
| positive-text (= positive) | 10.49 | 9.22 | 8.32 | 5.44 |
| negative-text | 8.75 | 7.69 | 6.94 | **4.94** (was 4.43 with `--ui-negative`) |
| live-text (= live-fg) | 8.21 | 7.21 | 6.50 | 5.13 |

I tried lighter steps to see where it breaks: positive L .44 gives 4.59 (too close), L .46 gives 4.20 (fail). Negative L .46 gives 4.63, .48 gives 4.25. So .42 and .44 are the lightest values with margin.

### 3.4 Core text pairs checked (current tokens, unchanged; both themes)
Light (page / surface / sunken): on-surface 18.1 / 19.4 / 15.8; on-surface-muted 6.92 / 7.43 / 6.04; ink-fg 11.9 / 12.8 / 10.4.
Dark (page / surface / sunken): on-surface 18.1 / 15.9 / 14.3; muted 9.18 / 8.07 / 7.28; faint 5.87 / 5.16 / 4.65; ink-fg 13.1 / 11.5 / 10.4.
Muted on a 20 % negative tint over sunken (light) = 4.34 - fails by 0.16; avoid muted text on tinted chips, use `on-surface` or the matching `-text` token.

NEW FINDING (call it M4b, Low-Medium): **light `--ui-on-surface-faint` fails as text**: 4.40 on page, 3.85 on sunken, 2.76-3.98 on any tinted chip. The repo documents it as "placeholders, disabled" but `ui.tone.faint` (`tokens.ts:524`) exposes it as a text class and form placeholders use it (`primitives.tsx:1702`). Rule: faint is for disabled text and decoration only; any readable hint, helper line or date uses `--ui-on-surface-muted`, or the new `--ui-on-surface-faint-text` (4.87-5.99). Placeholders: use `-faint-text`.

### 3.5 Contrast rules for prototypes
- Body and small text (< 24 px, or < 19 px bold): >= 4.5:1. Large text (>= 24 px or >= 19 px bold): >= 3:1. Icons and control borders (non-text): >= 3:1. [R WCAG 1.4.3, 1.4.11]
- Never put text on a photo or gradient without a solid scrim that makes the measured pair pass; I measure the worst pixel in the text box.
- Status is never colour alone: green/magenta chips carry a word or an icon (injured = word "Blesse"/"مصاب", not a magenta dot).
- Text on club-coloured fills uses `--ui-on-club` (already decided per theme; do not invent).
- Do not use `--ui-accent-spring`, `--ui-accent-sky`, `--ui-caution` as text colours; they are fills (the file says so).

---------------------------------------------------------------------
## 4. Zoom and inputs (M1)

- Viewport meta becomes `width=device-width, initial-scale=1, viewport-fit=cover`. Remove `maximum-scale=1`. Do not add `user-scalable=no`. WCAG 1.4.4 and 1.4.10. [M1]
- Reason the cap existed: iOS Safari zooms the page when a focused input has text under 16 px. Today fields are 15 px (Phase 1). So: every `input`, `select`, `textarea` is `font-size: 16px` minimum in both languages (Arabic fields 16 px too: the Arabic body step is already 16).
- Visual change: field text +1 px (about 7 %), field boxes already `min-height: 44px` so box height does not change. Placeholders and floating labels: 16 px, no change to label (12/13 px) above the field. Select chevron and clear buttons keep their 44 px hit areas.
- Add `touch-action: manipulation` on buttons, links and chips: removes the double-tap-zoom delay on controls while pinch zoom on the page stays.
- Reflow at 400 % zoom = 320 CSS px wide (WCAG 1.4.10): every prototype must have no horizontal page scroll at 320 px; wide tables may scroll inside their own container only if they are tables of more than 5 columns (standings must NOT: rank, club, P, GD, Pts fit at 320, measured fine in Phase 1).
- Orientation: never lock (no `orientation` lock in the Capacitor shell for the web content) [R WCAG 1.3.4].

---------------------------------------------------------------------
## 5. Layout rules: 320 / 360 / 390 px, landscape, safe areas, sticky budget

### 5.1 Widths
- Test widths: 320 x 568 (smallest still sold), 360 x 740 (most common cheap Android), 390 x 844. Landscape: 640 x 360 and 568 x 320.
- Page gutter: 16 px at >= 360, 12 px at 320. Nothing may be wider than `100vw - 2 x gutter` unless it scrolls inside its own container.
- Every flex/grid child that holds text has `min-width: 0`. A row with a name + a number: name `truncate` (one line) or wraps to max 2 lines; the number never shrinks (`shrink-0`, `white-space: nowrap`).
- Overflow measured by bounding boxes of all elements vs viewport (`right <= innerWidth`, `left >= 0` in LTR; mirrored in RTL), NOT `scrollWidth` (CLAUDE.md Evidence).
- Max two columns of cards at 360 (each >= 150 px). Three columns only for icon-and-number tiles >= 96 px wide.
- Text must survive +30 % length (Arabic and French run longer than English): buttons grow in height, not overflow.

### 5.2 Sticky / fixed bar budget (M7)
Measured today [M7]: top bar 65 + bottom nav 76 = 141 px; with a sticky table header (33) = 174.

| Viewport | Today | Budget (hard) | How |
|---|---|---|---|
| portrait 360 x 740 | 141 (19 %) / 174 with table head (24 %) | <= 25 % of viewport height | keep |
| portrait 320 x 568 | 141 (25 %) / 174 (31 %) | <= 25 % = 142 px | the sticky table header, tab row and sticky action bar must not stack on top of top bar + nav at this height; at height < 640 only ONE secondary sticky element is allowed and it replaces the table header unstick |
| landscape (max-height 480) | 141 of 360 = 39 %; 174 = 48 %; 568 x 320 = 54 % | <= 30 % of viewport height = 108 px at 360, 96 px at 320 | `@media (max-height: 480px)`: top bar 49 px (drops the 12 px top padding when there is no inset: 44 row + 4 + 1), bottom nav becomes icon + label side by side, 48 px; no sticky table header, no second sticky bar; the match tab row sticks only when scrolled up |
- Count every `position: fixed|sticky` element, including the Fantasy confirm bar (`sticky bottom: var(--bottomnav-h)`), toasts and live strip (`--livestrip-h-open` 52 px).
- Use `dvh` not `vh` (Android URL bar). Content must have `padding-bottom` = nav height + safe inset so the last row is never covered.
- Sticky element needs an opaque background (no see-through text overlaps).

### 5.3 Safe areas (notches, gesture bar, landscape cut-outs)
- `viewport-fit=cover` stays. `env(safe-area-inset-*)` already used for top and bottom (`--topbar-h`, `--bottomnav-h`).
- Gap: nothing in `src/components/shell` uses `safe-area-inset-left/right`. In landscape with a notch the nav and content go under the notch. Rule: the shell's side padding is `padding-inline: max(var(--gutter), env(safe-area-inset-left), env(safe-area-inset-right))` for fixed bars and the page; use `inset-inline` logical form.
- Bottom bars: `padding-bottom: max(env(safe-area-inset-bottom), 8px)`; the bar's own content height is added to it, never replacing it.
- Prototype simulation: Chromium cannot set real insets, so prototypes expose them as `--sai-top/right/bottom/left` custom properties with `env()` fallback, and I test with 44 / 0 / 34 / 0 (portrait) and 0 / 44 / 21 / 44 (landscape). Real device check is [?].

---------------------------------------------------------------------
## 6. Screen-reader and language rules

### 6.1 Page language and titles (M2, M3, M9a)
- `<html lang dir>` set before first paint from the stored language (the existing inline head script that sets the theme also sets `lang` and `dir`). Prototypes that show Arabic set `lang="ar" dir="rtl"` on `<html>`, not only on a wrapper.
- `<title>` is localised, pattern `{Page} - BotolaGO`, with a plain hyphen or en dash, brand name Latin in both languages:
  - FR: `Matchs - BotolaGO`, `Classement - BotolaGO`, `Fantasy - BotolaGO`, `Actualites - BotolaGO` (plural; M9a: Home says "Actualite" singular today)
  - AR: `المباريات - BotolaGO`, `الترتيب - BotolaGO`, `فانتازي - BotolaGO`, `الأخبار - BotolaGO`
  - Detail pages: specific first: `FAR 1-1 WAC - Matchs - BotolaGO`, AR `FAR 1-1 WAC - المباريات - BotolaGO`.
  - Each prototype page must have a `<title>` in the language it shows, and `document.title` changes with the language switch.
- One `h1` per page, in the page language, matching the title's first part. Headings never skip a level.
- Mixed-language strings: wrap short foreign phrases `<span lang="fr">` / `<bdi lang="fr">` so TalkBack picks the right voice; club names in Latin inside Arabic text get `lang="fr"` only when 2+ words, otherwise the voice reads the code as letters, so give the element an `aria-label` with the readable name.
- Skip link first in tab order, localised ("Aller au contenu" / "تخطي إلى المحتوى").

### 6.2 Live scores (aria-live politeness)
- The score headline on a match page: one region, `aria-live="polite" aria-atomic="true"`, containing a SPOKEN sentence (visually hidden if the visual is boxes): "Farah 1, Wydad 1, 63e minute" / "الفراح 1، الوداد 1، الدقيقة 63". The existing `MatchScoreHeader.tsx:176-178` does this; keep it.
- The minute clock and countdown: `aria-live="off"`, `role` none. A ticking region must never be live (a screen reader would speak every minute).
- Events (goal, red card): appended to a visually-hidden `role="log"` (implicit polite). Debounce: at most one announcement per 5 s; if several arrive, speak the final score and the latest event. Never `assertive` for score or news.
- `assertive` only for blocking errors (form submit failed, connection lost on a screen that needs it) and the Fantasy deadline lock.
- Lists that refresh (live strip with several matches): do NOT make the list live; only the single followed match.
- Loading states: `aria-busy="true"` on the container, and one polite status "Chargement" / "جارٍ التحميل" at most.

### 6.3 Labels and names
- Every control has an accessible name in the page language (Phase 1: 0 unnamed controls on 27 routes; keep it). Icon-only buttons: `aria-label`, and visible tooltip text not required.
- Visible label text must be contained in the accessible name (WCAG 2.5.3): a button reading "Ajouter" has `aria-label="Ajouter Salah"` not "Select player".
- Form fields: real `<label for>`; errors linked with `aria-describedby`, `aria-invalid`; error text uses the negative-text token plus an icon.
- Status chips: text is the state ("Blesse", "Journee double"), not a colour.
- Decorative images `alt="" aria-hidden`; crests inside a row with the club name next to it are decorative; a crest alone has the club name.
- Focus: `:focus-visible` ring >= 2 px with >= 3:1 against both the element and the background; the repo's `ui.focus` ring (`--ui-ink-fg`) passes on page in both themes; on the dark mesh use `ui.focusOnMesh`. Focus is never hidden under a sticky bar: `scroll-padding-top: var(--topbar-h)` and `scroll-padding-bottom: var(--bottomnav-h)`.
- Motion: respect `prefers-reduced-motion` (pulses, shine, countdown flips off).
- Language switch control: its label is in the TARGET language of each option ("Francais", "العربية") with `lang` on each option.

---------------------------------------------------------------------
## 7. Test checklist I will apply to each prototype (so you can pre-empt it)

1. 320, 360, 390 px x FR, AR (`lang`/`dir` on `<html>`), light and dark if the prototype has both.
2. Overflow by bounding boxes; ignore items inside intentional scroll containers.
3. Tap targets: painted box and `elementFromPoint` effective area; centre-to-centre spacing.
4. Text nodes under 12 px (FR) / 13 px (AR) at computed font-size.
5. Contrast of every text node from rasterised sRGB over the real background chain, light and dark. Items on photos: worst pixel.
6. RTL mirroring: logical order, directional icons (from the list), non-flipping items (pitch, scores, clocks).
7. Bidi: scores digits adjacent to their own team, minute strings, Latin names in Arabic rows in `<bdi>`.
8. Title, `h1`, `lang`, aria-live use per section 6.
9. Sticky budget at 360x740, 320x568, 640x360, 568x320.

---------------------------------------------------------------------
## What I could not measure (affects the numbers above)
- [?] Android system font scale and real Android fonts (Roboto/Noto fallback), `size-adjust` values: needs an emulator or phone.
- [?] Real safe-area insets, gesture bars, notch landscape: Chromium cannot simulate `env()`; I simulate with custom properties only.
- [?] Old WebView (M8): `oklch`/`color-mix` fallback is NOT part of this spec; unmeasured risk remains. If the owner's fans run WebView < 111, every token above needs an `rgb()` baseline. The rgb values I list in section 3.2 are exactly that baseline.
- [?] TalkBack speech itself; I check DOM names, lang and live regions only.

## Questions for the Lead (blocking some values above)
1. Arabic +1 px for body to label (section 1.2) reverses BG-0124's decision to keep Arabic size equal to French. Approve the +1 px, or must I design with leading only?
2. Home on the right in Arabic with the home score beside it (section 1.4): is that the owner's convention for Arabic score rows (the strip does it today)?
3. Is `--ui-positive-text` / `-negative-text` / `-live-text` / `-faint-text` counted as an allowed addition to the colour system?
4. Landscape: may the bottom nav change shape (icon + label side by side, 48 px) under `max-height: 480px`?
