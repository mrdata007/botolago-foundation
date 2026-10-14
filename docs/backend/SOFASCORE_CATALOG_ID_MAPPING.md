# SofaScore catalog ID mapping (one time, SportsMonks to SofaScore)

Owner rule: **never match players or clubs by name; use SofaScore ids.** This is
the one-time mapping of the existing club and player catalog from SportsMonks
ids to SofaScore ids, plus a list of everything that could not be mapped, for
the owner to review. It is read only by default and never applies itself.

- Logic (pure, tested): `src/backend/football/sofascore-catalog-mapping.ts`
- Report and apply-script rendering: `src/backend/football/sofascore-catalog-mapping-output.ts`
- Runner: `scripts/backend/sofascore-catalog-id-mapping.ts`
- Workflow: `.github/workflows/sofascore-catalog-id-mapping-production-read.yml`

## Audit of what exists (2026-10-13, from the code; production data not seen)

The agent that wrote this could not read production, so no coverage percentage
is quoted. The workflow below reports it (`inputs.catalogClubs`,
`existingSofascore*Mappings`, `players.existingUnverified`, and the proposal
statuses `already_mapped` / `new`).

What the repository holds:

- **Clubs.** `app_private.football_provider_mappings` gets a SofaScore `team`
  mapping from the ID bridge ([SOFASCORE_ID_BRIDGE.md](SOFASCORE_ID_BRIDGE.md)),
  from the owner-approved `{sofascoreTeamId: internalUuid}` JSON. The 16 Botola
  2026/27 clubs are in `CLUB_PROVIDER_TEAMS`
  (`src/backend/football/identity/club-registry.ts`). Clubs outside that
  season have no SofaScore evidence at all.
- **Players.** `api.service_sofascore_auto_map_players` (migration
  `20261011130000`) links players while a SofaScore match is read, and queues the
  rest for `/admin/football/sofascore-players`
  ([SOFASCORE_PLAYER_MATCHING.md](SOFASCORE_PLAYER_MATCHING.md)). Only players
  who appeared in a SofaScore match the live path has read can be linked.
  `api.resolve_football_mapping` refuses SofaScore player mappings
  (`MAPPING_REVIEW_REQUIRED`, migration `20261001161000`).

### The existing player auto-matcher decides BY NAME

It does. Production behaviour is review-gated for the doubtful cases, but the
two automatic paths rest on names. Nothing was changed in this lane. Where, in
`supabase/migrations/20261011130000_sofascore_player_auto_map.sql`:

| Lines   | What                                                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 326-331 | Two SofaScore players on a side with the same normalised name are queued (`duplicate_name_in_squad`).                                                               |
| 345-346 | `v_key := app_private.person_name_key(v_name)` and `v_last`: the SofaScore name and its last word become the match key.                                             |
| 369-391 | Squad candidates carry `name_hit` (`v_key = any(keys)`, keys from `full_name`, `first_name + last_name`, `display_name`) and `last_hit` (last word of those names). |
| 400-401 | One candidate with an equal name key: linked automatically, method `exact-name`.                                                                                    |
| 404-410 | One candidate with the same last name AND same shirt, position not disagreeing: linked automatically, method `name-and-shirt`.                                      |
| 412-413 | A partial (last-name only) hit is queued with `partial_name`.                                                                                                       |
| 469     | The function comment says it: "maps ... only on an exact, unambiguous name (or last name plus shirt number)".                                                       |

Only `exact-name` is name-only; `name-and-shirt` still needs a name (the last
word) to agree. The ids in the review list are never invented, and an existing
link is never overwritten, but a wrongly spelled pair of identical names is not
caught by anything except the "two with the same name on one side" rule.

**Proposal (not made).** Replace the name key by the evidence this runner uses:
same side, same shirt, compatible position and the mapped club, confirmed in at
least two matches (`PLAYER_STRONG_MATCHES`), with the name only displayed in the
review queue. A migration for that would need its own review and a pgTAP run;
it is not part of this lane. Until then, the matcher and this runner can coexist:
the apply script below refuses any pair where either side already has a mapping
row.

