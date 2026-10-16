# Audit remediation, Phase D: what was done and what is still open

Date: 2026-10-15. Branch `claude/friendly-turing-ry5fcs` (restarted from `main`
after Phase C was merged). Source audit: commit `a5df7b9` (NO-GO for broad public
launch, no confirmed P0). Phases A, B and C are merged (pull requests 489, 490
and 495). This is Phase D, "engagement and longer-term differentiation", plus the
saved-articles follow-up left open in Phase B and the owner decisions given on
2026-10-15. Nothing in this phase is merged to `main`, deployed, or applied to
any database. No production data, job or setting was touched. No lane wrote to a
database (one-writer rule respected). No migration was added or edited.

Screen brief: [`docs/briefs/2026-10-15-audit-phase-d-remediation.md`](../briefs/2026-10-15-audit-phase-d-remediation.md).

## Owner decisions applied (2026-10-15)

| Decision                                                | Effect                                                                                                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pinch zoom: keep the cap (MOB-01)                       | Closed. No change.                                                                                                                                                 |
| Arabic first paint: keep today's behaviour (LOC-05)     | Closed. The written evaluation stays as reference.                                                                                                                 |
| Legal text (الرقاقات): keep it                          | No change.                                                                                                                                                         |
| Desktop does not matter: the web is a funnel to the app | VIS-003 (desktop Fantasy layout) closed as will-not-do.                                                                                                            |
| Pépites renamed: Prospects (French), المواهب (Arabic)   | Done in screens, e-mail text, page titles, share texts and docs. Addresses, keys and database names unchanged.                                                     |
| Account notification language: French by default        | Done. Arabic-first people keep French until they change it (option a, chosen by the owner).                                                                        |
| Phase C wording read and accepted                       | Native review of Phase C wording done by the owner.                                                                                                                |
| Production statement limit check (owner ran it)         | `service_role` 60 s, `authenticator` 8 s. A write cannot outlive the 420 s lease extension, so the SEC-01 lease blocker is closed. Recheck if those limits change. |
| Database scripts: the owner runs them                   | Guarded, rehearsal-first scripts prepared (see below). Nothing applied.                                                                                            |

## Status of each item

| Item                                         | Status                   | What changed (short)                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saved-articles 2,000 cap (Phase B follow-up) | Closed in code           | For accounts with more than 2,000 saves: "plus de 2 000" instead of a wrong number, a note on the Saved page, no list filtering by the partial set, a tap checks the live saved state (the right language edition) before writing, and a failed write undoes only that article. No migration.                                                                                      |
| UX-011, PRO-02 (D1)                          | Closed (link only)       | The landing hero has a "Voir les matchs et résultats" link under the game button. Route logic for `/`, `/jouer` and the Fantasy button are unchanged. No conversion claim is made.                                                                                                                                                                                                 |
| PRO-05 (D2)                                  | Defined, not run         | `docs/engineering/ACTIVE_MANAGEMENT_MEASUREMENT.md`: definitions, denominators and nine read-only queries for the owner (not run). No tracking event added: the database already answers the question better. Rejected-save rate cannot be answered; three options listed.                                                                                                         |
| PRO-04, D3 (DR)                              | Protocol written         | `docs/engineering/REMINDER_DELIVERY_EVIDENCE.md`: how to prove, on staging, that reminders arrive once, at the right Morocco time, through each channel.                                                                                                                                                                                                                           |
| PRO-06, D4 (DR)                              | Protocol written         | `docs/engineering/CURVA_COMPREHENSION_TEST.md`: a facilitator script for French and Arabic supporters, tested separately.                                                                                                                                                                                                                                                          |
| D6 (DR)                                      | Backlog written          | `docs/engineering/BOTOLA_DEPTH_BACKLOG.md`: what local fans' questions each page should answer, each item needing observed need first.                                                                                                                                                                                                                                             |
| D5 sharing                                   | Closed (9 defects)       | Truthful copy results (never "copied" when nothing was), a manual-copy field when copying fails, no copy on closing a share sheet, league names with `$` or `{link}` no longer break messages, invites survive blocked browser storage, share links drop tracking and one-time tags, the recap picture shows the chosen alias. Audit: `docs/engineering/SHARING_AUDIT_2026-10.md`. |
| Notification language default                | Closed                   | New accounts store French; the language step shows the stored value and never switches the app; a save from an unread profile is refused (this also stops a pre-existing silent reset of language, club, photo link and alerts after a failed profile load).                                                                                                                       |
| LOC-09, rename                               | Closed                   | Prospects / المواهب. See owner actions for the e-mail deploy and the notification-bell text.                                                                                                                                                                                                                                                                                       |
| A8 capacity plan                             | Plan written             | `docs/production/CAPACITY_AND_RELEASE_EVIDENCE_PLAN.md`, written for a non-technical owner: questions only the owner can answer, run order, version check, failure drill. Nothing was run.                                                                                                                                                                                         |
| Guarded database scripts                     | Not needed on production | The three Phase A/B migrations were found already applied on production (verified read-only, hashes match). The scripts stay for other environments.                                                                                                                                                                                                                               |

