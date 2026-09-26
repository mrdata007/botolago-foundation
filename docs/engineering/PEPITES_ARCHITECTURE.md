# Pépites: architecture (Gate A)

Status: **revision 3, Gate A approved for local implementation
(2026-09-26, on `fd9de3f`).** Being built locally in the §10 order; nothing
is applied to production, deployed or activated, and Pépites mode stays
`off`. Companion to [`PEPITES_PLAN.md`](PEPITES_PLAN.md) (plan and data
audit). Owner decisions so far: Pépites takes the Profile slot in the bottom
bar (Profile moves to the header avatar). The owner is the Monday editor.
Claude builds and the owner approves every stage and every production
change. The v1 scope in §1 and the explicit, off-by-default weekly email
(§5.4) were approved on 2026-09-26.

### Gate A conditions (2026-09-26)

Gate A covers local implementation only: no production change, deployment,
public activation or paid-plan change. It came with five requirements, each
carried into the first implementation PR it concerns:

| Requirement                                                                                                                                              | Where     | Status                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------ |
| Delayed reveal: keep checking after `delayed`; e2e test with publication after that transition                                                           | §7, §11   | specified; `pepites_api` and the routes          |
| Complete email integration: type allowlist, typed payload, FR/AR renderer, links, topic unsubscribe wording, SQL; tested through the existing dispatcher | §5.4, §11 | specified; `pepites_weekly_email`                |
| Retry safety within Resend's 24-hour idempotency window                                                                                                  | §5.4, §11 | specified; `pepites_weekly_email`                |
| Attribute protection: flag restored after use, later direct write rejected, uncertain sources seeded as legacy, zero values changed                      | §3.1, §11 | **built** in `20260926060000`, tested            |
| Email capacity: priorities and account headroom kept, Pépites deliveries reported, live quota and demand checked before public email                     | §5.4      | specified; `pepites_weekly_email` and activation |

### Revision 3 (2026-09-26): targeted fixes before Gate A

Revision 2 was reviewed again. Five issues remained; the rest of the design
is unchanged.

| Issue                                                                                                                                                                           | Resolution                                                                                                                                                                                                                                                                                               | Where           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Edition rules contradicted the jobs: a scheduled edition re-pointed its run, publication wrote entries, auto-publish skipped a state, a correction published before superseding | Re-pointing only in `draft` (a scheduled edition steps back first); publication writes no entries (computed values are set in draft, movement read from the frozen previous edition); auto-publish goes `draft → scheduled → published`; supersede-then-publish in one transaction under a per-week lock | §3.6, §4.5, §5  |
| The resolver was not the only writer: `api.ingest_football_squad` overwrites date of birth and foot                                                                             | Inventory of writers; those two functions record observations instead of assigning; a guard trigger stops any other writer; existing values seeded with provenance                                                                                                                                       | §3.1            |
| Snapshots and scores were only protected from update and delete                                                                                                                 | Sealed once the run leaves `running`: INSERT, UPDATE, DELETE and TRUNCATE rejected; successful scores immutable                                                                                                                                                                                          | §3.5, §3.6, §11 |
| "Every cached copy expires at 20:00" was unconditional                                                                                                                          | A version pointer switches on the publication commit; versioned data; a `delayed` state; tests during the publication transaction                                                                                                                                                                        | §7, §11         |
| The weekly email had no defined preference or unsubscribe                                                                                                                       | `pepites_weekly_email` off by default, dedicated opt-in and opt-out, send-time checks, topic-only one-click unsubscribe, on the existing pipeline                                                                                                                                                        | §5.4, §6.2, §11 |

### Revision 2 (2026-09-26): what changed after review

Revision 1 was reviewed and sent back with changes requested. Each finding
was checked against the repository before it was accepted; all were
confirmed.

| Finding                                                                       | Where it is fixed         |
| ----------------------------------------------------------------------------- | ------------------------- |
| Score formula used two scales (percentile 0–100 × 100)                        | §4.4                      |
| "`percent_rank()` with ties at their average" is not what `percent_rank` does | §4.3                      |
| Small position groups fell back to comparing unlike measures                  | §4.2                      |
| A round number cannot reproduce a run after data is corrected                 | §3.5, §4.6                |
| The 2025-26 ranking used current-season memberships                           | §4.7                      |
| Unapproved photos would sit in `football-media`, a public bucket              | §3.3                      |
| No split between in-app and social use; no capture date; no revocation        | §3.3                      |
| `off` / `staff` / `public` not enforced in the API                            | §6.1                      |
| "Latest run" could expose an unpublished run                                  | §6.1                      |
| Shortlist of 20 against ranks 1–10; entries only protected from update        | §3.6, §5                  |
| Computed and editorial rank mixed; movement undefined                         | §3.6, §4.5                |
| No rule for a postponed match played after its round was ranked               | §5.3                      |
| Clean sheets changed definition with the data available                       | §4.1                      |
| Provider-neutral refactor was the first dependency                            | §8, §10                   |
| `shirt_number` is a membership field, not a player attribute                  | §3.1                      |
| A 270-minute floor after three rounds needs every minute played               | §4.2                      |
| Anonymous view counts could be inflated                                       | removed from v1           |
| Monday cache could show last week's edition after publication                 | §7 (redone in revision 3) |
| "Every eligible player has a DOB" is circular                                 | §4.2, plan gate B         |

## 1. Scope

**v1:**

- A ranking of Botola Pro players under 23, on stats we reliably have.
- A weekly Top 10 edition, chosen by the editor, with lines in French and
  Arabic.
- Player pages: overview and match log.
- The method page, with data coverage.
- Admin: the weekly selection and the data desk for the corrections the
  ranking needs (attributes, unlinked players, photos).
- Player attributes from SportsMonks and BSD, with provenance.
- Licensed photos, or the silhouette.
- Share images of published editions.
- The weekly email, only to accounts that opt in explicitly (§5.4).

**Moved to v1.1, once v1 ranks correctly and repeatably:**

- Compare.
- Player follows, and "Choix des fans" on the home page.
- Detailed match stats from a second provider (§8).

**Not planned:**

- Public view counts.
- xG and xA.
- Botola 2.
- Player-uploaded profiles.
- The scout and academy accounts.
- Web push.

## 2. Flow

```
SportsMonks ──┐                        ┌─> app.player_fixture_performances (existing)
BSD ──────────┼─> Supabase importers ──┼─> app_private.player_attribute_observations (new)
Data desk ────┤   (edge functions)     │
Photo intake ─┴─> private buckets ─────┴─> approved derivative → football-media (public)
                                                   │
          gather: app_private.pepites_run_* snapshot (per run, append-only)
                                                   │
          score: app_private.pepites_score_v1(run) — reads only the snapshot
                                                   │
          app.pepites_runs / app.pepites_player_scores / app.pepites_editions
                                                   │
          api.pepites_* reads (mode-checked)  ──> TanStack routes (SSR, cached when public)
          api.admin_pepites_* (permissioned)  ──> /admin/pepites
```

Existing pieces reused:

- `app_private.football_provider_mappings`
- pg_cron + pg_net ticks
- `app.media_assets` and, for approved derivatives only, `football-media`
- `app_private.admin_has_permission` and `admin_assert_permission`
- the notification email pipeline and its deduplication key
- `prefetchForSsr`
- the ui-kit and `PlayerPhoto`

## 3. Data model

All tables follow `docs/backend/MIGRATIONS.md`:

- RLS in the same migration
- a `set_updated_at` trigger where rows change
- definer functions with `set search_path = ''`
- `api.*` grants as in `20260720095354_football_api_security.sql`

### 3.1 Player attributes with provenance

- `app.players`: add `height_cm smallint null`, checked between 140 and 215,
  and `detailed_position app.detailed_position null`. The new enum is
  `gk, cb, lb, rb, dm, cm, am, lw, rw, cf`.
  - `date_of_birth`, `preferred_foot` and `nationality_country_id` already
    exist; the resolver below fills them.
- `app_private.player_attribute_observations`, one row per observed value:

  | Column          | Type / values                                                                      |
  | --------------- | ---------------------------------------------------------------------------------- |
  | `id`            |                                                                                    |
  | `player_id`     |                                                                                    |
  | `attribute`     | `date_of_birth`, `nationality`, `preferred_foot`, `height_cm`, `detailed_position` |
  | `value_text`    |                                                                                    |
  | `value_numeric` |                                                                                    |
  | `source_kind`   | `provider`, `manual`, `derived` or `legacy`                                        |
  | `provider_name` |                                                                                    |
  | `source_ref`    |                                                                                    |
  | `observed_at`   |                                                                                    |
  | `recorded_by`   |                                                                                    |
  | `note`          |                                                                                    |
  | `superseded_at` |                                                                                    |

  Rows are append-only; a new value supersedes, never overwrites.

- **Shirt numbers are not a player attribute.** They stay on
  `app.team_memberships.shirt_number`, which is scoped to team, season and
  membership period, so a transfer never rewrites history. v1 imports no
  shirt numbers from BSD.
