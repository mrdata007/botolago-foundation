# Audit remediation, Phase A: what was fixed and what is still open

Date: 2026-10-14. Branch `claude/friendly-turing-ry5fcs`. Source audit: commit
`a5df7b9` (NO-GO for broad public launch, no confirmed P0). This work started
from `f4fa258`. Nothing is merged to `main`, deployed, or applied to any
database. No production data, job or setting was touched. No lane wrote to a
database (one-writer rule respected).

Screen brief: [`docs/briefs/2026-10-14-audit-phase-a-remediation.md`](../briefs/2026-10-14-audit-phase-a-remediation.md).

## How it was done

Six implementation lanes ran in separate worktrees. Each finding was checked
against the current code first, got a regression test that failed on the old
code, then a fix. Every lane was then reviewed by an independent reviewer who had
the diff and the audit record, not the lane's conclusions. All reviewers asked
for changes and every required change was made. A final review of the combined
branch checked cross-lane problems, the owner's invariants and the per-finding
status below.

## Status of each finding

| ID       | Priority | Status                     | What changed (short)                                                                                                                                                                                                                                                                                                               |
| -------- | -------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FANT-06  | P1       | Closed                     | Landing, FAQ and onboarding no longer promise rating points; neutral wording plus a link to the rules page.                                                                                                                                                                                                                        |
| LOC-01   | P2       | Closed                     | Rules page names which rounds each scoring rule covers (FR/AR), and keeps the still-true safeguards.                                                                                                                                                                                                                               |
| FANT-04  | P1       | Closed                     | Round tab reads the server's round board in the server's order; unknown previous rank shows a dash, never an invented arrow. League boards follow the same rule.                                                                                                                                                                   |
| FANT-01  | P1       | Closed                     | Transfers use the owner's real sale value (from the server's `salePrice`) in the bank, picker, replacement budget, selling column and confirm screen. Audit case (bought 7.0, now 7.4) credits 7.2.                                                                                                                                |
| FANT-02  | P1       | Closed                     | A failed transfer preview now shows why (budget shortfall, stale version, code needed, network, deadline, not allowed) with a retry that keeps the draft. Next is never grey without a reason.                                                                                                                                     |
| QA-01    | P1       | Closed                     | Saved Pronostics are not shown as empty or editable while loading, failed, or while auth is still loading; a retry is offered.                                                                                                                                                                                                     |
| QA-05    | P1       | Closed                     | Guest picks import is visible, retried a few times, then offers a manual retry; local copies stay until the server answers; picks past kickoff are reported, never sent late.                                                                                                                                                      |
| UX-009   | P1       | Closed                     | The guest squad draft reports whether it was really saved; "kept on this device" is shown only when true; leaving with an unsaved squad warns.                                                                                                                                                                                     |
| DATA-01  | P1       | Closed on the match page   | Freshness uses the data's age, not the last successful fetch. Past 3 h after kickoff a live match with quiet data is "score to confirm". Limits are generous where the backend writes nothing by design (added time, no clock).                                                                                                    |
| DATA-02  | P1       | Closed                     | A failing optional section (pressure, head-to-head, etc.) no longer hides the score page; each shows its own "could not load" with a retry, separate from "no data"; a failed refresh keeps the last good copy.                                                                                                                    |
| DATA-03  | P2       | Closed                     | Unknown scores show a dash and are announced as "score unavailable" (FR/AR); a real 0-0 is unchanged.                                                                                                                                                                                                                              |
| UX-010   | P2       | Closed                     | League "last updated" uses the standings' own calculation time, else says "data loaded" with the load time, else nothing. It no longer reads the clock.                                                                                                                                                                            |
| SEC-01   | P1       | Mostly closed              | Scheduled Edge worker, GitHub orchestrator and manual runner: a timed-out or unconfirmed write now stops the pass and keeps the lease (extended, released only on a real answer, else it expires); the alert names the write in doubt. Still open: the calendar syncs, ingestion and prize call run outside the lease (see risks). |
| ASTRA-04 | P1       | Closed                     | Scheduled pass refuses to run unmanaged when the lease function is missing. The legacy path is kept behind an opt-in nothing sets.                                                                                                                                                                                                 |
| ASTRA-03 | P2       | Closed (visibility)        | A failed or blocked prize evaluation is shown as `prizeAttention` in the response, run record and log. The pass stays `ok` (so no false alert or fallback takeover); nothing alerts on a prize failure that keeps happening.                                                                                                       |
| ASTRA-02 | P2       | Closed in code, unverified | New migration `20261014180100` makes the worker health check cover the scheduler's full backlog. It has not been run: the database tests need Docker.                                                                                                                                                                              |

Not part of this work: SEC-02 and FANT-11 (A8, needs staging evidence), and all
Phase B, C and D items.

## What was run

