# News and Editorial operations runbook

> Automated ingestion has moved to the news engine; see
> `docs/production/NEWS_ENGINE_GO_LIVE.md`. The editorial workflow, roles and
> read models described below are unchanged and still apply to engine output,
> because generated articles use the same `app.article_editions` model as
> hand-written ones.

ElBotola metadata and hero-image discovery is documented separately in
`ELBOTOLA_INTEGRATION.md`. BotolaGO's owner confirmed metadata/link and remote
hero-image permission on 2026-08-03. It remains database-disabled,
runtime-disabled, and unscheduled by default; retain the permission evidence
privately and revalidate scope before activation.

This runbook covers BotolaGO Production V2 Phase 4. It does not authorize production deployment, production cron activation, or an Admin CMS UI.

## Runtime modes

The browser uses `VITE_NEWS_DATA_MODE`:

- `mock`: deterministic preview and test repository.
- `supabase`: controlled V2 `api` RPCs.

Development defaults to mock only when the variable is absent. Production fails closed when it is absent or invalid. A Supabase error never falls back to local or fake articles. Saved articles are device-local only in explicit mock mode; Supabase mode uses the authenticated ownership-safe relation.

## Provider status

`NEWS_PROVIDER=fixture` is the only Phase 4 adapter. It validates pagination and normalization but is not a live integration. Canonical provider persistence remains deliberately disabled in `SupabaseNewsIngestionGateway` until a source contract, redistribution rights, deduplication policy, and staging samples are approved.

Provider selection must evaluate Moroccan-football coverage, French/Arabic metadata, canonical URLs, correction semantics, quotas, full-text reuse rights, image rights, attribution, source availability, and deletion obligations.

## Editorial workflow

The lifecycle is:

```text
draft → in_review → scheduled|published|rejected
scheduled → draft|published|unpublished
published → unpublished|archived
unpublished → draft|published|archived
rejected|archived → draft
```

- Editors create and revise drafts.
- Publishers schedule, publish, unpublish, archive, and place content.
- Admins may soft-delete stories.
- Trusted ingestion uses only `service_role` RPCs.
- Browser roles never write canonical tables directly.
- Material edits create immutable revision snapshots. Sensitive actions create append-only audit events.
- Optimistic edit concurrency is enforced with `expected_updated_at`.
- Overlapping global/team/competition/country lead windows are serialized and rejected.

## Sanitization boundary

All Markdown rendering or rich-text output must pass through `sanitizeEditorialHtml` on a trusted server before an editorial or ingestion RPC receives `body_html`. The allowlist blocks executable tags, event handlers, unsafe schemes, protocol-relative URLs, and uncontrolled attributes. Links receive `nofollow noopener noreferrer`; images are HTTPS-only and lazy-loaded.

The database adds a defense-in-depth constraint against scripts, event handlers, and JavaScript/data-HTML schemes. The frontend renders only the stored sanitized HTML. Never accept client claims that content has already been sanitized.

When the pinned sanitizer changes:

1. Review upstream security notes.
2. Add regression fixtures.
3. Re-sanitize existing editions in bounded batches.
4. Update `sanitizer_version` only after successful output validation.
5. Retain revisions and a migration audit event.

## Search and localization

- A story is language-neutral; each French or Arabic edition is a separate row linked to the same story.
- Production publication has no language fallback. Missing Arabic content is an explicit empty/not-found state, never hidden French substitution.
- French search uses PostgreSQL's French dictionary.
- Arabic search normalizes common alef/ya/hamza variants and diacritics, then uses `simple` tokenization.
- Weighted vectors prioritize title, summary, taxonomy, football entities, author, and publisher over body text.
- Search documents are derived and refresh when an edition or story relationship changes.

If source/author/taxonomy labels are bulk-renamed, run the reviewed search-refresh operation for affected stories before considering the change complete.

## Ingestion and quarantine

Jobs are bounded, paginated, resumable, retry-budgeted, and partial-failure-aware. Every run stores a correlation ID, cursor, counts, status, stable error code, and sanitized summary. Rejections store only external ID and safe validation metadata. Raw payloads, access tokens, credentials, authorization headers, and database secrets are prohibited.

Provider outage procedure:

1. Stop wide sync creation and preserve the last cursor.
2. Serve the last published canonical content.
3. Respect `429` retry hints; use bounded exponential backoff and jitter.
4. Quarantine malformed records without retrying them indefinitely.
5. Resume from the checkpoint after the provider recovers.
6. Never publish a provider item merely because normalization partially succeeded.

No production schedule is active in Phase 4.

## Sitemap

