# Home image stories

Staff with `editorial.read` can open `/admin/stories`. `editorial.write` allows
upload and draft editing; `editorial.publish` is required to publish, unpublish,
or change an already published story. The existing staff, MFA, recent-auth and
revocation checks apply on the server. The table is not directly accessible to
anonymous or authenticated browser roles. Writes are audited and use a version
check to reject conflicting edits.

Upload JPEG, PNG, WebP or AVIF (10 MB maximum), enter French/Arabic titles and
image descriptions, optionally add a photo credit and destination, then save.
New stories are drafts. Publishing makes a validated image appear in Home's
circular row; unpublishing removes it on the next public refresh (60 seconds,
or navigation/refocus). Ordering uses the numeric position, then creation time.
Readers open a manual image viewer with previous/next, close and an optional
internal link. No video, automatic playback, scheduled expiry or unread state.

The existing `news-media-upload` Edge Function validates file bytes and staff
access, uploads the image and registers its media record. Its `news-media`
bucket is public: **draft metadata is hidden from Home, but a known image URL
is public even before publication**. Upload only material suitable for public
storage. Replaced/abandoned assets are retained; do not delete shared media
automatically.

## Rollout (requires owner approval)

1. Follow the repository's single-writer check and migration promotion process
   for `20261009094920_home_stories.sql` on the intended environment.
2. Confirm the existing `news-media-upload` deployment, bucket and editorial
   media registration RPC are configured. No Edge Function change is required.
3. Regenerate database types via the normal backend type workflow. The frontend
   currently uses a narrow RPC adapter with validated inputs/responses.
4. Publish the reviewed frontend via the documented website deployment path.
5. With real staff accounts, verify upload → draft → reload → publish → public
   viewer → unpublish, plus rejection for a non-publisher.

Until the migration is available or if there are no published stories, Home
keeps the section shortcut row. Admin errors are visible and disable editing
when its initial read fails. Roll back the frontend if needed; keep the additive
migration and stored records. Unpublishing is the normal content rollback.

No shared database was changed in this implementation. Validation used an
isolated local PostgreSQL fixture and component browser harness; see
[reproduction steps](../../scripts/qa/home-stories/README.md) and
[visual evidence](../product/home-stories-evidence/README.md).
