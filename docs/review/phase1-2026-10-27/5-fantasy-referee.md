# Fantasy Referee audit, Phase 1 (read-only) - fantasy-r2

Revision of r1 after Lead review: FIXED 1 (F9 re-traced and lowered to Low), FIXED 2 (new F17, RapidAPI quota blackout). Everything else is unchanged from r1.

Auditor: FANTASY REFEREE. Repo `/home/user/botolago-foundation`, tree as checked out on 2026-10-27. No file in the repo was changed, nothing committed, no database, no RapidAPI, no login. The only file written outside the repo is this report plus a scratch script `/tmp/claude-0/-home-user-botolago-foundation/28165697-c0db-582d-a9c4-20a0f74bacc1/scratchpad/phase1/ex.ts` used to compute the worked examples from the real modules.

Read first: `AGENTS.md`, `CLAUDE.md` (binding; this audit respected the one-writer rule by doing no writes at all).

Correction to the brief (matters for Q2): the repo does NOT treat Morocco as "UTC+1 with a Ramadan switch to UTC+0" any more. Since 2026-09-20T01:00:00Z the app's rule is **UTC+0 all year** (decree n 2.26.530, IANA tz 2026c, owner-confirmed 2026-10-15): `src/lib/morocco-time.ts:20-30`, `supabase/migrations/20261016090000_morocco_time_helpers.sql:1-60`, `docs/production/MOROCCO_TIME_FIX_OWNER_RUNBOOK.md:1-12` (all five time scripts reported applied on Production V2). The deadline itself is a `timestamptz` instant, so the Ramadan question never touches enforcement; it only touches display and notification text.

---

## Findings

Severity scale is from the point of view of "we sell a prize-bearing sponsored challenge". Findings that depend on production data I could not read are marked (prod-data).

### F1. No post-finalization correction path exists, although the rules promise one
- What: `FANTASY_RULES_V1.md` ("Exceptional fixtures and corrections") and `ADAPTIVE_FANTASY_SCORING.md` ("Published corrections still require the existing reviewed 72-hour correction process") describe a 72h correction window with "a new calculation version and audit record". In code there is a `app_private.fantasy_corrections` table and a `correction_window_hours` column, but nothing writes the table, nothing reads the column, and nothing ever sets a gameweek to `corrected`. The recorder and the finalizing guard actively refuse input after sealing.
- Where: table only at `supabase/migrations/20260720141850_fantasy_scoring_leagues_operations.sql:236-262`; column at `20260720163222_fantasy_ruleset_v1.sql:139,147,390`; only other mentions are the cleanup/QA scripts (`grep -rn fantasy_corrections supabase scripts src` = the table DDL, an index, the account-deletion worker, and `scripts/backend/fantasy-cleanup-qa-artifacts.sql`). `grep "status *= *'corrected'"` over migrations/scripts/src finds zero assignments. Guards: `20261019073221_fantasy_finalizing_fixture_performance_guard.sql:1-3,24-26`, `docs/backend/ADAPTIVE_FANTASY_SCORING.md` ("this endpoint does not reopen published weeks").
- Why it matters: if a rating, identity or minutes error is found after finalization (and the prize for that gameweek is already `pending` for a winner), there is no sanctioned way to fix scores, rankings and prize eligibility. The only remedy is hand-written SQL on production, which `CLAUDE.md` restricts to owner-run guarded scripts. A sponsor will ask "what if the data was wrong?" and the written answer (72h window) is not backed by code.
- Severity: High. Effort: L (design + RPC + re-rank + re-prize + notification re-send gating).
- Proof: the greps above; `FANTASY_RULES_V1.md` text vs. no function. Note `docs/backend/FANTASY_RATING_POINTS.md` ("Corrections and late ratings") only covers corrections BEFORE finalization.

### F2. A prize period is permanently skipped if the prize is off, nobody is eligible, or a rating revision is visible at the moment the gameweek finalizes
- What: `api.service_evaluate_fantasy_prizes` evaluates each finalized gameweek once. `fantasy_prize_evaluate_gameweek` writes its journal row unconditionally after calling `fantasy_prize_award`, even when the award returned `no_active_prize`, `no_eligible_candidate` or (since 20261018215311) `awarded:false / fantasy_ratings_pending`. The next run only picks gameweeks with no journal row, so the period is never revisited.
- Where: `20260924120000_fantasy_prizes.sql:643` (`no_active_prize` early return), `:852-855` (unconditional journal insert), `:884-905` and `:924-949` (only gameweeks without a journal row are selected); wrapper `20261018215311_fantasy_publish_available_api_ratings.sql:507-514`.
- Why it matters: for a SPONSORED challenge the sponsor's prize row must already be `active` before the first affected gameweek finalizes. If the owner switches the sponsor prize on one hour late, that gameweek, and for monthly/season tiers the block, is never awarded and nothing alerts anyone. Prizes ship inactive (`20260924120000...:80-81`, `APPLIED_2026_09_24_FANTASY_PRIZES.md:155-166` says three were switched on, but any new sponsor prize repeats the trap).
- Severity: High. Effort: S-M (do not write the journal row unless the outcome is `awarded`/`already_awarded`, or write a retryable status).
- Proof: lines above. Worked trace: prize inactive, GW7 finalizes -> `fantasy_prize_award` returns `{"status":"no_active_prize"}` -> journal row for GW7 inserted -> activate prize -> `service_evaluate_fantasy_prizes` finds no un-journaled finalized gameweek -> GW7 never awarded.

