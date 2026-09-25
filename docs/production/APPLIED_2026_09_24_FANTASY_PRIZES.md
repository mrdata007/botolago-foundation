# Production: Fantasy prizes applied and switched on (2026-09-24)

On 2026-09-24 a Claude Code session made two writes to Production V2
(`tkewgajrljbwgwedqsxn`). The owner authorised each one separately:

1. **13:37 UTC**: migration `20260924120000_fantasy_prizes.sql` (PR #185).
2. **21:28 UTC**: the three seeded prizes switched on.

The public prize pages come from `PRIZES_ENABLED` in
`src/lib/feature-flags.ts`, which is a code change and not a database one. They
are visible only once a build with that flag on is published.

## 1. The migration

### How

The Phase 7E-B promoter's manifest ends before this migration, so it went in
through Supabase's `apply_migration`, on the owner's instruction.

- **What was applied:** the migration file verbatim, preceded by two lines that
  bound its locks: `set local lock_timeout = '5s';` and
  `set local statement_timeout = '120s';`.
- **How it was recorded:** Supabase recorded it under the apply-time version
  `20260924133723`, not the file's `20260924120000`. The name is
  `fantasy_prizes`.

**Before writing:**

- The ElBotola news import (finished 12:58 UTC) and the email-notification
  migrations (13:08 and 13:14 UTC) were waited out, so nothing else was writing.
- The whole migration was rehearsed on production inside a `DO` block ending in
  a deliberate `raise`, so it rolled back.
- A re-read confirmed that nothing from the rehearsal remained.

### Evidence

- 11 schema digests matched a local database with the same file applied. They
  cover:
  - functions and function grants;
  - tables, constraints and indexes;
  - row security and table grants;
  - triggers and enum types;
  - the seed rows and the `prizes.manage` permission.
- Users, teams, leagues, gameweeks and the admin audit log were unchanged.
- Anonymous probes:
  - the public prize reads answered, with empty lists;
  - `service_evaluate_fantasy_prizes` and the admin functions were refused.
- The Supabase security advisors reported nothing new for the prize objects.

## 2. Switching the three prizes on

### How

The admin console's `api.admin_save_fantasy_prize` needs a signed-in admin
with MFA and recent authentication. So, on the owner's instruction ("turn the
prizes on"), the change went in as one guarded SQL block run through
`execute_sql`. It is a single transaction, so any guard that fires rolls
everything back. The block:

1. requires the catalog to be exactly the three seeded prizes: gameweek,
   monthly and season;
2. requires all three to be inactive, sponsor-free and unedited since the
   migration seeded them (`updated_at = 2026-09-24 13:37:23.728916+00`);
3. requires that nothing has been awarded or evaluated yet;
4. sets `active = true` on the three and requires exactly 3 rows changed;
5. requires `api.fantasy_prizes()` to list 3 prizes.

The block was run three times:

1. **On a local copy:**
   - As written, the "unedited" guard fired, because the local timestamp
     differs.
   - With the local timestamp substituted, the whole path ran and rolled back.
2. **On production, as a rehearsal:** the block ended in
   `raise exception 'DRY_RUN_OK …'`.
   - A re-read showed the three prizes still inactive, with `updated_at`
     unchanged and an empty public list.
3. **On production, for real.**

**Before writing:**

- No other client connection was active on the database.
- No GitHub Actions run was writing to it: only the CI for this change was
  running, on its own local database.
- The last migration by another session was at 19:01 UTC (news).
- The pg_cron jobs (news publish every minute, email tick every 5 minutes,
  live-score refresh every 15 minutes) do not touch the prize tables.

<details>
<summary>The block as run</summary>

```sql
do $activate$
declare
  expected_ids constant uuid[] := array[
    'f7a10000-0000-4000-8000-000000000001',
    'f7a10000-0000-4000-8000-000000000002',
    'f7a10000-0000-4000-8000-000000000003'
  ]::uuid[];
  seeded_at constant timestamptz := '2026-09-24 13:37:23.728916+00';
  n integer;
  tiers text[];
  public_items jsonb;
  summary jsonb;
begin
  perform set_config('lock_timeout', '5s', true);
  perform set_config('statement_timeout', '30s', true);

  select count(*), array_agg(tier::text order by id) into n, tiers from app.fantasy_prizes;
  if n <> 3 or tiers <> array['gameweek', 'monthly', 'season'] then
    raise exception 'GUARD catalog: % prizes, tiers %', n, tiers;
  end if;

  select count(*) into n from app.fantasy_prizes
  where id = any(expected_ids) and not active and sponsor_name is null and updated_at = seeded_at;
  if n <> 3 then
    raise exception 'GUARD untouched: only % of 3 prizes are inactive, sponsor-free and unedited', n;
  end if;

  if exists (select 1 from app.fantasy_prize_winners)
    or exists (select 1 from app_private.fantasy_prize_evaluations) then
    raise exception 'GUARD awards: winners or evaluations already exist';
  end if;

  update app.fantasy_prizes set active = true where id = any(expected_ids) and not active;
  get diagnostics n = row_count;
  if n <> 3 then
    raise exception 'GUARD update: % rows changed, expected 3', n;
  end if;

  public_items := api.fantasy_prizes() -> 'items';
  if jsonb_array_length(public_items) <> 3 then
    raise exception 'GUARD public: api.fantasy_prizes lists %, expected 3', jsonb_array_length(public_items);
  end if;

  select jsonb_agg(jsonb_build_object(
    'tier', item ->> 'tier', 'fr', item -> 'name' ->> 'fr', 'mad', item -> 'estimatedValueMad',
    'sponsor', item -> 'sponsorName'))
  into summary from jsonb_array_elements(public_items) item;

  raise notice 'ACTIVATED %', summary;  -- the rehearsal raised an exception here instead
end
$activate$;
```

</details>

### Evidence

- **The three rows:** all three read `active = true` with `sponsor_name` null,
  and all carry `updated_at = 2026-09-24 21:28:53.797836+00`.
- **What visitors see:** an anonymous
  `POST /rest/v1/rpc/fantasy_prizes` (`Content-Profile: api`) returns 3 prizes,
  none with a sponsor:

  | Tier     | Prize                                            | Value      |
  | -------- | ------------------------------------------------ | ---------- |
  | Gameweek | Recharge mobile + maillot d'un club de la Botola | 500 MAD    |
  | Monthly  | Smartphone                                       | 2,500 MAD  |
  | Season   | Voyage pour le derby + smartphone haut de gamme  | 25,000 MAD |

- **Nothing else changed:** there are 0 winners and 0 evaluations, because no
  gameweek had been finalized yet. The latest migration version was unchanged
  by the write.

### Not in the admin audit log

This change bypassed the admin console, so `app_private.admin_audit_events`
has no entry for it; this file is the record. Change prizes from now on in
`/admin/prizes`, which audits every save.

### What happens next

- **Awarding.** A gameweek is evaluated once it is finalized with final points.
  The call to `api.service_evaluate_fantasy_prizes` comes from:
  - the lifecycle runner;
  - the hourly orchestrator (`fantasy-season-orchestrator.yml`, minute 12).

  GW1 is the first gameweek evaluated with the prizes on.

- **Checking winners.** Winners arrive as `pending` in `/admin/prizes`, for
  manual ID verification. The public winners wall lists only verified or paid
  winners.
- **Season length.** There is no `app.fantasy_prize_settings` row, so the
  season length is the default of 30 gameweeks: the monthly blocks are GW1–4,
  GW5–8 and so on, and the season prize is decided at GW30. Change it from
  `/admin/prizes` if the season is a different length.
- **League prizes.** There are none, by the owner's decision (2026-09-24), and
  the prize rules and the `/prizes` page description no longer mention one. Do
  not switch on a mini-league prize in `/admin/prizes` without first putting
  its rule back into the prize rules.

## Check it yourself

```sql
select version, name, encode(extensions.digest(statements[1], 'sha256'), 'hex') as sha256
from supabase_migrations.schema_migrations
where version = '20260924133723';
-- expect name fantasy_prizes,
-- sha256 454b0b32218292e217eaad907112c5c20b2b656e1e0ea624470db36ba2b717b4

select id, tier, active, sponsor_name, updated_at from app.fantasy_prizes order by id;
-- expect three rows, active = true, sponsor_name null (until someone edits them)

select jsonb_array_length(api.fantasy_prizes() -> 'items');  -- expect 3
```

The recorded statement is the repository file with the two `set local` lines in
front and the final newline dropped. This rebuilds it:

```sh
{ printf "set local lock_timeout = '5s';\nset local statement_timeout = '120s';\n"
  cat supabase/migrations/20260924120000_fantasy_prizes.sql; } | head -c -1 | sha256sum
# 454b0b32218292e217eaad907112c5c20b2b656e1e0ea624470db36ba2b717b4
```
