# Fantasy scoring worker runbook

## Status and safety boundary

This proposal makes gameweek scoring manually runnable once a complete,
canonical provider snapshot exists. It deliberately installs **no cron, no
recurring GitHub schedule, and no automatic production activation**.

The Edge Function is service-to-service only. `verify_jwt = false` is
intentional because this proposal authenticates the caller in the handler with
an independent, random `FANTASY_SCORING_WORKER_KEY` supplied only in the
dedicated `x-botolago-scoring-key` header. The standard `apikey` header is not
used for this custom secret. The handler rejects a missing or shorter-than-32
character trigger secret before reading the body.

The database credential is separate: only the deployed function reads the
platform-provided `SUPABASE_SERVICE_ROLE_KEY` and uses it to create the
Supabase client. That credential is never copied into GitHub and never leaves
the function. Neither secret may be exposed to the browser or application
bundle.

## What the worker proves

Each request contains one immutable manifest for one gameweek. Validation
fails before any RPC when any of these invariants is missing:

- canonical lowercase UUIDs and strictly sorted, duplicate-free fixtures,
  players, event categories, and active league IDs;
- one to 50 assigned fixture snapshots;
- 22 to 100 mapped Fantasy players per fixture;
- exactly two football teams and exactly 11 declared starters for each team;
- official participation (`didPlay`, `minutesPlayed`) with zero minutes when a
  player did not play;
- at most 32 unique launch-v1 point categories per player and at most 1,000
  point events per fixture;
- no disabled `bonus` or `player_of_match` categories;
- a monotonic non-negative `footballInputVersion` per fixture;
- a reviewed calculation version and a SHA-256 digest over the canonical JSON.

The execute confirmation is bound to that digest:

`FINALIZE:<gameweek UUID>:v<calculation version>:<first 12 digest characters>`

Database guards remain authoritative. In particular, fixture replacement
requires an assigned, finished, football-finalized fixture and mapped Fantasy
players from its two canonical clubs. Player finalization requires every
points-counting assignment to have a complete current snapshot at the same
calculation version. Gameweek completion additionally requires all player and
team rows, Free Hit restoration, transfer rollover, global rankings, and every
active league ranking scope.

## Ordered execution

The worker runs the following stages and stops at the first error:

1. validate the exact database gameweek/season, assigned fixture set,
   calculation version, and complete active-league set;
2. begin a private `finalize_gameweek` job ledger row;
3. atomically replace every fixture snapshot;
4. probe completion so an exact finalized replay exits before any downstream
   materialization;
5. page player-point finalization when the probe returns only the expected
   `gameweek_not_finalizable` response;
6. page team-result and automatic-substitution materialization;
7. page team-result finalization;
8. page Free Hit restoration;
9. page free-transfer rollover;
10. recalculate global gameweek and overall rankings;
11. recalculate gameweek and overall rankings for every supplied active league;
12. complete the gameweek and the private job ledger.

Every paged call must return a strictly advancing cursor or a non-zero
cursorless batch while `hasMore` is true. Otherwise the worker fails closed.
The page budget is bounded by `FANTASY_SCORING_MAX_PAGES_PER_PHASE` (default
50, maximum 500).

The companion lifecycle patch is required for safe replay. It permits a
fixture RPC during `finalizing` or `finalized` only when the current snapshot's
fixture, gameweek, calculation version, football input version, and digest all
match exactly. It also moves `locked`/`live` to `provisional` only after the
player-finalization RPC proves that every assigned fixture is final and has a
complete version-matched snapshot. Re-running the same manifest after a
timeout therefore continues safely; changing it after finalization starts is
rejected.

## Canonical manifest

Store reviewed manifests only under:

`docs/production/fantasy-scoring-manifests/<gameweek>.json`

The shape is:

