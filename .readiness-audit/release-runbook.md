# Release runbook — PR #379 (P1-01, P1-02, P1-03, lint scope)

Owner-run. Nothing here has been executed. Commands that change production are
marked **WRITE**, and each one needs the owner's go-ahead at the moment it is
run (`CLAUDE.md`: an authorisation covers one operation, not the next).

## What this release changes in each deployable part

| Part (`docs/operations/DEPLOYMENT.md`) | Changed?                | Detail                                                                                                                                                                                                                                                            |
| -------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Website (Lovable)                      | No page code            | Only lint configuration and a dev dependency. Publishing is still recommended so the `x-botolago-release` header and the watchdog's `release_drift` check stay in step with `main`.                                                                               |
| Database                               | **No**                  | No migration, no SQL.                                                                                                                                                                                                                                             |
| Edge Functions                         | **Yes, 8**              | Scheduled (in-process token check): `account-deletion-worker`, `ai-content-generate`, `football-live-refresh`, `notification-email-dispatch`, `notification-push-dispatch`, `ops-alert-email`. Staff (pre-flight): `news-editorial-write`, `player-photo-upload`. |
| GitHub Actions                         | **Yes, on merge**       | `phase7e-production-admin-preflight.yml` and the promoter and 7F scripts refuse disabled or unverifiable PITR from the moment `main` carries them.                                                                                                                |
| Supabase configuration                 | **Yes, one new secret** | `BOTOLAGO_SCHEDULER_TOKEN`, an Edge Function secret.                                                                                                                                                                                                              |

## Production facts this runbook relies on

All read-only, read on 2026-10-08 ~05:55 UTC:

- **Project:** `tkewgajrljbwgwedqsxn` (BotolaGO Production V2), `ACTIVE_HEALTHY`, Postgres 17.6.1.147.
- **Compute:** `max_connections` 60, `shared_buffers` 256 MB. That is the **Micro** profile, not Large. A 2026-09-24 note says Large; the 2026-09-26 note in #240 says Micro. The live reading agrees with Micro.
- **Vault:** the secret `botolago_scheduler_token` exists (one row; the value was not read).
- **All 12 Edge Functions** in `supabase/functions` are deployed and `ACTIVE`, and the scheduled ones have `verify_jwt = false`.
- **Scheduler switches:**

  | Function                      | Woken by                                                                            | State today                                                                                                   |
  | ----------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
  | `football-live-refresh`       | `football-live-refresh` (every minute) and `football-season-refresh` (every 10 min) | live refresh **on**                                                                                           |
  | `notification-push-dispatch`  | `notification-push-tick` (every minute)                                             | mode `testers`                                                                                                |
  | `account-deletion-worker`     | `account-deletion-tick` (hourly at :23, only when an erasure is due)                | **enabled**                                                                                                   |
  | `ops-alert-email`             | `ops-alert-tick` (every 5 min, only when an alert fires)                            | alerts **on**, address set                                                                                    |
  | `notification-email-dispatch` | `notification-email-tick` (every 5 min)                                             | mode `off`, so it is not woken                                                                                |
  | `ai-content-generate`         | —                                                                                   | its migration is not applied in production: no cron job and no settings table, so the database never wakes it |

Consequence: deploying a scheduled function **before** the secret exists makes
live scores stop refreshing within one minute (`football-live-refresh` answers
`503 scheduler_token_not_configured`). Nothing is lost or half-done, because
work is claimed only after the token is accepted. The secret must still come
first.

## Scheduler token: how the two sides meet

```
pg_cron job ─▶ app_private.<x>_tick() ─▶ app_private.invoke_scheduled_function(base_url, '<fn>', body)
                                           reads Vault 'botolago_scheduler_token' (app_private.scheduler_token())
                                           net.http_post … header x-botolago-scheduler-token: <token>
Edge Function <fn>/index.ts: environment = Deno.env.toObject()  ─▶  handler(request, { environment, … })
  _shared/scheduler-token.ts: constant-time compare of the header with environment.BOTOLAGO_SCHEDULER_TOKEN
  ─ match ────────────▶ continue (first database call happens only here)
  ─ no match ─────────▶ 401 unauthorized (zero client calls)
  ─ secret missing or not 64 hex ─▶ 503 scheduler_token_not_configured (zero client calls)
```

