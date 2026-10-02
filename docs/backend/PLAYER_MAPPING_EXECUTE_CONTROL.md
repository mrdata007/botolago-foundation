# Player mapping: the Execute control

An approved player-mapping proposal is executed from the admin screen, one
proposal at a time, by a signed-in staff member. Approving maps nothing; only
this step writes the mapping.

## The flow, as the person sees it (`/admin/football/player-mappings`)

1. Open a proposal. Propose, approve (the same person while single-approver mode
   is on, otherwise a different person), as before.
2. Once the proposal is **approved and not expired**, an "Execute this approved
   proposal" panel appears under it. It is not drawn for a pending, rejected,
   cancelled, held, expired or already-executed proposal, nor when writes are
   switched off, nor for a person without `football.manage_mappings`.
3. The panel shows the **exact fingerprint** and the **target**: provider,
   provider id, app player id, the kind of decision, and the candidate's name
   when the queue has it.
4. The button stays disabled until `EXECUTE_PLAYER_MAPPING` is typed exactly
   (surrounding spaces ignored). Pressing Enter in the field does nothing; only
   the button runs it.
5. Pressing the button calls, in order:
   1. `api.admin_football_mapping_get_proposal` (read), to re-read the proposal
      now. If it is no longer approved, is expired, or its fingerprint differs
      from the one shown, nothing is executed.
   2. `api.admin_football_mapping_execute(p_proposal_id, p_idempotency_key)`, the
      reviewed RPC. One idempotency key is kept per proposal for the life of the
      screen, so a double press or a retry after a lost answer replays the same
      operation and can never write twice.
6. On success the screen keeps a result banner ("one row written: provider id
   now designates this player") after the panel has gone. A held outcome
   (`stale_evidence`, `identity_conflict`, `already_mapped`) or a refusal is
   shown in words and nothing is written.

## What the database still enforces (unchanged, and re-checked on every call)

`api.admin_football_mapping_execute` requires an authenticated staff session,
AAL2 (second factor), a recent sign-in (15 minutes) and
`football.manage_mappings`. It recomputes the stored row's fingerprint and
refuses any difference (`fingerprint_mismatch`), refuses an approval older than
24 hours (`approval_expired`), re-validates the evidence in the same transaction
(`stale_evidence`, `identity_conflict`, `already_mapped`), refuses an approver
who is no longer qualified, refuses a self-approval if the single-approver switch
has since been turned off, refuses a second execution
(`operation_already_executed`), and writes the mapping row, the candidate state,
the proposal's before/after and the audit event in one transaction, once.

## Why there is no bypass path

- The browser calls only the repository's `executeMappingProposal`, which is an
  RPC to `admin_football_mapping_execute` with the signed-in user's own token.
  It holds no service-role key and has no direct table access: the mapping,
  candidate and proposal tables have forced row-level security and no grants to
  any API role.
- The function is granted to `authenticated` only; `anon` and `service_role`
  cannot run it (structure test).
- The screen has no call to the generic resolver (`api.resolve_football_mapping`,
  which refuses to create Sofascore/Flashscore player mappings anyway), no direct
  insert, no batch execute (`executeMappingBatch` is not reachable from the
  screen) and no execution after approval: approving never calls execute.
- The typed phrase and the re-read are additions on the screen; they cannot
  loosen anything the database checks.

## Tests

- `execute-actions.test.ts`: success writes exactly one mapping for exactly this
  pairing; nothing unrelated changes; a different fingerprint, a stored row that no
  longer matches its seal, moved evidence, a taken target, a second execution,
  a missing second factor, a stale sign-in and an unqualified person are all
  refused; a retry reuses its key; no bulk action exists.
- `PlayerMappingsView.ssr.test.tsx`: the control exists only for an approved,
  unexpired proposal, shows the fingerprint and target, waits for the phrase, and
  is French and Arabic (right to left, phrase left to right).
- `tests/e2e/player-mappings.sample.e2e.ts`: the whole flow in a browser on
  invented data, the typed phrase, keyboard-only use, Arabic, and a 390px phone.
- pgTAP `football_player_mapping_workflow.test.sql` section 12b: at the database,
  the refusals (not staff, no permission, no AAL2, stale sign-in, tampered
  fingerprint, pending, already executed) and the single successful write.
