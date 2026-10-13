# BotolaGO AI workflow rules

## Approach

Build BotolaGO incrementally from approved, independently verifiable specs. Use
the context files to preserve architecture and product intent, the current unit
spec to define scope, GitHub checks to verify code, and protected runtime
evidence to verify environments. Never substitute a plausible assumption for
evidence.

## Before changing anything

1. Read AGENTS.md and all six context files in the declared order.
2. Read docs/specs/00-build-plan.md and the current unit spec.
3. Inspect the current branch, claim branch, integration target, head SHA,
   working tree, open PRs, and relevant recent checks.
4. Inspect the implementation and tests at every affected boundary.
5. Read the latest applicable backend, production, QA, or Admin runbook.
6. Reconcile stale documentation or add the discrepancy to progress-tracker.md.
7. Confirm that the requested action does not require separate production,
   provider, migration, worker, schedule, deployment, rollback, or
   external-communications authority.
8. Confirm the unit spec names one owner and one branch. Do not start a second
   active implementation of the same unit.

## Scoping rules

- Work on one independently verifiable outcome at a time.
- Do not combine unrelated product domains in one unit.
- Split UI shell work from live data wiring when each can be verified
  independently.
- Split schema/API work from provider activation and production promotion.
- Include coherent adjacent contract, test, localization, accessibility, and
  documentation changes required by the outcome.
- Do not opportunistically refactor unrelated code.
- Do not install a dependency until the current unit needs it and existing
  capabilities are insufficient.
- Record explicit non-goals in every feature spec.

## When to split work

Split the unit when it combines any of the following without one atomic safety
reason:

- Multiple unrelated routes or domain services
- UI redesign and database migration
- Database migration and production execution
- Provider adapter and commercial activation
- Functional feature and capacity/soak certification
- Demo publishing and live publishing
- A change too broad to verify end to end with one bounded evidence set

Backend work does not need a visible UI result, but it must produce an
independently verifiable contract, invariant, or operational result.

## Handling missing or ambiguous requirements

- Do not invent product behavior, scoring, licensing rights, provider facts,
  roles, permissions, or release state.
- If ambiguity changes user behavior, security, data, cost, or scope, stop and
  obtain a decision before implementation.
- If a safe reversible default exists within the approved scope, document it in
  the spec before using it.
- If live data is missing or invalid, fail closed with an explicit unavailable
  state.
- Add unresolved items to the current spec and progress-tracker.md with owner and
  decision required.
- Treat .lovable/plan.md as historical tool context until it is reconciled with
  current code and deliberately migrated into docs/specs. It is not a second
  active planning authority.

## Security and production rules

- Work only against Production V2 contracts. Leave Legacy untouched.
- Never expose or repurpose credentials.
- Never bypass RLS, ownership, permission, MFA, recent-auth, dual-control,
  confirmation, concurrency, exact-SHA, or evidence safeguards.
- Never make a production build succeed by enabling mock/local fallback.
- Never run a protected staging or production workflow without the required
  authorization, environment identity, exact confirmation, and reviewed SHA.
- Never activate a provider, publisher, worker, schedule, migration, deployment,
  or production data mutation as a side effect of implementation.
- Keep demo and live release paths separate. Never promote the demo artifact.
- Sanitize logs and artifacts before retention or publication.

## Protected files and history

- Preserve the LOVABLE block in AGENTS.md byte-for-byte.
- Never force-push, rebase, amend, or squash already-pushed Lovable-connected
  history.
- Keep every pushed connected branch in a working state.
- Do not hand-edit src/routeTree.gen.ts.
- Do not hand-edit src/backend/generated/database.types.ts; use the generation
  and drift-check commands.
- Do not hand-edit generated Supabase integration files that carry do-not-edit
  banners, including client, server client, auth attachment/middleware, and
  compatibility types.