```json
{
  "schemaVersion": 1,
  "seasonId": "<fantasy season UUID>",
  "gameweekId": "<fantasy gameweek UUID>",
  "calculationVersion": 1,
  "fixtures": [
    {
      "fixtureId": "<canonical app fixture UUID>",
      "footballInputVersion": 1800000000000,
      "players": [
        {
          "fantasyPlayerId": "<canonical Fantasy player UUID>",
          "footballTeamId": "<canonical app team UUID>",
          "started": true,
          "didPlay": true,
          "minutesPlayed": 90,
          "events": [{ "category": "appearance", "points": 2 }]
        }
      ]
    }
  ],
  "leagueIds": ["<every active private/public league UUID>"]
}
```

`events` are point events already derived by the reviewed v1 scoring engine,
not raw SportsMonks events. The upstream adapter must retain the raw provider
payload and its digest for audit. It must calculate these categories only:

`appearance`, `goal`, `assist`, `clean_sheet`, `goals_conceded`, `saves`,
`penalty_save`, `penalty_miss`, `yellow_card`, `red_card`,
`second_yellow_dismissal`, and `own_goal`.

## Promotion checklist

1. Apply the scoring materialization migration, including its replay lifecycle
   guards and exact scoring-scope validation RPC, to a local database.
2. Run the pgTAP database suite, database lint, migration validation, generated
   type generation/check, typecheck, and the worker's Bun tests.
3. Merge the Edge Function and the `supabase/config.toml` fragment.
4. Generate a random trigger secret of at least 32 characters and set it as the
   Edge Function secret `FANTASY_SCORING_WORKER_KEY`. Confirm the deployed
   function also receives the platform-provided `SUPABASE_SERVICE_ROLE_KEY`;
   do not reuse either value for the other role.
5. Deploy `fantasy-scoring-worker`; do not add a schedule.
6. Add only the trigger secret as the protected GitHub environment secret
   `FANTASY_SCORING_WORKER_KEY`. Keep production URL/ref/name as protected
   environment variables.
7. Build and review the canonical manifest. Run the workflow with
   `execute=false` first and retain its digest and confirmation.
8. Dispatch again on the exact reviewed `main` commit with `execute=true`, the
   same digest, and the exact digest-bound confirmation.
9. If an invocation times out or exhausts a page budget, rerun the identical
   manifest. Never increment the input or calculation version just to retry.

## Remaining activation inputs

### SportsMonks/provider blockers

As of 2026-08-25, the worker cannot receive a trusted production manifest
because:

- the configured 2026/27 SportsMonks catalog has returned zero rounds and zero
  teams, with no current-season fixture sample;
- the current fixture ingestion request includes only
  `participants;state;scores`;
- the SportsMonks adapter still marks lineups, match events, and match
  statistics unsupported;
- there is no verified production mapping from every current-season provider
  player to `app.fantasy_players`;
- no source currently supplies, for every final fixture, the complete mapped
  match squad, exactly 22 starters, official minutes/did-play state, official
  assists, goals/cards/own goals, saves and penalties, and goals conceded;
- no trusted upstream process currently derives the launch-v1 point events
  from those facts and assigns a monotonic correction version.

For each points-counting final fixture, the required provider output is the
canonical app fixture ID, a monotonic source/correction version, the complete
mapped player set and two club IDs, exactly 11 starters per club, `didPlay` and
official minutes for every player, and enough official facts to derive goals,
assists, clean sheets/goals conceded, saves, penalty saves/misses, yellow/red
cards, second-yellow dismissals, and own goals. Partial fixture snapshots are
rejected.

### BotolaGO operational inputs

- supply the exact sorted UUID list of every active league so both gameweek and
  overall ranking scopes are materialized;
- promote the scoring migration and scope RPC, deploy the function, and
  configure the two independent secrets described above;
- run a reviewed dry run and one live finished-fixture canary, then prove that
  replaying the identical snapshot is stable.

Do not activate a recurring scoring schedule until a live canary proves all of
those inputs for at least one finished Botola fixture, including a correction
replay. The ordinary post-finalization 72-hour correction policy also needs a
separate controlled calculation-version workflow; this launch worker correctly
rejects changed snapshots after ordinary finalization starts.
