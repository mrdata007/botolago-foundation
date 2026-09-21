<!--
Self-contained section for docs/production/HUMAN_ACTIONS_2026_09_21.md.
Paste the whole block below (from the `## BG-0043` heading to the end of the file).
-->

## BG-0043 — Deactivate the five clubs that are not in the 2026/27 season

**Why.** `app.teams` holds 21 rows with `active = true`, but Botola Pro 2026/27 has 16
participants. Five clubs left over from the 2024/25 backfill are still marked active, so
`api.football_team_catalog` — which does correctly filter on `active` — offers 21 clubs to the
news filters, the club pages and the FDR grid. The five are:

| Club              | id                                     |
| ----------------- | -------------------------------------- |
| Chabab Mohammédia | `7ff33380-1236-45e5-9c3e-97e753961cc9` |
| JS Soualem        | `318655a9-db9f-4706-abb2-df0fa4b13baf` |
| Olympic Safi      | `32fb7b61-9af4-4667-8978-b739b5e3f170` |
| Olympique Dcheïra | `f2715f02-38ed-4feb-a4e5-72444ad39529` |
| Yacoub El Mansour | `e595b91e-4d8f-4f3d-92d7-c23d7e332544` |

None of them has a 2026/27 squad row, a 2026/27 fixture, or a single fantasy player. Their
history (memberships, fixtures, standings, provider mappings, crests) is untouched by this
operation — only the `active` flag changes.

### How to run it

1. Open the Supabase SQL editor for project `tkewgajrljbwgwedqsxn` **as the database owner**, or
   connect with `psql` as `postgres`. This needs a BYPASSRLS session: every `app.*` table carries
   `FORCE ROW LEVEL SECURITY`, so `service_role` has no path to a raw `UPDATE` on `app.teams`.
2. Paste the whole of `scripts/backend/football-deactivate-non-current-teams.sql` and run it.
   The file opens its own transaction and **does not commit** — the final `commit;` is
   deliberately commented out.
3. Read the `NOTICE` output and the two review queries at the bottom (see below).
4. If — and only if — the output matches what is expected, run `commit;`.
   If anything at all looks wrong, run `rollback;`. Closing the session without committing also
   rolls back, which is the safe outcome.

### What the output should look like

Three notices, in this order:

```
NOTICE:  bg0043: current season(s): {<the 2026/27 season id>}
NOTICE:  bg0043: about to deactivate 5 club(s):
  - Chabab Mohammédia (7ff33380-1236-45e5-9c3e-97e753961cc9)
  - JS Soualem (318655a9-db9f-4706-abb2-df0fa4b13baf)
  - Olympic Safi (32fb7b61-9af4-4667-8978-b739b5e3f170)
  - Olympique Dcheïra (f2715f02-38ed-4feb-a4e5-72444ad39529)
  - Yacoub El Mansour (e595b91e-4d8f-4f3d-92d7-c23d7e332544)
NOTICE:  bg0043: deactivated 5 club(s); 16 clubs remain active
```

Then a five-row result listing exactly those five clubs, a 21-row listing of every club with its
`active` flag, and finally:

```
 active_clubs | inactive_clubs | catalog_entries
--------------+----------------+-----------------
           16 |              5 |              16
```

**`active_clubs = 16`, `inactive_clubs = 5`, `catalog_entries = 16`.** If those three numbers are
right and the five names are the five above, commit.

### Verification query — run this **after** committing

```sql
select
  (select count(*) from app.teams where active) as active_clubs,
  (select count(*) from app.teams where not active) as inactive_clubs,
  jsonb_array_length(api.football_team_catalog('fr', 100)) as catalog_entries,
  jsonb_array_length(api.football_team_catalog('ar', 100)) as catalog_entries_ar,
  (select string_agg(name, ', ' order by name) from app.teams where not active) as deactivated_clubs;
```

Expected: `16 | 5 | 16 | 16 | Chabab Mohammédia, JS Soualem, Olympic Safi, Olympique Dcheïra,
Yacoub El Mansour`.

Then reload a page that uses the club list (the news team filter, or the club index). It should
offer 16 clubs, not 21. `api.news_team_filters` and the FDR grid need no separate check: the news
filter applies the same `active` predicate, and `api.fantasy_fixture_difficulty` never reads
`app.teams` at all — it derives its clubs from the fantasy season's fixture assignments, which
only ever contain 2026/27 fixtures.

### Re-running it

The script is idempotent. A second run finds no candidates, prints

```
NOTICE:  bg0043: already_applied — no active club is outside the current season; 16 clubs remain active, nothing written
```

and writes nothing — not even an `updated_at` bump. If you are unsure whether the first run
committed, just run it again and read that notice.

### If a guard trips

Every guard raises an exception, which rolls the **entire** transaction back. Nothing is ever
partially applied. **Do not edit the script to make a guard pass** — the guards exist precisely
because deactivating the wrong clubs is far worse than not deactivating any. Report the message
to engineering (BG-0043) instead.

| Message                                                                              | What it means                                                                                                                                                                                         | What to do                                                                                                                                                               |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bg0043 refused: no_current_season`                                                  | No `app.seasons` row has `is_current = true`.                                                                                                                                                         | Something is wrong with the season state, not with the club list. Stop and report.                                                                                       |
| `bg0043 refused: unexpected_affected_count — expected 5 clubs, found N: ...`         | The list of clubs with no 2026/27 participation is no longer exactly those five. The message names every club it found. Most likely a squad or fixture import is mid-flight, or a new club was added. | Wait for any running import to finish and run it again. If the list is still not the five, stop: the expected count needs re-approving with the new list, not loosening. |
| `bg0043 refused: affected_club_has_fantasy_player — <club>: N fantasy player row(s)` | One of the candidates is priced into a fantasy season. Deactivating it would strand its players.                                                                                                      | Stop and report. This needs a fantasy-side decision first.                                                                                                               |
| `bg0043 refused: affected_club_has_current_season_fixture` / `..._membership`        | A club became part of the current season between the script's read and its write — an import committed underneath it.                                                                                 | Run it again; the candidate list will be recomputed.                                                                                                                     |
| `bg0043 refused: unexpected_remaining_active_count — expected 16 ... found N`        | The surviving active count is not 16.                                                                                                                                                                 | Stop and report. Do not commit.                                                                                                                                          |
| `bg0043 refused: write_count_mismatch`                                               | The update touched a different number of rows than there were candidates.                                                                                                                             | Stop and report. Do not commit.                                                                                                                                          |

### Note for later

This fixes today's data; it does not stop the drift. `app.teams.active` is set to `true` by the
provider ingest and nothing ever reconciles the complement, so a historical backfill re-run can
re-activate these five, and the next relegation will recreate the problem. The durable rule is
tracked separately (engineering brief BG-0043, option (b), to be folded into BG-0036). Re-running
this script is the interim remedy.
