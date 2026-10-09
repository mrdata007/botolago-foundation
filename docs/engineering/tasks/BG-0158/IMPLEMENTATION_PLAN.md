# BG-0158 Manager Card backend — implementation plan

The design and the owner's answers are in
[`docs/backend/MANAGER_CARD_DOMAIN_PLAN.md`](../../../backend/MANAGER_CARD_DOMAIN_PLAN.md)
(read it in full before any lane). The owner approved every recommendation
(D1–D20) on 2026-10-08. This file splits the build into lanes for coding agents
and fixes the names, slots and contracts they share, so lanes running side by
side do not collide.

## Rules every lane follows

- `AGENTS.md` and `CLAUDE.md` apply in full. No lane touches staging or
  production, runs a Supabase/Lovable/GitHub MCP tool, or merges anything.
  Databases: only the local throwaway cluster from Lane 0.
- Write only the files your lane owns (table below). Do not commit; the
  orchestrator commits each lane after review.
- Forward-only: once a migration below is committed, later fixes go in the same
  file only while the PR is unmerged and unapplied anywhere.
- Follow recent migrations, not `docs/backend/MIGRATIONS.md`, where they differ.
  Templates: `20261006143700_account_deletion_automatic.sql` (settings row,
  configure function, pg_cron job, prune companion, history), and
  `20261005130000_fantasy_public_recaps.sql` (api RPC shape, step-up, errors).
- Every `api` function: `security definer`, `set search_path = ''`, caller from
  `(select auth.uid())`, `perform app_private.assert_mfa_step_up();` first,
  errors `PT400/401/403/404/409` with snake_case messages, arguments of
  `pg_catalog` types only, `revoke all … from public`, `grant execute … to
authenticated, service_role` (never `anon`).
- Every table: `enable` and `force row level security`, `revoke all` from
  `public, anon, authenticated, service_role`, no policies, an index on every
  foreign-key column.
- Card logic reads Fantasy tables only. It never writes a Fantasy table, and no
  Fantasy, prize, league or ranking function reads card tables.
- Never claim a check you did not run. Report what you ran and its output.

## Shared names and slots

| Slot             | File                            | Lane                            |
| ---------------- | ------------------------------- | ------------------------------- |
| `20261008123000` | `manager_card_schema.sql`       | 1                               |
| `20261008123100` | `manager_card_erase_lock.sql`   | 1                               |
| `20261008123200` | `manager_card_compute.sql`      | 2                               |
| `20261008123300` | `manager_card_api.sql`          | 3                               |
| `20261008123400` | `manager_card_jobs.sql`         | 2                               |
| `20261009100000` | `manager_card_moment_acks.sql`  | P1 (`MANAGER_CARD_GAP_PLAN.md`) |
| `20261009100100` | `manager_card_read_helpers.sql` | P1                              |
| `20261009100200` | `manager_card_api_v2.sql`       | P1                              |
| `20261009100300` | `manager_card_health.sql`       | P3                              |

Objects (Lane 1 creates the tables; others use these exact names):

- `app.manager_cards(user_id uuid pk → app.profiles(id) on delete cascade,
serial text null unique check (serial ~ '^[1-9][0-9]{5}$'), founder_cohort
smallint null, founder_granted_at timestamptz null, created_at, updated_at)`.
  Trigger: `serial` may go from null to a value once, never change after; the
  same serial may never be reused (checked against the retired list).
- `app.manager_card_seasons(user_id → app.manager_cards on delete cascade,
fantasy_season_id → app.fantasy_seasons on delete cascade, fantasy_team_id →
app.fantasy_teams on delete cascade, ovr smallint, tier text check in
('homa','stade','pro','champion','legend'), cap, sel, trf, con smallint
(all nullable, 1–99), cap_raw, sel_raw, trf_raw, con_raw numeric,
gameweeks_counted integer, provisional boolean, rules_version integer,
through_gameweek_id → app.fantasy_gameweeks on delete cascade, calculated_at;
pk (user_id, fantasy_season_id))`.
- `app.manager_card_gameweeks(user_id, fantasy_season_id, gameweek_id →
app.fantasy_gameweeks on delete cascade, same figures as seasons, pk (user_id,
gameweek_id))`.
- `app_private.manager_card_rules(version integer pk, created_at, config jsonb
not null, active boolean)` — at most one active row (partial unique index);
  a used version is immutable (trigger refuses update of `config`). No row
  shipped. `config` shape is defined in Lane 2 below.
- `app_private.manager_card_settings(id boolean pk default true check (id),
compute_enabled boolean not null default false, read_enabled boolean not null
default false, updated_at)` with one row inserted, both false.
- `app_private.manager_card_configure(p_compute boolean, p_read boolean)` —
  executable by `postgres` only.
