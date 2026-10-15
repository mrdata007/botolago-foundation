# Audit remediation, Phase B: what was fixed and what is still open

Date: 2026-10-15. Branch `claude/friendly-turing-ry5fcs`. Source audit: commit
`a5df7b9` (NO-GO for broad public launch, no confirmed P0). Phase A is merged
(pull request 489, see `2026-10-14-audit-remediation-phase-a.md`); this is
Phase B, "core reliability and user journeys". Nothing is merged to `main`,
deployed, or applied to any database. No production data, job or setting was
touched. No lane wrote to a database (one-writer rule respected).

Screen brief: [`docs/briefs/2026-10-15-audit-phase-b-remediation.md`](../briefs/2026-10-15-audit-phase-b-remediation.md).

## How it was done

Nine implementation lanes ran in separate worktrees, one topic each. Every
finding was checked against the current code first and got a regression test.
Every lane was then reviewed by an independent reviewer who had the diff and the
audit record, not the lane's conclusions; every reviewer asked for changes and
every required change was made. Reviewers found real defects that the lanes' own
tests had missed, among them: a migration that did not parse, a migration that
dropped a step-up guard (a database test counts exactly 88 such functions), a
password-reset change that would have shown whether an account exists, a
standings change that dropped official point deductions, a leaderboard reader
that threw for valid ranks and could hide the last manager after an account
deletion, and a cap on error reports that two callers could pass together. A
final review of the combined branch then checked cross-lane problems, the
owner's invariants and the per-finding status below.

## Status of each finding