- `app_private.player_attribute_source_priority(attribute, provider_name,
priority)`: lower wins. Manual 10, SportsMonks 20, BSD 30, derived 40,
  legacy 90; a provider without its own row ranks 50.
- `app_private.resolve_player_attributes(p_player_ids uuid[])` is the single
  writer of `date_of_birth`, `nationality_country_id`, `preferred_foot`,
  `height_cm` and `detailed_position` on `app.players`. It picks the winning
  current observation per attribute (ties: the newest), or null (foot
  `'unknown'`) when there is none, and returns how many players changed.
  - Sources that disagree are not silently resolved: the view
    `app_private.player_attribute_conflicts` lists every player and attribute
    whose current observations differ, best source first. The data-desk sweep
    (migration 3) turns them into issues.
- Observations are recorded by
  `app_private.record_player_attribute_observation`: values are validated
  against what the column can hold; a different value supersedes the
  current one only if it was seen at or after the current value was last
  seen. Observation rows are never updated (except `superseded_at`, once),
  deleted or truncated.
- **Freshness** (fix after PR #225 review). An observation's freshness is
  when its value was last seen: its own `observed_at`, or a later sighting
  of the same value, kept as its own row in the append-only
  `app_private.player_attribute_observation_confirmations` with its
  reference and time. The observation row itself does not change. So 188
  seen on 20 September and again on the 22nd is not replaced by 170 seen on
  the 21st and arriving last. The same value seen at an older time adds
  nothing. Between sources of equal rank, the resolver and the conflicts
  view order by freshness too. Confirmations reference their observation
  through an insert check rather than a declared foreign key, because
  observations can never be removed and a declared key would pre-empt their
  truncate guard with PostgreSQL's own error.
- Unknown is not evidence: a provider payload with no date of birth, or foot
  `'unknown'`, records nothing and so erases nothing. Before this migration
  the squad import overwrote a known value with null or `'unknown'`.
- **Deleting a country** (fix after PR #225 review). Deletion stays
  supported. `app.players.nationality_country_id` keeps `ON DELETE SET
NULL`, and the guard lets exactly that referential update through: the
  nationality set to null, no other resolved column changed, and the
  country gone (checked as the owner, `app_private.country_exists`). Any
  other clearing of a nationality is still rejected. The nationality
  observation stays as evidence of the ISO code; it no longer matches a
  country, so the resolver also gives null, and resolving afterwards
  changes nothing. If a country with that code is added again, the next
  resolve links the player to it. Rehearsed: deleting a country used by 133
  of 400 players cleared all 133, and a resolve afterwards changed nothing.

**Built:** `supabase/migrations/20260926060000_player_attributes_provenance.sql`,
tested by `supabase/tests/database/player_attributes_provenance.test.sql`.

**Writers today.** Every migration was searched for writes to those columns
(2026-09-26):

| Writer                                                     | What it writes                                                                                             | Callers                                                                                              |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `api.ingest_football_squad` (`20260731203317`)             | `date_of_birth` and `preferred_foot` on insert, and overwrites both on every update of a known player      | the SportsMonks historical importer; `api.service_ingest_current_football_squads` (`20260914184657`) |
| `api.service_apply_current_player_list` (`20260925200000`) | `date_of_birth` on insert of a new player (`preferred_foot` `'unknown'`); never updates an existing player | the owner-run current player list update                                                             |
| none                                                       | `nationality_country_id` (never set: 0 of 977); `height_cm` and `detailed_position` are new                |                                                                                                      |

Left as it is, the squad import would overwrite a manual correction on its
next run.

**The narrow integration.** Nothing else in these functions changes.

1. `api.ingest_football_squad` keeps its signature, locks, stale check and
   skip logic. It inserts a new player with no date of birth and foot
   `'unknown'`, and no longer assigns either on update. Instead it records a
   provider observation for each (`provider_name = p_provider_name`,
   `source_ref` = the external player id, `observed_at` = the player's
   provider timestamp; no new row when the value equals that provider's
   current observation) and calls the resolver for the player.
2. `api.service_apply_current_player_list` inserts new players without a date
   of birth, records a SportsMonks observation and calls the resolver.
3. A guard trigger on `app.players` rejects an insert that sets any of the
   five columns (other than foot `'unknown'`) and an update that changes
   them, unless the transaction-local setting
   `botolago.player_attribute_writer` is `resolver`. Only the resolver sets
   it, for its own update, and restores the previous value straight after
   (also on error), so a later direct write in the same transaction is still
   rejected. This catches an accidental future writer; it is not a defence
   against a definer function that sets the flag on purpose, which review
   must catch.
4. The existing pgTAP files for both functions pass unchanged. Two other
   test files inserted players with a date of birth directly as fixture
   setup (`football_domain`, `fantasy_deactivate_duplicate_player`); their
   fixtures now record the same values through the observation path, and
   none of their assertions changed.

**Seeding existing values.** In the same migration, before the guard
exists, `app_private.seed_legacy_player_attributes()` records one
observation for every existing date of birth, nationality and foot other
than `'unknown'`. Every one is `legacy`, provider null, noted "Unverified:
present before provenance was recorded". A SportsMonks mapping on a player
is not taken as the source of a value: it shows the player was linked, not
where a particular date came from (the promoted clubs' squads were typed by
hand, then linked). `observed_at` is the player's `updated_at`; `source_ref`
names the migration. The function skips values that already have a current
legacy observation, so it can be re-run. A provider value later replaces a
legacy one, and the differing legacy value stays in the conflicts view, so a
hand-typed date is checked rather than lost.

Seeding changes no value. The migration itself resolves every player after
seeding and aborts unless zero change. Rehearsed locally on a database
stopped at `20260926003500` and filled with 400 players (320 dates of
birth, 267 nationalities, 300 feet): 887 legacy observations, zero players
changed (values and `updated_at`), and a second resolve and a second seed
both did nothing.

### 3.2 Clean sheets

Defined once, in §4.1. Provider rows keep their provider value (0 today); the
engine never writes into them.

### 3.3 Photos

Photos never enter a public bucket before approval. `football-media` is
public (`20260801010200_sportsmonks_team_crests.sql`), so anyone holding a
path could fetch an unapproved file; hiding the URL is not protection.

**Storage.**

- New private bucket `player-photo-intake`: originals as received.
- New private bucket `player-photo-releases`: signed release documents.
- On approval, a server job makes a derivative (512 px square, WebP,
  metadata stripped, so no camera or location data) and writes it to
  `football-media` at `football/players/<player_id>/<asset_id>.webp`. Only
  then is the public `app.media_assets` row created, `kind = 'player_photo'`,
  `validation_status = 'validated'`, with `credit` and `copyright_owner`
  set.
- No browser upload to any of the three buckets; staff upload through an
  admin function, as for news media.

**Rights.** `app_private.player_photo_releases`:

| Column              | Meaning                                                  |
| ------------------- | -------------------------------------------------------- |
| `id`                |                                                          |
| `player_id`         |                                                          |
| `intake_path`       | The original, in `player-photo-intake`.                  |
| `captured_on`       | Date the photo was taken. Required.                      |
| `signed_on`         | Date the release was signed. Required.                   |
| `signer_role`       | `player` or `guardian`.                                  |
| `scope`             | `in_app` or `in_app_and_social`.                         |
| `licence_code`      | `club_licence`, `botolago_release` or `agency_licence`.  |
| `expires_on`        | Null when open-ended.                                    |
| `revoked_at`        | Set when the player, guardian or club withdraws consent. |
| `revocation_reason` |                                                          |
| `document_path`     | The signed document, in `player-photo-releases`.         |
| `public_asset_id`   | The approved derivative, once made.                      |

- A trigger refuses approval unless:
  - the player's date of birth is known (unknown means no approval);
  - a player under 18 on `captured_on` has a `guardian` release;
  - `captured_on`, `signed_on`, `licence_code` and `document_path` are set.
- `scope` decides use. The app shows any approved photo. A share image uses
  the photo only when `scope = 'in_app_and_social'`; otherwise the share image
  draws the silhouette.
- **Revocation and expiry.** `app_private.pepites_revoke_photo(release_id,
reason)` deletes the public derivative, sets the asset to `rejected` and
  clears `app.players.photo_asset_id`, in one transaction plus a storage
  delete job. A daily sweep does the same for releases past `expires_on`,
  setting `expired`. Share images
  check rights at render and are cached for at most one hour (§7), so a
  withdrawn photo leaves our cache within the hour. Copies already posted on
  social networks cannot be recalled; the release form says so.
- Read functions return a photo URL only for an approved, unrevoked,
  unexpired release. Otherwise `null`, and the UI draws the silhouette
  (`PlayerPhoto`).

**Built** (`20260926070000_player_photo_releases.sql`, tested by
`player_photo_releases.test.sql`, 70 assertions). As specified above, with
these details settled while building:

- Release lifecycle: `pending → approved → published`, ending in
  `rejected`, `revoked`, `expired` or `replaced`. A trigger keeps the facts
  (files, dates, signer, scope, licence, credit, expiry) unchanged after
  submission, allows only those moves, and rejects delete and truncate.
- Prerequisites are checked on approval and again on publication by
  `app_private.player_photo_release_problems`, which names each problem:
  `intake_missing`, `document_missing`, `date_of_birth_unknown`,
  `captured_before_birth`, `captured_in_future`, `signed_in_future`,
  `guardian_required` (under 18 on the capture date; the 18th birthday
  counts as adult), `expired`.
- Staff actions are `app_private.submit_`, `approve_`, `reject_` and
  `revoke_player_photo_release`, each recording who acted. Their API
  wrappers with permissions come with `pepites_api` (§6.2, migration 8).
- The storage job publishes through
  `app_private.publish_player_photo_release`: a square WebP between 128 and
  1024 px at `football/players/<player_id>/<release_id>.webp`, present in
  `football-media`. It creates the validated `media_assets` row, points the
  player at it, and replaces the player's previous published photo (one
  published photo per player).
- The read helper is `app_private.player_photo_for(player, use, on)`, with
  `use` `app` or `share`. It re-checks the rights on the given day with the
  current date of birth, so a correction that makes the player a minor on
  the capture date hides a player-signed photo at once.
- Revocation, expiry (the daily `app_private.expire_player_photo_releases`)
  and replacement set the asset `rejected` or `expired`, clear
  `players.photo_asset_id` and queue the public derivative and the original
  in `app_private.player_photo_storage_deletions`. The signed document is
  kept. Deleting rows from `storage.objects` in SQL would orphan the files,
  so the storage job removes them through the Storage API.
- Until that job runs, a revoked or expired derivative is still a file in
  the public bucket at an unguessable path (it contains the release id), but
  nothing in the app links to it any more.

**The storage job** (built: `20260926130000_pepites_photo_job.sql`,
`scripts/backend/pepites-photo-job.ts`). An operator runs it after approving
photos; it has no schedule. It reads `api.service_player_photo_work`, makes
each derivative with `sharp` (turned upright, cropped to a 512 px square
around the subject, re-encoded as WebP: no EXIF, XMP or IPTC block survives,
so no camera, date or GPS data), uploads it to its one path, and publishes
through `api.service_publish_player_photo`, which checks the rights again on
the day; when they no longer hold, publication refuses and the job deletes
its file. It then deletes each queued object through the Storage API and
marks it done. Staff get private upload paths from
`api.admin_player_photo_upload_paths` (`football.correct`); the admin
screen's server route signs the uploads. Tests: 12 pgTAP assertions
(`pepites_photo_job.test.sql`) and `scripts/backend/pepites-photo-job.test.ts`
(a phone JPEG with camera and GPS data comes out a clean 512 px WebP).

### 3.4 Methodologies

`app.pepites_methodologies`:

- `version` (pk), `engine_function` (for example `pepites_score_v1`),
  `params jsonb` (weights, floors and thresholds from §4), `description_fr`,
  `description_ar`, `created_at`, `frozen_at`.
- A methodology is frozen by its first run. A trigger then rejects any
  update or delete. Changing a weight, a floor or the engine's logic means a
  new version and, for logic, a new `pepites_score_vN` function. Old
  functions stay, so old runs can be replayed.

### 3.5 Runs and their input snapshot

A run copies every input it uses at gather time, then scores from that copy
only. A later correction to a match or a birth date changes future runs,
never a past one.

`app.pepites_runs`:

| Column                               | Meaning                                                 |
| ------------------------------------ | ------------------------------------------------------- |
| `id`                                 |                                                         |
| `season_id`                          |                                                         |
| `kind`                               | `weekly` or `season_final`                              |
| `as_of_round_number`                 |                                                         |
| `methodology_version`                |                                                         |
| `revision`                           | 1, 2, … per season, kind, round and methodology (§5.3)  |
| `input_cutoff_at`                    | Only data finalised before this time is gathered.       |
| `input_fingerprint`                  | SHA-256 of the snapshot rows, to detect changed inputs. |
| `status`                             | `running`, `succeeded` or `failed`                      |
| `attempt`                            |                                                         |
| `eligible_count`                     |                                                         |
| `activated_at`                       | Set when a published edition first uses the run (§6.1). |
| `started_at`, `finished_at`, `error` |                                                         |

Unique: `(season_id, kind, as_of_round_number, methodology_version,
revision)`.

Snapshot tables, in `app_private`, written only by the gather step of their
own run:

- `pepites_run_players(run_id, player_id, date_of_birth, position_group,
team_id, membership_id, in_pool)`: every player considered, with the
  attributes the run used.
- `pepites_run_appearances(run_id, player_id, fixture_id, team_id,
round_number, kickoff_at, minutes, started, goals, assists, saves, rating,
team_conceded)`: every Botola appearance this season up to the cutoff, all
  ages (the contribution reference in §4.2 needs every age). An input the
  source cannot supply is stored as null, never 0.
- `pepites_run_team_fixtures(run_id, team_id, fixture_id, round_number)`:
  each team's finalised matches, for minutes share.

Up to about 10 000 appearance rows per run by the end of a season; weekly
runs and their revisions come to a few hundred thousand rows a season.

**Sealing.**

- A run's `status` moves only `running → succeeded` or `running → failed`.
  After that, the only change allowed on the run row is `activated_at`, once,
  from null.
- Snapshot rows may be inserted only while their run is `running`. Once it
  is not, triggers on all three snapshot tables reject INSERT, UPDATE and
  DELETE for that run, and a statement trigger rejects TRUNCATE on them.
  Failed runs are sealed too, for diagnosis.
- No client role holds any privilege on the snapshot tables.

### 3.6 Scores and editions

| Table                         | Columns                                                                                                                                                                                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app.pepites_player_scores`   | `run_id`, `player_id`, `team_id`, `position_group`, `age_years`; `apps`, `starts`, `minutes`, `goals`, `assists`, `saves`, `clean_sheets`; `rating_avg`, `rating_n`, `form_avg`; `per90 jsonb`, `percentiles jsonb`, `components jsonb`, `flags text[]`; `score_exact numeric`, `score smallint`, `rank int`, `rank_in_position int` |
| `app.pepites_editions`        | `id`, `season_id`, `week_number`, `round_number`, `run_id`, `status`, `corrects_edition_id`, `previous_edition_id`, `superseded_by`, `scheduled_for`, `published_at`, `published_by`, `withdrawn_at`, `withdrawn_reason`, `created_at`                                                                                               |
| `app.pepites_edition_entries` | `edition_id`, `editorial_rank 1..10`, `player_id`, `computed_rank`, `computed_score`, `reason_fr`, `reason_ar`                                                                                                                                                                                                                       |

Three things are kept apart:

| Concept             | Where it lives                                                           |
| ------------------- | ------------------------------------------------------------------------ |
| Computed ranking    | `pepites_player_scores` of a run. Reproducible.                          |
| Editorial shortlist | Not stored: the run's computed top 20, queried when the editor opens it. |
| Published Top 10    | `pepites_edition_entries`. The editor's choice, labelled as editorial.   |

Constraints:

- Player scores: primary key `(run_id, player_id)`; `score` between 0 and
  100; `rank` null for an unranked player (§4.4). Rows may be inserted only
  while their run is `running`. Once the run has left `running`, INSERT,
  UPDATE and DELETE are rejected and TRUNCATE is rejected on the table, so a
  succeeded run's scores never change.
- Editions:
  - `status` is `draft`, `scheduled`, `published`, `withdrawn` or
    `superseded`.
  - Partial unique indexes: one `published` edition per
    `(season_id, week_number)`, and one open (`draft` or `scheduled`)
    edition per `(season_id, week_number)`.
  - `season_id`, `week_number`, `round_number`, `run_id` and
    `corrects_edition_id` can change only while the edition is `draft`.
  - Allowed moves, each made by one named function (§5), all under the
    week lock (§5.5). A trigger rejects every other move, and every column
    change not listed:

    | Move                     | Made by                                                       | Columns it may set                                              |
    | ------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------- |
    | `draft → scheduled`      | the editor scheduling, or the tick under `auto_publish`       | `status`, `scheduled_for`                                       |
    | `scheduled → draft`      | the editor unscheduling, or the tick on a new run revision    | `status`                                                        |
    | `scheduled → published`  | `pepites_publish_edition` only                                | `status`, `published_at`, `published_by`, `previous_edition_id` |
    | `published → superseded` | `pepites_publish_edition` of the correction, same transaction | `status`, `superseded_by`                                       |
    | `published → withdrawn`  | the editor withdrawing                                        | `status`, `withdrawn_at`, `withdrawn_reason`                    |

    There is no `draft → published` move.

- Edition entries:
  - Primary key `(edition_id, editorial_rank)`; `(edition_id, player_id)`
    unique.
  - Insert, update and delete are rejected unless the edition is `draft`.
    Publication writes no entries.
  - `computed_rank` and `computed_score` are copied from the run whenever an
    entry is written or the run is re-pointed, both in `draft`. Publication
    only checks they still match.
  - Every entry's player must have a ranked score in the edition's run.
  - Movement is not stored: it is read from `previous_edition_id`, which is
    fixed at publication and points at an edition whose entries are
    themselves frozen (§4.5).
- `app_private.pepites_settings`, a single row: `mode off|staff|public`,
  `auto_publish boolean`, `publish_local_time` (default 20:00
  Africa/Casablanca), `draft_local_time` (default 12:00). Changed only
  through `app_private.pepites_configure`, like `predictions_configure`.

### 3.7 Data desk

`app_private.data_desk_issues`:

| Column          | Values                                        |
| --------------- | --------------------------------------------- |
| `id`            |                                               |
| `entity_type`   | `player`, `lineup_player`, `photo`            |
| `entity_id`     |                                               |
| `field`         |                                               |
| `kind`          | `missing`, `conflict`, `reported`, `unlinked` |
| `status`        | `open`, `resolved`, `dismissed`               |
| `details jsonb` |                                               |
| `reported_by`   |                                               |
| `resolved_by`   |                                               |
| `resolved_at`   |                                               |
| `created_at`    |                                               |

- Issues come from a sweep function, from the resolver (conflicts) and from
  public "report an error" submissions (signed-in only, rate-limited).
- Fixes go through manual attribute observations or mapping corrections. Both
  are already audited.

## 4. Engine rules (methodology `v1`)

Every number below is a parameter stored in the methodology row.

### 4.1 Inputs

- **Appearance.** A player with more than 0 minutes in a finalised Botola
  Pro fixture of the season, before the run's cutoff.
- **Rating.** `provider_rating`, only on appearances of 20+ minutes.
- **Clean sheet (team, 60+ minutes).** The team conceded 0 in the match
  (final score, own goals included) and the player played 60+ minutes, for
  goalkeepers and defenders. One rule for every season and every match. It
  is labelled exactly so on the method page. When the final score is
  unknown, the value is unknown, not 0. An on-pitch version waits until
  goal events and substitution times are complete for every fixture.
- **Saves.** From provider rows, goalkeepers only.

### 4.2 Pool, eligibility and small samples

- **Pool (weekly).** Players with an active membership in a Botola Pro team
  of the current season, born after 1 July (season start year − 23); for
  2026-27, after 1 July 2003. A player who left Botola mid-season leaves the
  pool. Appearances for every Botola team this season count.
- **Missing date of birth.** Excluded from the pool, a data-desk issue
  raised, and counted on the method page ("N players not assessed: date of
  birth unknown").
- **Eligible.** In the pool with
  `minutes ≥ max(180, 0.30 × 90 × team_matches_played)`. After round 3 that
  is 180 of a possible 270 minutes; after round 10, 270; after round 30, 810.
- **First edition.** No edition before round 3. From round 3, an edition is
  made only when at least 10 players are eligible and ranked. Otherwise that
  week has none, ops is alerted, and the home page keeps the previous
  edition or the 2025-26 final ranking.
- **Contribution reference.** Contribution (§4.3) is compared within the
  player's position group against every Botola player of that group, of any
  age, above the same minutes floor. Unlike measures are never compared. If
  that reference holds fewer than 8 players, contribution is null for the
  group and the row is flagged `small_reference`.

### 4.3 Components and percentiles

| Component    | Measure                                                                                                                                   | Null when                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Rating       | Average rating                                                                                                                            | fewer than 3 rated appearances (`low_rating_sample`)            |
| Form         | Average of the last 6 rated appearances                                                                                                   | fewer than 3 rated appearances                                  |
| Contribution | FWD and MID: goals + assists per 90. GK: mean of the saves-per-90 and clean-sheets-per-90 percentiles. DEF: clean sheets per 90.          | reference under 8 (`small_reference`)                           |
| Progression  | Minutes share in the last 3 completed rounds minus minutes share in the earlier rounds; share = minutes ÷ (90 × team matches in the span) | fewer than 3 earlier rounds for the team (`no_progression_yet`) |
| Minutes      | Total minutes                                                                                                                             | never                                                           |

Revision 1 added the rating percentile into defenders' contribution; that
counted rating twice and is removed.

**Percentile.** Mid-rank, computed explicitly, not with `percent_rank()`
(which gives tied values the lowest rank of the tie):

```
P = 100 × (B + 0.5 × E) / N
```

- `N`: players with a non-null value in the comparison set (the eligible
  pool, or the contribution reference);
- `B`: how many of them have a strictly lower value;
- `E`: how many have the same value, the player included.

Ties share one value. For `[0, 0, 0, 5]` the three zeros get 37.5 and the 5
gets 87.5; a set of one gets 50. For minutes, higher is better; no v1
measure is lower-is-better. Percentiles are stored unrounded
(`numeric(7,4)`) and rounded only for display.

### 4.4 Score

```
score_exact = Σ (weight × P) ÷ Σ (weights of the non-null components)
score       = round(score_exact)            -- 0..100, checked
```

Weights: `rating 0.30, form 0.20, contribution 0.20, progression 0.15,
minutes 0.15`. If the non-null weights sum to less than 0.50, the player is
not ranked (`score` and `rank` null, flag `insufficient_data`).

**Tie-break.** `score_exact`, then minutes, then rating, then player id. The
ranking is deterministic.

### 4.5 Rank and movement

- `rank`: the computed rank in the run. `rank_in_position`: within the
  position group.
- On the ranking page, the arrow compares the computed rank with the run of
  the edition's `previous_edition_id`.
- In the Top 10, the arrow compares the editorial rank with the editorial
  rank in `previous_edition_id`, which is what readers saw. "New" when the
  player was not in it. `previous_edition_id` is set once, at publication:
  the current published edition of the latest earlier week of the season
  (for a correction, the corrected edition's own `previous_edition_id`).
  Both entry sets are frozen, so an arrow never changes after publication,
  and reading it needs no write.

### 4.6 Reproducibility

- Replay: `app_private.pepites_replay(run_id)` re-scores the stored snapshot
  with the run's methodology and engine function and compares every row with
  the stored scores. It must match exactly. A pgTAP test pins it, and the
  tick replays a random past run weekly and alerts on any difference.
- The fingerprint only detects changed inputs. The snapshot is what makes a
  replay possible.
- Recalculating after a correction is not a replay: it is a new run revision
  (§5.3). Published editions keep their run.

### 4.7 The 2025-26 final ranking

Shown before the first 2026-27 edition, labelled "Classement final 2025-26,
calculé avec la méthode v1". One `season_final` run on 2025-26, with its own
rules, because memberships have moved since:

- Pool: players with 2025-26 Botola Pro minutes, born after 1 July 2002.
  Memberships are ignored, so players who transferred or whose club went down
  are included.
- Team shown: the team he played most minutes for in 2025-26 (ties: the more
  recent).
- Eligible: 600+ minutes.
- Progression: second half of the season against the first.
- Everything else as §4.1–4.5.

Detailed-stat percentiles (passing, duels and so on) are v1.1. They will not
enter the score without a new methodology version.

## 5. Jobs and edition lifecycle

### 5.1 The tick

`pepites-tick` runs every 15 minutes via pg_cron, calling
`app_private.pepites_tick()`.

- It writes only when `pepites_settings.mode <> 'off'`.
- It takes `pg_try_advisory_xact_lock` on a fixed key first and exits if
  another tick holds it. Two ticks never run at once.
- Steps:
  1. **Rounds.** A round is complete when every fixture in it is finalised,
     postponed or cancelled.
  2. **Runs.** For the latest completed round, gather the snapshot and
     compute its fingerprint. If no succeeded run of that round has the same
     fingerprint, start a new revision and score it.
  3. **Re-point.** If step 2 made a new revision, apply §5.3 to that
     round's open edition.
  4. **Draft.** At Monday `draft_local_time`: if a succeeded run exists for a
     round newer than the last published edition, and §4.2 allows an
     edition, create a `draft` edition prefilled with the computed top 10,
     and email the editor.
  5. **Publish.** From `scheduled_for` (by default Monday
     `publish_local_time`) and on every later tick for 24 hours:
     - a `scheduled` edition: call `pepites_publish_edition`;
     - a `draft` edition with `auto_publish` true: move it
       `draft → scheduled` (actor `system`), then publish it, in the same
       transaction. It goes out without editor lines;
     - a `draft` edition with `auto_publish` false: nothing; the edition is
       `delayed` (§7) and ops is alerted once.
       After 24 hours nothing more is attempted automatically; the edition
       stays as it is, ops is alerted again, and the editor can still publish
       by hand.
  6. Weeks without a completed round (international breaks) have no
     edition.
- **Failed runs** are marked `failed` with the error, retried on the next
  tick up to 3 attempts per fingerprint, then alert ops. A draft is only ever
  made from a succeeded run.
- **The one-writer rule applies.** This job writes. Add it to the `AGENTS.md`
  schedule list with its pause command:
  `select app_private.pepites_configure('off', null);`

### 5.2 Publishing

`app_private.pepites_publish_edition(edition_id, actor)`, in one
transaction. Any failure rolls the whole of it back.

1. **Lock.** Take the week lock (§5.5). Lock the edition row `for update`
   and, for a correction, the edition it corrects, in `id` order.
2. **Idempotence.** If the edition is already `published`, return it
   unchanged.
3. **Validate.** Status is `scheduled`. Exactly 10 entries with distinct
   players; each player ranked in the edition's run; each entry's
   `computed_rank` and `computed_score` equal the run's; the run
   `succeeded`; reasons within length limits. For a correction, the
   corrected edition is `published`.
4. **Supersede first.** For a correction, move the corrected edition
   `published → superseded` with `superseded_by` set. This comes before the
   next step, so the one-published-per-week index never sees two.
5. **Publish.** Move the edition `scheduled → published`, setting
   `published_at`, `published_by` and `previous_edition_id` (§4.5). No entry
   is written.
6. **Activate.** Set the run's `activated_at` if it is null.
7. **Email.** Enqueue the weekly email event (§5.4).

Readers see either the state before the commit or the state after it, never
a mix (§7).

### 5.3 Revisions, corrections and withdrawal

- **New inputs.** A postponed match played later, or a corrected score,
  changes the fingerprint of the latest round, so the next tick makes a new
  run revision. Under the week lock, the round's open edition is handled so:
  - `draft`: `run_id` is re-pointed to the new revision, and every entry's
    `computed_rank` and `computed_score` rewritten from it. An entry whose
    player is no longer ranked is removed, and the editor is emailed.
  - `scheduled`: first `scheduled → draft`, then re-pointed as above. If all
    10 entries are still ranked, `draft → scheduled` again with the same
    `scheduled_for` (actor `system`), and the editor is told what moved.
    Otherwise it stays `draft` and the editor is emailed.
  - `published`: never changes. The new revision feeds next week's edition,
    or a correction.
- **Correction edition.** `api.admin_pepites_edition_correct` creates a
  `draft` for the same week with `corrects_edition_id`, from the newest
  succeeded run. It is allowed only while the corrected edition is
  `published` and the week has no other open edition. Publishing it follows
  §5.2: supersede, then publish, atomically. The old edition's page then says
  "corrigée" and links to the correction.
- **Withdrawal.** Under the week lock, `published → withdrawn` with a
  reason. Its page and share images then say it was withdrawn and show no
  entries; the version pointer (§7) falls back to the previous published
  edition; unsent emails for it are cancelled (§5.4).

### 5.4 The weekly email

Owner decision, 2026-09-26: explicit opt-in, off by default, easy to leave,
and nobody subscribed automatically.

**Preference.**

- `app.user_preferences.pepites_weekly_email boolean not null default
false`, plus `pepites_weekly_email_changed_at timestamptz null`.
- The migration adds the column as `false` for every existing row. No
  existing user is subscribed. The global switch `email_notifications_enabled`
  (on by default since 2026-09-24) does not subscribe anyone to Pépites.
- `api.update_my_preferences` and `api.update_my_notification_preferences`
  list their columns explicitly and do not touch it. The only ways to change
  it are the three below.

**Opt in and out.**

- `api.set_my_pepites_weekly_email(p_enabled boolean)`: signed-in only.
  Idempotent. Sets the value and `changed_at`, and writes a notification
  audit entry `pepites_weekly_email_opt_in` or `_opt_out` with source `app`.
  Opting out also cancels this user's unsent Pépites deliveries.
- `api.my_pepites_weekly_email()`: the current value, and whether the
  account can receive email at all (confirmed address, email switched on),
  so the page can say why nothing arrives.
- The unsubscribe link (below).
- In the app: an unticked switch on the Pépites home and in the notification
  settings. Nothing is pre-ticked. A guest is asked to sign in first.

**Sending.** Through the existing pipeline, unchanged in its mechanics:

- New `app.notification_type` value `pepites_weekly`, source domain
  `football`. Publication (§5.2 step 7) writes one event with
  `app_private.notification_email_enqueue`, deduplication key
  `pepites-weekly:<edition_id>`.
- The pipeline's fan-out, its `(event, user)` and `(notification, channel)`
  unique keys, the Resend idempotency key (the delivery id), the bounded
  retries and the dead-letter queue of
  `api.service_record_notification_delivery_attempt` all apply as they are.
  One edition creates at most one delivery per person. Whether that delivery
  is sent at most once depends on the provider's idempotency window; see
  retry safety below.
- **Eligibility**, checked at fan-out in `notification_email_fanout` and
  again at claim in `api.service_claim_email_deliveries`, on top of the
  pipeline's existing checks (notifications and email on, confirmed
  non-anonymous address, profile not deleted, the email mode):
  - `pepites_weekly_email` is true (else cancelled, `pepites_opted_out`);
  - Pépites mode is `public` (else `pepites_unavailable`);
  - the edition is still `published`, not withdrawn or superseded (else
    `pepites_edition_not_current`).
    A delivery that fails at claim is cancelled with that code, never sent.
- A correction's own event fans out only to users who have no delivered
  Pépites email for that week.
- **Staleness and quota.** Stale 36 hours after publication (a line in
  `notification_email_event_is_stale`). Lowest priority in the free-plan
  allowance (100 a day), after the round preview. Opt-ins beyond the day's
  remainder go out the next day, within the 36 hours, or not at all.

**Unsubscribe.**

- `app_private.notification_email_unsubscribe_tokens` gains `topic text
null`. Null keeps today's meaning, all email. Pépites emails carry a token
  with `topic = 'pepites_weekly'`, in the footer link and in the
  `List-Unsubscribe` one-click header the dispatcher already sets.
- `api.unsubscribe_notification_email(p_token)` with a Pépites token: sets
  only `pepites_weekly_email = false`, cancels only unsent Pépites
  deliveries, writes `pepites_weekly_email_opt_out` with source
  `email_link`, and returns `unsubscribed` or `already_unsubscribed`. Every
  other email stays on. No sign-in needed. The footer also links to the full
  notification settings.
- A token without a topic behaves exactly as today.
- Since `20260926003100` (two-step login), writes to `app.user_preferences`
  pass the MFA step-up trigger, and the existing unsubscribe sets the
  transaction-local waiver `app.mfa_step_up_waiver = email_unsubscribe_token`
  around its one write. The Pépites branch uses the same waiver in the same
  way. `api.set_my_pepites_weekly_email` takes no waiver: it is a signed-in
  preference write like any other.

**The whole integration, not only the SQL.** The email is not done until
each of these exists and is tested:

- `pepites_weekly` in `EMAIL_NOTIFICATION_TYPES`
  (`supabase/functions/_shared/notification-email-types.ts`), with a typed
  `PepitesWeeklyPayload`: edition id, week, round, the ten entries (name,
  club, editorial rank, score), `publishedAt`.
- The renderer (`notification-email-render.ts`): subject, HTML and text in
  French and Arabic (right-to-left, numbers left-to-right, no space inside a
  number, per `PEPITES_PLAN.md` §9).
- Links: the edition page, the Pépites home, the topic unsubscribe
  link, and all notification settings.
- Unsubscribe wording that names the topic: "Se désabonner de Pépites" /
  "إلغاء الاشتراك في Pépites" and a line saying other emails are unaffected;
  the `List-Unsubscribe` header and the `notification-email-unsubscribe`
  function's confirmation page carry the same scope.
- The SQL of this section.
- A test through the existing dispatcher (`notification-email-dispatch`,
  with its fake Resend), from a claimed `pepites_weekly` delivery to the
  recorded attempt, in both languages.

**Retry safety.** Resend keeps an idempotency key for 24 hours. A retry
under the same key inside that window returns the first result instead of
sending again; after it, the same key sends a new email. So:

- The key stays the delivery id, and the request body is fixed at the first
  attempt: rendered only from the stored payload, never from live data, with
  its hash stored on that attempt. A retry whose body hash differs is not
  sent.
- The delivery's first attempt time is recorded (from its attempt log).
- A delivery whose outcome is unknown (timeout, network error, 5xx after
  the request left) is retried only while its first attempt is less than 23
  hours old. After that it is not sent again: it is closed as
  `possibly_sent` and counted as such.
- The claim already takes attempted mail first; the 23-hour rule goes in
  the same shared claim, so it covers every email type (the risk is the
  same for all). The dispatcher's comment that a retry "can never produce a
  second email" is corrected to say "within the provider's 24-hour window".
- Test: Resend accepts the email but the response is lost; a retry an hour
  later sends the same key and body and the fake returns the first result
  (one email); a retry after 24 hours is refused and closed as
  `possibly_sent` (no second email).
- Promise: at most one email per person per edition inside the 24-hour
  window, and no automatic resend after it. Not exactly-once in all cases.

**Capacity.** On Resend's free plan (100 a day, 3 000 a month, shared with
every other email):

- Priorities stay as they are; `pepites_weekly` is added last (8, after the
  round preview). The account-email reserve (`daily_email_reserve`) stays
  untouched: the claim never spends it on Pépites.
- `api.admin_pepites_email_report(p_edition_id)` (protected by
  `pepites.publish`) counts that edition's deliveries: queued (pending,
  retry scheduled or claimed), sent, deferred (waiting for the next day's
  allowance), expired (cancelled as stale), cancelled by reason, and
  possibly sent.
- Before the email is switched on for the public: read the live quota and
  plan from Resend (not from these defaults), count opt-ins, and compare
  them with what the day leaves after the existing emails. If demand does
  not fit, the owner decides; a paid plan is a separate decision this design
  does not make.

### 5.5 Locks

- The tick: `pg_try_advisory_xact_lock` on a fixed key; a second tick exits.
- Every edition change (create, update entries, schedule, unschedule,
  re-point, publish, correct, withdraw) first takes
  `pg_advisory_xact_lock` on `pepites_edition:<season_id>:<week_number>`,
  then locks the affected edition rows `for update` in `id` order. The
  editor's functions and the tick use the same key, so a publish, a
  re-point and a withdrawal of the same week run one after another, never
  together.

## 6. API contracts

### 6.1 Access, by mode

One check decides access for every public function and route:
`app_private.pepites_access(p_user_id uuid) returns text`, modelled on
`app_private.predictions_access_allowed`:

- `public` when `mode = 'public'`;
- `staff_preview` when `mode = 'staff'` and the caller holds
  `pepites.edit` (`admin_has_permission`);
- `none` otherwise.

| Mode     | Anonymous and signed-in fans              | Staff with `pepites.edit`                                                      |
| -------- | ----------------------------------------- | ------------------------------------------------------------------------------ |
| `off`    | `{ "available": false }`, no feature data | `{ "available": false }`; admin screens still work                             |
| `staff`  | `{ "available": false }`                  | Data with `"preview": true`; the route sends `private, no-store` and `noindex` |
| `public` | Published data only                       | Published data only; unpublished drafts only in the admin screens              |

- It applies to home, ranking, player, player matches, edition, method and
  share images, not only the home page. Hiding the tab is not access
  control.
- **Which run is public.** The run of the current version (§7): the current
  published edition (latest week with a `published` edition), or, before
  any edition, the activated `season_final` run. A run nobody published is
  never public.
- Functions are `security definer` with `set search_path = ''`. `revoke all
… from public` first, then explicit grants: reads to `anon` and
  `authenticated`, admin functions to `authenticated` plus the permission
  check inside. Signatures callable by `anon` use `pg_catalog` types only
  (anon has no `USAGE` on schema `app`). Each function is listed in the
  grant review of its migration.

### 6.2 Functions

Every function returns `jsonb`. Localised text comes back in both languages
and the client picks one.

| Function                                                                                                                           | Returns                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.pepites_version()`                                                                                                            | The version pointer (§7): `version`, `state` (`current`, `countdown` or `delayed`), `next_reveal_at`. Reads two rows; cheap.                                                        |
| `api.pepites_home(p_version text)`                                                                                                 | For that version: the edition (entries with player card fields, movement from `previous_edition_id`), its week and round, and `source`: `edition` or `previous_season`.             |
| `api.pepites_ranking(p_version text, p_position text, p_max_age int, p_team_id uuid, p_sort text, p_limit int ≤ 50, p_offset int)` | Rows from the version's run plus total count. `p_sort` is one of `score`, `minutes`, `goals`, `assists`, `rating`, `form`, `ga90`.                                                  |
| `api.pepites_player(p_version text, p_player_id uuid)`                                                                             | Identity and attributes, with a `missing` list; `photo` (null unless approved, §3.3); the version run's row (score, rank, components, percentiles, per90, flags); editions entered. |
| `api.pepites_player_matches(p_player_id uuid, p_limit int ≤ 20)`                                                                   | Date, home/away, opponent, score, minutes, started, goals, assists, cards, rating.                                                                                                  |
| `api.pepites_edition(p_season_id uuid, p_week int)`                                                                                | A published, withdrawn or superseded edition, with its status and, when corrected, the correction's link.                                                                           |
| `api.pepites_methodology()`                                                                                                        | The public methodology and coverage: pool size, players excluded for no date of birth, rating coverage, foot and height coverage.                                                   |
| `api.admin_pepites_edition_get(p_edition_id)`                                                                                      | Edition, entries and the run's top 20 shortlist. Protected by `pepites.edit`.                                                                                                       |
| `api.admin_pepites_edition_update(p_edition_id, p_entries jsonb)`                                                                  | Order and reasons, `draft` only. Protected by `pepites.edit`.                                                                                                                       |
| `api.admin_pepites_edition_schedule(p_edition_id, p_at)`                                                                           | `draft → scheduled`. Protected by `pepites.publish` (recent auth).                                                                                                                  |
| `api.admin_pepites_edition_unschedule(p_edition_id)`                                                                               | `scheduled → draft`. Protected by `pepites.publish` (recent auth).                                                                                                                  |
| `api.admin_pepites_edition_publish_now(p_edition_id)`                                                                              | Calls `pepites_publish_edition` on a `scheduled` edition. Protected by `pepites.publish` (recent auth).                                                                             |
| `api.set_my_pepites_weekly_email(p_enabled boolean)`                                                                               | Signed-in only. Opt in or out (§5.4).                                                                                                                                               |
| `api.my_pepites_weekly_email()`                                                                                                    | Signed-in only. The preference and whether email can reach the account (§5.4).                                                                                                      |
| `api.admin_pepites_edition_correct(p_edition_id)`                                                                                  | Creates the correction draft. Protected by `pepites.publish` (recent auth).                                                                                                         |
| `api.admin_pepites_edition_withdraw(p_edition_id, p_reason)`                                                                       | Protected by `pepites.publish` (recent auth).                                                                                                                                       |
| `api.admin_data_desk_list(p_filters)`                                                                                              | Protected by `football.read_operations`.                                                                                                                                            |
| `api.admin_player_attribute_correct(p_player_id, p_attribute, p_value, p_source_note)`                                             | Protected by `football.correct`.                                                                                                                                                    |
| `api.admin_player_photo_submit(p_player_id, p_intake_path, p_release jsonb)`                                                       | Records the release; approval runs the checks in §3.3. Protected by `football.correct`.                                                                                             |
| `api.admin_player_photo_revoke(p_release_id, p_reason)`                                                                            | Protected by `football.correct` (recent auth).                                                                                                                                      |

New permissions:

- `pepites.edit` (no recent auth)
- `pepites.publish` (recent auth)

Both are granted to `publisher`, `content_admin` and `platform_admin`.

## 7. Performance and caching

- Public pages read precomputed tables only; no percentile maths at request
  time.
- Cache headers are sent only when the response is `public` (§6.1). Anything
  else is `private, no-store`.
  The reveal follows the publication, not the clock. Revision 2 promised that
  every cached copy expires at 20:00; that holds only if publication happens
  at 20:00, and a late tick or an editor who has not finished breaks it.

**Version pointer.**

- The version is the current published edition's id, or
  `season_final:<run_id>` before the first edition. It changes only when a
  publication, correction or withdrawal commits.
- `api.pepites_version()` returns it with a `state`:
  - `current`: nothing is due;
  - `countdown`: a `scheduled` edition exists; `next_reveal_at` is its
    `scheduled_for`. The version is still the previous one;
  - `delayed`: more than 2 minutes past `scheduled_for`, or past the draft's
    default publish time, and still not published (tick late, editor not
    done, validation failed). The version is still the previous one. The
    page stops the countdown and says the ranking is coming. It ends when
    the edition publishes, is unscheduled, or 24 hours pass (§5.1), after
    which the state is `current` again.
- Readers see the pointer before or after the publication commit, never
  between: publication is one transaction and writes no entries, so there is
  no half-published state to read.

**Versioned data.** Pages fetch their data under the version:
`/pepites/data/<version>/home.json`, `…/ranking.json?…`,
`…/player/<id>.json`. Content for a version never changes while it is
public (entries and runs are frozen), so it can be cached longer.

| Response                              | Cache                                                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `api.pepites_version()` route         | `s-maxage=10`, no `stale-while-revalidate`                                                                                    |
| Versioned data                        | `s-maxage=300`. A withdrawn edition's data then answers "withdrawn" within 5 minutes; nobody is pointed to it anymore anyway. |
| "Current" HTML pages                  | `s-maxage=10`; the HTML embeds the version it was rendered with                                                               |
| Edition pages (`/pepites/semaine/$n`) | `s-maxage=300`                                                                                                                |
| Share images                          | `s-maxage=3600`, rendered with the rights of the moment (§3.3)                                                                |
| Anything not `public` (§6.1)          | `private, no-store`                                                                                                           |

- **The reveal.** In `countdown`, the page re-reads the pointer at
  `next_reveal_at` and then every 5 seconds with jitter. In `delayed` it
  keeps checking, every 30 seconds with jitter, until the version changes or
  the state returns to `current`. A publication that lands after the delay
  began is therefore picked up without a reload. After a publication
  commits, a reader who is checking sees the new edition within about 10
  seconds in `countdown` and within about 40 seconds in `delayed`. An open
  page also re-reads the pointer when it regains focus.
- **Load test.** A target, not a measured capacity: a Monday 20:00 peak of
  200 page requests per second with fewer than 20 reaching the database.
  It includes the moment of publication, when every reader moves to a new,
  not yet cached version, and a publication that runs late. If it fails,
  publication also writes the version's payloads once as static JSON, so
  the peak never reaches the database.

## 8. Second provider

Additive in v1. No existing SportsMonks function is generalised. The only
changes to existing functions are the two attribute assignments of §3.1 and
the email additions of §5.4.

1. **Attributes only.** A BSD importer (`supabase/functions/bsd-players`)
   writes attribute observations through a new service-role function,
   `api.ingest_player_attribute_observations`. It validates its own payload
   (provider allowlist, id formats, value ranges), as the crest function
   does for SportsMonks.
2. **Identity.** New rows in `app_private.football_provider_mappings` with
   `provider_name = 'bsd'`:
   - teams map by name, confirmed by hand (16 clubs);
   - players map by name similarity plus date of birth plus team. Anything
     below full confidence becomes an `unlinked` data-desk issue. Nothing is
     auto-merged.
3. **Existing functions.** `20260914184657_current_season_squad_recovery.sql`,
   `20260925110000_current_performance_unnamed_starters.sql`,
   `20260925200000_current_player_list_update.sql` and
   `api.attach_football_team_crest` hardcode SportsMonks. v1 does not depend
   on them being generic, so they stay as they are. The crest function's
   checks are SportsMonks-specific safety rules (URL host, payload shape),
   not an incidental name. Any of them is generalised only when a feature
   proves it needs it, with regression tests for today's behaviour first.
4. **Detailed match stats (v1.1).** `app.player_stat_definitions` and
   `app.player_fixture_stat_values(fixture_id, player_id, stat_code,
provider_name, …)` arrive with the first module that shows them. Before
   anything from a second provider's match data is shown, a fixture-level
   report must reach 98% agreement with SportsMonks on minutes and goals over
   3 rounds.

## 9. Security and privacy

- RLS on every new table. `app_private.*` has no client grants.
- Player sporting data is public.
- Photos, releases and dates of birth of minors are personal data. Originals
  and release documents stay in private buckets; only approved derivatives
  are public. Law 09-08: the owner confirms the CNDP declaration covers
  them.
- Admin actions are audited through the existing admin audit trail.

## 10. Migration sequence

Timestamps are picked at write time after `origin/main`. Each migration comes
with its pgTAP file.

1. `player_attributes_provenance`: columns, observations, priority,
   resolver, detailed position, seeding of existing values, the guard
   trigger, and the attribute changes to `api.ingest_football_squad` and
   `api.service_apply_current_player_list` (§3.1). **Built** locally as
   `20260926060000_player_attributes_provenance.sql`; not applied anywhere
   else. Its production apply script is written when production is
   authorised, not before.
2. `player_photo_releases`: private buckets, release table, approval trigger,
   revocation, read helper. **Built** locally as
   `20260926070000_player_photo_releases.sql`.
3. `data_desk_issues`. **Built** locally as
   `20260926080000_data_desk_issues.sql`: the sweep opens issues for
   attribute conflicts, current-season players without a date of birth,
   unlinked lineup entries and published photos whose rights no longer hold,
   and closes the ones whose cause is gone; a conflict a person closed is
   not raised again until the disagreeing values change. Fan reports are
   limited to 5 a day per account and one open report per field. Issues are
   never edited back or deleted. API wrappers come with `pepites_api`.
4. `pepites_engine`: methodologies, runs, snapshot tables, scores, sealing
   triggers, gather, score, replay, and the 2025-26 `season_final` run.
   **Built** locally as `20260926090000_pepites_engine.sql` (70 pgTAP
   assertions). Settled while building:
   - **Which matches count.** Weekly runs take finished fixtures finalised
     before the cutoff, as §4.1 says. A `season_final` run takes the
     finished fixtures of the completed season: the 2024-25 and 2025-26
     fixtures were backfilled and none carries `finalized_at` (240 each,
     read on production 2026-09-26), so requiring it would rank nobody.
   - **Unknown final score.** `fixtures_finished_score_check` already
     requires a score on every finished fixture, so it cannot happen with
     real data; the engine still treats it as unknown (tested on a
     hand-built snapshot).
   - **Session independence.** The fingerprint renders dates and times
     without the session's `DateStyle` or `TimeZone`, and ages are taken on
     the cutoff day in Africa/Casablanca, so a replay from any session
     matches exactly (tested under `Pacific/Auckland` and `SQL, DMY`).
   - A run that errors is kept as `failed` with its error; its partial
     snapshot is rolled back with it.
5. `pepites_editions`: editions, entries, state and column triggers, week
   lock, settings, tick, publish, cron schedule (mode `off`). **Built**
   locally as `20260926100000_pepites_editions.sql` (88 pgTAP assertions in
   `pepites_editions.test.sql`, and 6 two-connection scenarios in
   `scripts/backend/pepites-editions-concurrency.test.ts`, run by CI's
   `database-quality` job after the pgTAP suite). Settled while building:
   - **Week number.** Week 1 is the Monday-to-Sunday week holding the
     season's first day; 28 September 2026 is week 14 of 2026-27. The
     edition page `/pepites/semaine/$n` uses it.
   - **Writers.** Every edition and entry write needs the actor the edition
     functions set for their own statements (a staff id, or `system`);
     anything else is refused with `PEPITES_EDITION_WRITER_REQUIRED`.
     Publication and supersession further need the flag only
     `pepites_publish_edition` sets. Every creation, move and re-point is
     recorded with its actor in `app_private.pepites_edition_moves`.
   - **Entries.** The trigger copies `computed_rank` and `computed_score`
     from the edition's run on every write, so nobody supplies them.
   - **Drafts carry their due time.** A draft made by the tick has its
     week's default time in `scheduled_for`; that is what "delayed" (§7) and
     auto-publish measure against. A correction draft has none until the
     editor schedules it.
   - **Editor messages.** "Email the editor" goes through the existing ops
     alert channel (`ops_alert_send`), once per key
     (`app_private.pepites_notices`).
   - **Latest completed round.** The highest round whose fixtures are all
     final, postponed or cancelled, with at least one final. A later round
     can complete while an earlier one waits; the earlier match then enters
     the next run as a new revision.
   - **A publish meets a re-point.** If the editor publishes while the tick
     waits for the week to re-point it, the tick leaves the published
     edition alone and keeps its new run for next week.
   - **Retries.** At most 3 failed runs per round and input fingerprint
     (`app_private.pepites_run_attempts`), then one alert; new inputs are
     tried again.
   - **Without the week lock** the two-drafts scenario still ends with one
     draft (the one-open-edition index), but as a bare unique violation; the
     test fails, which shows the lock is what it measures.
6. `pepites_weekly_email_type`: the `pepites_weekly` notification type alone,
   because a new enum value cannot be used in the transaction that adds it.
   **Built** locally as `20260926110000_pepites_weekly_email_type.sql`.
7. `pepites_weekly_email`: the preference columns, opt-in and opt-out
   functions, unsubscribe topic, and the eligibility, staleness and priority
   lines in the pipeline functions (§5.4). **Built** locally as
   `20260926110100_pepites_weekly_email.sql`, with the dispatcher, renderer,
   unsubscribe function and `/unsubscribe` page changes. Tests: 46 pgTAP
   assertions (`pepites_weekly_email.test.sql`); dispatcher, renderer and
   unsubscribe unit tests in both languages; and
   `scripts/backend/pepites-weekly-email-e2e.test.ts`, which runs the real
   fan-out, claim, renderer, dispatcher and attempt recorder against a local
   database and a fake Resend with Resend's 24-hour idempotency (CI
   `database-quality`, after the pgTAP suite). Settled while building:
   - **Publication in staff mode writes no event**, so a preview can never
     email anyone, even if Pépites turns public within the 36 hours.
   - **First attempt time** is a column, `notification_deliveries.first_claimed_at`,
     set at the first claim, rather than read from the attempt log: a pass
     that claimed an email and died before recording anything leaves no
     attempt row, yet may have sent it. Rows from before the migration fall
     back to their earliest attempt.
   - **What counts as unsure**: an attempt recorded as timeout, network
     error, provider error or "still in progress", or a claim whose lease ran
     out unrecorded. A refusal (rate limit, validation) is certainly unsent
     and is retried as before.
   - **A changed body** is closed as `cancelled` with
     `delivery_body_changed`, not dead-lettered; the attempt recorder now
     accepts `cancelled` as a closing outcome and a `p_body_sha256`
     argument (its old signature is replaced, not overloaded).
   - **A correction** is sent to opted-in readers who have no Pépites email
     for that week already sent or possibly sent.
   - **The unsubscribe reply** keeps its old shape for an all-email token and
     adds `"topic": "pepites_weekly"` for a Pépites token; the page shows
     what the server reports, not what the link claims.
   - **The admin report** is `app_private.pepites_email_report`; its
     `pepites.publish` wrapper comes with migration 8.
