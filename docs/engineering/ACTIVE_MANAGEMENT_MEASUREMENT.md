# Active management: how to measure it

Audit finding PRO-05 (2026-10-14): _product decisions have acquisition telemetry
but little evidence for active-management retention._ Written 2026-10-15 for
Phase D, lane D2.

The owner's definition of success (`PRODUCT.md`, "Product Purpose"; confirmed
2026-10-05) is that supporters **come back every journée**, and that the main
conversion is **creating a Fantasy team and managing it actively**. This
document says what "managing actively" means in numbers, which of those numbers
the existing data can already give, which it cannot, and how the owner can read
the first ones.

**Nothing here has been run.** No query in this document was executed against
any database. There is no baseline, no target and no result in this file, and
none may be quoted from it. The season started on 2026-09-24, so the first
figures will be small; read them as counts, not as rates, until a few journées
have closed.

## Summary

- **Fantasy return-management is already recorded, with timestamps, in the
  database.** Every accepted lineup save (which includes a captain change),
  every confirmed transfer batch and every chip activation is a row with its
  team, its journée and its time. A lineup that was carried forward by the
  server leaves **no** such row. So "managed on purpose" against "carried
  forward untouched" can be told apart for every team and every journée, after
  the fact, from data that already exists.
- **No new browser event is added** (section 5). The database answers the
  question exactly; a name-only browser event cannot say who came back, so it
  would be a weaker copy of the same fact.
- **Two things cannot be answered from anything that exists today:** the
  **rejected-save rate** (a refused save leaves no row anywhere the owner can
  query) and the **recap return rate** as a share of people (the recap view is
  a name-only count, not a person). Both are stated as gaps, with the options,
  in section 3.

## 1. Definitions

All of these are per Fantasy season, for supporters only. "Non-test account"
means: not a staff account (`app_private.staff_principals`) and not on the
e-mail or push tester lists (`test_user_ids`). The schema has no "test account"
flag, so the queries also carry a line where the owner pastes any other test
accounts' ids (section 4).

**M1. Valid first team.** A row in `app.fantasy_teams` with status `active`,
in the season measured, for a non-test account. The server creates it only after
validating the squad and the budget (`api.create_fantasy_team`), so a draft never
counts. It is not a rate: it is the denominator of M2 to M5. Its own upstream is
the sign-up funnel (verified accounts).

**M2. Management rate, per journée.** Of the teams that could act in a closed
journée, the share that made at least one **intentional management action** in
it (below).

- Denominator: **eligible teams**, meaning M1 teams that had a lineup in that
  journée and did not join in it (see "Eligible", below).

**M3. Next-journée return.** Of the teams that joined in journée N, the share
with an intentional action in journée N+1.

- Denominator: teams that joined in N, **counting only those whose N+1 has
  closed** (otherwise the window is still open).

**M4. Habit: managed every journée.** For each team, the number of journées
managed against the number it was eligible for. "Active every journée" is the
teams where the two are equal.

- Denominator: teams with at least one eligible journée, shown as a table of
  (eligible, managed), never as one average.

**M5. Private-league participation.** (a) The share of M1 teams that belong to a
private league with at least one other supporter. (b) The management rate (M2)
of teams in such a league against teams not in one, journée by journée.

- Denominator: (a) M1 teams. (b) The eligible teams of M2, split by league
  membership **as it was at that journée's deadline**.

**M6. Recap return.** How often a manager opens the hub and is shown the
finalized recap of the last journée (`fantasy_recap_view`), set against the
number of managers who have a final result for that journée.

- Denominator: managers with a final result for that journée. It is a ratio of
  **views to managers**, not a share of managers.

**M7. Rejected-save rate.** Saves the server refused, over all save attempts that
reached the server (accepted plus refused).

- Denominator: all attempts that reached the server. **Not measurable today**
  (section 3).

**Intentional management action.** In a given journée, one of:

1. an accepted **lineup save** (`api.save_fantasy_lineup`: formation, starters,
   bench order, captain and vice-captain all travel in one save, so a captain
   change is a lineup save);
2. a confirmed **transfer batch** (`api.confirm_fantasy_transfers`);
3. a **chip activation** (`api.activate_fantasy_chip`).

Creating the team (`create_team`) is the first team, M1, and is **not** a
management action of the journée it is made in. A refused call, an unconfirmed
transfer preview, an opened screen and an unsent draft are not actions.