- Treat src/routes/mcp.ts, src/routes/[.mcp]/**, and
  src/routes/[.well-known]/** as intentionally source-owned security
  boundaries. Change them only in an explicit MCP/demo-containment unit, preserve
  their demo guards, and do not allow regeneration tooling to overwrite them.
- Do not edit an applied migration; add a forward repair.
- Keep bun.lock frozen unless the current unit intentionally changes a dependency
  through Bun.

## Protected operational surfaces

- Changes to .github/workflows/\*\*, production activation/canary scripts,
  deployment configuration, .env.production, .env.demo, supabase/config.toml, or
  production runbooks require Approved security and release rows when applicable
  and a named reviewer for the affected control.
- Changes to migrations, grants, RLS, API/RPC authority, or generated V2 types
  require an Approved database/security-owned spec and reviewer.
- Changing a safeguard requires tests that prove the safeguard still fails
  closed. Never weaken a control merely to make a workflow pass.
- Editing a protected control does not authorize executing it.

## Spec lifecycle and approval

Every unit uses this single lifecycle:

1. Proposed
2. Approved
3. In progress
4. Implemented
5. CI verified
6. Merged

Track Active, Blocked, Superseded, or Cancelled as a separate disposition.
Never use a blocker or disposition as a lifecycle stage.

Track preview deployment, preview certification, preview sharing, staging
execution, production migration, production Supabase API platform configuration,
production application deployment, production Identity configuration,
production Admin bootstrap/activation, bounded production data mutation,
production current-season initialization, production Fantasy catalog staging,
production Fantasy registration opening, production data/content provider
activation, production notification-delivery activation, production worker
activation, production schedule activation, post-launch verification, and
rollback as independent environment evidence. An unmerged commit may have
bounded preview or staging evidence; that evidence does not make it Merged.
Likewise, a merge does not prove any environment state.

- An AI agent must never advance a unit from Proposed to Approved.
- Approved requires a named human approver, date, approval class, and durable
  decision record such as a PR review, issue comment, or approved spec.
- Product, repository-governance, security, database, release,
  legal/commercial, infrastructure, and external-communications are distinct
  approval classes; record every class required by the unit in a separate
  approval row with approver, date, approved revision/scope, and durable
  evidence. The same person may cover multiple classes only by explicitly
  approving each row.
- Preview deployment, preview certification, preview sharing, staging execution,
  production migration, production Supabase API platform configuration,
  production application deployment, production Identity configuration,
  production Admin bootstrap/activation, bounded production data mutation,
  production current-season initialization, production Fantasy catalog staging,
  production Fantasy registration opening, production data/content provider
  activation, production notification-delivery activation, production worker
  activation, production schedule activation, post-launch verification, and
  rollback each require their own named human authorization when applicable.
  Preview sharing also requires explicit external-communications authorization.
- Bounded production data mutation is not a blanket grant. Current-season
  initialization, Fantasy catalog staging, and Fantasy registration opening
  never inherit it and each requires its own authorization records.
- Update only the stage supported by evidence. Do not mark a unit complete
  merely because code exists.
- Once Approved, the spec is frozen at its approved revision. A material change
  to the goal, non-goals, affected boundaries, security model, verification
  plan, release controls, claim branch, integration target, or target environment
  increments the spec revision, resets the lifecycle to Proposed, and requires
  fresh approval.
  Record non-material clarifications in the spec without clearing approval.
- Changing an exact SHA or environment identity after an environment action is
  authorized voids that action's authorization and requires a new named decision.
  It does not reset the unit spec unless scope or controls also changed.
- If the baseline SHA moves, inspect and record the drift before continuing.
  Update it without reapproval only when assumptions, boundaries, risks,
  verification, and release controls are unchanged; otherwise revise the spec,
  reset it to Proposed, and obtain fresh approval.
- The unit spec is authoritative for lifecycle, disposition, approval, owner,
  and evidence. The build plan records only ordering and dependencies.

GitHub PR checks, reviews, workflow runs, deployments, and protected-environment
records are the authoritative exact-SHA evidence. In-repository specs may
reference a prior implementation SHA, but must not create a new docs-only commit
solely to embed the SHA of the commit containing the document. A docs-only
follow-up does not inherit verification for its new head; its PR checks establish
that evidence externally.

## Implementation loop

1. Confirm the ordered unit is Active. Search branches and open/closed PRs for
   its ID. Atomically create its one fixed claim branch, agent/unit-NN, from the
   proposed baseline; if it already exists, inspect the existing claim and do
   not create an alternate.
2. Commit the Proposed spec to the claim branch and open its one canonical draft
   PR against the proposed integration target. The PR URL, one named owner,
   branch, and baseline SHA form the durable claim. A branch-local status edit,
   issue comment, or second PR is not a claim.
3. Obtain durable per-class approval for that exact spec revision through the
   canonical PR. Record the approvals and claim URL, then advance the spec to
   Approved and In progress before implementation. Do not approve an
   uncommitted or off-branch draft.
4. Transfer ownership only through a durable comment on the canonical PR, an
   assignee change, and a matching spec update. To release or abandon a claim,
   record the reason and set Blocked, Cancelled, or Superseded on that same PR;
   do not silently open another claim.
5. Implement only the declared outcome.
6. Run focused checks while iterating.
7. Review the diff for scope, secrets, generated files, localization, and
   architecture invariants.
8. Run the risk-based closing matrix from code-standards.md.
9. Update affected context, runbook, and the branch-local unit spec.
10. Re-fetch the integration target head before commit and again before push. If
    it moved, stop and perform the required baseline drift review without
    rewriting pushed history.
11. Commit to the canonical claim branch with a precise message.
12. Update the existing draft PR and record the exact implementation/check
    evidence there. Do not merge or deploy unless separately directed.

## Documentation synchronization

Update project-overview.md when actors, flows, features, scope, or success
criteria change.

Update architecture.md when stack, boundaries, storage, auth, data mode,
operational model, or invariants change.

Update ui-context.md when tokens, components, layouts, localization, or
accessibility conventions change.

Update code-standards.md when implementation or verification rules change.

Update this file when agent operating rules or protected boundaries change.

Update progress-tracker.md only for integration-level transitions such as a
canonical branch decision, merge, staging verdict, blocker change, or production
environment verdict. Keep iteration notes and unit evidence in the branch-local
spec and external PR/check records.

## Verification rules

- Use Bun commands from package.json, not generic npm examples.
- Run the smallest useful focused check during iteration and the required risk
  matrix before closing.
- Do not skip a failing test as unrelated without evidence.
- Do not weaken tests, lint, types, RLS, or gates to obtain green status.
- A docs-only change does not require live gates, but its paths, links, SHAs,
  dates, status claims, and Markdown must be checked.
- A technically successful provider probe is not a ready verdict unless its
  resource evidence passes readiness conditions.
- A successful Vercel status is not end-to-end certification of its environment.
- Preserve failure evidence only when it is sanitized and allowed by the
  applicable workflow.

## Git and review rules

- Branch from the intended integration baseline, not an arbitrary stale main.
- Never write directly to main.
- Keep commits focused and leave unrelated user changes untouched.
- Do not rewrite pushed history.
- Use a draft PR while data, review, staging, or production prerequisites remain.
- State exclusions and unverified claims plainly in the PR description.
- Keep implementation PRs reviewable; production activation remains a separate
  explicit action.

## Before moving to the next unit

Confirm all of the following:

1. The unit's declared outcome works within scope.
2. No architecture invariant was violated.
3. French/Arabic, RTL, accessibility, error, and responsive risks were covered
   where applicable.
4. Required application/database/browser checks passed.
5. No credential, raw protected data, or unlicensed asset was introduced.
6. Documentation and the unit status match the evidence.
7. Remaining questions and later gates are explicitly recorded.
