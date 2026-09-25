# Owner runbook: apply the 2026-09-24 launch fixes

Status when written (2026-09-24, 21:24 UTC): **not applied.** Production's
Gameweek 1 is still open, 8 hours after its 13:30 UTC deadline, with 0 of 6
squads locked, and new managers cannot join a gameweek. Applying the database
half of this release fixes both. About 10 minutes in all.

Order: **merge the pull request → database (steps 1-3) → website (step 4) →
switches (steps 5-7) → checks (step 8).** The website also works before the
database is done, but the Fantasy fix is in the database.

**Update, 2026-09-25.** From about 04:50 UTC, Google crawling the ~15,700
news articles overloaded the database; from about 05:15 every read timed out.
The owner raised its compute to **Large** (restarted 06:13 UTC), and the
related-articles speed-up (`20260924200400`, the same text) went live on its
own at 06:33 UTC: 487 ms → 32 ms for one article. The script accepts that
function in either form and records the migration when it runs. Live scores
were already switched on before the script (the setting was last changed on
2026-09-24 at 19:15 UTC), so step 6 is done, and the 2-minute match cadence
starts as soon as the script is applied.

## What the database half does

Seven migrations, applied by one guarded script,
[`scripts/backend/apply-20260924-launch-fixes.sql`](../../scripts/backend/apply-20260924-launch-fixes.sql):

| Migration                                                   | In plain words                                                                                                                                                         |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260924200000_fantasy_postponement_and_enrolment`         | A postponed match no longer sets or freezes a deadline, or stops a gameweek locking. A new manager joins the next gameweek once the current one's deadline has passed. |
| `20260924200100_fantasy_lifecycle_tick`                     | The database itself locks gameweeks on time, every 5 minutes (arrives switched off: step 5).                                                                           |
| `20260924200200_ops_health_and_alerts`                      | One health check for the whole site, failure alerts to a webhook (arrive switched off: step 7), and a private place where visitors' browsers report errors.            |
| `20260924200300_timezone_validation_without_catalogue_scan` | The matches page's database call: 1,025 ms → about 10 ms.                                                                                                              |
| `20260924200400_news_related_articles_set_based`            | "Related articles" under a news article: 608-644 ms → about 40 ms.                                                                                                     |
| `20260924200500_football_live_refresh_cadence`              | Live scores every 2 minutes during a match, every 5 before kick-off, nothing otherwise (still switched off: step 6).                                                   |
| `20260924200600_news_truthful_modified_dates`               | Articles stop claiming they were all edited on 2026-09-24.                                                                                                             |

Then it does what the season orchestrator would do: syncs the calendar (the
postponed FAR Rabat v Raja Casablanca stops counting for Gameweek 1, and
Gameweek 2 is created) and locks Gameweek 1.

The script refuses to run unless production is exactly as it was reviewed
(latest migration `20260924190100`, the 12 functions it replaces unchanged --
related articles may already be on this batch's own body -- none of its
objects present). Checked read-only at 21:24 UTC: all true. If
any check fails, it stops, says which, and saves nothing. **Never edit a
check to make it pass.**

## Step 1 — Nothing else running

GitHub → Actions → **Fantasy season orchestrator**: nothing yellow (running).
If it is running, wait for it to finish. Do not start other database work
until step 3 is done.

## Step 2 — Rehearsal (saves nothing)

1. Open the script on GitHub:
   `scripts/backend/apply-20260924-launch-fixes.sql` on the merged `main` →
   **Raw** → select all → copy.
2. Supabase → project **BotolaGO Production V2** → **SQL Editor** →
   **New query** → paste → **Run**.
3. It ends with a red box: **"REHEARSAL PASSED -- nothing was saved"**. That
   is the expected result. Its **DETAIL** says what applying would change.
   Look for:
   - `"lineupsChangedAfterDeadline": {"GW1": 0}`: no squad was saved after
     the deadline. **If it is above 0**, those squads were edited after
     13:30 UTC while the gameweek stayed open, and locking freezes them as
     they are now. Stop and decide before applying.
   - `"gameweeks"`: Gameweek 1 `locked` with 6 locked lineups; Gameweek 2
     `scheduled`.
   - `"newTeamsJoin": "gameweek 2, deadline …"`.
   - `"deferredByThisRun": ["FAR Rabat v Raja Casablanca"]`.
   - `"matchesByDateMs"`: a small number (it was 1,025 ms).

## Step 3 — Apply

1. In the same query, find the line
   `select set_config('botolago.launch_fixes_mode', 'REHEARSAL', true);`
   (the "MODE" line near the top) and change `REHEARSAL` to `APPLY`.
2. **Run.** The last row says **"Applied. New managers can join the next
   gameweek; postponed fixtures no longer block the season."**

If it says "Not applied", nothing was saved: read the error above it.

## Step 4 — Publish the website

1. Open <https://lovable.dev/projects/9f9face2-4733-42fd-aa13-174fbe9f6c87>.
2. Click **Publish** (top right), then **Update**. Wait for "published".

The whole checklist and how to undo a publish:
[`docs/operations/DEPLOYMENT.md`](../operations/DEPLOYMENT.md).

## Step 5 — Switch on the Fantasy tick (locks gameweeks on time)

SQL Editor → New query → Run:

```sql
select app_private.fantasy_automation_configure(true);
```

To pause it (do this before any hand-made change to Fantasy tables):
`select app_private.fantasy_automation_configure(false);`

## Step 6 — Switch on live scores (optional, before the next match)

Supabase → **Edge Functions** → **Secrets**: check `SPORTSMONKS_API_TOKEN`
is listed. Then SQL Editor → Run:

```sql
select app_private.notification_email_configure(
  'off',                                                   -- email stays off
  'https://tkewgajrljbwgwedqsxn.supabase.co/functions/v1',
  null,
  true                                                     -- live scores on
);
```

A two-hour match costs about 60 SportsMonks calls. Off again: the same call
with `false`. More: [`docs/backend/EMAIL_NOTIFICATIONS.md`](../backend/EMAIL_NOTIFICATIONS.md).

## Step 7 — Switch on failure alerts (optional)

Create a Discord or Slack webhook, then Run:

```sql
select vault.create_secret('<paste the webhook URL>', 'botolago_ops_alert_webhook');
select app_private.ops_alert_configure(true);
```

What each alert means: [`docs/operations/ALERTS.md`](../operations/ALERTS.md).

## Step 8 — Check (2 minutes)

- Supabase SQL Editor:
  `select status, deadline_at from app.fantasy_gameweeks order by sequence_number;`
  shows Gameweek 1 `locked` and Gameweek 2 `scheduled`.
- <https://botolago.com/matches> lists today's matches. (Its database call
  was timed on production by the rehearsal: `matchesByDateMs`.)
- `curl -sI https://botolago.com/ | grep -i x-botolago-release` shows the
  merged commit.
- GitHub → Actions → **Production watchdog** → **Run workflow**: green.

## If something goes wrong

- **The script stops with a message**: nothing was saved. The message says
  which check failed. Do not edit the check; send the message.
- **After applying**, to stop the automation: step 5's pause call; live
  scores off with step 6's call and `false`. The migrations themselves are
  not undone by hand: a correction is a new migration.

## Clean-up for later (owner decision)

The audit created two test accounts on production:
`alisarhane73+audit20260924@gmail.com` and
`compak2026+audit20260924@gmail.com`. They were left in place, because
deleting accounts is irreversible. To remove them: Supabase → **Authentication**
→ **Users** → search each address → **⋯** → **Delete user**. Checked at
21:24 UTC: both exist, and neither owns a Fantasy team.
