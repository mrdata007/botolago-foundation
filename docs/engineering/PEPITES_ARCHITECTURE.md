# Pépites: architecture (Gate A)

Status: **design for review. Nothing here is built or applied.** Written
2026-09-26. Companion to [`PEPITES_PLAN.md`](PEPITES_PLAN.md) (plan and data
audit). Owner decisions so far: Pépites takes the Profile slot in the bottom
bar (Profile moves to the header avatar). The owner is the Monday editor.
Claude builds and the owner approves every stage and every production change.

Gate A passes when the owner approves this document. No migration is written
before that.

## 1. Scope

**v1 (this document):**

- A ranking of Botola Pro players under 23, on stats we reliably have.
- A weekly Top 10 edition with editor lines in French and Arabic.
- Player pages: overview, match log and stats.
- Compare, follow, share images and the method page.
- Admin: the weekly selection and a data desk.
- A player-attribute sync from SportsMonks.
- Derived clean sheets.
- Licensed headshots.
- A seam for a second provider's detailed stats.

**Not in v1:**

- xG and xA.
- Botola 2.
- Player-uploaded profiles.
- The scout and academy accounts.
- Web push. Email only.

## 2. Flow

```
SportsMonks ──┐                         ┌─> app.player_fixture_performances (existing)
Provider B ───┼─> Supabase importers ───┼─> app.player_fixture_stat_values (new)
Data desk ────┤   (edge functions)      ├─> app_private.player_attribute_observations (new)
Photo intake ─┘                         └─> app.media_assets kind=player_photo (existing)
                                                   │
                     app_private.pepites_* engine (SQL, versioned)
                                                   │
             app.pepites_runs / app.pepites_player_scores / app.pepites_editions
                                                   │
                     api.pepites_* read RPCs (stable, anon)  ──> TanStack routes (SSR, cached)
                     api.admin_pepites_* (permissioned)      ──> /admin/pepites
```

Existing pieces reused:

- `app_private.football_provider_mappings`
- the protect-freshness triggers
- pg_cron + pg_net ticks
- `app.media_assets` and the `football-media` bucket
- `app_private.admin_assert_permission`
- the notification email pipeline
- `prefetchForSsr`
- the ui-kit

## 3. Data model

All tables follow `docs/backend/MIGRATIONS.md`:

- RLS in the same migration
- a `set_updated_at` trigger where rows change
- definer functions with `set search_path = ''`
- `api.*` grants as in `20260720095354_football_api_security.sql`

### 3.1 Player attributes with provenance

- `app.players`: add `height_cm smallint null`, checked between 140 and 215.
  Also add `detailed_position app.detailed_position null`. The new enum is
  `gk, cb, lb, rb, dm, cm, am, lw, rw, cf`.
  - `preferred_foot` and `nationality_country_id` already exist; they are
    filled by the resolver below.
- `app_private.player_attribute_observations` holds one row per observed
  value:

  | Column          | Type / values                                                                                      |
  | --------------- | -------------------------------------------------------------------------------------------------- |
  | `id`            |                                                                                                    |
  | `player_id`     |                                                                                                    |
  | `attribute`     | `date_of_birth`, `nationality`, `preferred_foot`, `height_cm`, `detailed_position`, `shirt_number` |
  | `value_text`    |                                                                                                    |
  | `value_numeric` |                                                                                                    |
  | `source_kind`   | `provider`, `manual` or `derived`                                                                  |
  | `provider_name` |                                                                                                    |
  | `source_ref`    |                                                                                                    |
  | `observed_at`   |                                                                                                    |
  | `recorded_by`   |                                                                                                    |
  | `note`          |                                                                                                    |
  | `superseded_at` |                                                                                                    |

  Rows are append-only; a new value supersedes, never overwrites.

