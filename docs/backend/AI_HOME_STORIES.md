# Automatic news image stories

The public editorial rule forbids AI authorship/generation notices and AI provider
credits on image pixels, captions, badges, watermarks and alt text in every
language. Both generation prompts use `PUBLIC_EDITORIAL_RULE`. Generated image
alt text describes the illustration without naming the technology; provider/model
provenance remains in private jobs and audit records.

The owner requested automatic generation/publication and configured the Supabase
Edge secret `OpenAI_Image_Gen`. It is used only by `home-story-generate`;
no key is copied to the browser or repository. Existing text generation is separate.

Every ten minutes, at minutes 4/14/24/34/44/54, the authenticated scheduler claims
one of the newest news stories published in both French and Arabic within 72 hours.
It copies the two exact headlines, generates a portrait conceptual illustration,
stores the PNG in `news-media`, and publishes the Home story in one SQL transaction.
The viewer overlays the localized headline as accessible text; the model is told
not to draw text or fabricate a documentary image of the event. It shows no AI/provider wording. Source publisher metadata stays private, consistent
with the news pages. Neither the circles nor the viewer navigate to sections.
Empty public feeds render no rail. Admin keeps manual uploads and unpublishing.

Default model: `gpt-image-2.5-flare`, medium quality, 1024×1536 PNG. Override only
with the server secret `AI_STORY_IMAGE_MODEL` if needed. The request timeout is
110 seconds; `EdgeRuntime.waitUntil` holds the bounded task after returning 202
so pg_net's 60-second request timeout does not interrupt the response.

Database claims serialize on the settings row: one outstanding generation, six
attempts per UTC day (failures count), two attempts per source, ten-minute leases.
Publication rechecks pause/lease/source visibility and image storage. A withdrawn
or changed source is excluded from the public feed, even after generation. Manual
unpublication is respected permanently; the published job prevents regeneration.
The public rail contains up to twelve stories. Older generated stories leave it
when their source is older than 72 hours. Records/media remain available to Admin.

Failures retain only a safe code, never provider response text or credentials.
An explicit publication cancellation removes the uploaded image. If a publish
response is lost, the worker preserves the image because the transaction may
have committed. These occasional orphan objects are retained for manual review.

## Release

1. Review `scripts/backend/apply-ai-home-stories.sql`, check concurrent writers,
   rehearse and independently verify rollback. Apply its exact migration after CI.
   It installs paused and leaves existing story/media/audit rows unchanged.
2. Deploy `home-story-generate` with its committed shared dependencies. JWT checking
   is disabled because its body validates the scheduler token against the database
   before claims, storage writes or provider calls. Unauthorized POSTs must return401.
3. Publish the website from the reviewed merge commit. Verify the release header.
4. With no competing writer, rehearse `scripts/backend/activate-ai-home-stories.sql`,
   verify rollback, then commit that first activation and single dispatch.
5. Observe job state and public image/headlines, then verify FR/AR mobile/desktop.

Pause with `select app_private.ai_home_stories_configure(false);`. Publication
rechecks that switch, so in-flight jobs cannot publish after pausing. Pausing does
not cancel already dispatched Edge workers or storage uploads: drain those workers
before another database/storage write, following the inventory in `AGENTS.md`. Inspect
`app_private.ai_home_story_jobs` for status, safe error codes, model and timestamps.
News that has no published edition in both languages is skipped until translated;
no missing translation is fabricated. Provider billing/access errors require
correcting the provider account before resuming; retries stay capped meanwhile.

## Verification

`home-story-generate.test.ts` covers auth, missing key, idle claims, provider and
storage errors, image-byte/dimension validation, background lifetime, cleanup and
ambiguous publication. `ai_home_stories.test.sql` exercises actual DB authorization,
claims, budgets, publication, source withdrawal and manual suppression in CI.
`scripts/qa/home-stories/ai-layout.mjs` checks FR/AR at 390/1440px in both themes.
Its image is a local fixture; production verification checks an actual generated image.

Sources checked during implementation:
[OpenAI Images API](https://developers.openai.com/api/reference/resources/images/methods/generate),
[Supabase background tasks](https://supabase.com/docs/guides/functions/background-tasks).

## Presentation repair and replacement (10 October 2026, Dubai)

The viewer contains the full image, displays the headline once, supports buttons,
arrows and swipes, and handles loading failures. AI/provider wording is absent;
provider credits are hidden, while manual photo credits remain visible.

Migration `20261009211234` snapshots a private visual brief: article body (bounded
and stripped of markup), published match context and tagged clubs. The image prompt
uses these facts for a distinctive news cover with short club labels/verified score.
It avoids anonymous stock footballers and the repeated navy collage treatment.

`apply-story-presentation-repair.sql` installs through the guarded migration path,
leaving automation paused and existing public images untouched. Deploy the new worker
and publish the website before rehearsing/committing `refresh-initial-home-stories.sql`.
That queues only the three original images and restores the six-attempt UTC daily cap.

The owner-only `ai_home_stories_queue_refresh` requires paused, drained automation,
valid still-published sources and budget for all requested replacements. It preserves
completed attempts as `superseded`; their images stay visible until each replacement
publishes atomically. History/media are retained. Each replacement counts as a new
paid attempt against both existing caps. Pending refresh sources are claimed before
newer ordinary news so unrelated articles cannot take their reserved daily budget. Editorial unpublishing before a claim or
while its replacement is generating cancels the replacement. Failed replacements
leave the old image available rather than deleting it. No automatic unlimited retry.

## Compact rail labels

Generated stories use a separate deterministic `railLabel` from the verified match context: home club code + ` V ` + away club code, e.g. `RCA V WAC`. Existing article titles remain complete in French and Arabic inside the player. The database computes the same compact label for existing and future generated stories, and supplies it in future image briefs. The image prompt forbids expanding this label into a sentence or full club names. Non-match stories use a recognized club code, otherwise the neutral localized Actu/أخبار fallback. Unknown clubs never produce invented matchup codes. The frontend uses one line and fixed compact item widths; AI text cannot change rail dimensions.

Migration `20261010055425_compact_story_labels.sql` changes only private helper/DTO/visual-context functions. `scripts/backend/apply-compact-story-labels.sql` verifies the ledger, reviewed function hashes, idle workers and unchanged story/media/job/audit rows, rehearses with rollback, and restores the original enabled/six-attempt settings in the same transaction. It changes no stored headlines and spends no image-generation credits. Deploy the updated worker after the reviewed migration.