- **One sender.** `invoke_scheduled_function` (migration 20260924140100) is the only place the database sends the token, and it wakes exactly these six functions; every caller was checked. No script, workflow or frontend sends the header. The only other reference is the database end-to-end test, updated in `b6286edb`.
- **The two values must be byte-identical.** Both are 64 lowercase hex characters. Surrounding whitespace in the secret is trimmed, so a pasted newline is harmless.
- **Scope.** Edge Function secrets are project-wide. The other six functions ignore this one. Supabase's documentation says setting a secret needs no redeploy.
- **Rotation.** Change Vault and the secret together. Between the two, wake-ups answer 401 and simply retry on the next tick.

## Step-by-step

Order matters. Each step lists its check and its way back.

### 0. Before anything (no cost, no write)

- **0.1** Review PR #379, and confirm `application-quality` and `database-quality` are green on its **current head** commit.
- **0.2** Decide on Vercel (see `release-preparation.md` §3). It does not gate this release unless branch protection lists `Vercel` as a required check (GitHub → Settings → Branches → `main`).
- **0.3** Pick a quiet window: no match live (live scores pause if step 2 goes wrong), and not hour :23 (account deletions).

### 1. Set the secret — **WRITE (configuration)**, free, safe to do first

The six functions deployed today do not read this secret, so adding it changes
nothing until step 3.

**Option A — dashboard.** SQL editor:

```sql
select decrypted_secret from vault.decrypted_secrets where name = 'botolago_scheduler_token';
```

Copy the value straight into Edge Functions → Secrets → **Add new secret**:
name `BOTOLAGO_SCHEDULER_TOKEN`. Then clear the SQL editor result tab. Never
paste the value into chat, a file, an issue or a commit.

**Option B — CLI, value never on screen.** You need the database connection
string in `$PROD_DB_URL` (from your password manager) and an authenticated
Supabase CLI:

```sh
supabase secrets set --project-ref tkewgajrljbwgwedqsxn --env-file <(
  printf 'BOTOLAGO_SCHEDULER_TOKEN=%s\n' "$(psql "$PROD_DB_URL" -Atc \
    "select decrypted_secret from vault.decrypted_secrets where name = 'botolago_scheduler_token'")"
)
```

**Check (no value shown):**

- `supabase secrets list --project-ref tkewgajrljbwgwedqsxn` lists `BOTOLAGO_SCHEDULER_TOKEN`.
- The CLI shows a digest, not the value. To compare it with Vault without revealing either, run in SQL:

  ```sql
  select encode(extensions.digest(decrypted_secret, 'sha256'), 'hex')
  from vault.decrypted_secrets where name = 'botolago_scheduler_token';
  ```

  Equal hex strings mean equal values. Supabase does not document the CLI digest format, so if the two formats differ, rely on step 3.3 instead: a `200` from the next tick is definitive.

**Way back:** `supabase secrets unset BOTOLAGO_SCHEDULER_TOKEN --project-ref tkewgajrljbwgwedqsxn`.
Safe while the old functions are deployed.

### 2. Merge PR #379 — owner approval

- From this moment, the PITR gate is live in the promoter, the 7F gate and the 7E-A preflight workflow (P1-03). While production reports PITR off, **those workflows refuse to run**.
- The guarded SQL-editor scripts (`scripts/backend/apply-*.sql`), the path used for migrations since late September, do not query PITR and are **not** blocked. See §"Residual gap".
- Lovable syncs `main` within a minute.

### 3. Deploy the Edge Functions — **WRITE (deploy)**

From a clean checkout of the merged `main`. One function at a time, checking
each before the next. The most-used function goes first, so a problem shows up
at once:

```sh
git checkout main && git pull --ff-only
for fn in football-live-refresh notification-push-dispatch ops-alert-email \
          account-deletion-worker notification-email-dispatch ai-content-generate \
          news-editorial-write player-photo-upload; do
  supabase functions deploy "$fn" --project-ref tkewgajrljbwgwedqsxn
  read -r -p "Deployed $fn. Run its check (3.x), then press Enter to continue: "
done
```

`supabase/config.toml` carries each function's `verify_jwt` setting, and the
deploy keeps them as they are today.

**3.1 Refusal probe, after each scheduled function.** Expected `401`. A `503`
means the secret is missing or wrong: stop and go back to step 1. No database
call happens on this path.

```sh
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'content-type: application/json' -H "x-botolago-scheduler-token: $(printf '0%.0s' {1..64})" \
  https://tkewgajrljbwgwedqsxn.supabase.co/functions/v1/football-live-refresh
```

**3.2 Real ticks reach the function.** Read-only; run 2–3 minutes after
deploying `football-live-refresh`:

