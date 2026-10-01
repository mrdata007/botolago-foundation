# Fantasy player data from Sofascore + Flashscore — implementation plan

Owner decision (2026-10-01): BotolaGO Fantasy player data comes from **two
sources only**: Sofascore and Flashscore, both through the existing RapidAPI
account. No Opta or other paid data provider.

Evidence: [`docs/audits/2026-10-01-sofascore-rapidapi-coverage-test.md`](../audits/2026-10-01-sofascore-rapidapi-coverage-test.md).

This plan is for a coding agent. It does **not** authorise any production
write. `AGENTS.md` and `CLAUDE.md` apply in full (one writer per database,
forward-only migrations, unique migration timestamps, staging first, dry-run,
owner-run production path).

---

## 1. Why two sources

| Need (rules v1 / adaptive v2) | Sofascore | Flashscore |
|---|---|---|
| Starters, subs, minutes | ✅ every match | ✅ lineups + subs (cross-check) |
| Goals, own goals | ✅ every match | ✅ summary |
| Cards (yellow / second yellow / red) | ✅ incidents | ✅ summary |
| **Assists** | ✅ only on ~70% of matches | ✅ summary lists assister (e.g. Touarga–FUS: Kajai, Ait Lamkadem — Sofascore had none) |
| Penalty goal / penalty miss | ⚠️ incidentClass `penalty` — but recorded Touarga–FUS 70' penalty as `regular` | ✅ summary marks "(Penalty)" |
| **GK saves** | ✅ player `saves` on ~70% of matches | ❌ no player stats; ✅ team shots on target |
| Goals conceded, clean sheet | derived from goal timeline + minutes | same, cross-check |
| Player rating | ✅ on ~70% of matches | ❌ |

Neither source alone covers every match. Together they cover every scoring
field in `FANTASY_RULES_V1.md` for almost every match, with GK saves *derived*
when Sofascore lacks them (§4).

## 2. Endpoints (verified on RapidAPI, 2026-10-01)

**Sofascore — Api Dojo** (`sofascore.p.rapidapi.com`, plan BASIC, 500 req/month)

| Use | Endpoint |
|---|---|
| Round results | `tournaments/get-last-matches?tournamentId=937&seasonId=<id>&pageIndex=0` |
| Match meta | `matches/detail?matchId=` |
| Lineups + per-player statistics | `matches/get-lineups?matchId=` |
| Goals / cards / subs | `matches/get-incidents?matchId=` |
| Team statistics | `matches/get-statistics?matchId=` |

Botola: `uniqueTournament.id = 937`; season 26/27 = `102220`.

**Flashscore — FlashLive Sports by tipsters** (RapidAPI, BASIC $0 plan; host
and limits to be read from the playground after subscribing — do not assume)

| Use | Endpoint |
|---|---|
| Find matches | `/v1/tournaments/results`, `/v1/events/list`, `/v1/search/multi-search` |
| Match meta | `/v1/events/data?event_id=&locale=` |
| Goals (with assist), cards, subs, penalties | `/v1/events/summary` (and `/v1/events/summary-incidents`) |
| Lineups | `/v1/events/lineups` |
| Team statistics | `/v1/events/statistics` |
| Player stats (probe only — expected empty for Botola) | `/v1/events/player-stats` |

Both run on the **same RapidAPI key** (one subscription each on the same app).

## 3. Owner prerequisites (before the agent starts)

1. Subscribe the RapidAPI app `default-application_8302838` to **FlashLive
   Sports — BASIC ($0)**.
2. Put the RapidAPI key in **staging** Supabase secrets as `RAPIDAPI_KEY`
   (never in the repo, chat, logs or PRs). Production later, via the runbook.
3. Answer the decisions in §7 (defaults are given).

## 4. Field rules (the reconciler)

For each fixture → player, build `PlayerFixtureStats` + `FieldEvidence`
(`src/backend/fantasy/adaptive-scoring.ts`). Every value carries source,
observedAt and references (provider event IDs + payload digest).

| Field | Rule | Evidence state |
|---|---|---|
| Identity | Map Sofascore + Flashscore player IDs to app players via `app_private.football_provider_mappings` (new provider names `sofascore`, `flashscore`). Match on fixture side (home/away — **never** Sofascore lineup `teamId`, it is the player's registered club), then shirt number, then normalised name. Unmatched → review queue. Never auto-create players. | — |
| `minutes`, started | Sofascore `minutesPlayed`/`substitute`; must agree with sub minutes from both providers' incidents (±2 min tolerance). Cap 90. | `verified` if consistent, else review |
| `goals`, `ownGoals` | Both providers must list the same scorer/minute (±2). | `verified`; disagreement → review |
| `assists` | Sofascore full-coverage `goalAssist` or incident `assist1`, and/or Flashscore summary assister. Agree → verified. One source names an assister and the other is silent → verified from that source. Both silent → 0 assists for that goal. Conflicting names → review. **A Sofascore limited-coverage `goalAssist: 0` is "unknown", never evidence.** | `verified` / review |
| Cards | Union of both incident lists, deduplicated by player+minute. Count mismatch → review. Ignore Sofascore team-level card counts (seen wrong). | `verified` |
| `penaltiesMissed` | Missed-penalty incident in both, or in one with no contradiction. Discover the exact incident type strings from real payloads; do not guess. | `verified` / review |
| `penaltiesSaved` | Only when an incident explicitly says the keeper saved. Otherwise review. | `verified` / review |
| `saves` (GK) | 1) Sofascore player `saves` present → `verified`. 2) Else, if exactly one keeper played the whole match for that team: `saves = opponent shots on target − goals conceded by that keeper (excluding own goals)`, only when Sofascore and Flashscore team shots-on-target agree → `derived`. 3) Else review. | `verified` / `derived` |
| `goalsConceded`, `cleanSheet` | From the agreed goal timeline + the player's on-pitch interval (reuse `deriveParticipation` logic). | `verified` (cleanSheet as today) |
| Rating | Store Sofascore `rating` for display only. **Not scored** (bonus is disabled in rules v1). | — |

