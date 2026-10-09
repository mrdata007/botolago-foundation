# Manager Card backend plan (Gradins)

Written 2026-10-08 by the backend planner (Claude Opus) for the backend session that builds it.
This is a plan only: nothing in it has been applied, run against any database or committed by its
author.

- **Supersedes** `design-lab/manager-cards-claude/BACKEND_HANDOFF.md` on branch
  `claude/affectionate-galileo-8l9mxh` (decisions D1–D21, section 6a) and section 8 of the lab's
  `ONBOARDING_PLAN.md`. Where they differ, this file wins, and each difference is named in the
  decisions (section 1).
- **Serves** `docs/product/MANAGER_CARD_SECTION_PLAN.md`, the front end now being built on
  `claude/manager-card-section`: its section 3 (the switch), 7.2 (the DTOs, returned exactly), 7.5
  (errors), 7.6 (moments) and section 10 (the 15 additions; section 17 here maps each one).
- **Research base:** `origin/main` at `3f9c57fc` (PR #378, 2026-10-07), read on 2026-10-08. No
  database was read. Every locally fetched remote branch (358 refs) was checked for migrations: none
  is newer than `20261006143700`, and none names a Manager Card object.
- **[verify]** marks a claim nobody has confirmed in the repository. Check it before relying on it.
  Production and staging facts need the owner's leave to read.

## Contents

0. In one page
1. Decisions
2. Facts this plan rests on
3. Data model
4. Computation
5. Identity: number, founder, club, name, season label
6. Moments and acknowledgements
7. Switches and the status read
8. The scheduled job and its health check
9. Account deletion
10. Visibility and the batch read
11. RPC reference
12. Migrations
13. Tests, CI, types and the contract test
14. Rollout runbook
15. Work packages for the backend session
16. AGENTS.md, CLAUDE.md and docs updates (text to add)
17. Section 10 of the section plan: where each item is answered
18. Ready-to-paste prompt for the backend session

---

## 0. In one page

**What the server gives the card**

- Once per stable gameweek, for every manager with a final result: four stats from 1 to 99 (CAP
  captaincy, SEL selection, TRF transfers, CON consistency), the OVR (their rounded mean) and a tier
  (HOMA, STADE, PRO, CHAMPION, LEGEND). The inputs are stored Fantasy rows only, and no Fantasy
  table is written.
- A permanent, random number from 100000 to 999999, never reused. A founder cohort, granted once
  by the owner. The club from the manager's profile. The name by the boards' rule.
- One history row per manager and counted gameweek, one season row per manager and season,
  moments derived from those rows, and the acknowledgements recorded on the server (D21).
- Five RPCs, in exactly the shapes of section 7.2 of the section plan: `api.manager_card_status()`
  (anonymous), `api.get_my_manager_card()`, `api.get_manager_cards(uuid[])`,
  `api.get_my_manager_card_history(uuid, integer, integer)` and
  `api.ack_manager_card_moments(text[])`.
- Three switches (compute, read, serials), all off. No rules row ships. One pg_cron job with a prune
  companion, one ops health check (`manager_card`). Account deletion erases everything and retires
  the number for good.
- Six migrations, one guarded apply script the owner runs, and pgTAP that runs in CI's
  `database-quality` job.

**Launch order** (section 14): apply → calibrate and activate rules v1 → serials on → compute on and
catch up → privacy line published and club resolution checked → the owner flips
`MANAGER_CARD_ENABLED` and publishes (any time) → read switch on. That last step is the launch.

---

## 1. Decisions

Status words:

- **Approved:** the owner answered.
- **Built on:** recommended, and the front end is already built on it, so changing it changes the
  section too.
- **Recommended:** the build's default until the owner confirms.
- **Open:** the owner's call; the build's default meanwhile is in bold.

The backend session builds on these defaults. Everything ships switched off, no rules row ships and
the PR stays a draft, so any answer the owner gives before merge is applied in place (the migrations
are still unapplied; CLAUDE.md "Migrations" allows fixing them in place once that is confirmed).
After merge, a change of number (a weight, minimum, scale or threshold) is a new rules version,
which is data. A change of formula shape is a new migration.

### 1.1 The hand-off's decisions D1–D21

| #   | Decision           | Answer in this plan                                                                                                                                                                                                                                                                                                                                                                                                                            | Status                                                                                                                       |
| --- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| D1  | OVR formula        | Equal-weight mean of the non-null stats, rounded half away from zero; 3 or 4 stats needed, else null (`too_few_stats`). Section 4.4.                                                                                                                                                                                                                                                                                                           | Built on (`m4.sheet.footer` « moyenne des statistiques disponibles », `insufficient3` fixture)                               |
| D2  | CAP                | Per counted gameweek: the effective captain's `final_points` ÷ the best `final_points` among the locked XI's starters and that captain, clamped to [0, 1]; mean over eligible weeks. The vice counts only when the captain has `minutes_played = 0`; both at 0: week skipped. Section 4.2.                                                                                                                                                     | Recommended                                                                                                                  |
| D3  | SEL                | Per counted gameweek: `starting_points` ÷ the best legal XI from that lineup's 15, clamped to [0, 1]; Bench Boost weeks and optimum ≤ 0 skipped; mean. Section 4.2.                                                                                                                                                                                                                                                                            | Recommended                                                                                                                  |
| D4  | TRF                | Per transfer of a confirmed, non-Free-Hit batch: incoming minus outgoing `final_points` over the batch's first N = 3 non-cancelled gameweeks, minus the batch's `point_hit` shared across its transfers; mean per transfer. Counted once the window's last gameweek is evaluated. No batch: null (`no_transfers`). Section 4.2.                                                                                                                | Recommended                                                                                                                  |
| D5  | CON                | Share of counted gameweeks in the top half of that week's final scores (mid-rank percentile ≥ 0.5). Computed from `fantasy_team_gameweek_results`, not from the board (N8). Section 4.2.                                                                                                                                                                                                                                                       | Recommended                                                                                                                  |
| D6  | Scale              | Fixed piecewise-linear scales from each raw value to 1–99, held as data in the rules row, calibrated once on real 2026/27 data through an aggregate-only read the owner runs (section 14.3), then frozen. Never calibrated on invented numbers.                                                                                                                                                                                                | Recommended                                                                                                                  |
| D7  | Window             | Per season; frozen at season close. Until a new season reaches its minimum the card shows last season's values with its label (`previousSeason`); in the first season, a dash.                                                                                                                                                                                                                                                                 | Built on (`seasonStarted` fixture, `to-profile.ts`)                                                                          |
| D8  | Minimum            | OVR null until `min_rated` = 3 counted gameweeks; provisional until `min_confirmed` = 5. Both in the rules row. Only `state = 'final'` results count.                                                                                                                                                                                                                                                                                          | Built on (fixtures use 3 and 5)                                                                                              |
| D9  | Tiers              | Fixed OVR thresholds in the rules row, set at calibration so LEGEND ≈ top 1%, CHAMPION the next 4%, PRO the next 15%, STADE the next 30%, HOMA the rest. **Tiers may fall**; the season's best tier is kept beside the current one; a fall is never a moment.                                                                                                                                                                                  | Built on (`tierDown` fixture, `m8.down.line`)                                                                                |
| D10 | XP                 | None in v1.                                                                                                                                                                                                                                                                                                                                                                                                                                    | Built on (section plan 4.9)                                                                                                  |
| D11 | Cadence            | Each stable gameweek is evaluated once, by the job, after its postwork completes; never during live play. Re-evaluated only when its version or the rules change.                                                                                                                                                                                                                                                                              | Recommended                                                                                                                  |
| D12 | What counts        | Every final result, passive weeks included. **CAP before the captain fix (PR #376): exclude a week only when its captain is still the silent default**: the slot-1 starter of the team's first lineup, for a team whose first deadline fell before `cap_counts_from` (the moment #376 is live), for as long as that same player has stayed captain. Alternative: exclude every week whose deadline fell before `cap_counts_from`. Section 4.2. | Open (sub-question); default in bold                                                                                         |
| D13 | Founder            | A 2026/27 team created before the cut-off date, with at least one final result, excluding `app_private.staff_principals`, `@botolago.com` addresses, deleted-pending profiles and an explicit list. Granted once, after the cut-off has passed, by a guarded script the owner runs. **Cut-off date: the owner's** (the fixtures show 2026-11-30 as a sample). Section 5.2.                                                                     | Recommended; cut-off date Open                                                                                               |
| D14 | Number             | Random, unique, 100000–999999, assigned when the card row is created, managers only, never chosen or changed. **Never issue the 27 numbers that look special** (nine repdigits 111111…999999, nine round numbers 100000…900000, nine straights 123456, 234567, 345678, 456789, 987654, 876543, 765432, 654321, 543210). Section 5.1.                                                                                                           | Format approved with onboarding decision 9 (no leading zero); randomness Recommended; the excluded set Open, default in bold |
| D15 | Deleted accounts   | The number is retired forever: it stays in a ledger that holds no user id. Founder status goes with the account.                                                                                                                                                                                                                                                                                                                               | Built on (`state.deletion` « ne sera jamais réattribué »)                                                                    |
| D16 | Country            | None in v1.                                                                                                                                                                                                                                                                                                                                                                                                                                    | Built on (dropped from the port)                                                                                             |
| D17 | Name, avatar, club | Name: `display_name` when not blank, else the team name, for every signed-in reader. No avatar on any card (the client draws the shared figure). Club: resolved on the server (section 5.3); its colours null when the data has none.                                                                                                                                                                                                          | Built on                                                                                                                     |
| D18 | History            | One row per (manager, season, counted gameweek), written even below the minimum (null OVR), with the tier on every rated row.                                                                                                                                                                                                                                                                                                                  | Recommended                                                                                                                  |
| D19 | Visibility         | Signed-in readers only, behind the read switch, addressed by Fantasy team id, never a user id; nothing for anonymous readers but the status. Deleted-pending profiles: no card at all. **The batch read is further limited to league-mates and the caller (N6).**                                                                                                                                                                              | Recommended; N6 Open                                                                                                         |
| D20 | Privacy            | **Default: the read switch stays off until the privacy policy has a line saying that a manager's card (name, club, number, ratings, founder mark) is visible to signed-in managers in the same leagues, and appears on share images the manager makes.** Wording is the owner's or legal's.                                                                                                                                                    | Open (launch prerequisite)                                                                                                   |
| D21 | Seen moments       | Recorded on the server in `app.manager_card_moment_acks`, written only by the acknowledgement RPC.                                                                                                                                                                                                                                                                                                                                             | **Approved 2026-10-08**                                                                                                      |

### 1.2 The onboarding plan's nine decisions (all approved 2026-10-08)

| #   | Decision                                                   | What the backend does with it                                                                                                     |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | D21, moments seen on the server                            | Sections 3 and 6                                                                                                                  |
| 2   | No browser write at save                                   | The job creates card rows and numbers; reads answer `forming` until it has. The acknowledgement RPC is the only new browser write |
| 3   | An anonymous on/off read                                   | `api.manager_card_status()`, granted to `anon` (section 7)                                                                        |
| 4   | Unrated material has no tier word                          | `tier` is null whenever `ovr` is null; never `homa` before a rating                                                               |
| 5   | Resolve the club on the server first                       | A launch prerequisite (section 5.3)                                                                                               |
| 6   | Imports count as created teams                             | Front end only (analytics)                                                                                                        |
| 7   | Ship order                                                 | The weekly fact's ingredients stay deferred; none of them is returned in v1                                                       |
| 8   | « Un surnom suffit » and D20                               | D20 above                                                                                                                         |
| 9   | Replace `BOT #004821`; no moment on Semelle until it tests | D14's format (no leading zero) is enforced by a check constraint                                                                  |

### 1.3 New decisions the section introduces

| #   | Decision                                      | Answer                                                                                                                                                                                                                                                                                                                     | Status                                                                                 |
| --- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| N1  | "Off" is an answer                            | With the read switch off or no active rules row, the card reads return HTTP 200 `{"available": false}` (the Pépites pattern), never `PT403`. Replaces the hand-off's `PT403 manager_card_disabled`.                                                                                                                        | Contract (section plan 10.2)                                                           |
| N2  | Acknowledgement answer                        | Always HTTP 200 `{acknowledged: [...], ignored: [...]}`. A well-formed key that is not derivable now, or any key while switched off or deleted-pending, is ignored. `PT400` only for malformed input. Replaces the hand-off's `PT403`, `PT404` and `PT409`.                                                                | Contract (10.3)                                                                        |
| N3  | No team, no card                              | `get_my_manager_card` answers `{available: true, card: null}` when the caller has no team in the current season or is deleted-pending, instead of `PT404`; `teamId` is in every card.                                                                                                                                      | Contract (10.4)                                                                        |
| N4  | Club resolution                               | Resolved at read time: `user_preferences.favorite_team_id`, else `favorite_team_provisional_ref` matched to `app.teams.id` (when it is a uuid) or `app.teams.slug`, else null. The card never writes `user_preferences`. An owner-run normalisation of the references is optional and separate.                            | Recommended                                                                            |
| N5  | Club city in both languages                   | A new nullable `city` column on `app.team_translations`; `city` is returned only when both languages exist, else null (the client omits it). Shipped empty; seeding is an owner-reviewed script.                                                                                                                           | Recommended                                                                            |
| N6  | Batch read scope                              | **Teams that share an active league membership with the caller in the current season, plus the caller's own team.** Every other id is omitted. Every surface in the section plan (G3, G4, the league band, the club block) reads league-mates only. The wider option is D19 as written: any signed-in reader, any team id. | Open, default in bold                                                                  |
| N7  | Current season                                | The fantasy season with status `registration_open` or `active` (latest `starts_at`); between seasons, the latest `completed` one, so a closed season's card still shows.                                                                                                                                                   | Recommended                                                                            |
| N8  | CON's source                                  | Final results, not `fantasy_rankings`: the gameweek board also ranks active teams that have no result that week (`gameweek_points` coalesced to 0, `20260720163222:899–910`), which would flatter everyone. `board_not_final` stays in the closed set but is never emitted under rules v1.                                 | Recommended                                                                            |
| N9  | When a correction lands                       | Evaluate a gameweek as soon as it is evaluable; re-evaluate it and every later gameweek when its `scoring_input_version`, status or the active rules change. No 72-hour wait.                                                                                                                                              | Recommended                                                                            |
| N10 | Numbers have their own switch                 | `serials_enabled`, off, so the code can ship before D14 and D15 are answered.                                                                                                                                                                                                                                              | Recommended                                                                            |
| N11 | Job cadence                                   | `manager-card-tick` at minutes 4, 19, 34 and 49; `manager-card-history-prune` at 03:47 UTC (free: 03:17, 03:27, 03:37 ×2, 03:41 and 03:53 are taken).                                                                                                                                                                      | Recommended                                                                            |
| N12 | No testers mode on production                 | The status is anonymous and cached per server instance, so it cannot be per user. Rehearsal happens on staging; on production the owner reads any card in the SQL editor with `app_private.manager_card_preview(uuid)`, which is a read.                                                                                   | Recommended                                                                            |
| N13 | `bestTier` on the card                        | The best tier of the **current season** (the copy is « Meilleur cette saison »), not of all seasons as the hand-off said. `seasons[].bestTier` is per season.                                                                                                                                                              | Contract (copy `gradins.card.tier_best`)                                               |
| N14 | Season label                                  | `app.seasons.label` written short: `2026/2027` becomes `2026/27` (`^[0-9]{4}/[0-9]{4}$` → first five characters plus the last two). Any other label is returned as it is.                                                                                                                                                  | Recommended (production's label is `2026/2027`; the card and fixtures print `2026/27`) |
| N15 | TRF's « calculé {rounds} après le transfert » | The DTO carries no window length. The client takes `{rounds}` from a per-`rulesVersion` constant (3 for v1), like `FORMULA_KEYS`. Flag to the front-end lane.                                                                                                                                                              | Contract note for the front end                                                        |
| N16 | Latency budgets                               | `get_my_manager_card` p95 ≤ 150 ms and a batch of 100 ≤ 300 ms end to end; database time ≤ 40 ms and ≤ 80 ms. Section 11.                                                                                                                                                                                                  | Contract (10.11)                                                                       |

### 1.4 What the owner answers, in one message

The backend session sends this list first (section 15, BWP0), one plain line each, and asks "Which do
you change?":

1. D1–D5 formulas (as above), D6 scale, D9 thresholds and falling tiers, D11, D18: yes?
2. D12: exclude only the silent default captain before PR #376 (default), or every week before it?
3. D13: the founder cut-off date.
4. D14: never issue the 27 special-looking numbers?
5. D19 / N6: league-mates only for other people's cards (default), or any signed-in reader?
6. D20: the privacy line, and confirm that reads stay off until it is published.
7. Calibration: leave to run the aggregate-only read on production (section 14.3) once enough
   gameweeks are final.
8. Phase 0 questions (section 15, BWP0): unpushed Codex work, which migrations production has.

---

## 2. Facts this plan rests on

### 2.1 Confirmed in the repository

| Fact                                                                                                                                                                                                                                                                                                                                                                                                           | Where                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Latest migration on main: `20261006143700_account_deletion_automatic.sql`; 163 files. Remote branches hold three unmerged October files (`20261002120000_match_reminder_push`, `20261005100000_rankings_hide_owner_accounts`, `20261005130000_push_remaining_alerts`); the last two reuse versions main already holds and must renumber. Nothing is later than main's latest.                                  | `supabase/migrations/`, `git ls-tree` on every `origin/*`                                                          |
| Stable gameweek = `status in ('finalized','corrected') and points_state = 'final'`; the table check ties `finalized_at` to it.                                                                                                                                                                                                                                                                                 | `20260720141826_fantasy_catalog_rules.sql:196–202`; `20260924120000_fantasy_prizes.sql:530`                        |
| Finalization copies `provisional_points` to `final_points`, sets `status = 'finalized'`, `points_state = 'final'`, `scoring_input_version = greatest(…, p_calculation_version)`, and refuses unless every active team with a lineup has its gameweek and season rankings at that version.                                                                                                                      | `20260914200730_fantasy_verified_finalization.sql:150–213`                                                         |
| Postwork is keyed `(gameweek_id, calculation_version)`; the next gameweek opens only once the row for the current version has `completed_at`.                                                                                                                                                                                                                                                                  | `20260914200744:3–17`; `20260914200740:137–139`                                                                    |
| No migrated function writes `status = 'corrected'`; corrections are a rule (`FANTASY_RULES_V1.md:93–94`, 72 hours) with no writer yet. The re-evaluation in section 4.6 is defensive.                                                                                                                                                                                                                          | grep of `supabase/migrations/`                                                                                     |
| Nothing writes `fantasy_seasons.status = 'completed'`.                                                                                                                                                                                                                                                                                                                                                         | grep of `supabase/migrations/`                                                                                     |
| `fantasy_player_gameweek_points` aggregates every assigned fixture (minutes summed, capped at 180; `did_play` = any fixture with minutes > 0). Double gameweeks need no special case.                                                                                                                                                                                                                          | `20260927140000_incremental_fantasy_points.sql:218–225`; `FANTASY_RULES_V1.md:52`                                  |
| Team results: `starting_points` (the playing XI after automatic substitutions, no multiplier), `captain_points` (bonus only, `pts × (multiplier − 1)` of the effective captain), `bench_points`, `transfer_hit`, `chip_type`, `final_score`, `state`, `calculation_version`, `scoring_details` (with `effectiveCaptainId`, since `20260927140000`). Final rows cannot be rewritten (`fantasy_scoring_sealed`). | `20260720141850:84–113`; `20260927140000:3, 255–330`                                                               |
| The effective captain is the captain if they played, else the vice if they played, else none.                                                                                                                                                                                                                                                                                                                  | `20260927140000:255–264`; `FANTASY_RULES_V1.md:56–57`                                                              |
| Squad quotas 2/5/5/3; formation GK 1, DEF 3–5, MID 2–5, FWD 1–3.                                                                                                                                                                                                                                                                                                                                               | `20260720163222_fantasy_ruleset_v1.sql:314–324`                                                                    |
| The create flow's default captain is the first filled XI slot and the vice the second (until PR #376).                                                                                                                                                                                                                                                                                                         | `src/services/fantasy-create-service.ts:232–255`                                                                   |
| A new team's first lineup is for the gameweek it joins (`create_fantasy_team` inserts the team, squad and one lineup).                                                                                                                                                                                                                                                                                         | `20260926003100_ordinary_account_mfa_step_up.sql` (latest `create_fantasy_team`)                                   |
| Transfer batches carry `gameweek_id`, `transfers_count`, `point_hit`, `chip_type`, `status` (`confirmed` or `reversed_by_correction`).                                                                                                                                                                                                                                                                         | `20260720141847:98–126`                                                                                            |
| Profile setup saves the club as `favorite_team_provisional_ref`; in cloud mode that is the team's uuid as text (the club list's `id` is `team.id`), which passes the reference's check `^[a-z0-9][a-z0-9_-]{0,63}$`. Nothing writes `favorite_team_id`.                                                                                                                                                        | `src/services/auth-supabase.ts:529`; `src/services/football.ts:123`; `20260720075453:118–138`                      |
| `app.teams` has `slug`, `code` (nullable), `city` (one language), nullable colours; `app.team_translations(team_id, language, name, short_name)` has no city.                                                                                                                                                                                                                                                  | `20260720095330:213–246`; `20260921190000:29–44`                                                                   |
| Production's football season label is `2026/2027`.                                                                                                                                                                                                                                                                                                                                                             | `20260925200000_current_player_list_update.sql:169` and four others                                                |
| Every `api` function that reads the caller runs `perform app_private.assert_mfa_step_up();` (raises `PT403 mfa_required`); the reads test counts **77** such functions; the statement trigger `app_private.refuse_unverified_mfa_actor()` is on **26** tables.                                                                                                                                                 | `supabase/tests/database/ordinary_account_mfa_step_up_reads.test.sql:407–414`; `…_step_up.test.sql:136–160`        |
| `account_deletion_erase` try-locks four writers' keys, deletes Fantasy rows explicitly, then `delete from auth.users` cascades. Its test hard-codes the four keys.                                                                                                                                                                                                                                             | `20261006143700:405–420`; `account_deletion_automatic.test.sql:195–203`                                            |
| The health check list is pinned in one test, with `account_deletion` last.                                                                                                                                                                                                                                                                                                                                     | `ops_health_fantasy_coverage_and_scoring.test.sql:33–39`                                                           |
| A pg_cron command may set `set local statement_timeout` before its call.                                                                                                                                                                                                                                                                                                                                       | `20260926003050_news_sitemap_snapshot.sql:274`                                                                     |
| Apply scripts record each migration whole, check its sha256, run it, check the result, ship as a rehearsal (`rollback;`), and `notify pgrst, 'reload schema'` when they add API functions.                                                                                                                                                                                                                     | `scripts/backend/apply-20261006143700-account-deletion-automatic.sql`; `apply-20260925090000-predictions.sql:2883` |
| CI: `database-quality` resets a local stack, runs every pgTAP file, runs opt-in DB tests by env var, lints, checks generated types and uploads the authoritative file when they drift. It runs on pull requests only.                                                                                                                                                                                          | `.github/workflows/backend-quality.yml`                                                                            |
| The front end's data layer (WP1, in progress) calls exactly `manager_card_status`, `get_my_manager_card`, `get_manager_cards { p_team_ids }` (chunks of 100), `get_my_manager_card_history { p_season_id, p_before_seq, p_limit }` and `ack_manager_card_moments { p_keys }` (deduplicated).                                                                                                                   | `/home/user/mc-wp1/src/backend/manager-card/supabase-repository.ts`                                                |
| Highest task number on any branch: BG-0157. **BG-0158** is free.                                                                                                                                                                                                                                                                                                                                               | `docs/engineering/LAUNCH_LEDGER.yaml` on every `origin/*`                                                          |

### 2.2 Not confirmed: **[verify]** before relying on it

1. **[verify]** Production has `20261005130000` (public recaps) and `20261006143700` (account
   deletion) applied. PR #359 reported that the `20261006143700` apply stopped on production because
   `20261005130000` was missing. This plan's preflight requires both.
2. **[verify]** What production's `favorite_team_provisional_ref` values hold (team uuids, slugs,
   other). Aggregate-only read in section 14.3, step 2.
3. **[verify]** Whether `app.teams.city` is populated on production, and in which script.
4. **[verify]** Whether GW1 2026/27 results (finalized before `20260927140000`) have null
   `scoring_details`. The CAP rule falls back to minutes either way.
5. **[verify]** That `fantasy_teams.created_at` is the real creation time for every production team
   (no backfill by the bridge activation). Founder eligibility depends on it.
6. **[verify]** That the client's starter slot 1 is stored as `slot_order = 1` (the default-captain
   rule in D12 uses it).
