# Automatic news image stories

The owner requested automatic generation/publication and configured the Supabase
Edge secret `OpenAI_Image_Gen`. It is used only by `home-story-generate`;
no key is copied to the browser or repository. Existing text generation is separate.

Every ten minutes, at minutes 4/14/24/34/44/54, the authenticated scheduler claims
one of the newest news stories published in both French and Arabic within 72 hours.
It copies the two exact headlines, generates a portrait conceptual illustration,
stores the PNG in `news-media`, and publishes the Home story in one SQL transaction.
The viewer overlays the localized headline as accessible text; the model is told
not to draw text or fabricate a documentary image of the event. It shows an AI disclosure. Source publisher metadata stays private, consistent
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
