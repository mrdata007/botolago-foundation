# Pépites: architecture (Gate A)

Status: **design for review, revision 2. Nothing here is built or applied.**
Written 2026-09-26. Companion to [`PEPITES_PLAN.md`](PEPITES_PLAN.md) (plan
and data audit). Owner decisions so far: Pépites takes the Profile slot in
the bottom bar (Profile moves to the header avatar). The owner is the Monday
editor. Claude builds and the owner approves every stage and every
production change.

Gate A passes when the owner approves this document. No migration is written
before that.

### Revision 2 (2026-09-26): what changed after review

Revision 1 was reviewed and sent back with changes requested. Each finding
was checked against the repository before it was accepted; all were
confirmed.

| Finding                                                                       | Where it is fixed |
| ----------------------------------------------------------------------------- | ----------------- |
| Score formula used two scales (percentile 0–100 × 100)                        | §4.4              |
| "`percent_rank()` with ties at their average" is not what `percent_rank` does | §4.3              |
| Small position groups fell back to comparing unlike measures                  | §4.2              |
| A round number cannot reproduce a run after data is corrected                 | §3.5, §4.6        |
| The 2025-26 ranking used current-season memberships                           | §4.7              |
| Unapproved photos would sit in `football-media`, a public bucket              | §3.3              |
| No split between in-app and social use; no capture date; no revocation        | §3.3              |
| `off` / `staff` / `public` not enforced in the API                            | §6.1              |
| "Latest run" could expose an unpublished run                                  | §6.1              |
| Shortlist of 20 against ranks 1–10; entries only protected from update        | §3.6, §5          |
| Computed and editorial rank mixed; movement undefined                         | §3.6, §4.5        |
| No rule for a postponed match played after its round was ranked               | §5.3              |
| Clean sheets changed definition with the data available                       | §4.1              |
| Provider-neutral refactor was the first dependency                            | §8, §10           |
| `shirt_number` is a membership field, not a player attribute                  | §3.1              |
| A 270-minute floor after three rounds needs every minute played               | §4.2              |
| Anonymous view counts could be inflated                                       | removed from v1   |
| Monday cache could show last week's edition after publication                 | §7                |
| "Every eligible player has a DOB" is circular                                 | §4.2, plan gate B |

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
- The weekly email to accounts that opt in.

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
  | `source_kind`   | `provider`, `manual` or `derived`                                                  |
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
priority)`: manual first, then SportsMonks, then BSD.
- `app_private.resolve_player_attributes(p_player_ids uuid[])` is the single
  writer of those `app.players` columns. It picks the winning observation per
  attribute.
  - Two providers disagreeing on a date of birth or a nationality raise a
    data-desk issue. It is not silently resolved.

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

Snapshot tables, in `app_private`, written once by the gather step. A
trigger rejects update and delete.

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

### 3.6 Scores and editions

| Table                         | Columns                                                                                                                                                                                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app.pepites_player_scores`   | `run_id`, `player_id`, `team_id`, `position_group`, `age_years`; `apps`, `starts`, `minutes`, `goals`, `assists`, `saves`, `clean_sheets`; `rating_avg`, `rating_n`, `form_avg`; `per90 jsonb`, `percentiles jsonb`, `components jsonb`, `flags text[]`; `score_exact numeric`, `score smallint`, `rank int`, `rank_in_position int` |
| `app.pepites_editions`        | `id`, `season_id`, `week_number`, `round_number`, `run_id`, `status`, `corrects_edition_id`, `scheduled_for`, `published_at`, `published_by`, `withdrawn_at`, `withdrawn_reason`, `created_at`                                                                                                                                       |
| `app.pepites_edition_entries` | `edition_id`, `editorial_rank 1..10`, `player_id`, `computed_rank`, `computed_score`, `movement smallint null`, `is_new boolean`, `reason_fr`, `reason_ar`                                                                                                                                                                           |

Three things are kept apart:

| Concept             | Where it lives                                                           |
| ------------------- | ------------------------------------------------------------------------ |
| Computed ranking    | `pepites_player_scores` of a run. Reproducible.                          |
| Editorial shortlist | Not stored: the run's computed top 20, queried when the editor opens it. |
| Published Top 10    | `pepites_edition_entries`. The editor's choice, labelled as editorial.   |

Constraints:

- Player scores: primary key `(run_id, player_id)`; `score` between 0 and
  100; `rank` null for an unranked player (§4.4).
- Editions:
  - `status` is `draft`, `scheduled`, `published`, `withdrawn` or
    `superseded`.
  - A partial unique index allows one `published` edition per
    `(season_id, week_number)`.
  - Once an edition leaves `draft`, `season_id`, `week_number`,
    `round_number` and `run_id` cannot change.
  - Allowed moves: `draft → scheduled → published`, `scheduled → draft`,
    `published → withdrawn`, `published → superseded`. A trigger rejects the
    rest.
