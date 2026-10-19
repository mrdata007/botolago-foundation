# Approved Fantasy manager email journey

Owner choice, 19 October 2026: **Score reveal**. The two requested reminders use the same real wordmark, navy/cyan palette, table layout, one primary CTA and matching French/Arabic copy.

| Moment | French subject | Destination | Trusted send condition |
| --- | --- | --- | --- |
| Team selection opens | Journée 5 : à toi de jouer, coach ! | `/fantasy/team` | Selection has opened, is still editable, and the deadline is confirmed and future |
| Before selection closes | Journée 5 : dernier appel pour ton équipe ! | `/fantasy/team` | Existing 24-hour deadline event is due, selection remains open, and the confirmed deadline has not passed |
| Points are final | Journée 5 : tes 76 points sont prêts ! | `/fantasy/points` | Latest customer-visible result is finalized with zero pending players; use `APPROVED_POINTS_READY_VARIANT` |

Subjects and values above are fictional examples. The owner explicitly selected **before the team-selection deadline**, rather than after all fixtures finish. “When GW starts” is the opening of **editable selection**, not kick-off after the lock. The reminders do not assert a team is missing or incomplete, since returning managers can already have valid carried-over selections. They ask managers to review starters, bench order and captain.

## Implementation and current limits

`fantasy-team-reminder-email.ts` renders the two reminders as HTML and plain text. It requires an injected trusted clock, current editable state, confirmed opening/deadline instants and a valid notification timezone. It refuses expired/locked/not-yet-open selections and deadline reminders more than 24 hours early. Copy prints the absolute deadline rather than an inaccurate “24 hours remaining” countdown for delayed queues. It reuses the existing `formatDay`/`formatTime` and Morocco clock override instead of the runtime's older timezone data. No scheduler, recipient selection, database mutation or email provider call is introduced.

The existing planner has a `deadline_24h` event; it does **not** yet have a selection-opening event. The new renderer is not connected to either live delivery path. Integration must add a trusted, deduplicated opening event using the real selection-open transition, reuse the existing deadline event, and use the existing finalized-results event with the visible-rating-revision check. Renderer inputs cannot authenticate a caller's readiness claims.

At claim/send time, re-read selection status, revised deadline, membership, confirmed address, deletion status and both Fantasy-topic and email consent. Cancel a queued reminder after lock, deadline changes or loss of consent; never send historical opening/deadline reminders. For future delivery, deduplicate per manager + gameweek + moment, retain provider idempotency/body hashes, and preserve existing expiry, quota reserve and ambiguous-send retry safeguards. Opening and deadline messages are distinct moments; selecting a team does not justify saying it was incomplete.

Production email mode remains off. A free-plan budget of 90 notification emails/day after reserve may not cover every manager across these moments and other notification types. Do not promise universal email delivery until capacity is measured. Real Gmail, Apple Mail and Outlook test-inbox checks, RFC 8058 headers, delivery expiry and duplicate-send tests remain necessary before activation. Browser layout evidence proves layout, not inbox delivery.

## Review and verification

Generate all six selected-journey previews using `bun scripts/backend/fantasy-manager-email-previews.ts <output-directory>`. It reads only committed logo assets and writes fictional local previews; it has no sending credentials or database access. Historical alternatives remain in the original preview generator; **Score reveal is the selected direction**.

Renderer validation: 86 tests across the new reminders, points-ready renderer and existing notification renderer, 782 assertions, zero failures. TypeScript and focused ESLint pass. Twelve browser cases cover the three moments × French/Arabic × 390/1280px: logos loaded, expected RTL/LTR, correct CTA, no page errors and no offscreen content. Four existing-deadline screenshots provide the before evidence. See `docs/qa/fantasy-manager-emails-20261019/`.
