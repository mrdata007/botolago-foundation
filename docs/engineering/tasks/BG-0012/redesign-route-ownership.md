# BG-0012 full-product redesign — route/file ownership map

Base: `agent/news-cms-launch` @ checkpoint `f0a2d8cf246d3f11098213164d4e70b6411a9cdf` (News/CMS
work already merged and frozen for independent verification — do not edit those files here).

Reference roles (do not confuse these):
- **Premier League** reference app → product architecture / UX / information-hierarchy reference only.
  Never clone branding, copyrighted art, or copy.
- **BotolaGO Fantasy** (`--fpl-*` CSS tokens, `src/components/fpl/*`) → visual design system source of truth
  for the rest of the product.
- **Botola / Moroccan football data** → actual product content. Never fabricate stats/history/awards the
  backend doesn't provide.

## Agent A — shared shell + Accueil
Owns:
- `src/routes/index.tsx` (Accueil)
- `src/routes/__root.tsx` (shell-level changes only — nav, header conventions)
- `src/components/shell/*`
- `src/components/common/*` shared primitives consumed by multiple areas: `ArticleCard`, `MatchCard`,
  `PlayerRow`, `ClubCrest`, `Section`, `SectionHeader`, `States`, `Skeletons`, `FailureAwareImage`, `Trans`,
  `FantasySummaryCard`, `FantasyAlertList`

Accueil structure (already approved, do not deviate): compact personal/contextual header → matches/matchday →
Fantasy gameweek entry → curated News preview → standings snapshot where supported → football/club discovery
links. Do NOT reproduce the full News page inside Accueil.

D1/D2/D3 consume these shared primitives as-is; if one needs a change, it requests it from Agent A rather than
editing the file itself.

## Agent D1 — Matches / results / tables
Owns:
- `src/routes/matches.index.tsx`, `src/routes/matches.$matchId.tsx`
- `src/components/matches/*` (`DateStrip`, `CompetitionHeader`, `MatchScoreHeader`, `MatchTabs`,
  `EventTimeline`, `StatComparison`)

Consumes `AppShell`/`MatchCard`/`ClubCrest`/`Section`/`SectionHeader`/`States`/`Skeletons` from Agent A
without editing them. Real data only — no fabricated statistics where the backend has none; classify as
"blocked by real data" rather than inventing numbers.

## Agent D2 — Players / Stats / Transfers
Owns (all currently under `/fantasy/*` but wrapped in the legacy `LegacyFantasyPage` component — i.e. never
actually redesigned during the Fantasy baseline phase; this is genuinely new scope, not reopening Fantasy):
- `src/routes/fantasy.players.tsx`, `fantasy.players.$playerId.tsx`, `fantasy.rankings.tsx`,
  `fantasy.top-players.tsx`
- `src/routes/fantasy.transfers.tsx` (verify: 0 raw `--fpl-*` token hits despite using fpl/* subcomponents —
  confirm visually whether it's actually styled or effectively legacy too)
- `src/components/fantasy/PlayerStatusBadge.tsx`, `DifficultyBadge.tsx`, `RankingsPodium.tsx`,
  `MyRankCard.tsx`, `RankChangeIndicator.tsx`, `GameweekSelector.tsx`, `JerseyVisual.tsx`
- `src/components/fpl/LegacyFantasyPage.tsx` — retire/replace by porting these screens onto the real
  `--fpl-*` design system (`FantasyFrame`, `fpl/primitives`), the same system already used by
  `fantasy.team.tsx`/`fantasy.points.tsx`/etc.

Do NOT touch `fantasy.rules.tsx`, `fantasy.help.tsx`, or `fantasy.profile.tsx` — those stay with the
accepted Fantasy baseline (regression-only). Player comparison only if genuinely useful with current data;
do not build a new analytics backend to imitate Premier League.

## Agent D3 — Account / Profile / Auth / Legal / Help
Owns:
- `src/routes/profile.tsx`
- `src/routes/auth.tsx`, `auth.login.tsx`, `auth.register.tsx`, `auth.forgot-password.tsx`,
  `auth.update-password.tsx`, `auth.verify.tsx`, `auth.callback.tsx`, `auth.profile-setup.tsx`
- `src/components/auth/*` (`AuthShell`, etc.)

There are currently **no** dedicated About/Terms/Privacy/FAQ route files in `src/routes/`. Do not fabricate
legal text or invent routes speculatively — audit what legal/help content (if any) exists elsewhere in the
app (footers, modals, static content) first, and report it as `REFERENCE ONLY / UNSUPPORTED` in your route
matrix entries if there's genuinely nothing to redesign yet, rather than inventing pages.

Preserve all existing auth/security behavior exactly — this is an IA/visual redesign, never permission to
weaken auth, change password/reset flows' logic, or alter what "delete account" actually does.

## Explicitly out of scope for all four agents
- Anything under `src/routes/admin.*`, `src/backend/news/*`, `supabase/migrations/*`,
  `supabase/functions/*` (owned by the already-merged News/CMS checkpoint).
- Anything under `src/routes/fantasy.*` styled screens already using `--fpl-*` tokens directly
  (`fantasy.index.tsx`, `fantasy.create.tsx`, `fantasy.fixtures.tsx`, `fantasy.leagues*.tsx`,
  `fantasy.points.tsx`, `fantasy.team.tsx`) — Fantasy baseline, regression-only.
- `/mcp`, `/.lovable/oauth/consent` — internal infrastructure routes, not redesign candidates.

## Not yet assigned / owner-agnostic
- League/competition standings — no dedicated route found yet; D1 to confirm during work whether standings
  live inside `matches.index.tsx` or need a new minimal addition, and report which.