## What was run

On the final merged tree: `bun run typecheck` clean; full `bun test` 10256 pass,
23 skip, 1 fail; i18n gate pass (W1 10, W2 10, W3 244, W4 68, each at baseline);
`backend:migrations:check` pass (230, none added); prettier clean on touched
files. The one failing test is "Morocco's Ramadan clock change" (a time-zone
format difference in this environment); it fails the same way on untouched
`main`. Every lane was reviewed by an independent reviewer who had the diff and
the audit record; every reviewer asked for changes and every required change was
made. Reviewers found real defects the lanes' own tests missed, among them:
a tap that could remove an article while the button read "save", a read of the
wrong language edition, a copy helper that could report success inside a dialog
without copying, a profile save that could reset language, club and alerts after
a failed profile load, and an unreadable-cursor case reported as a complete list.

The final review of the combined branch also ran, on a copy: full `bun test`
10256 pass and 1 known fail, typecheck, language-text check, migration check,
`bun run build`, the built-page browser test (3 of 3), seven CI browser suites
(105 pass, 1 skip), and the Pépites browser spec (26 of 26). It found one
privacy regression (see risk 2), fixed before this report.

Local rehearsal of the three database scripts on a throwaway local PostgreSQL 16
(never a shared database): each script passed its rehearsal, committed, and
refused a second run; 29 deliberately broken starting states and 3 tampered
scripts were each refused. The real Supabase editor, pg_cron, pg_net, Vault and
pgTAP were not available there.

## Owner actions (things only you can do)