### F3. Season prize and the GW1-4 monthly block cannot be awarded or paid while a "visible rating revision" exists for GW1-4 (prod-data)
- What: migration 20261018215311 renames `fantasy_prize_award` and wraps it: if ANY gameweek in the period has a current rating publication, it returns `{awarded:false, reason:fantasy_ratings_pending}`. A trigger also refuses `verified`/`paid` on any winner whose gameweek range covers a publication. Publications are immutable. The season tier covers GW1..30, so every season winner inherits the block; monthly block GW1-4 likewise. Combined with F2 the evaluation is journaled and never retried.
- Where: `20261018215311_fantasy_publish_available_api_ratings.sql:491-516` (guard + wrapper), immutability `:~130-150`, season range `20260924120000_fantasy_prizes.sql:820-835`.
- Why it matters: the season grand prize (25,000 MAD per `APPLIED_2026_09_24_FANTASY_PRIZES.md:155-160`) could be un-payable by design after the GW1-4 recovery publications. Whether publications exist in production I cannot see.
- Severity: High (prod-data). Effort: M (owner decision on which GW1-4 numbers count, then code the exception).
- Proof: code above; I did not query `app_private.fantasy_rating_publications`.

### F4. A gameweek can hang forever waiting for a rating (no timeout, no escape hatch, poll horizon shorter than the provider's lag, API quota can starve it)
- What (a): an appeared player with 10+ minutes and no rating is `pending` forever. The only settlement ("Not rated") applies to 1-9 minutes with two reads 24h apart. `FINAL_LIMITED` / time limits explicitly do not authorize finalization.
- What (b): rating polls follow a fixed back-off whose last mark is 14 days after full time, with a 6h window after each mark; after `finalized_at + 14d + 6h` the fixture is no longer a poll candidate. The repo's own doc says SofaScore publishes full Botola statistics "5-16 days after the match".
- What (c) (live risk, see F17): the RapidAPI guard refuses every endpoint except live-events and incidents above the soft limit (default 8,500); the rating poll is a lineups request, which is not "essential", so it is refused at the soft limit and at the hard limit nothing is sent.
- Where: (a) `supabase/functions/_shared/fantasy-lifecycle-worker.ts:285-336` (`approvedNotRated`: `minutes < 1 || minutes >= 10 -> false`; `hasPendingRatings`), `docs/backend/FANTASY_RATING_POINTS.md` "Risks" ("remains pending, including after FINAL_LIMITED"); (b) `20261026143000_rapidapi_budget_guard_and_poll_schedule.sql:279-312` (`interval '14 days'`, `+interval '6 hours'`), `docs/backend/SOFASCORE_STAGED_STATS.md:199`; (c) `supabase/functions/_shared/rapidapi-client.ts:25-28,199-215`, `20261026143000...:66` (`soft_limit default 8500`).
- Why it matters: fans see a gameweek stuck "pending", prizes for that gameweek and everything after (prizes evaluate in sequence, never skipping an unfinalized gameweek, `20260924120000...:924-949`) are blocked, and the sponsor's campaign calendar slips. There is no alert path except the existing health checks; no automated "give up and ask the owner" step.
- Severity: High. Effort: M (owner policy for 10+ minute unrated players and for >14-day lag; alert at +7d; allow a reviewed manual rating entry).
- Proof: line cites; unit test `scripts/backend/fantasy-lifecycle-runner.test.ts:906-1010` shows `stats.minutes = 10` makes `calculateSnapshotResults` throw `fantasy_ratings_pending`.

### F5. The rating that is sealed is the first "complete" read; later SofaScore changes are not picked up
- What: polling for a fixture stops as soon as the latest source row is `ready` (every appeared player rated). SofaScore's own explainer (quoted in `FANTASY_NOT_RATED_APPROVED_BRIEF_20261019.md`) says ratings keep updating after the whistle. The seal takes whatever was read first.
- Where: `20261026143000_rapidapi_budget_guard_and_poll_schedule.sql:306-308` (`not coalesce(latest.ready,false)`), `fantasy-api-ratings.ts:35` (`ready` definition), seal rules in `ADAPTIVE_FANTASY_SCORING.md`.
- Why it matters: a fan opens the SofaScore app days later, sees 7.4 where BotolaGO used 7.6 (rounds 7 vs 8). For a prize decided by one point that is a dispute. Not a bug (documented, deterministic), but it must be in the prize rules.
- Severity: Medium. Effort: S (document "rating as first fully published") or M (settle window of N hours before sealing).
- Proof: the `not coalesce(latest.ready,false)` predicate; `FANTASY_RATING_POINTS.md` "Corrections and late ratings" (re-pulls only help before finalization).

### F6. Prize eligibility ignores the public-ranking exclusion list, and prize tie-breaks differ from the leaderboard's
- What (a): `fantasy_prize_ineligibility` skips only flagged accounts, staff, and the cap rules. Accounts on `app_private.public_ranking_exclusions` (hidden QA/test accounts) are hidden from the public boards but are still ordinary prize candidates.
- What (b): leaderboard tie-break: points, **transfer hits ascending**, **confirmed transfers (all, including Wildcard/Free Hit)** ascending, latest finalized GW score, team created, team id. Prize tie-break: points, transfers **excluding** Wildcard/Free Hit, team created, team id. Two managers level on points can be ordered differently on the public board and by the prize logic.
- Where: (a) `20260924120000_fantasy_prizes.sql:550-596` vs `20261011160000_public_ranking_exclusions.sql:1-40`; (b) `20260720163222_fantasy_ruleset_v1.sql:849-935` (`transfer_hits asc, confirmed_transfers asc, latest_finalized_gameweek_score desc`) vs `20260924120000_fantasy_prizes.sql:705`.
- Why it matters: an invisible account could take a prize; a fan who is shown as rank 1 may not be the prize winner. The Terms (`src/content/legal/prize-terms.ts:78-82`) only describe the prize order.
- Severity: Medium. Effort: S.
- Proof: no reference to `public_ranking_exclusions` in the prize functions (`grep -n public_ranking_exclusions 20260924120000_fantasy_prizes.sql` = 0).

