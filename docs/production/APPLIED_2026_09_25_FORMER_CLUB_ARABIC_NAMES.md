# Production: Arabic names for five clubs of past seasons (2026-09-25)

Five rows were added to `app.team_translations` in Production V2
(`tkewgajrljbwgwedqsxn`) on 2026-09-25 at 04:52:28 UTC, with the owner's
go-ahead for this write. They give an Arabic name to the clubs that played in
2024/25 or 2025/26 but are not in the league now:

| Club              | Seasons          | Arabic name            | Arabic short name |
| ----------------- | ---------------- | ---------------------- | ----------------- |
| Olympic Safi      | 2024/25, 2025/26 | أولمبيك أسفي           | أولمبيك أسفي      |
| Olympique Dcheïra | 2025/26          | أولمبيك الدشيرة        | أولمبيك الدشيرة   |
| Yacoub El Mansour | 2025/26          | يعقوب المنصور          | يعقوب المنصور     |
| Chabab Mohammédia | 2024/25          | شباب المحمدية          | شباب المحمدية     |
| JS Soualem        | 2024/25          | الشباب الرياضي السالمي | الشباب السالمي    |

The owner supplied the first three names and confirmed the last two.

## Why

BG-0068 gave Arabic names to the 16 clubs of the current season only. The
Classement tab shows the 2024/25 and 2025/26 tables too, and these five clubs
showed there in Latin script on the Arabic page.

The names live in `app.team_translations`, which the SportsMonks ingestion
never writes, so they survive every sync. `app.teams` was not touched.

## How

With the guarded script
[`scripts/backend/football-team-arabic-names-former-clubs.sql`](../../scripts/backend/football-team-arabic-names-former-clubs.sql),
as committed in `02af2a7`. It was run through the Supabase connection in
two passes:

1. As shipped, ending in `rollback;`. The result row read "Rehearsal passed".
   A read straight after showed the table unchanged.
2. With that one line changed to `commit;`. The result row read "Applied".

In one transaction, the script:

1. bounds its lock (5 s) and statement (30 s) timeouts;
2. checks each id against its Latin name in `app.teams`, byte for byte;
3. writes one `ar` row per club, and can safely be run again;
4. reads the five rows back;
5. compares every other translation row with a copy taken just before the write.

## Before writing

Nothing else was writing:

- No other database session was active and none held a write transaction.
- No pg_cron job was running. The every-minute news job ran between the
  rehearsal and the real write, finished, and does not touch this table.
- The only GitHub workflow in progress was a pull request's test suite, which
  uses its own database.
- The two other Claude sessions running at the time were doing local test work.

## Evidence

- **Rehearsed first on a local Postgres 16** holding production's rows and the
  table's exact definition (constraints, trigger, forced row security):
  - the rehearsal leaves the table unchanged;
  - with `commit;` it adds the five rows (17 → 22) and leaves the other 17 rows
    byte-identical, timestamps included;
  - a second run changes nothing;
  - a club renamed upstream, a missing club, and another row changing during
    the write each stop it with nothing saved.
- **On production:**
  - Before: 17 rows, fingerprint `08a5a7384462e614cfae5920e817c12c`.
  - After the rehearsal: still 17 rows, same fingerprint.
  - After the real run: 22 rows. The 17 earlier rows still fingerprint to
    `08a5a7384462e614cfae5920e817c12c`, and the five new rows read back as
    above. No club with a season in the data is left without an Arabic name.
- **Public API, anonymous:**
  - `football_standings` in Arabic returns all 16 clubs in Arabic script, for
    both 2025/26 and 2024/25, with none left in Latin.
  - The same calls in French still return the Latin names.

`scripts/backend/football-team-arabic-names-former-clubs.test.ts` keeps the
script shipping as a rehearsal, keeps its checks ahead of the write, and keeps
every name within the table's rules.

## Check it yourself

```sql
select team.name, t.name as arabic, t.short_name as arabic_short, t.created_at
from app.team_translations t
join app.teams team on team.id = t.team_id
where t.language = 'ar'
  and t.team_id in (
    '32fb7b61-9af4-4667-8978-b739b5e3f170', 'f2715f02-38ed-4feb-a4e5-72444ad39529',
    'e595b91e-4d8f-4f3d-92d7-c23d7e332544', '7ff33380-1236-45e5-9c3e-97e753961cc9',
    '318655a9-db9f-4706-abb2-df0fa4b13baf'
  )
order by team.name;
-- expect five rows, created 2026-09-25 04:52:28 UTC
```

## Undo

Deleting the five rows puts the Latin names back on the Arabic page, with
nothing else affected:

```sql
delete from app.team_translations
where language = 'ar'
  and team_id in (
    '32fb7b61-9af4-4667-8978-b739b5e3f170', 'f2715f02-38ed-4feb-a4e5-72444ad39529',
    'e595b91e-4d8f-4f3d-92d7-c23d7e332544', '7ff33380-1236-45e5-9c3e-97e753961cc9',
    '318655a9-db9f-4706-abb2-df0fa4b13baf'
  );
```

## Good to know

BG-0068's seed (`scripts/backend/football-team-arabic-names-seed.sql`) ends by
counting every `ar` row against the current season's clubs. There are now 21
`ar` rows and 16 current clubs, so that file, re-run as written, stops at that
check and saves nothing. Its count needs scoping to the current clubs before
it is run again.
