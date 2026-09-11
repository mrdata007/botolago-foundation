# NewsData.io metadata integration

## Decision

BotolaGO may use NewsData.io as a second provider-independent discovery
transport for French and Arabic Moroccan-football news. The integration stores
only attributed metadata, a bounded description excerpt, and an outbound link.
It does not store NewsData.io `content`, copy article bodies, attach provider
images, or infer redistribution rights from the presence of an API field.

NewsData.io currently documents commercial use for its free plan, with delayed
articles and limited daily credits; paid plans add real-time delivery and larger
quotas. The current account plan and terms must be recorded privately before
activation. Rights in the underlying publisher text and images remain separate
from API access, so each canonical item preserves the original publisher and
link rather than republishing full content.

## Data flow

```text
NewsData.io latest endpoint
  -> bounded FR/AR provider payload validation
  -> sports/language/timestamp/URL validation
  -> safe description excerpt + outbound link
  -> service-role-only canonical News RPC
  -> source attribution + idempotent provider mapping
  -> published public News DTO
```

Each invocation performs at most one request for French and one for Arabic,
with at most ten results per language. Provider-marked duplicates are skipped.
Malformed rows are quarantined without retaining raw provider payloads.

## Stored and excluded fields

Stored:

- `article_id` as a provider-scoped external identifier;
- canonical HTTPS `link` with tracking parameters removed;
- title and bounded description;
- French or Arabic language;
- UTC publication timestamp;
- original publisher name and HTTPS source URL;
- content fingerprint, source version and ingestion counters;
- safe outbound `nofollow noopener noreferrer` link.

Explicitly excluded:

- full `content`;
- `image_url`, `source_icon` and all image binaries;
- video, raw payloads, API errors and provider credentials;
- AI summaries, sentiment and other plan-specific enrichment;
- articles not classified as sports news.

## Runtime guards

`news-ingest-newsdata` is isolated from the GNews and ElBotola functions. It
fails closed unless all of these conditions hold:

1. `NEWSDATA_COMMERCIAL_USE_APPROVED=true` exists only in trusted server
   runtime after the current plan and terms are recorded;
2. `NEWSDATA_API_ORIGIN` is exactly `https://newsdata.io`;
3. the NewsData.io API key and shared ingestion trigger satisfy secret guards;
4. the `app.publishers` row for `newsdata` is separately activated;
5. the caller presents both a valid Supabase server credential and the shared
   high-entropy ingestion trigger;
6. response size, language, category, timestamp, URL and article fields pass
   deterministic validation;
7. persistence uses `newsdata-excerpt-v1` through the service-role-only RPC;
8. retries are bounded to transient network, `429`, and `5xx` failures.

The migration creates `newsdata` with `active = false` and
`trust_status = review_required`. Merging or deploying the function cannot
start ingestion.

## Server-only configuration

```text
NEWSDATA_COMMERCIAL_USE_APPROVED=false
NEWSDATA_API_ORIGIN=https://newsdata.io
NEWSDATA_API_KEY=<server-only-newsdata-key>
NEWSDATA_QUERY_FR="Botola Pro" OR "football marocain"
NEWSDATA_QUERY_AR="البطولة الاحترافية" OR "كرة القدم المغربية"
NEWSDATA_PAGE_SIZE=10
NEWSDATA_TIMEOUT_MS=10000
NEWSDATA_MAX_RETRIES=2
NEWS_INGESTION_TRIGGER_SECRET=<minimum-32-character-runtime-secret>
```

No value may use a `VITE_` prefix. NewsData.io documents API-key transport in
the request query, so the adapter never logs, returns, persists, or includes the
outbound request URL in errors. Operational evidence must also remain URL-free.

## Activation sequence

1. Create a NewsData.io account and record the current plan and terms privately.
2. Confirm metadata/link commercial use and attribution requirements.
3. Keep publisher images excluded unless each image right is separately proven.
4. Create a dedicated server-only API key and configure the bounded queries.
5. Deploy the isolated function with no schedule and keep the publisher inactive.
6. Activate the publisher through a reviewed additive production change.
7. Run one manually dispatched, bounded canary and inspect relevance,
   attribution, deduplication, language, links, error handling and quota use.
8. Enable a conservative schedule only in a later reviewed change with a stop
   switch and quota monitoring.

To stop ingestion, remove the approval flag, deactivate the publisher, and do
not invoke the function. Existing attributed canonical stories remain available
and auditable; no destructive rollback is required.
