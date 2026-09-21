## BG-0057 — retire the duplicated fantasy players

**Status: waiting on you. Three questions, one word each.**

Production has **seven** duplicated `app.fantasy_players` rows in **three** clusters, not eight in
four. The fourth reported cluster (Errahouli) is real but is a _football-catalog_ duplicate with no
fantasy rows at all — see "The fourth cluster" at the bottom. Nothing below is urgent in the sense
of being broken; it is urgent in the sense that **zero squads own any of these rows today**, which
makes retiring one a single flag flip. After launch it stops being one.

### The seven candidate rows

Every row is `active = true, eligible = true, status = available, selected_by_count = 0`, and every
one has a distinct SportMonks id — so "one has a provider id and the other doesn't" is **not**
available as a tie-break anywhere.

#### Cluster A — Hassania Agadir

| `fantasy_player_id`                    | Display name        | Date of birth | Provider external id | Club            | Price | Pos |
| -------------------------------------- | ------------------- | ------------- | -------------------- | --------------- | ----- | --- |
| `7feca8ea-be74-4184-b90f-676679d3b87b` | Abdallah Boukhanfer | 2000-01-01    | sportsmonks:37629773 | Hassania Agadir | 7.20  | MID |
| `b1e72287-5808-4ab6-b584-960a4d6ab000` | Abdallah Boukhanfer | 1998-01-01    | sportsmonks:37596162 | Hassania Agadir | 7.20  | MID |

#### Cluster B — Wydad Casablanca

| `fantasy_player_id`                    | Display name        | Date of birth | Provider external id | Club             | Price | Pos |
| -------------------------------------- | ------------------- | ------------- | -------------------- | ---------------- | ----- | --- |
| `085c8d71-bd39-47cc-b2b7-84a33fb3fb95` | Abdoulaye Coulibaly | 2008-01-01    | sportsmonks:38213591 | Wydad Casablanca | 7.50  | FWD |
| `9dd668bc-5212-4d91-83b3-0335aece3534` | Abdoulaye Coulibaly | _(none)_      | sportsmonks:37789277 | Wydad Casablanca | 7.20  | MID |
| `ac64b701-1d84-4527-805f-28fe0926203a` | Abdoulaye Coulibaly | 1991-04-06    | sportsmonks:101165   | Wydad Casablanca | 7.20  | MID |

#### Cluster C — Moghreb Tétouan

| `fantasy_player_id`                    | Display name                                                       | Date of birth | Provider external id | Club            | Price | Pos |
| -------------------------------------- | ------------------------------------------------------------------ | ------------- | -------------------- | --------------- | ----- | --- |
| `069d4a1f-378f-440f-b84e-a76c810b20be` | Yassine El Ghazouani _(full name on file: "Yacine Ghazouani")_     | _(none)_      | sportsmonks:37594384 | Moghreb Tétouan | 5.00  | DEF |
| `f7b424d6-4032-47c8-b624-c47c0605ad80` | Yassine El Ghazouani _(full name on file: "Yassine El Ghazouani")_ | 1996-04-10    | sportsmonks:37596176 | Moghreb Tétouan | 5.00  | DEF |

### Your three questions

> **Q1 (Cluster A, Boukhanfer): which id do you keep — `7feca8ea…` or `b1e72287…`?**
>
> **No recommendation.** The data does not decide this one. Both rows have the same club, the same
> price (7.20), the same position (MID), and both dates of birth are January-1st placeholders
> (2000-01-01 vs 1998-01-01), which means neither is a real recorded birthday. Both have a provider
> id. Whichever you pick, the other is retired.

> **Q2 (Cluster B, Coulibaly): which id do you keep — `085c8d71…`, `9dd668bc…` or `ac64b701…`?**
>
> **The data points at `ac64b701…`, weakly.** Evidence: it is the only row of the seven with a
> _precise_ date of birth (1991-04-06, not a January 1st placeholder) and the only one whose
> SportMonks id is in the legacy low-number range (101165) rather than the 37–38 million band the
> 2026 bulk staging run produced. `9dd668bc…` has **no date of birth at all**, which is the
> weakest row. `085c8d71…` is dob 2008-01-01 and priced differently (7.50 FWD) — it may genuinely
> be a different, younger player rather than a duplicate. **Two rows would be retired here, so
> please name the one to keep explicitly.**

> **Q3 (Cluster C, El Ghazouani): which id do you keep — `069d4a1f…` or `f7b424d6…`?**
>
> **The data points at `f7b424d6…`.** Evidence: it carries a precise date of birth (1996-04-10)
> and its stored full name, "Yassine El Ghazouani", matches the display name; `069d4a1f…` has **no
> date of birth** and its full name is the variant spelling "Yacine Ghazouani". Prices and
> positions are identical (5.00, DEF), so nothing else separates them.

Reply with one id per cluster (or "keep `ac64b701`", etc.). Each id you _don't_ name gets one run
of the script.

### How to run it

**One player per run.** The script is parameterised on purpose so you can decide cluster by cluster
and read the result in between. Run it as the database owner (Supabase SQL editor signed in as the
project owner, or `psql` as `postgres`) — `app.fantasy_players` forces row-level security, so
`service_role` cannot do this.

1. Open `scripts/backend/fantasy-deactivate-duplicate-player.sql`.
2. Near the bottom, replace the all-zero uuid in this call with the ONE id you are retiring:

   ```sql
   select * from pg_temp.bg0057_deactivate_duplicate_player(
     '00000000-0000-0000-0000-000000000000'::uuid   -- <-- replace this
   );
   ```

3. Run the whole file. **It does not commit.**
4. Read the output (below). If it looks right, uncomment and run the last line, `commit;`.
   If anything looks wrong, just close the session — that rolls everything back.