### F7. A first kickoff moved EARLIER inside the 90-minute window leaves the old (later) deadline in force
- What: calendar sync recomputes the deadline from the earliest assigned kickoff. If the new deadline is already in the past while the old one is still future, it records `new_deadline_in_past` and leaves `deadline_at` unchanged. The only user-edit guard is `statement_timestamp() >= deadline_at`, so managers can still change lineups/transfers/chips after the moved-up match has begun.
- Where: `20260924200000_fantasy_postponement_and_enrolment.sql:356-362` (the branch), guard `20261016180000_fantasy_deadline_mutation_lock.sql:95-125`. No guard on "a counting fixture is live".
- Why it matters: this is the one path where the deadline "shown and enforced" can sit after real kickoff; late edits with live knowledge are the exact cheat sponsors fear. Probability is low but real in Botola scheduling.
- Severity: Medium. Effort: S (in the branch set `deadline_at = least(old, now)`, or add "no counting fixture live/finished" to `fantasy_assert_mutable_gameweek`).
- Proof: trace: now=13:00, old kickoff 20:00 (deadline 18:30), provider moves kickoff to 14:00 -> new_deadline 12:30 <= now -> note only -> edits accepted until 18:30 while the match starts at 14:00.

### F8. Anti-multi-account / bot controls are minimal; one-account-per-person is enforced only by a post-win manual ID check
- What: signup is email + confirmation (local `supabase/config.toml:221-226`); CAPTCHA is commented out (`:213-216`); phone signup is off (`:257-261`). No disposable-email list, no `+alias`/dot normalization, no device/IP linkage, no per-user limit on creating Fantasy leagues (invite codes are 128-bit, so guessing is not the risk). `create_fantasy_team` is one team per (user, season) (`20261016180000...:170-175`), plus an optional pilot cap. Mini-league prize needs `mini_league_min_members` (default 10) and one merchandise prize per user, but one person with 10 verified emails can fill a league. Detection is manual: each winner is ID-checked (`prize-terms.ts:85-92`), and flags exist (`app_private.fantasy_prize_flags`).
- Where: `supabase/config.toml:197-216`; grep for `disposable|mailinator|canonical_email|normalize_email|captcha|turnstile` over `src supabase scripts` finds only the commented config lines; league create `20260926003100_ordinary_account_mfa_step_up.sql:2779-2827` (no count limit); prize cap rules `20260924120000_fantasy_prizes.sql:550-596`.
- Why it matters: a sponsor-funded prize with one-account-per-person in the Terms but no technical enforcement invites farm accounts. Manual ID check catches the winner's own duplicates only if staff compare identities; a person can win a gameweek prize with account A while accounts B and C feed a league.
- Severity: High for a cash-value sponsored challenge, Medium otherwise. Effort: M (Turnstile on signup, email canonicalization + disposable list, per-user league cap, duplicate-ID check at verification) to L (phone/ID at entry). Production Auth settings are unknown to me (see "could not check").
- Proof: greps above.

### F9. (FIXED 1) Server does not infer the active chip when confirming transfers; the shipped app does send it, so this is a robustness gap only
- What: the hit and the Free Hit snapshot depend on the `p_chip_type` argument of `confirm_fantasy_transfers`/`preview_fantasy_transfers`, not on the team's chip use (`20260926003100_ordinary_account_mfa_step_up.sql:1850-1852`; snapshot only when `p_chip_type = 'free_hit'` in the confirm body, `:2517-2560`). A client that omits it while a Wildcard/Free Hit is active pays hits, or (Free Hit) makes the transfers permanent. Activating Wildcard after already paying hits does not refund them (`20261016180000...:290-330`; hits summed per gameweek, `20260927094823...:812`).
- Trace of the real app (why it drops to Low): `src/backend/fantasy/supabase-repository.ts:128,152,169` send `chip ?? undefined`. On the transfers screen (`src/routes/fantasy.transfers.tsx:124-126`) `chipsState` for a cloud user is `owned.snapshot.lifecycle.chips`, built from the server DTO on every load (`src/services/fantasy-owned-repository.ts:749-753`, `team.chips.active`). Preview passes `chip: chipsState.active` (`:252-255`, and it is in the query key `:235`); confirm passes `v.chips.active` (`:642`, repo `:858`). So a reload or a new tab re-reads the chip from the server. The stale-tab case (chip activated in another tab) does not drop the chip: activation bumps `team.version` (`20261016180000...` activate body), and this tab's `expectedVersion` is stale, so the server answers `version_conflict` and the screen reloads. I found no path in the shipped screen where an active Wildcard/Free Hit is silently not sent.
- Why it matters: only third-party or buggy clients, or a future client regression, can trigger it; the cost lands on the manager and cannot be refunded after finalization (F1).
- Severity: Low (was Medium in r1). Effort: S (derive chip from `fantasy_chip_uses` for the gameweek; reject mismatch).
- Proof: line cites above; not executed (no browser, no DB).