8. `pepites_api`: access check, version pointer, read and admin functions,
   permissions, grants. **Built** locally as `20260926120000_pepites_api.sql`
   (45 pgTAP assertions in `pepites_api.test.sql`, including the access
   matrix: 7 public reads × `off`, `staff`, `public` × visitor, signed-in
   fan, staff). Settled while building:
   - **Staff preview** is decided by the full staff check
     (`admin_assert_permission('pepites.edit')`: principal, role, verified
     factor, aal2), run without raising. The public reads are listed in the
     ordinary-account step-up test as named exceptions, like
     `predictions_round`: they return the same published data to everyone,
     and the caller only decides whether staff may preview.
   - **Versions.** An edition id, or `season_final:<run>`. A version resolves
     only to a published, superseded or withdrawn edition, or an activated
     season_final run; a draft's id answers "not found". The 2025-26 final
     ranking is activated once by the operator:
     `select app_private.pepites_activate_season_final('<run id>');`
   - **Pointer states.** `delayed` when the season's newest open edition is
     between 2 minutes and 24 hours past its time; `countdown` when it is
     scheduled and not yet due; `current` otherwise.
   - **Withdrawn.** The home and edition reads return the edition with its
     status and reason and no entries; the ranking of a withdrawn version
     answers "not found"; the pointer falls back to the previous published
     edition.
   - **Player pages** exist only for players in the version's pool. Dates of
     birth are not returned (age only); a stored "unknown" foot counts as
     missing.
   - **Admin actions** use the staff principal as the actor and write the
     admin audit trail (`pepites.edition_*`, `football.player_attribute_correct`,
     `football.player_photo_*`, `football.data_desk_close`). Photo approval and
     rejection, and closing a data-desk issue, were added to the §6.2 list;
     fans' error reports go through `api.report_pepites_data_issue`
     (signed in, step-up, Pépites visible).

