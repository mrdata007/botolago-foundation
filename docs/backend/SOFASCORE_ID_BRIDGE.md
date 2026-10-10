# SofaScore ID bridge

Phase P3 of [SOFASCORE_FULL_MIGRATION_PLAN.md](SOFASCORE_FULL_MIGRATION_PLAN.md).
It attaches SofaScore ids (competition `937`, season `102220`) to the **same**
internal competition, season, round, team and fixture rows that SportsMonks
already maps, in `app_private.football_provider_mappings`. It never creates a
fixture, team, round or season.

- Logic (pure, tested): `src/backend/football/sofascore-id-bridge.ts`
- Runner: `scripts/backend/sofascore-id-bridge.ts` (dry-run by default)
- Team pairing: `src/backend/football/sofascore-team-table.ts`

## Matching rules

A fixture matches an event when the season, the internal home and away teams
and the kickoff calendar date in `Africa/Casablanca` agree. With no date match,
a fixture still matches when exactly one fixture exists for that home/away pair
in the round and the event is in the same round; it is flagged
`matched_by_round`. Nothing else is guessed: 0 matches, 2+ matches, or one event
wanted by two fixtures are reported and not mapped.

Postponed matches get a **new event id** when replayed. Within one
home/away/round group a `postponed` event is ignored when a non-postponed one
exists. If only postponed events exist, the newest (start time, then id) is
mapped and flagged `postponed_only`. A fixture already mapped to an old
postponed id whose replacement now exists is reported as a **re-point**.

Round external ids are `102220:<round number>` (the event list carries a round
number, not a round id).

## Re-points need a decision

`unique (provider_name, entity_type, internal_entity_id)` allows one SofaScore
mapping per internal fixture, and `api.resolve_football_mapping` only inserts or
confirms; it raises `MAPPING_COLLISION` rather than move a mapping. Apply mode
therefore **refuses to run while re-points are pending** and writes nothing.
Moving one needs a reviewed owner-run step (or a new RPC); that is an open
question for the owner.

## Team table

SofaScore team ids come from `CLUB_PROVIDER_TEAMS` in
`src/backend/football/identity/club-registry.ts` (cross-checked against the
2026-10-10 standings: all 16 ids agree). The repo holds no internal team uuids,
so `REVIEWED_INTERNAL_TEAM_IDS` is empty (TODO owner review). Supply the
reviewed pairing as `--teams teams.json`: `{"55035": "<app.teams.id>", ...}`.
Teams absent from the table are listed under `teamsMissingFromTable`.

## Dry run (reads only)

The runner makes no provider call and, in dry-run, no database connection. You
give it files.

1. Save the SofaScore events for 937/102220 (all pages) to `events.json`.
2. Run this read-only SQL on staging and save the result as `snapshot.json`
   (`{fixtures, rounds, existing}`):

```sql
select jsonb_build_object(
  'fixtures', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'kickoffAt', f.kickoff_at, 'roundNumber', r.round_number,
      'homeTeamId', f.home_team_id, 'awayTeamId', f.away_team_id)), '[]')
    from app.fixtures f left join app.rounds r on r.id = f.round_id
    where f.season_id = :'season_id'),
  'rounds', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'roundNumber', round_number)), '[]')
    from app.rounds where season_id = :'season_id' and round_number is not null),
  'existing', (select coalesce(jsonb_agg(jsonb_build_object(
      'entityType', entity_type, 'externalId', external_id,
      'internalId', internal_entity_id)), '[]')
    from app_private.football_provider_mappings
    where provider_name = 'sofascore' and active
      and entity_type in ('competition','season','round','team','fixture'))
);
```

3. `bun scripts/backend/sofascore-id-bridge.ts --events events.json --snapshot snapshot.json --teams teams.json --competition-id <uuid> --season-id <uuid>`

It prints counts and ids only. Exit 0 is clean, 2 means the report has items to
review (those are never mapped).

## Apply (staging only)

