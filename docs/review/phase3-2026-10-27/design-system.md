# BotolaGO design system, Phase 3 (built on the existing brand)

Nothing in the repo was changed. The logo, Floodlight Navy, the spring-to-sky action gradient, club colours from data, the Fantasy pitch and the jerseys are fixed.
**NEW** marks what this document adds. Everything else is an existing token or component, named as in `src/styles.css`, `DESIGN.md` and `src/components/ui-kit/primitives.tsx`.
All contrast numbers were read from rasterised sRGB pixels in Chromium (CSS colour, then canvas, then WCAG 2 ratio, composited over the real background). Raw: `phase3/contrast-results.json`, script `phase3/contrast.cjs`. Type and tap rules come from `phase3/mobile-spec.md`; where I differ, it is listed under "Questions for the Lead" in `proposals.md`.

The prototypes use `proto/tokens.css` (lines copied verbatim from `src/styles.css`) and `proto/additions.css` (only the NEW items below). Open `proto/additions.css` to see the whole proposed delta in one file.

## 1. Colour

### 1.1 Existing, unchanged (name · light value · job · measured contrast, light / dark)
| Token | Job | Pair measured | Light | Dark |
|---|---|---|---|---|
| `--ui-page`, `--ui-surface`, `--ui-surface-sunken` | page, card, recessed | - | - | - |
| `--ui-on-surface` | default text | on surface | 19.44 | 15.89 |
| | | on page | 18.10 | 18.07 |
| | | on sunken | 15.82 | 14.33 |
| `--ui-on-surface-muted` | secondary text | on surface | 7.43 | 8.07 |
| | | on page | 6.92 | 9.18 |
| | | on sunken | 6.04 | 7.28 |
| `--ui-ink-fg` | brand text, links, focus ring | on surface | 12.81 | 11.48 |
| `--ui-ink` / `--ui-on-ink-plain` | navy fill, white on it | | 12.81 | 12.68 |
| `--ui-on-ink-muted` | quieter line on navy | on ink | 8.40 | 8.33 |
| `--ui-selected` / `--ui-on-selected` | chosen chip, tab, nav | | 12.81 | 11.56 |
| `--ui-accent-spring` / `--ui-accent-sky` + `--ui-ink-deep` text | action gradient | on spring | 12.37 | 10.63 |
| | | on sky | 12.06 | 10.40 |
| `--ui-positive` / `--ui-on-positive` | win fill | | 5.17 | 9.28 |
| `--ui-negative` / `--ui-on-negative` | loss, error fill | | 5.49 | 6.93 |
| `--ui-caution` / `--ui-on-caution` | amber fill (doubtful, card) | | 9.34 | 10.65 |
| `--ui-live`, `--ui-live-fg` | live dot, live text | dot on surface (non-text) | 4.04 | 5.27 |
| `--ui-rule` | hairline (dividers only) | decoration | - | - |
| `--ui-rule-strong` | control edge | on surface (needs 3) | 3.35 | 3.16 |
| | | on sunken (needs 3) | **2.73 fails** | **2.85 fails** |
| `--ui-club`, `--ui-on-club`, `--ui-club-edge` | club colour, from data only | see 1.4 | | |
| `--brand-*`, `--news-gradient-*`, `--news-plate-*` | logo/News art, not interface | unchanged | | |

New finding **U20** (not in the audit): `--ui-rule-strong` as a control edge drops below 3:1 on `--ui-surface-sunken` (2.73 light, 2.85 dark). It is only a problem for outlined controls placed on a sunken area. The prototypes avoid it (the "N" form chip carries a letter, so the ring is not what makes it readable). No value is changed here.

### 1.2 NEW text-only shades (fixes M4, values from the Mobile operator's spec, re-measured by me)
Use as `color:` only. Fills keep `--ui-positive` / `--ui-negative` / `--ui-live`.
| NEW token | light | pair | before (existing token) | after (NEW) | dark |
|---|---|---|---|---|---|
| `--ui-positive-text` oklch(0.42 0.12 150) | | on its 14 % tint | 4.28 fail | **6.61** | 7.19 (= existing) |
| `--ui-negative-text` oklch(0.44 0.19 355) | | on its 12 % tint | 4.64 | **7.11** | 6.47 (dark oklch(0.78 0.17 355)) |
| `--ui-live-text` oklch(0.45 0.20 27) | | on live tint | 5.51 | **6.76** | 6.22 (= `--ui-live-fg`) |
| `--ui-on-surface-faint-text` oklch(0.50 0.02 258) | | on page / on sunken | 4.40 / 3.85 fail (existing faint) | **5.58 / 4.87** | 5.87 / 4.65 |