- `app_private.manager_card_evaluations(gameweek_id → app.fantasy_gameweeks on
delete cascade, rules_version, scoring_input_version bigint, evaluated_at,
cards_written integer, pk (gameweek_id, rules_version))`.
- `app_private.manager_card_job_log(id bigserial, started_at, finished_at,
outcome text, detail jsonb)`.
- `app_private.manager_card_retired_serials(serial text pk, retired_at)` — no
  user id; filled by an AFTER DELETE trigger on `app.manager_cards`.
- Advisory lock key: `botolago:manager-card`, taken as
  `pg_try_advisory_xact_lock(pg_catalog.hashtextextended('botolago:manager-card', 0))`.
- Functions Lane 2 creates: `app_private.manager_card_evaluate_gameweek(p_gameweek_id
uuid, p_rules_version integer) returns jsonb`, `app_private.manager_card_tick()
returns jsonb`, `app_private.manager_card_assign_serial(p_user_id uuid) returns
text`, `app_private.manager_card_grant_founder(p_fantasy_season_id uuid,
p_cutoff timestamptz, p_cohort smallint, p_excluded_user_ids uuid[]) returns
integer`.
- Jobs: `manager-card-tick` every 15 minutes (`*/15 * * * *`, command sets
  `set local statement_timeout`), `manager-card-history-prune` at `47 3 * * *`.

## Lanes

### Lane 0 — local database harness (scratchpad only, never committed)

Build a throwaway PostgreSQL 16 cluster (`/usr/lib/postgresql/16/bin`) on a
non-default port with stand-ins for what Supabase provides: roles `anon`,
`authenticated`, `service_role`, `authenticator`, `supabase_admin`; the `auth`
schema objects the migrations reference (`auth.users`, `sessions`,
`mfa_factors`, `identities`, `auth.uid()`, `auth.jwt()`, `auth.role()`,
`auth.email()` reading `request.jwt.claims`); `storage` objects; a `cron` schema
stand-in (`cron.job`, `cron.job_run_details`, `cron.schedule`,
`cron.unschedule`, `cron.alter_job`) if `pg_cron` is unavailable; `pg_net`
(`net.http_post`) stand-in; `extensions` schema with `pgcrypto` and pgTAP
(install `postgresql-16-pgtap` via apt if the network allows, else build pgTAP
from source). BG-0082 and BG-0043 did this before
(`docs/engineering/tasks/BG-0082/verification-report.yaml`). Deliver:

- `reset.sh` — drops and recreates the database, applies the stand-ins, then
  every file in `supabase/migrations` in order; prints the first failure.
- `test.sh [file…]` — runs pgTAP files with `pg_prove` or `psql` and prints a
  pass/fail summary.
- A short `README.md` saying what is real and what is a stand-in.

Accept: all migrations on main apply; `account_deletion_automatic.test.sql`
and `ordinary_account_mfa_step_up_reads.test.sql` pass (or the difference is
explained and is a stand-in limit).

### Lane 1 — schema, switch, deletion coverage

Owns: `20261008123000_manager_card_schema.sql`,
`20261008123100_manager_card_erase_lock.sql`,
`supabase/tests/database/account_deletion_automatic.test.sql` (key array only),
`docs/backend/ACCOUNT_DELETION_RUNBOOK.md` (card lines only).

- Create every table, trigger, settings row and the configure function above.
- Erase lock: a `do` block reads `pg_get_functiondef('app_private.account_deletion_erase(uuid,integer)'::regprocedure)`,
  inserts a `pg_try_advisory_xact_lock` for `botolago:manager-card` next to the
  existing ones with the same failure behaviour, and raises unless the anchor
  occurs exactly once and the new definition differs; then `execute`s it.
- Check the catalogue rollback (`api.service_rollback_fantasy_catalog` in
  `20260918170000`, `scripts/backend/fantasy-catalog-restage-maintenance.sql`)
  still works with the new foreign keys; report what you found.

Accept: migrations apply on Lane 0's database; deleting a profile removes every
card row and retires its serial; `account_deletion_automatic.test.sql` passes
with the new key.

### Lane 2 — calculation, tick and jobs

Owns: `20261008123200_manager_card_compute.sql`,
`20261008123400_manager_card_jobs.sql`.

`config` jsonb shape in the rules row (every number data, none hard-coded):

```json
{
  "minimum_gameweeks": 3,
  "provisional_below": 5,
  "trf_window_gameweeks": 3,
  "cap_ignore_deadlines_before": "2026-10-08T00:00:00Z",
  "scales": {
    "cap": [
      [0, 1],
      [1, 99]
    ],
    "sel": [
      [0, 1],
      [1, 99]
    ],
    "trf": [
      [-10, 1],
      [10, 99]
    ],
    "con": [
      [0, 1],
      [1, 99]
    ]
  },
  "tiers": { "stade": 50, "pro": 65, "champion": 78, "legend": 88 },
  "batch_size": 500
}
```

`cap_ignore_deadlines_before` is set when PR #376 ships (it has not yet).
`scales` are piecewise-linear points `[raw, score]`, sorted by raw; values
outside are clamped; the result is rounded and kept in 1–99. The numbers above
are placeholders for tests only — no rules row ships.

