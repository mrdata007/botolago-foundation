# Morocco's clock in the database

Written 2026-10-15. The rule itself is **confirmed by the owner (2026-10-15)**: Morocco is
UTC+0 all year from 2026-09-20T01:00:00Z (decree n° 2.26.530, IANA tz 2026c). Before that it
kept UTC+1, and UTC+0 during Ramadan. (`docs/product/PRODUCT_CONTEXT_2026-10-05.md`, row 149,
is a dated snapshot that predates the confirmation and is left as it was.)

## The problem in one paragraph

The website, the app and the e-mail renderer own the rule themselves
(`src/lib/morocco-time.ts`, `supabase/functions/_shared/morocco-time.ts`), so they print the
same hour whatever time-zone data their runtime carries. The two Supabase databases do not:
Production V2 and Staging V2 (PostgreSQL 17.6) carry older time-zone data in which
`Africa/Casablanca` is still UTC+1 after 2026-09-20. Asked for 12:00 UTC on 2026-10-15 they say
13:00, while the app says 12:00. Any database function that turns an instant into "Moroccan
clock time" with that zone name is therefore **an hour ahead of the wall clock** for every
instant on or after the change. The platform fix (a Supabase image that carries tz 2026c) is
outside our control and has no date, so the database follows the app's rule itself.

## What was checked, and how

- **Repository:** every `Africa/Casablanca`, `at time zone`, `timezone(`, `local_zone` and
  "Morocco" in `supabase/migrations` (the **latest** definition of each function, worked out by
  migration order), `supabase/functions`, `scripts/backend`, `src` and `supabase/tests`.
- **Production and Staging, read-only, by a separate reviewer on 2026-10-15**
  (`db-verify-opus-2026-10-15.md`): both databases answer 13:00; all 32 production accounts have
  notification zone `Africa/Casablanca`; nobody has quiet hours on; e-mail mode is `off`, push
  `testers`, Pépites `public`; no cron job or view names the zone. Where that report and this
  inventory differ, the differences are listed at the end.
- **Nothing here was run against a shared database.** The rehearsals described in
  `docs/production/MOROCCO_TIME_FIX_OWNER_RUNBOOK.md` ran on throwaway local PostgreSQL 16
  servers: one with the system's tz 2026c data, and one whose `Africa/Casablanca` is the old
  2026a file, which reproduces production's 13:00 answer.

## The functions that use the zone, and what the drift does

"Fixed by" names the migration. Every one of them is a `create or replace function` of the
**latest** definition with only the zone expressions changed; signatures, security attributes,
search paths, privileges and comments are untouched.

| Function (live definition)                                                                                      | What it does with the zone                                                                                                                                                                                                | Effect of the one-hour drift                                                                                                                                                                                                                          | Fixed by                                 |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `app_private.notification_push_fanout` (20261005135000)                                                         | Writes the `{{deadline}}` text of the Fantasy `deadline_24h` ("DD/MM HH24:MI") and `deadline_1h` ("HH24:MI") push and in-app notifications, in the reader's own zone (default Casablanca).                                | **Harmful.** A deadline of 18:30Z (2026-10-12) prints "12/10 19:30": an hour LATE, the direction that makes a reader miss it. Latent today (push is testers only, no such notification sent since 2026-09-20).                                        | `20261016090100` deadline text           |
| `app_private.notification_email_fanout` (20260926110100)                                                        | Same text for the in-app inbox row and the e-mail delivery of `deadline_24h`.                                                                                                                                             | **Harmful**, same as above. Latent (e-mail is off).                                                                                                                                                                                                   | `20261016090100`                         |
| `app_private.notification_email_plan` (20260924140100)                                                          | "Match day" is the Moroccan day; the match-day preview goes at 10:00 (not before 07:00, or 2 h before the first kick-off); results not before 08:00 and not after noon next day; round preview at 10:00 three days ahead. | Every send is an hour **early** (09:00, 07:00, 06:00 floor, 09:00). A kick-off between 23:00 and 24:00 UTC is listed in the **next** day's e-mail. Visible once e-mail is on.                                                                         | `20261016090200` planner and quiet hours |
| `app_private.defer_for_quiet_hours` (20260720121727)                                                            | A reader's quiet-hours window, and the instant it ends, in the reader's zone. Called by the push fan-out, `manager-card-tick`, and (where applied) `rivals-tick`.                                                         | The window sits an hour off the clock on the wall: a push at 22:30 Moroccan time waits only until 06:00 instead of 07:00, one at 21:30 is held although it is outside the window. Nobody has quiet hours on today.                                    | `20261016090200`                         |
| `app_private.pepites_local_at` (20260926100000)                                                                 | Monday + wall-clock time -> instant, for the weekly Top 10 (publication 20:00, staff draft 12:00).                                                                                                                        | `pepites_local_at('2026-10-19','20:00')` = 19:00Z: the edition goes out at 19:00 Moroccan time, not 20:00. **Live now** (mode public), staff-facing and mild.                                                                                         | `20261016090300` Pépites                 |
| `app_private.pepites_tick_draft`, `pepites_tick_daily`, `pepites_tick`, `pepites_create_draft` (20260926100000) | The Monday draft hour, the date of the daily sweep, the date in an error notice's key, and the "Publication prévue" time in the staff notice.                                                                             | The draft is made at 11:00 not 12:00; the day rolls over at 23:00; the staff notice says "20:00" for an instant that is really 19:00 (before the fix of `pepites_local_at` it matched; after it, it would be an hour out unless this is changed too). | `20261016090300`                         |
| `api.football_season_catalog` (20260802090000)                                                                  | A season's first and last match **date**; feeds the matches screen's default day.                                                                                                                                         | A first or last kick-off between 23:00 and 24:00 UTC is dated the next day. Cosmetic.                                                                                                                                                                 | `20261016090400` read models             |
| `api.admin_get_analytics_overview` (20260924160000)                                                             | "Today", the 30-day window and sign-ups per day, cut at Moroccan midnights.                                                                                                                                               | Days are cut at 23:00 Moroccan time; a sign-up at 23:30 Moroccan time lands on the wrong day. Admin only, cosmetic.                                                                                                                                   | `20261016090400`                         |
| `api.football_matches_by_date` (20260928090000)                                                                 | Day bounds from a date and a zone name, **only** when the caller sends no exact bounds.                                                                                                                                   | None for the app (it sends UTC bounds since 20260928090000). An older client or other caller that sends only a date loses the 23:00-24:00 UTC kick-offs of the day. Cosmetic.                                                                         | `20261016090400`                         |

