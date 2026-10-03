# Flashscore mappings depend on a reviewed Sofascore mapping, enforced by the database

Migration: `20261003120000_football_mapping_supporting_dependency.sql`. Status: **not applied
anywhere yet.** Not applied to production, and not applied to staging (see "Staging" below).

## The rule, in plain words

A Flashscore identity may be mapped to an app player on the strength of an earlier,
reviewed Sofascore mapping to the same player. Before this change that dependency lived
only in the browser: the screen checked it, the database did not. A direct call to the
database functions could skip it. Now the database itself reads the Sofascore mapping row
and refuses the Flashscore proposal if the row is not exactly what it should be, at
three moments:

1. **Propose.** The server reads the supporting row itself and stores what it found.
2. **Approve.** The approval is tied to a fingerprint of the proposal, and that fingerprint
   includes the supporting mapping's state. The server recomputes it, so a changed row
   makes the approval stale.
3. **Execute, inside the transaction that writes the mapping.** The supporting row is
   locked, read again, and compared with what was approved. Any difference refuses the
   execution and writes nothing.

The server checks what is in its own tables. It does **not** claim to have verified the
provider's match events, shirt numbers or birth dates; those stay reviewer evidence.

## What counts as "reviewed"

A supporting mapping is reviewed only when all of these hold at the same time:

- it is a Sofascore player mapping, **active**;
- it is flagged as manually corrected, with a corrector, a time and a reason;
- its `source_version` names an **executed proposal** (`football_player_mapping:<proposal id>`);
- that proposal's own audit record lists this exact row (id, provider, external id, target,
  active), and its approver and reason match the row's corrector and reason.

A version label alone proves nothing: a hand-written row with the right-looking label is
**not** reviewed.

## The read: `api.admin_football_mapping_get_provider_mapping(provider, external_id)`