Local proof for each: `bun run backend:migrations:check`, `backend:db:reset`,
`backend:db:test`, `backend:db:lint` and `backend:types:check`. CI
`database-quality` is the authority.

Production: nothing is applied by Claude. Each batch goes through
`RELEASE_ACTIVATION_MIGRATION_RUNBOOK.md` with the owner, dry-run first, one
writer at a time. Mode stays `off` until launch.

## 11. Tests

**pgTAP:**

- Percentiles: the `[0, 0, 0, 5]` values of §4.3, a set of one, nulls left
  out of `N`.
- Score: re-normalisation, bounds 0–100, `insufficient_data` under 0.50.
- Small reference: a position group under 8 gives a null contribution.
- Clean sheets: 0–0 with 60+ minutes; a clean sheet lost after the player
  left (whole-match rule: no clean sheet); unknown final score stays null.
- Eligibility: birth-date boundary, the floor at rounds 3, 10 and 30, fewer
  than 10 eligible holds the edition.
- Reproducibility: a replay of a stored run matches exactly; a corrected
  appearance creates a new revision and leaves the published edition and its
  run untouched.
- Sealing: for a succeeded and for a failed run, INSERT, UPDATE and DELETE
  on each snapshot table and on `pepites_player_scores` are rejected, and
  TRUNCATE is rejected; a run cannot leave `succeeded` or `failed`;
  `activated_at` can be set once and never changed. Methodology update and
  delete rejected once frozen.