### F10. A captain who plays 1-9 minutes "Not rated" scores 0 doubled and the vice-captain is not promoted
- What: a settled short appearance contributes no event (0 points) but still counts as `didPlay`, so the captain is "effective" and the vice is not promoted.
- Where: `fantasy-lifecycle-worker.ts:380-387` (`total.didPlay ||= player.apiAppeared ?? ...`), `fantasy-substitutions-core.ts:209-215`, test `scripts/backend/fantasy-lifecycle-runner.test.ts:906-914`.
- Why it matters: Example 6 below: team total falls from 76 to 58 on a 7-minute captain cameo. It follows FPL's "captain played" rule, but under rating scoring a 7-minute appearance is worth 0, which fans will not expect. Needs an explicit statement in the prize rules.
- Severity: Medium (policy). Effort: S if the owner wants "captain with 0 points is replaced by vice" (rule change), otherwise S to document.
- Proof: test above passes (`provisionalScore` 58 asserted).

### F11. The UI locks and unlocks by the device clock; server time is never used
- What: `evaluateDeadline(iso, now = new Date())` drives `isLocked` in team, transfers and create screens. The server decision is correct (DB clock, no grace), so no one can cheat, but a phone with a fast clock sees "locked" before the deadline and a slow clock shows editable after it (the save then fails with `fantasy_gameweek_locked`).
- Where: `src/lib/fantasy-engine.ts:332-336`; uses `src/routes/fantasy.team.tsx:165`, `src/routes/fantasy.transfers.tsx:302`, `src/routes/fantasy.create.tsx:271`.
- Why it matters: "deadline shown vs enforced" can differ by the user's clock error; a sponsor's "deadline missed" support ticket is typically this.
- Severity: Low-Medium. Effort: S (send server `now` with the gameweek DTO and use the offset).
- Proof: code cites.

### F12. Some Fantasy times are formatted without the Morocco rule; the UTC+0 rule has three hand-kept copies
- What: `GameweekRecapCard.tsx:115` and `PublicRecapView.tsx:137` use plain `Intl.DateTimeFormat` with no `timeZone`, so they render in the viewer's or server's zone (hydration mismatch risk, the exact failure `morocco-time.ts` documents). The rule constant `2026-09-20T01:00:00Z` lives in `src/lib/morocco-time.ts:31`, `supabase/functions/_shared/morocco-time.ts`, and SQL `20261016090000...:55-61`; a test checks TS vs SQL parity (`src/lib/morocco-time-sql.test.ts`) but SQL logic runs only in pgTAP. Deadline display itself is correct (`src/components/fpl/deadline.ts:16-27` uses `moroccoDateTimeFormat`).
- Why it matters: finalized-at/updated-at stamps on public recap pages can be off by an hour on a stale-tz-data browser (Chromium 149 still on 2026a per the file comment). Not deadline-critical.
- Severity: Low. Effort: S.
- Proof: cites; for Morocco, a future change of decree would need all three copies edited.

### F13. The same rule exists in several places that can disagree (client engine vs server)
- What: (a) `src/services/lifecycle-service.ts:124-126` rolls free transfers "+1, cap 2" for every week including Wildcard/Free Hit weeks, while the ruleset, SQL (`service_roll_fantasy_free_transfers` -> `post_gameweek_free_transfers = 1`, `20260720163222...:~915-940`) and `src/backend/fantasy/rules.ts:147-153` give exactly 1 after Wildcard/Free Hit. (b) `src/lib/fantasy-engine.ts:67-80` lets a chip be cancelled before the deadline; the server forbids it (`activation_cancellable = false`, `20260720163222...:359-369`). (c) `src/backend/fantasy/rules.ts` (`validateFantasySquad`, `calculateTransferCost`, `resolveChipAllocation`) and `ranking.ts` are only used by tests, not by production paths (grep shows no non-test caller). (d) `CloudFantasyRepository` in `src/services/fantasy-owned-repository.ts:411-664` calls `save_fantasy_team_v2` and `finalize_fantasy_gameweek_v2`, which exist in no migration; it is not instantiated (lines 948-972 pick V2/Guest/Local).
- Why it matters: local/guest mode shows managers rules that differ from the server's; and a future developer may fix one copy. Nothing here changes a prize.
- Severity: Low. Effort: M (delete dead copies or generate them from one source).
- Proof: line cites; `bun test src/backend/fantasy` passes because it tests the unused TS copies against themselves.

### F14. One broken team or one fixture mismatch blocks locking the whole gameweek (fail-closed, but total)
- What: at the deadline the lock step refuses the entire gameweek with `fantasy_lineup_missing` if a single active team whose `current_gameweek_id` is this gameweek lacks a lineup, and with `fantasy_fixture_resolution_required` if any counting fixture is postponed/suspended/has a kickoff different from the assigned one. Edits stay blocked (deadline guard), so fairness is intact, but scoring cannot start.
- Where: `20260924200000_fantasy_postponement_and_enrolment.sql:515-526`.
- Why it matters: a single orphan account can delay every manager's results; the health checks page but a human has to act.
- Severity: Low-Medium. Effort: S-M (lock the healthy lineups, quarantine the orphan).
- Proof: lines above.

### F15. The current body of key functions is assembled at apply time and cannot be audited from the repository alone
- What: several current definitions are produced by `pg_get_functiondef(...)` + `replace(...)` + `execute`, guarded by md5 of the previous body (persist results, `fantasy_rules`, rankings, fantasy_email_payload, player pool, prize_award wrapper, etc.). The repo shows the patch, not the resulting function.
- Where: `20261018153305_fantasy_require_actual_api_ratings.sql:12-18`, `20261018215311...:504-516` and `:~60-70`, `20260927140000_incremental_fantasy_points.sql:388-402`, `20261020091926_fantasy_native_final_email_gate.sql:15-19`.
- Why it matters: for a sponsor audit "the code that scored this week" must be producible. Today it needs a production `pg_get_functiondef` dump (needs a DB read, which I was forbidden to do).
- Severity: Medium. Effort: S (owner-run read-only dump of the current bodies + md5s into `docs/`).
- Proof: cites. I traced current versions by reading the chain (see "Where is the current version" below), but the final bodies for `service_persist_fantasy_scoring_results` and `fantasy_rules` come from a 4-migration chain that I could not execute.

