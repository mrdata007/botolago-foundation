# Real-clock staging reminders and lost-response recovery

Status: implementation prepared; hosted execution and inbox/UI receipt pending.
This closes the remaining staging drill scope. It changes no production code,
deadline rule, timeout, lease duration, capacity threshold or billing plan.

## Scope and prerequisite

Use only Staging V2, the protected `staging-load-test` environment and the shared
`phase6-staging-load-test` writer group. Merge the writer-registry addition before
dispatch so other scheduled staging lanes also recognise this writer. Wait for
the alarm drill to finish and verify restoration first. No parallel phone session
or other staging writer may run during this drill.

The operator privately stores `botolago_staging_qa_owner_ids` in staging Vault
after the prior writer releases the database. It contains the two already
confirmed test owners: positive email account first, email-off account second.
An existing protected `STAGING_QA_OWNER_IDS` JSON secret can also supply them;
the current GitHub integration cannot create that environment secret (HTTP 403).
No addresses, passwords, credentials or owner-id array enter public inputs or
artifacts. The Mac origin input must be `https://RFC1918_IP:8443`, reachable by
the owner's phone. The [Mac launcher](2026-10-19-mac-iphone-session.md) is on the
separate phone-fixture PR; its session must be ready before this dispatch.

The script refuses pre-existing `APP_URL`/`EMAIL_FROM` overrides because their
original values cannot be recovered from secret metadata. It temporarily sets
the staging origin and a **BotolaGO STAGING** sender display name, verifies the
real unsubscribe endpoint redirects to that origin, and removes both overrides
afterward. The underlying verified address remains `notifications@botolago.com`.
No extra Resend key or paid resources are created. Auth signup/reset SMTP is a
separate path and is not established by this test.

## Execution and objective criteria

1. Save the exact cron, Rivals, email settings, both preferences and profile
   languages, and old team/result/gameweek fingerprints. Atomically save an
   owner-only recovery row and pause schedules. Its table is in `app_private`,
   has RLS enabled and no public/anon/authenticated/service-role grants. Wait
   for active writes and leases to settle before fixtures are touched.
2. Rehearse and roll back the exact new `f970` two-team fixture, verify absence
   and unchanged old fingerprints, then apply it. No measured season is reopened.
   Its new GW2 deadline is 25 hours ahead; its two match windows start with
   kickoffs 125 and 170 minutes ahead. Those times are never edited afterward.
3. Include both owners in email test mode, with email off for the negative
   owner. Record actual activation; no historical activation is reused. Subscribe
   both to the new matches. Enable no push or live provider ingestion.
4. Run the production lifecycle with one injected lost response: the first
   actual scoring-persistence reply is consumed outside the worker and withheld
   from it. The unchanged production gateway must time out at 30 seconds and
   its normal grace must remain unconfirmed. This models **response loss after
   commit**, not a database query running for 30 seconds. Require lease extension,
   a rejected competing acquisition, no further data RPC before natural expiry,
   and successful lifecycle recovery after expiry. Neither the DB timeout nor a
   lease timestamp is changed. Independently require two final 96-point results,
   32 bench points, rankings, rollovers, next lineups and completed postwork.
5. The real finalization happens after email activation. Require both recap
   event payloads to match the stored 96 points. Send the positive recap in
   French, then switch that test owner's language to Arabic before the later
   reminders. The negative owner must receive no notification or email.
6. Call the actual notification tick against `statement_timestamp()` until the
   real windows arrive. Require one positive inbox row and sent delivery for
   each of recap, 24-hour deadline and first match. Deadline planning must be
   between 23 h 55 min and 24 h before the stored deadline; match planning must
   be 10–65 minutes before the stored kickoff. The first match was subscribed
   more than two hours ahead, and the deadline was more than 24 hours ahead
   when test mode activated. Other day/round preview mail can also be sent to
   the positive account by the unchanged planner; record it as test mail.
7. Derive the real sent delivery's unsubscribe token privately. Its GET must
   redirect to staging without changing the preference. POST the real RFC 8058
   endpoint: first unsubscribe succeeds, a repeated POST is idempotent. Wait for
   the second match's real eligible event and require zero notification/email
   for either owner. Repeat ticks to prove the earlier events did not duplicate.
   This proves the endpoint, not a human tapping the email's link.
8. Restore preferences, languages and all email settings; retire a failed or
   partial world, but retain a successful world for the owner's email/UI comparison.
   Remove the temporary runtime overrides; verify
   old fingerprints and exact restored flags. Actual delivery and score evidence
   remains. Restore cron/Rivals and remove the private recovery row only after
   successful verification. The empty owner-only recovery table remains for a
   future interrupted-run recovery; it is not a production migration.

After the owner confirms received mail against the actual f970 points, deadline
and match screens, dispatch the same workflow with action `reminderretire`.
It takes a new exclusive staging writer window, requires this named active
fixture and its two verified final results, and saves/restores that window's
current settings. Its durable context also records whether runtime overrides
were created, so interrupted retirement cannot delete pre-existing overrides.
Do not retire a successful
fixture before the owner can inspect it, or mistake another season's 96 points
for the actual recap. The separate f960 phone fixture is prepared afterward.
This is a fixed one-shot fixture. A future new measured run needs a reviewed
fresh namespace; retirement does not reopen or recycle this season.

The hosted run takes about 110 minutes, mainly real waiting. It uses a standard
GitHub runner in this public repository. The 150-minute job limit leaves cleanup
margin. Do not cancel it to accelerate a deadline. On failure or cancellation,
inspect the writer/lease state and run the same workflow with action
`reminderrecover` using its saved private context; never start a fresh fixture
over an unfinished one. An unresolved writer leaves the window paused.

## Evidence boundaries

The local Docker CI check exercises the exact seed and current-time planner,
verifies no early event, and rolls everything back. It does not advance a clock
or prove a positive window, elapsed time, email transport or receipt.
Unit tests cover target/origin/owner guards and actual response-loss semantics.
The hosted run must supply real timing and durable state evidence separately.

Provider `sent` means accepted. After the run, the owner must confirm inbox
receipt, staging links and the displayed kickoff/deadline/96 points against the
actual French/Arabic UI. The iPhone session also checks the bell's honest wording
when email or another preference is off. This automation does not certify native
push, a screen reader, a phone browser, signup/reset SMTP, or load-test capacity.
