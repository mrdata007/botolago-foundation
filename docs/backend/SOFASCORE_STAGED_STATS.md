# SofaScore staged statistics

Status: design and code only. Nothing here was applied, deployed or run against
production, and no pgTAP could run in CI form here (no Docker). Owner decision of
2026-10-12: SofaScore publishes Botola player statistics in two stages, and
Fantasy must score and progress on the first stage while the second refines it.

## Definitions

- **Core data**: minutes, goals, cards (and so goals conceded and clean sheet).
  Available right after the match for some matches.
- **Full coverage**: every player with `minutesPlayed > 0` has both `rating` and
  `totalPass`. The lineup parser (`parseSofascoreLineups`) now uses exactly this
  (it used "any player has `totalPass`" before). A request built from a full
  lineup is `coverage: "full"`; anything else is `limited`.
- **Match data status** (per fixture, `app_private.sofascore_staged_stats`):
  `PROVISIONAL` -> `FINAL` | `FINAL_LIMITED`.
- **Closed provisional gameweek**: all its counted matches have core data, the
  carry-over the next gameweek needs is done and the next gameweek is open, but
  points can still change.
- **Locked gameweek**: all counted matches are `FINAL` or `FINAL_LIMITED`; the
  existing finalization runs (seal, final results, prizes, notifications).

## 1. Pull schedule

Server side only, through the existing RapidAPI client (so `rapidapi_call_counts`
counts it). 3 requests per pull (incidents, lineups, statistics); see section 5.

1. **First pull**: the existing post-final path records the first observation.
   A trigger on `app_private.fantasy_fixture_observations` registers the fixture
   (`PROVISIONAL`, `next_pull_at = first pull + 3 days`) for any observation whose
   `sourceRefs` carry a SofaScore event id. No change to the automatic path.
2. **Re-pull every 3 days** until a pull shows full coverage. The pull is built
   with the same builder and recorded with the same recorder; the recorder
   dedupes by digest, so an unchanged pull creates no observation.
3. **One final pull** 3 days after full coverage was first seen, then the match is
   `FINAL` and no more pulls are made.