### F16. A kickoff at exactly 00:00:00 UTC is treated as an unconfirmed placeholder
- What: `fantasy_kickoff_confirmed` returns false for `00:00:00` UTC. Under permanent UTC+0 that is a legitimate local midnight; such a fixture would block calendar sync ("kickoff_unconfirmed") instead of getting a deadline.
- Where: `20260918120000_fantasy_calendar_sync.sql:23-31`.
- Severity: Low. Effort: S (flag placeholders differently).
- Proof: function body.

### F17. (FIXED 2) RapidAPI quota floor: if the provider reports 0 of 10,000 remaining, every SofaScore job is skipped until the window resets (~10 Nov)
Code-only reasoning; I have no DB or API access, so the current figure is taken from the Lead's brief (provider answered `quotaRemaining 0` of 10,000 on 26 Oct, window opened 10 Oct per the migration header).
- Mechanism: `20261027100000_rapidapi_provider_quota_floor.sql:97-125` makes `rapidapi_calls_this_month()` return `greatest(our count, quota_limit - remaining)` = 10,000 once the Edge function records the provider's own figure. That figure is what `api.service_rapidapi_budget` feeds to the Edge guard (`20261026143000...:270`). Soft/hard limits are configurable (defaults 8,500 in `:66`; the 20261027 header cites 9,600/9,950); 10,000 exceeds both.
- Which jobs stop: every run of `football-live-refresh` reads the budget first and, at `used >= hardLimit`, returns HTTP 200 `skipped / monthly_budget_hard_limit` before any provider call (`supabase/functions/_shared/football-live-refresh.ts:170-195`). That covers all jobs that go through it: the live feed (scores, status, lineups, incidents), `rating_polls`, staged-stats/details backfill, `catalog_weekly` (crests, photos) and the season fixture refresh. Nothing is retried against the provider; the client would also refuse (`rapidapi-client.ts:199-215`). The pg_cron jobs keep firing and report `ok`, so a plain "job succeeded" signal hides the blackout; the `rapidapi_budget` health check is the only direct signal (it reads the same count).
- What still runs (database only): the deadline lock step, the five-minute lifecycle tick, the Fantasy worker pass, ranking and prize code. They act on whatever is already in the tables.
- Can the current gameweek finalize? Only if everything it needs is already stored. A gameweek needs (a) each counting fixture `finished` with `finalized_at` (set by the live refresh, `service` lock step `live -> provisional` requires it, `20260924200000...:~575-590`) and (b) a `ready` rating source for every appeared player (F4). Matches that finished before the cutoff and already have a `ready` source are unaffected and the worker finalizes them normally. Anything missing waits: the worker returns `waiting / fantasy_ratings_pending` or the gameweek stays `locked/live` (`football_not_final`), without any write. No score is invented, so results stay correct but late. A fixture played during the blackout will not become `finished` in our tables at all until the refresh runs again.
- Poll horizon during a ~14-day blackout: yes, it can expire. A rating poll is a candidate only while `now < finalized_at + due_mark + 6h` for the latest passed mark (15m, 1h, 3h, 12h, 24h, 48h, 4d, 7d, 14d) (`20261026143000...:285-312`). Every mark that falls between ~26 Oct and the reset loses its 6h window for good (the job is skipped, not queued). For a fixture finished and not yet `ready`: if `finalized_at + 14d + 6h` is earlier than the reset (finalized before about 26 Oct 18:00 UTC if the reset is 10 Nov 00:00 UTC), no mark is left after the reset, it is never polled again, and its gameweek is stuck on F4(b) until someone re-opens polling by hand. A fixture finalized about 27 Oct or later keeps only its 14d mark after the reset (one 6h window with 30-minute retries), so a rating that is still missing then also has one shot. Matches already `ready` before the blackout are safe.
- What fans see: live scores and match pages freeze (no status changes, no goals), "points pending" or the awaiting-rating animation on affected players, gameweek shown as awaiting final statistics, no final-points email for that gameweek (the email gate needs a sealed native snapshot with nothing pending, `20261020091926...`), no prize evaluation for it or any later gameweek (sequential, `20260924120000...:924-949`), and the next gameweek not opening if its predecessor cannot reach its close step. Deadlines and lineup editing keep working exactly (DB clock). Stale kickoffs also mean a kickoff moved by the provider during the blackout is not seen, so the shown deadline may be wrong in either direction (see F7, F14).
- Severity: High while the provider figure is at the cap (it directly blocks scoring of in-flight gameweeks and can permanently strand fixtures through the horizon). Effort: S to unblock (raise the plan or wait for the reset, then re-open polls for stranded fixtures) and M to harden (poll horizon relative to the last successful provider window, a clear health state, reserve calls for rating polls above the soft limit).
- Proof: file/line cites above. Not verified: the real `rapidapi_provider_quota` row, the real `reset_day_of_month`, which fixtures are currently pending.