### Left alone on purpose

| What                                                                                                                                                                             | Why                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app_private.pepites_source_players` and `pepites_compute_v1` (20260926090000): the date of a run's cut-off, for squad membership and age in whole years                         | They run under a sealed methodology and are replayed against stored scores (a changed answer would raise a spurious "rejeu différent"). The date differs only for a cut-off between 23:00 and 24:00 UTC and changes a result only on a birthday or transfer day in that hour. Belongs to a methodology version, not this fix. |
| Column defaults `'Africa/Casablanca'` (`user_preferences.notification_timezone`, `device_registrations.timezone`) and the `p_timezone` default of `api.football_matches_by_date` | They are a **name** stored or passed, not a conversion. The conversions that read the name now go through `app_private.zone_local` / `zone_instant`, which give the app's rule for that name.                                                                                                                                 |
| The ops-health and alert texts that print times "... UTC"                                                                                                                        | They name UTC explicitly.                                                                                                                                                                                                                                                                                                     |
| Everything that compares instants (kick-off windows of 10-65 minutes and 24 hours, worker health, ops alerts, `fantasy_kickoff_confirmed`)                                       | UTC only; never affected.                                                                                                                                                                                                                                                                                                     |
| `Africa/El_Aaiun`                                                                                                                                                                | Follows the same law in IANA, but the application's rule names only `Africa/Casablanca`, and nobody has chosen it. If it is ever chosen, `app_private.zone_local` is the one place to add it, together with `morocco-time.ts`.                                                                                                |

## The fix: one rule, written once in SQL

Migration `20261016090000_morocco_time_helpers` adds ten small functions in `app_private`
(owner-only, security invoker, empty search path, never volatile):

| Helper                                              | Answer                                                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `morocco_permanent_utc_from()`                      | `2026-09-20 01:00:00+00`, the instant of the change (mirrors `MOROCCO_PERMANENT_UTC_FROM_MS`)                                        |
| `morocco_zone_name(ts)`                             | `'UTC'` on or after the change, else `'Africa/Casablanca'`                                                                           |
| `morocco_local(ts)`                                 | Morocco's wall clock at an instant, as a `timestamp`                                                                                 |
| `morocco_local_date(ts)`                            | the Moroccan calendar day of an instant                                                                                              |
| `morocco_instant(local)`                            | the instant at which Morocco's clock reads `local` (the later reading of the hour that happened twice, as in `moroccoWallToInstant`) |
| `morocco_day_start(day)`, `morocco_day_end(day)`    | start (inclusive) and end (exclusive) of a Moroccan day; the day of the change is 25 hours long                                      |
| `zone_local(ts, zone)`, `zone_instant(local, zone)` | `ts at time zone zone` and `local at time zone zone`, except that `Africa/Casablanca` follows the rule                               |
| `morocco_time_zone_label()`                         | `'Africa/Casablanca'`, for labels in output only                                                                                     |

Why it is safe whatever the server carries: the helpers read the database's own
`Africa/Casablanca` data **only for instants before** the change, where every tz release agrees
(legacy and tz 2026c both give UTC+1, and UTC+0 in Ramadan). From the change on they say UTC
without asking. So the answer is the same on today's Production V2, on Staging V2 and on a
future image that carries tz 2026c; the fix keeps working when the platform catches up and does
not have to be undone. `morocco_instant` compares the wall time as UTC with the constant before
it asks the legacy zone, so no tz release can answer a different hour.

The constant is mirrored from the application and **a test fails if the two differ**
(`src/lib/morocco-time-sql.test.ts`). The same test:

- checks the pgTAP expectations in `supabase/tests/database/morocco_time_helpers.test.sql`
  against `tests/timezone-parity/expected.json`, the rule written down for the application
  (22 instants: hours, days, day bounds, the admin round trip);
- scans every migration **newer than the helpers** and fails if one writes `Africa/Casablanca`
  (or `El_Aaiun`) outside a comment, other than as the default of a function parameter. A
  future migration has to call the helpers, so the drift cannot return by the side door.

## Outside the database

| Where                                                                                                                                                                          | Finding                                                                                                                                                                                                                                           | Action                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/functions/_shared/account-deletion-worker.ts` (`longDate`)                                                                                                           | **Same bug.** It formatted the dates in the account-deletion confirmation e-mail with the runtime's `Africa/Casablanca`; a request between 23:00 and 24:00 UTC was dated the next day on a runtime with older data.                               | Fixed: it now uses `shiftToMorocco` from `_shared/morocco-time.ts` and formats in UTC. Its test asserted the wrong (UTC+1) day for 2026-10-06 and was corrected. **Needs the owner's deploy of the `account-deletion-worker` Edge Function.** |
| `supabase/functions/_shared/notification-email-render.ts`                                                                                                                      | Already follows the rule (`zoned()` shifts instants for `Africa/Casablanca`).                                                                                                                                                                     | None.                                                                                                                                                                                                                                         |
| `src/components/plus/trophy-model.ts` (`shortDate`), `src/components/plus/plus-rivals-text.ts` (`formatDay`), `src/backend/football/sofascore-id-bridge.ts` (`casablancaDate`) | Use `Intl` with `timeZone: "Africa/Casablanca"` directly, so a browser or server with older data dates a 23:00-24:00 UTC instant one day late. Date-only, cosmetic; the sofascore bridge uses it to match kick-off dates.                         | **Not changed** (other lanes' files). The remedy is `moroccoDateTimeFormat` from `src/lib/morocco-time.ts`.                                                                                                                                   |
| `scripts/backend/manager-card-founder-grant.sql`                                                                                                                               | The founder cut-off was written `'2026-11-01 00:00:00 Africa/Casablanca'`, which the database reads as 2026-10-31 23:00 UTC: managers who created a team between 23:00 and 24:00 Moroccan time on 31 October would have missed the founder badge. | Fixed: the cut-off is now the UTC instant `2026-11-01 00:00:00+00`, with the reason in the header.                                                                                                                                            |
| Historical migrations and apply scripts                                                                                                                                        | Contain the old expressions.                                                                                                                                                                                                                      | Untouched (forward-only).                                                                                                                                                                                                                     |

## Differences with the separate reviewer's inventory

Same findings, same priority order. Reconciled:

- The reviewer lists `pepites_source_players` / `pepites_compute_v1` as affected. Agreed; they
  are deliberately **not** changed (see "Left alone on purpose").
- The reviewer marks `api.football_matches_by_date` as "already fine". True for the app's
  caller; the date-and-zone path is still fixed so that no function uses the old data for
  Morocco and a test can say so.
- The reviewer proposes formatting the deadline in the Edge renderer instead. That works for the
  e-mail only; the in-app inbox and push text are rendered **in SQL** by the two fan-outs, so the
  SQL helper is needed for them in any case. The e-mail renderer already follows the rule.
- This inventory adds the quiet-hours function, the Pépites staff notice and daily sweep, the
  founder-grant script and the account-deletion e-mail.

## Platform alternative

Supabase may one day ship a PostgreSQL image with tz 2026c (check with
`select timestamptz '2026-10-15 12:00+00' at time zone 'Africa/Casablanca';`: 12:00 means
updated). Nothing here has to wait for it, and nothing has to be undone when it comes: before
the change the legacy data is asked (all releases agree), after it the answer is UTC either way.
Until it comes, any **new** code that converts with the zone name is wrong; use the helpers.
