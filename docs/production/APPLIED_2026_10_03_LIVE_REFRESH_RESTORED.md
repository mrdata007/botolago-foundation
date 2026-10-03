# Production: live score refresh switched back on (2026-10-03)

The live score refresh was switched back on in Production V2
(`tkewgajrljbwgwedqsxn`) on 2026-10-03 at 21:11:08 UTC, on the owner's go-ahead
("find out why it happened and fix it"). Email notifications stay off.

## Symptom

The site showed no live matches and no new results. Every fixture from
2 October onwards still read `not_started`, last written 1 October.

## Cause

A pause that was never undone. `AGENTS.md` asks for the live refresh and the
Fantasy tick to be paused before a write that touches fixtures, and switched
back on afterwards. The audit log (`app_private.notification_operational_audit`,
`notification_email_configured`) shows every earlier pause paired with a restore
a few minutes later:

| id | at (UTC)            | live refresh |
| -- | ------------------- | ------------ |
| 3  | 2026-09-24 19:15:55 | on           |
| 4  | 2026-09-25 16:14:24 | off (pause)  |
| 5  | 2026-09-25 16:18:18 | on           |
| 6  | 2026-09-25 20:08:03 | off (pause)  |
| 7  | 2026-09-25 20:08:43 | on           |
| 8  | 2026-09-26 10:38:41 | off (pause)  |
| 9  | 2026-09-26 10:39:20 | on           |
| 10 | 2026-09-26 22:24:20 | off (pause)  |

Row 10 has no restore. In the same transaction (22:24:20.16938) the Fantasy tick
was switched off too (`app_private.fantasy_automation_settings.updated_at`).
That time falls during the Pépites work of the night of 26 September (commits
`7827f0e9` and `2adabc9d`, migrations up to `20260926212632`). No
`docs/production` record exists for that write, so which operation it was
cannot be named with certainty. The hourly season refresh
(`football-season-refresh`) shares the same switch, so it stopped as well and
had never run on production (`last_invoked_at` null).

## What was run

Checks first: no client query in progress on the database, and no GitHub
workflow run in progress or queued.

Dry run: the call inside a `DO` block ending in a `raise` reported `mode = off`,
`activatedAt` null and `footballLiveRefreshEnabled = true`. A re-read showed
the switch still off, so the rollback held.

```sql
select app_private.notification_email_configure('off', null, null, true);
```

## Verification (read-only, 21:21 UTC)

- `football-season-refresh` invoked at 21:20 (window 2 Oct to 14 Nov): 8
  fixtures fetched, 8 updated, 0 rejected.
- `football-live-refresh` invoked at 21:18 and 21:21: 8 fixtures updated,
  match details for 7 stored.
- The six matches of 2–3 October now read `finished` with their scores, the
  postponed one reads `postponed`, and tonight's 20:00 match reads
  `live_second_half`.

## Not changed

The Fantasy tick (`app_private.fantasy_automation_settings.lifecycle_tick_enabled`)
is still off. It was switched off by the same 22:24 operation, but since then
the GW1 scoring and player-mapping work has relied on it being off: the records
of 1–3 October list "lifecycle tick off" as a precondition, and
`APPLIED_2026_10_03_FLASHSCORE_SUPPORTING_DEPENDENCY_GUARD.md` lists
"activating automation" as a separate owner decision. None of those records
depends on the live refresh being off.

Read-only state at 21:30 UTC: GW1 `provisional` (moved by hand on 1 October,
partial points published), GW2 `scheduled` with its deadline (2 October
14:30 UTC) already passed and never opened. The tick only advances gameweeks
that are `open` past their deadline, `locked` or `live`, so switching it on now
would not move either gameweek; it would run the calendar sync only. GW2 opens
once GW1 is finalized, which is the manual work still in progress.
