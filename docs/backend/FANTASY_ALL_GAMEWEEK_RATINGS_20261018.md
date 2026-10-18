# API ratings across all available gameweeks

Owner approval on 2026-10-18 extends the rating-only rollout to every gameweek
where real SofaScore API ratings are available, including earlier gameweeks.
Do not create player links, infer equivalences between different provider IDs,
substitute five points, force finalization or weaken existing guards.

The strict missing-rating migration from PR #518 is deployed, with its exact
canonical migration history and unchanged score/snapshot/policy fingerprints.
The website serves release 2fb2553f6180d2749b1d71f90cd2cac03fc497c9.

First audit actual API coverage for every assigned finished fixture, including
sealed GW1–3. Fetch lineups only, by fixture API ID, without player mapping or
observation ingestion. Retain normalized API IDs, appearance evidence and real
ratings in the artifact. The audit has no database write mode. Missing ratings
remain explicit. A failed request must not look like an empty lineup or DNP.

Use the measured coverage to build the smallest audited recovery mechanism.
Existing sealed documents and the currently published history must remain
available for review. No live fixture is finalized by an audit or a recovery.
No irreversible prize or trophy action is part of this change.