- `app_private.player_attribute_source_priority(attribute, provider_name,
priority)`: manual always wins, then the configured provider order.
- `app_private.resolve_player_attributes(p_player_ids uuid[])` is the single
  writer of those `app.players` columns. It picks the winning observation per
  attribute and writes it.
  - A disagreement between two providers raises a data-desk issue. It is not
    silently resolved.

### 3.2 Detailed match stats (provider B)

- `app.player_stat_definitions(code pk, label_fr, label_ar, unit,
higher_is_better, per90)` is seeded with:
  - shots, shots on target
  - passes, accurate passes, key passes
  - duels, duels won
  - tackles, interceptions
  - dribbles attempted, dribbles won
  - fouls committed, fouls drawn
- `app.player_fixture_stat_values(fixture_id, player_id, stat_code,
provider_name, value numeric, source_version, provider_updated_at,
source_sequence)`.
  - The primary key is `(fixture_id, player_id, stat_code, provider_name)`.
  - The freshness trigger applies, as on the existing performance table.

### 3.3 Clean sheets (derived, not written into provider rows)

`app_private.pepites_clean_sheet(fixture, team, player)` returns a clean
sheet when all three hold:

- the player's team conceded 0;
- the player played 60+ minutes;
- the player's position group is GK or DEF.

When `match_events` exist for the fixture, goals conceded while he was on the
pitch are used instead. Provider rows keep their provider value (0).

### 3.4 Headshots

Headshots are `app.media_assets` rows with `kind = 'player_photo'`, linked by
`app.players.photo_asset_id` (which already exists).

- Public exposure requires all of:
  - `validation_status = 'validated'`;
  - `license_code` in (`club_licence`, `botolago_release`, `agency_licence`);
  - `copyright_owner` and `credit` set.
- New table `app_private.player_photo_releases(asset_id, player_id,
signed_on, signer_role player|guardian, document_path)`.
  - For a player under 18 on the capture date, a `guardian` release is
    required.
  - A trigger enforces this before `validation_status` can become
    `validated`.
- Read RPCs return a photo URL only when these checks pass. Otherwise they
  return `null`, and the UI draws the silhouette (`PlayerPhoto`).

### 3.5 Fans

- `app.followed_players(user_id, player_id, created_at)`.
  - The primary key is `(user_id, player_id)`.
  - RLS: a user sees and edits only their own rows.
  - It mirrors `app.followed_teams`.
- `app.player_view_counts_daily(player_id, day, views bigint)`.
  - It is written only through `api.record_player_views`.

### 3.6 Engine and editions