- Reads the real mapping row (not an audit-chain guess). Returns `null` if there is none.
- Providers allowed: `sofascore`, `flashscore`. Anything else: `invalid_filter`.
- Returns only: mapping id, provider, entity type, external id, canonical app-player id,
  active, manually-corrected flag, `reviewed` and where that came from (`reviewProvenance`,
  `provenanceProposalId`), corrected-at, source version, updated-at, and a `stateDigest`
  (a fingerprint over every identity-relevant field, not over `last_seen_at`/`updated_at`; timestamps are written out in UTC, so it does not depend on the session's time zone).
  No names, no birth dates, no secrets, no other rows.
- Permission: the same staff read as the other mapping reads (staff sign-in, second factor,
  recent sign-in, and the football operations or mapping permission). Granted to the
  signed-in role only; not to visitors; the service role is refused; the table itself is not
  exposed.

## What is stored on a proposal

Two new immutable columns, `evidence_class` and `supporting_mapping_id` (no foreign key by
design: the mapping table is referenced by id only). The evidence also carries a
`supporting` block: mapping id, provider, external id, canonical target, active, reviewed,
review provenance, provenance proposal, state digest, evidence class. It is part of the
server-computed fingerprint, and a digest of the evidence references is stored beside it.

## Who needs it

| Proposal                                                                  | Dependency                                                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Flashscore-only `map`                                                     | required (`F1_REVIEWED_SOFASCORE_EVENTS` or `F2_REVIEWED_SOFASCORE_SHIRT_DOB`)                    |
| Flashscore `replace` / `reactivate`                                       | required, against the target it will have afterwards                                              |
| Flashscore `deactivate`                                                   | none (removing an identity needs no support)                                                      |
| Sofascore proposals                                                       | none, unchanged                                                                                   |
| One proposal that maps a Sofascore **and** a Flashscore identity together | none (it creates both in one reviewed transaction); fields supplied are refused as not applicable |

The ordinary queue, the bulk screen and a direct call all reach the same functions, so all
get the same rule. Leaving the fields out is itself a refusal.

## Stable refusal reasons

`supporting_dependency_required`, `supporting_dependency_invalid`,
`supporting_dependency_not_applicable`, `supporting_mapping_missing`,
`supporting_mapping_not_sofascore`, `supporting_mapping_inactive`,
`supporting_mapping_unreviewed`, `supporting_mapping_target_mismatch`,
`supporting_mapping_changed`. A refused proposal creates nothing; a proposal whose
supporting row breaks after approval is held (never silently retried) and can be refreshed
with the existing refresh function, which re-reads the row and issues a new fingerprint.

## Lock order (execute)

proposal row (update) → supporting mapping (share lock) → candidates → mapping table. The
share lock conflicts with a plain update, so a concurrent deactivation or retarget waits
until the execution ends, or, if it got there first, execution reads its result and refuses.

## What did not change

Single-operator mode, staff permissions, second factor and recent sign-in, explicit
propose / approve / execute, idempotency keys, one transaction per row, the audit trail,
the mapping table's uniqueness, and the generic resolver's refusal to create Sofascore or
Flashscore players on its own.

## Evidence (local, disposable database; CI's `database-quality` job is the authority)

- `supabase/tests/database/football_player_mapping_supporting_dependency.test.sql`: 81
  assertions on the real functions: valid success, wrong target, forged and omitted fields,
  prefix-only provenance, deactivated / retargeted / review-state-changed after approval,
  changed outside the workflow with the old marker, direct execute, stale fingerprint,
  refresh, replace / reactivate / deactivate, one refused row leaves the others usable,
  Sofascore behaviour unchanged, and the completed Sofascore mappings and their audit
  untouched.
- The old expectation that a Flashscore execution succeeds despite a broken supporting
  mapping is gone (it now asserts a refusal).
- Negative controls (the migration with one protection removed, tests run against it).
  Each of these made the tests fail: dependency not required (the test file aborts on the
  database's own check), validation only at propose, prefix-only provenance, inactive
  accepted, unreviewed accepted, wrong target accepted, non-Sofascore accepted, omitted
  fields allowed, permission check removed from the read.
  Two mutants are caught by only one test each: removing the in-execute check, and removing
  the changed-state comparison. The approval re-check recomputes the same dependency, so
  the execute check is a second layer; the one test that sees the difference is "changed
  and restored through the reviewed flow".
- `scripts/db/mapping-dependency-concurrency.sh` (two real sessions, local only, not in
  CI): execute vs a concurrent deactivation, execute vs a concurrent retarget, and
  30 randomly timed races, with no deadlock and coherent outcomes. Against a copy **without**
  the share lock it fails: the Flashscore mapping was written while its supporting mapping
  was being deactivated. (The random race alone did not catch this; the deterministic cases did.)

## Staging

Staging (`srdrflfrfpwixsllveid`) has migrations `20261001150000`, `…160000`, `…161000` only. It has no
single-approver switch (`20261002100000`), so its `admin_football_mapping_execute` is an earlier text than
production's, and this migration's built-in check refuses to apply there on its own. That is the check
working. Production's six functions match the reviewed text exactly. Staging holds no mappings and no proposals.

**Rehearsal (2026-10-03, one transaction, rolled back, nothing saved).** The single-approver prerequisite
(`20261002100000`) and then every statement of this migration were run against staging's real schema, followed by
synthetic checks, and the transaction was ended with a deliberate error so everything rolled back. Result:

- the migration's own preflight passed once the prerequisite was in (the six replaced functions matched the
  reviewed text);
- all 14 functions in play, including the nine this migration creates or replaces, have exactly the same text
  (md5) as on the local database the pgTAP tests ran against;
- the two proposal columns, the check constraint and the index were created; the read function is executable by
  the signed-in role only (not by visitors), and the two internal helpers and the compute function are executable
  by nobody;
- on synthetic data: no fields refused as `supporting_dependency_required`, a made-up id as
  `supporting_mapping_missing`, a made-up class as `supporting_dependency_invalid`, and a hand-made Sofascore
  row with a right-looking version label as `supporting_mapping_unreviewed`;
- afterwards staging was re-read: no new column, table or function, no synthetic row, no open transaction, function
  texts unchanged, still three migrations recorded.

**One deliberate difference.** The tool used for the rehearsal waits for a human to confirm any statement containing
`DROP`, so the one `DROP FUNCTION` of this migration (the old nine-argument compute function, replaced by a
twelve-argument one) was run as a rename of that function instead. Everything else is identical. The real
`DROP FUNCTION` was therefore exercised only on the local database (where all tests pass), not on staging.

**Not covered by the rehearsal:** staging has no mappings or proposals, so the end-to-end lifecycle (propose, approve,
execute with real reviewed Sofascore mappings) was run only on the local disposable database and in CI. Production's
own rows were never touched.

## Production

Authorised to read and prepare only. Applying this migration to production is a separate owner
decision (see `RELEASE_ACTIVATION_MIGRATION_RUNBOOK.md`). Nothing here maps anyone.
