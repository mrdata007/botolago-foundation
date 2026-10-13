# Fantasy scoring reliability audit (2026-10-13)

**This is an audit only.** No production reads or writes were made, no jobs were paused, and no
application or scoring code was changed.

Evidence labels used throughout:

| Label | Meaning                                                   |
| ----- | --------------------------------------------------------- |
| **V** | Verified by reading the code at the cited line            |
| **R** | Reproduced locally by a test or benchmark in this folder  |
| **L** | Taken from GitHub PRs, issues or Actions logs (read-only) |
| **I** | Inferred, not proven                                      |

## 0. What was audited

- **Repository:** `mrdata007/botolago-foundation` at commit `7e8e8ea` (merge of PR #458). The
  HEAD is detached and the working tree was clean. There is one worktree. The only files added
  are those in this folder.
- **Current code versus the rest:** "current code" means `7e8e8ea`. Code that is still only on
  an open PR or an unmerged branch is labelled as such:
  - #452 (draft, has conflicts);
  - #394 and #406;
  - branch `claude/gw3-held-matches-diagnose`.
- **Deployment:** whether anything is deployed is only known where an Actions run shows it
  (Edge deploys). Whether production migrations and the owner's scripts were applied is
  **unknown**, because nothing in the repository records it.
- **Production access:** there was none. The container has no Supabase credentials. Everything
  said about production comes from PR, issue and Actions text (**L**), not from a database read.
- **Local database:** Supabase CLI on `127.0.0.1:55322`. It was started from
  `supabase/config.toml`. The project is not linked to any remote: there is no
  `supabase/.temp`.

## 1. Executive verdict

Weekly scoring is fragile. The scoring arithmetic is not the cause: it already scores each
category only when that category's facts are proven (**V**, `adaptive-scoring.ts:51-83`). The
cause is that **the layers around it work on a whole match or a whole gameweek, while the facts
that are actually uncertain usually concern one player or one field.**

Six confirmed causes, in order of weekly impact:

1. **One local doubt holds the whole match, and most holds are given up at once.**
   - The SofaScore builder returns no request at all when a single blocker exists
     (`sofascore-fantasy.ts:658-665`).
   - Blockers that hold all ~28 players for a problem that concerns one or two of them:
     - any second yellow card;
     - any own goal;
     - a goal in the same minute as a substitution, and stoppage time counts as the same
       minute;
     - one substitute with minutes but no substitution record;
     - one player named in an incident but missing from the lineup.
   - All of these are given up immediately, and the stored replies are thrown away
     (`sofascore-fantasy-auto.ts:1038-1040`), so a person has to step in. **R** for four of
     these cases.
2. **Small format deviations in fields that are never scored reject the whole match.**
   Examples: `rating: null`, `player.position: null`, a `null` incident class, or an unplaced VAR
   incident. **R**
3. **The next gameweek cannot open until the previous one is final.**
   - Opening requires the previous gameweek to be `finalized` with its postwork complete
     (`20261009091728:197-200`).
   - After the deadline, the only way to open it is an owner-run SQL function.
   - What opening actually needs (price changes, free-transfer rollover, Free Hit restore)
     depends on transfers and lineups, not on points (**V** for prices,
     `20260720163222` price-change function; **I** for rollover and Free Hit).
   - One held match therefore turns into a missed deadline. This happened at GW1→GW2 and again
     at GW3→GW4 (**L**).
4. **Saving points takes quadratic time.**
   - One call writes the whole gameweek's player points, with a nested scan of the result
     array (`20260927140000:182-213`) and three correlated scans per player (`:222-231`).
   - In a synthetic benchmark of the same lookup pattern, the time grows about 4–5 times each
     time the row count doubles (**R**).
   - It timed out in production on 12 Oct (**L**). The mitigation was raising the role's
     timeout, which is not a durable fix. The set-based fix is a draft PR with conflicts
     (#452).
5. **No automatic convergence after the first record.**
   - Once any observation exists for a fixture, the automatic path never looks at it again
     (`sofascore-fantasy-auto.ts:699-707`).
   - Later SofaScore corrections are therefore never picked up.
   - A recorded observation that is not ready stays stuck. UTS–RSB (**L**) needed a manual
     redo, which then failed with an unexplained HTTP 400 (**L**).
6. **The minutes override can contradict itself.**
   - When SofaScore's `minutesPlayed` overrides the substitution times, the clean sheet follows
     the new minutes, but goals conceded are still counted over the old window.
   - Result: a defender replaced at 46' with `minutesPlayed=70` gets a **clean sheet although
     his team conceded at 48'** (**R**).
   - A starter whose `minutesPlayed` is `0` is recorded as a _verified_ 1-minute appearance
     (**R**).

**Are the fallback mechanisms active and effective?**

- **Simple mode, the mode lock, provisional live points and the pending-participation
  protections** exist and are correct. Activation in production is reported, not verified
  (**L**).
- **They rarely help**, because the gates above stop the match before the fallback is reached.
  Simple mode can only cover a match whose every recorded player has all 8 core fields proven.
- **Reviewed estimates (v2.1)** exist in SQL, but the SofaScore path cannot use them:
  - the SofaScore wrapper refuses estimates (`20261012120000:70-109`);
  - whether v2.1 is assigned in production is unknown;
  - the only route is a manual reviewed correction through
    `api.service_record_fantasy_observation`.
- **The automatic retry** only helps unmapped players and database conditions.

## 2. End-to-end dependency map: where a local problem becomes a wide one

```
SofaScore 3 replies ──parse (whole match)──► builder (whole match) ──► SQL wrapper + recorder (whole match)
   │ F2: one odd non-scoring field            │ F1: one player/one minute            │ membership, 11+11, exclusion rules
   ▼                                          ▼                                       ▼
 error:invalid_provider_payload          held → mostly gave_up (replies dropped)   refused / recorded-but-not-ready
                                                                                   (F5: never revisited)
observation ─► mode lock at whistle+12h (fixture) ─► snapshot (whole gameweek, digest of ALL fixtures)
                 │ F8: no points shown before lock          │ F12: any unrelated live change invalidates the run
                 ▼                                           ▼
           pending fixture ─────────────► persist: ALL player points in ONE call, O(N²) (F4)
                                            │ one bad team page rolls back the run (F12)
                                            ▼
                         lineup totals (per team, safe on unknown participation ✔)
                                            ▼
                    finalization (whole gameweek: every fixture + every selected player)
                                            ▼
                    next gameweek opening (F3: chained to finalization, deadline-bound)
                                            ▼
                        UI: missing = 0, ranking not marked provisional (F9)
```

**Where local problems widen:**

| Widening                                  | Location                                                |
| ----------------------------------------- | ------------------------------------------------------- |
| Player → match                            | Builder and parser                                      |
| Match → gameweek                          | Finalization. Holding only the final result is correct. |
| Gameweek → next gameweek                  | Progression. Not correct.                               |
| Run → every team                          | A single persist failure                                |
| One fixture's live update → the whole run | The digest covers every fixture                         |

## 3. Prioritised findings

Each finding gives the evidence, scope, recurrence and recommended fix.

**F1 — Critical. A whole match is held for a doubt about one player or one field.**

- **Code:** blockers in `supabase/functions/_shared/sofascore-fantasy.ts`:
  - `second_yellow_review` at :355-360;
  - `unknown_incident` (own goal) at :337-346;
  - `own_goal_unexplained` at :347-354;
  - `timeline_unresolved` at :529-548;
  - `appearance_unexplained` at :404-412;
  - `incident_player_not_in_lineup` at :390-397.
- **Any blocker returns `request: null`** (:658-665).
- **Give-up and discard:** everything except `unmapped_players` and database refusals that can
  change is `gave_up`, and its replies are not kept (`sofascore-fantasy-auto.ts:1038-1040`).
- **Stoppage time is ignored when ordering events.**
  - Only `minute` is passed to `deriveParticipation` (`sofascore-fantasy.ts:381-382,538`).
  - So a substitution at 90+2 and a goal at 90+5 "collide" (`fantasy-adaptive-core.ts:151-161`).
- **Reproduced** in `repro/builder.repro.test.ts`:
  - a goal on the minute of a double substitution gives 4 `timeline_unresolved` blockers and
    the whole request is null;
  - a 90+2 substitution plus a 90+5 goal holds the whole match;
  - a second yellow holds the whole match;
  - `goal/ownGoal` parses as `unknown`.
- **What the doubt really affects:**
  - **Timeline ambiguity** affects only the goals conceded and clean sheet of the players
    changed on that minute, and only for goalkeepers and defenders when their total crosses a
    threshold.
  - **A second yellow** affects only that player's card points (whether the first yellow is
    also listed).
  - **An own goal** affects the scorer's own-goal points, plus goals conceded and clean sheet
    for the side that benefits. That last part is team-wide, so it is a real dependency for
    that side's defence.
- **Recurrence:** high. Stoppage-time substitutions are routine in most matches, and a late
  goal in stoppage time is common. Second yellows and own goals each turn up most weeks across
  8 matches (**I**, no statistics measured).
- **Fix (engineering, no rule change):**
  - Order events by `(minute, addedMinutes)`.
  - Make the doubt per player: put the ambiguous fields in that player's row as `unknown`, and
    let the database report the fixture as "ready except listed players" (see §5B).
  - Keep the replies for every hold.
  - Parse `goal/ownGoal` explicitly: its sides are known, so it is a fact, not a guess.
  - For a second yellow: if the provider lists a separate first-yellow incident for that
    player, the facts are explicit. Otherwise mark only that player's card fields unknown.
- **Owner approval:** needed only to treat `ownGoal` as a recognised label, because the doc
  says "not guessed". The parser change itself is engineering.

**F2 — High. Non-scoring fields can reject the whole match.**

- **Code:** `sofascore-performance-parse.ts`:
  - :77-109: optional fields reject `null`;
  - :152-169: `rating`, `position` and `totalPass` are type-checked although only `totalPass`
    presence matters;
  - :290-305: any unplaced incident except `injuryTime` throws.
- **Result:** `error:invalid_provider_payload` for the whole fixture
  (`sofascore-fantasy-auto.ts:601-614`). Only 4 fetch attempts follow, with no stored replies.
- **Reproduced:** 4 tests in `F-parse`.
- **Fix:** check the types of scoring-relevant fields strictly. For fields that do not score,
  treat `null` and wrong types as absent and record a diagnostic. Unplaced incidents that are
  not score-relevant (not matching `SCORE_RELEVANT_LABEL`) become diagnostics, not exceptions.
- **Invariant kept:** a field used by scoring never accepts a wrong type.
- **Negative test:** `minutesPlayed: "90"` still fails, and so does an unplaced
  `goal/regular`.

**F3 — Critical. The next gameweek is chained to the previous one being final.**

- **Code:** `20261009091728_fantasy_durable_progression.sql:197-203` requires the previous
  gameweek `finalized` with postwork completed. After the deadline, the only path is
  `app_private.fantasy_open_missed_gameweek` (owner only, `20261004150000`).
- **What opening uses from the previous gameweek:**
  - price changes, driven by transfer counts (`20260720163222`, `service_apply_fantasy_price_changes`);
  - free-transfer rollover;
  - Free Hit restore.
  - None of these uses points (**V** for prices; **I** for the other two, which still needs
    confirming).
- **Production (L):** GW1 was finalized after GW2's deadline (header of migration
  `20261004150000`). GW3 was not final by GW4's deadline on 12 Oct 18:30 UTC.