1. **The three Phase A/B migrations are already applied on production**
   (`20261014180100`, `20261015120200`, `20261015120300`). A read-only check on
   2026-10-15 (about 12:15 UTC), re-checked independently, found their history
   rows present, the recorded text identical to the repository files (same
   sha256) and the live functions already on the new text. The guarded scripts
   are therefore not needed on production (each would stop at "already
   recorded"). Who applied them and when cannot be told: the history row's
   `created_by` is empty and the database keeps no commit times. On staging,
   only the error-intake script is applicable until the SofaScore rating
   release (`20261013160200`, `20261013170000`, `20261013170100`) is applied
   there.
2. **Deploy the e-mail functions** (`supabase functions deploy` for the e-mail
   dispatch functions) so the Prospects / المواهب wording reaches e-mails. Until
   then e-mails keep the old name.
3. **Notification-bell text** for the weekly list said "Pépites" in both
   languages because it is stored in the database (`20260926110100`, template
   `pepites_weekly`, `in_app`). **Applied on Production V2 (2026-10-16), not on
   Staging V2:** migration
   `20261016100000_prospects_weekly_notification_text` retired version 1 of the
   two template rows and added version 2 ("Prospects : le Top 10 de la semaine
   {{week}}", "المواهب: توب 10 للأسبوع {{week}}"; bodies unchanged). The owner ran
   the guarded script `scripts/backend/apply-20261016100000-prospects-weekly-notification-text.sql`;
   an independent read-only check passed and pull request 504 is merged. Nothing
   needed pausing. Notifications already in readers' bells keep the old word;
   only a list published after the apply gets the new one.
4. **Refresh the demo page** `public/demo/app.html` (build script
   `demo/scripts/build.ts`) to drop the old wording.
5. **Morocco time in the database: applied (2026-10-15).** The owner confirmed
   that Morocco is UTC+0 all year from 2026-09-20. Both databases carried older
   time-zone data (`select timestamptz '2026-10-15 12:00+00' at time zone
'Africa/Casablanca'` returned 13:00), so database-side Moroccan times were an
   hour off. The fix (helpers that apply the app's rule inside the database,
   five migrations `20261016090000` to `20261016090400`) was applied with the
   owner-approved guarded scripts, one at a time, rehearsal first, each step
   read back and independently checked, on Staging V2 and then on Production V2
   (all five migrations recorded on both; no leftover zone conversion; every
   scheduled job succeeded afterwards). The fix does not depend on Supabase's
   time-zone data; after any Postgres upgrade, the raw check returning 12:00
   only means the platform data was updated. Still to do: deploy the
   `account-deletion-worker` Edge Function (its confirmation e-mail dates used
   the runtime's zone), and watch the first daily Pépites sweep on the new text
   (just after 00:00 UTC) and the first Monday draft gate on 2026-10-19 at
   12:00Z (publication time 20:00Z). See
   `docs/production/MOROCCO_TIME_FIX_OWNER_RUNBOOK.md`.
6. **Run the measurement queries** in `ACTIVE_MANAGEMENT_MEASUREMENT.md`
   (query 0 first) and keep the first results as a dated baseline.
7. **Answer the capacity-plan questions** (Q1 to Q8 in the plan) and name the one
   staging writer and the time window.
8. **Confirm the crest licence for the Curva card** or revert it to initials
   discs: the code draws club crests, while `PRODUCT.md` still says crest rights
   are unknown.
9. **Native Arabic read** of the Phase D strings (below).

## Not verified (read this before trusting the table)

- No native Arabic read of any Phase D string.
- No real device, WebKit or screen reader; no WhatsApp or iOS share sheet.
- The saved-articles tap path against a real account with more than 2,000 saves.
- The database scripts on the real Supabase editor (whether it shows notices, how
  it handles several statements) and the CI pgTAP tests for them. The CI
  `database-quality` job passed on pull request 495, which contains all
  earlier migrations and their tests.
- E-mail rendering in a real mail client; push delivery; any reminder delivery.
- The comprehension test and the depth backlog are protocols, not results: no
  supporters were tested, and no conversion or retention gain is claimed.
- The new landing link's effect on behaviour is unmeasured.

## Remaining risks

1. **Arabic-first people get French e-mails and alerts** until they open
   Profile → Notifications and press العربية (owner option a). Existing accounts
   written from the device language cannot be told apart from real choices; a
   backfill is an owner decision.
2. **Public News caches** are not kept per account and carry the `isSaved` of
   whoever requested them. The final review found that the saved-articles work
   would have shown a previous account's saved marks to a signed-out visitor
   (a regression, fixed before this report: with no saved ids for the reader, a
   cached server answer is no longer trusted, and the hook answers "saved" only
   for a signed-in account; two new tests fail on the old code). What remains:
   an account with more than 2,000 saves can still see a different account's
   cached mark on a card it has not tapped, until the card is re-read; per-account
   cache handling is a separate change. Follow-up (this branch): on sign-out or
   a switch, the outgoing account's `isSaved: true` marks are now cleared from
   the public News caches (`forgetViewerSavedMarks`), so the next reader no
   longer inherits them. Still open: a News answer for the outgoing account
   that is in flight at the moment it leaves, and an account with over 2,000
   saves whose cards were read before it signed in (those carry no mark).
3. **Latent invite-code leak:** if the leagues read ever exposes invite codes, the
   Curva card's share text would include the first private league's join link.
   Joining needs only the code (no approval, cap or expiry). Remove or make opt-in
   the league branch in `ShareCardSheet.tsx` before any change exposes codes.
4. **Invite links carry no language:** an Arabic recipient on a fresh device may
   see French first.
5. **Rejected-save rate** cannot be measured from the database (a refused save
   leaves no record); the owner must pick logs, a new record, or an event.
6. **Morocco time zone data** in the database is unchecked (action 5).
7. **Inbox rows depend on e-mail or push:** an account with both off gets no inbox
   entry for these reminders; the recap is never pushed.
8. Phase A to C risks still stand (see their reports), including the
   Phase C remaining items.

## Arabic strings that most need a native reader

Ranked by risk, from the final combined-branch review:

1. The e-mail "why you get this" line: «تتلقى هذه الرسالة لأنك اشتركت في المواهب…»
   ("subscribed to the talents").
2. `pepites.share.player_message`: «{name} في المواهب، ترتيب…».
3. `unsubscribe.pepites_confirm_title`, `pepites_done_title` and
   `pepites_reenable_hint` («رسالة المواهب», «إعادة الاشتراك في المواهب»).
4. `auth.setup.language_hint` (the explanation of the French default).
5. `auth.setup.language_confirm`: «لغة الإشعارات».
6. `news.saved.over_limit`: «لديك أكثر من {count} مقال محفوظ…» (number
   agreement with a formatted number).
7. `landing.cta_matches` «تابع المباريات والنتائج» and `landing.browse_cta`
   «تابع المباريات» ("follow", against the French "voir"; e-mails still say
   «عرض المباريات»).
8. `fpl.copy_failed`: «تعذّر النسخ. حدّد الرمز لنسخه.»
9. `pepites.share.copy_manual` and `copy_manual_label`.
10. Brand titles: `pepites.state.coming_soon` «المواهب قريبًا», the e-mail
    subject «المواهب · …: توب 10 بعد التصحيح», `pepites.home.about` and
    `pepites.method.meta_description` («قسم المواهب»).

Small inconsistencies noted, not fixed: the Arabic e-mail "why" line says
«اشتركت في المواهب» while the unsubscribe lines say «رسالة المواهب»; a failed
copy on the match and news share pages shows only a toast (the link is not on
screen there, so the manual-copy field could be shown); the old name "Pépites"
remains in prose in the sharing audit, the depth backlog and the capacity plan.
The end-to-end spec `tests/e2e/curva-off.e2e.ts` assumes Curva is switched off
while the build has it on; it looks out of date and is not run in CI.

## Launch blockers, updated

The audit verdict stays **NO-GO for broad public launch** until the items below
are closed. Phases A to D remove the source-supported trust, recovery,
localization and accessibility defects; they do not by themselves certify launch.

Closed since Phase C:

- **Statement limit check:** done by the owner (60 s service role, 8 s
  authenticator); the lease extension is safe.
- **CI `database-quality`** passed on pull request 495.
- **The three Phase A/B migrations** are applied on production (verified
  read-only on 2026-10-15).

Still blocking:

- **A8, release and capacity evidence (SEC-02, FANT-11):** the plan is written;
  the staging run, version check and failure drill are not done.
- **SEC-01 outside the lease:** the orchestrator's calendar syncs, ingestion and
  prize call run outside any lease; their overlap with an Edge pass is unchecked
  against the SQL.
- **Real-state checks** on staging or a real signed-in account, French and
  Arabic, for states mock mode cannot show.
- **Native Arabic review** of the Phase A to D wording.
- **Reminder delivery evidence** (protocol written, not run).