## How the runner decides

No function compares, normalises or searches a name. Names are optional
`displayName` fields copied to the report.

### Clubs

Fixtures mapped on **both** providers (finished, active fixture mappings for
`sportsmonks` and `sofascore`) give, for each side, the SportsMonks team id (via
the SportsMonks team mapping of the internal home/away team) and the SofaScore
team id (from the SofaScore event mapped to the fixture, read from the event
list). A SportsMonks team and a SofaScore team are the same club when they sit
on the same side in the same fixtures, consistently:

- a SportsMonks team seen with two different SofaScore teams: `conflicting_sofascore_teams`;
- one SofaScore team seen with two SportsMonks teams: `sofascore_team_claimed_by_other_club`;
- fewer than `CLUB_MIN_AGREEING_FIXTURES` (2) agreeing fixtures: `too_little_evidence`;
- an existing active SofaScore mapping that differs: `conflicts_with_existing_mapping`;
- no shared fixture: `no_shared_fixtures`; no SportsMonks mapping: `no_sportsmonks_mapping`.

Two is the floor because one fixture shows one home and one away pairing and
nothing else.

### Players

SportsMonks lineups are **stored** (`app.lineups` / `app.lineup_players`, with
shirt number and position, keyed by the internal player). SofaScore lineups are
**not** stored durably: `app_private.sofascore_fantasy_attempts.match_data` holds
the trimmed replies only for `held` fixtures and is dropped once the observation
is recorded, so it cannot cover the catalog. The runner therefore makes **one
`matches/get-lineups` request per fixture** mapped on both providers (plus the
event list pages), through the existing `RapidApiClient`, and reports the count
(`inputs.sofascoreRequests`). `--max-lineup-requests` (default 300; a Botola
season is 240 fixtures plus about 10 event pages) stops the run before it
overspends quota.

A SportsMonks player and a SofaScore player are the same person when, in a
fixture mapped on both providers:

1. they are on the same side;
2. they wear the same shirt number (unique on a side; a repeated shirt in either
   lineup is `duplicate_shirt_in_lineup` and blocks);
3. their positions are compatible (equal, neighbouring lines D-M or M-F, or one
   is unknown; a goalkeeper only matches a goalkeeper);
4. the player's club in the lineup is the mapped club of that side
   (`club_unmapped` / `club_mismatch` otherwise), so club mapping runs first;

and the pairing is the only one either person has anywhere:

- two SofaScore candidates for one player: `ambiguous_multiple_sofascore_candidates`;
- one SofaScore player claimed by two: `sofascore_player_claimed_by_multiple`;
- both appear in a match but disagree there (other shirt, other side, incompatible
  position): `contradicted_in_match`;
- the SofaScore id already belongs to another player (any row, active or not),
  or the player has a different mapping: `sofascore_id_mapped_to_other_player` /
  `conflicts_with_existing_mapping`.

**Threshold.** `PLAYER_STRONG_MATCHES = 2`: two or more matches is
`multi_match`. `PLAYER_MIN_MATCHES = 1`: one match with no conflict anywhere is
accepted as `single_match`. In one match, side plus shirt is a one-to-one
pairing, so the remaining risk is a wrong shirt number in one provider's data,
which a second match would expose; single-match pairs are therefore marked and
the apply script **leaves them out unless you pass `--include-single-match`**.

A catalog player who never appears in a mapped lineup is `no_lineup_evidence`,
with no SportsMonks mapping `no_sportsmonks_mapping`.

### Limits

- Evidence exists only for fixtures mapped on both providers, which today means
  the current Botola season. Players of other seasons stay unmapped
  (`no_lineup_evidence`) and need the normal review queue.
- A mid-season shirt change makes `contradicted_in_match`; it goes to review.
- Unused substitutes with a shirt number are covered (lineups include the bench).

## Running the report (read only)

GitHub lists a dispatch workflow only once it is on `main`.