- **Fix:** split the postwork into two parts, and open the next gameweek after the squad part:
  - **squad postwork:** prices, rollover and Free Hit restore. It runs once the previous
    deadline has passed and transfers are frozen.
  - **points postwork:** final results, rankings, prizes and notifications. It runs at
    finalization.
- **Invariant:** deadlines and lineup snapshots are unchanged, and squad state is computed
  from frozen inputs only.
- **Negative tests:**
  - opening is refused before the previous deadline;
  - rollover is not applied twice;
  - Free Hit is restored exactly once;
  - finalizing GW n after GW n+1 has opened changes no GW n+1 squad state.
- **Owner approval:** needed for the order of events, which is a lifecycle change. Scoring
  rules are unchanged.

**F4 — High. Saving points scales quadratically and runs as one gameweek-wide transaction.**

- **Code:** `20260927140000_incremental_fantasy_points.sql`:
  - :182-213: for each input row, `jsonb_array_elements(p_player_results)` is rescanned, twice;
  - :184-191: an exception-block function (`fantasy_field_certified`) is called per field;
  - :209-210: every live event of the gameweek is superseded on every recalculation;
  - :211-221: one row is upserted at a time;
  - :222-231: three correlated scans of `playerFixtures` per catalog player;
  - player results for the whole gameweek travel in the first page's call
    (`fantasy-lifecycle-runner.ts:634-640`).
