# ElBotola link-metadata integration

## Decision

BotolaGO may use ElBotola only as an attributed link-metadata source after
written syndication/reuse approval. This integration is deliberately not a
full-article scraper.

The public ElBotola terms state that Moroccan and international copyright law
protect the site's content, and the site footer states that all rights are
reserved. As of 2026-08-03, the conventional `/robots.txt`, `/sitemap.xml`,
`/rss`, and `/terms` endpoints returned `404`; the actual terms are published
at <https://www.elbotola.com/contact/terms-and-conditions/>. The publisher's
public submissions/contact page is
<https://www.elbotola.com/contact/publish/> and lists `press@elbotola.com`.

Absence of a robots file is not a content licence. Production activation
therefore requires written permission covering commercial link aggregation,
headline metadata, the intended request cadence, attribution, and any image
use. Image reuse is not implemented by this change.

## What the adapter stores

- ElBotola's stable article URL identifier;
- canonical HTTPS article URL;
- Arabic headline;
- publication timestamp exposed on the public homepage;
- a BotolaGO-authored generic source summary;
- an outbound `nofollow noopener noreferrer` link;
- explicit `ElBotola` publisher attribution;
- source version and content fingerprint for idempotency.

It does **not** store the article body, remote HTML, author biography, user
data, video, gallery media, or remote image binaries. It does not visit the
individual article pages.

## Runtime safety

`news-ingest-elbotola` is isolated from the existing GNews function and has no
production schedule. It fails closed unless all of these conditions hold:

1. `ELBOTOLA_SYNDICATION_APPROVED=true` is present only in the trusted server
   runtime after approval is archived;
2. `ELBOTOLA_ORIGIN` is exactly `https://www.elbotola.com`;
3. the shared ingestion trigger is valid;
4. the `app.publishers` row for `elbotola` is separately activated by a
   reviewed production database change;
5. a current `robots.txt`, when present, does not disallow the homepage;
6. the response is bounded HTML from the allowlisted origin;
7. database validation confirms Arabic language, exact publisher identity,
   exact source origin, exact article URL shape, safe link-only HTML, and the
   `elbotola-link-v1` sanitizer contract.

The migration intentionally creates the publisher with `active = false` and
`trust_status = review_required`. Merging or deploying this code cannot begin
collection.

## Server-only configuration

```text
ELBOTOLA_SYNDICATION_APPROVED=false
ELBOTOLA_ORIGIN=https://www.elbotola.com
ELBOTOLA_PAGE_SIZE=10
ELBOTOLA_TIMEOUT_MS=10000
ELBOTOLA_MAX_RETRIES=1
NEWS_INGESTION_TRIGGER_SECRET=<runtime-secret>
```

No value may use a `VITE_` prefix. The approval flag is not a substitute for
the inactive database publisher guard.

## Approval and activation sequence

1. Obtain and archive written permission from ElBotola.
2. Confirm permitted fields, cadence, attribution wording, retention, and
   image rights. Keep images disabled unless rights are explicit.
3. Re-check the current terms and `robots.txt`.
4. Review the exact production function SHA and migration state.
5. Set the server-only approval flag but keep the publisher inactive.
6. Deploy the isolated function with no schedule.
7. Activate the publisher in a reviewed, reversible production change.
8. Run one bounded manual canary and inspect attribution, deduplication, and
   outbound links.
9. Add a schedule only in a later reviewed change, with a conservative cadence
   and a documented stop switch.

If permission is denied, expires, or becomes ambiguous, leave the publisher
inactive, remove the approval flag, and do not invoke the function.
