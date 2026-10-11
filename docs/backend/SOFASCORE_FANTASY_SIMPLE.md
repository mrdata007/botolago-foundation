# SofaScore-only Fantasy scoring

Status: code only, nothing applied or run. Owner decisions of 2026-10-11:

- **M6**: SportsMonks is unpaid. Fantasy player points come from SofaScore
  alone. No second provider, no cross-check, no pairing. Flashscore is not
  used anywhere in this path (code, migration, workflows).
- **M8**: minutes, started, goals, own goals, cards, clean sheet and goals
  conceded always count. Assists, saves, penalties saved and penalties missed
  are scored from SofaScore **when available**: on a full-coverage match (the
  player statistics carry `totalPass`) they count and the fixture can reach
  FULL mode. On a limited-coverage match they are UNKNOWN, never written as
  zero, and the fixture scores in SIMPLE mode. An assist may also come from an
  incident's `assist1` where present. One named switch,
  `SOFASCORE_DETAIL_FIELDS_ENABLED` in `src/backend/fantasy/sofascore-fantasy.ts`,
  is ON.

The Fantasy ruleset, the scoring worker, the recorder and the gameweek
lifecycle are unchanged.

## Landing path: A (adaptive observations)

Chosen: **A, a SofaScore-only wrapper in front of the existing adaptive
recorder.** B (a SofaScore variant of the legacy current-performance ingest) is
rejected.

Evidence:

- `api.ingest_current_player_fixture_performance`
  (`20261004120000_current_fixture_left_out_players.sql:158`) is hard-coded to
  provider `sportsmonks`, season `28647`, and its coverage source version must
  match `^sportsmonks-current-fixture:` (`:65`, `:94`). It writes
  `assists` and `saves` into the player performance row (`:442-450`) and
  requires them in its field loops (`:253-258`). A SofaScore variant would write
  those columns as plain numbers with no per-field "unknown", so a limited
  match could not leave them unknown, and it would need a new ruleset or new
  scoring changes to leave them out. That cannot be done "without changing the
  ruleset", so B is out.
- Path A already has the per-field model M8 needs. The recorder
  (`api.service_record_fantasy_observation`, `20260927094823` / `20261003180000`)
  takes per-field evidence in state `verified` or `unknown`, computes
  `full_ready` and `simple_ready`, and the scoring worker scores each category
  only if its fields are certified. Simple mode drops `assist`, `saves`,
  `penalty_save`, `penalty_miss` in the worker
  (`20260927094823_adaptive_fantasy_scoring.sql:350`;
  `adaptive-scoring.ts:26,133`). An unknown field is simply absent, never zero.
- Fewest production steps: one new function, one migration, no change to the
  recorder, the ruleset or existing data.

### What is new

| File                                                                    | What                                                                                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `supabase/migrations/20261011120000_sofascore_fantasy_observations.sql` | `api.service_record_sofascore_fantasy_observation(fixture, request, dry_run)`, service role only       |
| `src/backend/fantasy/sofascore-fantasy.ts`                              | pure builder: one SofaScore match + reviewed SofaScore mappings -> request, blockers, mapping worklist |
| `scripts/backend/sofascore-fantasy-simple-lib.ts`                       | selection, report, plan hash, SQL text (pure)                                                          |
| `scripts/backend/sofascore-fantasy-simple-ingest.ts`                    | runner: `report` (read only), `rehearse`, `apply`                                                      |
| `.github/workflows/sofascore-fantasy-simple-{read,rehearsal,apply}.yml` | owner-pinned production workflows                                                                      |
| `supabase/tests/database/sofascore_fantasy_observations.test.sql`       | pgTAP                                                                                                  |

The migration depends on `20261003180000_reconciled_provider_observations.sql`
(the recorder's `provider-reconciled` source and flag, and
`app_private.football_provider_fixture_links`) and refuses to apply without it.
Observations are stored under that existing source label; the evidence says
`sofascore` and the request carries only `sofascoreEventId`.

### What the database function checks

Beyond everything the recorder already checks (finished and finalized fixture,
adaptive policy enabled for the gameweek, gameweek not finalizing, score equals
the fixture's, 11 starters a side, team membership, no reviewed correction
overridden, retries dedupe by digest):

- the fixture is the one an **active SofaScore fixture mapping** names for that
  event id;
- every player's SofaScore id is an active, **reviewed** SofaScore player
  mapping to exactly the app player the row names;
- evidence is `sofascore` and `verified` or `unknown` only: estimates and any
  other source are refused;
- on a `limited` request `saves`, `penaltiesSaved` and `penaltiesMissed` can
  never be a fact or carry a value (an assist can, only when an incident names
  the assister). So a limited match can never reach full mode;
- one SofaScore match per fixture and one fixture per match;
- the squad members of the two teams who are not in the rows are derived by the
  database as verified non-participants (the caller cannot supply them). The
  builder sends a row for everyone SofaScore says appeared, and refuses the
  match otherwise, so absence from the rows means absence from the pitch.

### How the builder reads SofaScore

