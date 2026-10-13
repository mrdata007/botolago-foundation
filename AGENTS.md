<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# BotolaGO agent operating context

Before any repository change, spec or plan, review decision, or repository-backed
environment/workflow action, read these files in order:

1. docs/context/project-overview.md — product, actors, flows, scope, and success criteria
2. docs/context/architecture.md — stack, boundaries, data, access model, and invariants
3. docs/context/ui-context.md — Design System V2, layouts, localization, and accessibility
4. docs/context/code-standards.md — implementation and verification conventions
5. docs/context/ai-workflow-rules.md — scoping, safety, Git, and delivery rules
6. docs/context/progress-tracker.md — dated status, active work, evidence, and blockers

Then read docs/specs/00-build-plan.md and the spec for the current unit. Existing
domain plans and runbooks under docs/backend, docs/production, docs/qa, and
docs/admin remain authoritative for their detailed operational procedures.

Use one delivery lifecycle: Proposed, Approved, In progress, Implemented, CI
verified, and Merged. Track preview, staging, and production evidence
independently; none of those states implies another.

Use the current code, Git history, pull request checks, and protected runtime
evidence to verify claims. Documentation is an index, not proof of live state.
If documentation conflicts with current implementation or newer evidence,
record the discrepancy in docs/context/progress-tracker.md before proceeding.

Update the relevant context file whenever implementation changes product scope,
architecture, UI conventions, code standards, or release controls. Use the
current unit spec as the branch-local journal. Update the shared progress
tracker only for integration-level state changes.
