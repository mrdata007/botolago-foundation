# Unit 00 — Context and spec governance

## Status

| Field                     | Value                                                                           |
| ------------------------- | ------------------------------------------------------------------------------- |
| Lifecycle                 | Implemented                                                                     |
| Disposition               | Active                                                                          |
| Spec revision             | 1                                                                               |
| Approved revision         | 1, for the bootstrap implementation only                                        |
| Owner                     | @mrdata007 is accountable; Codex prepares agent/unit-00                         |
| Durable central claim     | Pending publication; replace with the canonical Unit 00 draft PR URL in this PR |
| Claim branch              | agent/unit-00                                                                   |
| Integration target        | agent/launch-readiness-milestones                                               |
| Baseline SHA              | 1d87fb2cb7c38e1fd3576412092bf9ca47e0fb69                                        |
| Target environment        | None                                                                            |
| Required approval classes | Repository-governance                                                           |
| Blocker                   | Durable GitHub review and approval before merge                                 |

Bootstrap note: the repository owner explicitly requested this methodology
before the repository had a place to store a spec, so revision 1 and its
implementation draft were prepared together. That one-time authorization covers
implementation only; it does not authorize merge or any environment action.
Durable GitHub review is still required. This bootstrap exception does not apply
to later units. The central claim is pending only until agent/unit-00 and its
draft PR are published; the PR URL must then replace the pending value.

## Spec approval record

| Approval class        | Required? | Approver   | Date       | Approved revision and scope              | Durable evidence                                                                           |
| --------------------- | --------- | ---------- | ---------- | ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| Repository-governance | Yes       | @mrdata007 | 2026-08-09 | Revision 1 bootstrap implementation only | Originating work request mirrored in the canonical draft PR; GitHub merge approval pending |

## Goal

Add a BotolaGO-specific, evidence-aware context and spec system that future
agents must read before implementation, without changing application, database,
workflow, demo, staging, or production behavior.

## User or operator value

The repository owner and future contributors receive one stable orientation
layer for product scope, architecture, UI, standards, workflow, current
cross-project state, and launch ordering. Feature work can then be divided into
approved, independently verifiable units instead of broad prompts.

## Non-goals

- Do not implement or merge PR #123.
- Do not close, supersede, or reconcile another PR.
- Do not run staging or production workflows.
- Do not mutate Supabase, Vercel, Lovable, providers, workers, schedules, or
  production data.
- Do not replace detailed domain runbooks.
- Do not treat .lovable/plan.md as an active second spec authority.

## Baseline and evidence

- Main: ea0e98911c2e4d1ce1e93f716dd7183e31d32276
- Launch candidate: PR #123,
  agent/launch-readiness-milestones at
  1d87fb2cb7c38e1fd3576412092bf9ca47e0fb69
- Application evidence: Backend quality run 31252766070
- Partial protected staging evidence: Phase 6.5 run 31253017824
- Existing entry point: root AGENTS.md with a Lovable-managed protected block
- Existing detailed authority: docs/backend, docs/production, docs/qa, and
  docs/admin

## Affected boundaries

- AGENTS.md — append the ordered context entry point while preserving the
  Lovable block byte-for-byte
- .prettierignore — prevent Prettier from rewriting the protected block
- docs/context — six BotolaGO-specific context files
- docs/specs — launch build plan, this bootstrap spec, and the reusable template

No runtime boundary is affected.

## Product and design

No product UI changes. Documentation must describe the actual French/Arabic,
responsive Design System V2 and distinguish main, draft-branch, partial staging,
demo, and production states accurately.

## Security and privacy

- Do not include credentials, filled environment values, raw provider payloads,
  or private user data.
- Preserve fail-closed V2, RLS, exact-SHA, production separation, and evidence
  rules.
- Correctly classify the MCP transport routes as source-owned security
  boundaries whose demo guards must be maintained.

## Implementation

1. Audit the attached Six-File Context Methodology and identify generic examples,
   errors, and assumptions that do not apply to BotolaGO.
2. Inspect main, PR #123, package scripts, route/UI/data boundaries, open PRs,
   checks, and current blockers.
3. Add the six context files with observed-at dates and evidence caveats.
4. Add a launch-oriented build plan split into independently verifiable units.
5. Add a spec template with approval, lifecycle, disposition, security,
   localization, rollback, observability, release, and evidence fields.
6. Append AGENTS.md and isolate its Lovable block from formatting.

## Migration and rollback

- Migration required: No
- Rollback: revert only this documentation/configuration commit
- Cleanup: none

## Verification plan

- [ ] Lovable block is byte-identical to the PR #123 baseline.
- [ ] Prettier passes for all non-protected documentation.
- [ ] No trailing whitespace or copied generic framework instructions remain.
- [ ] Referenced repository paths exist on the baseline branch.
- [ ] Main SHA, launch SHA, PRs, workflow runs, and partial staging scope are
      accurate.
- [ ] Lifecycle and disposition values are consistent in every file.
- [ ] MCP routes are documented as source-owned, not generated.
- [ ] Unit plan does not combine unrelated domains.
- [ ] No application or operational behavior changed.

## Release controls

- This unit has no deployment, staging, migration, provider, or production
  action.
- Publish it on an isolated branch based on the exact PR #123 head.
- Open a draft PR targeting agent/launch-readiness-milestones.
- Require durable human review before merge.

## Environment execution authorization and evidence

All environment actions are Not required for this documentation-only unit.
This unit does not authorize preview deployment, certification, or sharing;
staging execution; production migration, Supabase API platform configuration,
application deployment, Identity configuration, Admin bootstrap/activation,
bounded data mutation, current-season initialization, Fantasy catalog staging,
Fantasy registration opening, data/content provider activation,
notification-delivery activation, worker activation, schedule activation,
post-launch verification, or rollback.

## Documentation updates

- [x] Project overview
- [x] Architecture
- [x] UI context
- [x] Code standards
- [x] AI workflow rules
- [x] Progress tracker
- [x] Build plan and spec template

## Evidence

External PR reviews and checks are authoritative. Do not create a
self-referential docs-only commit to embed its own SHA.

| Delivery state | Prior commit / PR / run                                  | Date       | Human reviewer   |
| -------------- | -------------------------------------------------------- | ---------- | ---------------- |
| Approved       | Originating bootstrap implementation request, revision 1 | 2026-08-09 | @mrdata007       |
| Implemented    | Context implementation draft                             | 2026-08-09 | Not yet reviewed |
| CI verified    | Pending branch checks                                    | Pending    | Pending          |
| Merged         | Not merged                                               | —          | —                |

## Open questions

- Whether the repository owner wants the context PR merged directly into PR #123
  or retained as a separate review layer.
