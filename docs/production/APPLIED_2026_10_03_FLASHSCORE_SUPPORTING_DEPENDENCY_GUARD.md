# Production: Flashscore supporting-dependency guard installed (2026-10-03)

On 2026-10-03 the owner approved applying the Flashscore dependency guard to Production V2
(`tkewgajrljbwgwedqsxn`). It was committed once, by one run, at about 14:28 UTC.

**Outcome:** the guard is installed and verified. The apply runner printed
`COMMITTED_NEEDS_REVIEW` because one of its own after-checks could not run (see Warnings). Everything
that check would have looked at was then verified separately, and all of it passed. Nothing was re-run.

**Nothing was mapped.** No Flashscore mapping, proposal or approval exists. The 42 players are
still unmapped, and the 11 held rows are untouched.

## What changed in the database

Migration `20261003120000_football_mapping_supporting_dependency` (the only change):

- two new, empty columns on proposals (`evidence_class`, `supporting_mapping_id`), one check
  rule and one index for them;
- the 12-argument `football_mapping_compute` replaced the old 9-argument one (the old one is gone);
- three new functions: the staff read of one provider mapping, the supporting-state helper and the
  supporting-dependency helper;
- the propose, approve and execute checks now refuse a Flashscore mapping whose supporting Sofascore
  mapping is not reviewed.

## Pinned inputs and how it ran

| Item | Value |
| --- | --- |
| Apply tooling PR | #323, merge commit `72704156fb673f59828da327a749d441bb273f99` |
| Execution commit | `72704156fb673f59828da327a749d441bb273f99` (`main`) |
| Run | `37129695639`, attempt 1, `workflow_dispatch`, actor and triggering actor `mrdata007` |
| Migration sha256 | `d435bde5d9ca114a17f94786178b1f4261ff3b8e8c65f8d8f8fcbd70baa18577` |
| Reviewed wrapper sha256 | `920cd532be40299f85e99656d1ba75c0f451ec63f5b4547961a1d827f68340c4` |
| Commit script sha256 | `018c2e92beb32ac8311912f742c6e2e847ada0f73ef2b68ef9a103c7a253cd89` (the wrapper with only `rollback;` turned into `commit;`) |
| Manifest v2, canonical hash | `f2eef95dd199244ca6c48e9a2e0595a39a6bc2e534e7455a41467c7dba17a286` |
| Manifest v2, file sha256 | `c5a335ec20755534acb3ac75c9dbc4ae8e35df1d4919dcebdefd63ae3dc88c50` |

The two manifest hashes are different checks on purpose: one is over the canonical content, the other
over the file's bytes.

Before the run: the exact rehearsals on staging (run `37122851418`) and production (run `37123800346`)
rolled back cleanly, and a final read-only production preflight passed right before dispatch (guard not
installed, single-operator mode on, no open proposal, no Flashscore mapping, no busy session).

The run sent the script once. Production answered HTTP 201:
`Applied. The Flashscore supporting-dependency guard is installed.` There was no retry.

## Independent check afterwards (read-only, separate connection)

- **Exact schema changes:** history has the migration (147 rows, latest `20261003120000`, sha256 as above);
  one compute function, the 12-argument one; 3 guard functions; the check rule and the index exist.
  API functions 313 and private functions 332, as the reviewed post-state expects.
- **All 42 manifest rows:** for each, the supporting Sofascore mapping is in the expected state and the
  server computes the same fingerprint the manifest holds (14 + 14 + 14 = 42 of 42 match, 0 mismatches).
  The proposal rows were built in memory only; nothing was inserted.
- **All 191 Sofascore mappings:** 191 active, 191 read as reviewed through the new state function.
- **Held rows:** all 53 of the unmapped candidates in the manifest scope (the 42 plus the 11 held rows) are
  still unmapped with no mapping link. Flashscore mappings: 0.
- **Grants:** only signed-in staff can call the new read; no other role can call it, the state helper,
  the dependency helper or the compute function; no client role has table access.
- **Unchanged (compared with the snapshot taken right before the commit):** every mapping row,
  candidate, observation and proposal (191 executed, same digests), the new proposal columns empty,
  the resolver function (same text hash `c4c72532...`), uniqueness rules, triggers and indexes on
  mappings, all other functions and their grants, staff permissions, roles and assignments, players,
  memberships, Fantasy tables (all row counts and the gameweek digest), the automation settings, the 14
  scheduled jobs, audit events (579) and idempotency keys (393).
- **Single-operator mode:** still on. **Busy sessions or open transactions:** none.

## Warnings and deviations

- **The runner's own after-check could not run.** The runner reads the 42 fingerprints through the
  Supabase API's read-only role, which is not allowed to call the compute function (`42501 permission
  denied for function football_mapping_compute`). So the run ended `COMMITTED_NEEDS_REVIEW` instead of
  `APPLIED_AND_VERIFIED`, even though its structural checks found no problems. The same checks were run
  afterwards through a connection that can call the function, and passed (above). This was a gap in the
  runner, not a problem in the database; it was caught only because the database was read separately.
  Follow-up for any future use of the runner: run that one check as a role allowed to call the function.
- No guard was loosened and nothing was deleted or reversed.

## Still not done

Proposing, approving or executing the 42 mappings; adding the 11 held rows; candidate refresh;
date-of-birth, position or membership corrections; Fantasy ingestion, scoring, finalization or
progression; activating automation. Each needs its own owner decision.