### Notes that are not findings but affect the sponsor story
- Two scoring regimes exist in one season: GW1-4 under the category scale (finalized), GW5+ under SofaScore rating points, with GW1-4 "visible rating revisions" layered on top that never overwrite final results (`20261018215311...:1-3`). Which numbers count for the season prize is an owner decision (Question 2).
- The original category rules for GW1-4 (`FANTASY_RULES_V1.md`) and the rating rule for GW5+ (`FANTASY_RATING_POINTS.md`) are internally consistent with their code (see "What I checked"). `docs/backend/FANTASY_RATING_POINTS.md` still says "Status: built, off" while later documents (`20261020091926`, `FANTASY_SELECTION_CLOSE.md`) describe native rating scoring as live; the status line is stale.

---

## Worked scoring examples

All numbers below were produced by running the real modules (`bun run .../scratchpad/phase1/ex.ts`), importing `supabase/functions/_shared/fantasy-scoring-core.ts`, `fantasy-rating-scoring.ts`, `fantasy-substitutions-core.ts`. Rule values are the seeded `botolago-fantasy-v1.0` rows from `supabase/migrations/20260720163222_fantasy_ruleset_v1.sql:314-341` (goal GK10/DEF6/MID5/FWD4, clean sheet GK4/DEF4/MID1/FWD0, assist 3, saves 1 per 3, penalty save 5, conceded -1 per 2 for GK/DEF, penalty miss -2, yellow -1, red -3, own goal -2, appearance 1 under 60 / 2 from 60).

Category scoring (GW1-4, `scorePlayerFixture`, `fantasy-scoring-core.ts:59-107`):

1. Forward, 90', 1 goal, 1 assist, 1 yellow. Expected by the doc table: 2 + 4 + 3 - 1 = **8**. Code output: `appearance:2, goal:4, assist:3, yellow_card:-1`, TOTAL **8**. Agree.
2. Goalkeeper, 90', 5 saves, 1 penalty save, 1 goal conceded. Doc: 2 + floor(5/3)=1 + 5 + floor(1/2)=0 = **8**. Code: `appearance:2, saves:1, penalty_save:5`, TOTAL **8**. Agree.
3. Defender, 59 minutes, team kept a clean sheet while he played. Doc: under 60 -> appearance 1, clean sheet requires 60 -> **1**. Code: `appearance:1` TOTAL **1**. At 60 minutes: `appearance:2, clean_sheet:4` TOTAL **6**. Agree (threshold is `>= 60`, `fantasy-scoring-core.ts:76-88`).
4. Defender, 90', 3 goals conceded, 1 own goal, 1 direct red. Doc: 2 + (-floor(3/2) = -1) + (-2) + (-3) = **-4**. Code: `appearance:2, goals_conceded:-1, red_card:-3, own_goal:-2` TOTAL **-4**. Agree.
5. Midfielder, 90', 2 goals, clean sheet. Doc: 2 + 10 + 1 = **13**. Code: **13**. (A defender conceding 4 with 8 "saves" gets saves ignored: `appearance:2, goals_conceded:-2` = 0.)

Rating scoring (GW5+, `ratingPoints`, `fantasy-rating-scoring.ts:56-61`; DB repeats it as `floor(rating+0.5)` at `20261018173321_fantasy_api_rating_recovery.sql:352,566`):

6. Rounding: 7.5 -> **8**, 7.49 -> **7**, 6.5 -> **7**, 5.55 -> **6**, 7.45 -> **7**, 10 -> **10**. `7.495`, `10.01`, `-1`, `NaN` throw `fantasy_rating_invalid`; `null` throws `fantasy_ratings_pending`; a player who did not appear yields `[]` (0 points). TS and the SQL formula agree on every ratings with at most two decimals (which is what the DB constraint admits).
7. Team arithmetic through `calculateSnapshotResults` (existing test, which passes: `scripts/backend/fantasy-lifecycle-runner.test.ts:845-1010`): ratings {0:7.5, 2:5, 3:7.49, 7:8.5(captain)} others 6.0 -> player points 8, 5, 7, 9, others 6. Starters sum = 8+5+7+6+6+9+6+6+6+6+6 = **71**, captain extra (x2) = +9, bench = 24, transfer hit = 4. Score = 71 + 9 - 4 = **76** (asserted `provisionalScore: 76`; Triple Captain would add 2x9 = 18, Bench Boost adds 24 only when active, `fantasy-lifecycle-worker.ts:419-432`).
8. Same team, captain (index 7) plays 7 minutes with no rating and the 24h/two-read "Not rated" proof exists: player 7 scores 0, captain stays effective, vice not promoted: starters 62, captain extra 0, hit 4 -> **58** (asserted `provisionalScore: 58`, `effectiveCaptainId = id(107)`). See F10.
9. Substitution + vice promotion (`calculateAutomaticSubstitutions`, output of my run): squad 3-5-3 with DEF d3 and captain FWD f1 not playing, vice f2 playing; bench order GK, DEF, MID, DEF all playing. Result: `d3 -> d4` (first bench player who keeps a legal formation; the bench GK is skipped for an outfield slot), `f1 -> m5` (3-5-2 is legal), `effectiveCaptainId = f2`. Agrees with `FANTASY_RULES_V1.md` ("automatic substitutions apply only to zero-minute players, preserve a valid formation, follow bench order; vice promoted only when the captain has zero minutes").
10. Transfer hit (SQL `preview_fantasy_transfers`, `20260926003100...:1847-1852`, vs TS `calculateTransferCost`, `src/backend/fantasy/rules.ts:101-108`): 3 transfers with 1 free transfer -> `free_used = 1`, hit = (3-1) x 4 = **8** in both; with `p_chip_type = 'wildcard'` hit **0** in both. (The SQL takes the chip from the argument, see F9.)

