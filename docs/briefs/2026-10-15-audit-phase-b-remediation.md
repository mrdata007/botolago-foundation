# Audit remediation, Phase B (screen brief)

Owner request, 2026-10-15: after Phase A was merged (pull request 489), start
Phase B of the 2026-10-14 audit roadmap: core reliability and user journeys.
This brief covers every interface change in that work (AGENTS.md, "Screen work").

Branch `claude/friendly-turing-ry5fcs`, with one short-lived lane branch per
topic merged into it. Nothing is merged to `main`, deployed or applied to a
database without the owner's approval. No production data, job or setting is
touched.

## What must be preserved

- Every Fantasy scoring rule, the digest/seal/idempotency/lock_version guards,
  deadlines, transfer pricing (half-profit sale price), ownership and
  authorization checks. The server stays the authority; the browser never
  relaxes a server refusal and never computes official standings.
- The one-writer rule: no lane writes to any database. Migrations are new files
  only (never edited once applied) and are not run.
- The brand identity, design tokens, French and Arabic (right-to-left) layouts.
- Published copy never carries an AI-authorship notice.
- Existing public routes, query keys and mock-mode behaviour.
- The Phase A fixes (see `docs/audits/2026-10-14-audit-remediation-phase-a.md`).

## Improvements (finding IDs from the audit register)

| Lane | Findings                              | Change                                                                                                                                                       |
| ---- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1   | SOL-01, SOL-02                        | A half-filled two-transfer draft keeps its outgoing/incoming pairing; an owned player missing from the buying pool keeps identity and can be replaced.       |
| B2   | FANT-07, FANT-08, ASTRA-01            | Old rounds keep their own player identity, captain and vice-captain; a null effective captain stays null.                                                    |
| B3   | FANT-03, FANT-05, UX-003, UX-004      | League and global boards reach every member (paging, search, own rank, honest totals); league read failures and join errors are told apart from "none".      |
| B4   | UX-002, UX-007, QA-03, QA-04, SOL-03  | Inbox dismissal, global search, OTP resend and verify tell a failure from "nothing"; no duplicate sends; a hidden search option is never activated.          |
| B5   | UX-001                                | Saved articles can be found again in one obvious place.                                                                                                      |
| B6   | UX-005, UX-006                        | Sign-in returns to where the reader was; the selected round, tab, search and filters survive a detail visit.                                                 |
| B7   | DATA-04, DATA-05, DATA-06, DATA-07    | Cancelled, abandoned, suspended and postponed matches are told apart; a result correction updates standings; live stats and link text are stated truthfully. |
| B8   | QA-08, SEC-03, SEC-04, SEC-05, PRO-04 | Pronostics boards refresh after scoring; card editions are per viewer; failed card assets end in a retry; deadlines survive older runtimes.                  |
| B9   | SEC-06                                | Anonymous error reports have an atomic budget and cannot pass for a backend outage.                                                                          |

Not in this work: A8 (capacity and release evidence, SEC-02, FANT-11), FANT-06
follow-ups, and all Phase C and D items.

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
- A read or mutation that fails is reported as a failure with a way to retry,
  never as an empty result or as the reader's mistake.
- `bun run typecheck`, `bun run lint` on touched files, `bun run format:check`
  on touched files, and `bun run backend:migrations:check` (if a migration is
  added) all pass.
- Anything that cannot be verified here (database tests, a real device, a
  deployed backend) is reported as not run, never as passed.