| ID       | Priority | Status           | What changed (short)                                                                                                                                                                                                                                                                                                             |
| -------- | -------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SOL-01   | P2       | Closed           | A half-filled transfer draft keeps its exact outgoing/incoming pairing; old-format drafts are read only where the pairing is certain; a restored incoming player who is now owned, unavailable or of another position becomes an empty place instead of a wrong pair.                                                            |
| SOL-02   | P2       | Partly closed    | An owned player missing from the buying pool keeps his position, club and sale value and can be sold and replaced, never bought. His name is not known to the app (the team record has none), so he shows as "Hors marché".                                                                                                      |
| FANT-07  | P2       | Partly closed    | Old rounds name every player, including those who left the pool (needs the new, unapplied migration; without it a notice says some players cannot be named). The club and position shown are the player's current ones, not a per-round copy: a transferred player's old round shows his new club.                               |
| FANT-08  | P2       | Closed           | The vice-captain badge of an old round comes from that round's own result, not the current team.                                                                                                                                                                                                                                 |
| ASTRA-01 | P2       | Closed           | A null effective captain (pending round, non-participants) stays null; today's captain is never substituted. A pending round still shows the armband on the captain the manager chose.                                                                                                                                           |
| FANT-03  | P2       | Closed           | League standings continue past 100 ("100 / 250 membres", "Afficher la suite"); a failed next page keeps the rows. Edge: a public league with 100 or more hidden accounts above a page ends early.                                                                                                                                |
| FANT-05  | P2       | Closed           | The global board reaches every rank with the server's true total, without re-reading from the top on each page turn. Search covers the first 2,000 managers and says so on screen.                                                                                                                                               |
| UX-003   | P2       | Closed           | A failed league read (list, members, standings) is shown as a failure with retry, not as "no leagues" or "no members"; a failed refresh keeps the rows.                                                                                                                                                                          |
| UX-004   | P2       | Closed           | Only an invalid invite code says "Code invalide"; a connection failure says the code is not at fault and the league may already be joined; a failed refresh after a successful join says it went through.                                                                                                                        |
| UX-002   | P2       | Closed           | A refused inbox dismissal brings the card back with a message; a failed "mark all as read" now says so.                                                                                                                                                                                                                          |
| UX-007   | P2       | Closed           | A failed search is told apart from "no results" (error with retry, or "some results unavailable").                                                                                                                                                                                                                               |
| QA-03    | P2       | Closed           | A pending sign-in code resend blocks a second request and shows failures.                                                                                                                                                                                                                                                        |
| QA-04    | P2       | Closed           | Verify tells a connection or rate-limit failure from a wrong code. A server error on the password-reset mailer still answers "sent", so it cannot show whether an account exists.                                                                                                                                                |
| SOL-03   | P2       | Closed           | The search's active option always points at a shown result; Enter never opens a hidden one.                                                                                                                                                                                                                                      |
| UX-001   | P2       | Closed           | Saved articles have a page (`/profile/saved`, from Profile and the News header): loading, empty, sign-in, error with retry, paging, unsave with rollback and message. Also fixes readers with more than 50 saves getting an "invalid data" error. A withdrawn story drops out of the list and count (a server limit, see risks). |
| UX-005   | P2       | Closed           | Sign-in returns to the page, query and anchor the reader came from, through the existing redirect checks; credentials, `/auth` and `/unsubscribe` are never put in a return link; very long targets are cut.                                                                                                                     |
| UX-006   | P2       | Closed           | The News category and club, and the player list's search, position, club, price, sort and page, live in the address, so a detail visit and Back keep them.                                                                                                                                                                       |
| DATA-04  | P2       | Closed           | Postponed, suspended, cancelled and abandoned matches each have their own wording (FR/AR) and a cancelled or abandoned match is not listed as upcoming. A cancelled match no longer says "date to be confirmed".                                                                                                                 |
| DATA-05  | P2       | Closed (browser) | A result corrected at an unchanged played count now updates the table; each club keeps its official points deduction; the order of clubs level on points stays computed and labelled provisional.                                                                                                                                |
| DATA-06  | P3       | Closed           | The empty live Stats wording is true under both data feeds (no claim that the page updates by itself).                                                                                                                                                                                                                           |
| DATA-07  | P2       | Closed (display) | Removing a third-party link keeps ordinary reporting words ("sanctionné par la FIFA") and removes only source credits; done when the article is shown, not at ingestion.                                                                                                                                                         |
| QA-08    | P2       | Closed           | Pronostics boards (journée, season, private leagues) refresh after scoring without touching unsent picks.                                                                                                                                                                                                                        |
| SEC-03   | P2       | Closed           | Manager Card editions are cached per viewer and cleared on sign-out; a late answer for the previous account is dropped.                                                                                                                                                                                                          |
| SEC-04   | P2       | Closed           | A card renderer that fails or stalls ends in a retry, then a "reload the page" button, with one report per attempt.                                                                                                                                                                                                              |
| SEC-05   | P2       | Closed           | Request deadlines survive runtimes without `AbortSignal.any`, keeping both the deadline and the caller's cancel.                                                                                                                                                                                                                 |
| PRO-04   | P2       | Partly closed    | Reminder and notification copy now states the account's setting and promises delivery only where the account's e-mail route is open; the app still cannot see whether sending is switched on globally (recorded in `docs/backend/EMAIL_NOTIFICATIONS.md`).                                                                       |
| SEC-06   | P2       | Closed in code   | The browser error report cap is exact under concurrent callers, refusals are counted (counters only, no personal data), and a browser flood cannot raise a backend failure alert. New migration; database tests not run.                                                                                                         |

Not part of this work: A8 (SEC-02, FANT-11, capacity and release evidence), the
SEC-01 gap outside the lease, and all Phase C and D items.

## What was run

On the final tree: `bun run typecheck` clean; full `bun test` 9965 pass, 23
skip, 1 fail; i18n gate pass (W1 10, W2 10, W3 244, W4 68, each at baseline);
`backend:migrations:check` pass (230); config-integrity and secret scans pass;
eslint 0 errors; prettier clean; `bun run build` passes. The one failing test is
"Morocco's Ramadan clock change" (a time-zone format difference in this
environment); it fails the same way on untouched `main`.