Tests I ran (exact results):
- `bun test src/backend/fantasy` -> `322 pass, 0 fail, 2975 expect() calls, 22 files [2.43s]`.
- `bun run test:timezone-parity` -> `Node 22.23.2 (tz 2026a): identical to the expected output (22 instants)`, `Node 22.23.3 (tz 2026c): identical (22 instants)`, `Chromium 153.0.8010.12: identical (22 instants)`; it also prints that 2026a answers 17:00 for 16:00Z on 2026-10-02 where 2026c answers 16:00, i.e. the app's own rule hides that difference.
- `bun test supabase/functions/_shared/fantasy-rating-scoring.test.ts supabase/functions/_shared/fantasy-lifecycle-handler.test.ts scripts/backend/fantasy-lifecycle-runner.test.ts scripts/backend/fantasy-lifecycle-runner-staged.test.ts src/lib/morocco-time.test.ts src/lib/morocco-time-sql.test.ts` -> `172 pass, 0 fail, 9707 expect() calls, 6 files [3.02s]`.
- pgTAP (`supabase/tests/database/*`, 50+ fantasy/prize files): NOT run. `docker ps` -> "failed to connect to the docker API at unix:///var/run/docker.sock". I make no claim that any pgTAP test passes; CI `database-quality` is the authority (`CLAUDE.md` Evidence).

Where is the current version (later migrations override earlier ones), for the functions on which findings rely:
- Deadline arithmetic: `app_private.fantasy_calculate_deadline` = `20260720163222_fantasy_ruleset_v1.sql:396-407` (never redefined; `minutes_before_first_fixture` = 90, `grace_period_seconds` = 0 at `:349-352`; copied to v1.1+ at `20260803173344...:98-106`).
- Deadline guard: `app_private.fantasy_assert_mutable_gameweek` = `20261016180000_fantasy_deadline_mutation_lock.sql:95-125` (replaces `20260720141854_fantasy_api_security.sql:~38`).
- `api.create_fantasy_team`, `activate_fantasy_chip`, `cancel_fantasy_chip` = `20261016180000...`; `api.save_fantasy_lineup`, `preview_/confirm_fantasy_transfers`, `create_/join_fantasy_league` = `20260926003100_ordinary_account_mfa_step_up.sql` (lines 2378, 1720, 2465, 2779, 2829).
- Lock step `api.service_advance_fantasy_lifecycle` = `20260924200000_fantasy_postponement_and_enrolment.sql:433-...`; calendar sync (same file, ~:150-420).
- Rankings: `api.service_recalculate_fantasy_rankings` = `20260720163222...:849`, patched by `20260927140000_incremental_fantasy_points.sql:388-402`.
- Persist results: `api.service_persist_fantasy_scoring_results` = chain `20261013180000` -> `20261014090100` -> `20261018153305` -> `20261018173321` (-> not-rated wrapper `20261019172832`); body assembled at apply time (F15).
- Scoring arithmetic (TS): `supabase/functions/_shared/fantasy-scoring-core.ts`, `fantasy-rating-scoring.ts`, `fantasy-substitutions-core.ts`, `fantasy-lifecycle-worker.ts`.
- Prizes: `20260924120000_fantasy_prizes.sql` + wrapper `20261018215311...:504-516` + guard trigger `:491-501`.

---

## What I checked and found fine