1. Dispatch **SofaScore catalog ID mapping (production, read only report)** from
   `main` as `mrdata007`, with `expected_commit` the full SHA. Optional inputs:
   `max_lineup_requests` (default 300), `show_names` (default off; see below).
2. The step summary shows counts, the clubs and the first 60 rows of each player
   table. The artifact `sofascore-catalog-id-mapping-<run id>` (14 days) holds
   `report.json`, `report.md` (full tables), `summary.md` and `run.log`. On
   failure the last 40 lines of the log are written to the summary, so the reason
   is visible without opening the artifact.
3. Read the UNMAPPED tables. Each row has the internal id, the SportsMonks id,
   the best evidence and a reason code. This is the list for owner review; it
   can only be produced from production data.

`show_names` adds club and player names (catalog and SofaScore) to the artifact
**for reading only**. The repository is public and the previous convention was
ids only in logs, so it is off by default; the summary never carries names.
Running the script locally with `--show-names` keeps names on your machine.

The same run locally (read only):

```
RAPIDAPI_KEY=… SUPABASE_ACCESS_TOKEN=… SUPABASE_PRODUCTION_PROJECT_REF=… \
  bun scripts/backend/sofascore-catalog-id-mapping.ts --read-production --out-dir out
```

## Applying (owner-run, nothing automatic)

1. Decide the unmapped rows: fix by hand through the normal review (the
   `/admin/football/sofascore-players` queue or a mapping proposal), or leave them.
2. Generate the script from the report you read, locally:

   ```
   bun scripts/backend/sofascore-catalog-id-mapping.ts --from-report out/report.json \
     --emit-sql --out-dir out --owner-auth-user-id <your auth.users.id> \
     [--include-single-match]
   ```

   Read `out/apply.sql`. It contains ids only.

3. Follow [AGENTS.md](../../AGENTS.md#one-writer-at-a-time-per-database): list
   running agents, workflows and scheduled jobs, pause the cron writers that
   touch fixtures and players, record the previous settings. Production writes
   follow `CLAUDE.md` ("Production database writes") and the release runbook;
   the authorisation covers this operation only.
4. Run the script in the SQL editor **as is**. `c_commit` and
   `c_one_writer_checked` are `false`: the first run fails with a guard until you
   set `c_one_writer_checked`, then it runs every guard and every insert and ends
   with `DRY_RUN_ROLLBACK: would insert N club mapping(s), M player mapping(s)…`.
   The whole `DO` block rolls back. Re-read the mapping counts to confirm.
5. Set `c_commit` to `true` and run again. Then restore the paused settings.

What the script writes: club mappings (`sofascore-catalog-map:<digest>`) and
player mappings written **the way `api.admin_resolve_sofascore_player_match`
writes them** (a `staff-resolution` row in `sofascore_player_match_log` plus a
mapping with `sofascore-admin-resolve:<log id>` and `corrected_by` = your
account), so Fantasy's "active and reviewed" check accepts them; queue rows for
those players are closed. It is a script, not that RPC, because the RPC needs a
signed-in AAL2 staff session and one queue row per player, and the existing
`api.resolve_football_mapping` refuses SofaScore players by design. It takes the
auto-matcher's advisory lock, and refuses (writing nothing) if the SofaScore
team/player mapping counts differ from the report, a SportsMonks mapping changed,
or either side already has a SofaScore row. A guard that fires means production
moved since the report: regenerate the report, do not edit the guard.

No migration is needed, so none was added. pgTAP was not run (no Docker in the
authoring environment); the script has not been executed against any database,
only rendered and checked by unit tests. Do the rollback dry run first.

## Tests

`bun test src/backend/football/sofascore-catalog-mapping.test.ts scripts/backend/sofascore-catalog-id-mapping.test.ts`
covers club mapping by side agreement, player mapping by side + shirt + position,
conflict to unmapped, identical names with different shirts/sides not merged, a
name difference not blocking a match, the SELECT-only queries, the request cap
and the workflow's guards.
