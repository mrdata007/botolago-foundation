# Owner runbook: every player in the Compos tab

Status when written (2026-09-25): **not applied.**

## The problem

The Compos tab left out every player BotolaGO's player list does not know. On
the first match fetched (Amal Tiznit 1–3 Ittihad Tanger, 24 Sept) that was 16
of the 35 players SportsMonks listed: Amal Tiznit showed 5 starters and no
bench, Ittihad Tanger 7 starters.

Two reasons, both in the player list, not in the match data:

- Amal Tiznit's and Widad Témara's squads were typed in by hand on 18 Sept
  from public lists, because SportsMonks had no squads for the two promoted
  clubs. Those players carry no SportsMonks id (Tiznit: 2 of 21 linked,
  Témara: 0 of 23), so a SportsMonks lineup cannot be matched to them.
- New signings are missing for every club (Ittihad Tanger: all 33 listed
  players are linked, and 4 starters were still unknown).

## What this change does

It does **not** touch the player list, the squads or Fantasy. It lets a
lineup name a player the list does not know, by SportsMonks' spelling, the
way the Résumé tab already names their goals and cards.

- **Database** (`20260925170000_football_lineup_named_players`): lineup rows
  can carry a name instead of a player; the lineups read returns those players
  in a second list (`unlistedPlayers`), so the website now live keeps working
  unchanged; the backfill fetches again every match stored so far.
- **Edge Function `football-live-refresh`**: sends each lineup player's name.
- **Website**: Compos shows both lists as one team sheet. Players BotolaGO
  does not know have no player page, as before.

## Order

1. **Nothing else running**: no match on, no workflow running, no other
   database work.
2. **Database**: SQL Editor, paste the whole of
   [`scripts/backend/apply-20260925170000-football-lineup-named-players.sql`](../../scripts/backend/apply-20260925170000-football-lineup-named-players.sql),
   Run: **Rehearsal passed**. Change `rollback;` to `commit;`, Run:
   **Applied**.
3. **Edge Function**, from the merged `main`:
   `supabase functions deploy football-live-refresh --project-ref tkewgajrljbwgwedqsxn`
4. **Backfill**, as in
   [APPLY_2026_09_25_MATCH_DETAILS.md](APPLY_2026_09_25_MATCH_DETAILS.md)
   step 4, until `"due"` is 0.
5. **Website**: press **Publish** in Lovable. Before that, the site in
   production shows the known players only, as today.

## Check

```sql
select l.team_id, count(*) filter (where lp.slot = 'starting') as starters,
       count(*) filter (where lp.player_id is null) as named_only
from app.lineups l join app.lineup_players lp on lp.lineup_id = l.id
where l.fixture_id = 'b48265b5-5df0-4ae3-815d-a0a01cde80f2'
group by l.team_id;
```

Both clubs should have 11 starters.

## Later: the player list itself

The real cure for the player list (linking the hand-typed Tiznit and Témara
players to their SportsMonks ids and adding new signings) touches Fantasy,
whose managers already hold those players. It is a separate change, made
with the Fantasy work and not alongside it.

## Undo

The website and the Edge Function can go back to the previous version; the
database change stays (a lineup with no named-only rows reads exactly as
before). To drop the named-only rows:
`delete from app.lineup_players where player_id is null;`
