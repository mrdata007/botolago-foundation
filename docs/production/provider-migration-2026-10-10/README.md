# Provider migration: measured state, 10 October 2026

Production was read only. No player, membership, proposal, mapping, fixture link,
performance, score, ruleset or production switch was changed by this work.

## Catalogue and identity review

The active Fantasy season now contains 736 catalogue rows, 734 active. The previous
539 total describes the Sofascore candidate population, not the current active
Fantasy catalogue. All 198 active Sofascore and 42 Flashscore player mappings are
reviewed and belong to active Fantasy players. There are 341 unmapped Sofascore
candidates and 423 unmapped Flashscore candidates; 240 executed proposals and one
cancelled proposal, with none open. There are no provider fixture links.

The unchanged read-only `scripts/backend/football-mapping-bulk-manifest.sql`
found 41 more eligible Sofascore candidates: 2 Tier A, 39 Tier B, no identity or
target collisions. Its existing gates excluded 93 conflicts, 7 ambiguities,
112 with insufficient evidence and 88 with incomplete provider data. Flashscore
does not qualify through this Sofascore-only contract; its 423 unmapped candidates
need the separate corroboration workflow.

The verified review artifact is
[`player-mapping-bulk-2026-10-10.manifest.json`](../manifests/player-mapping-bulk-2026-10-10.manifest.json),
canonical digest `08fcf6cb64d446e304a366b7956949ce47d3f32b341f29323ef62c7d3f1c8000`.
It has not been installed into the admin screen, proposed, approved or executed.
Re-read eligibility and regenerate before its execution; every row must still
pass the existing database and approval guards. The previous October 2 manifest
remains historical. Do not guess identities from names or shirt numbers.

## Fixture review plan

[`fixture-link-review-plan.json`](fixture-link-review-plan.json) proposes the seven
finished GW1 fixtures for both providers. Each pair agrees on provider team IDs,
kickoff time and final score and resolves to exactly one production fixture with
the corresponding home/away teams. These are proposed bindings, not installed links.
Future and other completed fixtures still need provider match discovery.

## Replays

[`mapping-snapshot.json`](mapping-snapshot.json) is one consistent production read
captured at `2026-10-10T15:50:09.036966+00:00`, with 240 reviewed mapping rows.
Its digest is `1760e8532a1a72e13784cca3fe9c53c19f8cf1b504e5e8473056c11eb5878f18`.
The snapshot includes public football identifiers and versions only, no names or
birth dates. It must never be used as staging identity provenance: staging needs
its own reviewed mappings and an independent snapshot.

[`committed-replay.json`](committed-replay.json) replays all seven saved GW1 matches.
None passes the identity gate:

| Match           | Missing Sofascore appearances | Missing Flashscore appearances |
| --------------- | ----------------------------: | -----------------------------: |
| Touarga–FUS     |                            18 |                             25 |
| DHJ–CODM        |                            20 |                             27 |
| WAC–Temara      |                            23 |                             27 |
| Tiznit–Tanger   |                            20 |                             27 |
| MAS–Zemamra     |                            15 |                             24 |
| Tetouan–Berkane |                            13 |                             26 |
| KACM–HUSA       |                            18 |                             20 |

This also verifies the seven Sofascore mappings entered on October 5: the
MAS–Zemamra unresolved count is 15, down from the historical 22.

[Read-only live download run 38065366553](https://github.com/mrdata007/botolago-foundation/actions/runs/38065366553)
successfully fetched Touarga–FUS, MAS–Zemamra and KACM–HUSA, with 24 requests
(12 per provider). Its trimmed artifact ID is 11674467047, ZIP SHA-256
`16a01dae0dc2e57addd7022c2df72e68ca250e918de9c2984cb900b665bc1d24`.
Raw responses are not committed here. The fresh downloads were replayed offline
through `createPlannedMatchLoader("live")` with a file-backed fetch, then through
`replayFixture` and `prepareReconciledObservation`, with no further provider calls.
[`fresh-replay.json`](fresh-replay.json) records the result:

| Match       | Candidate scoring mode | Events and participation ready | Missing Sofa / Flash identities | Ingestion ready |
| ----------- | ---------------------- | ------------------------------ | ------------------------------- | --------------- |
| Touarga–FUS | full                   | yes                            | 17 / 25                         | no              |
| MAS–Zemamra | full                   | yes                            | 15 / 24                         | no              |
| KACM–HUSA   | simple                 | yes                            | 18 / 20                         | no              |

Touarga's current response has full player statistics where the historical
October 1 response had limited coverage. Earlier finalised weeks must not be
rescored just because a provider fills in statistics later. No SportMonks points
comparison or owner sign-off is claimed: unresolved identities block that test.

## Rules and rollout gates

The current reconciler already supports assists, saves and penalties under the
existing full/simple rules. The earlier approved plan records ratings as display
only and forbids deriving saves from shots on target. No new scoring version was
published. A proposed rules change needs a comparison and an effective future
gameweek before owner sign-off; it must preserve locked and finalised weeks.

Next: refresh and present the review batch in the admin workflow, resolve the
remaining identities and fixture bindings, then run the staging comparison with
staging's own catalogue and reviewed mapping snapshot. Stop other performance
writers during that staging write, following AGENTS.md. Production activation
remains blocked pending staging results and owner sign-off; the code still
refuses the production project in both database modes.

## Quota budget

One poll is four calls per provider, eight combined per match. Eight matches per
week means 32 calls per provider per poll. Two polls per match mean 256 calls per
provider over four rounds, or 320 over five rounds (512/640 combined), before
discovery, player profiles, squad refreshes and retries. Do not assume remaining
free capacity: verify each subscription and its actual quota headers separately.
The downloader retains quota state for a whole plan, reports counts, warns at
20% remaining and stops below the existing 100-request reserve. Alerts are CLI
warnings; no recurring quota-monitor job or paid subscription was enabled.

Validation: 69 focused ingestion/client/adapter tests, TypeScript and ESLint
passed after the quota changes. PR #319 separately passed 36 focused identity
tests and TypeScript/ESLint. Required GitHub checks govern merging.
