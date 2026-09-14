# ElBotola news recovery

The owner-confirmed 2026-08-03 permission in `ELBOTOLA_INTEGRATION.md` covers
Arabic headline/link metadata and allowlisted remote hero images. This workflow
uses the existing adapter with its origin, robots, timestamp, HTML and size
guards. It does not enable GNews, collect article bodies or copy image binaries.

## Manual canary

1. Apply the reviewed additive `elbotola_service_source_controls` migration.
   This exposes only two service-role-only RPCs for the fixed ElBotola source;
   it does not activate the publisher.
2. Review the workflow and runner on `main`, then dispatch **ElBotola news
   recovery and refresh** with `mode=canary`, exact current main SHA, and
   `confirmation=RUN_ELBOTOLA_RECOVERY`.
3. The protected `production-admin-activation` environment supplies the existing
   `SUPABASE_SECRET_KEY`, `SUPABASE_PRODUCTION_PUBLISHABLE_KEY`, and three production project variables. No Management
   API token or database password is required.
4. The Bun runner checks source status, activates an inactive source through the
   fixed service RPC, and calls `handleElbotolaRequest` directly. Its random
   trigger exists only in this process; no Edge Function or shared runtime
   secret is deployed, written, rotated or unset.
5. Inspect `elbotola-recovery-<run-id>/result.json`: `verdict=pass`, 1–10 fetched,
   zero rejections, an acknowledged successful database completion matching the
   handler counters, and every ingested ID in the Arabic news-feed RPC with
   correct attribution, publication time and safe remote images, using a separate
   publishable-key client for public RPCs. The newest
   article must be under 48 hours old. A public detail RPC also verifies the
   canonical outbound source link.

The adapter's begin RPC checks the active publisher before any provider request.
Evidence contains only identifiers, counters and validation outcomes, not
provider HTML, article text or credentials. Use its `ingestionRunId` to inspect
the stored run directly when reviewing the canary. Confirm the live Arabic
news page before enabling recurrence.

If a first canary fails after observing an inactive publisher, the runner restores
it to inactive through the same fixed RPC. It records whether restoration was
acknowledged. It preserves published articles and an already-active integration.

## Optional recurring refresh

After inspecting a successful manual canary, set repository Actions variables:

- `ELBOTOLA_CANARY_VERIFIED_RUN_ID=<successful canary run ID>`
- `ELBOTOLA_SCHEDULE_ENABLED=true`

The schedule runs at minute 17 every six hours, sharing the production mutation
lock. Both scheduled and manual refreshes verify the recorded run is a successful
first-attempt owner dispatch with the canary completion marker. They compare
the workflow, executed runner/adapter, source-control migration and package lock
against that canary commit. Unrelated source changes are allowed; executed-code
or dependency changes require a new canary.

Refreshes require the publisher to be active and never activate it themselves.
Set `ELBOTOLA_SCHEDULE_ENABLED=false` to stop recurrence. If source permission
changes, deactivate the publisher using its fixed service RPC. The obsolete
`ELBOTOLA_CANARY_VERIFIED_FUNCTION_VERSION` variable is unused because ingestion
runs directly in the protected job.

## Checks

```bash
bun test scripts/backend/elbotola-recovery.test.ts supabase/functions/_shared/elbotola.test.ts
bun run backend:secrets:check
```
