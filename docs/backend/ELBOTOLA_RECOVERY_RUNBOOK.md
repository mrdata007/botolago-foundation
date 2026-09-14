# ElBotola news recovery

The owner-confirmed 2026-08-03 permission recorded in `ELBOTOLA_INTEGRATION.md`
covers this integration's Arabic headline/link metadata and allowlisted remote
hero images. Recovery retains that scope. It does not enable GNews, collect
article bodies, translate copyrighted text, or copy remote image binaries.

## First recovery

1. Review this workflow, recovery script and existing ElBotola adapter on `main`.
2. Dispatch **ElBotola news recovery and refresh** with `mode=canary`, exact
   current main SHA, and `confirmation=RUN_ELBOTOLA_RECOVERY`.
3. The protected `production-admin-activation` environment provides the existing
   `SUPABASE_ACCESS_TOKEN`, `SUPABASE_SECRET_KEY`, and production project variables.
4. The workflow checks the exact project and database prerequisites, configures
   only `ELBOTOLA_*` runtime fields, deploys only `news-ingest-elbotola` with JWT
   verification enabled, activates the publisher, then invokes one bounded run.
5. Inspect `elbotola-recovery-<run-id>/result.json`: it must say `verdict=pass`,
   Arabic only, 1–10 fetched records, zero rejections, and counters matching a
   newly completed database run. The newest public story must be under 48 hours
   old. The result also records publication and remote-hero counts.

The adapter rechecks the live homepage and `robots.txt` for every run. It rejects
disallowed crawling and retains all URL, content, timestamp and size limits.
A failed first canary restores an initially inactive publisher; it never removes
article history or changes any GNews or football configuration.

## Dedicated authentication

`ELBOTOLA_INGESTION_TRIGGER_SECRET` is an HMAC-SHA256 derived in the protected
runner from `SUPABASE_SECRET_KEY` and the fixed domain-separated context
`botolago:<production-project-ref>:elbotola-ingestion:v1`. The 64-character result
is masked before workflow output and sent only to Supabase's protected secrets
endpoint and the exact ingestion function. Neither shared news nor football
trigger secrets are read, set, rotated or unset.

This lets subsequent runs authenticate without requiring a new GitHub secret.
If `SUPABASE_SECRET_KEY` changes, run a new canary to update the derived ElBotola
runtime credential before resuming refreshes. A failed authentication does not
weaken or remove any guard.

## Optional recurring refresh

After inspecting a successful manual **canary**, set repository Actions variables:

- `ELBOTOLA_CANARY_VERIFIED_RUN_ID=<successful canary run ID>`
- `ELBOTOLA_CANARY_VERIFIED_FUNCTION_VERSION=<functionVersion from result.json>`
- `ELBOTOLA_SCHEDULE_ENABLED=true`

The schedule runs at minute 17 every six hours. Its shared production mutation
lock prevents overlap with other recovery workflows. It checks that the chosen
run succeeded on main at attempt 1, and that configuration, deployment and
ingestion steps succeeded. It then compares the workflow, recovery script and
two function source files at the canary commit with the current files. Unrelated
commits do not invalidate the canary; ingestion changes require a new canary.
The live function version must also match the recorded canary version, so an
out-of-band runtime redeployment requires another canary before recurring runs.
Scheduled runs only invoke and verify the existing function: no deployment,
configuration changes or publisher activation occur.

For an immediate additional refresh use `mode=refresh` with current main SHA and
the same confirmation. To stop recurrence, set `ELBOTOLA_SCHEDULE_ENABLED=false`.
If source permission changes, also deactivate the publisher. Do not delete its
articles as a side effect of stopping collection; any editorial withdrawal is a
separate reviewed change.

## Checks

```bash
python scripts/backend/elbotola-recovery.test.py
bun test supabase/functions/_shared/elbotola.test.ts
bun run backend:secrets:check
```
