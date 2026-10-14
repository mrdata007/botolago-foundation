# Precise match artwork

The owner supplied three `thebotolapro` references: two real action photographs
with a full-time score panel, and a dramatic match-preview poster. The requested
destinations are Home Stories and match-article covers. Faces, kits, crests,
scores **and lettering** must be the same. BotolaGO's branding may change.

## What the implementation guarantees

Match artwork has a separate protected-pixel path. It never asks an image model
to reconstruct a player, shirt, crest, score or font. At each final canvas size
the operator supplies an approved opaque source PNG, an RGBA protection mask,
and an RGBA BotolaGO branding layer. Every pixel with mask alpha 255 is copied
unchanged. Branding with any nonzero alpha on a protected pixel is rejected.
The mask is binary (alpha 0 or 255) and must protect something; branding must
change something. There is no resizing, cropping, lossy encoding or filtering
of protected areas inside the worker. Output is lossless sRGB PNG.

The source canvas must already contain the correct real photograph, kits,
official crests, score/scorer panel and lettering at its final size. The mask
must include their entire regions, including antialiased text edges. This
preserves exact typography without guessing the publisher's font. The two
canvases require separately reviewed compositions; a portrait is not simply
cropped into a landscape. The worker verifies dimensions and source hashes.

This guarantee is relative to the reviewed source and mask. The software cannot
prove that a mask actually covers every face or that a photograph depicts the
named player. An owner must verify both source canvases and masks first. Approval
records include faces, kits, crests, scores, lettering, derivative-use rights
and BotolaGO branding. Public visibility alone does not establish reuse rights.
The existing ElBotola remote hero-image permission does not by itself authorize
copying or rebranding social-media artwork.

The existing `OpenAI_Image_Gen` secret and provider setup remain in use for
non-match illustrations. Protected match rendering makes no OpenAI request and
spends no image-generation credits. Generated effects can be prepared for
unprotected areas, but must pass the same branding/mask overlap check.

## Preparing real assets

Obtain approved original-resolution photographs/artwork and actual crest/font
assets. Instagram screenshots establish the visual benchmark; the phone UI,
compression, cropped source and uncertain match date make them unsuitable as
automatically approved production assets.

Prepare six non-interlaced, 8-bit sRGB PNGs (RGB or RGBA; no palette, animation,
ICC profile or non-sRGB gamma):

| Variant    | Dimensions  | Files                                                                  |
| ---------- | ----------- | ---------------------------------------------------------------------- |
| Home Story | 1024 × 1536 | `story-source.png`, `story-protection.png`, `story-branding.png`       |
| Article    | 1536 × 1024 | `article-source.png`, `article-protection.png`, `article-branding.png` |

Each file must be at most 10 MiB. The source is opaque; the other layers use
transparency. Changing/replacing source-publisher branding needs an unprotected
region and an approved replacement layer; team crests and required lettering
remain protected. No face, shirt, crest or text may be painted over.

Export the fixture facts with the owner-only
`app_private.precise_match_facts(fixture_id)`. It contains home/away identities,
scores, status, kickoff, venue and ordered goal events, including scorer names,
minutes, added time and own-goal/penalty classifications. The owner compares
those facts with the source lettering. Finished results require an exact
score; upcoming previews must match the scheduled fixture.

Put `approval.json` beside the six files. It contains `version: 1`, `fixtureId`,
the canonical `facts` object, `referenceUrl`, `approvedAt`, `rightsUntil`,
the factual photo `credit`, and `approval` with all seven reviewed flags above
set to true. Do not mark approval flags based on model confidence alone.

```sh
bun scripts/editorial/prepare-precise-match-visual.ts /path/to/approved-inputs /path/to/new-review-output
```

This local command validates and renders both sizes, then writes previews,
content-addressed source assets and `manifest.json`. It makes no network or
database call and does not upload or approve anything. Review the previews,
upload the six immutable assets at the manifest's exact `news-media` paths,
then register the manifest through the guarded owner-only function. Files must
not be overwritten; a new image needs a new hash/path and approval.

## Publication and freshness

Migration `20261014044713_precise_match_visuals.sql` adds a private approval
registry. Browsers and service workers cannot approve or directly edit it.
`register_precise_match_visual(story_id, manifest)` requires paused, drained
image automation and checks the fixture snapshot, rights dates, flags and
presence of all six Storage objects. Registration must follow the repository's
one-writer rule and owner-run production-write policy.

Claims skip unapproved, expired, revoked or outdated match sources before
reserving an attempt. Other news keeps its current path. A stale/old worker
cannot publish a generic model image for a precise match job.

A changed owner-approved manifest queues replacement of an active published
predecessor. An identical registration queues nothing; a manually unpublished
predecessor remains suppressed. Match retries are capped at two per approved
manifest, with the existing global daily attempt cap still enforced. This lets
an explicitly reviewed correction replace an older image without granting
unlimited automatic retries or changing the non-match budget.

The updated worker uploads both validated artifacts, then calls
`service_complete_precise_home_story`. The transaction rechecks the approval,
fixture facts, lease, publication switch, bilingual source visibility and manual
suppression. It publishes the portrait Home Story and assigns the landscape
hero to the exact French/Arabic source editions atomically. A manually changed
hero after the claim cancels publication rather than overwriting that edit.
Completions are idempotent. Failure before publication cleans up successfully
uploaded partial artifacts; an ambiguous publication response retains both
possibly live objects for operator review.

Corrected facts, changed/revoked approval or expired rights hide the generated
landscape media on subsequent News reads, allowing the existing article fallback
to render. Home has its existing 72-hour limit. Article covers remain available
in the archive beyond 72 hours while their facts, rights and source editions
remain valid. Existing reader/CDN caching determines when a new read is observed.
Manual hero replacements have no generated-job binding and are unaffected.

## Rollout and current limitations

No production assets, data, secrets or switches are changed by this code change.
Before applying the migration, record the current image switch/cap, pause image
automation and drain the dispatched workers using `AGENTS.md`. Rehearse the
reviewed migration through the existing migration runbook, then deploy the
worker with its new shared dependency while automation remains paused. Supply
and register the approved assets before restoring the recorded switch/cap.
Existing unverified match illustrations are excluded by the new visibility
guard; their rows and objects remain intact for review. The public UI and app
branding files are unchanged. Public AI/provider notices are not added; factual
photo credits and private renderer/source provenance are retained.

This change is the precise rendering/publication foundation. It does **not**
claim to monitor Instagram accounts, automatically obtain original assets,
create reviewed masks, or prove photographic identity. Automatic collection
from `thebotolapro`/ElBotola still needs a supported authorized feed/API and
source-use permissions; these are separate from the existing OpenAI key.
Until those inputs exist, unapproved match sources stay out of the pipeline.

## Verification

`precise-match-visual.test.ts` independently decodes both outputs with Sharp and
compares every protected channel with the source. It covers overlap, hashes,
malformed PNGs, rights expiry, missing approvals and no model fallback; worker
tests cover dual uploads, cancellation, partial failure and ambiguous commit.
`precise_match_visuals.test.sql` exercises actual private approval, fixture
checks, claim eligibility, atomic bilingual publication, correction/revocation,
manual covers, idempotency and pause in an isolated transaction. Existing Home
Story tests verify that the non-match path retains its guards.