- Editions:
  - every move not in the §3.6 table rejected, including
    `draft → published`; every column change not listed for a move
    rejected;
  - entries: insert, update and delete rejected outside `draft`; publishing
    writes no entry row (row count and `xmin` unchanged);
  - `run_id` cannot change on a `scheduled` edition; the re-point path goes
    `scheduled → draft → scheduled` and keeps `scheduled_for`;
  - auto-publish records `draft → scheduled → published`, both moves by
    `system`;
  - a correction: the old edition is `superseded` and the new one
    `published` in the same transaction; a failure after step 4 leaves both
    as they were; at no point are two editions of one week `published`;
  - concurrency, with two database connections: two publishes of one
    edition give one publication and one email event; a publish racing a
    re-point or a withdrawal of the same week run one after the other; two
    concurrent ticks give one run.
- Postponed match: played after its round, it creates a revision; a draft is
  re-pointed; a scheduled edition steps back to draft and is rescheduled when
  all 10 players are still ranked.
- Player attributes (**built**, `player_attributes_provenance.test.sql`, 72
  assertions):
  - seeding records every existing value as legacy and unverified, also for
    a player with a SportsMonks mapping; resolving afterwards changes zero
    players (values and `updated_at`); seeding again records nothing;
  - the guard rejects inserts and updates of the five columns and allows
    everything else;
  - the flag is back to its previous value after the resolver (empty, or
    whatever it was), and a direct write later in the same transaction is
    rejected;
  - a manual date of birth survives a later `api.ingest_football_squad` run
    with a different SportsMonks value, which shows as a conflict; the
    earlier SportsMonks value is kept as superseded history;
  - a legacy value is replaced by a provider value and the conflict keeps
    the legacy one;
  - a payload without a date of birth and with foot `'unknown'` erases
    nothing; an impossible date is still `INVALID_PROVIDER_PAYLOAD`;
  - recording: same value adds nothing, older never replaces newer, newer
    supersedes; update, delete and truncate of observations rejected;
    invalid values rejected;
  - freshness: 188 on 20 Sept, 188 again on the 22nd, then 170 dated the
    21st arriving last: the height stays 188; the second sighting is kept
    with its reference; confirmations are append-only and must point at an
    existing observation; equal-rank sources are ordered by latest sighting;
  - a country referenced only by a player's nationality can be deleted; the
    nationality is cleared, resolving changes nothing, the observation is
    kept; clearing a nationality whose country exists is still rejected;
  - no client role can execute the functions or read the tables;
  - the existing squad-ingest, player-list and squad-recovery pgTAP files
    pass unchanged.