Apply writes mapping rows, so the one-writer rule in
[AGENTS.md](../../AGENTS.md#one-writer-at-a-time-per-database) applies in full.
Before running:

1. List running agents, workflows and scheduled jobs; wait for any writer.
2. Record the current settings, then pause:
   - `select app_private.notification_email_configure('off', null, null, false);`
     (live refresh, season refresh and results emails)
   - `select app_private.fantasy_automation_configure(false);` (Fantasy tick)
   - `select app_private.pepites_configure('off', null);` and
     `select app_private.manager_card_configure(false, null);` where those
     migrations are applied (they read fixtures).
3. Take a baseline count of sofascore rows in `football_provider_mappings`.
4. Run with `--mode apply`, `SUPABASE_URL` (staging; the production ref
   `tkewgajrljbwgwedqsxn` is refused), `SUPABASE_SECRET_KEY` and
   `SOFASCORE_ID_BRIDGE_CONFIRMATION=ATTACH_SOFASCORE_IDS_ON_STAGING`.
5. Re-read the count, compare with the plan, restore every paused setting.

The runner calls only `api.resolve_football_mapping`, which is idempotent for a
mapping that already points at the same target. Production is not in scope; it
goes through the release runbook, owner-run.

## Running it from GitHub Actions (staging)

Workflow: `.github/workflows/sofascore-id-bridge-staging.yml`
(`workflow_dispatch` only, environment `staging-load-test`, concurrency group
`phase6-staging-load-test`). GitHub lists a dispatch workflow only once it is on
`main`, so it can be run only after it is merged, which needs owner approval.

It reads staging with the secrets and variables the other staging workflows
already use: `SUPABASE_ACCESS_TOKEN` and `vars.SUPABASE_STAGING_PROJECT_REF`
(Supabase Management API, one `select`), plus `RAPIDAPI_KEY` for SofaScore. No
new secret. `scripts/backend/sofascore-id-bridge-fetch.ts` writes `events.json`
(every page of `get-last-matches` and `get-next-matches` for 937/102220),
`snapshot.json` and `ids.json`. The Botola 2026/27 season is the single
`botola-pro*` season labelled 2026/27; any other count stops the run. Logs hold
counts and ids only, no player names.

Three modes (input `mode`):

| Mode            | Writes       | What it does                                                   |
| --------------- | ------------ | -------------------------------------------------------------- |
| `propose-teams` | no           | Suggests `{sofascoreTeamId: internalUuid}` for the 16 clubs    |
| `dry-run`       | no           | Plans the mapping rows for the `teams` JSON, prints the report |
| `apply`         | staging only | The same plan, written through `api.resolve_football_mapping`  |

### Dispatch steps

1. **Propose.** Run with `mode=propose-teams`. The step summary shows the
   proposal and, per SofaScore team, the vote counts and a status
   (`proposed`, `too_little_evidence`, `conflict`, `duplicate_internal_team`,
   `no_evidence`). A fixture is evidence only when it pairs with exactly one
   event (same round, same Casablanca date, same kickoff instant when several
   events share the date). A team is proposed only with at least 3 such fixtures
   all pointing at one internal team. Anything else is listed, never guessed.
2. **Owner approval.** The owner reads the proposal and approves, edits or
   rejects each pairing. Nothing applies it automatically.
3. **Dry run.** Run with `mode=dry-run` and the approved JSON in `teams`. Read
   the report: no-match, multi-match, conflicts and re-points must be understood.
4. **Apply.** Only with the owner's go-ahead, and after the one-writer checks and
   pauses listed under "Apply (staging only)". Run with `mode=apply`,
   `confirmation=ATTACH_SOFASCORE_IDS_ON_STAGING` and the same `teams`. The
   workflow first runs `scripts/backend/staging-writer-guard.py`, and the Management
   API path refuses the production ref. Apply refuses to run while re-points
   are pending.
5. Compare the sofascore mapping count before and after, then restore every
   paused setting.

Locally, `--mode propose-teams|dry-run|apply` take the same files; apply also
accepts `SUPABASE_URL` + `SUPABASE_SECRET_KEY` instead of the Management API
variables.

## Players are not bridged here

Player mappings stay on the reviewed mapping process (the RPC itself refuses
SofaScore player mappings with `MAPPING_REVIEW_REQUIRED`).
