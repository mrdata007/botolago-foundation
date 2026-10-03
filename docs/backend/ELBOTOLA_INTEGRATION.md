# ElBotola metadata and hero-image integration

> **Superseded for ElBotola.** The news engine
> (`docs/production/NEWS_ENGINE_GO_LIVE.md`) now owns the ElBotola source. It
> extracts facts and composes original BotolaGO articles instead of publishing
> link stubs, and `news-elbotola-recovery.yml` has lost its schedule. Do not
> run the stub path and the engine against ElBotola at the same time: both
> write `app_private.news_source_articles` on the same
> `(publisher, external_id)` key.

## Decision

BotolaGO may use ElBotola as an attributed link-metadata and remote hero-image
source. The BotolaGO owner confirmed on 2026-08-03 that permission is held for
this integration; the underlying evidence must remain in the private legal and
operations record. This integration is deliberately not a full-article scraper.

The public ElBotola terms state that Moroccan and international copyright law
protect the site's content, and the site footer states that all rights are
reserved. As of 2026-08-03, the conventional `/robots.txt`, `/sitemap.xml`,
`/rss`, and `/terms` endpoints returned `404`; the actual terms are published
at <https://www.elbotola.com/contact/terms-and-conditions/>. The publisher's
public submissions/contact page is
<https://www.elbotola.com/contact/publish/> and lists `press@elbotola.com`.

Absence of a robots file is not a content licence. The recorded permission must
cover commercial link aggregation, headline metadata, the intended request
cadence, attribution, and hero-image display. BotolaGO does not infer permission
for full article bodies, galleries, video, or unrelated ElBotola assets.

## What the adapter stores

- ElBotola's stable article URL identifier;
- canonical HTTPS article URL;
- Arabic headline;
- publication timestamp exposed on the public homepage;
- one declared article hero/thumbnail URL from the exact allowlisted ElBotola
  media origin, with title-derived alt text and ElBotola attribution;
- a BotolaGO-authored generic source summary;
- an outbound `nofollow noopener noreferrer` link;
- explicit `ElBotola` publisher attribution;
- source version and content fingerprint for idempotency.

It does **not** store the article body, remote HTML, author biography, user
data, video, gallery media, or remote image binaries. The validated image stays
on ElBotola's media origin; BotolaGO does not copy it into Storage. The adapter
does not visit individual article pages.

## Runtime safety

`news-ingest-elbotola` is isolated from the existing GNews function and has no
production schedule. It fails closed unless all of these conditions hold:

1. `ELBOTOLA_SYNDICATION_APPROVED=true` is present only in the trusted server
   runtime after approval is archived;
2. `ELBOTOLA_ORIGIN` is exactly `https://www.elbotola.com`;
3. the dedicated ElBotola ingestion trigger is valid;
4. the `app.publishers` row for `elbotola` is separately activated by a
   reviewed production database change;
5. a current `robots.txt`, when present, does not disallow the homepage;
6. the response is bounded HTML from the allowlisted origin;
7. database validation confirms Arabic language, exact publisher identity,
   exact source origin, exact article URL shape, safe link-only HTML, and the
   `elbotola-link-v1` sanitizer contract;
8. hero URLs use HTTPS, contain no credentials or query parameters, match the
   exact ElBotola article-media path, and resolve only from
   `images.elbotola.com` or `images2.elbotola.com`.

The migration intentionally creates the publisher with `active = false` and
`trust_status = review_required`. The permission is recorded, but merging or
deploying this code still cannot begin collection.

## Server-only configuration

```text
ELBOTOLA_SYNDICATION_APPROVED=false
ELBOTOLA_ORIGIN=https://www.elbotola.com
ELBOTOLA_PAGE_SIZE=10
ELBOTOLA_TIMEOUT_MS=10000
ELBOTOLA_MAX_RETRIES=1
ELBOTOLA_INGESTION_TRIGGER_SECRET=<runtime-secret>
```

No value may use a `VITE_` prefix. The approval flag is not a substitute for
the inactive database publisher guard.

The guarded canary and opt-in refresh procedure is documented in
`ELBOTOLA_RECOVERY_RUNBOOK.md`. It runs this adapter directly in a protected Bun
job with a process-only trigger, leaving Edge Functions and shared GNews and
football runtime configuration unchanged.

## Approval and activation sequence

1. Retain the existing permission evidence in the private legal record; never
   commit it or credentials to the repository.
2. Confirm the permission still covers the approved fields, cadence,
   attribution wording, retention, and remote hero-image display.
3. Re-check the current terms and `robots.txt`.
4. Review the exact production function SHA and migration state.
5. Set the server-only approval flag but keep the publisher inactive.
6. Deploy the isolated function with no schedule.
7. Activate the publisher in a reviewed, reversible production change.
8. Run one bounded manual canary and inspect attribution, deduplication, and
   outbound links.
9. Add a schedule only in a later reviewed change, with a conservative cadence
   and a documented stop switch.

If permission is revoked, expires, or becomes ambiguous, leave the publisher
inactive, remove the approval flag, and do not invoke the function. Existing
remote images can be detached without deleting canonical article history.
