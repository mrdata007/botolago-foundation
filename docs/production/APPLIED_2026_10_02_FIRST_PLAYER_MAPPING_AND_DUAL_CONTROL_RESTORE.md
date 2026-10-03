# Production: first player mapping, and the two-person rule restored (2026-10-02)

> **Latest state (same day, see section 3): the single-approver switch is ON again** by
> owner decision (controlled single-operator mapping mode). Section 2 below is the
> history of the temporary switch-off.

Three things happened on Production V2 (`tkewgajrljbwgwedqsxn`) on 2026-10-02, in this
order:

1. The first reviewed Sofascore mapping was written, by the owner, from the owner's
   authenticated MFA session, while the temporary single-approver switch was ON.
2. The single-approver switch was turned OFF again, so two different qualified
   people were required for every later mapping.
3. Later that day the owner decided there will be no mandatory second reviewer for now,
   and the switch was turned ON again (single-operator mapping mode).

The owner accepted the first mapping as the completed single-approver bootstrap test.
Result of step 2: `DUAL_CONTROL_RESTORED_FIRST_MAPPING_PRESERVED`.

## 1. The first mapping

| What                    | Value                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Provider / external id  | `sofascore` / `359280`                                                                                |
| Player                  | Ahmed Reda Tagnaouti                                                                                  |
| App player id           | `6c06addc-4cdc-4598-ba94-42221728122b`                                                                |
| Candidate id            | `166598ad-5934-44fa-aa40-a0ad69a4a010`                                                                |
| Mapping id              | `3f867678-cb4e-4362-99c3-a2850b34ccb0` (active, `manually_corrected = true`)                          |
| Proposal id             | `add2150a-4d34-4e7c-abf1-0017e68bc89d` (kind `map`, status `executed`)                                |
| Proposal fingerprint    | `a49daf64e02bf1a424f85df3c3d2918e710c601247860aa07b4affc1f667d7bc`                                    |
| Proposed                | 2026-10-02 16:51:06 UTC                                                                               |
| Approved                | 2026-10-02 16:51:33 UTC                                                                               |
| Executed                | 2026-10-02 16:52:15 UTC                                                                               |
| Self-approved           | **Yes.** The same person proposed, approved and executed it. No second reviewer took part.            |
| Audit events            | `football.mapping_proposed`, `football.mapping_approved`, `football.mapping_executed` (all succeeded) |
| Recorded before / after | before: no mapping row; after: exactly one row, Sofascore `359280` to the app player above            |

Evidence at proposal time, read from production just before the owner acted: date of
birth, shirt number (16), position (goalkeeper) and club (FAR Rabat) all matched; no
flags; no competing proposal; no existing Sofascore mapping for `359280` or for the
app player; the candidate was unmapped. The app player's other provider mapping
(SportsMonks) is untouched.

### Why this was done with one person

BotolaGO has one qualified operator. The owner decided on 2026-10-02 to allow
self-approval for a single controlled test (see `PLAYER_MAPPING_SINGLE_APPROVER_MODE.md`)
and to restore the two-person rule straight afterwards. MFA, recent sign-in, the
written reason, the fingerprint and evidence re-checks, and the separate execute step
all applied to the self-approval exactly as to any other.

### The reason as recorded, and what it should have said

The permanent reason on the proposal, the approval and the mapping row's
`correction_reason` reads:

> `claude testing`

That text is history and was **not** overwritten. The explanation that belongs with it:

> This was the first production player-mapping validation for the reviewed Sofascore
> identity workflow. The Sofascore identity `359280` was reviewed against Ahmed Reda
> Tagnaouti and executed as the controlled first production mapping while the
> temporary single-approver switch was enabled.

It does not claim a second reviewer. There was none.

**A database-level correction note does not exist.** `app_private.admin_audit_events`
is append-only by trigger (`admin_audit_events_append_only`), and there is no API that
attaches an explanatory note to an executed proposal, a mapping row or an earlier
audit event (the only mapping note feature, `api.admin_football_mapping_add_position_note`,
is for a position disagreement on a pending proposal). Inserting an audit row by hand
would have been an invented path, so none was written. This file is the durable
explanation. If a supported correction-note feature is wanted, it needs its own
reviewed migration.

## 2. Switching the single-approver mode off

`app_private.football_mapping_settings.allow_self_approval`: `true` to `false`, one
row, and nothing else.