### 1.3 NEW quiet washes and neutrals (all mixed from existing tokens, no new hue)
| NEW token | What it is | Used for | Measured |
|---|---|---|---|
| `--ui-ink-wash` | 7 % `--ui-ink-fg` in `--ui-surface` | "my row" in a table or leaderboard, language bar | text on it 16.87 light / 14.06 dark; links 11.12 / 10.16 |
| `--ui-ink-wash-strong` | 13 % mix | pressed / open row | - |
| `--ui-positive-wash`, `--ui-negative-wash`, `--ui-live-wash` | 14 / 12 / 12 % mixes in surface | badge and chip backgrounds (the "tint" in 1.2) | see 1.2 |
| `--ui-medal-1/2/3` + `--ui-on-medal` | gold (= `--ui-caution`), silver oklch(0.86 0.01 250), bronze oklch(0.74 0.1 55); text `--ui-ink-deep` | podium rank discs | 9.34 / 10.91 / 7.04 light; 10.65 / 8.72 / 6.33 dark |
| `--ui-sponsor-surface`, `--ui-sponsor-rule`, `--ui-sponsor-text` | neutral grey = `--ui-surface-sunken`, `--ui-rule`, `--ui-on-surface-muted` | every sponsor line. Never a club colour, never on a gradient | 6.04 light / 7.28 dark |

### 1.3b NEW control edge (fixes U20, Round 2 FIXED 13)
`--ui-control-edge`: light oklch(0.56 0.02 258), dark oklch(0.62 0.02 258). Same hue as `--ui-rule-strong`, one step stronger. Measured: on sunken 3.79 light / 4.30 dark (needed 3), on surface 4.66 / 4.77, on page 4.34 / 5.42. Use it for any outline drawn on `--ui-surface-sunken`. The score dash now uses `--ui-on-surface-muted` (7.43 / 8.07) instead of a 50 % grey (3.65).