Sanity checks per fixture (fail → whole fixture to review, nothing scored as
full): goals per side = final score; scorers' minutes > 0; 11 starters per side;
derived saves ≥ 0; sum of player shots/saves = team totals when Sofascore has
full coverage.

## 5. Scoring-mode change (needs a new ruleset)

Today `readiness()` makes **full** mode require every detail field to be
`verified`. A `derived` save would drop the fixture to **simple** (no assists,
no saves). To let derived saves count:

- Publish a new ruleset **v2.2** by a new forward migration. Do not edit v1.x,
  v2.0 or v2.1, and never change an existing season assignment.
- v2.2: `saves` with state `derived` and source `derived-shots-on-target-v1`
  counts toward full readiness. All other fields unchanged.
- pgTAP + unit tests: full with derived saves under v2.2; still simple under v2.0.

If the owner declines (D2 = no), skip this section; those fixtures score simple.

## 6. Work for the coding agent, in order

Each phase is its own PR to `main`. Do not start a phase before the previous
one's PR is reviewed.

**Phase 0 — Probe and fixtures (read-only, no DB).**
`scripts/backend/provider-probe.ts`: with `RAPIDAPI_KEY` from the environment,
fetch both providers for these matches and save **trimmed** fixtures (only the
fields the adapters read; no full third-party payloads — public repo) under
`tests/fixtures/providers/`:
Touarga 2–1 FUS (Sofascore 16958239), DHJ 2–6 CODM (16958236), WAC 1–3
Temara (17132472), Tiznit 1–3 Tanger (16958238), MAS 2–1 Zemamra (17132481),
Tetouan 0–0 Berkane (17132482), KACM 2–3 HUSA (17132480); last season Wydad
1–2 Touarga (16438990), Touarga 1–0 Tanger (16408824), HUSA 1–0 Touarga
(16354496). Find the Flashscore IDs via its results endpoint (Touarga–FUS is
`88o4wcDb`). Log request counts; stop if the remaining quota header is low.

**Phase 1 — Adapters.** `src/backend/football/provider/sofascore-adapter.ts`
and `flashscore-adapter.ts`: typed parsing with the existing `schemas.ts` /
`resilience.ts` patterns (timeouts, retries, circuit breaker), quota guard
reading the RapidAPI rate-limit headers, key never in URLs or logs. Unit tests
from the Phase 0 fixtures.

**Phase 2 — Reconciler.** `src/backend/fantasy/provider-reconciler.ts`
implementing §4, returning stats + evidence + a discrepancy list. Required
test expectations:
- Touarga–FUS: assists Ajerrar←Kajai, Lotfi←Ait Lamkadem; FUS goal is a
  penalty; Asmama saves 3 (FUS 4 on target − 1), Lakred saves 1 (3 − 2), both
  `derived`; Regragui, Rhailouf, Chaynane (90+4') yellow.
- Tiznit–Tanger: assists Najari 2, Maali 1, Adila 1; saves from Sofascore
  player stats (`verified`).
- DHJ–CODM: 8 goals reconcile with the 2–6 score.
- A fixture where providers disagree on a scorer goes to review, scores nothing.

**Phase 3 — Ruleset v2.2** (only if D2 = yes). Migration + pgTAP + types.

**Phase 4 — Ingestion worker (staging only).** Edge function or script that,
for each finished Botola fixture, pulls both sources at +2 h and +11 h after
full time (before the +12 h mode lock), records observations through
`service_record_fantasy_observation`, and writes a discrepancy/review list.
Dry-run flag that writes nothing. Respect the one-writer rule: pause SportMonks
performance ingestion on staging while testing.

**Phase 5 — Staging comparison.** Run on Round 1 2026/27 and the three
2025/26 matches. Use `scripts/backend/adaptive-scoring-comparison.ts` to
compare against the current SportMonks-based results. Report per fixture:
mode reached (full/simple), fields sourced from each provider, derived saves,
discrepancies, request usage. Owner reviews before any production step.

Production rollout afterwards follows
`docs/backend/RELEASE_ACTIVATION_MIGRATION_RUNBOOK.md` and the adaptive
scoring rollout gates — owner-run only.

## 7. Owner decisions

| # | Decision | Default if not answered |
|---|---|---|
| D1 | SportMonks still feeds fixtures, teams and the player catalog. Keep it for those, or replace it too? | **Keep for catalog/fixtures now**; Sofascore + Flashscore replace it only for player performance. Full removal is a later project. |
| D2 | Count derived GK saves toward full scoring (ruleset v2.2)? | **Yes** |
| D3 | Show Sofascore ratings/rich stats in the app as content (not points)? | **Yes, display only** |

## 8. Risks

- Both APIs are third-party resellers on RapidAPI. Terms can change or the
  listing can disappear; keep adapters isolated so one can be swapped.
- Sofascore BASIC is 500 requests/month. Budget ≈ 3 calls × 8 matches + 1 list
  ≈ 25 per round, ≈ 50 per round with the +11 h re-poll → ~200/month. Keep
  per-user traffic off the API entirely.
- Shots-on-target figures differ slightly between providers; derived saves are
  only used when both agree.
- Raw provider payloads must not be committed (public repo).