| What                                                                     | Value                                                                                                                                    |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Reviewed script                                                          | `scripts/backend/data-mapping-single-approver-switch-off.sql`                                                                            |
| Script SHA-256 (rehearsal form, ends in `rollback;`)                     | `7bccbbe87c177019052a3fb0bbcdf26d0aacebe508345d368e693b860fea9eee`                                                                       |
| Commit version SHA-256 (`rollback;` turned into `commit;`, nothing else) | `c818db8db46120125cb9dbf88be34a7d7a2ccbd3bd919855d2d1133b80502f1f`                                                                       |
| Main commit                                                              | `0f2c7d2b683ce47b28cbca5113c35f4908e141e1` (PR #307)                                                                                     |
| Rehearsal (rolled back, nothing saved)                                   | [37039791371](https://github.com/mrdata007/botolago-foundation/actions/runs/37039791371), passed, production identical afterwards        |
| Real apply (once, never retried)                                         | [37039857030](https://github.com/mrdata007/botolago-foundation/actions/runs/37039857030), `DUAL_CONTROL_SWITCH_OFF_APPLIED_AND_VERIFIED` |

The script refuses to run unless: exactly one settings row, switch ON, exactly one
proposal and it is the executed first mapping, no pending/approved/held proposal,
1,542 mapping rows with exactly one reviewed-provider row (the first mapping, active),
1,004 candidates, 1,006 observations, the reviewed text of the functions that read
the switch, and no other database session writing. It requires exactly one row to be
updated. The workflow is owner-only, main-only, typed-confirmation, one attempt, shared
production mutation concurrency.

### Proof after the change

- `allow_self_approval = false`; still exactly one settings row.
- A rolled-back test call as the proposer (a call that ends in a deliberate error, so
  nothing could be saved), after the switch was off:
  - reviewer availability reported `selfApprovalAllowed: false`,
    `secondReviewerRequired: true`, `qualifiedReviewersAvailable: 0`;
  - the proposer's own approve call was refused with `self_approval_denied` (`PT403`).
    A re-read afterwards showed no new audit event, idempotency key or session.
- The screen shows **SECOND RELECTEUR QUALIFIÉ REQUIS** (Arabic: مطلوب مراجع ثانٍ مؤهَّل)
  whenever availability says a second reviewer is required (covered by the screen's
  server-render and browser tests).
- Not exercised in production, on purpose: refusing a self-approval of a _pending_
  proposal. That would need a real second proposal. The refusal is raised before the
  proposal's state is looked at, and the database tests for it run in CI.

## Proof that nothing else changed

Identical before and after the switch-off (read by the workflow, and again
independently):

|                                                                        | Before                                   | After            |
| ---------------------------------------------------------------------- | ---------------------------------------- | ---------------- |
| Proposals                                                              | 1 (executed)                             | 1 (executed)     |
| First proposal row digest (incl. `executed_before` / `executed_after`) | `c76c1e3124d30e330a5e2b6fc8ea8ed8`       | same             |
| Mapping rows                                                           | 1,542                                    | 1,542            |
| Reviewed-provider (Sofascore/Flashscore) rows                          | 1                                        | 1                |
| First mapping row digest                                               | `41e82d12a6a5dc65516ac91dad70c605`       | same             |
| All mappings digest                                                    | `ddd0f17b081892d7b5ce39026b0f5a94`       | same             |
| Candidates / mapped / unmapped                                         | 1,004 / 1 / 1,003                        | same             |
| Candidate observations                                                 | 1,006                                    | 1,006            |
| Audit events (digest of all)                                           | 9 (`6843d79681f74ebc3c2199a460eb2392`)   | same             |
| Players (digest)                                                       | 993 (`ee36b7bc300dcdc83ee36bb10e6dd516`) | same             |
| Cron jobs (digest)                                                     | 14 (`5e3bb0b2d3bfc5d697ff50dfe78cfd06`)  | same             |
| Fantasy gameweek digest, all 40 Fantasy table counts                   | unchanged                                | unchanged        |
| Latest migration                                                       | `20261002110000`                         | `20261002110000` |

No second proposal or mapping was created, approved or executed. Still not
authorised: a second proposal, bulk mapping, automatic proposals or approvals,
reconciler integration, mapping suggestions that write, and any Fantasy scoring change.

## 3. Later the same day: single-operator mapping mode restored (switch ON)

Owner decision, 2026-10-02: **no mandatory second human reviewer for now.** BotolaGO
operates in controlled single-operator mapping mode: the same qualified operator may
propose, self-approve and explicitly execute, as three separate deliberate actions.
The two-person rule stays in the database: `allow_self_approval = false` makes a
different human necessary again.

Result: `SINGLE_OPERATOR_MAPPING_MODE_RESTORED`.

| What                            | Value                                                                                                                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change                          | `app_private.football_mapping_settings.allow_self_approval`: `false` to `true`, one row, nothing else (the same reviewed switch; no second implementation, no migration)                  |
| Reviewed script                 | `scripts/backend/data-mapping-single-approver-switch-on.sql` (PR #309)                                                                                                                    |
| Script SHA-256 (rehearsal form) | `b45ca1bfa2bc0bf0d9101c1f775b0dac76bd0fbdcb97358688d3ed6bbcbae0dd`                                                                                                                        |
| Commit version SHA-256          | `e747160ed600041825b6ad1732dd86655cfe32e57ca1ca80c955d72ccfdc35a9`                                                                                                                        |
| Main commit                     | `07bb16011c0fa92ed659a450d1565b0838e93a5a`                                                                                                                                                |
| Rehearsal (rolled back)         | [37047028658](https://github.com/mrdata007/botolago-foundation/actions/runs/37047028658), passed, production identical afterwards                                                         |
| Real apply (once)               | [37047274663](https://github.com/mrdata007/botolago-foundation/actions/runs/37047274663), `SINGLE_OPERATOR_SWITCH_ON_APPLIED_AND_VERIFIED`                                                |
| Screen                          | PR #310 (live as release `07bb1601`): the banner **MODE RELECTURE PAR UN SEUL OPÉRATEUR** (Arabic: وضع المراجعة بمشغِّل واحد) shows only while the server's `selfApprovalAllowed` is true |

The script refused to run unless: exactly one settings row, switch OFF, exactly one
proposal and it is the executed first mapping, no pending/approved/held proposal,
1,542 mapping rows with exactly one reviewed-provider row, the first mapping row and
the proposal byte-identical, the first candidate the only mapped one, 1,004
candidates, 1,006 observations, the reviewed text of the functions that read the
switch, no Fantasy gameweek finalizing, and no other database session writing.

### What did not change

The workflow is still: review evidence, propose, review the exact proposal, approve,
then explicitly execute. Never propose-then-auto-approve; never approve-then-auto-execute;
no one-click mapping; no mapping from a ranking or category. `football.manage_mappings`, a
signed-in human, AAL2, recent sign-in, the written reason, the exact fingerprint, the
evidence re-check, idempotency, the append-only audit and the separate execute step are
all as they were.

### Behaviour proof (rolled back, nothing left in production)

One transaction in production that flipped the switch, exercised the live functions as the
lone reviewer, flipped it back, and ended in a deliberate error (a re-read showed
production back to the exact baseline):

- switch ON: availability `selfApprovalAllowed: true`, `secondReviewerRequired: false`,
  `qualifiedReviewersAvailable: 0`; the proposer's approve call is no longer refused (it
  reaches the state check: `proposal_not_pending`);
- no second factor: `mfa_assurance_insufficient`; stale sign-in: `recent_auth_required`;
- execution is its own call (`operation_already_executed` on the finished proposal);
- switch OFF again: `self_approval_denied`, and `secondReviewerRequired: true`.

Fingerprint, stale or moved evidence, and execution as a separate step were proven on the
repo's database tests, run on local Postgres 16 (231/231, section 15 and 12b) and in CI:
15.5 and 15.8 (the proposer approves their own proposal), 15.6 and 3.9 (another
fingerprint is refused), 7.16, 8.3, 10.13 and 12b.8 (moved evidence or a changed row holds
or refuses execution), 15.11 (a self-approved proposal executes as its own step), 15.14 and
15.15 (turning the switch off stops it and restores the refusal).

### After the switch was ON (independent read)

Switch `true`; one settings row; reviewer availability `selfApprovalAllowed: true`,
`secondReviewerRequired: false`. Identical to before: 1 proposal (executed), 0 open,
1,542 mapping rows, 1 reviewed-provider row, the first mapping active with digest
`41e82d12a6a5dc65516ac91dad70c605`, 1,004 candidates (1 mapped), 1,006 observations, 9
audit events (digest `6843d79681f74ebc3c2199a460eb2392`), cron digest
`5e3bb0b2d3bfc5d697ff50dfe78cfd06`, gameweek digest `9568bcf1c092fca15a0bdf9a08c117ca`, all
40 Fantasy table counts, latest migration `20261002110000`. No mapping, proposal or audit
event was created.

The original reason on the first mapping, "claude testing", is unchanged; the explanation
in section 1 remains documentation only. Still not authorised: a second proposal or
mapping, batch proposals, automatic approval or execution, reconciler integration,
candidate refresh, provider re-collection, and Fantasy scoring work.