- Weekly email:
  - a new user and every existing user start with `pepites_weekly_email`
    false; `update_my_preferences` and `update_my_notification_preferences`
    leave it unchanged;
  - opt in and out are idempotent and audited; opting out cancels unsent
    Pépites deliveries;
  - fan-out and claim skip or cancel: opted out, mode not `public`, edition
    withdrawn or superseded, email switched off, unconfirmed address;
  - publishing twice or retrying the dispatch gives one delivery per user;
  - a Pépites unsubscribe token turns off only Pépites and leaves other
    email on; a token without a topic still turns off all email; a used
    token answers `already_unsubscribed`;
  - an event older than 36 hours is not sent;
  - an unknown outcome is retried under the same key and body within 23
    hours of the first attempt, and closed as `possibly_sent` after it;
  - the report counts queued, sent, deferred, expired, cancelled and
    possibly sent for an edition; Pépites never spends the account-email
    reserve and never goes before an existing email type.
- Email dispatch (Bun, with the dispatcher's fake Resend): a
  `pepites_weekly` delivery renders in French and Arabic with the topic
  unsubscribe link and header; Resend accepts but the response is lost, and
  the retry an hour later sends the same key and body and produces one
  email; a retry after 24 hours is refused.
- Access matrix: every public function × `off`, `staff`, `public` × anon,
  signed-in fan, staff. Staff-only data never reaches a fan.
- Photos: unlicensed, revoked, expired, minor without guardian and unknown
  date of birth all return null; a share image only uses a social-scope
  photo; no approval without `captured_on`.
- Resolver: priority and conflicts. Admin permission checks.

**App:**

- Unit tests on formatters and fallbacks (`PlayerPhoto` done).
- Route headers: `no-store` in `staff` and `off`; public cache headers only
  in `public`; each response type carries the §7 value.
- Reveal, against a local stack with two connections: connection A begins a
  publication and holds it before commit; requests on B for the pointer,
  home, ranking, player and share image all return the previous version;
  after A commits, B gets the new version; after A rolls back, B still gets
  the old one.
- Pointer states: `countdown` with a scheduled edition; `delayed` two
  minutes past `scheduled_for` without publication, and for a draft with
  `auto_publish` off; `current` after publication and after 24 hours.
- The page leaves the countdown when the pointer changes or turns
  `delayed`, and keeps checking in `delayed` (fake clock).
- e2e: a scheduled edition passes its time without publishing; the page
  shows the "coming soon" state; the edition is then published; the page
  shows it without a reload.
- e2e on the journeys in French and Arabic; visual checks at 390 px on real
  data.

## 12. Open items (owner)

Decided 2026-09-26: the v1 scope in §1, and the explicit, off-by-default
weekly email in §5.4. Still open:

- The provider B choice for attributes. BSD is measured in `PEPITES_PLAN.md`
  §10: good for player attributes; detailed stats for 2026-27 not yet seen.
- The CNDP coverage of photo releases.
- The email opt-in wording.

## 13. Follow-ups (non-blocking)

- **Declared key from confirmations to observations** (recorded
  2026-09-26, owner review of PR #225). The attribute migration checks
  `player_attribute_observation_confirmations.observation_id` with an
  insert trigger instead of a declared foreign key, only so that the
  existing "observations cannot be truncated" test keeps its own error
  message. Prefer the declared key. With it, a plain `TRUNCATE` of the
  observations is refused by PostgreSQL (`0A000`) before the append-only
  trigger runs; changing that test's expected error is acceptable as long
  as it still proves truncation is refused and no row was removed. Do this
  in a forward migration, or in place only while
  `20260926060000` is still unapplied everywhere.
