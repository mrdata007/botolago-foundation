# Production: this season's player list corrected from SportsMonks (2026-09-25)

Migration `20260925200000_current_player_list_update` was applied to
Production V2 (`tkewgajrljbwgwedqsxn`) on 2026-09-25 by Claude Code. It
merged in #213 (`a7e79a7`). Its first observation was then planned, reviewed
and applied, and the first match of the season imported. The owner decided it
that day. Asked whether to correct this season's player list from SportsMonks,
they answered "Yes update it".

The migration is now applied and must not be edited. A change is a new
migration. How the update works:
[CURRENT_PLAYER_LIST_UPDATE.md](../backend/CURRENT_PLAYER_LIST_UPDATE.md).
Why it was needed:
[APPLIED_2026_09_25_CURRENT_PERFORMANCE_ABSENT_AS_ZERO.md](APPLIED_2026_09_25_CURRENT_PERFORMANCE_ABSENT_AS_ZERO.md).

## How

Every SQL step ran whole through the Supabase MCP connection. Before each
write: no workflow running or queued, no pg_cron job in flight, no other
database session.

| When (UTC)  | What                                                                                                                                                                                                                                             | Result                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 14:28:01    | Checked first: `20260925200000` not applied; `api.confirm_fantasy_transfers` md5 `18fe8513…` and `api.create_fantasy_team` md5 `dbc6b8f0…`, the versions the migration changes; no player mapping without a player, no player without a position | —                                                                                         |
| 14:28–14:35 | Rehearsal of [`apply-20260925200000-current-player-list-update.sql`](../../scripts/backend/apply-20260925200000-current-player-list-update.sql) from `main`, then a re-read, then the apply (`commit;`)                                          | "Rehearsal passed", nothing saved; then "Applied", the postflight passed                  |
| 14:35:10    | Re-read                                                                                                                                                                                                                                          | see below                                                                                 |
| 14:35:20    | "Observe current Football player list" run #1 ([`36148485337`](https://github.com/mrdata007/botolago-foundation/actions/runs/36148485337)) on `a7e79a7`, `fixture_ids` `19874708`                                                                | success; observation `5eb7c1f2-3a6c-45b0-a9e4-a6fc946d4a93`, plan digest `4a11e498…`      |
| 14:36–14:39 | Plan reviewed from the database and from the run's evidence (the same digest and summary)                                                                                                                                                        | see "What the plan did"                                                                   |
| 14:39:07    | Fantasy tick paused (`fantasy_automation_configure(false)`)                                                                                                                                                                                      | —                                                                                         |
| 14:39       | Rehearsal of [`apply-current-player-list.sql`](../../scripts/backend/apply-current-player-list.sql) with that observation and digest                                                                                                             | 99 changes, the postflight passed, rolled back                                            |
| 14:39       | Re-read                                                                                                                                                                                                                                          | nothing saved: no update recorded, no new mapping, 539 players listed and 539 in the game |
| 14:40:28    | Apply (`commit;`)                                                                                                                                                                                                                                | "Applied", 99 changes                                                                     |
| 14:40:33    | Fantasy tick back on                                                                                                                                                                                                                             | —                                                                                         |
| 14:41:09    | "Ingest current finished Football performances" run #3 ([`36149133795`](https://github.com/mrdata007/botolago-foundation/actions/runs/36149133795)) on `a7e79a7`                                                                                 | success; fixture 19874708 imported                                                        |

**After the migration**, re-read:

- History row `20260925200000 current_player_list_update`. Its recorded
  text's sha256 is the repository file's (`b091da7e…`).
- `api.confirm_fantasy_transfers` md5 `700d9ce245a550e9e7e106fc5aa619f4` and
  `api.create_fantasy_team` md5 `76088c7772abaf365f113c187fc4aed1`, the same
  as the local rehearsal. Managers may still call both.
- The three new calls exist, and only the service role may call them. The two
  new tables exist, and only the database reads them.
- pg_cron ran again at 14:35:00.

## What SportsMonks showed

Every club's squad for 2026/27 and the lineup of Amal Tiznit 1–3 Ittihad
Tanger (fixture 19874708): 16 clubs, 302 squad rows, and 28 named lineup
players. SportsMonks gives 7 more lineup rows no player id; they are left out,
as before.

The squads are thin this early. Widad Témara has 1 player, Difaâ El Jadida 7,
Amal Tiznit and Moghreb Tétouan 8, CR Khemis Zemamra 10. So 265 players listed
at a club and linked to SportsMonks are shown nowhere today. They stay where
they are.

## What the plan did

| Change                                                                                 | Players |
| -------------------------------------------------------------------------------------- | ------- |
| Moved to the club SportsMonks shows them at (25 from squads, 7 from the 24 Sep lineup) | 32      |
| Linked, but with no club this season: joined one                                       | 18      |
| Typed in by hand, now linked by the same full name (Ayoub Adila, Amal Tiznit)          | 1       |
| Unknown to BotolaGO: created, as the squad import creates them                         | 48      |
| Left alone: in two squads and no lineup (Mouad Enzo: CODM Meknès and WCA)              | 1       |

