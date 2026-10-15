# Audit remediation, Phase D (screen brief)

Owner request, 2026-10-15: after Phase C was merged (pull request 495), start
Phase D of the 2026-10-14 audit roadmap: engagement and longer-term
differentiation, plus the saved-articles follow-up left open in Phase B. This
brief covers every interface change in that work (AGENTS.md, "Screen work").

Branch `claude/friendly-turing-ry5fcs` (restarted from `main` after the merge),
with one short-lived lane branch per topic merged into it. Nothing is merged to
`main`, deployed or applied to a database without the owner's approval. No
production data, job or setting is touched.

## Owner decisions given on 2026-10-15

- Pinch zoom: keep the cap as it is (MOB-01 closed, no change).
- First paint in Arabic: keep today's behaviour (LOC-05, no code).
- Legal text (الرقاقات): keep as it is.
- Notification language: French by default.
- Phase C wording was read and accepted by the owner.
- The owner runs the database scripts; no lane applies a migration.

## What must be preserved

- Every Fantasy scoring rule, guard, deadline and the server's authority; the
  Phase A, B and C fixes (see `docs/audits/`).
- The brand identity, design tokens, French and Arabic (right-to-left) layouts.
- Analytics stays production-host-only, name-only and privacy-preserving: no
  user, team, token, email, league or query-string identifier is ever sent.
- Free-play commitments: no checkout, price or paid tier is inferred or added.
- Published copy never carries an AI-authorship notice.
- No database writes; a migration may be written as a new file only if a lane
  cannot do without one, and is never run. A lane that thinks it needs one
  stops and reports.

## Improvements

| Lane | Finding / item                  | Change                                                                                                                                                                                                 |
| ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D0   | Phase B follow-up (news.ts cap) | The saved-articles list says honestly when an account has more than 2,000 saved articles, and never treats a partial set as the whole one.                                                             |
| D1   | UX-011, PRO-02                  | The first-visit landing offers an immediate, explicit "see today's matches" action next to the game call to action; `/jouer` stays the explicit Fantasy destination. The route for `/` is not changed. |
| D2   | PRO-05                          | Define "active management" and its denominators; add name-only events for server-confirmed management actions only if the existing events cannot answer it; read-only queries written, not run.        |
| D5   | Sharing (roadmap D5)            | Invite and recap links return to the right context and privacy state; copy/file fallbacks work; fix defects found.                                                                                     |
| DN   | Owner decision: French default  | A new account's notification language defaults to French, not to the device language; stored language wins for existing accounts.                                                                      |
| DR   | Roadmap D3, D4, D6              | Written protocols and evidence checklists (delivery evidence, Curva comprehension test, Botola depth): documents only, no code.                                                                        |

Not in this work: VIS-002 to VIS-005 (need product input and image rights),
MOB-01, LOC-09, and the Phase A to C launch blockers (capacity and release
evidence, SEC-01 outside the lease, owner-run database scripts).

## Acceptance criteria

- French and Arabic copy exist for every new or changed string, with matching
  keys and placeholders in both dictionaries.
- Right-to-left: no new physical left/right styles; numbers, scores and codes
  stay readable inside Arabic text.
- Mobile and desktop: no new overflow (measured by element bounds, not
  `scrollWidth`); every new or changed control keeps a 44px target.
- Each fixed finding has a regression test that fails on the old code and
  passes on the new, and the existing tests of the touched area still pass.
- `bun run typecheck`, the i18n gate (baselines must match what it measures),
  eslint and prettier on touched files pass.
- Anything that cannot be verified here (a real device, a screen reader, real
  supporters, a native Arabic read, a deployed backend) is reported as not run,
  never as passed, and no conversion or retention gain is claimed without a
  measurement.