- **Identity**: reviewed SofaScore mappings only. An appearing player (starter
  or substitution incident `playerIn`) with no mapping **holds the whole match
  back** (`unmapped_players`) and goes on the worklist (SofaScore id, side, shirt
  number, started, position; never a name). An unmapped bench player who never
  came on is ignored.
- **Goals** come from incidents, never lineup statistics (they undercount). Each
  side's goal incidents must equal the final score.
- **Minutes, clean sheet, goals conceded**: from substitution and dismissal
  incidents (`deriveParticipation`), checked against `minutesPlayed` with the
  documented tolerance (SofaScore may run up to 6 over and 2 under). A player
  who does not fit holds the match back (`minutes_mismatch`,
  `timeline_unresolved`).
- **Held for review, never guessed**: an unknown score-relevant incident label
  (an own goal has never been seen), a lineup `ownGoals` no incident explains, a
  second yellow card (whether the first yellow is also listed is unestablished,
  and the recorder refuses an overlap), an incident naming a player not in the
  lineup.
- **Detail fields (M8)**, full coverage: assists when the lineup statistic and
  the incidents agree (else unknown); penalties missed when the incidents and
  the lineup statistic agree; a goalkeeper's saves from SofaScore's count when
  saves + goals conceded equals shots on target faced (else unknown);
  penalties saved are 0 only when no penalty was missed against his team (else
  unknown, because a miss may have been a save). Limited coverage: unknown, but
  an assister named by an incident gets that count.

The plan hash ignores observation timestamps, so it is stable between a report,
a rehearsal and the apply, and changes if SofaScore's data, the mappings or the
selection change.

## What the owner must run, in order

Nothing below has been run. Production writes are owner-run only.

1. **Check the prerequisite migration**:
   `select version from supabase_migrations.schema_migrations where version in ('20261003180000','20260927094823');`
   If `20261003180000` is missing, apply it first through its guarded script
   `scripts/backend/apply-20261003180000-reconciled-provider-observations.sql`.
2. **Apply `20261011120000`** through the reviewed migration path
   (`docs/backend/RELEASE_ACTIVATION_MIGRATION_RUNBOOK.md`). It adds one
   function and changes no data.
3. **Check adaptive scoring is activated for the gameweek**
   (`app_private.fantasy_adaptive_policy` has a row for the season with
   `from_gameweek <= 3`; if not, activate with
   `api.service_activate_adaptive_scoring` after `api.service_adaptive_scoring_audit`).
   The write refuses with `adaptive_policy_not_enabled` otherwise, and once the
   gameweek is `finalizing` the mode is locked. The report below shows each
   fixture's state.
4. **Run the read-only report** (workflow `SofaScore Fantasy simple ingestion
(production, read only report)`, round 3). It lists fixtures ready (and in
   which mode), fixtures held back with reasons, the number of players that would
   be scored, and the **unmapped-player worklist**. It does not call the database
   function.
5. **Review the unmapped players** through the reviewed mapping flow until the
   fixtures you want are ready. Each unmapped appearing player holds a fixture
   back. Re-run the report.
6. **Pause the writers** (AGENTS.md "One writer at a time"): the email/results
   and season refresh with `app_private.notification_email_configure('off', null, null, false)`,
   the Fantasy tick with `app_private.fantasy_automation_configure(false)`, and
   the other jobs listed there that touch fixtures or Fantasy tables. The
   workflows refuse unless the live refresh, email mode and lifecycle tick are
   off, and no other run is active.
7. **Rehearse** (workflow `...rehearsal`, confirmation
   `REHEARSE_SOFASCORE_FANTASY_PRODUCTION`, round 3). One DO block calls the
   function for every ready fixture and ends in a deliberate raise carrying the
   result out; it then re-reads and proves the rollback held. It prints the plan
   sha256.
8. **Apply** (workflow `...apply`, confirmation
   `APPLY_SOFASCORE_FANTASY_PRODUCTION`, the approved `plan_sha256`). It
   re-fetches, refuses if the plan hash changed, writes once, never retries, and
   verifies from a fresh read.
9. **Restore the writers** you paused. The Fantasy tick then turns the
   observations into points as it does for every source.

A write run takes at most 12 fixtures and needs a round.

## Risks

- Fixtures with unmapped appearing players are held back entirely until mapped;
  with ~191 reviewed player mappings many fixtures will be blocked at first.
  The worklist is the review queue.
- Fixtures with an own goal or a second yellow are held for review: no incident
  label for an own goal has been observed, so it is not guessed.
- Penalty saves are unknown whenever a penalty was missed against a team, so
  such fixtures score in simple mode.
- Observation source label is `provider-reconciled` (the recorder's existing
  provider source); the evidence, request and links identify SofaScore.
- The pgTAP test was written but could not be run here (no Docker daemon); CI's
  `database-quality` job is the authority.
- SofaScore is a single source: nothing cross-checks it. The internal checks
  (goals add up to the score, minutes vs substitutions, saves + conceded vs shots
  on target, lineup vs incident assists) are the only guards.
