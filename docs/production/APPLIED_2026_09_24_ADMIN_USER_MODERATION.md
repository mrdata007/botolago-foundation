# Production: migration 20260924160000 applied (2026-09-24)

`20260924160000_admin_user_moderation_and_analytics.sql`, the users page, bans and
admin dashboard from PR #188, was applied to Production V2 (`tkewgajrljbwgwedqsxn`)
on 2026-09-24 by the owner.

## How

The Phase 7E-B promoter only knows migrations up to `20260919120000`, so it could
not carry this one. It went through the other route `CLAUDE.md` allows: a guarded
script the owner runs,
[`scripts/backend/apply-20260924160000-admin-user-moderation.sql`](../../scripts/backend/apply-20260924160000-admin-user-moderation.sql),
pasted whole into the Supabase SQL editor.

In one transaction, the script:

1. refuses to run twice, or on a database missing what the migration builds on;
2. bounds its lock (5 s) and statement (120 s) timeouts;
3. runs the migration file verbatim;
4. records it in `supabase_migrations.schema_migrations` with the whole file as
   `statements[1]`, as the promoter records a migration;
5. checks the result: the six functions, their grants (`authenticated` yes, `anon`
   no), forced row security on `app_private.user_bans`, the seven ban triggers,
   `analytics.read` held by `platform_admin` alone, and one real read.

As committed, the script ends in `rollback;`. The owner ran it once like that as a
rehearsal, then changed that line to `commit;` and ran it again. The final result
row read "Applied".

## Evidence

- **Rehearsed first on a local copy** holding the other 83 migrations:
  - the rehearsal left nothing behind (no history row, no table, no permission);
  - the committed run applied;
  - a second run stopped at "already recorded as applied";
  - the recorded `statements[1]` hashed to the repository file
    (`05ebba0a…58aad0`);
  - `supabase/tests/database/admin_user_moderation.test.sql` then passed 88/88.
- **After the owner's run**, production's public API was probed anonymously:
  - `get_my_account_standing`, `admin_list_users`, `admin_get_user` and
    `admin_get_analytics_overview` answered `42501 permission denied`;
  - a made-up function name answered `PGRST202 not found`.

  So the functions exist and anonymous callers are refused. Only read functions
  were probed.

`scripts/backend/apply-admin-user-moderation-script.test.ts` keeps the script
carrying this exact migration, and keeps it shipping as a rehearsal.

## Check it yourself

```sql
select version, name, encode(extensions.digest(statements[1], 'sha256'), 'hex') as file_sha256
from supabase_migrations.schema_migrations
where version = '20260924160000';
-- expect one row; file_sha256 = 05ebba0aa0dc69f3abea827b0ac3546cf92b1f12ba8d6fce3810e1ef8b58aad0
```

## Not covered

The script applies this migration only. It does not depend on
`20260924120000_fantasy_prizes` or `20260924140000` / `20260924140100` (email
notifications), and says nothing about whether those are applied.
