# Player mapping: single-approver mode

Owner decision, 2026-10-02. While BotolaGO has one qualified operator, that
operator may approve their own mapping proposal. The two-person design is not
removed: it is behind a switch in the database, and turning the switch off
brings it back with no other change.

> **Status, 2026-10-02 (latest): the switch is ON (single-operator mapping mode).**
> History the same day: ON for the first controlled mapping, OFF again
> (`scripts/backend/data-mapping-single-approver-switch-off.sql`, run 37039857030),
> then ON by owner decision (`scripts/backend/data-mapping-single-approver-switch-on.sql`,
> apply run 37047274663). The owner decided there will be no mandatory second human
> reviewer for now: the same qualified operator may propose, self-approve and
> explicitly execute, as three separate deliberate actions. The two-person rule is not
> removed; turn the switch off and a different person is required again. The screen
> shows **MODE RELECTURE PAR UN SEUL OPÉRATEUR** while the server says self-approval is
> allowed. See `docs/production/APPLIED_2026_10_02_FIRST_PLAYER_MAPPING_AND_DUAL_CONTROL_RESTORE.md`.

## What the switch is

`app_private.football_mapping_settings` holds one row.
`allow_self_approval = true` means the person who proposed a mapping may also
approve or reject it. `false` means a different person must decide, exactly as
before. The row is never reachable from the browser or the service role; it is
changed only by a guarded SQL script the owner runs.

The migration is `20261002100000_football_mapping_single_approver_switch.sql`.
It is forward-only: the two earlier mapping migrations are untouched, and the
functions that refused a self-approval are replaced.

## What stays exactly as it was, for a self-approval too

- `football.manage_mappings`, verified second factor (AAL2) and recent sign-in
  on every call.
- A written reason (10 to 500 characters) and approval of the exact fingerprint
  shown on screen.
- The evidence re-check at approval and again at execution; a changed world
  holds the proposal.
- A proposal expires after 72 hours, an approval after 24 hours.
- Execution is a separate, explicit step (see
  `PLAYER_MAPPING_EXECUTE_CONTROL.md`). Approving maps nothing.
- No wait between proposing and approving (owner decision).

## What is new

- `football_player_mapping_proposals.self_approved`: a generated column, true
  when the person who decided is the person who proposed. It cannot be set, only
  derived.
- The audit trail carries `selfApproved` on the approval, rejection and
  execution events.
- A trigger refuses a self-decision at the table while the switch is off, so
  the rule holds whatever calls the table.
- An approval a proposer gave themselves stops being executable the moment the
  switch is turned off (`self_approval_no_longer_allowed`).
- The reviewer-availability call also returns `selfApprovalAllowed`. With the
  switch on, the screen does not show "second qualified reviewer required"; it
  shows a plain warning that nobody else checks the proposal.

## The risk

A wrong pairing feeds player scores and statistics with no independent check.
The safeguards above reduce that; they do not remove it. Review the
`selfApproved` audit events periodically.

## Turning the two-person rule back on

Run, as the owner, through the same reviewed path as any production write:

```sql
update app_private.football_mapping_settings set allow_self_approval = false;
```

Pending proposals then wait for a second person; self-approved proposals not yet
executed are refused at execution. Executed mappings are not touched.

## Tests

- pgTAP `football_player_mapping_workflow.test.sql`, sections 1 to 14 run with
  the switch off (the two-person rule), section 15 with it on.
- pgTAP `football_player_mapping_structure.test.sql`: the table check is gone,
  the trigger exists, `self_approved` is generated.
- Unit and server-rendering tests, and the browser tests in
  `tests/e2e/player-mappings.sample.e2e.ts` (`selfapprove=1` on the sample page).
- A negative control: with the switch function forced to `true` the two-person
  tests fail; forced to `false` the section 15 tests fail.

## Getting it onto production

The migration is applied only through the reviewed path, never from this
repository alone.

1. **Rehearsal (this change).** `scripts/backend/apply-20261002100000-mapping-single-approver.sql`
   runs the migration inside one transaction on Production V2, checks it, and
   ends in its own `rollback;`. The workflow
   `production-mapping-single-approver-rehearsal.yml` (owner only, from `main`,
   typed confirmation) runs it, reads production before and after, and fails
   unless the two reads are identical. It has no commit mode.
2. **Apply (a separate, later change).** Only after the owner has seen the
   rehearsal and approved that one operation.
3. **Publish** in Lovable so the screen updates.

The preflight stops the script, and changes nothing, if production is not
exactly what was reviewed: the four replaced functions are the reviewed text,
there is no proposal at all, 1,004 candidates and 1,541 mapping rows, nobody
else is working, and no scheduled job or Fantasy finalization is running.