Two migrations were also applied by reviewers to throwaway local PostgreSQL 16
databases (never a shared one): the error-report cap stored exactly 300 kinds
under 40 concurrent clients where the old function stored 670, with no
deadlocks; the leaderboard reader was checked against the real ranking SQL. The
real pgTAP extension was not available there.

## Not verified (read this before trusting the table)

- **Database tests were not run here.** CI `database-quality` runs them on the
  pull request: `client_error_intake_budget.test.sql` (new), the extended
  `fantasy_points_read_surfaces.test.sql`, and the existing step-up test that
  counts 88 guarded functions.
- `bun run backend:types:check` needs Docker. B2 edited `database.types.ts` by
  hand; a reviewer judged it byte-identical to the generator's output.
- No browser, screenshot, 390 or 1440 px, or right-to-left visual check was done
  for Phase B (unlike Phase A). The new states mock mode cannot show (error and
  retry panels, saved-articles page states, board paging, the card renderer
  failure) are covered by unit and server-render tests only.
- No physical device, screen reader, or native Arabic read of the new wording.
- Real backend behaviour: board paging against real hidden or deleted accounts,
  auth-server error codes, how a failed script chunk behaves on a device.

## Remaining risks

1. **Leaderboard rank holes.** Ranks are unique but not always gapless: deleting
   an account removes its ranking row without recalculating. The reader detects
   holes in blocks it reads and then only walks; a hole in blocks it never read
   can make one page off by the number of deleted rows. Server follow-up:
   recalculate the boards after an account deletion.
2. **Global search** covers the first 2,000 managers only (the server has no
   search); it says so. A search function is a small read-only migration.
3. **FANT-07 and SOL-02 need server data**: a per-round copy of a player's club
   and position (a snapshot taken when the lineup is saved, or the team
   membership valid at the gameweek date) and the player's name in the team
   record.
4. **Saved articles in production:** a story withdrawn after being saved drops
   out of the list and the count and its saved row stays hidden; showing a
   removable "no longer available" row needs a new server function.
5. **PRO-04:** a public read-only "e-mail delivery is on" flag is needed before
   delivery can be promised without hedging.
6. **Standings:** a corrected table is recomputed in the browser and labelled
   provisional; there is no official correction timestamp from the backend.
7. **A "which round is shown" label** on the round ranking tab, and freshness
   checks on the other live surfaces (Phase A leftovers), are still not done.
8. **`src/integrations/supabase/client.ts`** carries a Lovable "automatically
   generated" header but already held a hand-written wrapper before this work;
   the deadline helper keeps the new logic in a file Lovable does not generate.
9. Several screens still resolve squad ids only through the buying pool (team
   page, hub, players list); `snapshot.ownedPlayers` is available for them.
10. Migrations `20261015120200` and `20261015120300` are applied nowhere. Apply
    them through the reviewed path, after the existing release bundle, with no
    other writer running; neither needs a job paused (see the release runbook).

## Launch blockers, updated

The audit verdict stays **NO-GO for broad public launch** until the items below
are closed. Phase A and B remove the source-supported trust and recovery
defects; they do not by themselves certify launch.

Still blocking, unchanged from Phase A:

- **A8, release and capacity evidence (SEC-02, FANT-11):** a current gate and
  soak on the declared traffic in an isolated same-tier environment with one
  coordinated writer; a version manifest proving source, frontend, database and
  Edge match; backend-quality CI green; a real lifecycle failure drill.
- **SEC-01 outside the lease:** the orchestrator's calendar syncs, ingestion and
  prize call run outside any lease; whether their overlap with an Edge pass is
  harmless is unchecked against the SQL.
- **The owner's database statement-limit check** for the lease extension.
- **Real-state checks** on staging or a real signed-in account, in French and
  Arabic, for the states mock mode cannot show (Phase A and Phase B).

New for Phase B:

- **CI `database-quality` must pass** for the two new migrations and test edits.
- **Native Arabic review** of the new wording before it ships.

No longer blocking from the audit's Phase B list: the findings marked Closed
above. Phase C (premium polish, localization, accessibility) and Phase D are not
started.