`/sitemap.xml` lists the public editions from `api.news_sitemap_entries`,
which serves a snapshot rather than computing the archive on each request
(migration `20260926003050`). Computing it per request timed out in
production on 2026-09-25 and turned the whole sitemap into a 503; the
set-based hotfix (`20260925100000`) made the computation fast again, and the
snapshot keeps one slow minute from reaching visitors.

- The pg_cron job `news-sitemap-refresh` recomputes the entries every minute
  (set-based, ~0.2 s for ~16,000 editions) and swaps
  `app_private.news_sitemap_snapshot` in one transaction. The payload is
  rewritten only when it changed. A failed refresh raises: the previous
  snapshot stays, the failure is in `cron.job_run_details`, and the ops
  health `cron_jobs` check reports it.
- Freshness: the database serves the snapshot while it is at most 120 seconds
  old. After that (job paused, failing or gone) it computes the entries live
  on every request, as before the snapshot, so an unpublished article never
  stays listed because the job stopped. The route lets shared caches keep the
  XML for three more minutes. So an unpublished article is gone, and a new
  one listed, within five minutes. If the live computation itself fails, the
  route answers 503 and a cache honouring `stale-if-error` serves its last
  good copy.
- Health: the ops check `news_sitemap` warns when the snapshot is more than
  120 seconds old or a refresh took 1.5 s or more (the live fallback has 3 s),
  and fails, which pages, when it is missing or more than 10 minutes old
  ([ALERTS.md](../operations/ALERTS.md)).
- State: `select entry_count, computed_at, changed_at, compute_ms from app_private.news_sitemap_snapshot;`
  Why the job is not refreshing:
  `select status, return_message, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'news-sitemap-refresh') order by start_time desc limit 5;`
  and `select jobname, active from cron.job where jobname like 'news-sitemap%';`
- Refresh now (waits for a running refresh): `select app_private.news_sitemap_refresh(true);`
- Pause both jobs for a write that touches the snapshot table or
  `cron.job_run_details` ([AGENTS.md](../../AGENTS.md)):
  `select cron.alter_job((select jobid from cron.job where jobname = 'news-sitemap-refresh'), active := false);`
  `select cron.alter_job((select jobid from cron.job where jobname = 'news-sitemap-refresh-history-prune'), active := false);`
  Resume both with `active := true`. From two minutes into a pause the
  sitemap is computed on every request; the health check pages after ten.
- Production: apply it with the guarded script
  [`apply-20260926003050-news-sitemap-snapshot.sql`](../../scripts/backend/apply-20260926003050-news-sitemap-snapshot.sql)
  (rehearsal first, then `commit;`). Until then production runs
  `20260925100000` alone and computes the sitemap on every request.
- One sitemap file holds at most 50,000 URLs. The snapshot keeps the newest
  50,000 editions. Past about 49,990 public editions the sitemap needs to
  become a sitemap index.

## Media and licensing

The `news-media` bucket is public-read and trusted-server/editorial-write only. There are no browser upload policies. Canonical media records support source or storage location, dimensions, MIME type, alt text, caption, credit, copyright owner, license, and attribution URL.

Do not copy third-party images into Storage until redistribution rights are documented. Keep remote media as validated HTTPS references when copying is not licensed. ElBotola hero images use this remote-reference path under the separately documented permission and strict host/path allowlist. Never proxy credentials in media URLs. UI gradient fallbacks remain valid when an asset is unavailable.

## Retention

- Editorial audit events: 400 days online, then reviewed archive; never mutate in place.
- Article revisions: retain for the life of the story unless legal policy requires a controlled purge.
- Ingestion runs and rejections: 90 days online, then aggregate/archive.
- Soft-deleted stories: excluded from all public RPCs and retained until a reviewed privacy/legal retention job applies.

No retention cron is activated in Phase 4.

## Validation commands

```bash
bun run backend:migrations:check
bun run backend:secrets:check
bun run backend:db:start
bun run backend:db:reset
bun run backend:db:test
bun run backend:db:lint
bun run backend:types:check
bun run typecheck
bun run test
bun run lint
bun run build
```

Run remote migrations only against the approved V2 staging project after confirming the project ref. Production V2 and the legacy project must remain untouched until a separate reviewed deployment phase.

## Rollback

1. Set `VITE_NEWS_DATA_MODE=mock` in a reviewed staging build to stop V2 News reads and saved mutations.
2. Stop ingestion invocations; no production schedule exists.
3. Revert the application commit to restore prior preview behavior.
4. Keep additive tables dormant. Do not run destructive down SQL on a shared database.
5. If disposable staging must be restored before real content exists, recreate staging from the last reviewed migration set.
6. After content exists, export canonical stories, editions, revisions, mappings, placements, and saves before any environment recreation; prefer a reviewed forward fix.
