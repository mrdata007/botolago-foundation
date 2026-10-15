# One private photo smoke test

Run after the draft PR passes application/database CI and its staging deployment
has been approved. This is a private test, with source collection off throughout.
The present checkout has no configured OpenAI credential or authenticated staff
session; the deployed function reuses the existing `OpenAI_Image_Gen` secret.
Do not copy that secret into a browser, command log or this document.

1. Use an isolated staging database with this migration and both Edge Functions
   installed through the reviewed release process. Check for other writers,
   pause schedules and drain in-flight workers before the test, following
   `AGENTS.md`. Record the original switch settings for restoration.
2. Confirm the `match-visual-drafts` bucket is private and
   `app_private.match_visual_collection_settings.enabled` is false. Record the
   public Home Story/media counts and article hero IDs before the private write.
3. Sign into the staged Admin → Stories with an MFA-authenticated editor.
   Import one real original photo and its actual post URL. Use the stored,
   normalized source PNG for the comparison below; the import keeps its natural
   dimensions. It must appear held, with rights unverified and no public entry.
4. Select only the watermark rectangle. Keep every face, kit, crest, score and
   existing lettering outside it. Review the official BotolaGO logo preview,
   then start one edit. Do not retry a pending request; refresh its status first.
5. Expect `processing → held`, a private result and the original still available.
   A provider rejection must show a failed edit, preserving the original. Resolve
   the real provider error before spending another attempt. Confirm the image
   model configured in this environment supports the edit endpoint.
6. Download the normalized source and result through authorized private previews
   to local, untracked files. Run the independent decoder/comparison:

   ```sh
   bun scripts/editorial/check-held-match-visual.ts private-source.png private-result.png 20 20 60 60
   ```

   Substitute the actual rectangle coordinates. The command must exit zero and
   report `changedOutside: 0`. Inspect the cleaned region and branding visually;
   pixel preservation alone does not prove that the cleanup looks good.

7. Confirm the record remains held, rights remain unverified, the bucket remains
   private and collection stays off. Compare the public counts and hero IDs with
   the baseline; all must remain identical. Check Home Stories and the linked
   article without a staff session: this draft must not appear.
8. Open Admin as a read-only staff member: preview works and write controls are
   absent. An ordinary account must not obtain a preview. Remove the test item
   from the hold queue and confirm a stale edit callback cannot revive it.

Record the staged commit, draft ID, state transitions, comparison JSON and
before/after public snapshots as private test evidence. Never publish signed
preview URLs or real photo bytes in a public PR. Restore the measured unrelated
switch settings after the test; keep this collector disabled. No public posting
or publisher/source activation is part of this smoke test.
