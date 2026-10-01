# Player mapping backend: production-readiness evidence (1 Oct 2026)

**Status: implemented, tested, NOT applied to production or staging.** Branch
`claude/player-mapping-backend` (PR #282, draft, stacked on #278). Nothing here maps a
player. Applying the migrations creates empty tables and functions only.

## 1. Files

| File                                                                               | What                                                                                                         |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `supabase/migrations/20261001150000_register_sofascore_flashscore_providers.sql`   | registers `sofascore` and `flashscore` (two rows, nothing else); applied to staging, owner-run on production |
| `supabase/migrations/20261001160000_football_player_mapping_tables.sql`            | candidates, observations, proposals, guards, forced RLS, no grants                                           |
| `supabase/migrations/20261001161000_football_player_mapping_functions.sql`         | the trusted functions, one guard on the legacy ingestion function, grants                                    |
| `scripts/backend/apply-20261001150000-register-sofascore-flashscore-providers.sql` | owner-run guarded script for the registration (rehearsal by default)                                         |
| `src/backend/football/identity/`                                                   | read-only collector, candidate builder, repository contract, Supabase adapter, in-memory mock                |

## 2. Schema

- **Candidate** (`football_player_mapping_candidates`): keyed `(provider_name, external_id)` and nothing else.
  No club column. Status `unmapped | proposed | mapped | ignored`. Display name for reading only (purged at 90 days).
- **Observation** (`football_player_mapping_observations`): one per `(candidate, requested squad)`, with
  completeness, registered team, shirt, position, DOB state (and the date only when valid), height, nationality.
- **Proposal** (`football_player_mapping_proposals`): kind `map | replace | deactivate | reactivate | ignore | reverse_ignore`,
  ten states (pending, approved, executed, rejected, expired, cancelled, stale_evidence, identity_conflict,
  position_disagreement, already_mapped), `expected_before`, evidence, signals, fingerprint, `executed_before/after`,
  `requested_by <> decided_by` as a table check, immutable once final, never deleted.
- No foreign key to `football_provider_mappings` (a key would add triggers to it) and none to `football_providers`.

## 3. Shared Sofascore ids

One provider id = one candidate = one proposal. Each squad is an observation. The reviewer sees
`MULTI_SQUAD_OBSERVATION` and nothing else: never a transfer, duplicate, wrong squad or collision, never a negative
signal. A club mismatch (`CLUB_CONTEXT_MISMATCH`) or a registered-team disagreement is a flag only. The approved
mapping stays global (provider id -> one app player). Proven in `football_player_mapping_workflow.test.sql` sections 1 and 4 and
`candidate-builder.test.ts`.

## 4. Trusted functions and exact privileges

Staff (`authenticated`; authority is checked inside every function: staff principal, AAL2, 15-minute session, permission):

| Function                                                                                                                                            | Needs                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `api.admin_football_mapping_propose(items, reason, key)`                                                                                            | `football.manage_mappings`, AAL2, recent auth                  |
| `api.admin_football_mapping_decide(id, decision, reason, fingerprint, ack, key)`                                                                    | same, and a DIFFERENT human                                    |
| `api.admin_football_mapping_execute(id, key)`                                                                                                       | same; exactly once; approver re-checked                        |
| `api.admin_football_mapping_cancel`, `_add_position_note`, `_refresh_evidence`                                                                      | same, proposer only                                            |
| `api.admin_football_mapping_list_candidates`, `_get_candidate`, `_list_proposals`, `_get_proposal`, `_reviewer_availability`, `_app_player_options` | `football.read_operations` or `football.manage_mappings`, AAL2 |

Service role only: `api.football_mapping_record_observations`, `api.football_mapping_expire_proposals`,
`api.football_mapping_purge_display_names`. Internal helpers (`app_private.football_mapping_*`, 20 of them) have no grant
for anon, authenticated, service_role or PUBLIC. The three tables have no privilege for any role and forced RLS with no policy.
Of the 35 new functions, the 24 that read or write data are `SECURITY DEFINER`; every one has an empty `search_path` (asserted). The other 11 are pure helpers and triggers.

## 5. Approval and audit enforcement

Proposer (human, AAL2, recent auth, reason 10-500 chars) -> different approver (same login strength, exact
fingerprint, reason; a position disagreement also needs the proposer's note and the approver's explicit acknowledgement) ->
execution (one guarded transaction; world re-validated; approver still active and qualified; approval younger than 24 h;
compare-and-swap on the mapping row; both unique constraints re-checked before any write; idempotency key).
Every transition writes `app_private.admin_audit_events` (append-only) with actor, reason, fingerprint, correlation id and,
for execution, the exact before and after. No self-approval, no owner shortcut, no `approvals_required = 1`, no bypass,
no automatic execution. With one operator the screen reads "second qualified reviewer required".

## 6. The mapping table is unchanged

`football_provider_mappings`: same two unconditional, non-deferrable unique constraints, same two triggers, no new index,
no foreign key pointing at it (asserted in `football_player_mapping_structure.test.sql`). Replace updates the existing
row; deactivate sets `active = false` on it; reactivate reuses it; only `map` inserts, and only when no row holds either identity.
The functions touch only `entity_type = 'player'` rows of the two new providers.

**One older path closed.** `api.resolve_football_mapping` (service role, SportsMonks ingestion) would create a player mapping for any
registered provider, so after registration it could have written Sofascore or Flashscore player mappings without review. The
functions migration replaces it with the identical text plus one guard (`MAPPING_REVIEW_REQUIRED`), pinned by an md5 preflight
(production's definition md5 `5d7ad20856e2bb22e2b7d44741e21be1` was read on 1 Oct 2026 and equals the repository text).

## 7. No mapping is created by the migration or by applying it

Local, CI and staging evidence: after the migrations the three tables are empty and
`count(football_provider_mappings where provider_name in ('sofascore','flashscore')) = 0` (asserted).

## 8. Rollback and forward correction

- **Before first use** (tables empty): a reviewed forward migration may drop the three tables and the 35 functions; nothing else
  depends on them (restore `api.resolve_football_mapping` to its previous text if the guard must go).
- **After first use**: no rollback by deletion. The proposal record and audit are immutable. Correct forward: `deactivate`
  (or `replace`, `reverse_ignore`) through the same two-person flow; the mapping row is updated, never inserted twice or deleted.
- **Stop the feature without a rollback**: revoke execute on the staff functions (`revoke execute ... from authenticated`) in a reviewed migration, or suspend the
  operators. Existing mappings keep working.
- Scheduling the expiry sweeper and the 90-day purge is NOT part of this change (database cron stays at zero until separately approved).

## 9. Evidence

- pgTAP: `football_player_mapping_structure.test.sql` 22 assertions, `football_player_mapping_workflow.test.sql` 195, registration test 11. Local
  disposable Postgres 16: all pass. CI `database-quality` is the authority.
- Negative controls by mutation: 44 faults injected into the migrations, every one caught (list below). One of them (a
  sportsmonks mapping proposed) is stopped by two layers; the second layer is the proposals table's own check.
- Unit tests: 136 (collector, builder, repository contract, adapter, mock).

| Injected fault                                                                      | Failing assertions |
| ----------------------------------------------------------------------------------- | ------------------ |
| self-approval: function check removed AND table check dropped                       | 7                  |
| self-approval: only the function check removed (table must still stop it)           | 7                  |
| propose without AAL2/recent auth                                                    | 3                  |
| approval without fingerprint check                                                  | 3                  |
| execution without re-validation                                                     | 4                  |
| deactivate does not deactivate                                                      | 3                  |
| reactivate does not reactivate                                                      | 3                  |
| execution does not resync candidates (map)                                          | 8                  |
| map allowed over an identity held by an inactive row                                | 1                  |
| map allowed for an ignored candidate                                                | 3                  |
| position disagreement hard-rejects                                                  | 5                  |
| position acknowledgement not required                                               | 2                  |
| app 1 January DOB gives a signal                                                    | 3                  |
| provider 1 January DOB gives a signal                                               | 1                  |
| invalid provider DOB is a conflict                                                  | 2                  |
| missing DOB lowers the rank                                                         | 1                  |
| incomplete squad lowers the rank                                                    | 2                  |
| multi-squad observation rejects the candidate                                       | 6                  |
| club mismatch rejects the candidate                                                 | 3                  |
| duplicate proposals: function check AND unique indexes removed                      | 1                  |
| duplicate proposals: only the function check removed (the index must still stop it) | 1                  |
| execution twice allowed                                                             | 1                  |
| approver qualification not rechecked                                                | 2                  |
| approval never expires                                                              | 3                  |
| purge too eager (10 days)                                                           | 3                  |
| execution not audited                                                               | 5                  |
| final proposals editable                                                            | 1                  |
| proposal payload editable                                                           | 1                  |
| names allowed in evidence                                                           | 1                  |
| builder writes a mapping row                                                        | 2                  |
| builder callable by signed-in users                                                 | 2                  |
| fingerprint includes a name                                                         | 2                  |
| reviewer availability counts the viewer                                             | 2                  |
| correction attributed to the executor, not the approver                             | 1                  |
| sportsmonks mapping can be proposed                                                 | 1                  |
| refresh keeps the old approval                                                      | 1                  |
| anyone can refresh                                                                  | 2                  |
| anyone can cancel                                                                   | 2                  |
| reject leaves candidates proposed                                                   | 1                  |
| sweeper does not expire                                                             | 2                  |
| ignore of an id in a lineup allowed                                                 | 1                  |
| mapping table gains a foreign key from the workflow                                 | 1                  |
| legacy ingestion path can create reviewed-provider player mappings                  | 3                  |
| legacy path guard blocks SportsMonks players too                                    | 1                  |
