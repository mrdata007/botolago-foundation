# Private match visuals in Admin Stories

Owner-approved scope (2026-10-14): build the collection/edit workflow and hold
all results in Admin; do not post them. Existing image key reuse is authorized.

## Preserve

Preserve the existing Stories editor, permissions, unsaved-change protection,
French/Arabic localization and BotolaGO visual system. Existing published stories
are a separate feature. This workflow cannot create a public story, media asset
or article hero, and cannot post to social accounts.

## Improve

Add a separate private match-visual queue above existing stories. Import a photo
with its original post link, descriptive title, and optional fixture/story IDs.
Preview originals and held edits privately. Let editors select a small cleanup
rectangle and upload an exact transparent branding layer. AI changes only that
rectangle; copy every other source pixel back before branding. Keep failure and
processing states visible and support retry/discard. Keep source provenance and
rights status unverified in the private record.

Source monitoring uses a separately configured feed adapter; account names alone
are not API access. Manual import works without a collector. No automatic edits
before an editor chooses the editable area and exact branding.

## Acceptance

- All originals/results live in a private bucket with staff-authorized previews.
- New queue has no Publish control, including for users with publishing access.
- API completion ends in held; no public editorial API/table is used.
- Pixel checks reject branding outside the chosen editable rectangle and copy
  protected source RGBA exactly; score/crest/player regions outside stay exact.
- Source URL, optional association, status and errors survive reload.
- Explicit empty/loading/error/read-only states; no horizontal overflow at 390px
  or 1440px; French and Arabic RTL labels and preview geometry work.
- Before/after component screenshots, relevant backend/worker tests, TypeScript
  and lint evidence. Browser fixture data is distinguished from a live backend.
