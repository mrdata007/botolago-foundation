# Scoring proof on staging (roadmap step 3)

Run on staging (`srdrflfrfpwixsllveid`) on 2026-10-04. **Production was not touched.**

## What this proves

One test gameweek, built entirely from synthetic data whose player identities are
complete, scored end to end by the **real** worker (`runFantasyLifecycle`, the code
the production workflow runs) through its own guarded database functions:

| Area           | What was checked                                                                                                                                                                                                                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ingestion      | Match 1 went through the new reconciled ingestion (`api.service_record_reconciled_fantasy_observation`): a dry run kept nothing, the write stored one observation and linked one match per provider, and a retry of the same request stored nothing new. Matches 2 and 3 went in as reviewed match sheets. |
| Player points  | Goals by position, clean sheets, goals conceded, saves, assists, yellow card, a player who did not play.                                                                                                                                                                                                   |
| Captains       | Plain captain ×2, triple captain ×3, captain who did not play → vice-captain ×2.                                                                                                                                                                                                                           |
| Substitutions  | Team B's starter who did not play was replaced from the bench (`outfield_did_not_play`).                                                                                                                                                                                                                   |
| Chips          | Triple captain (team C), bench boost (team D).                                                                                                                                                                                                                                                             |
| Standings      | Overall and league tables, gameweek and season.                                                                                                                                                                                                                                                            |
| What users see | Each manager's points page and the league page, read as that manager; one manager cannot read another's points.                                                                                                                                                                                            |

Every expected number was worked out by hand from the published v2.0 rules, not
read from the code under test.

| Team | Starting | Bench | Captain | Chip           | Total |
| ---- | -------- | ----- | ------- | -------------- | ----- |
| A    | 57       | 11    | 7       | —              | 64    |
| B    | 38       | 6     | 3       | —              | 41    |
| C    | 57       | 11    | 12      | triple captain | 69    |
| D    | 57       | 11    | 7       | bench boost    | 75    |

Standings: D 75, C 69, A 64, B 41.

## Result

- Worker: outcome `finalized`, 4 teams, calculation version 8, input digest
  `578f356bdf89e1a3e5c6c05e70e249650c95480c166f9a10f2792c26e3625ef0`.
- `verify.sql`: `{"verdict":"pass","failed":{},"checks":9}`.
- The automatic scorer on staging stayed off throughout
  (`lifecycle_tick_enabled = false`, heartbeat `disabled`), so only this run touched
  the test gameweek.

## Findings

1. **Team rank is never filled in.** `app.fantasy_team_gameweek_results.rank` and
   `overall_rank` are not written by any migration, so the points page always shows
   rank as empty. The standings tables themselves are correct. Production shows the
   same thing (6 results, 0 with a rank). Needs a small fix before launch.
2. **Prize pass not run.** The worker's last step (`service_evaluate_fantasy_prizes`)
   looks at every gameweek on the database, not just the test one, so it was
   deliberately left out on staging. It is not part of scoring.

## Files

All in `scripts/backend/scoring-proof/`:

| File                  | Purpose                                                                                                                                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `world.sql`           | Builds the synthetic world: 6 clubs, 3 finished matches, 4 managers in one league, reviewed identities for match 1 made through the real review workflow. Refuses to run unless `botolago.scoring_proof_environment` is `staging` or `local`, and refuses to run twice. |
| `match-1-request.ts`  | Builds match 1's ingestion request through the real reconciler and request builder from synthetic provider data.                                                                                                                                                        |
| `observations-sql.ts` | Prints the SQL that records the three matches (dry run, write, retry; then the two match sheets).                                                                                                                                                                       |
| `run-worker.ts`       | Runs the real worker, either straight against a local database (`--psql`) or one call at a time (`--replay calls.json`): each call is executed once by the operator, its answer recorded, and the worker restarted until it finishes.                                   |
| `verify.sql`          | Read-only checks (9). Prints `pass` or `fail` with the differences.                                                                                                                                                                                                     |

## How to run it again (local or a fresh staging)

1. In one transaction: `select set_config('botolago.scoring_proof_environment', 'staging', true);`
   then `world.sql`.
2. `bun scripts/backend/scoring-proof/observations-sql.ts > obs.sql`, then run it the same way.
3. Local: `bun scripts/backend/scoring-proof/run-worker.ts --psql "<args>"`.
   Remote: loop `--replay calls.json` → run `calls.json.next.sql` once → append the answer.
4. Run `verify.sql`.

## Left on staging

Everything the proof made has ids starting `fb5c0000-` and names containing
"Scoring Proof": 4 test users (`@staging.botolago.invalid`, cannot receive mail),
their teams and league, the test competition and gameweek, 3 observations, 2 match
links, and 4 queued "gameweek finished" notices. The review-workflow rows for the 22
test identities stay too, because that workflow does not allow deletion by design.