Implement section 3 of the domain plan exactly: CAP, SEL (best legal eleven
from `fantasy_position_rules`), TRF, CON from final team results of `active`
teams, OVR (mean of non-null stats, null when fewer than three), tier,
minimum and provisional. Evaluable gameweek = stable and postwork completed for
its current `scoring_input_version`; walk in `sequence_number` order;
re-evaluate a gameweek and all later ones when its version differs from its
ledger row; read the version at start and end and write nothing if it changed.
Skip profiles with `deleted_at` set. Recompute season values from all rows,
never deltas. Serial: assigned on first card row by
`manager_card_assign_serial` (random 100000–999999, not in use, not retired,
retry on collision). Founder only via `manager_card_grant_founder`, which also
excludes `app_private.staff_principals` and `@botolago.com` accounts.

Tick: lock not taken → `{"outcome":"busy"}`; switch off →
`{"outcome":"off"}`; no active rules → `{"outcome":"no_rules"}`; else evaluate
up to a capped number of gameweeks/teams, log to the job log, return counts.
Neither of the first three writes anything (the job log included).

Jobs migration: schedule both jobs; prune deletes only this tick's
`cron.job_run_details` rows older than 7 days and job-log rows older than 180
days.

Accept: hand-computed fixtures (Lane 4 writes them; you write a smoke fixture
of your own) reproduce every stat; a second run changes nothing.

### Lane 3 — read API and app data layer

Owns: `20261008123300_manager_card_api.sql`,
`supabase/tests/database/ordinary_account_mfa_step_up_reads.test.sql` (count
and description only), `src/backend/manager-card/`.

- `api.get_my_manager_card()`, `api.get_manager_card(p_fantasy_team_id uuid)`,
  `api.get_manager_cards(p_fantasy_team_ids uuid[])` (max 100, else PT400),
  `api.get_my_manager_card_history(p_after_gameweek_sequence integer default
null, p_limit integer default 20)` (keyset by gameweek sequence, max 50).
- Refuse with `PT403 manager_card_off` while `read_enabled` is false. Nothing
  for a profile with `deleted_at` set. Never return a user id or e-mail.
- Response (camelCase jsonb): `fantasyTeamId`, `name` (display name if
  non-blank, else team name), `handle` (username or null), `serial` (string or
  null), `founderCohort`, `season` {`id`, `label`}, `ovr`, `tier`, `stats`
  {`cap`,`sel`,`trf`,`con`}, `provisional`, `gameweeksCounted`, `rulesVersion`,
  `club` {`id`,`code`,`shortName` {`fr`,`ar`},`primaryColor`,`secondaryColor`}
  or null. When the current season is under the minimum, return last season's
  card with its season label (D7). History rows: gameweek sequence, ovr, tier,
  four stats, provisional.
- Raise the step-up count 77 → 81 and append "the four Manager Card reads
  (20261008123300)" to that test's description.
- `src/backend/manager-card/{contracts,errors,supabase-repository,mock-repository}.ts`
  modelled on `src/backend/predictions/`, with bun tests; mock data labelled as
  a sample. No routes or components.

### Lane 4 — tests, docs, apply script

Owns: `supabase/tests/database/manager_card.test.sql`,
`docs/backend/MANAGER_CARD_OPERATIONS_RUNBOOK.md`, the `AGENTS.md`
scheduled-job entry, `scripts/backend/apply-20261008123000-manager-card.sql`
and its bun test.

- pgTAP (`begin; select extensions.plan(N); … finish(); rollback;`, helpers as
  in `account_deletion_automatic.test.sql`): constraints, grants, RLS, visitor
  and cross-user refusal, switch off, `no_rules`, hand-computed fixtures for
  CAP/SEL/TRF/CON/OVR/tier including vice promotion, Bench Boost, Free Hit,
  Triple Captain, no transfers (null TRF), under minimum, provisional,
  cancelled gameweek, correction re-evaluation, idempotency, deleted-pending
  profile hidden and skipped, deletion cascade and serial retirement, serial
  immutability, the erase lock, prune sparing card tables, and no Fantasy table
  written.
- Runbook: switches, inserting rules v1, founder grant, pausing and restoring,
  health checks.
- AGENTS.md: one entry for `manager-card-tick` and `manager-card-history-prune`
  under "Check the scheduled jobs too", shaped like `account-deletion-tick`.
- Apply script modelled on `apply-20261006143700-account-deletion-automatic.sql`:
  rehearsal by default, sha256 of each of the five migrations, preflight
  refusing unless `20261005130000` and `20261006143700` are recorded and no
  card object exists, postflight checking both switches false, no rules row,
  grants and the erase lock.

## Order

Lane 0 and Lane 1 run first, side by side. Lanes 2 and 3 run side by side
after Lane 1 is committed. Lane 4 runs after 2 and 3. The orchestrator then
regenerates types (CI artifact), opens the draft PR and drives CI green.
