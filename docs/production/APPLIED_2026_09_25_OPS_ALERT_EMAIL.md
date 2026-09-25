# Production: alert emails installed (2026-09-25)

On 2026-09-25 a Claude Code session wrote to Production V2
(`tkewgajrljbwgwedqsxn`) with the owner's go-ahead ("Yes, but another
address": merge, update the database after a rehearsal, deploy the function,
set the address, send a test).

That afternoon both existing alert channels fired, and neither reached the
owner:

- The watchdog's simulated failure opened ops-alert issue #218, mentioning
  `@mrdata007`.
- A TEST message sent through the Vault webhook got Slack's `ok`.

The owner saw neither. Alerts now also go by email to the address the owner
chose, `support@botolago.com`, which is a Zoho Mail mailbox (botolago.com MX).

What changed:

- **Migration `20260926001000_ops_alert_email`** (pull requests #220 and
  #221):
  - on `app_private.ops_alert_state`: the columns `email_to` and
    `last_email_request_id`, and the check constraint
    `ops_alert_state_email_check`;
  - new functions (all in `app_private` unless marked): `ops_alert_webhook`,
    `ops_alert_email_ready`, `ops_alert_configure_email`, `ops_alert_send`,
    `ops_alert_test`, and `api.service_ops_alert_email_target` (executable
    by `service_role` only);
  - replaced functions: `ops_alert_configure(boolean)`, which now needs a
    webhook or a usable email, and `ops_alert_tick()`, which sends through
    the webhook, the email or both and returns `send_failed` when nothing
    was queued. The tick's comment is updated.
- **Edge Function `ops-alert-email`**, version 1, `verify_jwt = false`. It
  sends with the site's own Resend key and sender.
- **The address**: `support@botolago.com`.

Nothing else changed. Alerts were already switched on (`enabled = true`) and
stayed on. The Slack webhook stays configured.

## How

The committed script `scripts/backend/apply-20260926001000-ops-alert-email.sql`,
run through Supabase's `execute_sql` in one transaction. It:

- refuses to run twice or before its prerequisites;
- records the migration file whole in `supabase_migrations.schema_migrations`;
- runs it from that record only after its sha256 matches the repository file;
- checks the new column, the grants, the tick schedule, and that alerts are
  on or off exactly as before, with no address yet.

It touches no fixture, Fantasy or notification table, so no job was paused.

Times are UTC.

1. **17:25:35, before anything.** No other query was running and no pg_cron
   job was mid-run. The latest migration was `20260925234000`, the alert
   migration was not recorded, and the functions URL and scheduler token
   both existed. Alerts were on, `last_status ok`, never sent.
2. **First rehearsal, stopped in preflight, nothing written.** The script's
   check for the email delivery migration looked only for `20260924140100`.
   Production recorded that file as `20260924131431`, and
   `scripts/backend/production-migration-aliases.json` marks the two
   `identical`. The guard was not loosened. #221 made it accept the
   documented alias as well, which still requires the migration, and was
   merged after CI passed.
3. **17:35:25, Edge Function deployed** (`ops-alert-email`, version 1).
   Probes: POST with no token → `401 unauthorized`; POST with a
   well-formed but wrong token → `401 unauthorized` (the database refused
   it, so the function's database link works); GET → `405`.
4. **17:36:01, re-read before the rehearsal.** Nothing was recorded yet and
   no other query was running.
5. **Rehearsal** (the script as on `main`, ending in `rollback`): "Rehearsal
   passed. Nothing was saved." The sha256 check passed, so the migration
   arrived byte for byte.
6. **Re-read.** No history row and no new column. Alert state unchanged. No
   other query.
7. **For real** (the whole file with `rollback;` changed to `commit;` and
   nothing else): "Applied."
8. **Address:** `select app_private.ops_alert_configure_email('support@botolago.com');`
   → `{"email": true, "enabled": true}`.
9. **17:39:13, delivery test:** `select app_private.ops_alert_test();` →
   webhook request 14 and email request 15.
   - Request 14 (Slack): `200 ok`.
   - Request 15 (`ops-alert-email`): `200 {"sent":true,"id":"01a0d9a6-61c5-740b-93bc-82b8a44656bc"}`.
     This is Resend's message id, so `RESEND_API_KEY` is set and the
     botolago.com sender works.
   - The test left the alert state untouched (`last_sent_at` still null).

## Evidence (read-only, after the run)

- **History:** `20260926001000 ops_alert_email` is recorded.
- **Alert tick:** the runs of 17:25, 17:30 and 17:35 succeeded on the old
  code. The run of 17:40:00, the first on the new code, also succeeded (0.04 s)
  and stayed quiet: health `ok`, nothing sent, `last_sent_at` still null.
- **Health:** `ok`.

## Still open

- **The owner confirms receipt.** The email "[BotolaGO] Production alert
  TEST", sent at 17:39 UTC to support@botolago.com, must be in that inbox
  (check spam too). Until then delivery to a person is not proven: Resend
  accepted it, which is all a machine can see.
- **Slack:** the webhook posts to a channel the owner does not see. Either
  find it (Slack → Apps → Incoming Webhooks shows the channel) or remove it
  with `delete from vault.secrets where name = 'botolago_ops_alert_webhook';`.
  Removing it is a production write, so it is left to the owner. Email alone
  is enough for alerts.
