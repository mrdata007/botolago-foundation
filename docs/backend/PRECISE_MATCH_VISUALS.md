# Private match visual workflow

Owner scope: import original match photos, edit selected watermark areas, add
BotolaGO branding, and **hold everything in Admin**. Do not post the results.

## What is implemented

Admin → Stories has a separate private queue. An editor imports a PNG/JPG/WebP
photo, its original Instagram/Elbotola post link, a review title, and optional
canonical fixture/story IDs. Each imported image starts `held` with
`rightsStatus = unverified`. Source association is private metadata; it never
assigns an article hero or public story.

Admin previews are signed URLs valid for 60 seconds, renewed while the reviewer
is present. Original and result files live in the **private**
`match-visual-drafts` bucket. There are no browser Storage policies. Ordinary
accounts cannot list drafts or obtain previews. Editorial read/write permission
and the existing MFA staff context protect the API and every database operation.
Discarding hides the record and prevents outstanding callbacks from completing;
it does not immediately erase the private audit/source archive. A previously
issued preview link can remain usable for its remaining lifetime.

An editor selects one small rectangle covering the publisher watermark and
uses the existing official BotolaGO logo, or uploads an exact transparent PNG
logo as an override. The brand is rendered deterministically from the app’s
vector paths; the image model never draws its lettering. Rectangle coordinates are in source
pixels, from the upper-left corner, including in Arabic RTL. The rectangle is
limited to 25% of the image. Faces, kits, club crests, scores and lettering must
remain outside that area. There is no claim that text or faces **inside the
editable rectangle** can stay identical while that area is being reconstructed.

The server sends the original PNG and transparent edit mask to OpenAI's image
**edit** endpoint, using the existing `OpenAI_Image_Gen` server secret. It does
not generate a replacement photograph. The model defaults to the existing
image worker's `gpt-image-2.5-flare`, with optional server-only
`MATCH_VISUAL_EDIT_MODEL` override. Model availability and a real paid edit must
be checked in the deployment environment; no live provider call was run here.

After the provider responds, the compositor copies every source RGBA pixel
outside the selected area back **byte for byte**, even if the provider ignored
its mask and redrew the whole photo. Inside the selected area, it blends the
exact branding logo over the returned background. Logo pixels outside the
rectangle are rejected. The final file is lossless PNG at the original natural
size. Source images are never resized or cropped during import. JPG/WebP are
decoded in the browser and pinned as PNG; exactness refers to that decoded,
normalized source raster, rather than the original compressed file bytes.
Images are capped at 10 MiB and 1536 px per side.

States: `held → processing → held` or `failed`. Failures allow retry, up to three
attempts per draft and six starts per UTC day globally. Edit starts are serialized
for that budget. Each attempt has a UUID and ten-minute lease. Stale, expired,
discarded and duplicate callbacks cannot overwrite a result. A lost completion
response preserves the possibly committed private result for inspection. Retrying
starts from the immutable original, rather than editing a previous result.

There is **no publication state, publish RPC, Publish control, social publishing
credential, public media asset, or public story/article write** in this workflow.
Existing Home Stories editing and automation remain a separate feature. This
branch restores the previously proposed public match-publication path to the
upstream implementation; the new workflow does not use that path.

## Optional scheduled source collector

`match-visual-collect` verifies the existing `BOTOLAGO_SCHEDULER_TOKEN` before
any database call, reads a configured HTTPS feed, and imports at most six
originals per pass. Its database switch is **off by default**. A ten-minute cron
tick exists but does nothing until an owner explicitly enables that switch.
The collector rechecks it before each import; the database enforces the switch,
36 new collected sources per UTC day, and lifetime URL/pixel-hash deduplication,
including previously discarded posts. It does not create any image edits or
public content automatically. Set `MATCH_VISUAL_FEED_URL` on the Edge worker
and, if the feed requires a bearer credential, `MATCH_VISUAL_FEED_TOKEN`. Neither
is configured here. After the reviewed deployment and feed check, the database
owner can enable or pause collection with:

```sql
select app_private.match_visual_collection_configure(true); -- collect into holds
select app_private.match_visual_collection_configure(false); -- pause imports
```

