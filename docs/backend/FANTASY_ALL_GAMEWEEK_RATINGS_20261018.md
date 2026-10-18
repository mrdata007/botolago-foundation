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

## Implementation and measured limits

The API-native input path records complete lineup replies under literal API IDs.
The source ledger calculates one rounded rating value per API ID, including for
unmapped participants. It makes no catalog/alias/link writes. An incomplete
fixture remains pending for finalization while its actual rated participants
can contribute provisional points; stored legacy retries cannot overwrite fresher native
replies. Fresh native retries poll only lineups, at most once every two hours
per finished fixture, bounded by the existing per-tick cap. An atomic poll claim
backs failed requests off for fifteen minutes and prevents overlapping polls.

The current unfinished week can cut over only with an owner-approved staged plan,
matching source/lineup digest, drained writers and an atomic result/ranking save.
The usual worker applies the same input path thereafter. Every old activation,
snapshot, source/version, seal and finalization guard is preserved for legacy
inputs. Native finalization still requires all real ratings and all selected
API identities. Old category mode/FINAL_LIMITED state cannot certify native
ratings. The rules card uses the already verified strict missing-rating copy.

For sealed GW1–3, recovery proposals are staged separately. They do not rewrite
published history or reopen gameweeks. The October 18 audit found missing actual
ratings in all four weeks, and 21 distinct selected legacy records without a
primary SofaScore ID in each week. This cutover does not infer those identities,
replace managers' selections, or declare missing ratings to be DNPs. Until those
inputs are actually known, full historical publication and safe finalization
remain blocked. Pending historical prizes are neither verified nor paid here.