4. **21 days after kickoff** without full coverage the match is `FINAL_LIMITED`
   (the window is `app_private.sofascore_fantasy_hold_window()`, the matcher
   lane's 21 days, so there is one constant). It is listed by
   `api.admin_sofascore_final_limited()` (permission `football.read_operations`).
5. Time based settling (`app_private.sofascore_staged_settle_due`), independent of
   fetch success: no full coverage by kickoff + 21 d -> `FINAL_LIMITED`; full seen
   but the final pull still missing at kickoff + 28 d -> `FINAL` (reason
   `final_pull_missing`); a reviewed correction is the latest observation ->
   `FINAL` (`reviewed_override`, the recorder ignores provider data after it).
   A gameweek can therefore never wait for ever on a failing fetch.
6. A pull whose coverage is worse than the one already recorded is stored as a
   pull row (`outcome = regressed`) and **not recorded** as an observation.
7. **Traceability**: `app_private.sofascore_stat_pulls` has one row per pull with
   `pulled_at`, `data_digest` (sha256 of the trimmed parsed replies),
   `coverage`, `changed`, `observation_id` and, when the digest changed, the
   trimmed parsed data (<= 512 KiB, like `sofascore_fantasy_attempts.match_data`).
   No raw payload is stored or committed.
8. Budget guard: the due list is empty once the month's counted calls reach
   9,000 (re-pulls are the lowest priority; live polling keeps its quota).
   A per-tick cap (`SOFASCORE_STAGED_PULLS_PER_TICK`, default 2, max 8) applies.

Code: `supabase/functions/_shared/sofascore-staged-stats.ts` (called from the
existing sweep with one added line in `sofascore-live-refresh.ts`; nothing in
`sofascore-fantasy-auto.ts` changes). Schedule rules are in SQL, which is what
gates the lock, and are tested there.

## 2. Scoring layers

No rules change, no new ruleset version. The existing adaptive modes are the
layers:

- `simple` mode = core points (appearance, goals, clean sheet, goals conceded,
  cards, own goals). Assists, saves, penalties saved and missed are **absent from
  the ledger (UNKNOWN), never zero**. Bonus and player of the match stay off.
  Ratings are display only (Pepites sync), never points.
- `full` mode adds the rich categories, only when the match has full coverage.

Today the mode is chosen once at final whistle + 12 h and never changes
(`service_select_fantasy_scoring_modes`, `mode is null`). For seasons with the
staged policy on (`app_private.fantasy_staged_stats_policy`, default off) the
wrapper does this instead:

- first ready observation: select `simple` (core ready) or `full` at once, no
  12 h wait (the first pull is at full time, so core points appear within the
  worker interval);
- a later observation that is `full_ready` upgrades `simple` -> `full`
  (history in `app_private.fantasy_fixture_mode_changes`); `full` never
  downgrades.

A mode or observation change bumps `scoring_input_version` (existing triggers
`adaptive_observation_changed`, `adaptive_mode_changed`), the live-scoring
preparation picks a new calculation version, and the worker re-scores.

## 3. Progression design

### Why a flag and not a new status

`fantasy_gameweeks_one_current_idx` allows one gameweek per season in
`open/locked/live/provisional/finalizing`, and every scoring function accepts
`provisional`. Adding a status value would touch every one of them plus the UI
and generated types, and anything unaware of it would break silently. So the
closed gameweek **stays `provisional`** and gets `closed_at` and
`closed_calculation_version`; the unique index becomes
`... where status in (...) and closed_at is null`. Everything that gates on
`finalized`/`corrected` + `points_state = 'final'` (prizes, finalized
notifications, public recaps, Manager Card, price journal) is untouched and
therefore waits for the lock by construction.

### Table: what happens when

| Step                                                                         | Closed provisional (`closed_at` set)                                                                              | Locked (finalized)                                |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Trigger                                                                      | every counted match has core data, scoring published for the current inputs                                       | every counted match `FINAL`/`FINAL_LIMITED`       |
| Player points, team results, auto-subs, captain, chips effect, transfer hits | scored, **re-scored on every change**                                                                             | frozen (`final_points`, `final_score`)            |
| Gameweek / overall / league rankings                                         | recomputed after every re-score (the ranking function sums `coalesce(final, provisional)`)                        | final ranking calc, `calculated_at >= sealed_at`  |
| Free Hit restore                                                             | **done at close** (needs no points)                                                                               | already done, checked                             |
| Free transfer roll                                                           | **done at close**                                                                                                 | already done, checked                             |
| Chips                                                                        | nothing to reset: availability is `chip_already_used`, independent of finalization                                | `chip_uses.finalized_at` set                      |
| Price changes (transfer demand only, not points)                             | **done at close** (journal `fantasy_gameweek_close`); must precede the next opening (existing rule, prices guard) | adopted (never re-applied)                        |
| Team `current_gameweek_id`, carried lineup, team value                       | next gameweek prepared and opened (`service_prepare_next_fantasy_gameweek`)                                       | -                                                 |
| `gameweek_finalized` notifications                                           | **wait**                                                                                                          | enqueued, then postwork completed                 |
| Prizes (`service_evaluate_fantasy_prizes`)                                   | **wait** (gate `finalized` + `points_state final`)                                                                | evaluated                                         |
| Manager Card, public recap, final history                                    | **wait** (same gate)                                                                                              | run                                               |
| Observations from a re-pull                                                  | **accepted** (recorder only refuses `finalizing/finalized/corrected` or a sealed snapshot)                        | refused (`adaptive_reviewed_correction_required`) |
| Mode `simple` -> `full`                                                      | allowed                                                                                                           | locked                                            |

### Lock rules (`service_begin_fantasy_finalization` wrapper)

For staged gameweeks it additionally requires
`app_private.fantasy_staged_lock_ready(gw)`: every counted fixture `FINAL` or
`FINAL_LIMITED`, **and the previous gameweek already locked** (so a later
gameweek's prizes/overall ranking never rest on an earlier provisional one).
Refusal: `fantasy_staged_stats_not_final`, `fantasy_previous_gameweek_not_locked`.
Non-staged gameweeks behave exactly as before. The lock runs the existing
pipeline unchanged: seal, `finalize_team_results`, free hit/rollover (no-ops),
rankings, `complete_fantasy_gameweek`, then postwork (price pass **adopted**
from the close journal, notifications, complete) and prizes. The reviewed
correction path (`corrected`, 72 h) is untouched and still starts only from
`finalized`.

### Close pipeline (new RPCs, all service role, batched like finalization)

1. `service_begin_fantasy_close(gw, version, digest)`: gameweek `provisional`,
   staged policy on, no pending fixtures or players in the scoring document,
   snapshot current and persisted at `version`, every lineup has a result at
   `version`. Sets `closed_at`; creates the close journal.
2. existing `service_restore_free_hit`, `service_roll_fantasy_free_transfers`.
3. `service_run_fantasy_close_price_batch`: the existing price logic on the close
   journal (same cohort and cursor guards; a catalog trigger protects the cohort).
4. `service_complete_fantasy_close`: free hits restored, rollovers present for
   every locked lineup, prices complete. Then `service_prepare_next_fantasy_gameweek`
   accepts the predecessor, and the DB tick resumes an interrupted opening.

Worker (`fantasy-lifecycle-runner.ts`): a staged `provisional` gameweek is scored
and published; if not closed and ready it closes and opens the successor; if closed
it re-scores only when the inputs changed (`stagedRescoreNeeded`), and locks when
`stagedLockReady`. The orchestrator selects closed gameweeks too.

### Behaviours moved, and why

- Free Hit restore, free-transfer roll, price changes, opening of the next
  gameweek: from "after finalization" to "at close". None depends on points.
- `service_prepare_next_fantasy_gameweek`: predecessor may be closed provisional.
- `service_apply_fantasy_price_changes`: also for a closed provisional gameweek.
- Postwork at the lock skips the price pass (already applied). Re-applying would
  trip the cursor guard, so it is adopted, not repeated.
- Worker "already advanced" shortcut now also needs postwork complete (a locked
  gameweek whose successor is already open still owes notifications).
- Nothing moved for prizes, notifications, Manager Card, recaps: they wait.

## 4. App

Small label only, no redesign. `api.fantasy_gameweeks` and the points payload
expose `closedAt`. The Fantasy points screen shows "Provisional points: they can
still change until the gameweek is locked" (FR + AR in the dictionaries) for a
gameweek that is `provisional` and closed, next to the existing state text.

### Screen brief (AGENTS.md "Screen work")

- Preserve: layout, scoring display, existing state text and refresh behaviour,
  brand, RTL behaviour, all Fantasy rules.
- Improve: one added line of copy (FR/AR) when a closed gameweek's points are
  provisional.
- Acceptance: label shown only for closed provisional gameweeks, never for open,
  live, finalized; FR and AR strings exist and the dictionary test passes; no
  layout change; existing points tests pass.
- Validation not done here: **before/after screenshots and mobile/desktop and RTL
  visual checks could not be taken in this environment** (no browser/dev server
  run). They must be done on the draft pull request.

## 5. Request cost

Re-pull = 3 requests (incidents, lineups, statistics). Fewer was considered
(lineups + statistics reuse stored incidents) and rejected: it saves about 100
requests a month and would miss a late incident correction, which the final
pull must catch.

Per match (first pull already counted by the live lane): full coverage appears
5-16 days after the match, seen at the next 3-day pull.

- average (full at day ~10.5, seen day 12): re-pulls at 3, 6, 9, 12 = 4, plus the
  final pull day 15 = 5 pulls x 3 = 15 requests;
- worst with full coverage (full day 16, seen 18, final 21): 7 pulls x 3 = 21;
- never full (pulls 3..21, then `FINAL_LIMITED`): 7 x 3 = 21.

Month, 4 rounds x 8 matches = 32 matches: average 32 x 15 = **480**, worst
32 x 21 = **672**. Live and catalog lanes estimate about 5,210-5,500, so the
total is at most 5,500 + 672 = **6,172 of 10,000**, under the 8,000 warning.
The 9,000 stop in the due list protects the rest of the month.

## 6. Switches and rollout

- `app_private.fantasy_staged_stats_configure(season, enabled, from_gameweek)`
  (owner-run, refuses unless adaptive and live scoring are on for the season).
  Default off: with it off every function behaves as before.
- Edge: `SOFASCORE_STAGED_ENABLED=false` stops pulls; `SOFASCORE_STAGED_PULLS_PER_TICK`.
- AGENTS.md one-writer rule: the staged pulls write
  `app_private.fantasy_fixture_observations` and the staged tables from the
  `football-live-refresh` job; pause it with the other writers before a manual
  write to those tables.
- Observations recorded before activation have unknown coverage under the new
  definition, so they get an immediate re-pull (bounded by the per-tick cap).

## 7. Risks and owner decisions

- Several gameweeks can be closed at once (a 3-week lag); locks happen in order.
- `previous_rank` in rankings reflects the previous recompute, which now happens
  on every re-score.
- A fixture with a SofaScore observation but no staged row cannot exist (the
  trigger registers it); a fixture with a non-SofaScore latest observation is
  treated as settled.
- Owner decisions: activate the staged policy per season; accept the 28-day
  `final_pull_missing` and 21-day `FINAL_LIMITED` rules; confirm that points of
  `FINAL_LIMITED` matches stay in simple mode forever (no rules change).
