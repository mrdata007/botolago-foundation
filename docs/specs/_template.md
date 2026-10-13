# Unit NN — Feature or outcome name

## Status

| Field                     | Value                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Lifecycle                 | Proposed                                                                                                                             |
| Disposition               | Active                                                                                                                               |
| Spec revision             | 1                                                                                                                                    |
| Approved revision         | Not approved                                                                                                                         |
| Owner                     | Unassigned                                                                                                                           |
| Durable central claim     | Not claimed; canonical draft PR URL                                                                                                  |
| Claim branch              | agent/unit-NN                                                                                                                        |
| Integration target        | TBD                                                                                                                                  |
| Baseline SHA              | TBD                                                                                                                                  |
| Target environment        | Local / preview / staging / production / none; informational only                                                                    |
| Required approval classes | Product / repository-governance / security / database / release / legal/commercial / infrastructure / external-communications / none |
| Blocker                   | None                                                                                                                                 |

Allowed lifecycle values: Proposed, Approved, In progress, Implemented, CI
verified, Merged.

Allowed dispositions: Active, Blocked, Superseded, Cancelled.

An AI agent cannot approve its own spec or authorize an environment action.
Every required class must have its own named human decision and durable evidence
before the unit advances to Approved.

This unit spec is authoritative for lifecycle, disposition, approval, owner,
claim, and evidence. docs/specs/00-build-plan.md records sequencing only.

Once Approved, the approved revision is frozen. A material change to the goal,
non-goals, affected boundaries, security model, verification plan, release
controls, claim branch, integration target, or target environment must increment
Spec revision, reset Lifecycle to Proposed, clear Approved revision, and receive
fresh approval.
Record non-material clarifications without clearing approval. If an authorized
environment action's exact SHA or environment identity changes, void that row's
authorization and obtain a new named decision; reset the spec only if scope or
controls also changed.

If the baseline SHA moves, inspect its diff against the approved baseline and
record the drift review. Update the baseline without reapproval only when the
review proves that assumptions, boundaries, risks, verification, and release
controls are unchanged. Otherwise revise the spec and return it to Proposed.

## Spec approval record

Each applicable class receives an independent approval. Mark irrelevant classes
No or remove them. Use none only when every class is irrelevant and explain why.

| Approval class          | Required? | Approver | Date | Approved revision and scope | Durable evidence |
| ----------------------- | --------- | -------- | ---- | --------------------------- | ---------------- |
| Product                 | No        |          |      |                             |                  |
| Repository-governance   | No        |          |      |                             |                  |
| Security                | No        |          |      |                             |                  |
| Database                | No        |          |      |                             |                  |
| Release                 | No        |          |      |                             |                  |
| Legal/commercial        | No        |          |      |                             |                  |
| Infrastructure          | No        |          |      |                             |                  |
| External-communications | No        |          |      |                             |                  |

## Goal

Describe one concrete, independently verifiable outcome in one or two
sentences.

## User or operator value

State who benefits and what they can do or prove when this unit is complete.

## Non-goals

- Explicitly excluded behavior
- Adjacent work that belongs in another unit
- Production or provider actions that are not authorized by this spec

## Baseline and evidence

- Current implementation:
- Relevant PRs/issues:
- Existing tests:
- Latest applicable runbook:
- Known drift or contradictions:

## Affected boundaries

- Routes/components:
- Services/repositories:
- API/RPC/contracts:
- Database/storage:
- Edge Functions/providers:
- Workflows/deployment:
- Documentation:

Remove boundaries that are genuinely unaffected.

## Product and design

### Flow

Describe the start-to-finish behavior, including guest, authenticated, staff, or
operator states as applicable.

### UI and responsive behavior

Reference docs/context/ui-context.md and name any unit-specific layout, state,
or responsive decisions.

### French, Arabic, and accessibility

- French copy/behavior:
- Arabic/RTL copy/behavior:
- Keyboard and screen-reader behavior:
- Touch, focus, contrast, reduced motion, and zoom risks:

## Data and API contract

### Inputs

Define validated input, actor, idempotency, version, pagination, and deadline
requirements.

### Outputs

Define the authoritative success shape, empty/unavailable states, and stable
errors.

### Ownership and caching

Define RLS/permission enforcement and cache source/actor scope.

## Security and privacy

- Authentication and authorization:
- RLS/grants:
- Secret handling:
- Log/artifact sanitization:
- Abuse/rate limits:
- Licensing/attribution:

## Implementation

### Step 1 — Boundary name

Describe the smallest implementation step and exact files or contracts it owns.

### Step 2 — Boundary name

Describe the next independently reviewable step.

## Migration and rollback

- Migration required: Yes / No
- Forward-only migration:
- Backfill:
- Compatibility window:
- Rollback or forward repair:
- Cleanup:

If no migration applies, explain why.

## Observability

- Logs/metrics:
- Readiness or canary verdict:
- Bounded evidence:
- Alerts and ownership:

## Dependencies

- Existing code/data prerequisite
- New package only when unavoidable, with reason
- External product/legal/infrastructure decision

## Verification plan

### Focused checks

- [ ] Unit or contract tests
- [ ] Relevant component/route tests

### Application checks