| Table                         | Columns                                                                                                                                                                                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.pepites_methodologies`   | `version pk`, `weights jsonb`, `eligibility jsonb`, `description_fr`, `description_ar`, `active boolean`, `created_at`                                                                                                                                                                        |
| `app.pepites_runs`            | `id`, `season_id`, `as_of_round_number`, `methodology_version`, `status`, `eligible_count`, `started_at`, `finished_at`, `error`                                                                                                                                                              |
| `app.pepites_player_scores`   | `run_id`, `player_id`, `team_id`, `position_group`, `age_years`; `apps`, `starts`, `minutes`, `goals`, `assists`, `saves`, `clean_sheets`; `rating_avg`, `rating_n`, `form_avg`; `per90 jsonb`, `percentiles jsonb`, `components jsonb`; `score smallint`, `rank int`, `rank_in_position int` |
| `app.pepites_editions`        | `id`, `season_id`, `week_number`, `round_number`, `run_id`, `status draft\|scheduled\|published\|withdrawn`, `scheduled_for`, `published_at`, `published_by`, `created_at`                                                                                                                    |
| `app.pepites_edition_entries` | `edition_id`, `rank 1..10`, `player_id`, `score`, `movement smallint null`, `is_new boolean`, `reason_fr`, `reason_ar`                                                                                                                                                                        |

Constraints:

- Runs: `status` is `running`, `succeeded` or `failed`.
- Player scores: the primary key is `(run_id, player_id)`.
- Editions:
  - A partial unique index allows one `published` edition per
    `(season_id, week_number)`.
  - A published edition's entries are immutable; a trigger rejects any
    update.
- Edition entries: the primary key is `(edition_id, rank)`; `(edition_id,
player_id)` is unique.
- `app_private.pepites_settings` is a single row: `mode off|staff|public`,
  `auto_publish boolean`, `publish_local_time` (default 20:00
  Africa/Casablanca), `draft_local_time` (default 12:00). It has a
  `configure` function like `predictions_configure`.

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

- Issues are created by a sweep function, by the resolver (conflicts) and by
  public "report an error" submissions (rate-limited, signed-in only).
- Fixes go through manual attribute observations or mapping corrections. Both
  are already audited.

## 4. Engine rules (methodology `v1`)

- **Pool.** Players with an active membership in a current-season Botola Pro
  team, born after 1 July (season start year − 23) — for 2026-27, born after
  2003-07-01. A player without a date of birth is excluded and raises a
  data-desk issue.
- **Eligible.** In the pool with
  `minutes ≥ max(270, 0.30 × 90 × team_matches_played)`. Before round 3 there
  is no weekly edition. The home page shows the frozen 2025-26 final ranking,
  computed once with the same method (600-minute floor) and labelled as such.
- **Rating.** Average `provider_rating` over appearances of 20+ minutes with a
  rating.
  - If fewer than 3 rated appearances, the rating and form components are
    null. The remaining weights are re-normalised and the row is flagged
    `low_rating_sample`.
- **Form.** Average of the last 6 rated appearances.
- **Contribution.** One measure per position group:
  - FWD and MID: goals + assists per 90.
  - GK: saves per 90 plus clean sheets per 90 (equal weight after
    percentiling).
  - DEF: clean sheets per 90, plus the rating percentile among defenders.
- **Progression.** Minutes share in the last 3 completed rounds minus minutes
  share in earlier rounds, where share = minutes / (90 × team matches in the
  span). Season-end variant: second half versus first half.
- **Minutes.** Total minutes.
- **Percentiles.**
  - Method: `percent_rank()` over the eligible pool, with ties at their
    average.
  - Contribution is percentiled within the position group. If the group has
    fewer than 8 players, the whole pool is used.
  - Stored 0–100 as integers.
- **Score.**
  `round(100 × Σ weight × percentile)` with
  `rating 0.30, form 0.20, contribution 0.20, progression 0.15, minutes 0.15`.
- **Tie-break.** Score, then minutes, then rating, then player id. This keeps
  the ranking deterministic.
- **Movement.** Rank against the previous published edition's entries.
  - `is_new` when the player was absent from it.
- **Reproducibility.** Every run stores its methodology version and inputs'
  `as_of_round_number`. Re-running a past run's inputs gives the same rows,
  and a pgTAP test pins this with fixtures.

Detailed-stat percentiles (passing, duels and so on) are computed and shown on
the player's Stats tab when provider B data exists for the player. They do not
enter the v1 score. A later methodology version may add them, with a new
version string.

## 5. Jobs and edition lifecycle

- `pepites-tick` runs every 15 minutes via pg_cron, calling
  `app_private.pepites_tick()`. It writes only when
  `pepites_settings.mode <> 'off'`.
  1. Detect newly completed rounds. A round is complete when every fixture in
     it is `finished` with `finalized_at` set, or postponed or cancelled.
  2. Start a run for the latest completed round (idempotent per
     season, round and methodology).
  3. At Monday `draft_local_time`: if a run exists for a round newer than the
     last edition, create the `draft` edition. It holds the top 20 as a
     shortlist, with the computed order prefilled into ranks 1–10. It emails
     the editor through the notification pipeline.
  4. At `publish_local_time`:
     - A `scheduled` edition publishes.
     - A still-`draft` edition publishes too if `auto_publish` is true,
       without reasons.
     - Otherwise it waits and raises an ops alert.
  5. Weeks without a completed round (international breaks) produce no
     edition.
- Publishing enqueues the weekly email to followers who opted in, reusing the
  notification types table.
- **The one-writer rule applies.** This job writes. Add it to the `AGENTS.md`
  schedule list with its pause command:
  `select app_private.pepites_configure('off', null);`

## 6. API contracts

Every function returns `jsonb`. Public read functions are stable security
definer, granted to `anon` and `authenticated`. Localised text comes back in
both languages and the client picks one.

| Function                                                                                                           | Returns                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.pepites_home()`                                                                                               | Latest published edition (entries with player card fields), the edition's week and round, `updated_at`, the mode (`live` or `previous_season`), and the top 5 of "Choix des fans" (follows gained in 7 days, signed-in follows only).  |
| `api.pepites_ranking(p_position text, p_max_age int, p_team_id uuid, p_sort text, p_limit int ≤ 50, p_offset int)` | Rows from the latest run plus total count. `p_sort` is one of `score`, `minutes`, `goals`, `assists`, `rating`, `form`, `ga90`.                                                                                                        |
| `api.pepites_player(p_player_id uuid)`                                                                             | Identity and attributes, with a `missing` list. `photo` is null unless licensed. Current run row (score, rank, components, percentiles, per90); follower count; views in 30 days, rounded to hundreds; editions entered; `data_flags`. |
| `api.pepites_player_matches(p_player_id uuid, p_limit int ≤ 20)`                                                   | Date, home/away, opponent, score, minutes, started, goals, assists, cards, rating and detailed stats when present.                                                                                                                     |
| `api.pepites_compare(p_a uuid, p_b uuid)`                                                                          | Two player payloads trimmed to the compare fields.                                                                                                                                                                                     |
| `api.pepites_edition(p_season_id uuid, p_week int)`                                                                | A published edition with entries.                                                                                                                                                                                                      |
| `api.pepites_methodology()`                                                                                        | Active methodology and data-coverage figures for the method page.                                                                                                                                                                      |
| `api.follow_player(uuid)`, `api.unfollow_player(uuid)`, `api.my_followed_players()`                                | Authenticated only.                                                                                                                                                                                                                    |
| `api.record_player_views(p_player_ids uuid[] ≤ 20)`                                                                | Anon allowed; increments daily counters; capped at 20 ids per call. The client batches every 30 s and on page hide. Counts are shown rounded, so abuse has little payoff.                                                              |
| `api.admin_pepites_edition_get(p_edition_id)`                                                                      | Protected by `pepites.edit`.                                                                                                                                                                                                           |
| `api.admin_pepites_edition_update(p_edition_id, p_entries jsonb)`                                                  | Order and reasons. Protected by `pepites.edit`.                                                                                                                                                                                        |
| `api.admin_pepites_edition_schedule(p_edition_id, p_at)`                                                           | Protected by `pepites.publish` (recent auth).                                                                                                                                                                                          |
| `api.admin_pepites_edition_withdraw(p_edition_id, p_reason)`                                                       | Protected by `pepites.publish` (recent auth).                                                                                                                                                                                          |
| `api.admin_data_desk_list(p_filters)`                                                                              | Protected by `football.read_operations`.                                                                                                                                                                                               |
| `api.admin_player_attribute_correct(p_player_id, p_attribute, p_value, p_source_note)`                             | Protected by `football.correct`.                                                                                                                                                                                                       |
| `api.admin_player_photo_attach(p_player_id, p_asset_id, p_release jsonb)`                                          | Protected by `football.correct`.                                                                                                                                                                                                       |

