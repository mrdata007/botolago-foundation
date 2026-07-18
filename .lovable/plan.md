# BotolaGO Headline Color Audit & Accent Plan

## Current state (verified at HEAD)

Nearly every route-level H1 and every shared H2 uses `text-foreground` with `font-black`, producing a uniformly near-black wall of headlines on light surfaces. The brand blue tokens (`--brand-primary`, `--brand-primary-2`, `--brand-accent`) currently appear only in gradients, focus rings, and the `--primary` mapping — never in typographic hierarchy.

### Headlines on light surfaces (all currently plain `text-foreground`)
- `src/routes/index.tsx` — Home H1 (manager greeting) + `SectionHeader` blocks
- `src/routes/news.tsx` — "News" H1
- `src/routes/matches.tsx` — "Matches" H1
- `src/routes/profile.tsx` — profile H1, guest H2, anon H2
- `src/routes/fantasy.index.tsx` — Fantasy Hub H1
- `src/routes/fantasy.team.tsx` — team name H1
- `src/routes/fantasy.transfers.tsx` — H1
- `src/routes/fantasy.points.tsx` — H1
- `src/routes/fantasy.leagues.tsx` — H1
- `src/routes/fantasy.leagues.$leagueId.tsx` — league name title (`div.text-lg font-black`)
- `src/routes/fantasy.players.tsx` — H1
- `src/routes/fantasy.players.$playerId.tsx` — player name + numeric stat titles
- `src/routes/fantasy.fixtures.tsx` — H1
- `src/routes/fantasy.rules.tsx` — H1 + per-section H2s
- `src/routes/fantasy.top-players.tsx` — H1
- `src/components/common/SectionHeader.tsx` — every section H2 in the app
- `src/components/shell/FirstLaunchLanguage.tsx` — modal H1

### Headlines already on dark/blue gradients (must NOT be re-tinted blue)
- `src/components/welcome/WelcomeScreen.tsx` H1 (dark brand gradient, currently inherits white)
- `src/components/auth/AuthShell.tsx` H1 (dark brand gradient background)
- `src/routes/__root.tsx` 404 H1/H2 (may sit on gradient)

## Findings

1. **Overuse of black `font-black` headlines** flattens visual hierarchy — H1, H2, and numeric labels all read at the same weight/color.
2. **No brand-blue accent** exists anywhere in typography, despite blue being the core brand identity. New users get no chromatic anchor to the brand outside splash/welcome.
3. **Uniform `SectionHeader`** means every section on every screen looks identical; it's the biggest single lever.
4. **Numeric emphasis mixed with titles** (rank `#`, price, stat values) uses the same `font-black text-foreground` as headings, so accenting numbers separately would also clarify hierarchy.
5. **RTL/i18n risk**: any approach that hard-splits an English/French string into "first word" + "rest" will break Arabic word order. Accent spans must come from the dictionary layer, not from JS string slicing.

## Recommendation

Adopt a **selective accent** pattern rather than repainting whole H1s:

- Keep the main heading body in `text-foreground` for contrast and legibility.
- Introduce a reusable `<AccentText>` (or `text-brand` utility mapped to `var(--brand-primary)` — the deep blue reads best on light surfaces; reserve `--brand-accent` for numeric/interactive highlights) applied to:
  - **Section labels / eyebrows** (e.g. Home greeting eyebrow "Bonjour" / "مرحبا") — full eyebrow in blue, keeps manager name black.
  - **Meaningful headline fragments** via i18n keys with a `{accent}` placeholder rendered by a small `<Trans>` helper, so FR and AR translators control which word is emphasized (e.g. FR `"Mon {accent}Équipe{/accent}"`, AR equivalent chooses a different word if word order demands).
  - **Numeric emphases** (league rank `#12`, player price, points totals) get `text-[color:var(--brand-accent)]` — the brighter accent — while their surrounding labels stay foreground.
- Leave headlines on dark/brand gradients unchanged (Welcome, AuthShell, 404) — they must remain white for contrast.
- `SectionHeader` gains an optional `accent?: "eyebrow" | "word"` prop plus an optional pre-title eyebrow slot; default behavior stays black so existing usages are unaffected until opted in.

