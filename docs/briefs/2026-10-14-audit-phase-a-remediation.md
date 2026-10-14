# Audit remediation, Phase A (screen brief)

Owner request, 2026-10-14: fix the findings of the 2026-10-14 product and
engineering audit, starting with Phase A and the P1 issues. The audit
(commit `a5df7b9`) is a NO-GO for broad public launch; it found no P0 incident.
This brief covers every interface change in that work (AGENTS.md, "Screen work").

Branch `claude/friendly-turing-ry5fcs`, with one short-lived lane branch per
topic merged into it. Nothing is merged to `main`, deployed or applied to a
database. No production data, job or setting is touched.

## What must be preserved

- Every Fantasy scoring rule, the digest/seal/state/idempotency guards, deadlines,
  transfer pricing (half-profit sale price), ownership and authorization checks.
  The server stays the authority; the browser never relaxes a server refusal.
- The one-writer rule: no lane writes to any database. Migrations are new files
  only (never edited once applied) and are not run.
- The brand identity, design tokens, French and Arabic (right-to-left) layouts.
- Published copy never carries an AI-authorship notice.
- Existing public routes, query keys and mock-mode behaviour.

## Improvements (finding IDs from the audit register)

| Lane | Findings | Change |
|---|---|---|
| A1 | FANT-06, LOC-01 | Landing and rules explain scoring from the active rule and say which rounds it covers. |
| A2 | FANT-04 | Round rankings follow the server's order; no rank movement is shown unless a real earlier round rank exists. |
| A3 | FANT-01, FANT-02 | Transfers show the real sale value of an owned player; a failed preview says why and offers a retry without losing the draft. |
| A4 | QA-01, QA-05, UX-009 | Saved Pronostics are never shown as empty or editable while still loading or failed; failed guest imports are visible and retryable; a squad that could not be saved on the device is reported honestly. |
| A5 | DATA-01, DATA-02, DATA-03, UX-010 | Match freshness reflects the data, not the last successful fetch; an optional section failing keeps the score page; an unknown score shows a dash; the league "last updated" time is real. |
| A6 | SEC-01, ASTRA-04, ASTRA-02, ASTRA-03 | The Fantasy worker keeps its lease while a write may still be running, the missing-lease fallback is explicit, and monitoring and prize-error status are honest. |

Not in this work: A8 (capacity and release evidence, SEC-02, FANT-11) needs an
isolated staging database and a single owner-approved writer. It stays a launch
blocker. Phase B, C and D items are out of scope.

## Acceptance criteria

Visual and functional, per lane:

- French and Arabic copy exist for every new or changed string, with matching
  keys in both dictionaries and no interpolation mismatch.
- Right-to-left: no new physical left/right styles; numbers, prices and scores
  stay readable inside Arabic text.
- Mobile (390px) and desktop (1440px): no new overflow, and every new control
  keeps a 44px target.
- Each fixed finding has a regression test that fails on the old code and
  passes on the new, and the existing tests of the touched area still pass.
- `bun run typecheck`, `bun run lint` on touched files, `bun run format:check` on
  touched files, and `bun run backend:migrations:check` (if a migration is added)
  all pass.
- Anything that cannot be verified here (database tests, a real device, a
  deployed backend) is reported as not run, never as passed.