**Carried forward** (the opposite). The server opens each new journée by copying
the team's previous lineup into it (`api.service_prepare_next_fantasy_gameweek`,
or the owner's missed-gameweek script). The team still gets a result and, if
the card is on, a Manager Card week (`MANAGER_CARD_BACKEND_PLAN.md`, "Passive
week … Counts"), so **playing a journée is not the same as managing it**. A
journée with no intentional action is "carried forward only". The same goes
for the journée after a Free Hit: the server restores the earlier squad by
itself, and that restoration is not an action either (the Free Hit activation
itself, in its own journée, is).

**Eligible.** A (team, journée) pair where the journée's window has closed
(status `locked` or later, so its deadline has passed), the team has a lineup
in it, and it is **after** the journée the team joined in. The joining journée
is left out of M2 and M4 because the team's first lineup was made by creating
it, which is M1, not a return.

**Why "closed journées only".** A journée still open could still be managed
after the moment of reading. Counting it would understate the rate. Every query
below takes closed journées only.

## 2. Where each fact lives

All references are to SQL files in `supabase/migrations/`; they were read, not
executed.

Each entry names the table, the columns that carry the time and the
journée, and what to know before relying on it.

- **Valid first team.** `app.fantasy_teams` (`20260720141847`; unique per user
  and season). Time: `created_at`. Only `status = 'active'` counts. Account
  deletion removes the team (`20261006143700`), so deleted accounts leave the
  denominator.
- **Accepted lineup save (captain included).**
  `app_private.fantasy_mutation_audit` with `operation = 'save_lineup'` and
  `accepted`. Time: `occurred_at`; the journée is in
  `safe_metadata->>'gameweekId'`. Written in the same transaction as the save
  (`20260926003100`, the current body). An idempotent replay writes nothing
  twice.
- **Confirmed transfer batch.** `app.fantasy_transfer_batches` (and
  `app.fantasy_transfers` for the players). Time: `confirmed_at`; journée:
  `gameweek_id`. Also in the audit as `confirm_transfers`. `status` may later
  become `reversed_by_correction`; the intent still counts.
- **Chip activation.** `app.fantasy_chip_uses`. Time: `activated_at` and
  `cancelled_at`; journée: `gameweek_id`. Also in the audit as `activate_chip`
  and `cancel_chip`.
- **Team created.** Audit `operation = 'create_team'`. Time: `occurred_at`. The
  metadata names the season and the journée joined.
- **Journée window.** `app.fantasy_gameweeks`: `deadline_at`, `status`,
  `sequence_number`. A write is accepted only while the status is `open` and
  before `deadline_at` (`fantasy_assert_mutable_gameweek`).
- **Lineup of a journée, carried or saved.** `app.fantasy_lineups` (one row per
  team and journée) and `app.fantasy_lineup_players`. Time: `created_at`. There
  is **no "source" or "auto" column**, and a saved lineup is replaced in place,
  so earlier versions are not kept.
- **Auto-substitutions during scoring.** `app.fantasy_auto_substitutions`. Done
  by scoring, not by the manager; never a management action.
- **Private leagues and who is in them.** `app.fantasy_leagues`
  (`visibility = 'private'`) and `app.fantasy_league_memberships`: `joined_at`,
  `left_at`, `status`. The creator of a league is a member from the start, so a
  league of one is possible; M5 asks for at least two.
- **Final result of a journée.** `app.fantasy_team_gameweek_results`
  (`state = 'final'`), time `finalized_at`. One row per team, carried or managed
  alike.
- **Public recap links.** `app.fantasy_public_recaps`: `published_at`,
  `revoked_at`. Publishing is opt-in, per journée. The private recap view is not
  stored (section 3, Gap 2).
- **Staff accounts and tester lists.** `app_private.staff_principals`, and
  `test_user_ids` in `app_private.notification_email_settings` and
  `app_private.notification_push_settings`. These are the only test-account
  markers in the schema.

### How "managed" is told from "carried forward"

A carried lineup is created by the server's opening of the journée and writes
**no** audit row, no transfer batch and no chip row. A manager's save writes
the audit row in the same transaction. So the test is the **presence of a row**
in the three sources above for that team and journée, never a column on the
lineup. This was checked by reading both functions; it was not checked against
live data. Query 0 below is the check to run first: it counts the audit rows
by operation and compares them with the transfer and chip tables, which are
written by the same transactions, so a mismatch would show that the audit is
incomplete.

### Things the existing data cannot do

- **A captain change cannot be told from another lineup change.** The save
  replaces the whole lineup and keeps no earlier version. M2 treats both as one
  action, which is what the success definition needs.
- **A save that changed nothing is still a save.** The server does not compare
  the new lineup with the old one. The pick-team screen offers Save after a
  local edit (`dirty` in `src/routes/fantasy.team.tsx`), so most saves are real
  edits, but a manager who edits and undoes by hand and saves is counted.
- **Deleted accounts disappear.** Deleting an account erases the team and its
  audit rows (`20261006143700`). Past figures can therefore shrink slightly
  when a manager deletes their account, and cannot be reconstructed.
- **Audit retention.** The table comment says "retain 365 days". No job that prunes it was found in the migrations, but the first season is far inside that window anyway. Query 0
  prints the oldest row so this can be seen.
- **Time of day.** `occurred_at` is a UTC `timestamptz`. The queries below do not
  group by day; if you do, group in `Africa/Casablanca`, as the admin overview
  does.

## 3. What can and cannot be answered

| Question                                                                                      | Answerable now?         | From                                                 | Query |
| --------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------- | ----- |
| How many valid first teams, and how many are test accounts left out?                          | Yes                     | `fantasy_teams`, minus the exclusion list            | 1     |
| Per closed journée, how many teams managed on purpose and how many were carried forward only? | Yes                     | audit + transfer batches + chip uses against lineups | 2     |
| Split by kind of action (lineup, transfer, chip)                                              | Yes                     | same                                                 | 2     |
| Of teams that joined in journée N, how many managed in N+1?                                   | Yes                     | same, with the joining journée                       | 3     |
| How many teams manage every journée, and how many only now and then?                          | Yes                     | same, per team, shown as a table                     | 4     |
| Are managers in private leagues more active than those outside?                               | Yes, as an association  | league memberships as they stood at each deadline    | 5, 6  |
| How many accepted saves per managing team (a churn signal)?                                   | Yes                     | audit, transfer batches, chip uses                   | 7     |
| How many managers had a final result, and how many published a recap?                         | Yes                     | results, public recaps                               | 8     |
| What share of managers **open** the recap after a journée finalizes?                          | **No, only as a count** | `fantasy_recap_view` in Seline (name-only)           | none  |
| What share of **save attempts were refused** (M7)?                                            | **No**                  | nothing queryable                                    | none  |
| Which refused saves were the server's, and which never left the phone?                        | **No**                  | nothing queryable                                    | none  |
| Do managers who **opened** the pick-team screen but did not save differ?                      | **No**                  | nothing recorded                                     | none  |

### Gap 1: the rejected-save rate

`api.save_fantasy_lineup` and its siblings raise an error on every refusal
(version conflict, deadline passed, invalid squad, one-time code needed). The
error rolls the whole transaction back, **including** any audit row it would
have written, and the audit insert sits at the end of the function and only
ever records `accepted = true` (no migration inserts a refused row; Query 0
counts `accepted = false` rows and is expected to return zero). Before a call
reaches the server, the app also refuses some saves itself (an invalid squad, a
passed deadline: `fantasy.team.tsx`), and those are never sent.

So the rate has no numerator anywhere the owner can query. Options, none of
them taken here:

1. **Supabase logs.** The project's API or Postgres logs in the Supabase
   dashboard should show the refused calls with their error codes. What is
   kept, and for how long, was not checked (no access was used); this would be
   a manual count, not a query on the tables.
2. **A migration** that records refused attempts. It would have to write the
   row outside the transaction that is rolled back, which is a design
   decision and a database change, not an analytics change. This lane writes no
   migration.
3. **A name-only browser event for a refused save.** It would count only what
   reached a browser that had Seline loaded, would not say why it was refused,
   and sits outside the brief for this lane (server-confirmed success only).

The owner decides whether the rate is worth one of these. Until then the
nearest honest figure is Query 7 (accepted saves per managing team), which is a
**churn** signal and must not be reported as a rejection rate.

### Gap 2: recap return

The recap card fires `fantasy_recap_view` each time it is shown to a manager
(`GameweekRecapCard.tsx`, when the gameweek on it changes), and Seline stores
a name and a count, never a person. So the figure is "recap views", not "managers
who returned for the recap". Reloads, a second device and the same manager
opening the hub twice all add views. Query 8 gives the matching denominator
(managers with a final result, and public recap links), and the ratio
**views per manager with a final result** can be read by dividing Seline's
count for the same period by that number, **as a ratio that can exceed 1**.
Whether Seline's own "visitors" figure de-duplicates a person across days is
not known from the repository and is not assumed here.

## 4. Queries for the owner (NOT RUN)

> **None of these queries has been executed.** They are written to be
> read-only: `select` only, no function with side effects, no temporary object.
> They were checked for SQL syntax with an offline parser, not against a
> database. Run them in the Supabase SQL editor as the owner, one at a time.
> Under `AGENTS.md` a read needs no pause of the scheduled jobs.
>
> They return counts and rates grouped by journée or by a small bucket. No
> query selects an account id, e-mail, name or team name. Do not paste a row
> with a single-digit count into a public place: with few teams, a count of one
> is one person.

### The shared block

Queries 2 to 8 are built from the **same common table expressions**, repeated
in each query (keeping only the ones it needs) so each runs on its own:

- `s`: the season measured: the one in `registration_open` or `active`. If two
  are listed, add `and id = '<season id>'`.
- `excluded`: staff and tester accounts. **Add your own test accounts' ids**
  where marked; the schema has no flag for them.
- `teams`: M1.
- `gws`: journées whose window has closed.
- `joined`: the journée each team joined in (its earliest lineup).
- `eligible`: M2's eligible pairs.
- `actions`: one row per intentional action.
- `managed`: one row per eligible pair, with what was done.

### Query 0: is the audit complete? (run first)

Counts the audit rows by operation, any refused rows (expected none), and the
tables written by the same transactions. If the audit and the tables disagree
for transfers or chips, do not trust Query 2 until the reason is known.

```sql
-- NOT RUN. Read-only.
select 'audit rows' as check_name, operation as detail, count(*) as n,
       min(occurred_at) as first_at, max(occurred_at) as last_at
from app_private.fantasy_mutation_audit
group by operation
union all
select 'audit rows refused (accepted = false), expected none', '', count(*),
       min(occurred_at), max(occurred_at)
from app_private.fantasy_mutation_audit
where not accepted
union all
select 'transfer batches (compare with confirm_transfers)', '', count(*),
       min(confirmed_at), max(confirmed_at)
from app.fantasy_transfer_batches
union all
select 'chip uses (compare with activate_chip)', '', count(*),
       min(activated_at), max(activated_at)
from app.fantasy_chip_uses
union all
select 'teams, all statuses (compare with create_team)', '', count(*),
       min(created_at), max(created_at)
from app.fantasy_teams
order by 1, 2;
```

### Query 1: valid first teams (M1)

```sql
-- NOT RUN. Read-only.
with s as (
  select id from app.fantasy_seasons
  where status in ('registration_open', 'active')
),
excluded as (
  select auth_user_id as user_id from app_private.staff_principals
  union select unnest(test_user_ids) from app_private.notification_email_settings
  union select unnest(test_user_ids) from app_private.notification_push_settings
  -- Your own test accounts: replace '{}' with '{id1,id2}' (uuids, no quotes).
  union select unnest('{}'::uuid[])
)
select count(*) as all_active_teams,
       count(*) filter (where e.user_id is not null) as left_out_as_test_or_staff,
       count(*) filter (where e.user_id is null) as valid_first_teams
from app.fantasy_teams t
join s on s.id = t.fantasy_season_id
left join excluded e on e.user_id = t.user_id
where t.status = 'active';
```

### Query 2: management rate per closed journée (M2)

`managed_teams` is the number with at least one intentional action;
`carried_only_teams` had none. The last three columns say what kind of action
(a team can appear in more than one).

```sql
-- NOT RUN. Read-only.
with s as (
  select id from app.fantasy_seasons
  where status in ('registration_open', 'active')
),
excluded as (
  select auth_user_id as user_id from app_private.staff_principals
  union select unnest(test_user_ids) from app_private.notification_email_settings
  union select unnest(test_user_ids) from app_private.notification_push_settings
  union select unnest('{}'::uuid[])
),
teams as (
  select t.id as team_id
  from app.fantasy_teams t
  join s on s.id = t.fantasy_season_id
  where t.status = 'active'
    and not exists (select 1 from excluded e where e.user_id = t.user_id)
),
gws as (
  select g.id as gw_id, g.sequence_number as seq, g.deadline_at
  from app.fantasy_gameweeks g
  join s on s.id = g.fantasy_season_id
  where g.status in ('locked', 'live', 'provisional', 'finalizing', 'finalized', 'corrected')
),
joined as (
  select l.fantasy_team_id as team_id, min(g.sequence_number) as join_seq
  from app.fantasy_lineups l
  join app.fantasy_gameweeks g on g.id = l.gameweek_id
  join teams t on t.team_id = l.fantasy_team_id
  group by l.fantasy_team_id
),
eligible as (
  select j.team_id, g.gw_id, g.seq
  from joined j
  join gws g on g.seq > j.join_seq
  where exists (
    select 1 from app.fantasy_lineups l
    where l.fantasy_team_id = j.team_id and l.gameweek_id = g.gw_id
  )
),
actions as (
  select a.fantasy_team_id as team_id, (a.safe_metadata ->> 'gameweekId')::uuid as gw_id,
         'lineup' as kind
  from app_private.fantasy_mutation_audit a
  where a.operation = 'save_lineup' and a.accepted
  union all
  select b.fantasy_team_id, b.gameweek_id, 'transfer'
  from app.fantasy_transfer_batches b
  union all
  select c.fantasy_team_id, c.gameweek_id, 'chip'
  from app.fantasy_chip_uses c
),
managed as (
  select e.team_id, e.gw_id, e.seq,
         coalesce(bool_or(a.kind = 'lineup'), false) as did_lineup,
         coalesce(bool_or(a.kind = 'transfer'), false) as did_transfer,
         coalesce(bool_or(a.kind = 'chip'), false) as did_chip,
         count(a.kind) > 0 as any_action
  from eligible e
  left join actions a on a.team_id = e.team_id and a.gw_id = e.gw_id
  group by e.team_id, e.gw_id, e.seq
)
select seq as journee,
       count(*) as eligible_teams,
       count(*) filter (where any_action) as managed_teams,
       count(*) filter (where not any_action) as carried_only_teams,
       round(100.0 * count(*) filter (where any_action) / count(*), 1) as managed_pct,
       count(*) filter (where did_lineup) as with_lineup_save,
       count(*) filter (where did_transfer) as with_transfer,
       count(*) filter (where did_chip) as with_chip
from managed
group by seq
order by seq;
```

### Query 3: next-journée return (M3)

For each journée a team joined in: how many teams joined, how many of those
have the next journée closed, and how many of them managed it.

```sql
-- NOT RUN. Read-only. Same blocks as Query 2; `managed` keeps only any_action.
with s as (
  select id from app.fantasy_seasons
  where status in ('registration_open', 'active')
),
excluded as (
  select auth_user_id as user_id from app_private.staff_principals
  union select unnest(test_user_ids) from app_private.notification_email_settings
  union select unnest(test_user_ids) from app_private.notification_push_settings
  union select unnest('{}'::uuid[])
),
teams as (
  select t.id as team_id
  from app.fantasy_teams t
  join s on s.id = t.fantasy_season_id
  where t.status = 'active'
    and not exists (select 1 from excluded e where e.user_id = t.user_id)
),
gws as (
  select g.id as gw_id, g.sequence_number as seq, g.deadline_at
  from app.fantasy_gameweeks g
  join s on s.id = g.fantasy_season_id
  where g.status in ('locked', 'live', 'provisional', 'finalizing', 'finalized', 'corrected')
),
joined as (
  select l.fantasy_team_id as team_id, min(g.sequence_number) as join_seq
  from app.fantasy_lineups l
  join app.fantasy_gameweeks g on g.id = l.gameweek_id
  join teams t on t.team_id = l.fantasy_team_id
  group by l.fantasy_team_id
),
eligible as (
  select j.team_id, g.gw_id, g.seq
  from joined j
  join gws g on g.seq > j.join_seq
  where exists (
    select 1 from app.fantasy_lineups l
    where l.fantasy_team_id = j.team_id and l.gameweek_id = g.gw_id
  )
),
actions as (
  select a.fantasy_team_id as team_id, (a.safe_metadata ->> 'gameweekId')::uuid as gw_id,
         'lineup' as kind
  from app_private.fantasy_mutation_audit a
  where a.operation = 'save_lineup' and a.accepted
  union all
  select b.fantasy_team_id, b.gameweek_id, 'transfer'
  from app.fantasy_transfer_batches b
  union all
  select c.fantasy_team_id, c.gameweek_id, 'chip'
  from app.fantasy_chip_uses c
),
managed as (
  select e.team_id, e.gw_id, e.seq,
         count(a.kind) > 0 as any_action
  from eligible e
  left join actions a on a.team_id = e.team_id and a.gw_id = e.gw_id
  group by e.team_id, e.gw_id, e.seq
)
select j.join_seq as joined_in_journee,
       count(*) as new_teams,
       count(nx.gw_id) as next_journee_closed,
       count(*) filter (where m.any_action) as managed_next_journee,
       round(100.0 * count(*) filter (where m.any_action)
             / nullif(count(nx.gw_id), 0), 1) as managed_next_pct
from joined j
left join gws nx on nx.seq = j.join_seq + 1
left join managed m on m.team_id = j.team_id and m.gw_id = nx.gw_id
group by j.join_seq
order by j.join_seq;
```

### Query 4: habit (M4)

One row per (journées eligible, journées managed) with the number of teams.
Teams where the two numbers are equal managed every journée since they joined.
No team is named.

```sql
-- NOT RUN. Read-only. Same blocks as Query 3, plus `per_team`.
with s as (
  select id from app.fantasy_seasons
  where status in ('registration_open', 'active')
),
excluded as (
  select auth_user_id as user_id from app_private.staff_principals
  union select unnest(test_user_ids) from app_private.notification_email_settings
  union select unnest(test_user_ids) from app_private.notification_push_settings
  union select unnest('{}'::uuid[])
),
teams as (
  select t.id as team_id
  from app.fantasy_teams t
  join s on s.id = t.fantasy_season_id
  where t.status = 'active'
    and not exists (select 1 from excluded e where e.user_id = t.user_id)
),
gws as (
  select g.id as gw_id, g.sequence_number as seq, g.deadline_at
  from app.fantasy_gameweeks g
  join s on s.id = g.fantasy_season_id
  where g.status in ('locked', 'live', 'provisional', 'finalizing', 'finalized', 'corrected')
),
joined as (
  select l.fantasy_team_id as team_id, min(g.sequence_number) as join_seq
  from app.fantasy_lineups l
  join app.fantasy_gameweeks g on g.id = l.gameweek_id
  join teams t on t.team_id = l.fantasy_team_id
  group by l.fantasy_team_id
),
eligible as (
  select j.team_id, g.gw_id, g.seq
  from joined j
  join gws g on g.seq > j.join_seq
  where exists (
    select 1 from app.fantasy_lineups l
    where l.fantasy_team_id = j.team_id and l.gameweek_id = g.gw_id
  )
),
actions as (
  select a.fantasy_team_id as team_id, (a.safe_metadata ->> 'gameweekId')::uuid as gw_id,
         'lineup' as kind
  from app_private.fantasy_mutation_audit a
  where a.operation = 'save_lineup' and a.accepted
  union all
  select b.fantasy_team_id, b.gameweek_id, 'transfer'
  from app.fantasy_transfer_batches b
  union all
  select c.fantasy_team_id, c.gameweek_id, 'chip'
  from app.fantasy_chip_uses c
),
managed as (
  select e.team_id, e.gw_id, e.seq,
         count(a.kind) > 0 as any_action
  from eligible e
  left join actions a on a.team_id = e.team_id and a.gw_id = e.gw_id
  group by e.team_id, e.gw_id, e.seq
),
per_team as (
  select team_id,
         count(*) as journees_eligible,
         count(*) filter (where any_action) as journees_managed
  from managed
  group by team_id
)
select journees_eligible, journees_managed, count(*) as teams
from per_team
group by journees_eligible, journees_managed
order by journees_eligible, journees_managed;
```

### Query 5: share of teams in a private league (M5a)

Right now, not as of a journée. "In a private league with someone else" means
an active membership in a private league that has at least one other active
member who is not a test account.

```sql
-- NOT RUN. Read-only.
with s as (
  select id from app.fantasy_seasons
  where status in ('registration_open', 'active')
),
excluded as (
  select auth_user_id as user_id from app_private.staff_principals
  union select unnest(test_user_ids) from app_private.notification_email_settings
  union select unnest(test_user_ids) from app_private.notification_push_settings
  union select unnest('{}'::uuid[])
),
teams as (
  select t.id as team_id
  from app.fantasy_teams t
  join s on s.id = t.fantasy_season_id
  where t.status = 'active'
    and not exists (select 1 from excluded e where e.user_id = t.user_id)
),
private_members as (
  select m.league_id, m.fantasy_team_id as team_id
  from app.fantasy_league_memberships m
  join app.fantasy_leagues l on l.id = m.league_id
  join s on s.id = l.fantasy_season_id
  where l.visibility = 'private' and l.active and m.status = 'active'
    and m.fantasy_team_id in (select team_id from teams)
)
select (select count(*) from teams) as valid_first_teams,
       count(distinct pm.team_id) filter (
         where exists (
           select 1 from private_members o
           where o.league_id = pm.league_id and o.team_id <> pm.team_id
         )
       ) as in_private_league_with_others,
       count(distinct pm.league_id) filter (
         where (select count(*) from private_members o where o.league_id = pm.league_id) >= 2
       ) as private_leagues_with_two_or_more
from private_members pm;
```

### Query 6: management rate, in a private league or not (M5b)

League membership is read **as it stood at each journée's deadline**
(`joined_at` and `left_at`), so a manager who joins a league after a journée is
not credited to it. This shows an association only: managers who already care
may be the ones who join leagues.

```sql
-- NOT RUN. Read-only. Same blocks as Query 3, plus the two league blocks.
with s as (
  select id from app.fantasy_seasons
  where status in ('registration_open', 'active')
),
excluded as (
  select auth_user_id as user_id from app_private.staff_principals
  union select unnest(test_user_ids) from app_private.notification_email_settings
  union select unnest(test_user_ids) from app_private.notification_push_settings
  union select unnest('{}'::uuid[])
),
teams as (
  select t.id as team_id
  from app.fantasy_teams t
  join s on s.id = t.fantasy_season_id
  where t.status = 'active'
    and not exists (select 1 from excluded e where e.user_id = t.user_id)
),
gws as (
  select g.id as gw_id, g.sequence_number as seq, g.deadline_at
  from app.fantasy_gameweeks g
  join s on s.id = g.fantasy_season_id
  where g.status in ('locked', 'live', 'provisional', 'finalizing', 'finalized', 'corrected')
),
joined as (
  select l.fantasy_team_id as team_id, min(g.sequence_number) as join_seq
  from app.fantasy_lineups l
  join app.fantasy_gameweeks g on g.id = l.gameweek_id
  join teams t on t.team_id = l.fantasy_team_id
  group by l.fantasy_team_id
),
eligible as (
  select j.team_id, g.gw_id, g.seq
  from joined j
  join gws g on g.seq > j.join_seq
  where exists (
    select 1 from app.fantasy_lineups l
    where l.fantasy_team_id = j.team_id and l.gameweek_id = g.gw_id
  )
),
actions as (
  select a.fantasy_team_id as team_id, (a.safe_metadata ->> 'gameweekId')::uuid as gw_id,
         'lineup' as kind
  from app_private.fantasy_mutation_audit a
  where a.operation = 'save_lineup' and a.accepted
  union all
  select b.fantasy_team_id, b.gameweek_id, 'transfer'
  from app.fantasy_transfer_batches b
  union all
  select c.fantasy_team_id, c.gameweek_id, 'chip'
  from app.fantasy_chip_uses c
),
managed as (
  select e.team_id, e.gw_id, e.seq,
         count(a.kind) > 0 as any_action
  from eligible e
  left join actions a on a.team_id = e.team_id and a.gw_id = e.gw_id
  group by e.team_id, e.gw_id, e.seq
),
private_members as (
  select m.league_id, m.fantasy_team_id as team_id, m.joined_at, m.left_at
  from app.fantasy_league_memberships m
  join app.fantasy_leagues l on l.id = m.league_id
  join s on s.id = l.fantasy_season_id
  where l.visibility = 'private'
    and m.fantasy_team_id in (select team_id from teams)
),
in_league as (
  select distinct m.team_id, g.gw_id
  from gws g
  join private_members m
    on m.joined_at <= g.deadline_at and (m.left_at is null or m.left_at > g.deadline_at)
  where exists (
    select 1 from private_members o
    where o.league_id = m.league_id and o.team_id <> m.team_id
      and o.joined_at <= g.deadline_at and (o.left_at is null or o.left_at > g.deadline_at)
  )
)
select md.seq as journee,
       count(*) filter (where il.team_id is not null) as eligible_in_league,
       count(*) filter (where il.team_id is not null and md.any_action) as managed_in_league,
       round(100.0 * count(*) filter (where il.team_id is not null and md.any_action)
             / nullif(count(*) filter (where il.team_id is not null), 0), 1) as managed_pct_in_league,
       count(*) filter (where il.team_id is null) as eligible_not_in_league,
       count(*) filter (where il.team_id is null and md.any_action) as managed_not_in_league,
       round(100.0 * count(*) filter (where il.team_id is null and md.any_action)
             / nullif(count(*) filter (where il.team_id is null), 0), 1) as managed_pct_not_in_league
from managed md
left join in_league il on il.team_id = md.team_id and il.gw_id = md.gw_id
group by md.seq
order by md.seq;
```

### Query 7: accepted saves per managing team (a churn signal, not M7)

How many accepted calls each kind of action made, and by how many teams, per
journée. Includes the joining journée. **This is not the rejected-save rate**:
refused calls are not in it (Gap 1).

```sql
-- NOT RUN. Read-only.
with s as (
  select id from app.fantasy_seasons
  where status in ('registration_open', 'active')
),
excluded as (
  select auth_user_id as user_id from app_private.staff_principals
  union select unnest(test_user_ids) from app_private.notification_email_settings
  union select unnest(test_user_ids) from app_private.notification_push_settings
  union select unnest('{}'::uuid[])
),
teams as (
  select t.id as team_id
  from app.fantasy_teams t
  join s on s.id = t.fantasy_season_id
  where t.status = 'active'
    and not exists (select 1 from excluded e where e.user_id = t.user_id)
),
actions as (
  select a.fantasy_team_id as team_id, (a.safe_metadata ->> 'gameweekId')::uuid as gw_id,
         'lineup' as kind
  from app_private.fantasy_mutation_audit a
  where a.operation = 'save_lineup' and a.accepted
  union all
  select b.fantasy_team_id, b.gameweek_id, 'transfer'
  from app.fantasy_transfer_batches b
  union all
  select c.fantasy_team_id, c.gameweek_id, 'chip'
  from app.fantasy_chip_uses c
)
select g.sequence_number as journee, a.kind,
       count(*) as accepted_calls,
       count(distinct a.team_id) as teams,
       round(count(*)::numeric / count(distinct a.team_id), 2) as calls_per_team
from actions a
join teams t on t.team_id = a.team_id
join app.fantasy_gameweeks g on g.id = a.gw_id
join s on s.id = g.fantasy_season_id
group by g.sequence_number, a.kind
order by g.sequence_number, a.kind;
```

### Query 8: managers with a final result, and public recap links (denominator of M6)

Divide Seline's count of `fantasy_recap_view` for the same period by
`managers_with_final_result`. The result is views per manager, not a share of
managers (section 3, Gap 2).

```sql
-- NOT RUN. Read-only.
with s as (
  select id from app.fantasy_seasons
  where status in ('registration_open', 'active')
),
excluded as (
  select auth_user_id as user_id from app_private.staff_principals
  union select unnest(test_user_ids) from app_private.notification_email_settings
  union select unnest(test_user_ids) from app_private.notification_push_settings
  union select unnest('{}'::uuid[])
),
teams as (
  select t.id as team_id
  from app.fantasy_teams t
  join s on s.id = t.fantasy_season_id
  where t.status = 'active'
    and not exists (select 1 from excluded e where e.user_id = t.user_id)
)
select g.sequence_number as journee,
       count(distinct r.fantasy_team_id) as managers_with_final_result,
       count(distinct p.fantasy_team_id) as managers_who_ever_published_a_link,
       count(distinct p.fantasy_team_id) filter (where p.status = 'published')
         as managers_with_a_live_link
from app.fantasy_gameweeks g
join s on s.id = g.fantasy_season_id
join app.fantasy_team_gameweek_results r
  on r.gameweek_id = g.id and r.state = 'final'
join teams t on t.team_id = r.fantasy_team_id
left join app.fantasy_public_recaps p
  on p.fantasy_team_id = r.fantasy_team_id and p.gameweek_id = r.gameweek_id
group by g.sequence_number
order by g.sequence_number;
```

## 5. Do the browser events need to change?

**Decision: no new event is added.**

Existing name-only events already cover the entry side of the funnel: landing,
sign-up, profile, first team (`fantasy_team_created`, fired on the server's
confirmation in `fantasy.create.tsx` and in `FantasyImportPrompt.tsx`),
Pronostics return, recap view and share, and the Curva events. `analytics.ts`
sends nothing but an event name: no account, team, league, token, e-mail or
query string.

For return-management, a new event would have to be fired after the server
accepted a lineup, captain or transfer save. Three reasons not to:

1. **The database already answers the question, exactly.** Section 3 shows M1
   to M5 and the churn signal are readable for every team and journée, from
   rows written inside the accepted transaction. A browser event is sent only
   by a browser that loaded the Seline script (an ad blocker or an offline
   phone sends nothing), so it can only under-count the same fact.
2. **A name-only event cannot say who came back.** Seline receives a name and a
   count, with no cookie and no identifier by design (`analytics.ts`, header).
   "How many saved a lineup this week" is a count; "how many of last week's
   managers saved again" needs the identity that the privacy rules forbid
   sending. A new event would answer a weaker question than the table does, and
   add one more thing that must stay name-only.
3. **The events that would add something are not success events.** What the
   database cannot see is a refused save and a screen that was opened and left.
   The brief for this lane allows server-confirmed success only, so neither is
   added; both are listed as open questions for the owner (section 3, Gap 1).

Consequences: `src/lib/analytics.ts`, its tests and every Fantasy screen are
unchanged by this work. No string, payload or save path changed, so no
translation file changed either.

If the owner later wants a browser event anyway (for example to read
Seline's dashboard without database access), the rules it must follow are the
existing ones: name only, production host only, fired after the server's
confirmation (the `res.ok` branch of the save), never on a click, in mock or
local mode, or on a refused save, and with a test that proves each of those.

## 6. Reading the results

- Use **M2 and M3 first.** They say whether supporters come back to manage.
  M4 shows whether it is a habit. M5 asks whether leagues help, but only as an
  association.
- A team that is **carried forward only** is still a valid team that scored. It
  is the group the product wants to turn into managers, not a failure of the
  data.
- A low number of **eligible teams** in the first journées makes every rate
  jumpy. Report the counts beside any percentage, and do not compare two
  journées whose eligible counts differ a lot.
- Do not read M2 as a measure of the quality of the game; a journée with few
  changes can be a quiet round for a happy manager.
- No target is proposed here. The owner sets one after seeing the first counts.
- Interview or usability notes in French and Arabic are not needed for these
  definitions, so none was written. Why a team is carried forward (the reason,
  not the count) is something only supporters can say; it is a question for
  whichever user test the owner runs next, and nothing here answers it.

## 7. What the owner needs to do

1. Run Query 0 and read it. If transfer batches and `confirm_transfers` audit
   rows, or chip uses and `activate_chip` rows, disagree, stop and report.
2. Paste any extra test-account ids where the queries say so, then run
   Queries 1 to 8.
3. Decide whether the refused-save rate (Gap 1) is wanted, and which of the
   three options, if any.
4. For recap return, read the count of `fantasy_recap_view` in Seline for the
   same period as Query 8 and divide, remembering the result is views per
   manager.
5. Keep the first results as the baseline of record in a new document, dated;
   nothing in this file is a baseline.
