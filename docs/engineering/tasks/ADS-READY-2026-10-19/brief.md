# Ad-ready placements — approved user scope, 19 October 2026

The owner requested ad spaces on botolago.com for both AdSense and direct sponsors. They do not have AdSense yet and want placements prepared for later activation.

## Preserve

The live application is the Lovable-linked BotolaGO foundation repository, not the older Sites download portal. Preserve its French/Arabic interface, logical RTL layout, light/dark UI kit, content order, match navigation and all Fantasy/business rules. BotolaGO+ members retain the promised ad-free experience. No database writes, new tracking or native-webview AdSense.

## Improve

Add a reusable, clearly labelled ad space in the Home feed, News feed and after an article's body. Reserve responsive dimensions, separate ads from game/navigation controls, provide an optional direct sponsor creative and an honest house placeholder, and load the Google library once only after explicit activation with real IDs. Centralise publisher/unit configuration and ads.txt generation without fabricating publisher records. Keep AdSense disabled until approval and consent/privacy setup are complete.

## Acceptance criteria

- French and Arabic mobile (320/390 px), tablet and desktop layouts fit their actual container boxes; existing theme tokens are used.
- The initial configuration makes no Google ad requests and exposes no invented publisher ID.
- A valid configured sponsor overrides AdSense for its placement; paid links are labelled and marked sponsored.
- Google requests wait for a nonmember web visitor and a visible, nonzero-width slot; language and theme changes do not duplicate requests. Blocked/unfilled responses retain an honest fallback without changing reserved dimensions.
- Real activation requires approved publisher and unit IDs, the account's ads.txt entry, privacy review and Google's consent setup. No claim of live ad delivery before these exist.
- Run relevant existing tests and type/build checks. Capture before/after French/Arabic mobile and desktop screenshots where browser infrastructure works; record verification gaps honestly.
- Deliver a draft PR for owner review; do not merge or publish without approval, per AGENTS.md.
