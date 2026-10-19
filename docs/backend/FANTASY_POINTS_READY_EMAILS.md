# Three points-ready emails

Preview with `bun scripts/backend/fantasy-points-ready-previews.ts <directory>`. Open the generated `index.html`. Scores, names and ranks in the gallery are fictional. The generator makes no network or database requests and sends no email.

| Direction | French subject example | Tone |
| --- | --- | --- |
| Score reveal (recommended) | Journée 4 : tes 76 points sont prêts ! | Enthusiastic, score first |
| Manager report | Coach, ton débrief de la journée 4 est prêt | Personal, useful, analytical |
| Full time | Coup de sifflet final : 76 points pour la journée 4 ! | Matchday celebration |

Every direction has matching Arabic copy and RTL layout, delivery-specific unsubscribe and preferences links, one points CTA and a plain-text body. Both logo PNGs are deterministic exports of the existing SVG wordmark, not a recreated text logo. System fonts and table/inline styles keep the important content readable when email clients block images or optional CSS.

## Sending contract

These are reviewable templates, not a live campaign. The existing production email mode stays unchanged. Use the existing `gameweek_finalized` event and dispatcher, not a new independent sending job. Require a final visible result and zero pending players. A completed fixture, a staged plan, a published historical provisional revision or a non-null provisional total does not qualify. Check the latest visible revision again at claim/send time: old sealed results can be final while their new customer-visible rating revision is still provisional. Never send the old category score or reuse an old queued payload after a revision.

`renderPointsReadyEmail` refuses provisional states and nonzero/invalid pending counts, but it cannot authenticate a caller's readiness claim. Its adapter must obtain readiness and totals from trusted database rows. The renderer is intentionally not connected to the live dispatcher until that adapter and its stale-payload checks are verified. No delivery guarantee is made while the global email mode is off.

Keep existing confirmed-email, account/topic consent, deleted-account, quota/reserve, preference and unsubscribe checks. Deduplicate once per manager/gameweek (not once per poll or score correction), preserve body hashes and provider idempotency, and respect expiry and ambiguous-send retry limits. Do not back-send GW1–3 notifications merely because their historical revisions become visible. Do not assume a rank improvement or a high score; zero and negative point totals are legitimate.

Before enabling: validate the selected template in real Gmail, Apple Mail and Outlook test inboxes, verify delivery-specific RFC 8058 headers through the existing dispatcher, and test pending → final, corrected-after-queue and retries without duplicate sends. Browser screenshots validate layout only; they are not inbox-client evidence.
