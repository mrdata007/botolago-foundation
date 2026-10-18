# Actual API ratings only

Owner direction, 2026-10-18: stop manual player linking, score from SofaScore API
ratings only, and wait for an actual rating instead of awarding five points.

Production inspection found no enabled rating policy. GW4 is live, uses the
category rule, and already has twelve scoring snapshots. Its two held fixtures
are 17256981 (32 participants with ratings) and 17256966 (32 participants, no
ratings in the stored API reply). No player link or production write was made.

The current switch refuses a rule change after a gameweek starts. This change
preserves that guard. It cannot declare GW4 recovered or turn missing ratings
into points. Activation remains a separate reviewed production operation.

## Scope and screen brief

- Preserve the page layout, brand, French and Arabic, category rules for earlier
  gameweeks, captain/chip behavior and every production integrity guard.
- Add a strict rating requirement to future rating snapshots. The worker waits
  before persisting results when a participant lacks a real rating; the database
  independently refuses such a save. No identity matching or link creation.
- The rules API explicitly identifies the strict policy. The existing rules
  card states in French and Arabic that an unrated participant waits for the
  API; older server responses retain their existing explanation.
- Acceptance: missing/null ratings cannot produce five or zero points or trigger
  bench/captain replacement; a later actual rating permits normal scoring;
  nonparticipants still score zero; earlier rules and saved history stay intact.
  Verify the worker and SQL guards and both language renderings. Keep the PR
  draft until database CI and mobile/desktop/RTL visual checks are reviewed.

## Remaining provider identity limitation

Ratings still have to refer to the API ID of the player a manager selected.
The current ingestion path requires reviewed identities and reconciled core
data, even for ratings. Changing to API-native identity throughout the catalog,
squads and observation pipeline is a separate migration; a rating formula alone
does not make duplicate API profiles interchangeable. No such equivalence is
assumed here and no link is added.
