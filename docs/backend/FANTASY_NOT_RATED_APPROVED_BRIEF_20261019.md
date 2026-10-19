# BotolaGO scoring recovery: execution brief

## Refined instruction

Complete the approved Fantasy email automation and resolve the 21 legacy
selections using verified provider-native identities. Preserve locked teams,
prices, bank, transfers, historical seals and real ratings. Prevent new stale
roster purchases. Rehearse scoped changes, compare independently, then deploy
and activate only the approved email types. Keep automatic rating recovery on
outside short, drained maintenance windows. Do not invent ratings, force
finalization, compensate managers or declare the entire launch ready.

## Expert considerations

Identity, eligibility at kickoff, participation, a published rating and
competition finality are separate facts. A current club is not historical
registration evidence. A missing rating is not proof of a missing feed.
Fixing a mapping must invalidate scoring inputs and must not silently make an
outdated roster entry purchasable. The final email must match the result users
can actually see, rather than a preserved older raw score. Provider acceptance
does not prove inbox receipt.

## Primary evidence and methods

Use raw authorized squad/lineup API responses with IDs, observed times and
digests; existing catalog provenance; provider profiles and dated club transfer
announcements; live PostgreSQL function definitions and migration history;
actual CI logs and deployment inventory. Review conflicting dates and duplicate
profiles individually. Match none by birthday or shirt alone. Rehearse exact
migration bytes, verify rollback in a separate query, then apply the identical
operation. Serialize shared writers and drain asynchronous leases first.

## Objective acceptance

- Each repaired identity has traceable evidence, no primary/alias collision and
  an explicit current-eligibility decision.
- Independent points calculations match stored/public values with zero
  mismatches; pending appearances never become fabricated ratings.
- Locked lineups, acquisitions, sale values, bank, transfer costs and historical
  seals have unchanged fingerprints.
- Future opening/deadline events deduplicate. Consent, recipient, deadline and
  score are checked again before sending. Old/provisional events cannot send.
- Required CI passes on the exact release tree; migration checksum and deployed
  function are verified; mail activation enables only the three approved types.
- Recovery heartbeat succeeds after maintenance and no switch remains paused.

## New finding: short appearances may never receive ratings

Direct production query on 19 October found 20 appeared=true, uncertain=false
entries with no numeric rating in the latest stored sources for GW1–4. Every
one played between 2 and 7 minutes. GW4 has two 7-minute appearances at Difaâ
and one 4-minute appearance at Témara–Kawkab. Historical GW1–3 have 17 more.

SofaScore's own [rating explanation](https://corporate.sofascore.com/about/rating)
says ten minutes of play are needed to generate the first ratings. Its
[detailed guide](https://www.sofascore.com/news/sofascore-rating) says ratings are
also updated after the whistle. This supports an intentional-unrated
explanation; it is not an authoritative terminal status for each appearance,
and the published wording does not prove an exception-free ten-minute rule.

### Policy approved by the owner — implementation pending

For a finished match with complete trusted participation data, retain a missing
rating as pending for at least 24 hours. After two successful, independently
timestamped provider reads spanning that period, an appearing player with fewer
than ten recorded minutes and still no numeric rating may settle as **Not
rated**. Keep rating=null, minutes and participation intact; record both source
digests and the policy version. Such a selection contributes **0 Fantasy
points**. Do not label it DNP, synthesize a rating, or change any real rating.

Uncertain participation, a missing team sheet, a timeout, conflicting minutes,
or a missing rating for a longer appearance stays pending. A later genuine
rating must go through the normal audited correction/publication process.
Display Not rated as a terminal status with an explanation, not an endless loop.
Final emails may send only after the revised rule has been applied consistently
and the current visible result is finalized.

The owner explicitly approved this reviewed rule on 19 October 2026. It supersedes the earlier wait-for-actual-ratings instruction only for the qualified, evidence-backed short appearances described above. It does not authorize compensation, uncertain zeros or forced finalization.

## Interface preservation and acceptance

Preserve existing BotolaGO visuals, available points, captain/transfer rules,
locked selections, real zeroes and the awaiting-rating animation for genuinely
pending data. Add only a translated Not rated state and its explanation in the
existing rating/points cells and rule text. Verify FR/AR at 390px and desktop,
RTL, reduced motion, and that real pending and rated cases remain distinct.
