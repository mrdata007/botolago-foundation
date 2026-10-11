# Public ranking exclusions

Test and QA accounts should not show up as top managers on the public
rankings. This page explains how to hide them, how to show them again, and
what the public sees when an account is hidden.

Migration: `20261011160000_public_ranking_exclusions.sql`. Tests:
`supabase/tests/database/public_ranking_exclusions.test.sql`.

On production this migration is installed by the single owner script of
[`SOFASCORE_AUTOMATIC_RELEASE_RUNBOOK.md`](../production/SOFASCORE_AUTOMATIC_RELEASE_RUNBOOK.md)
(its optional last section points here). The install hides nobody: the list
starts empty, and the steps below are what hide an account. Run them only after
that script has been committed.

## What "hidden" means

- The account stays. Its team, points, history and private screens are
  unchanged. Nothing is deleted.
- The account is skipped on the public boards (below). Everyone else's rank is
  renumbered, so the board reads 1, 2, 3, 4 with no hole where the hidden
  accounts were.
- Hiding is reversible. Show the account again and it is back at its real
  place at once. No recalculation is needed.
- Hiding is audited. Every hide and show writes a row to the admin audit log
  (`rankings.set_exclusion`) with the reason.
- Nothing in the migration names an account. The list of hidden accounts is
  data, set by the owner.

## Where it applies

| Surface                                      | Function                        | What changes                                                   |
| -------------------------------------------- | ------------------------------- | -------------------------------------------------------------- |
| Fantasy season board `/fantasy/rankings`     | `api.fantasy_overall_standings` | hidden teams skipped, ranks renumbered, total and cursor fixed |
| Fantasy public league boards                 | `api.fantasy_league_standings`  | same, for leagues whose visibility is `public`                 |
| Fantasy league list (leader name, your rank) | `api.fantasy_leagues`           | a public league's leader is the first visible team             |
| Pronostics leaderboard (journée and season)  | `api.predictions_leaderboard`   | hidden players skipped, ranks renumbered                       |

Private leagues are not changed: their members chose each other and can see
everyone in them. Pronostics mini-league tables are members-only for the same
reason.

## How ranks are shown

The database stores one unique rank per team in `app.fantasy_rankings`
(written by `api.service_recalculate_fantasy_rankings`). That table is not
touched by this change. When a board is read, the rank shown is:

> stored rank, minus the number of hidden teams stored above it, on the same
> board

So with hidden teams at stored ranks 1 and 3, the team stored at 2 shows 1,
the one stored at 4 shows 2, and so on. The sort order, paging and the cursor
still use the stored rank, so paging works and no row is repeated or skipped.
Previous rank is renumbered the same way. The Pronostics board does the same
with `app.prediction_standings`; ties are kept (a tie with a hidden player is
no longer shown as a tie).

## What a hidden manager sees

- Their team, points, history and Manager Card: unchanged.
- The season board: their row is not in the list. Their own `myRank` is still
  returned, with the rank their account would hold on the public board.
- A public league: they do not see their own row in the list.