Its scheduler uses the existing configured functions base URL and scheduler
secret. No production cron or switch was changed in this task.

## Optional manual source-feed adapter

`collect-match-visual-drafts.ts` supports importing batches from a configured
feed for `elbotola` and `thebotolapro`. It does not scrape Instagram from just
an account name. Feed/API access is not configured in this checkout; monitoring
is disabled. Manual Admin import is independent of the collector.

Configure server/job environment (never browser variables):

- `MATCH_VISUAL_FEED_URL`: HTTPS endpoint producing the JSON below.
- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`: deployment connection.
- `MATCH_VISUAL_EDITOR_TOKEN`: current MFA-authenticated staff access token
  with editorial read/write access. Expired/revoked tokens fail closed.

A batch contains at most six records. The configured feed is a trusted source
adapter, and must return original PNGs with their actual post links, preserving
provenance; the script never fetches arbitrary image URLs supplied by posts.
It does not analyze or obey captions as instructions.

```json
[
  {
    "account": "thebotolapro",
    "sourceUrl": "https://www.instagram.com/p/POST_ID/",
    "label": "FUS – Raja · Full time",
    "pngBase64": "BASE64_PNG_BYTES",
    "fixtureId": "OPTIONAL_CANONICAL_UUID",
    "storyId": "OPTIONAL_CANONICAL_UUID"
  }
]
```

Remove optional fields when unknown. Run:

```sh
bun scripts/editorial/collect-match-visual-drafts.ts
```

The adapter normalizes PNG encoding, deduplicates URL/pixel-hash pairs against the
latest 100 private records, imports new sources as held originals, and prints
only aggregate results. Database uniqueness is the final duplicate guard.
Scheduling this command requires arranging the source feed and a suitable staff
session; nothing is scheduled or activated automatically. Cleanup/branding
requires an editor to choose the region and review the branding. Public
availability is recorded as source provenance, not as verified reuse rights.

## Deployment and checks

Migration: `20261014044713_precise_match_visuals.sql`; Edge Functions:
`match-visual-drafts` and `match-visual-collect`. The migration was confirmed absent from production and
staging history before replacing the earlier unapplied publication proposal.
No remote database/storage changes or Edge deployment were performed.
Deploy through the repository's reviewed migration/Edge release process. Reuse
the existing `OpenAI_Image_Gen` secret; never copy it into client code or commit
it. `verify_jwt=false` lets opaque Supabase API keys pass the gateway; the handler
validates the user's JWT via `getUser`, MFA staff context and user-scoped RPCs
before writing or spending credits.

Validation:

```sh
bun test supabase/functions/_shared/precise-match-visual.test.ts \
  supabase/functions/_shared/home-story-generate.test.ts \
  src/backend/match-visual-drafts/repository.test.ts \
  supabase/functions/_shared/match-visual-collect.test.ts
bun run typecheck
bun run backend:migrations:check
bun run backend:secrets:check
bun run config:integrity:check
```

`supabase/tests/database/precise_match_visuals.test.sql` checks private access
and held completion, failures, stale/expired/duplicate callbacks, cancellation,
and unchanged public stories/media/heroes. It must run in full Supabase CI.
Local supplementary validation compiled the real migration and executed those
scenarios in embedded PostgreSQL with a minimal supporting schema and stubbed
staff authorization; this does not replace full database-quality CI or a live
provider/storage smoke test. RPC type additions use compiled PostgreSQL metadata;
full generated-schema parity also awaits Supabase CI.

The Admin screenshot harness uses fixture data and real components/CSS. Browser
checks cover French/Arabic RTL, 390px/1440px, import/edit/hold/discard flows,
read-only access, and absence of public controls in the new queue. It is not a
live authenticated Supabase end-to-end test.

Reproduce the fixture browser checks with
`E2E_CHROMIUM_PATH=/path/to/chromium node tests/visual-drafts/run.mjs` (omit the
variable to use Playwright’s installed browser). This starts an isolated server
on port 4390 and writes screenshots and results under
`test-results/match-visual-drafts/`.
