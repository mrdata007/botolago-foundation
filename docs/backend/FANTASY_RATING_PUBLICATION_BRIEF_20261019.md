# Available rating points, historical publication and refresh reliability

Owner request: publish GW1–3 and ensure users see points promptly after GW4 and later rounds. Approval includes implementation and production publication. Earlier constraints remain: real API ratings only; no fallback points, inferred player links or forced finalization.

## Preserve

Preserve locked selections, captain/chip/substitution/transfer-hit rules, authentication/MFA, sealed historical calculations, provider payload provenance, finalization guards, and French/Arabic visual identity. Unrated and unidentified appearances remain pending. Publication is separate from finality and prize eligibility.

## Improvements

Owner refinement: audit each match against the supplied SofaScore tournament/season (937 / 102220). Missing player points show a looping awaiting-rating indicator inside the points box, never a numeric zero. Include an accessible label and a static reduced-motion state.

Recurrence check found 286 of 738 eligible catalogue records without a primary API ID. Exclude those from new buyers' paginated pool and reject unidentified new memberships at the database boundary. Preserve existing ownership and trusted free-hit restoration; do not change the reviewed create/transfer/deadline RPC bodies or existing locked selections.

Publish reviewed historical rating revisions without deleting or reopening old final calculations. Points, history, round summaries and standings must agree on the published revision. Display pending players explicitly rather than turning missing data into a zero. Publish available points without whole-round blocking. Run the existing trusted scorer on the database clock, under its existing global lease; retain GitHub as fallback. Bound provider retries, prioritize recent fixtures fairly, and expose source/calculation freshness.

## Evidence and acceptance

Primary evidence: fresh API payloads, database source ledger, staged proposal/input digests, locked lineups and shared scorer output. Historical publication must refuse changed inputs and retain original results and seals. Independent SQL checks must agree with computed per-player contributions and team totals. Authenticated reads must expose published revisions only to the correct owner; standings must match those totals. Missing values render pending in French and Arabic at mobile and desktop sizes. Late rating changes must produce exactly one newer calculation; retries must be idempotent; failed fetches must neither zero nor erase known points. Finalization with pending inputs remains refused. Production switches are restored exactly after each guarded maintenance operation. No prize payment, trophy retraction or subsequent launch-stage operation is authorized by this work.

Service objective: after a real rating is accepted, the existing scorer publishes within ten minutes in healthy operation; a newly available post-match rating is fetched within the bounded recent-match polling window. Measure both clocks separately. Provider availability is outside BotolaGO's control and is never represented as guaranteed.

## Expert framing and precise task

Solve point visibility and source latency independently. Publish available GW1–3 API-rating results as auditable, clearly provisional revisions and use those same revisions across customer score surfaces. For GW4 onwards, use bounded automatic polling, the existing leased scorer, explicit pending states, and measurable freshness. Validate against raw sources, independent arithmetic, database replay/security tests, and French/Arabic browser checks. Retain the original sealed record and finalization safeguards; surface any remaining policy decision rather than inventing ratings.
