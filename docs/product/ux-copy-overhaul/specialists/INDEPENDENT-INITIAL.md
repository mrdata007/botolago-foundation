# Independent critical review — initial inspection

Read-only review of /workspace/botolago-foundation. Read AGENTS.md and CLAUDE.md. No repository or database writes. No tests executed by this reviewer yet.

## Review stance

A full-app copy pass must improve the reader's next decision, not replace short labels everywhere or remove operational facts. Dictionary parity and passing existing exact-text tests cannot establish that a rewritten sentence remains truthful. Existing concise, useful lines should survive when no specific defect is demonstrated.

## Findings / gates for implementation

1. **Preserve state and persistence distinctions.** `fantasy.save.auth_required` (near dictionary-fr.ts:944) warns that the draft is not retained on that device through reload, another confirmation tab, or a Google redirect. `fantasy.cloud.offline` says local modifications are not saved. Pronostics guest picks, by contrast, are retained on the phone (`predictions.guest.saved_local`, claim/retry lines at 2270–2331). A generic “save progress anywhere” or “nothing is lost” replacement would be a serious false promise. The exceptionally long current Fantasy warning is a real UX problem but cannot safely be shortened to a reassurance without confirming its code path.

2. **Plus style copy currently implies a frozen rating.** `plus.rule`: “Votre note ne change jamais, seul le style change.” Rendered on PlusStyleScreen. Context means buying/selecting a style does not affect the sporting rating, but the absolute “ne change jamais” conflicts with the entire evolving Manager Card. Prefer wording scoped to the style (e.g. “Le style change, votre note reste la même.”), including Arabic. Need inspect this in the actual screen; the short sentence should stay short.

3. **Avoid indefinite premium-ad promises.** `plus.s3.f0.d`: “Vous ne verrez jamais de publicité dans l'application.” The offer expires at season end, so “jamais” is broader than the adjacent entitlement. Current `plus.render.test.tsx:344` explicitly demands “ne verrez jamais” and Arabic “أبدًا”; tests would preserve an overclaim unless intentionally reviewed. State ad absence for the active Saison, consistently with price, end-date and no-renewal terms.

4. **Feature details are needed at decision points.** Manual Plus activation after payment verification, end of season, no automatic renewal, unchanged sporting rating, trophies earned rather than purchased, privacy limited to private-league peers, and published-versus-live rival totals all carry functional meaning. Removing these facts as technical prose would make the copy worse. Transfer hits, chip permanence, next open round, per-match Pronostics kick-off lock, provisional/correctable scoring, and deletion timing are equally protected facts.

5. **Audit existing exact-copy tests before editing assertions.** `wording-phase-c1.test.ts` protects username alphabet/start rules, unsubscribe scope, round versus genuinely weekly Prospects editions, nonparticipation versus nonselection, and important Arabic bidi isolation. `fantasy-glossary-ar.test.ts` protects transfers الانتقالات, recent form المستوى الأخير, availability الجاهزية and chips الجوكرات, and approved chip names. `prospects-rename.test.ts` protects owner-approved Prospects / المواهب with unchanged URLs/keys. Do not erase these protections simply because wording changes.

6. **“Coming soon” is not evidence of what readers see.** `fantasy.coming_soon`, `profile.coming_soon`, `fantasy.transfers.no_hit_chip` appear stale but have no production usages found outside dictionaries/tests. Conversely some “not yet” lines correspond to genuine unavailable seasons or unpublished rounds. Inventory actual callsites before describing a visible defect or changing availability promises. `launch-copy.test.ts` catches only one narrow historical “opens later” phrase, not all stale claims.

7. **Generic error states remain visible across routes.** Shared `ErrorState` defaults to “Une erreur est survenue.” and many routes rely on that default. Good contextual load errors should identify the missing item and offer retry only where a retry exists. Do not say check connection for a server failure; do not promise auto-refresh in states without a polling hook. Empty, unavailable and failed requests have separate components intentionally.

8. **Profile favourite-club claim merits truth check.** `auth.setup.fav_club_hint`: “Nous mettrons ses actualités en avant.” Before preserving/improving this personalized promise, verify the actual news selection path; home club following and profile favourite club are distinct data/state flows.

## Verification limits and acceptance demands

- `tests/e2e/mobile-readability.e2e.ts` uses root scrollWidth/clientWidth for `noSidewaysScroll`. CLAUDE.md explicitly documents this as insufficient under overflow-x: clip. Final evidence must inspect rendered text rectangles / clipping rather than cite this helper alone.
- Inspect actual before/after mobile AND desktop FR/AR screenshots on an identified server/worktree/port. A longer Arabic line can displace controls or become visually subordinate even when no horizontal scroll is measured.
- Must inspect guest and signed-in variants, paid/locked Plus and representative error/empty states, not only successful landing routes.
- Preserve placeholders, accent tokens, bidi isolation and plural grammar. i18n gate checks structure rather than quality.
- Check route-level hardcoded metadata and AR text alternatives, not just main dictionary entries; public source credits are factual content and must survive.

Final verdict pending implementation diff and screenshot evidence. This reviewer will reject inaccurate or unnatural replacements rather than approving solely on test counts.