New permissions:

- `pepites.edit` (no recent auth)
- `pepites.publish` (recent auth)

Both are granted to `publisher`, `content_admin` and `platform_admin`.

## 7. Performance and caching

- Public pages read precomputed tables only; no percentile maths at request
  time.
- Public routes send `Cache-Control: public, s-maxage=300,
stale-while-revalidate=600`. The Monday reveal is served from cache after
  the first hit.
- Share images live at
  `/og/pepites/<edition_id>/<player_id>.png` and are immutable.
- Load-test target before launch: a Monday 20:00 peak of 200 page requests
  per second with fewer than 20 reaching the database. This fits the measured
  Medium ceiling of about 65 RPS.

## 8. Provider B seam

1. **Make existing RPCs provider-neutral first.** These hardcode
   `'sportsmonks'`:
   - `20260914184657_current_season_squad_recovery.sql`
   - `20260925110000_current_performance_unnamed_starters.sql` (also season
     `'28647'`)
   - `20260925200000_current_player_list_update.sql`
   - `attach_football_team_crest`
2. **Adapter.** Add `supabase/functions/_shared/<provider>-player-stats.ts`
   and `<provider>-players.ts`, following the SportsMonks files. They write
   through new service-role RPCs:
   - `api.ingest_player_fixture_stat_values`
   - `api.ingest_player_attribute_observations`