7. **[verify]** Whether the server lets a bench player be captain. The CAP rule handles both cases.
8. **[verify]** `fantasy_seasons.ends_at` for 2026/27 is the real end of the season (section 4.7
   closes a season on it).
9. **[verify]** That Postgres' `to_jsonb(timestamptz)` text passes zod's
   `z.string().datetime({ offset: true })` (expected: `2026-10-08T12:34:56.123456+00:00` passes).
   The contract test (section 13.4) proves it.
10. **[verify]** Production's number of 2026/27 teams (the owner's figure), for batch sizing.
11. **[verify]** Unpushed Codex work on the card (the owner said "Codex already did work on
    backend"; nothing is on any pushed branch).

---

## 3. Data model

Conventions for every table below: `alter table … enable row level security; alter table … force
row level security; revoke all on … from public, anon, authenticated, service_role;`, no policies,
a `comment on table`, every foreign-key column leading an index. Rows keyed to a season or gameweek
reference it `on delete cascade` (so `api.service_rollback_fantasy_catalog` and
`scripts/backend/fantasy-catalog-restage-maintenance.sql` are never blocked) or carry no foreign
key. Tier codes are text with a check, never an `app` enum (they never appear in a signature, but
text keeps the JSON trivial).

### 3.1 Shape

```
app.profiles ─┬─< app.manager_cards (user_id PK; serial → app_private.manager_card_serials)
              │        ├─< app.manager_card_seasons (user_id, fantasy_season_id) ── fantasy_team_id
              │        └─< app.manager_card_history (user_id, gameweek_id) ─────── fantasy_team_id
              └─< app.manager_card_moment_acks (user_id, moment_key)

app_private.manager_card_settings        one row: compute, read, serials switches; last run
app_private.manager_card_rules           versioned, immutable once activated; no row ships
app_private.manager_card_gameweek_ledger one row per evaluated gameweek (version, rules, cursor)
app_private.manager_card_serials         every number ever issued; no user id; never deleted
app_private.manager_card_founder_grants  one row per cohort granted (cut-off, counts)
app_private.manager_card_job_log         ticks that did something, operator actions
```

### 3.2 `app_private.manager_card_settings`

```sql
create table app_private.manager_card_settings (
  id boolean primary key default true,
  compute_enabled boolean not null default false,
  read_enabled boolean not null default false,
  serials_enabled boolean not null default false,
  max_new_cards_per_run integer not null default 5000,
  max_serials_per_run integer not null default 5000,
  teams_per_batch integer not null default 2000,
  run_budget_ms integer not null default 90000,
  last_tick_at timestamptz,
  last_outcome text,
  last_detail jsonb,
  updated_at timestamptz not null default statement_timestamp(),
  constraint manager_card_settings_singleton check (id),
  constraint manager_card_settings_limits_check check (
    max_new_cards_per_run between 1 and 50000 and max_serials_per_run between 1 and 50000
    and teams_per_batch between 100 and 20000 and run_budget_ms between 5000 and 200000),
  constraint manager_card_settings_outcome_check check (
    last_outcome is null or last_outcome in ('idle', 'ok', 'partial', 'error')),
  constraint manager_card_settings_detail_check check (
    last_detail is null or (jsonb_typeof(last_detail) = 'object' and octet_length(last_detail::text) <= 4096))
);
insert into app_private.manager_card_settings (id) values (true);
```

Changed only by `app_private.manager_card_configure` (section 7.3).

### 3.3 `app_private.manager_card_rules`

```sql
create table app_private.manager_card_rules (
  version text primary key,
  min_rated integer not null,
  min_confirmed integer not null,
  cap_min_weeks integer not null,
  sel_min_weeks integer not null,
  con_min_weeks integer not null,
  trf_min_transfers integer not null,
  trf_window integer not null,
  cap_counts_from timestamptz,
  scales jsonb not null,
  tier_thresholds jsonb not null,
  calibration_note text not null,
  active boolean not null default false,
  activated_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint manager_card_rules_version_check check (version ~ '^v[0-9]{1,3}$'),
  constraint manager_card_rules_minimums_check check (
    min_rated between 1 and 20 and min_confirmed between min_rated and 38
    and cap_min_weeks between 1 and 20 and sel_min_weeks between 1 and 20
    and con_min_weeks between 1 and 20 and trf_min_transfers between 1 and 50
    and trf_window between 1 and 6),
  constraint manager_card_rules_shape_check check (
    app_private.manager_card_rules_valid(scales, tier_thresholds)),
  constraint manager_card_rules_note_check check (char_length(btrim(calibration_note)) between 10 and 2000),
  constraint manager_card_rules_active_check check (not active or activated_at is not null)
);
create unique index manager_card_rules_one_active_idx
  on app_private.manager_card_rules (active) where active;
```

- `scales`: `{"cap": [[x, y], …], "sel": …, "trf": …, "con": …}`. Each list has 2–12 points, x
  strictly increasing (numbers), y integers 1–99 non-decreasing. `tier_thresholds`:
  `{"stade": n, "pro": n, "champion": n, "legend": n}` with 1 < stade < pro < champion < legend ≤ 99.
  `app_private.manager_card_rules_valid(jsonb, jsonb) returns boolean` is `immutable`, checks both.
- `cap_counts_from`: the moment PR #376 is live on production (D12). Null: no CAP week is excluded.
- `v0` is reserved for staging rehearsals; the health check warns when `v0` is active.
- **Immutable.** Trigger `manager_card_rules_guard` (BEFORE UPDATE OR DELETE): an update may change
  only `active`, and `activated_at` once from null; a delete is refused once `activated_at` is set.
  A new number is a new version.
- **No row ships.** Tests insert rules inside their rolled-back transactions. Production gets v1
  from a guarded owner-run script after calibration (section 14.3).

### 3.4 `app_private.manager_card_gameweek_ledger`

```sql
create table app_private.manager_card_gameweek_ledger (
  gameweek_id uuid primary key references app.fantasy_gameweeks(id) on delete cascade,
  fantasy_season_id uuid not null references app.fantasy_seasons(id) on delete cascade,
  gameweek_seq integer not null,
  rules_version text not null references app_private.manager_card_rules(version),
  scoring_input_version bigint not null,
  gameweek_status text not null,
  evaluable_since timestamptz not null,
  after_team_id uuid,
  teams_evaluated integer not null default 0,
  started_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  constraint manager_card_gameweek_ledger_status_check check (gameweek_status in ('finalized', 'corrected'))
);
create index manager_card_gameweek_ledger_season_idx
  on app_private.manager_card_gameweek_ledger (fantasy_season_id, gameweek_seq);
create index manager_card_gameweek_ledger_rules_idx
  on app_private.manager_card_gameweek_ledger (rules_version);
```

A row with `completed_at` null is a gameweek in progress (`after_team_id` is the keyset cursor). A
row is **current** when its `scoring_input_version`, `gameweek_status` and `rules_version` equal the
gameweek's and the active rules'.

### 3.5 `app_private.manager_card_serials`

```sql
create table app_private.manager_card_serials (
  serial integer primary key,
  issued_at timestamptz not null default statement_timestamp(),
  constraint manager_card_serials_range_check check (serial between 100000 and 999999)
);
```

Every number ever issued. No user id. No function deletes from it (a pgTAP catalog check proves
it), and `app.manager_cards.serial` references it, so a number is never issued twice (D15).

### 3.6 `app_private.manager_card_founder_grants`

```sql
create table app_private.manager_card_founder_grants (
  cohort integer primary key,
  fantasy_season_id uuid not null,
  cutoff_date date not null,
  granted_at timestamptz not null default statement_timestamp(),
  granted_count integer not null,
  excluded jsonb not null default '{}'::jsonb,
  constraint manager_card_founder_grants_cohort_check check (cohort between 2026 and 2100),
  constraint manager_card_founder_grants_count_check check (granted_count >= 0),
  constraint manager_card_founder_grants_excluded_check check (
    jsonb_typeof(excluded) = 'object' and octet_length(excluded::text) <= 1024)
);
```

No foreign key on purpose: the record of a grant outlives a catalog rollback. `excluded` holds counts
only (`{"staff": n, "domain": n, "list": n, "deleted": n}`).

### 3.7 `app_private.manager_card_job_log`

```sql
create table app_private.manager_card_job_log (
  id bigint generated always as identity primary key,
  kind text not null,
  at timestamptz not null default clock_timestamp(),
  outcome text not null,
  detail jsonb not null default '{}'::jsonb,
  error text,
  constraint manager_card_job_log_kind_check check (kind in ('tick', 'operator', 'founder', 'rules')),
  constraint manager_card_job_log_detail_check check (
    jsonb_typeof(detail) = 'object' and octet_length(detail::text) <= 4096),
  constraint manager_card_job_log_error_check check (error is null or char_length(error) <= 2000)
);
create index manager_card_job_log_at_idx on app_private.manager_card_job_log (kind, at desc);
```

The tick writes a row only when it did something or failed (as `pepites_tick` does). Counts only,
never a user id.

### 3.8 `app.manager_cards`

```sql
create table app.manager_cards (
  user_id uuid primary key references app.profiles(id) on delete cascade,
  serial integer references app_private.manager_card_serials(serial),
  serial_assigned_at timestamptz,
  founder_cohort integer,
  founder_granted_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint manager_cards_serial_key unique (serial),
  constraint manager_cards_serial_check check (serial is null or serial between 100000 and 999999),
  constraint manager_cards_serial_time_check check ((serial is null) = (serial_assigned_at is null)),
  constraint manager_cards_founder_check check (
    (founder_cohort is null) = (founder_granted_at is null)
    and (founder_cohort is null or founder_cohort between 2026 and 2100))
);
create index manager_cards_serial_pending_idx on app.manager_cards (created_at, user_id) where serial is null;
create index manager_cards_founder_idx on app.manager_cards (founder_cohort) where founder_cohort is not null;
```

- Triggers: `app_private.set_updated_at()`; `manager_cards_guard` (BEFORE UPDATE): `serial` and
  `founder_cohort` may go from null to a value once and never change or return to null; `user_id`
  and `created_at` never change.
- The unique constraint's index covers the `serial` foreign key.

### 3.9 `app.manager_card_seasons`

One row per manager and season, written from the manager's first counted gameweek of that season.

| Column                                                 | Type                   | Rule                                                                      |
| ------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------- |
| `user_id`                                              | `uuid not null`        | → `app.manager_cards(user_id)` on delete cascade                          |
| `fantasy_season_id`                                    | `uuid not null`        | → `app.fantasy_seasons(id)` on delete cascade                             |
| `fantasy_team_id`                                      | `uuid not null`        | → `app.fantasy_teams(id)` on delete cascade; unique                       |
| `rules_version`                                        | `text not null`        |                                                                           |
| `calculation_version`                                  | `bigint not null`      | the through gameweek's `scoring_input_version`                            |
| `gameweeks_counted`                                    | `integer not null`     | ≥ 1                                                                       |
| `first_counted_gameweek_seq`                           | `integer not null`     |                                                                           |
| `through_gameweek_seq`                                 | `integer not null`     | ≥ `first_counted_gameweek_seq`                                            |
| `first_rated_gameweek_seq`                             | `integer`              | null until a rated row exists                                             |
| `ovr`                                                  | `smallint`             | 1–99                                                                      |
| `ovr_null_reason`                                      | `text`                 | `pending_minimum` or `too_few_stats`; non-null exactly when `ovr` is null |
| `tier`                                                 | `text`                 | tier code; non-null exactly when `ovr` is non-null                        |
| `best_tier`                                            | `text`                 | best tier held this season; null until rated                              |
| `provisional`                                          | `boolean not null`     | false when `ovr` is null                                                  |
| `cap`, `sel`, `trf`, `con`                             | `smallint`             | 1–99                                                                      |
| `cap_null_reason` … `con_null_reason`                  | `text`                 | the closed set of section 4.5; non-null exactly when the value is null    |
| `cap_raw`, `sel_raw`, `con_raw`                        | `numeric(7,6)`         | raw means (calibration and support; never returned)                       |
| `trf_raw`                                              | `numeric(10,4)`        | mean net points per transfer                                              |
| `cap_weeks`, `sel_weeks`, `con_weeks`, `trf_transfers` | `integer not null`     | eligible counts                                                           |
| `calculated_at`                                        | `timestamptz not null` | changes only when a value changes                                         |
| `closed_at`                                            | `timestamptz`          | set once at season close (section 4.7)                                    |

Primary key `(user_id, fantasy_season_id)`; unique `(fantasy_team_id)`; index
`(fantasy_season_id, closed_at)`.

### 3.10 `app.manager_card_history`

One row per manager and counted gameweek: that gameweek's facts and the season-to-date values
through it.

| Column                                 | Type                     | Rule                                                                                                                    |
| -------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `user_id`                              | `uuid not null`          | → `app.manager_cards(user_id)` on delete cascade                                                                        |
| `fantasy_season_id`                    | `uuid not null`          | → `app.fantasy_seasons(id)` on delete cascade                                                                           |
| `gameweek_id`                          | `uuid not null`          | → `app.fantasy_gameweeks(id)` on delete cascade                                                                         |
| `fantasy_team_id`                      | `uuid not null`          | → `app.fantasy_teams(id)` on delete cascade                                                                             |
| `gameweek_seq`                         | `integer not null`       |                                                                                                                         |
| `cap_ratio`, `sel_ratio`               | `numeric(7,6)`           | this week's ratio, null when skipped                                                                                    |
| `cap_skip`                             | `text`                   | `pre_captain_fix`, `no_captain_minutes`, `best_not_positive`, `inconsistent`; non-null exactly when `cap_ratio` is null |
| `sel_skip`                             | `text`                   | `bench_boost`, `optimum_not_positive`; non-null exactly when `sel_ratio` is null                                        |
| `con_top_half`                         | `boolean`                | null when fewer than two final results that week                                                                        |
| `trf_net_sum`                          | `numeric(12,4) not null` | sum of net points of the transfers whose window completes at this gameweek (default 0)                                  |
| `trf_transfers`                        | `integer not null`       | how many (default 0)                                                                                                    |
| `gameweeks_counted`                    | `integer not null`       | season to date                                                                                                          |
| `ovr`, `tier`, `provisional`           |                          | season to date, as in 3.9                                                                                               |
| `cap`, `sel`, `trf`, `con`             | `smallint`               | season to date                                                                                                          |
| `rules_version`, `calculation_version` | `text`, `bigint`         | not null                                                                                                                |
| `calculated_at`                        | `timestamptz not null`   | changes only when a value changes (moments use it as `occurredAt`)                                                      |

Primary key `(user_id, gameweek_id)`; unique `(user_id, fantasy_season_id, gameweek_seq)` (the
history read's keyset); indexes `(gameweek_id)`, `(fantasy_team_id)`, `(fantasy_season_id)`.

### 3.11 `app.manager_card_moment_acks`

```sql
create table app.manager_card_moment_acks (
  user_id uuid not null references app.profiles(id) on delete cascade,
  moment_key text not null,
  acknowledged_at timestamptz not null default statement_timestamp(),
  constraint manager_card_moment_acks_pkey primary key (user_id, moment_key),
  constraint manager_card_moment_acks_key_check check (moment_key ~ (
    '^(card_created|founder_granted|tier_changed:(stade|pro|champion|legend)|'
    || '(first_rating|provisional_cleared|season_closed|season_started):'
    || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'))
);
create trigger manager_card_moment_acks_refuse_unverified_mfa_actor
before insert or update or delete on app.manager_card_moment_acks
for each statement execute function app_private.refuse_unverified_mfa_actor();
```

- The uuid in a key is the `fantasy_season_id`. `homa` is never a key.
- No foreign key to cards or seasons: an acknowledgement can precede the card row (the forming
  answer), and a key whose season is rolled back simply stops matching any moment.
- The statement trigger follows the rule of `20260926003100` point 2: every table an ordinary
  `api` function writes for the caller carries it. This raises the trigger count from 26 to 27.
- Kept for the life of the account; never pruned (it is what stops a repeat).

### 3.12 `app.team_translations.city` (N5)

```sql
alter table app.team_translations
  add column city text,
  add constraint team_translations_city_check check (
    city is null or (city = btrim(city) and char_length(city) between 2 and 120));
```

Shipped empty. `app_private.football_team_json` is untouched (it names its columns). Seeding the
French and Arabic city of each club is an owner-reviewed script, not part of this PR.

---

## 4. Computation

### 4.1 Definitions

- **Current season** (N7): `app_private.manager_card_current_season() returns uuid`, `stable`: the
  fantasy season with status in (`registration_open`, `active`), latest `starts_at`, else the latest
  `completed` one. Same query shape as `app_private.fantasy_prize_current_season()`
  (`20260924120000:495–506`) plus the fallback.
- **Evaluable gameweek** g: `g.status in ('finalized','corrected') and g.points_state = 'final'`
  and a row in `app_private.fantasy_gameweek_postwork` for `(g.id, g.scoring_input_version)` with
  `completed_at` not null. `evaluable_since` = the later of `g.finalized_at`, `g.corrected_at` and
  that `completed_at`. Cancelled gameweeks are never evaluable.
- **Counted** (team T, gameweek g): g is evaluable and T has a row in
  `app.fantasy_team_gameweek_results` for g with `state = 'final'`. Passive weeks count (D12): a
  lineup carried forward still makes a final result.
- **K(T, h)**: the number of counted gameweeks of T's season with sequence ≤ h. This is
  `gameweeksCounted`.
- **Skipped profiles**: a profile with `deleted_at` not null is never evaluated and gets no card row.
  Its rows stay until the erasure removes them (section 9), and every read hides them.
- **Numbers**: all arithmetic in `numeric`. Per-week ratios are rounded half away from zero to 6
  places when stored; season means are computed from the stored values, so a re-run is identical.
  Integers come only from the scale (section 4.3).

### 4.2 The facts of one counted gameweek

`app_private.manager_card_gameweek_facts(p_gameweek_id uuid, p_cap_counts_from timestamptz,
p_trf_window integer, p_after_team_id uuid, p_limit integer)` returns one row per team in the batch
(teams with a final result in g, profile not deleted-pending, `fantasy_team_id > p_after_team_id`,
ordered by `fantasy_team_id`, at most `p_limit`). It is `stable` and writes nothing, so the tick
inserts from it and the calibration read (section 14.3) aggregates over it.

Notation for team T in gameweek g: L = T's lineup for g; `pts(p)` =
`coalesce(final_points, 0)` from `app.fantasy_player_gameweek_points (p, g)`; `mins(p)` likewise for
`minutes_played`; R = T's result row for g.

**CAP**

1. Effective captain c: if `R.scoring_details ? 'effectiveCaptainId'`, that id (null or `''` means
   none); else L's captain if `mins > 0`, else L's vice if `mins > 0`, else none.
2. No c: skip, `cap_skip = 'no_captain_minutes'`.
3. Consistency (the public recaps precedent): with `mult` = the season ruleset's
   `triple_captain_multiplier` when `R.chip_type = 'triple_captain'`, else `captain_multiplier`,
   require `R.captain_points = pts(c) × (mult − 1)`. Otherwise skip, `cap_skip = 'inconsistent'`
   (and count it in the job log's detail).
4. Default-captain exclusion (D12, default rule): when `p_cap_counts_from` is not null, let L0 be
   T's first lineup of the season (lowest gameweek sequence). If L0's gameweek `deadline_at` <
   `p_cap_counts_from` and L0's captain is the starter with `slot_order = 1` **[verify 6]**, that
   player is T's default captain d. The run of d ends at T's first later lineup whose captain is not
   d. If g's sequence is before that end (or the run has not ended), skip, `cap_skip =
'pre_captain_fix'`. The alternative rule (every week with `deadline_at < p_cap_counts_from`) is a
   one-line change if the owner chooses it.
5. `best` = the greatest `pts` among L's starters (`slot = 'starter'`) and c. If `best ≤ 0`: skip,
   `cap_skip = 'best_not_positive'`.
6. `cap_ratio = round(greatest(0, least(1, pts(c) / best)), 6)`.

Triple Captain weeks count (the choice is the same choice). Free Hit weeks count (their lineup is
that week's lineup).

**SEL**

1. `R.chip_type = 'bench_boost'`: skip, `sel_skip = 'bench_boost'`.
2. `optimum` = the best legal XI from L's 15 players by `pts`, under the season ruleset's
   `fantasy_position_rules`: the best goalkeeper; for each outfield position its top
   `starting_minimum` players; then the best `10 − Σ minimums` of the remaining outfield players
   ranked `starting_minimum + 1` to `starting_maximum` within their position. Ties by `pts` desc,
   then `fantasy_player_id`. This is exact for these constraints (each position's pool is capped at
   its maximum, so any best-k subset of the pools is legal).
3. `optimum ≤ 0`: skip, `sel_skip = 'optimum_not_positive'`.
4. `sel_ratio = round(greatest(0, least(1, R.starting_points / optimum)), 6)`.

`starting_points` is what the fielded XI scored after automatic substitutions, with no multiplier, so
it is a legal XI from the same 15 and never above `optimum` (the clamp only absorbs bad data).

**CON**

1. For gameweek g: `n` = the number of final results in g (every team in the season, deleted-pending
   included: they played that week). For each final score s: `below(s)` = results with a lower
   score, `at(s)` = results with that score. One `group by final_score` per batch, about 150 rows.
2. `n < 2`: `con_top_half = null`.
3. `p = (below(R.final_score) + 0.5 × (at(R.final_score) − 1)) / (n − 1)`; `con_top_half = p ≥ 0.5`.

`final_score` is the official weekly score (captain bonus and transfer hits included).

**TRF**

1. The season's gameweek order: non-cancelled gameweeks by sequence, numbered 1, 2, … (rn).
2. A batch b counts when `b.status = 'confirmed'` and `b.chip_type is distinct from 'free_hit'`
   (Wildcard batches count; their hit is 0). Its window starts at the first non-cancelled gameweek
   with sequence ≥ that of `b.gameweek_id` (rn = s) and is the `p_trf_window` gameweeks s … s + N −
   1. It **completes** at gameweek rn = s + N − 1. A window that would run past the season's last
      gameweek never completes: transfers in a season's last N − 1 gameweeks never count.
3. When g is the gameweek where b's window completes, each transfer t of b contributes
   `net(t) = round(Σ_{w in window} (pts(t.player_in_id, w) − pts(t.player_out_id, w)) −
b.point_hit / b.transfers_count, 4)`.
4. `trf_net_sum` = Σ net(t) over every transfer of T whose batch completes at g; `trf_transfers` =
   their number. Both 0 otherwise.

`fantasy_player_gameweek_points` holds every player of the season, owned or not (finalization
refuses until every player of the snapshot has a row), so a sold player's points are exact. A missing
row reads as 0 and is counted in the job log's detail.

### 4.3 Season to date, through gameweek h

For team T, over T's history rows of the season with sequence ≤ h:

| Value | Raw                                           | Eligible count             | Stat                                                        |
| ----- | --------------------------------------------- | -------------------------- | ----------------------------------------------------------- |
| CAP   | mean of non-null `cap_ratio`                  | `cap_weeks` = their number | `scale(cap_raw, scales.cap)` if `cap_weeks ≥ cap_min_weeks` |
| SEL   | mean of non-null `sel_ratio`                  | `sel_weeks`                | if `sel_weeks ≥ sel_min_weeks`                              |
| CON   | share of `true` among non-null `con_top_half` | `con_weeks`                | if `con_weeks ≥ con_min_weeks`                              |
| TRF   | `Σ trf_net_sum / Σ trf_transfers`             | `trf_transfers` = Σ        | if `trf_transfers ≥ trf_min_transfers`                      |

`app_private.manager_card_scale(p_x numeric, p_points jsonb) returns smallint`, `immutable`: below
the first point, its y; above the last, its y; otherwise linear between the two surrounding points;
`round()` (half away from zero); clamped to 1–99.

All four stats are null while `K < min_rated` (section 4.5 gives the reasons).

### 4.4 OVR, tier, provisional, rating state

- **OVR** = null if `K < min_rated` (`pending_minimum`); else, with m = the number of non-null
  stats, `round(sum / m)` when m ≥ 3, else null (`too_few_stats`). Clamped to 1–99.
- **Tier** = null when OVR is null; else the highest of `legend`, `champion`, `pro`, `stade` whose
  threshold ≤ OVR, else `homa` (`app_private.manager_card_tier(smallint, jsonb)`, `immutable`).
- **Provisional** = OVR not null and `K < min_confirmed`.
- **Rating state**: `forming` when `K < min_rated` (including no season row yet);
  `insufficient` when `K ≥ min_rated` and OVR null; `provisional`; `rated`.
- **Best tier** (season row) = the highest tier among the season's history rows.
- **First rated** = the lowest sequence with OVR not null in the season.
- **Next tier** (`nextTier`) = the next tier above the current one with its threshold
  (`{code, fromOvr}`); null when OVR is null or the tier is `legend`.

Tier order: `homa < stade < pro < champion < legend`.

### 4.5 Null reasons: when each applies (closed set, versioned with the rules)

Precedence, per stat, through h:

1. `K < min_rated`: every stat `pending_minimum`; OVR `pending_minimum`.
2. Otherwise:

| Stat | Reason                | When                                                                                       |
| ---- | --------------------- | ------------------------------------------------------------------------------------------ |
| CAP  | `pre_captain_fix`     | `cap_weeks < cap_min_weeks` and at least one counted week was skipped as `pre_captain_fix` |
| CAP  | `excluded_weeks_only` | `cap_weeks = 0` and no week was skipped as `pre_captain_fix`                               |
| CAP  | `pending_minimum`     | `0 < cap_weeks < cap_min_weeks`, no `pre_captain_fix` skip                                 |
| SEL  | `excluded_weeks_only` | `sel_weeks = 0` (every week Bench Boost or optimum ≤ 0)                                    |
| SEL  | `pending_minimum`     | `0 < sel_weeks < sel_min_weeks`                                                            |
| CON  | `excluded_weeks_only` | `con_weeks = 0` (no week with two or more final results)                                   |
| CON  | `pending_minimum`     | `0 < con_weeks < con_min_weeks`                                                            |
| TRF  | `no_transfers`        | T has no confirmed batch in the season                                                     |
| TRF  | `excluded_weeks_only` | T's only confirmed batches are Free Hit                                                    |
| TRF  | `window_open`         | T has a countable batch but `trf_transfers = 0` (no window has completed)                  |
| TRF  | `pending_minimum`     | `0 < trf_transfers < trf_min_transfers`                                                    |
| any  | `board_not_final`     | never emitted under rules v1 (N8); kept so the client's set stays closed                   |

OVR: `pending_minimum` (rule 1) or `too_few_stats` (fewer than 3 stats).

**Live TRF reason.** The season row is written when a gameweek is evaluated, but a transfer can be
confirmed in between. When the stored TRF is null with reason `no_transfers` or
`excluded_weeks_only` and `K ≥ min_rated`, the card read re-derives the reason from
`app.fantasy_transfer_batches` at read time (one indexed `exists` on
`fantasy_transfer_batches_history_idx`). So the M3f line disappears as soon as the first transfer is
confirmed and the card is re-read.

### 4.6 Determinism, idempotence and corrections

- Facts are recomputed from immutable final rows; season values from stored facts. Two runs over
  the same data produce identical rows.
- Upserts change a row only when a value differs:
  `on conflict … do update set … where (excluded.<values>) is distinct from (<table>.<values>)`;
  `calculated_at` moves only then. A second run writes nothing (pgTAP compares `xmin`).
- **Corrections (N9).** At the start of each run the tick compares every ledger row of a season with
  its gameweek. The first gameweek (by sequence) whose ledger row is missing, in progress or not
  current is the restart point: ledger rows at or after it are deleted and those gameweeks are
  evaluated again, in order. A history row of a re-evaluated gameweek whose team no longer has a
  final result there is deleted.
- **Torn reads.** Under read committed, each statement sees a fresh snapshot. The batch reads the
  gameweek's `scoring_input_version` and `status` first and again just before writing; if either
  changed, the batch's subtransaction raises and rolls back, and the next run starts from that
  gameweek. A change that commits after the final check is caught by the next run's comparison.
- **Rules change.** Activating a new version makes every ledger row non-current, so every season is
  re-evaluated under it. Moment keys are per season and tier, so no moment repeats, and an
  acknowledged moment stays acknowledged.
- **Partial gameweeks.** While gameweek g is in progress (cursor set), managers already processed
  show g and the others g − 1. Batches are sized so a gameweek finishes in one run at the expected
  population (section 8.4).

### 4.7 Season close

`app_private.manager_card_close_seasons()` sets `closed_at = statement_timestamp()` on every season
row of season S (where null) when all hold:

- `S.status = 'completed'` or `S.ends_at < now()` **[verify 8]** (nothing writes `completed` today);
- every non-cancelled gameweek of S is stable;
- the ledger holds a current, completed row for every one of them.

A correction after close re-evaluates the season's values; `closed_at` stays.

### 4.8 Worked examples

The scales and thresholds below are **examples only** (rules v1 comes from calibration):
CAP `[[0,1],[0.4,30],[0.7,70],[0.9,90],[1,99]]`; SEL `[[0.5,1],[0.75,40],[0.85,70],[0.95,95],[1,99]]`;
TRF `[[-10,1],[-2,30],[0,45],[3,65],[8,90],[15,99]]`; CON `[[0,1],[0.25,30],[0.5,55],[0.75,80],[1,99]]`;
tiers `stade 55, pro 70, champion 82, legend 90`; minimums: rated 3, confirmed 5, each stat 3 weeks,
TRF 1 transfer, window 3.

**Manager A** joins at J5.

| GW  | Facts                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J5  | Captain played, 9 points; best starter 12 → CAP 0.75. `starting_points` 54, optimum 63 → SEL 0.857143. Final 58 of 1,201 results; 700 lower, 11 at 58 (10 others) → p = (700 + 5) / 1200 = 0.5875 → top half. |
| J6  | Captain 0 minutes; vice 6, best of starters and vice 10 → CAP 0.6. Bench Boost → SEL skipped. Final 71 → top half. A batch for J6: one transfer, hit 0 (window J6–J8).                                        |
| J7  | Captain 15, best 15 → CAP 1.0. 48 / 60 → SEL 0.8. Final 39, p = 0.31 → not top half.                                                                                                                          |
| J8  | Captain 7, best 14 → CAP 0.5. 50 / 55 → SEL 0.909091. Final 62 → top half. The J6 batch's window completes: in 8 + 2 + 5 = 15, out 3 + 6 + 1 = 10 → net 5.                                                    |

- **Through J5 and J6** (K = 1, 2): forming; every stat null `pending_minimum`; `ratingGameweeks`
  [5, 6, 7].
- **Through J7** (K = 3): CAP (0.75 + 0.6 + 1.0) / 3 = 0.783333 → 70 + (0.083333 / 0.2) × 20 = 78.3
  → **78**. SEL: 2 eligible weeks < 3 → null `pending_minimum`. CON 2/3 = 0.666667 → 55 + (0.166667
  / 0.25) × 25 = 71.7 → **72**. TRF: a countable batch, window not complete → null `window_open`.
  Two stats → OVR null `too_few_stats` → **insufficient** (« La note attend encore une
  statistique »).
- **Through J8** (K = 4): CAP 2.85 / 4 = 0.7125 → 71.25 → **71**. SEL (0.857143 + 0.8 + 0.909091) /
  3 = 0.855411 → 70 + (0.005411 / 0.1) × 25 = 71.35 → **71**. CON 3/4 = 0.75 → **80**. TRF 5 / 1 = 5
  → 65 + (2 / 5) × 25 = **75**. OVR round((71 + 71 + 75 + 80) / 4) = round(74.25) = **74**, tier
  **PRO**, provisional (4 < 5), `nextTier {champion, 82}`, `firstRatedGameweekSeq` 8, moments
  `first_rating:<season>` and (if previously rated in an earlier season at a lower tier)
  `tier_changed:pro`.

**The lab's sample** CAP 91, SEL 82, TRF 86, CON 78 → 337 / 4 = 84.25 → **84 PRO**. With TRF null
(`no_transfers`): 251 / 3 = 83.67 → **84**.

### 4.9 Edge cases

| Case                                      | Behaviour                                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Double gameweek                           | One gameweek; every player's points and minutes already aggregate both fixtures. CAP, SEL, TRF read the aggregate; K and CON count it once. |
| Blank gameweek for a squad                | Points 0: CAP skipped (`best_not_positive`), SEL skipped (`optimum_not_positive`); CON still counts the final score.                        |
| Cancelled gameweek                        | Never stable, never counted; skipped in TRF windows (the window takes the next non-cancelled gameweek).                                     |
| Postponed fixture                         | Handled by Fantasy (deferred out of the gameweek); the card reads whatever the gameweek's final points are.                                 |
| Correction inside 72 hours                | Version bump → that gameweek and every later one re-evaluated (4.6). No duplicate moment; `occurredAt` moves only if values changed.        |
| Passive week (lineup carried forward)     | Counts (D12). CAP uses the carried captain; SEL the carried XI.                                                                             |
| No transfers all season                   | TRF null `no_transfers`; OVR from the other three; with one of them also null, `insufficient`.                                              |
| Free Hit                                  | Its batch is excluded from TRF; its week counts for CAP, SEL, CON.                                                                          |
| Wildcard                                  | Its batch counts for TRF (hit 0).                                                                                                           |
| Bench Boost                               | SEL skipped that week; CAP and CON count.                                                                                                   |
| Triple Captain                            | CAP counts; consistency uses multiplier 3.                                                                                                  |
| Captain and vice both 0 minutes           | CAP skipped (`no_captain_minutes`).                                                                                                         |
| Negative captain score                    | Ratio clamped to 0.                                                                                                                         |
| CAP weeks before PR #376                  | D12 rule (4.2 CAP step 4); all weeks skipped that way → CAP null `pre_captain_fix`.                                                         |
| Transfers in the last N − 1 gameweeks     | Never complete, never count.                                                                                                                |
| Reversed batch (`reversed_by_correction`) | Excluded.                                                                                                                                   |
| Team joins mid-season                     | K counts from its first final result; `ratingGameweeks` from its first lineup's gameweek.                                                   |
| Deleted-pending manager                   | Skipped by the job, hidden by every read; still in CON's populations for weeks they played.                                                 |
| Erased manager                            | Rows cascade away (section 9). Stored CON facts of others are not recomputed unless their gameweek is re-evaluated.                         |
| `scoring_details` absent (old results)    | Effective captain from minutes; same consistency check.                                                                                     |
| Data inconsistency                        | The week is skipped for that stat (`inconsistent`), counted in the job log's detail, never invented.                                        |
| New season                                | New season row from the first counted gameweek; until rated, the card shows `previousSeason` (D7, client side).                             |

---

## 5. Identity: number, founder, club, name, season label

### 5.1 The number (D14, D15)

- `app_private.manager_card_serial_allowed(p_serial integer) returns boolean`, `immutable`: in
  100000–999999 and not one of the 27 special-looking numbers (D14).
- `app_private.manager_card_assign_serials(p_limit integer) returns integer`: for up to `p_limit`
  cards with a null number (oldest first, `manager_cards_serial_pending_idx`), draw a candidate as
  100000 plus a uniform integer from four bytes of `extensions.gen_random_bytes(4)` (0 to 2³² − 1)
  modulo 900000 (bias below 0.03%), until the candidate is allowed and
  `insert into app_private.manager_card_serials … on conflict do nothing returning serial` returns it
  (at most 50 draws, else skip the card this run and count it); then set `serial` and
  `serial_assigned_at`. Runs only when `serials_enabled`. `random()` is not used.
- Never chosen, bought, granted later or changed (trigger). Never reused (ledger). The number does
  not reveal the user count (random) and never has a leading zero (range).
- Capacity: 899,973 numbers. The health check warns at 50% issued and fails at 80%.

### 5.2 Founder (D13)

`app_private.manager_card_grant_founders(p_fantasy_season_id uuid, p_cohort integer, p_cutoff date,
p_exclude_user_ids uuid[], p_apply boolean) returns jsonb`, executable by `postgres` only:

1. Refuses (`22023`) when `p_cutoff` is after today in `Africa/Casablanca`, when the cohort already
   has a row in `app_private.manager_card_founder_grants`, or when the tick's lock cannot be taken
   (`pg_try_advisory_xact_lock(hashtextextended('botolago:manager-card-tick', 0))`, "busy, run again
   in a minute").
2. Eligible: a team of `p_fantasy_season_id` with `created_at < (p_cutoff::timestamp at time zone
'Africa/Casablanca')` (the copy says « créées avant le {date} »), at least one final result,
   profile not deleted-pending, not in `app_private.staff_principals`, the Auth e-mail not ending in
   `@botolago.com`, not in `p_exclude_user_ids`.
3. `p_apply = false`: returns the counts and writes nothing (a read).
4. `p_apply = true`: upserts `app.manager_cards (user_id, founder_cohort, founder_granted_at)` for
   every eligible account (creating the card row if missing; the number follows at the next run),
   inserts the grant row and a job-log row (`kind = 'founder'`), returns
   `{"eligible": n, "granted": n, "excluded": {"staff": n, "domain": n, "list": n, "deleted": n}}`.
   Counts only, never an id.

When PR #348's `app_private.ranking_hidden_accounts` lands, a new migration adds it to the
exclusions. This plan does not reference it.

### 5.3 The club (N4, N5; a launch prerequisite)

- `app_private.manager_card_club_id(p_user_id uuid) returns uuid`, `stable`:
  `user_preferences.favorite_team_id`, else the provisional reference matched to `app.teams.id` when
  it is a uuid (`~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`), else to
  `app.teams.slug`, else null. Inactive clubs still resolve (a relegated club is still the
  manager's club).
- `app_private.manager_card_club_json(p_team_id uuid) returns jsonb`, `stable`:

| Field            | Source                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| `id`             | `team.id`                                                                                           |
| `slug`           | `team.slug`                                                                                         |
| `code`           | `nullif(btrim(team.code), '')`                                                                      |
| `name`           | `{fr: coalesce(fr.name, team.name), ar: coalesce(ar.name, team.name)}` from `app.team_translations` |
| `shortName`      | `{fr: coalesce(fr.short_name, team.short_name), ar: coalesce(ar.short_name, team.short_name)}`      |
| `city`           | `{fr: coalesce(fr.city, team.city), ar: ar.city}` when both are non-null, else `null`               |
| `primaryColor`   | `team.primary_color` (null on production today for every club, per `club-identity.ts`)              |
| `secondaryColor` | `team.secondary_color`                                                                              |

- **Launch prerequisite:** the aggregate read of section 14.3 step 2 shows every non-null reference
  resolving (unresolved = 0, or each unresolved one explained). The card never writes
  `user_preferences`.

### 5.4 Name, handle, season label

- **Name** (D17, the boards' signed-in rule): `display_name` when `btrim(display_name) <> ''`, else
  the team's name. One string, both scripts.
- **Handle**: `profiles.username`, nullable (own card only).
- **Season label** (N14): `app_private.manager_card_season_label(p_fantasy_season_id uuid) returns
text`: `app.seasons.label` through `fantasy_seasons.football_season_id`, shortened from
  `2026/2027` to `2026/27`.

---

## 6. Moments and acknowledgements (D21)

### 6.1 Rules

- Display-only: no prize, ranking, league, Fantasy rule or job reads a moment or an
  acknowledgement.
- Signed-in only. Derived from rows on every read; no event table, queue, notification, e-mail or
  push.
- A moment is returned only while **pending**: derivable, not acknowledged, inside its window.
- Values are codes and numbers; the client holds every label.
- Corrections and rules changes recompute the same keys; an acknowledged key never returns.

### 6.2 Derivation

`app_private.manager_card_moments(p_user_id uuid) returns table (moment_key text, kind text,
occurred_at timestamptz, payload jsonb, derivable boolean, pending boolean)`, `stable`. Current
season = N7; "rows" are the user's history rows ordered by season `starts_at`, then sequence.

| Kind                  | Key                        | Derivable when                                                                                                                                                | Payload (camelCase, as section 7.2)                                                                                                                                    | Pending while                                                     |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `card_created`        | `card_created`             | a card row exists, or the forming answer applies (current-season team, no card row)                                                                           | `occurredAt` = card `created_at` or null; `seasonLabel` (current)                                                                                                      | not acknowledged                                                  |
| `first_rating`        | `first_rating:<fs>`        | the season's lowest-sequence row with `ovr` not null                                                                                                          | `occurredAt` = that row's `calculated_at`; `gameweekSeq`, `ovr`, `tier`, `provisional`, `gameweeksCounted` (that row); `firstEver` = no earlier season has a rated row | not acknowledged and fs is current                                |
| `provisional_cleared` | `provisional_cleared:<fs>` | the season's lowest-sequence row with `ovr` not null and `provisional = false`                                                                                | `occurredAt`, `gameweekSeq`, `ovr`, `gameweeksCounted`                                                                                                                 | not acknowledged and fs is current                                |
| `tier_changed`        | `tier_changed:<tier>`      | tier ≠ `homa`; the account's earliest row at that tier has an earlier rated row whose tier ranks **lower** (so a first-ever rating and a fall never make one) | `occurredAt`, `tier`, `previousTier` (that earlier row's tier), `ovr`, `gameweekSeq`, `seasonLabel`                                                                    | not acknowledged and the current tier ranks at or above it        |
| `founder_granted`     | `founder_granted`          | `founder_cohort` not null                                                                                                                                     | `occurredAt` = `founder_granted_at`; `cohort`; `cutoffDate` from the grant row                                                                                         | not acknowledged                                                  |
| `season_closed`       | `season_closed:<fs>`       | the season row for fs has `closed_at`                                                                                                                         | `occurredAt` = `closed_at`; `seasonLabel`, `ovr`, `tier` (final)                                                                                                       | not acknowledged and fs is the user's most recently closed season |
| `season_started`      | `season_started:<fs>`      | the user has a team in fs and a closed season row for an earlier season                                                                                       | `occurredAt` = that team's `created_at`; `seasonLabel`; `previous {label, ovr, tier}` of the most recent closed season                                                 | not acknowledged, fs current, and fs's OVR still null             |

- Ordered by `occurred_at` (nulls first), then key.
- A jump from HOMA to PRO yields `tier_changed:pro` only. **Change from the hand-off:** a tier first
  reached by the first-ever rating, or by a fall, is never a `tier_changed` moment (the first rating
  hero already shows it; a fall is never a moment). `previousTier` is therefore never null in v1;
  the DTO keeps it nullable.

### 6.3 What the card read returns

`moments` = the pending rows, as the section 7.2 discriminated union. While the read switch is off,
nothing is returned at all (`{available: false}`), and the acknowledgements are kept.

### 6.4 Acknowledging

`api.ack_manager_card_moments(p_keys text[])` (section 11.5): keys that pass the shape check and are
**derivable now** (window ignored, so a benign race never fails) are inserted
`on conflict do nothing`; `acknowledged` = every requested key now on record (new or earlier),
`ignored` = the rest. It writes only the caller's rows in `app.manager_card_moment_acks`.

### 6.5 The only browser write

The acknowledgement RPC is the only new write path from the app (section plan 10.13; approved
onboarding decision 2). Nothing runs at save time.

---

## 7. Switches and the status read

### 7.1 Three switches, all off

| Switch            | Off means                                                                                         | On means                                           |
| ----------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `compute_enabled` | The tick answers `{"outcome": "off"}` and writes nothing at all (not even `last_tick_at`)         | The tick creates card rows and evaluates gameweeks |
| `serials_enabled` | Card rows get no number                                                                           | The tick numbers cards (D14, D15)                  |
| `read_enabled`    | Status `enabled: false`; card reads `{available: false}`; acks ignore everything; nothing written | Reads serve, if an active rules row exists         |

Without an active rules row, the tick answers `{"outcome": "no_rules"}` and writes nothing, even
with compute on, and the status says off.

### 7.2 The status read

`api.manager_card_status() returns jsonb`, `language sql stable security definer set search_path =
''`:

```json
{ "enabled": true, "minRated": 3, "minConfirmed": 5 }
```

- `enabled` = `read_enabled` and an active rules row exists. `minRated` and `minConfirmed` from that
  row, both null when not enabled.
- Grants: `anon, authenticated, service_role`. No `auth.uid()`, so no step-up and no change to the
  step-up count. No personal data, no counts.
- The app reads it from its server only (section plan 3.2), about once a minute per instance, and
  treats `PGRST202`, an error, a timeout or a malformed answer as off. A missing migration therefore
  reads as off.
- Budget: two single-row reads, ≤ 5 ms.

### 7.3 Configure, activate, preview, report (owner, `postgres` only)

| Function                                                                                                                                                                                                                                  | What it does                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app_private.manager_card_configure(p_compute boolean, p_read boolean, p_serials boolean default null, p_max_new_cards integer default null, p_teams_per_batch integer default null, p_run_budget_ms integer default null) returns jsonb` | Null leaves a value as it is. Writes the settings row and a job-log row (`operator`), returns the settings. Pause compute: `select app_private.manager_card_configure(false, null);`                                                          |
| `app_private.manager_card_activate_rules(p_version text) returns jsonb`                                                                                                                                                                   | Deactivates the active version, activates this one (sets `activated_at` once), logs (`rules`). Every gameweek is then re-evaluated under it.                                                                                                  |
| `app_private.manager_card_preview(p_user_id uuid) returns jsonb`                                                                                                                                                                          | The `get_my_manager_card` card for that account, whatever the read switch says. A read, for the owner's checks in the SQL editor (N12).                                                                                                       |
| `app_private.manager_card_report() returns jsonb`                                                                                                                                                                                         | One read for everything: switches, active rules, per season the evaluable / evaluated / in-progress gameweeks, card rows vs current-season teams, numbers issued and the pool's use, founders granted, the last 10 job-log rows. Counts only. |

---

## 8. The scheduled job and its health check

### 8.1 `app_private.manager_card_tick(p_now timestamptz default statement_timestamp()) returns jsonb`

1. `pg_try_advisory_xact_lock(hashtextextended('botolago:manager-card-tick', 0))`, else
   `{"outcome": "busy"}`.
2. Settings off → `{"outcome": "off"}`. No active rules → `{"outcome": "no_rules"}`. Neither writes.
3. **Card rows** (subtransaction): insert `app.manager_cards (user_id)` for teams of the current
   season and of any season being evaluated, profile not deleted-pending, no card yet, at most
   `max_new_cards_per_run`, `on conflict do nothing`.
4. **Numbers** (subtransaction, only when `serials_enabled`): `manager_card_assign_serials(max_serials_per_run)`.
5. **Evaluation**: for each fantasy season with evaluable gameweeks (by `starts_at`), find the
   restart point (4.6), then evaluate gameweeks in sequence. Each batch of `teams_per_batch` teams is
   one subtransaction calling `app_private.manager_card_evaluate_batch(p_gameweek_id, p_rules_version,
p_after_team_id, p_limit) returns jsonb`, which inserts the facts (4.2), computes season-to-date
   values (4.3–4.5), upserts history and season rows (4.6), advances the ledger cursor, and marks the
   ledger row complete after the last batch. Stop starting batches once `clock_timestamp()` is past
   `run_budget_ms` from the start. A failing batch is logged; that season stops at that gameweek;
   other steps carry on.
6. **Season close** (subtransaction): `manager_card_close_seasons()`.
7. Update the settings' `last_tick_at`, `last_outcome` (`idle` when nothing was due, `ok`, `partial`
   when a step failed, `error`) and `last_detail` (counts); a job-log row when anything was written
   or failed.

Returns `{"outcome", "cardsCreated", "serialsAssigned", "gameweeksCompleted", "teamsEvaluated",
"seasonsClosed", "errors": [...]}`.

### 8.2 The cron jobs

```sql
select cron.schedule(
  'manager-card-tick',
  '4,19,34,49 * * * *',
  $job$set local statement_timeout = '240s'; set local lock_timeout = '5s'; select app_private.manager_card_tick();$job$
);
select cron.schedule(
  'manager-card-history-prune',
  '47 3 * * *',
  $prune$
    delete from cron.job_run_details
    where jobid = (select jobid from cron.job where jobname = 'manager-card-tick')
      and end_time < now() - interval '7 days';
    delete from app_private.manager_card_job_log
    where kind = 'tick' and at < now() - interval '180 days';
  $prune$
);
```

- Minutes 4, 19, 34, 49 avoid every `*/5`, `*/10`, `*/15` job, the account-deletion tick (:23) and
  the season orchestrator (:12).
- The prune never touches a card table, the ledger, the numbers or the grants.
- Cadence (D11, approved decision 2): a number appears within one run (15 minutes) of the first
  save; a gameweek's cards appear within one run of its postwork completing.

### 8.3 Pausing (for AGENTS.md, section 16)

- Compute: `select app_private.manager_card_configure(false, null);` and back with
  `select app_private.manager_card_configure(true, null);`.
- Prune: `select cron.alter_job((select jobid from cron.job where jobname = 'manager-card-history-prune'), active := false);`
  and back with `active := true`.
- The read switch is not a writer; leave it as it is unless hiding the section is the point.

### 8.4 Sizing

Per batch of 2,000 teams: about 30,000 lineup rows and 30,000 primary-key reads of player points,
one score histogram, a few thousand history rows. Target: a gameweek of 50,000 teams in under 60 s,
measured on a synthetic local fixture (section 13.5) and recorded in the PR with the batch time.
Adjust `teams_per_batch` and `run_budget_ms` from the measurement, not by guess.

### 8.5 Health check `manager_card`

`alter function app_private.ops_health_checks() rename to ops_health_checks_before_manager_card;`
then a new `app_private.ops_health_checks()` that appends one check (the `20261006143700` pattern),
last in the list:

| Status | When                                                                                                                                                                                                                                                                                                                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ok     | both switches off ("switched off"); or on and current                                                                                                                                                                                                                                                                                  |
| warn   | read on and compute off ("cards frozen"); compute on with no active rules; active rules `v0`; last tick older than 1 hour while compute is on; last outcome `partial` or `error`; an evaluable gameweek not evaluated 2 hours after `evaluable_since`; current-season teams without a card row for more than 1 hour; number pool ≥ 50% |
| fail   | last tick older than 6 hours while compute is on; an evaluable gameweek not evaluated 12 hours after `evaluable_since`; number pool ≥ 80%                                                                                                                                                                                              |

`fail` pages the owner through `ops-alert-tick`. Failed runs of the cron job already surface in
`cron_jobs`. The watchdog reports the check whenever the database names it; add it to
`REQUIRED_DATABASE_CHECKS` in `scripts/ops/watchdog.ts` only once production has it.

---

## 9. Account deletion

- **At the request** (`account_deletion_disable` sets `deleted_at`): every read hides the card, the
  batch omits the team, the tick skips the account, acks are ignored. Nothing to change in that
  function.
- **At erasure** (`account_deletion_erase`): it deletes the Fantasy teams (cascading
  `manager_card_seasons` and `manager_card_history` through `fantasy_team_id`), then `delete from
auth.users` cascades the profile → `manager_cards` → any remaining season and history rows, and
  `manager_card_moment_acks`. The number stays in `app_private.manager_card_serials` with no user id,
  so it is never issued again (D15). Founder status goes with the card row.
- **The lock.** Migration 6 adds the tick's key to the erasure's no-wait locks, so an erasure and a
  tick never overlap. A `do` block reads `pg_get_functiondef('app_private.account_deletion_erase(uuid,integer)'::regprocedure)`,
  requires the anchor below **exactly once**, replaces it, requires the result to differ, executes it,
  and re-reads it to confirm the new line is present:

  ```text
  anchor:      or not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('botolago.fantasy_prize_evaluation', 0))
  replacement: or not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('botolago.fantasy_prize_evaluation', 0))
                   or not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('botolago:manager-card-tick', 0))
  ```

  `create or replace` keeps the function's grants. If the anchor is absent or repeated, the
  migration raises and nothing is applied.

- **Tests:** `account_deletion_automatic.test.sql` adds `'botolago:manager-card-tick'` to its key
  array; a new case erases an account with a card, a season, history, acks and a founder mark, and
  finds zero rows in every card table, the number still in the ledger, and
  `manager_card_assign_serials` unable to issue it again.
- **Runbook:** `ACCOUNT_DELETION_RUNBOOK.md` names the four card tables in the cascade list, the
  number ledger under "Kept after erasure" (a number, no user id) and the fifth lock under "Other
  writers".
- **Data export:** none exists in the repository; nothing to list.

---

## 10. Visibility and the batch read (D19, N6)

- Anonymous readers: the status only.
- Signed-in readers: their own card and history; other managers' cards only through
  `get_manager_cards`, only for teams of the current season, only for league-mates (N6 default) and
  themselves. Other ids are omitted, not refused, so a stale list never errors.
- League-mate: an active membership of the caller's current-season team and of the target team in
  the same league (`app.fantasy_league_memberships`, `status = 'active'`; indexes
  `fantasy_league_memberships_user_idx` and the `(league_id, fantasy_team_id)` unique key).
- Deleted-pending profiles: omitted (the Pronostics behaviour), never the renamed row.
- Never returned to anyone: a user id, an e-mail, an avatar, a raw value, an ingredient, an
  acknowledgement of someone else.
- Other managers' numbers and founder marks are shown to those readers (section plan 11.7).

---

## 11. RPC reference

Every function: `security definer`, `set search_path = ''`, arguments of `pg_catalog` types only,
`revoke all … from public`, then the grants named. Errors use `PT400/401/403` with snake_case
messages; PostgREST answers 400/401/403. Each signed-in function checks the switch first (an "off"
answer reads nothing about the caller), then runs `perform app_private.assert_mfa_step_up();`
(`PT403 mfa_required`), then reads `(select auth.uid())`.

### 11.1 `api.manager_card_status() returns jsonb`

Section 7.2. `stable`. Grants `anon, authenticated, service_role`. Never raises.

### 11.2 `api.get_my_manager_card() returns jsonb`

`stable`. Grants `authenticated, service_role`.

1. Off → `{"available": false}`.
2. Step-up. No caller → `PT401 unauthenticated`.
3. No current-season team, or `deleted_at` set → `{"available": true, "card": null}`.
4. Else `{"available": true, "card": <myCard>}` from `app_private.manager_card_my_card_json(uid)`.

`myCard`, field by field (section plan 7.2 `myCardSchema`):

| Field                      | Type                                                                          | Source                                                                                                                                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `teamId`                   | uuid                                                                          | the caller's current-season `fantasy_teams.id`                                                                                                                                                          |
| `name`                     | string                                                                        | 5.4                                                                                                                                                                                                     |
| `handle`                   | string \| null                                                                | `profiles.username`                                                                                                                                                                                     |
| `season`                   | `{id, label}`                                                                 | current fantasy season id; 5.4 label                                                                                                                                                                    |
| `serial`                   | `^[1-9][0-9]{5}$` \| null                                                     | `manager_cards.serial::text`                                                                                                                                                                            |
| `founder`                  | `{cohort, grantedAt, cutoffDate}` \| null                                     | card's cohort and `founder_granted_at`; the grant row's `cutoff_date` (`YYYY-MM-DD`)                                                                                                                    |
| `club`                     | club \| null                                                                  | 5.3                                                                                                                                                                                                     |
| `ratingState`              | `forming\|insufficient\|provisional\|rated`                                   | 4.4                                                                                                                                                                                                     |
| `ovr`                      | 1–99 \| null                                                                  | season row                                                                                                                                                                                              |
| `ovrNullReason`            | `pending_minimum\|too_few_stats` \| null                                      | season row; `pending_minimum` with no season row                                                                                                                                                        |
| `tier`                     | tier \| null                                                                  | season row                                                                                                                                                                                              |
| `bestTier`                 | tier \| null                                                                  | season row (this season, N13)                                                                                                                                                                           |
| `nextTier`                 | `{code, fromOvr}` \| null                                                     | 4.4                                                                                                                                                                                                     |
| `provisional`              | boolean                                                                       | season row; false without one                                                                                                                                                                           |
| `stats`                    | `{cap, sel, trf, con}` each `{value, nullReason}`                             | season row, with the live TRF reason (4.5); every stat `{null, "pending_minimum"}` without a season row                                                                                                 |
| `gameweeksCounted`         | integer ≥ 0                                                                   | season row; 0 without one                                                                                                                                                                               |
| `minRated`, `minConfirmed` | positive integers                                                             | active rules                                                                                                                                                                                            |
| `rulesVersion`             | string \| null                                                                | season row                                                                                                                                                                                              |
| `throughGameweekSeq`       | integer \| null                                                               | season row                                                                                                                                                                                              |
| `calculatedAt`             | timestamp \| null                                                             | season row                                                                                                                                                                                              |
| `firstCountedGameweekSeq`  | integer \| null                                                               | season row («Depuis la J5»)                                                                                                                                                                             |
| `firstRatedGameweekSeq`    | integer \| null                                                               | season row                                                                                                                                                                                              |
| `ratingGameweeks`          | integer[] \| null                                                             | while `forming` only: the first `minRated` non-cancelled gameweek sequences of the season from the team's first counted gameweek, or its first lineup's gameweek before that; only gameweeks that exist |
| `ratingGameweeksComplete`  | boolean                                                                       | `ratingGameweeks` is not null and holds `minRated` entries                                                                                                                                              |
| `previousSeason`           | `{label, ovr, tier}` \| null                                                  | the most recent closed season row other than the current season's                                                                                                                                       |
| `seasonClosed`             | boolean                                                                       | current season row's `closed_at` is not null                                                                                                                                                            |
| `seasons`                  | array of `{seasonId, label, ovr, tier, bestTier, gameweeksCounted, closedAt}` | every season row, newest season first                                                                                                                                                                   |
| `createdAt`                | timestamp \| null                                                             | `manager_cards.created_at`; null without a card row                                                                                                                                                     |
| `moments`                  | array                                                                         | section 6                                                                                                                                                                                               |

**Forming answer.** With no card row and/or no current season row, the card is still returned from
what exists: `ratingState: "forming"`, `gameweeksCounted: 0`, numbers and founder from the card row
when it exists (else null), `createdAt` null without a card row, `moments` holding `card_created`
while pending.

Budget: p95 ≤ 150 ms end to end, database time ≤ 40 ms (the user's rows: one card, a few seasons,
≤ 40 history rows per season, a few acks).

### 11.3 `api.get_manager_cards(p_team_ids uuid[]) returns jsonb`

`stable`. Grants `authenticated, service_role`.

1. Off → `{"available": false}`.
2. Step-up; no caller → `PT401 unauthenticated`.
3. `p_team_ids` null, containing a null, or longer than 100 → `PT400 manager_card_invalid_team_ids`.
   An empty array → `{"available": true, "cards": []}`. Duplicates collapse.
4. `{"available": true, "cards": [...]}` for the visible teams (section 10), in the order of first
   occurrence in `p_team_ids`.

`memberCard` (section plan `memberCardSchema`):

| Field                        | Source                                             |
| ---------------------------- | -------------------------------------------------- |
| `teamId`                     | the team                                           |
| `name`                       | 5.4 (display name or team name)                    |
| `club`                       | 5.3 for the team's owner                           |
| `serial`                     | card number as text, or null                       |
| `founderCohort`              | integer or null                                    |
| `seasonLabel`                | current season label                               |
| `ratingState`                | 4.4 (`forming` without a card or season row)       |
| `ovr`, `tier`, `provisional` | season row, else null, null, false                 |
| `stats`                      | `{cap, sel, trf, con}` values only, null when null |
| `gameweeksCounted`           | season row, else 0                                 |
| `minRated`                   | active rules                                       |
| `firstRatedGameweekSeq`      | season row, else null                              |

Budget: p95 ≤ 300 ms end to end for 100 ids, database time ≤ 80 ms.

### 11.4 `api.get_my_manager_card_history(p_season_id uuid default null, p_before_seq integer default null, p_limit integer default 20) returns jsonb`

`stable`. Grants `authenticated, service_role`.

1. Off → `{"available": false}`.
2. Step-up; no caller → `PT401 unauthenticated`.
3. `p_limit` not in 1–40, or `p_before_seq < 1` → `PT400 manager_card_invalid_history_query`.
4. Season = `p_season_id`, else the current season. Rows of the caller in that season with
   `gameweek_seq < p_before_seq` (all when null), newest first, `p_limit` of them.
5. `{"available": true, "items": [...], "nextBeforeSeq": <last item's seq if more rows exist, else null>}`.
   A season the caller never played, or a deleted-pending caller: `items: []`, `nextBeforeSeq: null`.

`historyRow`: `seasonId`, `seasonLabel`, `gameweekSeq`, `ovr`, `tier`, `provisional`,
`gameweeksCounted`, `stats {cap, sel, trf, con}` (values), `calculatedAt`.

Budget: ≤ 20 ms (the unique key `(user_id, fantasy_season_id, gameweek_seq)`).

### 11.5 `api.ack_manager_card_moments(p_keys text[]) returns jsonb`

`volatile`. Grants `authenticated, service_role`; never `anon`.

1. `p_keys` null or empty, longer than 16, or any key failing the key check of 3.11 →
   `PT400 invalid_moment_key`. Duplicates collapse.
2. Off → `{"acknowledged": [], "ignored": <all keys>}`. Nothing written.
3. Step-up; no caller → `PT401 unauthenticated`.
4. Deleted-pending → everything ignored, nothing written.
5. Insert the derivable keys (6.4) `on conflict do nothing`.
6. `{"acknowledged": [keys now on record], "ignored": [the rest]}`, each in request order.

Budget: ≤ 30 ms. HTTP 200 in every case but malformed input, unauthenticated or the step-up.

### 11.6 Error summary (section plan 7.5)

| Code       | Message                                                                                     | Client code       |
| ---------- | ------------------------------------------------------------------------------------------- | ----------------- |
| `PT400`    | `manager_card_invalid_team_ids`, `manager_card_invalid_history_query`, `invalid_moment_key` | `invalid_request` |
| `PT401`    | `unauthenticated`                                                                           | `unauthenticated` |
| `PT403`    | `mfa_required` (the step-up helper)                                                         | `mfa_required`    |
| `PGRST202` | the function does not exist yet                                                             | `unavailable`     |
| HTTP 200   | `{"available": false}`                                                                      | `unavailable`     |

No RPC answers `PT404` or `PT409`.

---

## 12. Migrations

Proposed slots, after main's latest (`20261006143700`). Before the first push and again before
marking the PR ready, re-check main and every open PR (section 15, BWP0). If any slot ≥
`20261009100000` is taken, move all six to the next free slots, keeping their order and the 100-second
gaps. `bun run backend:migrations:check` must pass.

| #   | File                                               | Contents                                                                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `20261009100000_manager_card_schema.sql`           | `app_private.manager_card_rules_valid`; the tables of 3.2–3.11 with constraints, indexes, comments, RLS forced, `revoke all`; the settings row (all off); triggers `manager_card_rules_guard`, `manager_cards_guard`, `set_updated_at`, and the acks' statement step-up trigger. No rules row.                                                    |
| 2   | `20261009100100_manager_card_club.sql`             | `app.team_translations.city` (3.12); `app_private.manager_card_club_id`, `app_private.manager_card_club_json`, `app_private.manager_card_season_label`, `app_private.manager_card_current_season`.                                                                                                                                                |
| 3   | `20261009100200_manager_card_compute.sql`          | `manager_card_scale`, `manager_card_tier`, `manager_card_serial_allowed`, `manager_card_gameweek_facts`, `manager_card_evaluate_batch`, `manager_card_assign_serials`, `manager_card_close_seasons`, `manager_card_tick`, `manager_card_configure`, `manager_card_activate_rules`, `manager_card_grant_founders`. Every function `postgres`-only. |
| 4   | `20261009100300_manager_card_api.sql`              | `app_private.manager_card_moments`, `manager_card_my_card_json`, `manager_card_member_json`, `manager_card_preview`, `manager_card_report`; the five `api` functions with grants and comments.                                                                                                                                                    |
| 5   | `20261009100400_manager_card_jobs_and_health.sql`  | The two `cron.schedule` calls (8.2); `ops_health_checks` renamed to `ops_health_checks_before_manager_card` and wrapped (8.5); grants of both to `postgres` only.                                                                                                                                                                                 |
| 6   | `20261009100500_manager_card_account_deletion.sql` | The guarded find-and-replace of `account_deletion_erase` (section 9).                                                                                                                                                                                                                                                                             |

**Why this order.** Tables first, because everything references them. The club and season helpers
next, because both compute and the API use them and they touch an existing table
(`team_translations`), which keeps that change reviewable alone. Compute before the API, because the
API's builders read what compute writes and call its helpers. The cron jobs only once the tick
exists, and the health wrapper after the latest existing wrapper (`20261006143700`). The deletion
patch last: it depends on `20261006143700` and on the tick's lock key, and a failed anchor check
stops the whole apply, which runs the six in one transaction.

**Nothing writes an existing row**, except the new nullable column on `app.team_translations` (no
data) and the replaced `account_deletion_erase` and `ops_health_checks`.

**The apply script** `scripts/backend/apply-20261009100000-manager-card.sql` (model
`apply-20261006143700-account-deletion-automatic.sql`), with its bun test
`apply-manager-card-script.test.ts`:

- Preflight: `20261005130000`, `20261006143700` and the last repository migration before
  `20261009100000` are recorded; none of the six is; no `manager_card` table, function or cron job
  exists; `app.team_translations` has no `city`; the erase function contains the anchor exactly once;
  the functions it builds on exist (`assert_mfa_step_up`, `refuse_unverified_mfa_actor`,
  `set_updated_at`, `ops_health_checks`, `account_deletion_erase`).
- Records each migration whole and runs it once its sha256 matches the repository file.
- Postflight: every table RLS-forced with no grant; the status executable by `anon`, the four others
  by `authenticated` and not `anon`, the ack not by `anon`; every `app_private` card function
  `postgres`-only; settings one row, all off; no rules row; both jobs scheduled as reviewed; the tick
  answers `{"outcome": "off"}` and `last_tick_at` stays null; the status answers
  `{"enabled": false, "minRated": null, "minConfirmed": null}`; the health check `manager_card` is
  `ok`; the erase function contains the new lock.
- `notify pgrst, 'reload schema';` then `rollback;` as shipped (rehearsal).

Two more owner-run scripts, each a rehearsal by default with its bun test:
`scripts/backend/manager-card-rules-v1.sql` (inserts and activates v1; refuses while any value is
still the placeholder sentinel; refuses unless the six migrations are recorded) and
`scripts/backend/manager-card-founder-grant.sql` (calls the grant with `p_apply => false`, prints the
counts, and with the documented edit, `p_apply => true`). One read-only script:
`scripts/backend/manager-card-calibration-read.sql` (section 14.3).

---

## 13. Tests, CI, types and the contract test

### 13.1 pgTAP files (`supabase/tests/database/`)

House style: `begin; select extensions.plan(N); … select * from extensions.finish(); rollback;`,
`extensions.is` / `extensions.ok`, helpers `pg_temp.id(n)` and `pg_temp.act(uuid, aal)` (set
`request.jwt.claims`), rules inserted inside the test's transaction.

| File                               | Proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manager_card_schema.test.sql`     | Every table: RLS enabled and forced, no privilege for `anon`, `authenticated`, `service_role`; constraints (number range, leading zero impossible, null pairings, tier codes, null reasons, the ack key check rejects `first_rating:not-a-uuid`, `tier_changed:homa`, `founder_granted:x`); the number and founder cannot change once set; rules cannot be edited or deleted once activated; one active rules row; every foreign-key column leads an index; deleting a profile removes its card, seasons, history and acks; deleting a Fantasy team removes its season and history rows; once a season's teams are gone (as the restage script removes them), `api.service_rollback_fantasy_catalog` still completes with card and ledger rows present, and the ledger rows cascade away.                                                                                                                                                                                                                                                                                                                 |
| `manager_card_compute.test.sql`    | Hand-computed fixtures for each stat, OVR, tier, provisional and rating state (section 4.8 reproduced exactly); every row of 4.9 (double gameweek, cancelled gameweek in a TRF window, Bench Boost, Free Hit, Wildcard, Triple Captain, vice promotion, both captains at 0, negative score, `pre_captain_fix` with the default rule, window at season end, reversed batch, no transfers, blank week, inconsistent captain points); null reasons and precedence (4.5); `off`, `no_rules` and `busy` write nothing; a second run changes nothing (`xmin` of every card row unchanged); a version bump re-evaluates from that gameweek; a rules activation re-evaluates everything; deleted-pending skipped; no Fantasy row written (counts and `xmin` of the Fantasy tables before and after); card rows created within one run; numbers random, allowed, unique and absent while `serials_enabled` is off; a number never issued twice; founder grant: dry run writes nothing, apply grants once, a second grant refused, cut-off in the future refused, staff and `@botolago.com` excluded; season close. |
| `manager_card_api.test.sql`        | Status: callable by `anon`; exactly three keys; `enabled` false off, false with read on and no rules, true with both; minimums from rules. Each card read: `{available: false}` while off; `PT401` anonymous; `PT403 mfa_required` for an aal1 account with a verified factor; `card: null` with no team; forming answer; the **exact key sets** of `myCard`, `stats`, each stat, `club`, `founder`, each `seasons` item, each moment kind, `memberCard`, `historyRow`, and of each response envelope (sorted arrays compared with `extensions.is`); name rule (display name, blank → team name); handle null; club resolved by `favorite_team_id`, by a uuid reference, by a slug reference, null when unresolved, `city` null unless both languages; season label `2026/27`; batch: 100 accepted, 101 refused, nulls refused, empty answers `[]`, league-mates and self only, deleted-pending and other seasons omitted, order kept; history keyset paging and `nextBeforeSeq`; limit 41 refused; cross-user denial (no way to read another user's own card or history).                                |
| `manager_card_moments.test.sql`    | Derivation fixtures: `first_rating` at the lowest rated row, not at the third counted row when OVR stays null there; `provisional_cleared`; `tier_changed` only for a tier first reached by a rise, only while held at or above; never for `homa`, the first-ever rating or a fall; HOMA → PRO yields only `pro`; `founder_granted` absent before the grant; `season_closed`, `season_started`; earlier seasons' `first_rating` not returned; a correction re-evaluation creates no second moment and does not reopen an acknowledged one. Acks: idempotent; a batch; 17 keys refused; malformed refused; founder before the grant ignored (not an error); off → all ignored, nothing written; anonymous refused; deleted-pending ignored; aal1 with a factor refused by the step-up and by the table trigger; a caller writes only their own rows.                                                                                                                                                                                                                                                       |
| `manager_card_operations.test.sql` | Both jobs scheduled with the exact schedule and command; the prune deletes only old tick rows and old `cron.job_run_details` of the tick, never a card table; the health check at each ok / warn / fail boundary; display-only guard: no function outside the card's own, `account_deletion_erase` and `ops_health_checks` references a `manager_card` table (catalog search on `prosrc`); no function deletes from `app_private.manager_card_serials`; erasure (section 9).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

### 13.2 Existing tests to update (each in the same commit as the change it follows)

| File                                                     | Change                                                                                                                                          |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `ordinary_account_mfa_step_up_reads.test.sql:412–413`    | 77 → **81**; description gains ", and the four Manager Card functions (20261009100300) run it". The status function is not counted (no caller). |
| `ordinary_account_mfa_step_up.test.sql:136–160`          | 26 → **27**; `'app.manager_card_moment_acks'` inserted after `'app.followed_teams'` (the list is sorted `collate "C"`).                         |
| `account_deletion_automatic.test.sql:195–203`            | `'botolago:manager-card-tick'` added to the key array; description "…, prize and Manager Card writers".                                         |
| `ops_health_fantasy_coverage_and_scoring.test.sql:33–39` | `'manager_card'` appended after `'account_deletion'`; description notes `20261009100400`.                                                       |

### 13.3 How CI runs them

`database-quality` (pull requests only): `backend:db:start`, `backend:db:reset` (applies every
migration from zero), `backend:db:test` (every pgTAP file), the opt-in DB tests by env var,
`backend:db:lint`, then `backend:types:check`. It is the only place pgTAP runs: open the draft PR as
soon as the first schema commit is pushed. A local run is not evidence to report; a green
`database-quality` run, linked, is.

### 13.4 The contract test (mock fixtures and real DTOs in step)

Two layers, so a shape change fails in CI on whichever side moved:

1. **pgTAP key sets** (`manager_card_api.test.sql`, above) pin every DTO's keys to section 7.2. They
   live with the migrations and run in every `database-quality` run.
2. **`scripts/backend/manager-card-contract-e2e.test.ts`**, opt-in by
   `MANAGER_CARD_E2E_DB_URL` (the `pepites-weekly-email-e2e.test.ts` pattern, `Bun.SQL`), added as a
   `database-quality` step after the pgTAP suite with
   `MANAGER_CARD_E2E_DB_URL: postgres://postgres:postgres@127.0.0.1:55322/postgres`. It seeds, under
   fresh random ids, a season, gameweeks with postwork, two managers in a private league, results,
   transfers and an acknowledgement; inserts and activates a rules version, runs the tick as
   `postgres`, switches reads on; then calls each RPC as each manager
   (`set_config('request.jwt.claims', …)` with `aal2`) and:
   - parses every answer with the client's own zod schemas imported from
     `src/backend/manager-card/contracts.ts` (`myCardResponseSchema`, `cardsResponseSchema`,
     `historyResponseSchema`, `ackResponseSchema`, `managerCardStatusSchema`);
   - compares the recursive key set of each real DTO with the matching development fixture in
     `src/backend/manager-card/fixtures.ts` (`rated` for a rated card, `forming1`, a league member,
     a history row, each moment kind present);
   - restores the switches afterwards.

   **Where it lands.** The file imports the front end's contract, which lives on
   `claude/manager-card-section`, while the backend PR branches from `main`. So it lands in
   **whichever PR merges second**, after that branch merges `main` by merge commit. WP1's source scan
   that forbids static imports of `fixtures.ts` must allow `*.test.ts` under `scripts/backend/`
   (cross-lane note for the front end).

### 13.5 Bun tests in the backend PR

- `apply-manager-card-script.test.ts`, `manager-card-rules-v1-script.test.ts`,
  `manager-card-founder-grant-script.test.ts`: byte-for-byte migration, sha256, rehearsal only, every
  guard present, never switches anything on.
- `scripts/backend/manager-card-tick-bench.test.ts`, opt-in by `MANAGER_CARD_BENCH_DB_URL` (local
  only, not in CI): a synthetic fixture of 50,000 teams and 8 gameweeks; records the time per batch
  and per gameweek for the PR description.

### 13.6 Generated types

`src/backend/generated/database.types.ts` changes (five `api` functions; the new column is in `app`,
also generated). Regenerate with `bun run backend:types:generate` against a local stack. Without
Docker: when "Verify generated database types" fails, take CI's artifact
(`gh run download <run_id> -n generated-database-types-<run_id>`) within the day, commit it
unedited, re-push. Never hand-edit it and never generate it from a remote project. After both PRs
merge, the front end removes its one untyped `rpc` cast (`supabase-repository.ts`) in a follow-up.

---

## 14. Rollout runbook

To be written up as `docs/backend/MANAGER_CARD_OPERATIONS_RUNBOOK.md` (model
`PREDICTIONS_OPERATIONS_RUNBOOK.md`). Every step below that writes is the owner's, in the SQL editor
or by a workflow the owner dispatches, after the AGENTS.md "Before writing" checks.

### 14.1 Prerequisites

1. **[verify]** Production has `20261005130000` and `20261006143700` (read-only:
   `select version from supabase_migrations.schema_migrations where version in ('20261005130000', '20261006143700');`).
   If not, apply them first (PR #359's script, then `apply-20261006143700-…`).
2. PR #376 (captain choice) merged and published; its live time becomes `cap_counts_from`.
3. The privacy line (D20) published.
4. The owner's answers of section 1.4.

### 14.2 Staging first (`srdrflfrfpwixsllveid`)

1. Check nothing else writes staging (the load-test workflows share the `phase6-staging-load-test`
   group).
2. The owner dispatches **Staging database update** (`plan`, then `rehearse`, then `apply`).
3. Insert rehearsal rules `v0` with the example numbers of 4.8 and activate them; turn serials and
   compute on; watch the tick catch up (`select jsonb_pretty(app_private.manager_card_report());`).
4. Read a few cards with `app_private.manager_card_preview(<user id>)`; turn reads on; run the RPCs
   as a test account; time them with `explain (analyze, buffers)`; optionally point a development
   build (`VITE_MANAGER_CARD_DATA_MODE=supabase`) at staging.
5. Erase a test account with a card through the deletion runbook's path; check the cascade and the
   retired number.
6. Switch reads and compute off again.

### 14.3 Production (`tkewgajrljbwgwedqsxn`), in order

1. **Merge** the backend PR (owner). The front end, if already merged, is unaffected: its build
   constant is false, and its status read finds the function but `enabled: false`.
2. **Apply**: `scripts/backend/apply-20261009100000-manager-card.sql`, rehearsal, then `commit;`.
   Everything off, no rules.
3. **Club check** (read, owner's leave), aggregate only:

   ```sql
   select count(*) filter (where favorite_team_id is not null) as by_id,
          count(*) filter (where favorite_team_provisional_ref is not null) as by_reference,
          count(*) filter (where favorite_team_provisional_ref is not null
            and app_private.manager_card_club_id(user_id) is null) as unresolved
   from app.user_preferences;
   ```

   Launch needs `unresolved = 0` (or each one explained).

4. **Calibrate** (read, owner's leave): `scripts/backend/manager-card-calibration-read.sql` runs
   `manager_card_gameweek_facts` over every evaluable gameweek of the season in a read-only
   transaction and returns, per raw stat over teams with `K ≥ 3`: n, min, p1, p5, p10, p25, p50,
   p75, p90, p95, p99, max. No ids. A second call with candidate scales returns the OVR distribution,
   to set the tier thresholds at the D9 shares. Needs enough final gameweeks to be meaningful (the
   owner decides; the numbers are frozen afterwards).
5. **Rules v1**: fill `scripts/backend/manager-card-rules-v1.sql` with the chosen numbers,
   `cap_counts_from` and a calibration note; rehearsal, then `commit;`.
6. **Numbers on** (after D14 and D15): `select app_private.manager_card_configure(null, null, true);`
7. **Compute on**: `select app_private.manager_card_configure(true, null);`. Watch the report until
   every evaluable gameweek is completed and every current-season team has a card and a number.
8. **Founder** (after the cut-off has passed; may come after launch):
   `scripts/backend/manager-card-founder-grant.sql`, dry run, then apply.
9. **App switch**: the owner flips `MANAGER_CARD_ENABLED` to `true` in a one-line commit and
   publishes in Lovable. This can happen before or after step 10; nothing shows until step 10
   (section plan 3.6).
10. **Read switch on = launch**: `select app_private.manager_card_configure(null, true);`. Within
    about a minute (the server memo), new page loads show Gradins and Pépites inside Fantasy; CDN
    pages follow within their cache lifetime.

Switching reads on before step 7 has finished would show launch-day managers « 0/3 » and then a jump.

### 14.4 Rollback

| Goal                     | Action                                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Hide the section         | `select app_private.manager_card_configure(null, false);` (status off within a minute; open sessions flip on the next card read) |
| Stop computing           | `select app_private.manager_card_configure(false, null);`                                                                        |
| App-level rollback       | `MANAGER_CARD_ENABLED = false`, republish                                                                                        |
| Bad numbers in the rules | A new version (`v2`) and `manager_card_activate_rules('v2')`; never edit v1                                                      |
| Remove card data         | A reviewed forward migration; never needed to hide the section                                                                   |

Turning reads off keeps the acknowledgements; turning them on again resumes where people left off.

### 14.5 Monitoring

- The `manager_card` health check (8.5), paged on `fail`; `cron_jobs` for failed runs.
- `app_private.manager_card_report()` after each gameweek for the first weeks.
- Read latency: `pg_stat_statements` for the five functions (owner's read) against the budgets of
  section 11.
- The app's own error sink (`browser_errors`) for card-read failures.
- Measurement of acknowledgements: aggregate counts per key per week only (the owner's read); never
  rows with user ids.

---

## 15. Work packages for the backend session

Branch: the session's own, or `agent/BG-0158-manager-card-backend`, from `main`. Commits
`BG-0158: <summary>`. One draft PR, opened at the first schema commit. Merge `main` in by merge
commit only; never rewrite pushed history.

| WP       | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Commits                                                                                                                       | Done when                                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **BWP0** | Phase 0. Re-read section 2 against current `main`; list open PRs and their migrations (REST, section 18); confirm the slots and BG-0158; send the owner section 1.4's list plus: "You said Codex already did backend work. I found no Manager Card backend on any branch, PR or commit as of <date>. Is there unpushed Codex work on the card, and is any Codex agent writing to staging or production now?" and "Are 20261005130000 and 20261006143700 applied on production?" | none                                                                                                                          | The message is sent; a short note of what differs from this plan. Continue with BWP1–BWP2 meanwhile; BWP3 onward on the defaults unless the owner says stop. |
| **BWP1** | Migration 1 and `manager_card_schema.test.sql`; the step-up trigger count update; the engineering brief `docs/engineering/tasks/BG-0158/engineering-brief.yaml` and the ledger entry.                                                                                                                                                                                                                                                                                           | `BG-0158: Manager Card tables, switches and ledgers`; `BG-0158: engineering brief and ledger`                                 | Draft PR open; `backend:migrations:check` passes; `database-quality` green on the schema tests.                                                              |
| **BWP2** | Migration 2 and its pgTAP cases (club, label, current season).                                                                                                                                                                                                                                                                                                                                                                                                                  | `BG-0158: club, city and season helpers`                                                                                      | Club cases green in CI.                                                                                                                                      |
| **BWP3** | Migration 3 and `manager_card_compute.test.sql`; the bench test; measure and record batch times.                                                                                                                                                                                                                                                                                                                                                                                | `BG-0158: card computation and the tick`; `BG-0158: tick bench`                                                               | Every fixture of 4.8 and row of 4.9 green in CI; second run changes nothing; bench numbers in the PR.                                                        |
| **BWP4** | Migration 4; `manager_card_api.test.sql`, `manager_card_moments.test.sql`; the step-up reads count.                                                                                                                                                                                                                                                                                                                                                                             | `BG-0158: Manager Card read API and moments`                                                                                  | Key sets equal section 7.2; denial, off, forming, moments and ack cases green in CI.                                                                         |
| **BWP5** | Migrations 5 and 6; `manager_card_operations.test.sql`; the deletion and health test updates.                                                                                                                                                                                                                                                                                                                                                                                   | `BG-0158: tick schedule and health check`; `BG-0158: account deletion covers the card`                                        | Jobs, prune, health and erasure cases green; the four existing tests updated and green.                                                                      |
| **BWP6** | Generated types; the contract e2e test file (lands now only if `src/backend/manager-card/contracts.ts` is on `main`, else handed to the front-end lane, section 13.4) and its CI step.                                                                                                                                                                                                                                                                                          | `BG-0158: generated database types`; `BG-0158: contract test` (if it lands here)                                              | `backend:types:check` green in CI.                                                                                                                           |
| **BWP7** | Scripts: the apply script, rules v1 template, founder grant, calibration read, their bun tests. Docs: `MANAGER_CARD_OPERATIONS_RUNBOOK.md`, `ACCOUNT_DELETION_RUNBOOK.md`, `docs/operations/ALERTS.md` row.                                                                                                                                                                                                                                                                     | `BG-0158: guarded apply and owner scripts`; `BG-0158: operations runbook`; `BG-0158: account deletion runbook names the card` | `bun run test` green; scripts never run against any remote database.                                                                                         |
| **BWP8** | AGENTS.md entry (section 16), its own commit. PR description: decisions and the owner's answers, what ships off, evidence (each command and where it ran, links to green runs, what did not run), the production order, the owner's actions in order.                                                                                                                                                                                                                           | `BG-0158: AGENTS.md lists the Manager Card job`                                                                               | Both `backend-quality` jobs green, linked. Stop and wait: no merge, apply, deploy or publish.                                                                |

---

## 16. AGENTS.md, CLAUDE.md and docs updates (text to add, not applied here)

### 16.1 AGENTS.md, "Check the scheduled jobs too", after the `account-deletion-tick` entry

Indent every line by three spaces when pasting, like the other entries of item 3 there. It goes
below the `LOVABLE:END` marker, as everything agents add to that file does.

```markdown
Where migration 20261009100400 is applied, pg_cron also runs
`manager-card-tick` every 15 minutes (at minutes 4, 19, 34 and 49). It
creates Manager Card rows and their numbers for the current season's
managers and computes the cards from final Fantasy results. It writes only
`app.manager_cards`, `app.manager_card_seasons`, `app.manager_card_history`
and its own records in `app_private` (the number ledger, the gameweek
ledger, the job log, the settings' last-run columns); it reads Fantasy,
identity and football tables and never writes them. It writes only while
compute is switched on in `app_private.manager_card_settings` and an active
rules row exists
([MANAGER_CARD_OPERATIONS_RUNBOOK.md](docs/backend/MANAGER_CARD_OPERATIONS_RUNBOOK.md)).
Pause it with `select app_private.manager_card_configure(false, null);`
before a write that touches those tables, deletes a Fantasy team or rolls
back a Fantasy catalog, and switch it back on afterwards with
`select app_private.manager_card_configure(true, null);`. Its companion
`manager-card-history-prune` runs daily at 03:47 UTC whatever the switch: it
deletes `manager-card-tick` rows older than 7 days from
`cron.job_run_details` and tick rows older than 180 days from
`app_private.manager_card_job_log`, never a card table. Pause it by name for
a write that touches those tables, then set it back to `true`:
`select cron.alter_job((select jobid from cron.job where jobname = 'manager-card-history-prune'), active := false);`
The founder grant (`app_private.manager_card_grant_founders`) and a rules
activation have no schedule; each is a write the owner runs by hand.
```

### 16.2 AGENTS.md, offered as a separate commit (not this feature's)

The list omits five jobs main schedules (`ops-alert-tick`, `notification-push-tick`,
`ai-content-generate`, `news-publish-due-editions-history-prune`, `notification-email-history-prune`)
and says 15 minutes for `football-live-refresh`, which runs every minute since `20260924200500`.
Offer the owner a separate commit; do not mix it into BG-0158.

### 16.3 CLAUDE.md

No change. Its "Production database writes" already covers every card write on production
(configure, rules, founder grant, apply), each authorised one operation at a time.

### 16.4 Other docs

- `docs/backend/ACCOUNT_DELETION_RUNBOOK.md`: section 9's three edits.
- `docs/operations/ALERTS.md`: a `manager_card` row in "The database's checks".
- `docs/backend/MANAGER_CARD_OPERATIONS_RUNBOOK.md`: new; section 14, the report, pausing, the
  aggregate-only measurement rule.

---

## 17. Section 10 of the section plan: where each item is answered

| #   | Item                                         | Here                                     |
| --- | -------------------------------------------- | ---------------------------------------- |
| 1   | camelCase DTOs exactly as 7.2                | 11.2–11.5; key sets pinned in 13.1, 13.4 |
| 2   | Off is HTTP 200 `{available: false}`         | N1, 7.1, 11                              |
| 3   | Ack ignores, `{acknowledged, ignored}`       | N2, 6.4, 11.5                            |
| 4   | `card: null`; `teamId`                       | N3, 11.2                                 |
| 5   | Club resolution, a launch prerequisite       | N4, N5, 5.3, 14.3 step 3                 |
| 6   | `firstCountedGameweekSeq`                    | 3.9, 11.2                                |
| 7   | `seasons[]`                                  | 11.2                                     |
| 8   | History read                                 | 11.4                                     |
| 9   | Batch read with forming answer and omissions | 10, 11.3                                 |
| 10  | Status, `STABLE`, cheap, anonymous           | 7.2, 11.1                                |
| 11  | Latency targets                              | N16, 11, 14.5                            |
| 12  | Moments' values                              | 6.2                                      |
| 13  | No write path but the ack                    | 6.5                                      |
| 14  | Privacy line covers names and numbers        | D20, 14.1                                |
| 15  | Launch runbook lists the app's flip          | 14.3 steps 9–10                          |

---

## 18. Ready-to-paste prompt for the backend session

```text
You are the backend session for the BotolaGO Manager Card, shipping as the Gradins section, in
mrdata007/botolago-foundation. Your plan is docs/backend/MANAGER_CARD_BACKEND_PLAN.md on branch
claude/manager-card-section (read it with `git show origin/claude/manager-card-section:docs/backend/MANAGER_CARD_BACKEND_PLAN.md`
if your checkout is main). It supersedes design-lab/manager-cards-claude/BACKEND_HANDOFF.md. Build
exactly what it says; where you find it wrong, stop and report rather than improvise.

MISSION
Build the server side of the Manager Card: six migrations (plan section 12), the tick and its prune,
the health check, account-deletion coverage, five RPCs returning exactly the DTOs of
docs/product/MANAGER_CARD_SECTION_PLAN.md section 7.2, pgTAP and bun tests, regenerated types, the
guarded apply script and owner scripts, the operations runbook and the AGENTS.md entry. Everything
ships switched off, with no rules row. End state: one DRAFT pull request to main, both
backend-quality jobs green and linked. Then stop.

HARD RULES (AGENTS.md and CLAUDE.md load automatically; these are the parts that bind you)
1. No production write on your own initiative, ever. Production (tkewgajrljbwgwedqsxn) changes only
   through a guarded script the owner runs. Do not read staging or production either without the
   owner's leave naming the project and the read.
2. One writer per database. You write only to your own local stack, and only after `docker ps` shows
   no other session on it. Never run anything against staging (srdrflfrfpwixsllveid) or production;
   never touch legacy kxpaudvntwxpahyjtxbk.
3. Tools you do not reach for without the owner's prior approval naming the project and the
   operation: Supabase MCP apply_migration, execute_sql (read-only included), deploy_edge_function,
   any *_branch tool, generate_typescript_types against a remote project; Lovable MCP send_message,
   deploy_project, query_database; GitHub merge_pull_request, actions_run_trigger or any workflow
   dispatch.
4. Draft pull request only. No merge, no migration apply, no Edge Function deploy, no Lovable
   Publish without the owner.
5. Migrations are forward-only with unique timestamps (`bun run backend:migrations:check`). Before
   the first push and before marking anything ready, re-check main and every open PR for slots at or
   after 20261009100000. `gh pr list` fails here; use
   `gh api 'repos/mrdata007/botolago-foundation/pulls?state=open&per_page=100' --jq '.[].number'`
   and `gh api 'repos/mrdata007/botolago-foundation/pulls/<n>/files?per_page=100&page=<p>' --jq '.[].filename'`.
6. Never rewrite pushed history (the repository syncs to Lovable). Bring main in by merge commit only.
7. The card only reads Fantasy data. It writes no Fantasy, prize, ranking or identity table, and
   nothing reads a card, an OVR, a tier, a number or an acknowledgement for any rule, prize or
   ranking. Business rules stay as they are.
8. Do not edit the front end's files (src/backend/manager-card/*, src/components/manager-card/*,
   src/components/gradins/*, src/routes/gradins*, src/services/manager-card*): another lane owns them.
9. Evidence (CLAUDE.md): never claim a check you did not run. Without Docker, pgTAP and type checks
   run only in CI's database-quality job: open the draft PR at the first schema commit and link
   green runs. For types, take CI's generated-database-types-<run_id> artifact within the day and
   commit it unedited; never hand-edit the file.

READING LIST, IN ORDER
1. docs/backend/MANAGER_CARD_BACKEND_PLAN.md (all of it).
2. docs/product/MANAGER_CARD_SECTION_PLAN.md sections 3, 7 and 10.
3. AGENTS.md, CLAUDE.md, PRODUCT.md (~220–260).
4. supabase/migrations/20261006143700_account_deletion_automatic.sql and
   scripts/backend/apply-20261006143700-account-deletion-automatic.sql with its test (templates for
   switch, tick, prune, health wrapper, apply script).
5. supabase/migrations/20261005130000_fantasy_public_recaps.sql, 20260926120000_pepites_api.sql
   ({available:false}), 20260926100000_pepites_editions.sql (tick with subtransactions and job log).
6. supabase/migrations/20260720141826, 20260720141847, 20260720141850, 20260720163222 (rankings,
   position rules), 20260914200730, 20260914200744, 20260927140000 (Fantasy data the card reads).
7. supabase/migrations/20260926003100_ordinary_account_mfa_step_up.sql and both
   ordinary_account_mfa_step_up*.test.sql; account_deletion_automatic.test.sql;
   ops_health_fantasy_coverage_and_scoring.test.sql; supabase/tests/README.md.
8. docs/backend/ACCOUNT_DELETION_RUNBOOK.md, PREDICTIONS_OPERATIONS_RUNBOOK.md, MIGRATIONS.md,
   docs/operations/DEPLOYMENT.md, .github/workflows/backend-quality.yml.
9. src/services/fantasy-create-service.ts (default captain), src/services/auth-supabase.ts ~529
   (club reference), src/services/football.ts ~110 (club id).

WORK
Follow plan section 15, BWP0 to BWP8, in order. BWP0 first: send the owner the plan's section 1.4
list and the two Phase 0 questions in plain words, then continue with BWP1 and BWP2 (decision-free).
Continue to BWP3 onward on the plan's defaults unless the owner says stop; apply any answer the owner
gives before merge in place, after confirming the migration is still unapplied anywhere.

REPORTING
- First message to the owner (BWP0): two or three plain sentences on what you found, the section
  1.4 list with one line each and the default, "Which do you change?", and the two Phase 0 questions.
- Final report: one paragraph on what the card can now do and that everything is off; what you
  tested and where (local, CI) with links to green runs, and what did not run; any database you
  wrote to (only your local stack); the owner's remaining actions in order (plan section 14.3:
  prerequisites, apply, club check, calibration read, rules v1, numbers on, compute on, founder,
  MANAGER_CARD_ENABLED and publish, read switch on); the decisions still open with their defaults;
  the draft PR link. Short, plain, no jargon. Never state an unverified item as fact.
```