Fantasy:

- The 32 who moved score for their new club from now on. Squads keep them,
  and their prices did not change. One of them is in a squad: M. Amri, FUS
  Rabat → Moghreb Tétouan.
- 66 players joined the game: the 48 new ones and the 18 who had no club.
  They are priced as the opening catalog was, from 4.8 to 10.0. Each has a
  `player_list_addition_v1` price history row.
- No squad is over the club limit, and no duplicate was retired.
- The 32 club records the moves replaced were removed. They are kept whole in
  `app_private.current_player_list_updates.result`.

After: 605 players listed this season and in the game, all available (539
before). 977 players, 936 of them linked to SportsMonks (929 and 887 before).
The 6 Fantasy teams still hold their 90 players. Planning the same observation
again changes nothing.

## Two doubles at Amal Tiznit

Two hand-typed Amal Tiznit players are the same people as SportsMonks players
now at the club. SportsMonks' display name is exactly the hand-typed name, but
the full names differ, and only full names match
([why](../backend/CURRENT_PLAYER_LIST_UPDATE.md#the-rules)):

| Typed in by hand                 | SportsMonks (display name)                       | What the update did                    |
| -------------------------------- | ------------------------------------------------ | -------------------------------------- |
| Koffi Holete (defender, 5.0)     | Koffi Benjamin Holete, 37597609 ("Koffi Holete") | created as a new player at Amal Tiznit |
| Mouad Goulouss (midfielder, 7.2) | Mouad Goullous, 37649020 ("Mouad Goulouss")      | moved from CODM Meknès to Amal Tiznit  |

Both are in the game twice now. The hand-typed rows have never been picked,
held or scored, so they can be retired. That is the owner's call.
[`fantasy-deactivate-duplicate-player.sql`](../../scripts/backend/fantasy-deactivate-duplicate-player.sql)
takes one out of the game per run; their Amal Tiznit club records would go
separately.

41 hand-typed players are still matched to nobody: 18 at Amal Tiznit (these
two among them) and all 23 at Widad Témara. SportsMonks does not show them
yet.

## The first match imports

Run #3 wrote 28 player rows for fixture 19874708 at 14:41:25: 8 for Amal
Tiznit, 20 for Ittihad Tanger, 23 of whom played. Ittihad Tanger's 3 goals
and 3 assists are credited. Goals conceded follow the final score: 3 for Amal
Tiznit's goalkeeper, 1 for Ittihad Tanger's. Amal Tiznit's goal went to one of
the 7 players SportsMonks leaves without an id, so no player is credited with
it.

The import writes match statistics, so AGENTS.md ("Before writing") asks for
the Fantasy tick and the live-score job to be paused while it runs. Run #3
ran after the tick was back on (14:40:33), with the live-score job on. The
email jobs were off. So it ran as the hourly season orchestrator runs the same
import. No scheduled job ran while it did: the last runs before it, the
live-score refresh and the news publisher, ended at 14:41:00.03. The workflow
started at 14:41:09 and finished at 14:41:29, and the Fantasy tick's next run
was at 14:45. The steps below keep the pauses through the import.

The Fantasy tick never scores. Gameweek 1 is scored when it closes, after 27
September's matches.

## After each match

Early squads are thin, so a lineup can name players the list does not have,
and their statistics cannot import until the list has them. Gameweek 1 has
six more matches on 26 and 27 September. After the day's last match, not
while one is being played:

1. Check that nothing else is writing (AGENTS.md, "Before writing").
2. Pause the Fantasy tick
   (`select app_private.fantasy_automation_configure(false);`). Note the
   email settings, then pause the email and live-score jobs:

   ```sql
   select mode, football_live_refresh_enabled from app_private.notification_email_settings;
   select app_private.notification_email_configure('off', null, null, false);
   ```

3. Run "Observe current Football player list" with the day's fixture ids,
   review the plan, and apply it with
   [`apply-current-player-list.sql`](../../scripts/backend/apply-current-player-list.sql).
4. Run "Ingest current finished Football performances".
5. Restore the email settings noted in step 2. Today that is
   `select app_private.notification_email_configure('off', null, null, true);`.
   Then switch the tick back on
   (`select app_private.fantasy_automation_configure(true);`).

## Found while running: the plan script's result row

The Supabase SQL editor, and this MCP connection, send a whole file as one
query. PostgreSQL then folds any statement before a `begin;` into that
transaction. So the plan and digest filled in at the top of
`apply-current-player-list.sql` were cleared by a rehearsal's rollback. The
rehearsal itself ran in full, but its closing result row came back empty. A
commit kept them, so the apply reported "Applied".

The script now commits them in a transaction of their own first. Both ways of
running it were checked on a local database, as one query and statement by
statement: before the fix, a rehearsal run as one query ended without a result
row; after it, the row reads "Not applied" with the plan, and "Applied" after
a commit.
