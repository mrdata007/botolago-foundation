# AI assisted Botola Pro Inwi news

This is an isolated server runner for the existing React/Supabase CMS. It does
not alter human editor permissions or ask for a staff session. The ElBotola
adapter reads at most the newest ten tagged Botola Pro API items in one language
and fetches at most ten article details, with a pause between requests. It uses
the owner reported licensed import's API and HTML to extract candidate facts.
No other outlet is configured: public access alone is not permission to collect
or send its text to a model.

## Current rights boundary

`ELBOTOLA_INTEGRATION.md` covers headline and remote-image metadata; the later
licensed full-text import records an owner-reported licence on
`app.publishers.syndication_license_note`. Neither record shown in this repo
explicitly proves permission to send full text or extracted facts to OpenAI or
Anthropic, or to publish a derivative BotolaGO article. Keep the new
`AI_NEWS_SOURCE_RIGHTS_APPROVED` variable and database
`source_processing_approved` switch and ElBotola source-permission row off until the private agreement is checked
for those uses, retention, model-provider terms, cadence, attribution and
territory. Record the decision outside this repository; never commit the
agreement or a key. Official club/league notices and other sports outlets need
their own approved source adapter and rights record before use.

## Data flow

1. The tagged ElBotola API returns article IDs and publication times. The
   bounded adapter records source URL, outlet, publication and retrieval time,
   and short numbered factual excerpts. It never copies images. The CMS article
   has no image unless a separate rights-approved editor adds one.
2. Selection removes old, repeated ID/URL and highly similar headlines; its
   daily ceiling is configurable and zero is valid. An update to an already
   imported ID is counted as `updatesHeld` for editorial handling, not
   republished as a new story.
3. The selected provider receives numbered facts, not the source article body.
   The model returns structured Arabic or French copy. Deterministic gates check
   required fields, citation IDs per paragraph, numbers/dates, obvious quotes,
   language script, HTML, and seven-word copying. A second model call checks
   every article field against the evidence and holds unsupported claims. The server renders escaped
   paragraphs with links to the original report, then uses the existing
   sanitizer. These checks cannot establish full semantic accuracy, subtle
   paraphrase or professional native-language quality; editors must review
   drafts. A structurally valid article rejected by the second fact-check is
   saved as a private `review_required` draft with reasons; malformed output
   is rejected before CMS storage.
4. A service-role-only RPC saves private CMS drafts with a unique candidate key,
   source facts, model and prompt metadata. Existing revision and audit triggers
   stay in use. Retries return the existing edition. A separate service RPC
   permits publication only if the database auto switch is on, the draft passed
   quality gates, and the rendered article links facts from at least two
   distinct approved reporting outlets. Merely listing a second outlet in
   provenance is insufficient. The
   current ElBotola-only adapter cannot meet that final condition. This is a
   deliberate automatic-publication hold until another permitted, independently
   sourced adapter and its checks are implemented and reviewed. The saved title,
   excerpt, body and SEO fields are fingerprinted; an edited draft is excluded
   from unattended publication. Eligible unchanged drafts
   left private by an interrupted publish attempt are retried on a later run;
   the database marks publication once and records one audit event.

The pipeline runs at execution time; the existing pg_cron scheduled publication
worker continues to handle human-scheduled articles. Generated editions are
never put in `scheduled` status because that worker does not consult the AI
kill switch. The Actions cron is the AI run schedule, gated below.

## Configuration and dry run

Never place secrets in repository files. Use the protected
`production-admin-activation` GitHub environment (or an equivalent private
server secret manager). Required secrets are `SUPABASE_SECRET_KEY` and exactly
one of `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`. Required non-secret variables are
`SUPABASE_PRODUCTION_URL`, `AI_NEWS_PROVIDER` (`openai` or `anthropic`),
`AI_NEWS_MODEL` (an explicitly reviewed model ID), `AI_NEWS_LANGUAGE` (`ar` or
`fr`, default `ar`), `AI_NEWS_DAILY_LIMIT` (0–20, capped by the database),
`AI_NEWS_SOURCE_RIGHTS_APPROVED`, `AI_NEWS_KILL_SWITCH`,
`AI_NEWS_SCHEDULE_ENABLED`, and `AI_NEWS_AUTO_PUBLISH`.

The safe local command uses a clearly labelled synthetic fixture, makes no
network request, incurs no model cost and writes no CMS data:

```bash
AI_NEWS_KILL_SWITCH=false bun scripts/backend/ai-news/run.ts --dry-run --fixture=scripts/backend/ai-news/fixture.synthetic.json
```

After rights review and isolated deployment, a protected manual workflow
dispatch on the reviewed `main` SHA with `confirmation=RUN_AI_NEWS` and
`mode=dry-run` reads the licensed source and calls the selected paid model,
without CMS writes. Check the result counts and model bill before `mode=run`.
The runner's `--run` never accepts a fixture. API failures abort the run;
it does not retry a rate-limited response or hide provider errors. Avoid
running this beside another database writer; the workflow uses the repository's
`botolago-production-v2-mutation` concurrency group.

## Activation, monitoring and rollback

1. Review the licence and model-provider data terms. Confirm the exact
   production migration, source adapter, model, prompt, daily limit, cost cap,
   and protected environment. Keep `AI_NEWS_KILL_SWITCH` unset or `true` until
   then. Review a local database test run and a zero-write dry run.
2. Apply the migration through the existing reviewed release process. In a
   separate approved database change, set `draft_enabled=true` and
   `source_processing_approved=true` on the singleton settings row, and
   `ai_processing_approved=true` on the ElBotola source-permission row. Set
   `AI_NEWS_SOURCE_RIGHTS_APPROVED=true` and `AI_NEWS_KILL_SWITCH=false` in
   the protected environment. Run one owner-dispatched `mode=run` canary and
   inspect the created private draft, links, facts, audit event and provider
   charges. Keep `AI_NEWS_AUTO_PUBLISH=false`.
3. To schedule draft generation, after that canary set
   `AI_NEWS_SCHEDULE_ENABLED=true`. The cron is 43 minutes past every sixth
   hour (UTC). Check Action outcome counts, provider HTTP errors/429s,
   daily-limit errors, draft volume, CMS audit events, token charges and
   sampled Arabic/French quality. A zero-draft day can be healthy.
4. Automatic publication requires a second permitted independent source
   adapter, rights evidence for that source and model processing, a successful
   editorial sampling period, independent factual/language review, and
   production authorization. Add the approved outlet and origin to the private
   source-permission table with `ai_processing_approved=true` and
   `auto_publication_approved=true` (including ElBotola if its permission
   covers unattended publication). Then enable `auto_publish_enabled=true` by a
   reviewed database change and `AI_NEWS_AUTO_PUBLISH=true` in the protected
   environment. Both gates must be true. The current code keeps single-outlet
   drafts private even if both switches are on. Test the two-outlet path in
   staging before production enablement.
5. Roll back immediately by setting `AI_NEWS_KILL_SWITCH=true` and
   `AI_NEWS_SCHEDULE_ENABLED=false`. Disable the DB `draft_enabled` and
   `auto_publish_enabled` switches in a reviewed change. Existing public
   articles are not deleted automatically; a publisher can unpublish them via
   the CMS. Preserve audit and provenance for review.

One execution can request at most ten source details and at most 20 generation
and 20 verification model calls (normally the lower daily cap), with no image storage. Set the
cost ceiling from the selected provider's current pricing and measured token
usage before activating paid calls. No provider pricing or legal rights are
assumed by this document.