### 1.4 Text on club colours (rule, with a measured warning)
Text on a club fill uses `--ui-on-club` (white or near-black #111, chosen by contrast, as `inkOn` does today). Measured for the clubs shown in the prototypes (best of white / #111):
Wydad and Kawkab 5.88 (white), FAR 10.88 (white), Ittihad Tanger 6.47 (white), CODM 5.44 (white), Maghreb Fès 13.19 (#111), Berkane 5.99 (#111), FUS 7.77 (#111), **Raja 4.50 (#111, borderline), Hassania 4.45 (#111, fails 4.5)**.
Rule NEW (Round 2, FIXED 4 and 8): where the best of white or #111 is under 4.6:1 (today Raja and Hassania), any text that touches the fill sits on a white pill (`.crest.pilled`, `.half.pilled b`, the player-hero name card) in `--ui-ink-deep`; no opacity on text over a club fill; no pure black. Club fills are unchanged. Small captions (city, "Domicile") never go on a fill. That is why the prototypes drop the "Casablanca / Agadir" line from the split header; the audit's current header puts 12px text on these fills.

### 1.5 Dark theme
Every NEW token has a `.dark` counterpart (`proto/additions.css`). Checked in the same table: all text pairs pass 4.5 in dark. The prototypes load `?theme=dark` (`shots/after-live-theme-dark-fr-m.png`).

## 2. Typography (French and Arabic)
Faces unchanged: Changa 800 for display, scores and tabs; Manrope (FR) and Noto Sans Arabic (AR) for body; Latin digits in both languages. Steps are `--ui-text-*`, `--ui-display-*`, `--ui-score-*`, `--ui-stat-*`. Changes, all from `mobile-spec.md`:

| Role | Token | FR px | AR px | Change |
|---|---|---|---|---|
| hero / title / section / subtitle | `--ui-text-hero/title/section/subtitle` | 34 / 19 / 17 / 16 | same | none |
| body | `--ui-text-body` | 15 | **16** | NEW AR +1 |
| secondary | `--ui-text-secondary` | 14 | **15** | NEW AR +1 |
| meta | `--ui-text-meta` | 13 | **14** | NEW AR +1 |
| label | `--ui-text-label` | 12 | **13** | NEW AR +1 |
| micro | `--ui-text-micro` | **12** (was 11) | **13** | M5 floor, both |

The Arabic +1px on the small steps is APPROVED by the Lead (basis: mobile-spec 1.1, measured Arabic x-height 78 % of Manrope). It supersedes the size choice in BG-0124, which kept Arabic at the same px and only raised leading; the leading values of BG-0124 are kept.

Rules used in every prototype: no text under 12px (FR) or 13px (AR), measured by script on 7 pages x 2 languages x 4 widths (0 failures). Scores are three pieces (home digit, dash, away digit) in a flex row that mirrors with `dir`, never one string. Clocks and minutes, signs (+2, -6), prices and ranks sit in `<bdi dir="ltr">`; a number and its unit are `white-space: nowrap`. No letter-spacing and no uppercase in Arabic. Arabic stack gets the Android-safe fallback (`--ui-font-body-ar`, NEW).

## 3. Spacing and shape
Existing scale `--ui-space-1..6` = 4, 8, 12, 16, 24, 32. NEW `--ui-space-7` = 48 (desktop section gap only). Gutter 16 (12 under 360). Section gap 24 (`--ui-space-5`). Row heights 48 (one line) and 56-64 (two lines). Radii unchanged: 14 card, 16 sheet and hero, 10 track, 8 segment, 4 form chip, full for every pressed control. Shadows unchanged (`--ui-shadow-card`, `-lifted`, `-raised`).
Tap target: 44px minimum painted in the prototypes (the 32px painted + hit-area trick is not needed). Measured: 0 controls under 44px at 320, 360, 390 and 1280 wide.

## 4. Buttons (existing `UiButton`, one rule changed)
| Variant (existing) | Look | Use |
|---|---|---|
| `gradient` | spring-to-sky, `--ui-ink-deep` text | ONE per screen: the main action ("Enregistrer", "Compléter automatiquement", "Créer mon équipe") |
| `ink` | navy, white text | strong secondary ("Choisir mon équipe" on the gradient card) |
| `outline` | 1.5px `--ui-ink-fg` | quiet alternative to the main action ("Ajouter à mon équipe" on a player page) |
| `soft` | sunken fill | utility ("Voir les 11 titulaires", "Français") |
| `ghost`, `light`, `destructive` | as today | as today |
Sizes: `md` 48, `sm` 44 (NEW rule: `sm` is 44, not 36). Disabled buttons say why in a line under them (fixes U9). A sticky bar may hold one button and one line of text.

## 5. Match card
Existing `MatchCard` anatomy kept: 4px club-colour edge on the inline-start side, meta line, two clubs, centre kick-off or score. Changes: crest above the club name on phones so long names ("Hassania Agadir") get the full half-width instead of wrapping letter by letter; centre shows time (`--ui-score-row`) or score; live adds the `live` badge (`--ui-live-text` on `--ui-live-wash`, a dot plus the word, never colour alone). The home digit sits on the side of the home club in both directions. A sponsor line, if any, goes in the foot row on a neutral surface (see proposals, spot 2).

## 6. Player card (list row and header)
Row: number disc (32, sunken), name (one or two lines, `bdi`), position word, chevron. The whole row is the link (fixes U1). Header: club colour band with `--ui-on-club` text on large bold type only (see 1.4), avatar disc with initials when no photo, club crest at the end, one line "club · age · country". Tabs: Aperçu, Saison, Matchs, Fantasy. Fantasy price, points and "Ajouter" live in one card labelled "Dans le Fantasy" and never in a sticky bar for people without a team.

## 7. Standings table
Existing `StandingsTable` rules kept (real table, zone bars, rank at the start edge). Changes: sticky header with abbreviations carrying `title`; form (last 5) on a second line under the club, as V/N/D letters in coloured squares (letter + colour, never colour alone; 17-20px squares, 12px/13px text); G, N, P columns appear from 1024px (phones keep J, +/-, Pts, no expander); "my club" row on `--ui-ink-wash` with a star and a hidden word; legend as a compact list of zone bars; a note below the filters when clubs have games in hand. Fits 320px without sideways scroll (measured).

## 8. ONE empty, error and loading system (replaces the two found in U5)
Today: `common/States.tsx` (`EmptyState`, `ErrorState`, `LoadingState`, sunken panel, round icon disc) and kit `UiStatePanel` (`UiEmptyState`, `UiErrorState`, white card, section heading, no disc). Proposal: keep the kit file as the only home, name it `UiState`, and give it these four kinds. Both old APIs become thin re-exports, then are deleted (Batch 7).

| Kind | Disc | Title (section 17, Changa) | Line (secondary, muted) | Action | Retry? |
|---|---|---|---|---|---|
| `loading` | none: skeleton shapes that copy the final layout; `role=status aria-busy`, one sr-only word | | | | |
| `empty` (nothing yet, e.g. no match today) | sunken disc, inbox | what is empty | what will appear / where to go | one link to what does exist | no |
| `unavailable` (will not come, e.g. no player stats) | sunken disc, info; quiet surface (no shadow) | what is missing | when it usually appears | none | never |
| `error` (a request failed) | `--ui-negative-wash` disc, alert, `--ui-negative-text` | what could not load | "your data is safe" line | one `ink` button "Réessayer" | yes |
Same card, same padding (24 / 20), same type for all four; the surface is the only difference (white card for empty and error, quiet sunken for unavailable). Copy rules: say what, then what next; no "Oops"; Arabic and French lines are written, not translated word for word. Example in `proto/live.html` ("Pas de statistiques par joueur pour l'instant"). Offline banner and the first-visit language bar use the same wash tokens.

## 9. Components added by the redesigns (all built from tokens above)
| NEW component | Where | Kit base |
|---|---|---|
| `FantasyTabs` (Équipe, Transferts, Points, Classement, Ligues), sticky, 5 equal tabs | all Fantasy screens (U15) | `UiTabs` |
| `LanguageBar` (non-blocking, dismissible, one tap) | first visit, replaces the blocking dialog (U14) | `UiBanner` |
| `SponsorLine` (neutral strip, "Présenté par MARQUE") | five spots, see proposals | new, `--ui-sponsor-*` |
| `AutoFillCard` (progress, gradient CTA, "Je choisis moi-même") | new-manager state (U2) | `UiCard`, `UiButton` |
| `RankRow`, `Podium` | leaderboard | `UiTR`, `UiRankMovement` |
| `EventTimeline` row (home events at the home side) | live match | existing `EventTimeline` look |
| `RecapCard` footer | share image | existing recap palette |