### Concrete accent targets
| Surface | Current | Proposed |
|---|---|---|
| Home hero (`index.tsx`) | greeting eyebrow gray, name black | eyebrow → `--brand-primary`; name stays black |
| `SectionHeader` (all screens) | plain black H2 | add short blue eyebrow key (e.g. "Aujourd'hui", "Ma section") above title on Home + Fantasy hub only |
| Fantasy Hub H1 | black | accent word "Fantasy" via i18n `{accent}` |
| Fantasy Team H1 | team name black | small blue eyebrow "Mon équipe" above team name |
| Fantasy Transfers/Points/Leagues/Players/Fixtures/Rules H1 | black | accent last/first meaningful word per dictionary (FR & AR curated) |
| League detail (`$leagueId`) | league name + rank black | league name unchanged; `#rank` uses `--brand-accent` |
| Player detail (`$playerId`) | player name + stat values black | stat *values* use `--brand-accent`; name unchanged |
| Profile H1 + guest/anon H2 | black | blue eyebrow "Compte" above; H2 unchanged |
| News / Matches H1 | black | blue eyebrow (section label) above H1 |
| `FirstLaunchLanguage` modal H1 | black | accent word via i18n |
| Welcome / AuthShell / 404 on gradient | white/foreground | **no change** (contrast) |

## Exclusions (no blue)
- Welcome hero H1 (dark gradient)
- AuthShell H1 (dark gradient)
- Any headline rendered inside a `--bg-brand-gradient` surface
- Splash screen
- Bench/pitch labels inside Fantasy pitch (already on colored kits)
- Body copy, muted subtitles, form labels

## Implementation approach (build phase)

1. **Tokens & utilities** (`src/styles.css`)
   - Add `.text-brand` → `color: var(--brand-primary)` and `.text-brand-accent` → `color: var(--brand-accent)` as `@utility` entries (Tailwind v4).
2. **Shared primitives**
   - `src/components/common/AccentEyebrow.tsx` — small uppercase tracking-wider label in `--brand-primary`, RTL-safe.
   - `src/components/common/Trans.tsx` — parses `{accent}…{/accent}` in a translation string and wraps that span in `--brand-primary`. Keeps RTL/word order controlled by translators.
   - Extend `SectionHeader` with optional `eyebrow?: string` prop; default rendering unchanged.
3. **i18n dictionaries** (`src/i18n/dictionaries.ts`)
   - Add `.eyebrow` keys for section labels (news, matches, profile, fantasy sub-screens).
   - Convert selected H1 title keys to include `{accent}…{/accent}` markers in both FR and AR (translator chooses the fragment per language to preserve grammar and RTL flow).
4. **Route edits** — apply `AccentEyebrow` / `<Trans>` in the ~14 route files listed above; no logic changes.
5. **Numeric accent pass** — swap `text-foreground` → `text-brand-accent` on the specific stat *values* in `fantasy.players.$playerId.tsx` and `fantasy.leagues.$leagueId.tsx` (rank, price, points value only).
6. **QA**
   - Manual check at 320 / 360 / 390 px in both LTR (FR) and RTL (AR) that eyebrows and accent spans wrap cleanly and stay above their headline.
   - Verify contrast: `--brand-primary` on `--background` ≥ 4.5:1 (deep blue on near-white passes; accent-blue on white is used only for large numeric labels, still ≥ 3:1 for large text).
   - Confirm no accent is emitted on dark-gradient surfaces (Welcome, AuthShell).
7. **Tests** — no behavior changes; existing 44 tests should remain green. Add a small snapshot/DOM test for `<Trans>` accent parsing if trivial.

## Risks / notes
- Introducing accent via string-split JS would break AR. Route all accent choices through i18n placeholder markers.
- Keep the accent selective: aim for **one accent per screen** (eyebrow *or* headline word *or* numeric value), never all three, to preserve the "premium" restraint of the current design.