On the final tree: `bun run typecheck` clean; full `bun test` 9492 pass, 23 skip,
1 fail; i18n gate pass; `backend:migrations:check` pass (228); config integrity
and secret scans pass; eslint 0 errors on the 84 touched files; prettier clean.
The one failing test is "Morocco's Ramadan clock change" (a time-zone format
difference in this environment). It fails the same way on the untouched base
`f4fa258`; it is not caused by this work.

Screenshots and measurements (French and Arabic, 390 and 1440 px, own dev
server on port 5199, built-in mock data, no database): no overflow, wrong
direction, cut text or console errors in the changed areas; Arabic pages are
`dir=rtl`. Files are in the session scratchpad `shots/` folder; they are not
committed to the repository.

## Not verified (read this before trusting the table)

- **Database tests were not run.** No Docker here. The new migration and its
  tests (`fantasy_worker_health_backlog.test.sql`, and edits to cases 7.14 to
  7.16 of `fantasy_worker_schedule.test.sql`) must pass CI `database-quality`.
- **Mock mode could not show these new states:** the transfer preview panel,
  the Pronostics loading/failed/guest-import notices, the guest squad
  storage-denied warning (`/fantasy/create` redirects in mock), the match
  "section failed" cards, and the league "calculated at" wording. They are
  covered by unit and server-render tests only.
- No physical device, WebKit or screen reader. The new Arabic wording has not
  been read by a native Arabic speaker.
- The screenshots were taken before the last Pronostics fix and copy tweaks.
- Real backend behaviour (a real slow write, gateway codes, the database's
  statement limit) was not measured.

## Remaining risks

1. **SEC-01 residual (smaller).** The orchestrator's lease covers only its lifecycle
   loop. Its first calendar sync (before the lease is taken), the performance
   ingestion, the prize call and the second sync run outside any lease, so they
   can overlap an Edge pass's own calendar sync and prize evaluation, including
   when a scheduled run defers to the database worker. Whether that overlap is
   harmless has not been checked against the SQL. Closing it means holding the
   lease across the whole orchestrator run.
2. **Lease is not a database fence.** The 420 s extension only protects if the
   database cannot run one statement longer. Owner check (read-only):
   `select rolname, rolconfig from pg_roles where rolname in ('service_role','authenticator');`
   If `statement_timeout` is above about 390 s, raise
   `AMBIGUOUS_LEASE_EXTENSION_SECONDS` (maximum 900).
3. **Freshness only on the match page.** `LiveStrip`, match cards (home, club
   pages), `MatchdayStrip` and head-to-head rows still show the stored status
   with no freshness check. A true "last polled, unchanged" timestamp needs a
   backend field (a migration). A phone clock more than 5 minutes fast can wrongly
   flag a running live match.
4. **Round tab does not say which round it shows.** It falls back to the newest
   round that has ranking rows (often the previous one while a live round is not
   yet ranked) and does not mark live/provisional boards.
5. **Related zeros left alone (out of lane):** the overall board's round-points
   column shows 0 for every row because the season board has no per-round points;
   `fantasy-runtime.ts` maps a missing `gameweekPoints` to 0.
6. **Wording in `AGENTS.md`.** Line 236 says a running pass holds its lease "at
   most about eight minutes"; after an ambiguous write it can be about nine. The
   worker doc is fixed; `AGENTS.md` is the owner's file and was not edited.
7. **Product call for the owner:** the new sign-up warning tells guests with an
   unsaved squad not to use Google sign-in or open the email link in another tab.
8. The new migration must be applied after the existing release bundle
   `scripts/backend/apply-20261014-sofascore-rating-release.sql`, which carries the
   old health function.

## Launch blockers, updated

The audit verdict stays **NO-GO for broad public launch** until the items below
are closed. This work removes the source-supported Phase A trust defects; it does
not by itself certify launch.

Still blocking:

- **A8, release and capacity evidence (SEC-02, FANT-11).** A current gate and
  soak on the declared traffic, in an isolated same-tier environment with one
  coordinated database writer; a version manifest proving the deployed source,
  frontend, database and Edge match; backend-quality CI with pgTAP green; a real
  lifecycle failure drill.
- **CI `database-quality` must pass** for the new migration and test edits.
- **SEC-01 residual:** the work outside the lease (risk 1) checked against the SQL
  or put under the lease, or a documented pilot limit.
- **Owner check of the database statement limit** (risk 2).
- **Screen-work evidence before the draft PR leaves draft:** the states mock
  mode cannot show, on staging or a real signed-in account, in French and Arabic.

No longer blocking from the audit's Phase A list: FANT-06, LOC-01, FANT-04,
FANT-01, FANT-02, QA-01, QA-05, UX-009, DATA-01 (match page), DATA-02, DATA-03,
UX-010, ASTRA-04, ASTRA-03, and the SEC-01 timeout race on all three workers. ASTRA-02 awaits its database tests.

Phase B to D (including SOL-01/02, FANT-03/05/07/08, the error-recovery group,
reading list, football semantics DATA-04 to 07, and Phase C polish) is untouched.