- Edition entries:
  - Primary key `(edition_id, editorial_rank)`; `(edition_id, player_id)`
    unique.
  - Insert, update and delete are rejected unless the edition is `draft`.
  - Every entry's player must have a ranked score in the edition's run.
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
  the previous published edition.
- In the Top 10, the arrow compares the editorial rank with the previous
  published edition's editorial rank, which is what readers saw. `is_new`
  when the player was not in it.

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
  3. **Draft.** At Monday `draft_local_time`: if a succeeded run exists for a
     round newer than the last published edition, and §4.2 allows an
     edition, create a `draft` edition prefilled with the computed top 10,
     and email the editor.
  4. **Publish.** At `publish_local_time` and on every later tick for 24
     hours: publish a `scheduled` edition; publish a still-`draft` edition
     only if `auto_publish` is true (it goes out without editor lines).
     After 24 hours it stays unpublished and ops is alerted.
  5. Weeks without a completed round (international breaks) have no
     edition.
- **Failed runs** are marked `failed` with the error, retried on the next
  tick up to 3 attempts per fingerprint, then alert ops. A draft is only ever
  made from a succeeded run.
- **The one-writer rule applies.** This job writes. Add it to the `AGENTS.md`
  schedule list with its pause command:
  `select app_private.pepites_configure('off', null);`

### 5.2 Publishing

`app_private.pepites_publish_edition(edition_id, actor)`, in one
transaction:

1. Lock the edition row (`for update`). If it is already `published`,
   return it unchanged: publishing is idempotent.
2. Validate: status `scheduled` (or `draft` under `auto_publish`); 10
   entries with distinct players; each player ranked in the edition's run;
   the run `succeeded`; reasons within length limits.
3. Freeze: copy `computed_rank` and `computed_score` from the run; compute
   `movement` and `is_new` (§4.5).
4. Set `published`, `published_at`, `published_by`; set the run's
   `activated_at` if empty; mark the edition it corrects `superseded`.
5. Enqueue the weekly email with deduplication key
   `pepites-edition:<edition_id>:<user_id>`. The pipeline's unique key
   makes a second email for the same edition impossible.

### 5.3 Revisions, corrections and withdrawal

- **New inputs.** A postponed match played later, or a corrected score,
  changes the fingerprint of the latest round, so the next tick makes a new
  run revision. A `draft` or `scheduled` edition is re-pointed to it; a
  `scheduled` one goes back to `draft` if its top 10 changed, and the editor
  is emailed. A published edition never changes.
- **Correction edition.** To fix a published edition, the editor creates a
  new edition for the same week with `corrects_edition_id`, from the newest
  run. Publishing it supersedes the old one, whose page then says
  "corrigée" and links to the correction.
- **Withdrawal.** `published → withdrawn` with a reason. Its page and share
  images then say it was withdrawn and show no entries; the home page falls
  back to the previous published edition.

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
- **Which run is public.** The run of the current published edition (latest
  `published`, not withdrawn or superseded). Before any edition, the
  activated `season_final` run. A run nobody published is never public.
- Functions are `security definer` with `set search_path = ''`. `revoke all
… from public` first, then explicit grants: reads to `anon` and
  `authenticated`, admin functions to `authenticated` plus the permission
  check inside. Signatures callable by `anon` use `pg_catalog` types only
  (anon has no `USAGE` on schema `app`). Each function is listed in the
  grant review of its migration.

### 6.2 Functions

Every function returns `jsonb`. Localised text comes back in both languages
and the client picks one.