```sql
select status_code, count(*)
from net._http_response
where created > now() - interval '5 minutes'
group by 1 order by 1;
```

You want `200` only. Any `401` means the secret differs from Vault; any `503`
means it is missing. Undo the deploy (Rollback R2) and fix step 1.

**3.3 Each scheduled function, once deployed:**

| Function                      | Check                                                                                                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `football-live-refresh`       | 3.2, plus a live or recent match page updates.                                                                                                                                     |
| `notification-push-dispatch`  | `select last_outcome, last_tick_at from app_private.notification_push_settings;` shows `last_tick_at` within the last 2 minutes and an outcome that is not `not_configured`.       |
| `ops-alert-email`             | **WRITE (sends one e-mail):** `select app_private.ops_alert_test();`. The owner receives the TEST alert.                                                                           |
| `account-deletion-worker`     | After the next :23: `select last_outcome, last_due, last_tick_at from app_private.account_deletion_settings;`. `idle` when nothing was due; otherwise the 3.2 query shows a `200`. |
| `notification-email-dispatch` | Mode is `off`, so the database does not wake it. Probe 3.1 only.                                                                                                                   |
| `ai-content-generate`         | Not scheduled in production. Probe 3.1 only.                                                                                                                                       |

**3.4 Staff functions:**

- `news-editorial-write`: a staff editor saves a draft in `/admin/news` and it succeeds. Optionally, an ordinary signed-in account calling it gets `403 news_editorial_forbidden`.
- `player-photo-upload`: a staff member with `football.correct` uploads a photo in the Pépites admin and gets `201`; a non-staff account gets `403`.

### 4. Publish the website in Lovable

Follow `DEPLOYMENT.md` → Releasing step 3. Then:

```sh
curl -sI https://botolago.com/ | grep -i x-botolago-release
```

It must show the merged commit.

### 5. Monitor for 24 hours

Run these read-only every few hours:

- Wake-up health:

  ```sql
  select date_trunc('hour', created) h, status_code, count(*)
  from net._http_response where created > now() - interval '24 hours'
  group by 1, 2 order by 1, 2;
  ```

  Expect no `401` or `503` after the deploy.

- `select j.jobname, d.status, count(*) from cron.job_run_details d join cron.job j using (jobid) where d.start_time > now() - interval '24 hours' group by 1, 2 order by 1, 2;` shows no new `failed` rows.
- The Production watchdog (GitHub Actions, every 30 minutes) stays green: `ops_health`, `release_drift`, `news_sitemap`. Ops alerts reach the owner's mailbox (proved in 3.3).
- Supabase → Edge Functions → each function's **Invocations** and **Logs**: a spike in 401s from unknown sources is expected noise (that is the refusal working). A run of 503s is not.

## Rollback

| #   | Situation                                                    | Action                                                                                                                                                                                        | Effect                                                                                                                                |
| --- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Secret wrong or missing after deploy (401s or 503s on ticks) | Fix the secret (step 1); no redeploy needed                                                                                                                                                   | Next tick returns 200                                                                                                                 |
| R2  | A deployed function misbehaves                               | Redeploy the previous version from `3f9c57f` (main before this PR): `git worktree add /tmp/prev 3f9c57f && cd /tmp/prev && supabase functions deploy <fn> --project-ref tkewgajrljbwgwedqsxn` | The old version ignores the secret and uses the database check again. That is the P1-01/P1-02 exposure back, so it is temporary only. |
| R3  | The PITR gate blocks a needed promoter or preflight run      | Enable PITR (`pitr-activation-checklist.md`). Do **not** loosen the gate; reverting P1-03 is a policy decision the owner records explicitly.                                                  | —                                                                                                                                     |
| R4  | Merge must be undone                                         | `git revert -m 1 <merge sha>` through a PR (never a force-push, which Lovable cannot follow), then R2 for the functions                                                                       | —                                                                                                                                     |
| R5  | Bad website publish                                          | Lovable → History → publish the previous version                                                                                                                                              | —                                                                                                                                     |

The secret can stay set after any rollback; old code ignores it.

## Residual gap (recorded, not fixed here)

Production migrations now go through guarded scripts run by hand in the SQL
editor. SQL cannot read the Management API, so no automatic PITR check guards
that path. Until one exists (for example a read-only preflight workflow run
before each apply), the release checklist for any migration must include
**"PITR enabled: confirmed in Database → Backups → Point in time"**, recorded
with the apply.