- Doc table (`FANTASY_RULES_V1.md` Scoring) equals the seeded SQL rows and `scorePlayerFixture`: appearance 1/2 at 60, goals GK10/DEF6/MID5/FWD4, assist 3, clean sheet GK4/DEF4/MID1/FWD0 only at 60+ minutes, GK saves per 3, penalty save 5, conceded per 2 for GK/DEF, penalty miss -2, yellow -1, red -3, own goal -2 (`20260720163222...:314-341`, `fantasy-scoring-core.ts:74-106`, `fantasy-lifecycle-worker.ts:205-263` which also rejects any ruleset that differs).
- Goals conceded and clean sheet for the SofaScore path are computed while the player is on the pitch, not for the whole match (`sofascore-fantasy.ts:595-637,666`), so a substitute is not charged for goals he did not see; second yellow cards are held for review instead of being double counted (`:415-420`, `:687`).
- Captain x2, Triple Captain x3, vice only on a zero-minute captain, Bench Boost bench points, chip exclusivity: code (`fantasy-lifecycle-worker.ts:419-460`) and ruleset (`captain_multiplier 2`, `triple 3` at `20260720163222...:300-312`) agree.
- Deadline = first counting kickoff - 90 minutes, pure instant arithmetic, no time-zone function involved (`fantasy_calculate_deadline`). No hard-coded `+01:00`/`UTC+1` appears in any Fantasy code path (`grep -rn "+01:00\|UTC+1" supabase/migrations src supabase/functions` over Fantasy files = none; Casablanca literals are in unrelated Pepites/analytics/football-day code or already replaced by `app_private.morocco_*`).
- Deadline enforcement is server side and exact: every manager write calls `fantasy_assert_mutable_gameweek` which refuses `status <> 'open' OR statement_timestamp() >= deadline_at` (no grace), takes `FOR KEY SHARE` on the gameweek so a write that started before the deadline cannot commit after the lock step has locked lineups (`20261016180000...:95-125`), and `create_fantasy_team`/chips have the same protection (`:170-175`, `:290-420`). `save_fantasy_lineup` and `confirm_fantasy_transfers` additionally require `lineups.locked_at is null` under row lock (`20260926003100...:2378-2460`, `:2540-2548`).
- Direct table access is closed: `app.fantasy_teams`, `squad_memberships`, `lineups`, `lineup_players`, `team_gameweek_results`, `leagues`, `league_memberships` have RLS forced, `revoke all` from anon/authenticated, and only owner-scoped SELECT policies (`20260720141854_fantasy_api_security.sql:1372-1388`, `20260720141847...:284-288`). All mutation RPCs call `fantasy_assert_owner` (team belongs to `auth.uid()` and is active, `20260720141854...:4-23`) plus `assert_mfa_step_up`.
- Idempotency and audit: every mutation writes `fantasy_idempotency_keys` and `fantasy_mutation_audit` (`20260926003100...:2437-2457`).
- Squad validation (SQL) enforces 15 players, quotas, max 3 per club, one captain and one distinct vice both starters, formation limits, unique slot orders (`20260914200730_fantasy_verified_finalization.sql` validate function; unique key `20260720141847...:84`).
- Private league invite codes are 128-bit random, stored as SHA-256 digest; joining by wrong code returns the same `invite_code_invalid` (`20260926003100...:2779-2870`).
- Leaderboard order in SQL equals `FANTASY_RULES_V1.md` Rankings (points, hits asc, transfers asc, latest finalized GW score desc, creation, uuid) (`20260720163222...:905-912`).
- Prize selection: only finalized gameweeks with `points_state = 'final'`; skips flagged and staff accounts; 2-win gameweek cap; no cash value for mini-league; every prize write is admin-gated, MFA-protected and audited; winners wall shows verified/paid only with masked username (`20260924120000_fantasy_prizes.sql` header and `:550-596`).
- Free transfers: SQL rollover (+1, cap 2, chip-specific 1 after Wildcard/Free Hit) equals the docs and `rules.ts` (`service_roll_fantasy_free_transfers` and chip seeds at `20260720163222...:359-369`).
- Worker and finalization: finalization is refused while ratings or participation are pending (`fantasy-lifecycle-worker.ts:1002-1010` returns `waiting` BEFORE persist/rank/finalize; test at `fantasy-lifecycle-runner.test.ts:972-990`); the sealed snapshot digest must match; lease keeps two workers from interleaving (`FANTASY_WORKER_SCHEDULE.md`); an ambiguous RPC timeout stops the pass.
- Notifications: finalized notifications are enqueued per exact calculation version and the final email only sends when the sealed native snapshot has no pending fixtures or players (`20261020091926_fantasy_native_final_email_gate.sql`).
- Morocco time: parity test passes on three runtimes; database deadline text in notifications uses the helper (`20261016090100_morocco_time_deadline_text.sql`); deadline display uses `moroccoDateTimeFormat` (`src/components/fpl/deadline.ts:16-27`).

---

## What I could not check and why

- Anything in a live database: whether prizes are active, whether `app_private.fantasy_rating_publications` rows exist (F3), the current bodies of the patched functions (F15), whether the `20261026143000` rapid-API budget migration and the Morocco-time scripts are applied (the runbook says the time scripts are; the budget migration is dated yesterday), the real count of GW1-4 unrated players, real winner rows. Forbidden by the brief.
- pgTAP: Docker daemon is not running in this sandbox (`failed to connect to the docker API at unix:///var/run/docker.sock`). I did not run `supabase/tests/database/*` and cannot say they pass. Every SQL statement in this report is read from migrations, not executed.
- Production Supabase Auth settings (email confirmation, captcha, rate limits, OAuth providers, SMTP): only the local `supabase/config.toml` is in the repo; it has CAPTCHA commented out. Whether the dashboard enables it is unknown.
- Real SofaScore payload behavior (rating lag and drift): taken from the repo's own docs (`SOFASCORE_STAGED_STATS.md:199`, the not-rated brief), not from API calls.
- End-to-end concurrency (the deadline race): I read the locking and the migration's own reproduction notes; I did not reproduce it with two sessions.
- The Edge Function `football-live-refresh` writing fixtures (kickoff updates) in full; I traced only the Fantasy-facing parts (kickoff -> calendar sync -> deadline).
- Mobile/native clients (`mobile/`) and the admin prize screens (`src/routes/admin*`): not reviewed beyond grep.

---

## Questions for the Lead

1. Which numbers decide the SEASON prize: GW1-4 under the category scale (final) or the "visible rating revisions" (F3)? The code currently allows neither to be paid for any range that touches GW1-4 while publications exist. Please confirm from the DB: `select gameweek_id, complete from app_private.fantasy_current_rating_publications;` (read-only).
2. Is the sponsor's prize set going to be created `active = true` BEFORE the first gameweek it covers finalizes? If not, F2 will silently drop periods. Do we want the journal row to be written only when a winner is recorded?
3. Owner policy for a player who appeared for 10+ minutes and never gets a SofaScore rating (F4a), and for fixtures whose ratings arrive after day 14 (F4b)? Is a reviewed manual entry (with audit) acceptable for a sponsored challenge?
4. Does the owner want the captain rule changed so a captain whose rated points are 0 because he is "Not rated" is replaced by the vice (F10), or is FPL's "captain played" semantic the intended one?
5. Production Auth: is CAPTCHA/Turnstile on, is email confirmation required, which OAuth providers are enabled, is there any disposable-email blocking at the Supabase dashboard level (F8)? Another lane (security/identity) may own this; flagging so the decision is made once.
6. For the legal text: do we want the prize rules to say "rating = first fully published SofaScore rating" (F5) and to say how a correction after finalization is handled (F1), since today no mechanism exists?
7. May the next phase include a read-only dump (via the owner or a CI job) of `pg_get_functiondef` for the ~15 functions listed in F15 so the "current version" of the scoring path can be hashed into an audit record?
8. Should dead/duplicate client rule code (F13) be deleted in a screen-work branch, or left until after the launch (it is not wired to the cloud path)?