- **Benchmark (R, synthetic, local, lookup pattern only;**
  `repro/persist-lookup-scaling.bench.sql`**):**

  | rows  | current pattern | set-based join |
  | ----- | --------------- | -------------- |
  | 250   | 52 ms           | 15 ms          |
  | 500   | 186 ms          | 21 ms          |
  | 1,000 | 568 ms          | 49 ms          |
  | 2,000 | 2.75 s          | 104 ms         |
  | 4,000 | 12.7 s          | 229 ms         |

  The real function does more work per row: inserts, conflict checks and the per-player
  aggregation.

- **Production (L):**
  - On 12 Oct the persist RPC was cancelled with 57014 during the insert into
    `fantasy_player_point_events` (run 38258268558, issue #448).
  - A 60 s `service_role` timeout script exists only on an unmerged branch. The owner reports
    that it was installed.
  - The set-based rewrite (migration 20261012174642, draft PR #452) has conflicts and has not
    been reviewed here.
- **Fix:**
  - Land a set-based persist: join through `jsonb_to_recordset`, `insert … select … on
conflict`, one aggregate per player.
  - Supersede only the fixtures whose input digest changed.
  - Persist per fixture.
  - Do not rely on a timeout increase.
- **Invariant:** the same ledger rows and totals as today for identical input (equivalence
  test). Replay of identical input is a no-op.
- **Negative tests:**
  - a duplicate (player, fixture) pair is refused;
  - an event outside the allowed categories is refused;
  - a different payload under the same version gives `replay_conflict`.

**F5 — High. No automatic convergence once a fixture has an observation.**

- **Code:** `sofascore-fantasy-auto.ts:699-707` returns `skipped:already_observed`.
  `recorded` is reported without checking `simpleReady` (`:897-905`).
- **Consequences:**
  - A provider correction (a reassigned goal, a rescinded card) is never ingested.
  - A recorded observation that is not ready (UTS–RSB with anonymous starters, **L**) holds
    the gameweek until the manual `--include-observed` redo.
- **Fix:** keep re-reading fixtures in an active gameweek on a slow schedule (for example at
  +2 h, +12 h and +36 h). Record a new observation only when the digest changes. Apply source
  precedence as follows:
  - a reviewed correction is never superseded (already true, `20261003180000:96-99`);
  - a new provider digest supersedes the older provider digest;
  - an observation with weaker evidence for a field may not overwrite stronger evidence
    unless the provider explicitly withdrew it (for example, `rescinded`).
- **Mode locks are unchanged**, because selection uses the snapshot at the cutoff
  (`20260927094823:200-218`).

**F6 — High. The minutes override is not reconciled with goals conceded or a starter's
appearance.**

- **Code:** `sofascore-fantasy.ts:563-568,581`.
- **Reproduced** (`F-minutes`):
  - With `minutesPlayed` 70, a player replaced at 46' gets `cleanSheet=true` with
    `goalsConceded=0`, although his team conceded at 48'. The clean sheet scores 4 for a
    defender.
  - A starter with `minutesPlayed` 0 gets a _verified_ 1 minute.
- **Fix:** when the override applies, either:
  - recompute the conceded window from the overriding minutes, if the override can be placed
    on the timeline; or
  - mark that player's `goalsConceded` and `cleanSheet` (and `minutes`, when it contradicts
    `started`) as `unknown`. They then stay pending for that player only.
- **Owner approval: required.** The owner decided on 2026-10-13 that "SofaScore minutes are
  final". This recommendation keeps that decision for the appearance points and only refuses
  to award a clean sheet that the same data contradicts.

**F7 — High. The manual recovery path is heavy, fragile and opaque.**

- **What it involves** (`SOFASCORE_FANTASY_SIMPLE.md:276-323`):
  - pause the writers;
  - rehearse;
  - check a plan hash;
  - apply;
  - restore the writers.
- **Weak points:**
  - One refusal aborts every fixture in the DO block (`sofascore-fantasy-simple-lib.ts:291-316`,
    agent-read).
  - `read_failed: HTTP 400` on the UTS–RSB rehearsal (run 38388255799, **L**). Its cause is
    still unknown, even after #458.
  - Given-up attempts keep no replies, so the culprit player in the two `minutes_mismatch`
    fixtures could not be identified (**L**).
- **Fix:**
  - Keep the replies on every outcome.
  - Make the manual apply run each fixture in its own transaction.
  - Capture the 400 body (already partly done by #458) on the next run before changing
    anything else.

**F8 — High. Points are not shown until 12 hours after the final whistle.**

- **Code:** a fixture with `scoringMode` null is pending
  (`20260927145230_fantasy_live_participation_scope.sql:21-22`). The mode only exists from
  `finalized_at + 12h` (`20260927094823:200-218`).
- **Why this need not wait:** the 8 core categories are scored the same way in full and simple
  mode. Only assists, saves and penalties depend on the mode.
- **Fix:** before the lock, publish the core categories as _provisional_, and keep the four
  detail categories pending until the lock.
- **Invariant:** final values are unchanged, and the lock is unchanged.
- **Owner approval: required.** This is a display and publication policy change.

**F9 — High. The app shows missing as zero and rankings without a provisional marker.**

- **Code:**
  - `src/services/fantasy-runtime.ts:173` (`finalPoints ?? provisionalPoints ?? 0`), plus :219,
    :405 and :507;
  - `src/routes/fantasy.points.tsx:268-287`;
  - standings come from `sum(coalesce(final_score, provisional_score))` with no flag
    (`20260720163222:876`);
  - `corrected` shows the same badge as `finalized` (`gameweek-presentation.ts:72-73`).
- **Fix:**
  - The API returns a per-player `pointsStatus` (`pending` / `provisional` / `final`) and the
    pending categories.
  - The UI shows "—" or "En attente" / "قيد الانتظار", never 0.
  - Rankings carry `provisional: true` plus the calculation version.
  - Corrections show the old score → the new score.

**F10 — Medium-High. Identity problems are found late, and recovery is partly manual.**

- **Timing:** there is no check before the match. Lineups are fetched only for matches that
  are live or finished (`sofascore-live-refresh.ts:90-93,282-290`).
- **Auto-mapping uses names:** `exact-name` maps on a unique name within the dated squad, with
  no second signal (`20261011130000:400-401`).
- **The staff screen cannot act on everything:**
  - no action is offered for `no_candidate` (`SofascorePlayerQueueView.tsx:330-335`);
  - there is no search;
  - no date of birth is shown.
- **Automatic reopen** happens only after a staff-screen resolution (`20261012120000:281-307`).
  It does not happen after the SQL scripts or the two-person mapping flow, and
  `adaptive_player_membership_missing` is not among the codes that reopen.
- **No dated-membership tooling exists**, and the only automatic source (SportsMonks) is
  unpaid.
- **Inferred risk (I, High impact):** an unknown SofaScore player can be excluded while a
  real, unmapped squad member with a stale shirt is then written as a verified non-participant
  (`20261012120000:177-185,241-248`). That player would silently lose his appearance points.
- **Fix:**
  - Fetch lineups about 60 minutes before kick-off and run the auto-mapper in queue-only mode.
  - Require a second signal (shirt on the day, position or date of birth) for `exact-name`.
  - Refuse an exclusion while any squad member of that club is unmapped and has no lineup
    evidence.
  - Reopen on any insert into the mapping or membership tables.
  - Add a staff action to add a player with a membership, and one to date a transfer.
  - Never match on name alone.

**F11 — Medium. Monitoring does not separate expected waiting from real trouble.**

- **The watchdog's `fantasy_points` fails 6 h after `endsAt`** with no adaptive grace
  (`scripts/ops/watchdog.ts:398-496`). That is a false alarm by design: adaptive points cannot
  exist before whistle + 12 h.
- **Structured fields are discarded**: `adaptiveScoring` and `gameweeks` are dropped
  (`watchdog.ts:133-148`).
- **Missing checks:**
  - nothing compares player points with team totals, rankings and finalization;
  - no `nextRetryAt` is recorded;
  - SofaScore attempt states (`held` / `gave_up`) do not appear in any health check.
- **Fix:** see §8 of the plan.

**F12 — Medium. The worker treats every error the same, and one problem stops the whole
run.**

- **Error handling:**
  - Every RPC error becomes a code, with no split between retryable and permanent
    (`fantasy-lifecycle-runner.ts:794-802`).
  - The cadence is hourly, with no backoff.
  - The orchestrator runs at most 2 gameweeks per pass, so an old stuck gameweek permanently
    holds a slot (`fantasy-season-orchestrator.ts:507,567-597`).
- **Run-wide failures:**
  - One invalid team throws for the whole run (`fantasy-lifecycle-runner.ts:256-262`).
  - The input digest covers every fixture, so a live update to an unrelated match makes the
    run fail with `fantasy_scoring_input_changed` (`20260927094823:578-610`, **I** on how often
    this happens).
  - The persist call caps player results at 10,000 rows, while the runner's schema allows
    128,000.
- **Fix:**
  - Classify errors: transient (timeout, 5xx, `57014`, `40P01`, `55P03`) gets bounded retry
    with jitter; contradiction (`PT400`) gets no retry and is sent to a person.
  - Digest per fixture.
  - Isolate failing teams into a quarantine list instead of failing the whole run.

**F13 — Medium. Unknown participation is stored as `did_play = false`.**

- **Code:**
  - `20260927140000:226` stores it;
  - `20260927094823:262-267` gives a player with no observation empty `{}` stats.
- **Why it is currently safe:** captain, vice-captain and automatic substitutions are
  protected by `pendingPlayerIds` in both TypeScript (`fantasy-lifecycle-runner.ts:269-277`)
  and SQL (`20260927140000:255-262`). This is a confirmed **positive**: unknown participation
  never triggers an automatic substitution or a captain promotion.
- **Why it is still a risk:** the stored row looks like a confirmed "did not play" to any
  later reader.
- **Fix:** store participation as three states (`played` / `did_not_play` / `unknown`).

**F14 — Medium. Readiness follows the newest observation.**

- **Code:** `20260927094823:241-242`.
- **Risk:** a later, weaker observation can turn a ready fixture back to not ready.
- **Fix:** see the precedence rule in F5.

**F15 — Low. Documents have drifted from the code.**

- `SOFASCORE_FANTASY_SIMPLE.md:3` still says "nothing applied".
- The exclusion criteria in that document (:103-105) differ from the code, which allows cards
  and assists.

## 4. Data and failure-policy matrix

**Classes:**

| Class | Meaning                                               |
| ----- | ----------------------------------------------------- |
| A     | Unsafe: quarantine the affected facts                 |
| B     | Incomplete: score the independent parts provisionally |
| C     | An existing approved fallback applies                 |
| D     | Transient: retry                                      |
| E     | Not used by scoring: keep a diagnostic only           |

| #   | Condition                                              | Required evidence                        | Current behavior                                                      | Correct scope                           | Proposed behavior                                                                                                    | Recovery trigger      | Why this is fair                         |
| --- | ------------------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------- |
| 1   | Detail stats missing (assists, saves, penalties)       | none for simple                          | unknown, never 0; simple at lock ✔                                    | category                                | **C** keep                                                                                                           | lock rule             | approved v2.0                            |
| 2   | Rating, display fields odd or null                     | none                                     | parse fails the whole match ✘ (R)                                     | none                                    | **E** ignore + diagnostic                                                                                            | —                     | not scored                               |
| 3   | Assist sources disagree                                | lineup = incidents                       | unknown ✔                                                             | player category                         | **B/C** keep                                                                                                         | new observation       | no guessing                              |
| 4   | Unmapped bench player who did not play                 | none                                     | ignored ✔                                                             | none                                    | **E**                                                                                                                | —                     | cannot score                             |
| 5   | Unmapped player who appeared, no scoring trace         | proof that he is nobody's player         | excluded if `no_candidate` (≤2 starters a side, ≤6 in all)            | that player                             | **B**; tighten the false-DNP check (F10)                                                                             | mapping reopen        | must not erase a real squad member       |
| 6   | Unmapped scorer                                        | identity                                 | whole match held                                                      | goal attribution for both sides         | **A** for that side's goals and conceded; other categories **B**                                                     | mapping → reopen      | a goal affects the other side's conceded |
| 7   | Mapped player, membership not on the date              | dated membership                         | whole match refused ✘                                                 | that player (+ lineups holding him)     | **A** for that player only, the rest **B**; add to reopen                                                            | membership insert     | fixed-date rule kept                     |
| 8   | Starter or substitution missing                        | lineup + substitutions                   | `starters_not_eleven` / `appearance_unexplained` hold the whole match | that side's participation               | **A** for that side's minutes; goals and cards for the other side **B**                                              | new replies           | participation decides points             |
| 9   | Minutes vs substitutions disagree                      | one consistent timeline                  | `minutesPlayed` wins, conceded window not updated ✘ (R)               | that player                             | **B**: appearance from `minutesPlayed` (owner decision); clean sheet and conceded unknown unless the timeline agrees | new replies or review | no contradictory clean sheet             |
| 10  | Stoppage-time ordering                                 | `(minute, added)`                        | collision → whole match ✘ (R)                                         | none if added time is known             | use added minutes; if still the same minute and second, **A** for those players' conceded only                       | —                     | deterministic ordering                   |
| 11  | Second yellow                                          | first yellow listed or not               | whole match ✘                                                         | that player's cards                     | **B** for the others; **A** for that player's cards until explicit                                                   | new replies or review | —                                        |
| 12  | Own goal                                               | `goal/ownGoal` + side                    | whole match ✘                                                         | scorer + the benefiting side's conceded | parse explicitly; **A** only if unattributed                                                                         | —                     | —                                        |
| 13  | Incident list incomplete vs absence confirmed          | goals add up to score; `rescinded` flags | goals must add up ✔                                                   | match goals                             | **A** keep (true contradiction)                                                                                      | new replies           | strict on purpose                        |
| 14  | Final score conflict                                   | fixture score = provider score           | refused ✔, retriable                                                  | whole match                             | **A** keep                                                                                                           | score correction      | strict on purpose                        |
| 15  | Fixture identity conflict                              | one link                                 | refused ✔                                                             | whole match                             | **A** keep, send to a person                                                                                         | person                | strict on purpose                        |
| 16  | Provider down or rate-limited                          | —                                        | tick stops remaining details; 4 fetch attempts                        | that fetch                              | **D**: backoff + jitter; keep the catch-up window open while the gameweek is open                                    | time                  | —                                        |
| 17  | Partial, stale, duplicate or out-of-order observations | digest + precedence                      | latest wins; duplicates are no-ops ✔                                  | field                                   | precedence rule (F5)                                                                                                 | new digest            | stronger evidence is kept                |
| 18  | Database or network failure, timeout                   | —                                        | whole run fails, hourly                                               | run                                     | **D**: classified retry; set-based persist                                                                           | time                  | —                                        |
| 19  | Postponed or abandoned                                 | status                                   | postponement handling exists ✔ (pgTAP passes)                         | fixture                                 | keep                                                                                                                 | status change         | —                                        |
| 20  | Double gameweek                                        | per-fixture rows                         | per-fixture mode ✔                                                    | fixture                                 | keep                                                                                                                 | —                     | —                                        |
| 21  | Data after cutoff                                      | —                                        | mode locked ✔; facts can still improve readiness                      | fixture mode                            | keep                                                                                                                 | —                     | v2.0 rule                                |
| 22  | Data after finalization                                | reviewed correction                      | refused unless reviewed ✔                                             | gameweek                                | keep the 72 h process                                                                                                | person                | published rule                           |
| 23  | Ambiguity that never resolves                          | —                                        | held until a person or give-up                                        | facts                                   | escalate on a timeline (§6); v2.1 estimate only if assigned and reviewed                                             | person                | no timer-based finalization              |

## 5. Design answers

**A. Can ready fixtures score while another fixture is held?**

- **Today:** yes, provisionally, but only after their own 12 h lock (F8). Also, any run-wide
  failure (F12) or persist timeout (F4) stops all of them.
- **Fix:** F4, F8 and F12. Finalization stays gated, and that is correct.

**B. Can verified categories persist while other categories wait?**

- **Already works:**
  - the scorer and the persist RPC drop categories that lack proof
    (`adaptive-scoring.ts:71-82`; `20260927140000:184-191`);
  - simple mode excludes the detail categories.
- **What is missing:** a fixture is either ready or pending as a whole.
- **Contract change:** the observation may carry `unknown` core fields for named players. The
  fixture then reads "ready except players X". Those players go into `pendingPlayerIds`, which
  already protect captaincy and substitutions. Finalization still waits for them.
- **Rules:** no ruleset change.

**C. Can one uncertain player block only the results that depend on him?**

Yes, for most cases. Dependencies were traced through the code:

- His own points.
- Captaincy and substitutions in lineups that hold him. These are already handled per lineup.
- Team goal reconciliation, only if he scored.
- The other side's conceded goals, only if the goal's side or minute is unknown.

Teammates' clean sheets come from the incidents and each player's own timeline
(`sofascore-fantasy.ts:24-26`), so they do not depend on him.

**D. Can the next gameweek open while the previous one waits?**

- **Today:** no (F3).
- **The actual dependencies** are transfers and lineups, not points. The squad/points postwork
  split described in F3 lets the next gameweek open on time. Deadlines and snapshots are
  unchanged.

**E. Can missing optional data prevent full mode without preventing simple mode?**

- **In the scorer:** yes (v2.0).
- **In practice:** the builder and recorder gates (F1, F2, rows 7–8 of the matrix) stop the
  match before simple mode is reached.

**F. Can format differences be normalised safely?**

Yes:

- order events by added time;
- parse own goals explicitly;
- ignore fields that do not score;
- treat `minutesPlayed` within the documented tolerance as agreeing (already done).

There is no tolerance at scoring thresholds. When a 60-minute threshold or a goal-concession
window is ambiguous, only that player's affected fields are marked unknown.

**G. Are identity tasks found early enough?**

- **Today:** no (F10).
- **Proposed:**
  - a queue built from the line-ups announced before kick-off;
  - automatic reuse of established mappings (already global);
  - a second signal for automatic mapping;
  - staff actions for `no_candidate`;
  - reopen on any change to a mapping or membership.

**H. How should pending and provisional points appear?**

- Per player and category: "en attente" / "قيد الانتظار", never 0.
- Totals labelled provisional, with "peut encore changer".
- Rankings marked provisional.
- Corrections show the old score → the new score.

The same mode and categories apply for every manager of a fixture. That already holds,
because mode is per fixture.

**Reviewed estimates (v2.1), an honest assessment:**

- **Reachable** only through a manual reviewed correction, and only when v2.1 is assigned.
  The assignment is not verified, and v2.0 assignments are immutable
  (`ADAPTIVE_FANTASY_SCORING.md`).
- **Can legitimately resolve:**
  - a player's ambiguous conceded goals or clean sheet;
  - a second yellow's first card;
  - an unresolved minutes conflict, after a simple lock.
- **Cannot resolve:**
  - identity;
  - membership;
  - a final score conflict.
- **Blocked by another layer:** the SofaScore wrapper refuses estimates
  (`20261012120000:70-109`), so they cannot ride the automatic path.
- **Recommendation:** leave this as a reviewer tool. Do not automate estimates.

## 6. Recovery and convergence

| Requirement                                 | Today                                                         | Gap / fix                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| One fixture cannot starve the others        | ✔ per fixture in auto (6 retries per tick by `next_retry_at`) | the rate limit breaks the rest of the tick (`sofascore-match-details.ts:708-710`) → continue on the next tick with jitter |
| Bounded backoff + jitter                    | backoff 15 m/1 h/6 h, no jitter; worker hourly, none          | add jitter; worker retry classes                                                                                          |
| No endless permanent retries                | permanent failures give up at once                            | ✔, but they discard the replies → keep them                                                                               |
| New data or mapping makes work discoverable | only staff-screen resolution; catch-up only ≤72 h             | trigger on mapping and membership inserts; catch-up for any open gameweek                                                 |
| Restart resumes without SQL                 | ✔ (journals, cursors, idempotent RPCs)                        | —                                                                                                                         |
| Lost response after commit cannot duplicate | ✔ (digest per observation; `player_results_digest`; upserts)  | —                                                                                                                         |
| A stale worker cannot overwrite a newer one | ✔ (`stale_update`, version compare-and-set)                   | —                                                                                                                         |
| Replays are deterministic                   | ✔ (canonical JSON digests)                                    | —                                                                                                                         |
| Corrections move points up and down         | supersede + upsert supports both                              | auto path never re-ingests (F5)                                                                                           |
| Weaker evidence does not erase stronger     | ✘ latest wins (F14)                                           | precedence rule                                                                                                           |
| Owner switches untouched by recovery        | ✔ nothing found that flips them                               | —                                                                                                                         |

**State model to adopt for every fixture and gameweek:**

| State          | Meaning                                                          | Who acts   |
| -------------- | ---------------------------------------------------------------- | ---------- |
| `waiting`      | within its expected window                                       | no one     |
| `retrying`     | has `nextRetryAt` and a retry count                              | the system |
| `needs_review` | a named contradiction, with a reason code and the facts affected | a person   |
| `resolved`     | final                                                            | no one     |

**Escalation for provisional states:**

- `needs_review` older than 12 h → warning.
- At the next gameweek's deadline minus 24 h → page. The page names the fixture and the
  decision needed.

**Decisions available when evidence never arrives** (an owner decision, never a timer):

- a reviewed correction;
- a v2.1 reviewed estimate (only if assigned);
- declaring the facts unavailable under a published rule. That rule does not exist yet and
  would need owner approval.

## 7. Scoring correctness and database

| Area                                                                         | Verdict                                                            | Evidence                             |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------ |
| Appearance, goals, cards, own goals, clean sheet, conceded, saves arithmetic | Unchanged and tested                                               | V, `scoring.ts`; 693 unit tests pass |
| Captain, vice-captain and automatic substitutions                            | Never act on unknown participation                                 | V, TS + SQL                          |
| Bench boost, triple captain, transfer hit                                    | Recomputed and checked server-side                                 | V, `20260927140000:251-317`          |
| Clean-sheet consistency                                                      | Defect                                                             | F6, R                                |
| Persistence                                                                  | Quadratic; supersedes the whole gameweek each run; one transaction | F4                                   |
| Indexes                                                                      | No missing index found on this path                                | agent read                           |
| Totals vs rankings                                                           | No reconciliation check at runtime                                 | F11                                  |

## 8. Minimal implementation plan

These are small pull requests, in dependency order. Each one has its own pgTAP and Bun tests,
lands on staging first, and is rolled back by reverting its function or flag.

**Engineering changes. No change to scoring policy.**

1. **Set-based persist** (rebase #452 onto main, then review it).
   - Acceptance:
     - equivalence with the current function on a recorded snapshot;
     - 4,000-row benchmark under 2 s locally;
     - replay is a no-op;
     - a different payload under the same version is refused.
   - Rollback: restore the previous function definition.
2. **Parser and builder correctness** (F1 ordering, F2):
   - order events by `(minute, addedMinutes)`;
   - tolerate `null` in fields that do not score;
   - keep the replies for every hold.
   - Acceptance: the repro tests in this folder flip to the safe behaviour, and the negative
     controls still reject wrong types in scoring fields.
3. **Retry hygiene:**
   - classify worker errors;
   - add jitter;
   - reopen on mapping and membership inserts;
   - add `adaptive_player_membership_missing` to the reopen codes;
   - catch-up covers every open gameweek.
4. **Precedence and re-ingest** (F5, F14): periodic re-read of observed fixtures in open
   gameweeks; a new digest supersedes; reviewed corrections still win.
5. **Monitoring** (F11):
   - adaptive grace in the watchdog;
   - per-fixture `diagnostics` with stage, reason, missing evidence, results affected, input
     version, mode, age, retry count, next action and owner;
   - a consistency check comparing player points × multipliers with team totals, rankings and
     finalization.
6. **App display** (F9): `pointsStatus`, pending shown as "—", a provisional flag on
   rankings, and the correction delta. Check French and Arabic, including right-to-left
   (AGENTS screen rules).
7. **Identity** (F10): pre-match lineup queue; staff actions; tighter exclusion check;
   reopen; dated-membership tool.

**Changes needing owner approval** (lifecycle or policy):

- **P1.** Open the next gameweek after the squad postwork, not after finalization (F3).
- **P2.** Per-player pending inside a ready fixture (§5B). Rules are unchanged; publication
  changes.
- **P3.** Publish the core categories provisionally before the 12 h lock (F8).
- **P4.** Clean sheet and conceded become unknown when the minutes override contradicts the
  timeline (F6).
- **P5.** Parse `goal/ownGoal`. Handle a second yellow per player.
- **P6.** A published "facts unavailable" rule for evidence that never arrives, or a decision
  to rely only on reviewed corrections and estimates.

## 9. Example: a realistic gameweek after the changes

The gameweek has 8 matches:

- 5 are clean;
- 1 has a stoppage-time substitution and a stoppage-time goal;
- 1 has an unmapped scorer;
- 1 is hit by a 40-minute SofaScore outage after full time.

What happens:

- **The clean matches and the stoppage-time match** record minutes after the whistle. Core
  points appear as "provisional" (P3). At +12 h each locks to full or simple, and the detail
  categories appear or are listed as not counted.
- **The unmapped scorer:**
  - The pre-match queue had already flagged him, so staff resolve him before the whistle and
    the match records normally.
  - If he was not resolved: that side's goal attribution and the other side's conceded goals
    stay pending (P2). Every other player's points show.
  - Managers holding the affected players see "en attente" on those players. The captain
    stays the captain; no vice promotion happens.
- **The outage:** the fetch retries with backoff and jitter, then succeeds. Nobody acts.
- **The next deadline:** GW n+1 opens on time (P1). Rankings are marked provisional.
- **Settling:** when the mapping lands, the reopen trigger records the observation, the
  worker rescores, and the gameweek finalizes. If nothing is resolved by the next deadline
  minus 24 h, a page names the one fixture and the one decision.

## 10. Evidence and limitations

**Executed locally:**

| What          | Command                                                                                                                                                                                                                                                                                                                                                                     | Exit | Result                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------- |
| Unit tests    | `bun test src/backend/fantasy supabase/functions/_shared/sofascore-fantasy-auto.test.ts …sofascore-live-details… …sofascore-match-details… scripts/backend/*fantasy*.test.ts scripts/backend/*sofascore*.test.ts scripts/backend/adaptive-corrections.test.ts`                                                                                                              | 0    | 693 pass, 0 fail, 47 files                        |
| pgTAP         | `npx supabase test db --local` with 17 files: adaptive scoring, reviewed estimates, incremental points, scoring worker, verified finalization, durable progression, open-missed gameweek, lifecycle tick, SofaScore observations, auto-map, player performances, reconciled observations, two ops-health suites, next-gameweek progression, postponement, resolve-postponed | 0    | 841 tests PASS, local Supabase at 127.0.0.1:55322 |
| Reproductions | `bun test ./docs/audits/2026-10-13-fantasy-scoring-reliability/repro/builder.repro.test.ts`                                                                                                                                                                                                                                                                                 | 0    | 12 pass; each asserts the current behaviour       |
| Benchmark     | `psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -f repro/persist-lookup-scaling.bench.sql`                                                                                                                                                                                                                                                                    | 0    | table in F4                                       |

The benchmark is synthetic: it measures the lookup pattern only, not the full RPC.

**Not executed:**

- No production reads.
- The full `service_persist_fantasy_scoring_results` with a synthetic 1,000-manager cohort.
  Seeding a full snapshot was not attempted in the time available. This is the next
  measurement to make, on the #452 branch against main.
- No negative-control mutation runs.
- No end-to-end worker run.
- Not checked: the double-gameweek rules, the cutoff and lock behaviour, the estimate
  boundaries, and the postponement paths.
  - **Covered:** they are exercised by the existing pgTAP suites, which pass.
  - **Not covered:** no new failure-injection tests were added for them, including a crash
    before commit, a lost response, and a stale worker.

**Inferred, not verified:**

- how often each blocker occurs;
- that the rollover and Free Hit restore do not use points;
- the false non-participant risk in F10;
- that the input digest makes runs fail during live matches;
- which production migrations and scripts are applied.

## 11. Plain-language conclusion

**What would stop needing a person every week:**

- matches held over a second yellow, an own goal, a late substitution or one odd field;
- points saves timing out;
- matches the system gave up on and forgot;
- missed deadlines because last week was not final;
- false alarms.

**What would still need a person, and why:**

- a genuinely unknown player who scored;
- a score that does not match;
- a fixture linked to the wrong match;
- a player whose club move nobody recorded;
- evidence that never arrives.

Each of these changes someone's points in a way the data cannot settle, so a person must
decide. The system should name the exact fixture, player and decision.

**What must be fixed before this can run unattended:**

- F4: the set-based save;
- F1 and F2: whole-match holds and parser strictness;
- F3: next-gameweek coupling, which needs owner approval;
- F5: re-ingesting corrections;
- F6: the clean-sheet contradiction, which needs owner approval;
- F11 and F9: monitoring and display.

No design can guarantee that scoring never fails. These changes make failures small, named
and self-healing where the facts allow it.
