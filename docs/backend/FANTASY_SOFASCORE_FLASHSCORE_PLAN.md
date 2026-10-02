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
| **GK saves** | ✅ player `saves` on full-coverage matches (7 of 10 in Phase 0) | ❌ no player stats, no saves line; team shots on target exist but do not match Sofascore's |
| Goals conceded, clean sheet | derived from goal timeline + minutes | same, cross-check |
| Player rating | ✅ on ~70% of matches | ❌ |

Neither source alone covers every match. Together they cover every scoring
field in `FANTASY_RULES_V1.md` except GK saves on matches where Sofascore has
only limited coverage. Those saves are "unknown" and the fixture scores in
simple mode (§4, §5). Phase 0 findings:
[`docs/audits/2026-10-01-fantasy-providers-phase0.md`](../audits/2026-10-01-fantasy-providers-phase0.md).

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
| Identity | Map Sofascore + Flashscore player IDs to app players via `app_private.football_provider_mappings` (new provider names `sofascore`, `flashscore`). Match on fixture side (home/away — **never** Sofascore lineup `teamId`, it is the player's registered club), then shirt number, then position. **Never match on name**: the providers spell the same player differently ("M. Elhtemy" / "Lahtimi M."). A name may be shown to a reviewer but never decides a match. **A shirt number is not enough on its own where points depend on it** (the providers number a player differently in 3 of the 7 Phase 0 matches): a player named in an incident is paired only when both providers attribute the same incident to the pair; shirt number alone pairs only players neither provider mentions in any incident, and the result says which basis was used. Unmatched → review queue. Never auto-create players. The player mapping table is brought forward so this stops depending on shirt numbers: [`FANTASY_PROVIDER_PLAYER_MAPPING_DESIGN.md`](FANTASY_PROVIDER_PLAYER_MAPPING_DESIGN.md). | — |
| `minutes`, started | Sofascore `minutesPlayed`/`substitute`; must agree with the substitution minutes from both providers' incidents. Sofascore counts the clock, so `minutesPlayed` may run up to **6 minutes over** the substitution time and **2 under** it (decided 2026-10-01; a flat ±2 rejected 8 of 37 correct players in MAS–Zemamra). Cap 90. Substitutions are matched **per player** (not as a swap) within **5 minutes**; when the providers name different players for the same substitution only those players go to review. | `verified` if consistent, else that player to review |
| `goals`, `ownGoals` | Taken from the **incident lists**: Sofascore incidents plus Flashscore summary. Taken in the order scored, the two lists must name **the same scorers** (as paired above) and both must add up to the final score; their minutes may differ by up to **10**. Otherwise the whole match goes to review and nothing is scored. **Never read goals from Sofascore lineup statistics**: they undercount (WAC–Temara: a player who scored twice is credited once). Penalty goals count as goals. Flashscore own-goal labels are not yet seen in real data; do not guess them. | `verified`; disagreement → review |
| `assists` | Sofascore full-coverage `goalAssist` or incident `assist1`, and/or Flashscore summary assister. Agree → verified. One source names an assister and the other is silent → verified from that source. Both silent → 0 assists for that goal. Conflicting names → review. **A Sofascore limited-coverage `goalAssist: 0` is "unknown", never evidence.** | `verified` / review |
| Cards | Matched **per player and card type** first, then within **5 minutes**. Equal counts on both providers → `verified`; a mismatch holds that player back, not the match. Ignore Sofascore team-level card counts (seen wrong). | `verified` / that player to review |
| `penaltiesMissed` | Missed-penalty incident in both (same player, within 5 minutes). One provider only → that player to review. Exact incident type strings come from real payloads (`inGamePenalty`/`missed`, `PENALTY_MISSED`). | `verified` / that player to review |
| `penaltiesSaved` | Only when an incident explicitly says the keeper saved. Otherwise review. | `verified` / review |
| `saves` (GK) | From **Sofascore player statistics only**, and only on a full-coverage match (the player's statistics include `totalPass`). Present → `verified`. Otherwise **"unknown"**: no value is derived from shots on target (Phase 0: Flashscore and Sofascore disagree on 3 of 4 full matches, and Flashscore has no saves line). An unknown save leaves the fixture in simple mode (§5). | `verified` / `unknown` |
| `goalsConceded`, `cleanSheet` | From the agreed goal timeline + the player's on-pitch interval (reuse `deriveParticipation` logic), **computed once on each provider's own times**. Appearance, clean-sheet and conceded points turn on 60 minutes and on a goal falling inside the interval, so the wider time windows above must never change them: if the two timelines disagree on any of minutes-above-or-below-60, goals conceded or clean sheet, that player goes to review. A goal on the same minute as his substitution is also review. | `verified` (cleanSheet as today) / that player to review |
| Rating | Store Sofascore `rating` for display only. **Not scored** (bonus is disabled in rules v1). | — |

Sanity checks per fixture (fail → whole fixture to review, nothing scored as
full): goals per side = final score in **both** providers; scorers' minutes > 0;
11 starters per side; if one provider's lineup for a side is clearly broken
(not 11 starters) and the other's is sound, the sound lineup is used for that
side and every affected field's evidence says so (`lineup-used-alone`), and the
same person must never come out twice;
when Sofascore has full coverage, keeper saves + goals conceded = opponent shots
on target (Sofascore figures only; this held for 13 of 14 team sides in Phase 0).

## 5. Scoring mode (no new ruleset)

Today `readiness()` makes **full** mode require every detail field to be
`verified`. A save that is `unknown` keeps the fixture in **simple** mode (no
assists, no saves), exactly as today. Decision D2 = B: nothing is derived, so
**no new ruleset is published**. Ruleset v2.2 (derived saves) is dropped, and
v1.x, v2.0 and v2.1 stay as they are.

- Full-coverage Sofascore matches (about 7 in 10) reach full mode when every
  other field is `verified`.
- Limited-coverage matches (about 3 in 10) score simple mode. If Sofascore later
  fills a match, a re-poll can lift it to full before the +12 h mode lock.
- Revisit only if a reliable saves source appears; that would be a new owner
  decision and a new plan section.

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
  penalty (Flashscore marks it; Sofascore says `regular`); both keepers' saves
  `unknown` (limited coverage), so the fixture stays simple; Regragui, Rhailouf,
  Chaynane (90+4') yellow.
- Tiznit–Tanger: assists Najari 2, Maali 1, Adila 1; saves from Sofascore
  player stats (`verified`).
- DHJ–CODM: each provider's 8 goals add up to the 2–6 score; saves `unknown`.
  The two lists name one scorer with different shirt numbers (6 and 21), so the
  match stays in review until the player mapping exists.
- WAC–Temara: goals come from incidents plus Flashscore (4), not the Sofascore
  lineup (3).
- Players match across providers by side, shirt number and position, not name.
- A fixture where providers disagree on a scorer goes to review, scores nothing.

**Phase 3 — Dropped.** Ruleset v2.2 is not published (D2 = B). Next phase
after 2 is Phase 4.

**Before Phase 4 — Player mapping.** The player ID mapping table and its admin
review screen come first (design:
[`FANTASY_PLAYER_MAPPING_TABLE_AND_REVIEW_SCREEN_DESIGN.md`](FANTASY_PLAYER_MAPPING_TABLE_AND_REVIEW_SCREEN_DESIGN.md)).
The owner decisions are recorded in section 0 of that design (two-person approval for
every mapping and for "not a Botola player", at least two distinct reviewers, 90-day
retention of provider display names only). It needs its own PRs; Phase 4 does not start
before the reconciler can take the mapping as input.

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
| D2 | Count derived GK saves toward full scoring (ruleset v2.2)? | **Decided 2026-10-01: B, no.** Saves come from Sofascore player stats only, otherwise unknown (Phase 0 evidence). |
| D3 | Show Sofascore ratings/rich stats in the app as content (not points)? | **Yes, display only** |

## 8. Risks

- Both APIs are third-party resellers on RapidAPI. Terms can change or the
  listing can disappear; keep adapters isolated so one can be swapped.
- Sofascore BASIC is 500 requests/month. Budget ≈ 3 calls × 8 matches + 1 list
  ≈ 25 per round, ≈ 50 per round with the +11 h re-poll → ~200/month. Keep
  per-user traffic off the API entirely.
- Shots-on-target figures differ between providers (Phase 0), which is why
  saves are never derived from them.
- About 3 in 10 matches have limited Sofascore coverage and score simple mode.
- Raw provider payloads must not be committed (public repo).