3. **Identity.**
   - Teams map by name plus manual confirmation (16 clubs).
   - Fixtures map by date plus teams.
   - Players map by name similarity plus date of birth plus team. Anything
     below full confidence becomes an `unlinked` data-desk issue. Nothing is
     auto-merged.
4. **Before display.** A comparison report must reach at least 98% agreement
   with SportsMonks on minutes and goals over 3 rounds.

## 9. Security and privacy

- RLS on every new table. `app_private.*` has no client grants.
- Player data is public sporting data.
- Photos and releases are personal data. Release documents live in a private
  bucket. Law 09-08: owner to confirm the CNDP declaration covers them.
- Admin actions are audited through the existing admin audit trail.

## 10. Migration sequence

Timestamps are picked at write time after `origin/main`; main is at
`20260926003500` today. Each migration comes with its pgTAP file.

1. `pepites_provider_neutral_rpcs`: remove the hardcoded provider and season.
2. `player_attributes_provenance`: columns, observations, priority, resolver,
   detailed position.
3. `player_stat_definitions_and_values`
4. `player_photo_releases`: release table, validation trigger, read helper.
5. `followed_players_and_views`
6. `data_desk_issues`
7. `pepites_engine`: methodologies, runs, scores, engine functions, and the
   2025-26 frozen run function.
8. `pepites_editions`: editions, entries, settings, tick, cron schedule
   (mode `off`).
9. `pepites_api`: read, write and admin RPCs, the permissions and grants.

Local proof for each: `bun run backend:migrations:check`, `backend:db:reset`,
`backend:db:test`, `backend:db:lint` and `backend:types:check`. CI
`database-quality` is the authority.

Production: nothing is applied by Claude. Each batch goes through
`RELEASE_ACTIVATION_MIGRATION_RUNBOOK.md` with the owner, dry-run first, one
writer at a time. Mode stays `off` until launch.

## 11. Tests

- **pgTAP:**
  - resolver priority and conflicts
  - clean-sheet derivation
  - eligibility boundaries (birth date, minutes floor)
  - percentile ties
  - score determinism
  - rating re-normalisation
  - movement and `is_new`
  - edition immutability
  - tick idempotency
  - photo exposure rules (unlicensed and minor-without-guardian return null)
  - RLS on follows
  - admin permission checks
- **App:**
  - unit tests on formatters and fallbacks
  - e2e on the four journeys in French and Arabic
  - visual checks at 390 px on real data

## 12. Open items (need owner input later, not blocking Gate A)

- The provider B choice. BSD is measured in `PEPITES_PLAN.md` §10: good for
  player attributes, detailed stats for 2026-27 not yet seen.
- The CNDP coverage of photo releases.
- The email opt-in wording for the weekly edition.