Known and accepted: the figures frozen at the end of each gameweek in
`app.fantasy_team_gameweek_results` (`rank`, `overall_rank`, shown in a
manager's own history) still count the hidden accounts. They are private to
the manager and are not recomputed. A normal manager's own overall rank on the
summary card can therefore differ from the public board by the number of
hidden accounts ranked above them.

Not covered: the prize winners wall (`api.fantasy_prize_winners`). A test
account that wins a prize is a prize question, not a ranking one. Flag it
there with `api.admin_set_fantasy_prize_flag`.

## Hide or show an account

There is no admin screen yet. There are two ways.

### 1. The admin function (preferred)

Called by a signed-in platform administrator with a second factor and a recent
sign-in. New permission `rankings.manage`, held by `platform_admin`.

```sql
-- hide (by user id; or pass null for the id and the exact username second)
select api.admin_set_public_ranking_exclusion(
  '<user id>', null, true,
  'Test account hidden from public rankings (owner decision 2026-10-11).',
  gen_random_uuid());

-- show again
select api.admin_set_public_ranking_exclusion(
  '<user id>', null, false,
  'Hidden by mistake, shown again.',
  gen_random_uuid());

-- what is hidden now
select api.admin_list_public_ranking_exclusions();
```

The reason must be 8 to 500 characters. Repeating a call with the same
idempotency key returns the first answer and writes nothing twice.

### 2. A guarded SQL script (from the SQL editor)

The SQL editor has no signed-in staff session, so the function above refuses
there. Run this instead, in one transaction, after checking the target list.
It refuses if the owner is not an active staff principal or a target has no
profile, and it writes the same audit rows.

```sql
do $owner$
declare
  owner_auth_user constant uuid := '<owner auth user id>';
  targets constant uuid[] := array['<user id 1>', '<user id 2>']::uuid[];
  reason constant text := 'Test account hidden from public rankings (owner decision 2026-10-11).';
  actor uuid;
  target uuid;
begin
  select principal.id into actor from app_private.staff_principals principal
  where principal.auth_user_id = owner_auth_user and principal.status = 'active';
  if actor is null then raise exception 'owner is not an active staff principal'; end if;
  foreach target in array targets loop
    if not exists (select 1 from app.profiles where id = target) then
      raise exception 'no profile %', target;
    end if;
    insert into app_private.public_ranking_exclusions (user_id, reason, created_by_principal_id)
    values (target, reason, actor)
    on conflict (user_id) do nothing;
    if found then
      perform app_private.write_admin_audit(actor, 'rankings.set_exclusion', 'rankings', target,
        reason, gen_random_uuid(), gen_random_uuid(), null,
        jsonb_build_object('status', 'shown'), jsonb_build_object('status', 'hidden'));
    end if;
  end loop;
end
$owner$;
```

To show an account again by SQL, `delete from
app_private.public_ranking_exclusions where user_id = '<user id>';` and write
the audit row the same way. Production writes follow the rules in `CLAUDE.md`
(the owner runs it, one operation at a time, read back afterwards).

## Finding the test accounts

Read-only. It lists teams and accounts whose names look like test accounts,
with their current public rank, so the owner can confirm each one before
hiding it. Change the patterns freely.

```sql
select p.id as user_id, p.username, p.display_name, t.name as team_name,
       t.status as team_status, r.rank as overall_rank, r.total_points
from app.fantasy_teams t
join app.profiles p on p.id = t.user_id
left join app.fantasy_rankings r
  on r.fantasy_team_id = t.id and r.league_id is null and r.gameweek_id is null
where t.name ilike any (array['%e2e%', '%qa %', '%qa-%', '%verif%', '%test%', '%bg00%'])
   or p.username ilike any (array['%e2e%', '%qa_%', '%qa-%', '%verif%', '%test%'])
   or p.display_name ilike any (array['%e2e%', '%qa %', '%verif%', '%test%'])
order by r.rank nulls last, t.name;
```

To turn a confirmed list into the one-line calls, run this with the confirmed
user ids and paste the output into the admin session:

```sql
select format('select api.admin_set_public_ranking_exclusion(%L, null, true, %L, gen_random_uuid());',
  p.id, 'Test account hidden from public rankings (owner decision 2026-10-11).')
from app.profiles p
where p.id in ('<user id 1>', '<user id 2>');
```

## Operating notes

- The exclusion list is `app_private.public_ranking_exclusions`: row level
  security forced, no grants to any client role. Only the readers above and the
  admin function touch it.
- Account deletion removes the row with the profile.
- Because renumbering happens when a board is read, a change shows on the next
  read. Cached pages (CDN, browser) follow their own cache time.
- The Fantasy ranking recalculation, gameweek finalization and prize
  evaluation are not changed by this feature and do not read the list.