- [ ] bun run format:check
- [ ] bun run typecheck
- [ ] bun test
- [ ] bun run lint
- [ ] bun run build
- [ ] Relevant Playwright projects

### Database checks, when applicable

- [ ] bun run backend:migrations:check
- [ ] bun run backend:secrets:check
- [ ] bun run backend:db:start
- [ ] bun run backend:db:reset
- [ ] bun run backend:db:test
- [ ] bun run backend:db:lint
- [ ] bun run backend:types:check
- [ ] bun run backend:db:stop

### Manual or protected evidence

- [ ] French LTR at affected widths
- [ ] Arabic RTL at affected widths
- [ ] Keyboard/screen-reader/touch behavior
- [ ] Two-user ownership/isolation
- [ ] Exact-SHA staging or provider canary
- [ ] Capacity/soak, only when this unit owns it

Delete checks that are demonstrably irrelevant and explain the risk-based
selection in the PR.

## Release controls

- Feature/data-mode flag:
- Preview configuration:
- Staging promotion:
- Protected environment actions required (name exact rows below):
- Exact-SHA requirement:
- Rollback trigger and owner:

Implementation approval does not imply any environment authorization.

## Environment execution authorization and evidence

Environment actions are orthogonal to the delivery lifecycle. Use Not required,
Not authorized, Authorized, Verified, Failed, or Rolled back as applicable. Each
action has its own authorization, and each required approval class has its own
detail record. Unit-spec approval does not authorize an environment action. The
same human may cover multiple classes only through explicit separate records.

| Environment action                             | Status         | Required classes        | Authorization record IDs | Exact SHA | Environment identity |
| ---------------------------------------------- | -------------- | ----------------------- | ------------------------ | --------- | -------------------- |
| Preview deployment                             | Not authorized |                         |                          |           |                      |
| Preview certification                          | Not authorized |                         |                          |           |                      |
| Preview sharing                                | Not authorized | External-communications |                          |           |                      |
| Staging execution                              | Not authorized |                         |                          |           |                      |
| Production migration                           | Not authorized |                         |                          |           |                      |
| Production Supabase API platform configuration | Not authorized |                         |                          |           |                      |
| Production application deployment              | Not authorized |                         |                          |           |                      |
| Production Identity configuration              | Not authorized |                         |                          |           |                      |
| Production Admin bootstrap/activation          | Not authorized |                         |                          |           |                      |
| Production data mutation (bounded)             | Not authorized |                         |                          |           |                      |
| Production current-season initialization       | Not authorized |                         |                          |           |                      |
| Production Fantasy catalog staging             | Not authorized |                         |                          |           |                      |
| Production Fantasy registration opening        | Not authorized |                         |                          |           |                      |
| Production data/content provider activation    | Not authorized |                         |                          |           |                      |
| Production notification-delivery activation    | Not authorized |                         |                          |           |                      |
| Production worker activation                   | Not authorized |                         |                          |           |                      |
| Production schedule activation                 | Not authorized |                         |                          |           |                      |
| Post-launch verification                       | Not authorized |                         |                          |           |                      |
| Rollback action                                | Not authorized |                         |                          |           |                      |

Do not mark an action Authorized until every required class has a detail record
for the same exact SHA, environment identity, and scope.

Use Production data mutation (bounded) only for a write that has no more
specific action row. Current-season initialization, Fantasy catalog staging,
and Fantasy registration opening never inherit or share the generic mutation
authorization; each requires its own records.

| Record ID | Environment action | Approval class | Approver | Date | Exact SHA | Environment identity | Approved scope | Durable evidence |
| --------- | ------------------ | -------------- | -------- | ---- | --------- | -------------------- | -------------- | ---------------- |
| AUTH-001  |                    |                |          |      |           |                      |                |                  |

## Documentation updates

- [ ] Project overview, if scope changed
- [ ] Architecture, if boundaries/invariants changed
- [ ] UI context, if design conventions changed
- [ ] Code standards or workflow rules, if conventions changed
- [ ] Progress tracker, only if an integration-level state changed
- [ ] Domain runbook

## Verify when done

- [ ] The declared outcome works end to end within scope.
- [ ] Non-goals were not implemented.
- [ ] Architecture invariants hold.
- [ ] Live mode remains fail closed.
- [ ] No generated artifact was hand-edited.
- [ ] Any protected source-owned boundary changed only within approved scope and
      passed its required review and tests.
- [ ] No secret, raw protected payload, or unlicensed asset was introduced.
- [ ] Required FR/AR, RTL, accessibility, and responsive behavior passed.
- [ ] Required automated and protected checks passed.
- [ ] Evidence links identify the exact commit and environment.
- [ ] Lifecycle status reflects only the highest proven state.

## Evidence

PR reviews, checks, workflow runs, deployments, and protected-environment
records are authoritative exact-SHA evidence. Do not make a self-referential
docs-only commit merely to fill this table.

| Delivery state | Prior commit / PR / run | Date | Human reviewer |
| -------------- | ----------------------- | ---- | -------------- |
| Approved       |                         |      |                |
| Implemented    |                         |      |                |
| CI verified    |                         |      |                |
| Merged         |                         |      |                |

## Open questions

- Decision, owner, and blocking effect