5. Repeat from step 2 for the next id.

Running the file **unchanged** is safe: the all-zero uuid matches nothing, so it refuses with
`player_not_found` and writes nothing.

### Expected output

Two `NOTICE` lines, then the returned row:

```
NOTICE:  bg0057: about to deactivate Abdoulaye Coulibaly (9dd668bc-5212-4d91-83b3-0335aece3534) — club Wydad Casablanca, price 7.20, position MID, active=t, eligible=t
NOTICE:  bg0057: deactivated fantasy player 9dd668bc-5212-4d91-83b3-0335aece3534; audit event id <n>

          fantasy_player_id           |    display_name     |      club_name      | was_updated | audit_event_id
--------------------------------------+---------------------+---------------------+-------------+----------------
 9dd668bc-5212-4d91-83b3-0335aece3534 | Abdoulaye Coulibaly | Wydad Casablanca    | t           |            <n>
```

Then three review tables print automatically:

- **the whole cluster**, so you can see exactly one row now reads `active = f, eligible = f` and the
  siblings are untouched;
- **the pool totals** — `539 / 539 / 0` before your first run, then `538 / 538 / 1`, `537 / 537 / 2`,
  and so on;
- **the audit trail**, one `fantasy_catalog.deactivate_duplicate_player` row per committed run.

Re-running the same id after committing prints
`NOTICE: bg0057: already_applied — … nothing written` and returns `was_updated = f`. That is not an
error; it is safe to do.

### Verification query

Run this any time, in a read-only session, to see where you are:

```sql
select
  fantasy_player.id as fantasy_player_id,
  player.display_name,
  player.date_of_birth,
  (select string_agg(mapping.provider_name || ':' || mapping.external_id, ' | ')
     from app_private.football_provider_mappings mapping
    where mapping.entity_type = 'player'
      and mapping.internal_entity_id = player.id) as provider_external_id,
  team.name as club,
  fantasy_player.price,
  position.code as position,
  fantasy_player.active,
  fantasy_player.eligible
from app.fantasy_players fantasy_player
join app.players player on player.id = fantasy_player.football_player_id
join app.teams team on team.id = fantasy_player.football_team_id
join app.fantasy_positions position on position.id = fantasy_player.position_id
where (fantasy_player.football_team_id, lower(player.display_name)) in (
  select other_row.football_team_id, lower(other_player.display_name)
  from app.fantasy_players other_row
  join app.players other_player on other_player.id = other_row.football_player_id
  group by 1, 2 having count(*) > 1)
order by team.name, player.display_name, fantasy_player.active desc;
```

When all three decisions are done this returns 7 rows, of which **4 are still active** (one per
cluster, except Coulibaly which keeps one of three) and 3 read `f | f`.

### If a guard trips — what to do

Every guard rolls the whole transaction back, so a trip never leaves things half-done.

| Message                                                  | What it means                                                                                                                                    | What to do                                                                                                                                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `player_not_found`                                       | The id doesn't exist in `app.fantasy_players`.                                                                                                   | You are running the file unchanged, or you mistyped/truncated the id. Copy it from the table above. Nothing was written.                                                                                                         |
| `player_owned_by_squad`                                  | Somebody's squad holds this player right now. The message names the squad.                                                                       | **Stop.** This is no longer the cheap window. Either retire the _other_ row of the cluster instead, or bring the ownership to me — deactivating an owned player leaves that squad below the legal size. Do not loosen the guard. |
| `player_has_squad_history`                               | Somebody owned or traded this row at some point (sold membership, transfer, free-hit snapshot or auto-sub). The message reports all four counts. | **Stop.** A row with history is not a staging artefact. Re-check which row of the cluster is the real footballer — you are almost certainly about to retire the wrong one.                                                       |
| `player_has_point_events` / `player_has_gameweek_points` | This player has scored.                                                                                                                          | **Stop.** A scored player is never the duplicate. Retire the other row.                                                                                                                                                          |
| `player_still_selected`                                  | `selected_by_count` is non-zero but no squad membership exists — the counter and the membership table disagree.                                  | **Stop and tell me.** Neither number is trustworthy; this needs investigating before anything is retired.                                                                                                                        |
| `write_count_mismatch`                                   | The single UPDATE didn't affect exactly one row.                                                                                                 | Should be impossible. Tell me; nothing was written.                                                                                                                                                                              |

As of the 2026-09-21 production rehearsal, **every one of these guards reads zero for all seven
rows**, so none of them should fire today.

### The fourth cluster (Errahouli) — no action available here

The reported "Errahouli ×2" is real, but it is not a fantasy duplicate and this script cannot touch
it. It is **Salaheddine Errahouli at Olympic Safi**, two rows in `app.players`:

| `player_id`                            | Full name on file     | Date of birth | Provider external id | Performance rows |
| -------------------------------------- | --------------------- | ------------- | -------------------- | ---------------- |
| `01c3fd34-3499-4bed-8734-d4e28b3724a4` | Salaheddine Errahouli | 2002-01-01    | sportsmonks:37714023 | 24               |
| `123a6829-1c40-4c43-8edf-d64d71a7c827` | S. Errahouli          | 2002-10-12    | sportsmonks:37551821 | 1                |

**Neither has a `app.fantasy_players` row**, because Olympic Safi is one of the five relegated clubs
BG-0043 deactivates, so the fantasy pricing pass never priced either one. There is nothing to
deactivate. Cleaning up the duplicate `app.players` rows is a separate football-catalog job — say
the word and I'll scope it, but it does not block launch and no fantasy surface shows it.

(The unrelated "Imad El Rahouli" / full name "Imad Errahouli" at Moghreb Tétouan is a single,
non-duplicated row and needs nothing.)
