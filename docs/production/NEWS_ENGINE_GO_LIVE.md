# BotolaGO News Engine — production go-live

Status: **NOT ACTIVATED.** The code and migrations are merge-ready and verified
on staging. Nothing in this package collects, writes or publishes anything in
production until the owner completes the steps in
[Owner activation sequence](#owner-activation-sequence) below.

Target project: BotolaGO Production V2 (`tkewgajrljbwgwedqsxn`)
Verified on: BotolaGO Staging V2 (`srdrflfrfpwixsllveid`)

---

## 1. What this replaces

Production currently holds **108 article editions**, and essentially all of
them are third-party link stubs:

| Publisher                 | Stories | What the reader sees                      |
| ------------------------- | ------- | ----------------------------------------- |
| `elbotola`                | 97      | An ElBotola headline and an outbound link |
| `gnews` source publishers | 11      | A GNews excerpt and an outbound link      |

The ElBotola stubs were produced by `news-elbotola-recovery.yml`, which ran the
link-metadata adapter every six hours. That adapter deliberately never read an
article page: it collected a headline, a timestamp and a URL.

The news engine replaces that model entirely. It reads the article, extracts
the **facts**, and composes an **original BotolaGO article** from the fact set
in Arabic and French. There is no path in the pipeline from a source sentence
to a published sentence — the generator is never shown the source text.

`news-elbotola-recovery.yml` has had its schedule removed and is marked
RETIRED. Its manual trigger is kept as a break-glass path only, and deleting
the file is the last step of this runbook.

> **Do not run the retired workflow and the news engine against ElBotola at the
> same time.** Both write `app_private.news_source_articles` keyed on the same
> `(publisher, external_id)`, and the stub path would overwrite an engine
> article's provenance mapping.

## 2. What ships

### Migrations (5, all additive)

| File                                             | Contents                                                                                                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260922100000_news_engine_core.sql`            | 12 `app_private` tables, 8 enums, RLS enabled and forced on all of them, updated-at triggers                                                          |
| `20260922100100_news_engine_pipeline_api.sql`    | 18 service-role `api` RPCs: run ledger, source claim, discovery, fetch, relevance, entities, facts, clustering, failure inbox                         |
| `20260922100200_news_engine_publication_api.sql` | Generation attempts, the publication contract, unpublish, status and failure read models, source administration                                       |
| `20260922100300_news_engine_seed.sql`            | BotolaGO newsroom publisher, editorial taxonomy (14 terms, AR+FR labels), 13 publication policies, the ElBotola source row (disabled), entity aliases |
| `20260922100400_news_engine_media.sql`           | Hero resolution from BotolaGO-owned catalog media only                                                                                                |

Every new table lives in `app_private` with RLS enabled **and forced** and no
policy, so the only access path is a `security definer` function in `api` that
checks for the service role first. No browser role holds any privilege on any
of them; neither does `service_role` itself.

### Application code

```
src/backend/news-engine/
  contracts.ts            shared types, counters, sanitised failure messages
  normalization/          name/text normalisation, URL canonicalisation, hashes, cluster keys
  sources/ → registry lives in the database, not in code
  discovery/              news sitemap → sitemap → RSS → HTML listing, incremental
  fetch/                  bounded HTTP, rate limiting, retries, ETag, robots.txt
  parsing/                JSON-LD → Open Graph → HTML, plain-text output only
  relevance/              transparent rule set with stored rejection reasons
  extraction/             fact extraction with the claim-status vocabulary
  entities/               alias resolution to the canonical football catalog
  clustering/             deterministic cluster keys, candidate matching, conflict detection
  generation/             independent AR and FR composition from facts
  validation/             originality gate and factual gate
  publishing/ → the publication contract is the `news_engine_publish_article` RPC
  gateway/                the persistence boundary (interface + Supabase implementation)
  llm/                    the model boundary (interface + Anthropic implementation)
  pipeline/               stage orchestration with per-item failure isolation
scripts/backend/news-engine-run.ts   the operational runner
.github/workflows/news-engine.yml    the production scheduler
```

Fantasy is untouched. Nothing in the engine imports a Fantasy module, and
nothing in the engine's SQL references a Fantasy table, type or function. If
the engine is offline, Fantasy is unaffected.

## 3. Owner activation sequence

Each step is reversible and none of them is implied by merging the branch.

### Step 0 — Every switch, and the order to flip them

Nothing below is flipped by merging. Merged and deployed, the engine is inert:
it collects nothing, generates nothing, publishes nothing, and `/news` is not
reachable. Eight things have to change, and the order matters.

| #   | Switch                                                       | Where it lives                                                           | Ships as                       | Flip to                    |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------ | -------------------------- |
| 1   | `SUPABASE_SECRET_KEY`                                        | GitHub → environment `newsroom` → secret                                 | absent                         | the production service key |
| 2   | `SUPABASE_PRODUCTION_URL`, `SUPABASE_PRODUCTION_PROJECT_REF` | GitHub → environment `newsroom` → variables                              | absent                         | see Step 1's table         |
| 3   | `NEWS_ENGINE_SCHEDULED_MODE`                                 | GitHub → environment `newsroom` → variable                               | absent                         | `review-only`              |
| 4   | `article_fetch_approved`                                     | DB row: `app_private.news_engine_sources` where `slug = 'elbotola'`      | `false`                        | `true`                     |
| 5   | `enabled`                                                    | DB row: same row                                                         | `false`                        | `true`                     |
| 6   | _(no switch)_ first run, then editor approval                | `workflow_dispatch` → Admin → News                                       | —                              | —                          |
| 7   | `NEWS_ENABLED`                                               | `src/lib/feature-flags.ts` — **code change + deploy**, not configuration | `false` (arrives with PR #154) | `true`                     |
| 8   | `NEWS_ENGINE_SCHEDULE_ENABLED`                               | GitHub → environment `newsroom` → variable                               | absent                         | `true`                     |

Two more are already correct and need no action: `ANTHROPIC_API_KEY` is present
in the `newsroom` environment, and `VITE_NEWS_DATA_MODE` is already `supabase`
in `.env.production`. `NEWS_ENGINE_MODEL` is optional — unset means
`claude-opus-5`.

**Why this order.**

- **1–3 before anything else.** The runner refuses to start without the service
  key, and a scheduled run with no `NEWS_ENGINE_SCHEDULED_MODE` has no job to
  do. Setting these changes no behaviour on its own.
- **4 before 5.** `article_fetch_approved` is the editorial and terms-of-use
  decision to read article pages rather than only listings; `enabled` is the
  operational decision to collect at all. Approving the read first means that
  when collection starts it is already running the approved shape, and it keeps
  the two decisions separately revocable.
- **6 before 7.** Generated articles land in `in_review`, which is invisible to
  the public whatever `NEWS_ENABLED` says, so the engine can run and editors can
  review while the surface is still hidden. Flipping `NEWS_ENABLED` first would
  ship an empty `/news` to real users. Admin is **not** gated on `NEWS_ENABLED`
  — no `admin.*` route references it — so editors can approve before the flag
  moves. Verified by `git grep NEWS_ENABLED -- src`.
- **7 is a deploy, not a toggle.** `NEWS_ENABLED` is a hardcoded boolean literal
  so the bundler can tree-shake the disabled branches. Changing it means a
  commit and a Lovable publish; there is no runtime override, and no environment
  variable will do it.
- **8 last.** The crons are the only thing that makes the engine run without a
  person. Turn them on once a manual batch has been reviewed end to end and the
  public surface is live, not before.

**Reversing.** Unset `NEWS_ENGINE_SCHEDULE_ENABLED` to stop the crons; set
`enabled = false` on the source to stop collection; set `NEWS_ENABLED = false`
and redeploy to hide the surface. None of these unpublishes anything already
published — see §4.

**Not a switch, deliberately.** `app_private.news_publication_policies.auto_publish`
is `false` for all thirteen event types and stays that way. That is launch mode:
every generated article waits for a person. Step 9b covers turning one on later,
and it is a per-event-type `UPDATE`, never a blanket flip.

### Step 1 — Configure the `newsroom` GitHub environment

The workflow runs under `environment: newsroom`, deliberately separate from
`production-admin-activation`. Add to **that environment**:

| Kind     | Name                              | Value                                                   |
| -------- | --------------------------------- | ------------------------------------------------------- |
| secret   | `ANTHROPIC_API_KEY`               | already present                                         |
| secret   | `SUPABASE_SECRET_KEY`             | the same production service key the other workflows use |
| variable | `SUPABASE_PRODUCTION_URL`         | `https://tkewgajrljbwgwedqsxn.supabase.co`              |
| variable | `SUPABASE_PRODUCTION_PROJECT_REF` | `tkewgajrljbwgwedqsxn`                                  |
| variable | `NEWS_ENGINE_SCHEDULE_ENABLED`    | leave **unset** for now                                 |
| variable | `NEWS_ENGINE_SCHEDULED_MODE`      | `review-only`                                           |
| variable | `NEWS_ENGINE_MODEL`               | optional; defaults to `claude-opus-5`                   |

The workflow refuses to start if the service key or the model key is missing,
if the confirmation string is wrong, or if the project ref and URL do not both
resolve to `tkewgajrljbwgwedqsxn`.

### Step 2 — Apply the migrations to production

Through the repository's existing promotion path
(`phase7e-b-production-migration-promotion.yml`, or `supabase db push --linked`
in a reviewed run). Apply all five, in filename order.

They are additive: no table is dropped, no column is altered, no existing row
is modified except `app.publishers` gaining the `botolago-newsroom` row and
`app.taxonomies` gaining 14 terms.

### Step 3 — Confirm the source is still inert

```sql
select slug, enabled, article_fetch_approved from app_private.news_engine_sources;
```

Expected: `elbotola | false | false`. Both switches are off after migration.
Merging and deploying cannot start collection.

### Step 4 — Re-seed entity aliases against the production catalog

The curated club aliases join `app.teams` on the canonical club `name`, so they
only attach to clubs the catalog already holds. Production has all 21 Botola
clubs, so this should attach on the first apply. Verify, and top up the
catalog-derived aliases:

```sql
-- as service_role
select api.news_engine_reseed_aliases();
select api.news_engine_resolve_entities('team', array['الوداد الرياضي','Wydad AC','WAC'], 'ar');
```

All three spellings must return the same `entityId`. If any returns null, stop:
entity resolution is what keeps News from inventing duplicate clubs.

### Step 5 — Approve article-page reading

Reading an article page needs two independent switches. Turn on the database
one:

```sql
-- as service_role
select api.news_engine_set_source_article_fetch('elbotola', true);
select api.news_engine_set_source_enabled('elbotola', true);
```

**Before you do:** confirm that the permission recorded on 2026-08-03 (see
`docs/backend/ELBOTOLA_INTEGRATION.md`) covers reading article pages for
factual extraction, at the configured cadence, with internal-only retention of
source text. The original permission was recorded for _link metadata and a
remote hero image_. This step is a material widening of it, and it is the one
thing in this runbook that is a legal decision rather than a technical one. If
the permission does not clearly cover it, leave both switches off and contact
`press@elbotola.com` first.

What the engine does and does not do at the source, for that conversation:

- It reads the publisher's own Google News sitemap, published for automated
  consumers, and only article URLs matching an anchored pattern on
  `www.elbotola.com`.
- It obeys `robots.txt` on every request, with no override. ElBotola's current
  file allows `/` and disallows `/api/`, `/user/` and `/search`; article paths
  are allowed.
- It requests at most 12 pages per minute, one source at a time, with
  conditional requests so an unchanged page costs a 304.
- It never bypasses a paywall, CAPTCHA, login, or anti-bot measure, and treats
  401/403/404/410/451 as final answers with no retry.
- It stores source text as internal extraction input and provenance. Source
  text is never returned by any public API and never becomes published copy.
- It never mirrors or hotlinks ElBotola's photography. A declared hero URL is
  recorded in provenance metadata and goes no further.

Note that the approval gate applies in a dry run too. Reading someone's pages
without permission is not made acceptable by discarding the result, so the
fetch stage refuses with `news_engine_article_fetch_not_approved` until this
step is done — which is why it comes before the dry run rather than after it.

### Step 6 — Dry run (no writes)

Actions → **BotolaGO News Engine** → Run workflow:

| Input        | Value             |
| ------------ | ----------------- |
| job          | `incremental`     |
| confirmation | `RUN_NEWS_ENGINE` |
| limit        | `10`              |
| source       | `elbotola`        |
| language     | `ar,fr`           |
| mode         | `dry-run`         |

A dry run performs every read, every fetch, every model call and both quality
gates, and writes nothing — not a source item, not a cluster, not an article,
not even a run row. It holds its batch in memory precisely so the model path
and the gates are exercised rather than skipped.

**This is the step that verifies the Anthropic integration**, which could not
be verified during development (see
[What was verified](#5-what-was-verified-and-how)). Do not skip it.

Read the log's `news_engine_dry_run_extract` and `news_engine_dry_run_generate`
lines: they report the event type, the resolved entity counts, the claim
status, the similarity score and the verdict each article would have received.
If those look right, the pipeline is behaving.

### Step 7 — First controlled batch (25 articles, review only)

| Input        | Value             |
| ------------ | ----------------- |
| job          | `incremental`     |
| confirmation | `RUN_NEWS_ENGINE` |
| limit        | `25`              |
| mode         | `review-only`     |

Everything lands in **`in_review`** with `visibility = 'private'`. Nothing is
publicly visible, and nothing publishes itself — see
[Launch mode](#launch-mode-nothing-publishes-itself) below. Then inspect:

```sql
-- as service_role
select jsonb_pretty(api.news_engine_status(24));
select jsonb_pretty(api.news_engine_open_failures(20));
```

And read the drafts themselves:

```sql
select edition.language, edition.title, edition.slug, edition.status,
       attempt.similarity_score, attempt.verdict, attempt.verdict_reason
from app_private.news_generation_attempts attempt
join app.article_editions edition on edition.id = attempt.article_edition_id
order by attempt.created_at desc limit 20;
```

Check, for a sample of at least five: the article reads as BotolaGO's own
writing; the claim status matches how certain the reporting actually was; club
and player names are the catalog's names; no scoreline appears that no source
gave; the Arabic and French editions are independently written rather than
translations of each other.

Only proceed if that sample is good. If it is not, the fix is the prompt and
the gates, not the volume.

### Step 8 — Batch 2 (100 articles) and batch 3

Same call with `limit: 100`. Re-inspect. Only then consider a larger
`backfill` run with `--since` / `--until`.

### Step 9 — Approve articles one at a time in Admin

<a id="launch-mode-nothing-publishes-itself"></a>

**Launch mode is the shipped default and it needs no configuration.** All
thirteen publication policies ship with `auto_publish = false`, so the engine
cannot publish anything on its own — not in `review-only` mode, not in
`publish` mode, not on a schedule. A pgTAP assertion holds the count of
auto-publishing event types at zero, so turning one on is a visible act rather
than drift.

It is enforced twice, in two different places, on purpose:

1. **In the runner.** `runGenerationAndPublication` only asks to publish when
   the event type's policy allows it, on top of six other conditions.
2. **In the database.** `api.news_engine_publish_article` re-reads the policy
   itself and refuses `p_publish = true` when the policy says no, returning
   `in_review` and `autoPublishWithheld: true`. This is the one that matters
   operationally: the publication contract is reachable by _any_ service-role
   caller — the CLI's `--publish` flag, a future job, a console session — and a
   guarantee that lives only in TypeScript holds only as long as every caller
   remembers it. An event type with no policy row at all resolves to false, so
   the default is closed.

Every generated article lands in `in_review`. Approval is one transition:

```sql
-- the review queue Admin binds to (authenticated editor, not service_role)
select api.editorial_list_stories(p_status => 'in_review', p_limit => 50);

-- one-click approve
select api.editorial_transition_article('<article_edition_id>', 'published');
```

That is the same pair of calls Admin already uses for hand-written articles.
The engine needed no separate approval surface because its output _is_ an
ordinary `app.article_editions` row — same statuses, same search index, same
revision history.

`in_review` rather than `draft` is deliberate:
`api.editorial_transition_article` permits `in_review -> published` but not
`draft -> published`, so an article parked in `draft` would cost an editor two
clicks instead of one.

**In the Admin UI, this is literally one click.** Confirmed in the shipped
code, not assumed:

- `src/routes/admin.news.tsx` lists with `status: filters.status || null`, so
  the default list already includes `in_review`, and the status filter has an
  `in_review` option.
- `src/routes/admin.news.$articleEditionId.tsx` declares
  `in_review: ["draft", "scheduled", "published", "rejected"]` and renders one
  button per allowed next status — so an `in_review` article shows a single
  **Publié / منشور** button (`data-testid="admin-news-transition-published"`)
  that calls `api.editorial_transition_article` directly. No save step first,
  no status dropdown to set.
- That page gates its own visibility on `editorial.read`, not
  `editorial.write`, specifically so a publisher-role account can open it and
  approve.
- No `admin.*` route references `NEWS_ENABLED`, so editors can review and
  approve while the public surface is still hidden (`git grep NEWS_ENABLED -- src`).

### Step 9b — (Later, optional) let some event types publish themselves

Do this only after several batches have been reviewed and accepted, and only
per event type:

```sql
update app_private.news_publication_policies
set auto_publish = true
where event_type = 'match_result';   -- one row, one event type, at a time
```

That one `UPDATE` is genuinely all it takes — there is no second switch and no
deploy. A pgTAP assertion flips a policy row and checks that the same call then
returns `published`, so launch mode is a switch rather than a wall.

Even then, an article auto-publishes only when **all** of these hold:

- its policy row has `auto_publish = true`;
- the runner was invoked with `mode: publish`;
- the strongest claim across the cluster is `official`;
- the cluster has at least the policy's `minimum_source_count` sources;
- no source conflict was detected;
- every entity mention resolved;
- both quality gates returned `passed`.

The reviewed thresholds for each event type are already in the table with a
note saying which are sensible candidates. Transfer rumours, injuries, coach
changes and anything unclassified should never be turned on.

### Step 10 — Enable the schedule

Set `vars.NEWS_ENGINE_SCHEDULE_ENABLED` to `true`. Incremental discovery then
runs at `:07` and `:37` past each hour, and reconciliation on Mondays at 03:20
UTC. Until that variable is `true`, neither cron does anything.

### Step 11 — Retire the old workflow

Once the engine has completed a clean production pass, delete
`.github/workflows/news-elbotola-recovery.yml` and the now-unused
`vars.ELBOTOLA_SCHEDULE_ENABLED` and `vars.ELBOTOLA_CANARY_VERIFIED_RUN_ID`.

## 4. Stop switches

In increasing order of severity, any of these halts the engine:

| Action                                                               | Effect                                       |
| -------------------------------------------------------------------- | -------------------------------------------- |
| `vars.NEWS_ENGINE_SCHEDULE_ENABLED` ← unset                          | both crons stop; manual dispatch still works |
| `vars.NEWS_ENGINE_SCHEDULED_MODE` ← `review-only`                    | scheduled runs stop publishing; drafts only  |
| `select api.news_engine_set_source_article_fetch('elbotola', false)` | no article page is read; discovery continues |
| `select api.news_engine_set_source_enabled('elbotola', false)`       | the source cannot be claimed at all          |
| Remove `ANTHROPIC_API_KEY` from `newsroom`                           | the runner refuses to start                  |

To withdraw an article already published, without destroying provenance:

```sql
select api.news_engine_unpublish_article('<article_edition_id>', 'reason');
```

Nothing here deletes source provenance. Unpublishing sets the edition to
`unpublished`/`private`; the story, its revisions, its extracted facts and its
source mapping all remain for inspection.

## 5. What was verified, and how

### Automated

- **154 tests** across the engine and its runner, in the repository suite.
- **Full existing suite: 1299 passed, 0 failed**, across 158 files — no
  regression in authentication, Fantasy, football, notifications or admin.
- `bun run typecheck` clean. `bun run backend:migrations:check` clean (72
  migrations). `bun run backend:secrets:check` clean.
  `node scripts/backend/check-config-integrity.mjs` clean (37 files).
- `supabase/tests/database/news_engine.test.sql` covers grants, forced RLS on
  all 12 tables, the normaliser's Arabic and Latin folding, service-role
  refusal, discovery idempotency, host and pattern rejection, content-hash
  short-circuit, the claim vocabulary, the publication contract's body and
  entity guards, verdict/gate consistency, and the credential tripwire on the
  failure inbox.

### On staging, against live ElBotola content

- All 5 migrations applied to `srdrflfrfpwixsllveid`.
- **Discovery**: 40 article URLs from ElBotola's per-language news sitemaps,
  after a real `robots.txt` fetch and evaluation.
- **Fetch and parse**: 34 article pages read at the configured rate; all 34
  parsed via **JSON-LD**, yielding title, publication and modification times,
  author, section, language and declared hero URL.
- **Relevance**: on the 14-article Arabic batch, 3 kept and 11 dropped, with
  zero false positives and zero false negatives after one correction. The
  correction is itself worth recording: the first pass kept an Argentina/Messi
  story because "المنتخب الوطني" is what every country's press calls its own
  side, and kept a Spanish-federation story that named Morocco once as a 2030
  co-host. Live copy showed genuinely Moroccan stories mention Morocco seven or
  eight times against that one. Both cases are now regression tests.
- **Quality gates**, run by the production gate code over the real source text:

  | Story                         | Language | Similarity | Originality | Factual | Verdict |
  | ----------------------------- | -------- | ---------- | ----------- | ------- | ------- |
  | Wydad foreign quota           | ar       | 0.138      | passed      | passed  | passed  |
  | Wydad foreign quota           | fr       | 0.000      | passed      | passed  | passed  |
  | El Fouzi commits to Morocco   | ar       | 0.178      | passed      | passed  | passed  |
  | El Fouzi commits to Morocco   | fr       | 0.000      | passed      | passed  | passed  |
  | Enrique on Hakimi (2 sources) | ar       | 0.068      | passed      | passed  | passed  |
  | Enrique on Hakimi (2 sources) | fr       | 0.000      | passed      | passed  | passed  |

  Reject threshold is 0.28, review threshold 0.18.

- **Clustering**: two separate ElBotola articles about the same Enrique press
  conference resolve to one cluster key and therefore one story.
- **Full pipeline through the real staging RPCs**, with that live content: a
  run row, 4 source items discovered, re-discovery reporting 4 duplicates and
  0 new, 4 fetches then a repeat fetch reporting `skipped` on an unchanged
  hash, 4 relevance decisions, 4 fact rows, 3 clusters (the two Enrique items
  sharing one, `created: true` then `created: false`), 6 generation attempts
  all `passed`, and 6 draft editions.
- **Idempotency at the publication contract**: republishing an edition
  unchanged returned `outcome: updated` with the same story id and article id,
  not a second article.
- **Editor publish**: re-calling the same contract with `p_publish = true`
  moved one edition to `published`/`public` in place. (That staging run
  predates launch mode; output now lands in `in_review` and an editor
  publishes it through `api.editorial_transition_article`.)
- **Public read path, as `anon`**: `api.news_feed('ar', 5, …)` returned
  exactly the one published edition — the five drafts did not leak — carrying
  the BotolaGO headline, publisher `BotolaGO` (`botolago-newsroom`), the
  resolved club and competition ids, the localized category
  "البطولة الاحترافية" and the tag "بلاغ رسمي". `api.news_article_detail`
  returned the full body, SEO fields, `Wydad Casablanca`, `Botola Pro` and its
  taxonomies. No source URL, external id, parser version, content hash or
  ingestion field appears anywhere in either payload.
- **Service-role enforcement**: `anon` is refused at the grant layer; a session
  with a non-service role claim is refused by the in-function guard.

### Three limitations of the staging run

None is a code defect; all three are staging data gaps that production does
not have, but they mean these paths were exercised rather than fully proven.

1. **Player resolution returned nothing.** Staging's `app.players` holds 72
   Botola-focused rows and contains neither Achraf Hakimi nor Sofiane El
   Fouzi, both Europe-based. The engine did the right thing — recorded them
   as unresolved rather than inventing a player — so `story_players` stayed
   empty for two of the three stories. Production holds 929 players, so
   re-check this after Step 7's first batch.
2. **No hero media resolved.** Staging has no validated `app.media_assets`, so
   `news_engine_resolve_hero_asset` correctly returned
   `origin: botolago_editorial_graphic` with a null asset. Production has 85
   media assets, including club crests, so a real run should attach one.
3. **One defect was found and fixed here, not in testing.** The engine's tag
   vocabulary was seeded as `taxonomy_type = 'topic'`, but the public card DTO
   builds a card's `tags` from `taxonomy_type = 'tag'`. Tags attached to the
   story and appeared in the article detail, while every feed card rendered
   untagged. Only reading the actual anon-role feed payload caught it. Fixed
   in the seed migration, with a database test pinning both the presence of
   the tag-typed rows and the absence of topic-typed duplicates.

### Not verified here, and why

**The Anthropic calls did not run.** This session had no `ANTHROPIC_API_KEY`,
so `AnthropicNewsModel` was never exercised against the live API. In the
staging run above, fact extraction and article composition were performed by
this session's model following the engine's own prompts and Zod schemas, and
the resulting fact sets and drafts were fed through the engine's real gates,
sanitizer and RPCs.

Everything around the model call is verified. The model call itself is not, and
**Step 5's dry run is what verifies it** — it exercises `AnthropicNewsModel`
end to end and writes nothing. Do not skip it.

## 6. Generated database types — done

`src/backend/generated/database.types.ts` is regenerated and committed, +340
lines covering the new engine RPCs.

This session had no Docker, so `supabase start` — which
`bun run backend:types:generate` needs — could not run locally. CI's
`database-quality` job does have Docker: it spins up a local stack from the
migrations, detects the drift, regenerates, and uploads the result as the
`generated-database-types-<run id>` artifact. The committed file is that
artifact, taken from run `35630237654`, not hand-written.

If the migrations change again and Docker is still unavailable, repeat that:
push, let `database-quality` fail on type drift, download the artifact it
uploaded, commit it. On a machine with Docker the direct route is

```bash
bun run backend:db:start && bun run backend:db:reset && bun run backend:types:generate
```

## 7. Three issues found on the way

None is caused by this branch; all three are recorded so they are not lost.

0. **PR #154's stand-down sweep would have unpublished the whole newsroom.**
   **Found here, fixed in #154.** This branch no longer carries a patch for it.

   `app_private.news_stand_down_machine_editions()` unpublished every published
   edition with `created_by is null`. That column is a foreign key to
   `auth.users` and no person creates an engine article, so the engine leaves it
   null — including after an editor has read the article and clicked publish.
   The function is re-runnable by design, so one later invocation would have
   silently unpublished every approved article.

   The fix is one predicate: `and updated_by is null`.
   `api.editorial_transition_article` stamps `updated_by = auth.uid()` on every
   transition, so an edition a person acted on is excluded — which is what the
   sweep's own comment already promised ("never touches human-authored
   editions"). It is not a behaviour change for the rows the sweep was written
   for: on production all 108 published editions with `created_by is null` also
   have `updated_by is null`, so it still catches every one of them. Verified
   against staging in a rolled-back transaction — the legacy stub is
   unpublished, an editor-approved article stays published, and a second run
   moves nothing.

   This branch carried that patch as a guarded migration while #154 was still
   without it. #154 has since adopted the same predicate verbatim, so the
   duplicate was removed rather than left to re-apply an identical function.

   What stays here is the assertion, in `news_engine.test.sql`: the sweep either
   does not exist or spares editions a person has acted on. It passes on this
   branch alone (the function is not there yet) and after the rebase (it is, and
   it carries the predicate). If #154's predicate is ever reverted, that
   assertion is what fails — the protection the engine depends on is pinned by a
   test rather than by a copy of someone else's migration.

1. **`bun run lint` was already failing on `main`.** One Prettier error in
   `src/routes/fantasy.players.$playerId.tsx:35` (105 characters against a
   `printWidth` of 100). **PR #154 already fixes it** — commit `3f429f4` on
   `chief/launch-fixes-3` is exactly that reformat, and `bunx eslint .` on that
   branch reports 0 errors. No separate fix is needed or wanted: a second PR
   touching the same line would only collide with #154, which merges first.

2. **The pre-existing news ingestion RPCs share a guard that can fail open.**
   `api.news_ingest_provider_article` and its siblings test
   `coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), auth.role()) <> 'service_role'`.
   In a session carrying no JWT at all, `auth.role()` is null, so the
   comparison is null rather than true and the raise is skipped. The engine's
   own guard was written the same way, was caught during staging verification,
   and now uses `is distinct from` with a `''` fallback. Practical impact on
   the pre-existing functions is low — PostgREST always sets a role claim, and
   the EXECUTE grants already restrict them to `postgres` and `service_role` —
   so this is not privilege escalation, but the guard is not doing the work it
   appears to do. The one-line remedy is the same `is distinct from` change.
   Left for the owner because it sits on the live ElBotola and GNews ingestion
   path.

## 8. Adding a second source later

Nothing in the engine is ElBotola-specific. A new source is a row:

```sql
insert into app_private.news_engine_sources (
  slug, name, hostname, publisher_id, source_kind, source_languages,
  discovery_method, discovery_url, article_url_pattern, allowed_media_hosts,
  enabled, article_fetch_approved, access_notes
) values (
  'frmf', 'FRMF', 'www.frmf.ma', <publisher id>, 'federation', array['ar','fr'],
  'rss', 'https://www.frmf.ma/feed', '^https://www\.frmf\.ma/[a-z0-9/-]+$',
  '{}', false, false, '<permission and cadence notes>'
);
```

`source_kind = 'federation'` or `'official_club'` matters: the extractor treats
a federation or club statement as a stronger claim than a publisher's
reporting, which is what lets an official announcement clear the auto-publish
policy that a press report cannot.

The discovery layer already handles news sitemaps, plain sitemaps, sitemap
indexes, RSS, Atom and HTML listings. A source with a genuinely unusual page
structure may need a parser profile; bump `parser_version` when you add one so
already-parsed items can be re-parsed deliberately.