| Function                                                                                                           | Returns                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.pepites_home()`                                                                                               | The current published edition (entries with player card fields), its week and round, and `source`: `edition` or `previous_season`.                                                 |
| `api.pepites_ranking(p_position text, p_max_age int, p_team_id uuid, p_sort text, p_limit int ≤ 50, p_offset int)` | Rows from the public run (§6.1) plus total count. `p_sort` is one of `score`, `minutes`, `goals`, `assists`, `rating`, `form`, `ga90`.                                             |
| `api.pepites_player(p_player_id uuid)`                                                                             | Identity and attributes, with a `missing` list; `photo` (null unless approved, §3.3); the public run's row (score, rank, components, percentiles, per90, flags); editions entered. |
| `api.pepites_player_matches(p_player_id uuid, p_limit int ≤ 20)`                                                   | Date, home/away, opponent, score, minutes, started, goals, assists, cards, rating.                                                                                                 |
| `api.pepites_edition(p_season_id uuid, p_week int)`                                                                | A published, withdrawn or superseded edition, with its status and, when corrected, the correction's link.                                                                          |
| `api.pepites_methodology()`                                                                                        | The public methodology and coverage: pool size, players excluded for no date of birth, rating coverage, foot and height coverage.                                                  |
| `api.admin_pepites_edition_get(p_edition_id)`                                                                      | Edition, entries and the run's top 20 shortlist. Protected by `pepites.edit`.                                                                                                      |
| `api.admin_pepites_edition_update(p_edition_id, p_entries jsonb)`                                                  | Order and reasons, `draft` only. Protected by `pepites.edit`.                                                                                                                      |
| `api.admin_pepites_edition_schedule(p_edition_id, p_at)`                                                           | Protected by `pepites.publish` (recent auth).                                                                                                                                      |
| `api.admin_pepites_edition_correct(p_edition_id)`                                                                  | Creates the correction draft. Protected by `pepites.publish` (recent auth).                                                                                                        |
| `api.admin_pepites_edition_withdraw(p_edition_id, p_reason)`                                                       | Protected by `pepites.publish` (recent auth).                                                                                                                                      |
| `api.admin_data_desk_list(p_filters)`                                                                              | Protected by `football.read_operations`.                                                                                                                                           |
| `api.admin_player_attribute_correct(p_player_id, p_attribute, p_value, p_source_note)`                             | Protected by `football.correct`.                                                                                                                                                   |
| `api.admin_player_photo_submit(p_player_id, p_intake_path, p_release jsonb)`                                       | Records the release; approval runs the checks in §3.3. Protected by `football.correct`.                                                                                            |
| `api.admin_player_photo_revoke(p_release_id, p_reason)`                                                            | Protected by `football.correct` (recent auth).                                                                                                                                     |

New permissions:

- `pepites.edit` (no recent auth)
- `pepites.publish` (recent auth)

Both are granted to `publisher`, `content_admin` and `platform_admin`.

## 7. Performance and caching

- Public pages read precomputed tables only; no percentile maths at request
  time.
- Cache headers are sent only when the response is `public` (§6.1). Anything
  else is `private, no-store`.
- **Pages showing "the current edition"** (home, ranking, player): `s-maxage`
  is the smaller of 300 seconds and the time left until the next scheduled
  publication, with no `stale-while-revalidate` across that moment. At 20:00
  every cached copy has expired, so nobody sees last week's edition after the
  reveal. A publication outside the schedule can take up to 5 minutes to
  show; the admin screen says so.
- **Edition pages** (`/pepites/semaine/$n`): `s-maxage=300`, because an
  edition can still be withdrawn or corrected.
- **Share images** at `/og/pepites/<edition_id>/<player_id>.png`: rendered
  with the rights of the moment (§3.3), `s-maxage=3600`.
- **Load test.** A target, not a measured capacity: a Monday 20:00 peak of
  200 page requests per second with fewer than 20 reaching the database,
  including the cold-cache moment right after publication, when every
  "current edition" copy expires together. If it fails, publication also
  writes the public payloads once as static JSON that the pages read, so the
  peak never reaches the database.

## 8. Second provider

Additive in v1. No existing SportsMonks function changes.

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

1. `player_attributes_provenance`: columns, observations, priority, resolver,
   detailed position.
2. `player_photo_releases`: private buckets, release table, approval trigger,
   revocation, read helper.
3. `data_desk_issues`
4. `pepites_engine`: methodologies, runs, snapshot tables, scores, gather,
   score, replay, and the 2025-26 `season_final` run.
5. `pepites_editions`: editions, entries, state triggers, settings, tick,
   publish, cron schedule (mode `off`).
6. `pepites_api`: access check, read and admin functions, permissions,
   grants.

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
- Snapshot and methodology immutability: update and delete rejected.
- Editions: every disallowed state move rejected; entries rejected outside
  `draft`; two concurrent publishes of one edition give one publication and
  one email per recipient; two concurrent ticks give one run.
- Postponed match: played after its round, it creates a revision; a
  scheduled edition returns to draft.
- Access matrix: every public function × `off`, `staff`, `public` × anon,
  signed-in fan, staff. Staff-only data never reaches a fan.
- Photos: unlicensed, revoked, expired, minor without guardian and unknown
  date of birth all return null; a share image only uses a social-scope
  photo; no approval without `captured_on`.
- Resolver: priority and conflicts. Admin permission checks.

**App:**

- Unit tests on formatters and fallbacks (`PlayerPhoto` done).
- Route headers: `no-store` in `staff`; public cache headers only in
  `public`; `s-maxage` ends at the next publication.
- e2e on the journeys in French and Arabic; visual checks at 390 px on real
  data.

## 12. Open items (owner)

- The scope change: compare and follows move to v1.1; public view counts are
  dropped. Share images stay in v1.
- The email audience: accounts that opt in to the weekly Pépites email
  (follows are v1.1).
- The provider B choice for attributes. BSD is measured in `PEPITES_PLAN.md`
  §10: good for player attributes; detailed stats for 2026-27 not yet seen.
- The CNDP coverage of photo releases.
- The email opt-in wording.
