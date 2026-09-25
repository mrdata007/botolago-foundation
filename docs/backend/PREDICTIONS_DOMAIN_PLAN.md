# Pronostics — domain plan (BG-0146)

Weekly score predictions for the Botola Pro. This is the plan the build follows:
version 3, approved by the owner on 24 Sept 2026 with the decisions below. It
was written before any code; where the build differs, "What was built" says so.
Operating it: [PREDICTIONS_OPERATIONS_RUNBOOK.md](PREDICTIONS_OPERATIONS_RUNBOOK.md).

## What was built

**Database layer** (built 24 Sept 2026; parts 1 to 5 on production since 25
Sept, switched off; part 6 not yet: see the runbook's "Applying to
production"):

| Migration                                           | What it adds                                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `20260925090000_predictions_schema.sql`             | 7 tables, row security forced, nothing granted to any app role                                          |
| `20260925090100_predictions_rules.sql`              | points, the per-match lock, the default journée, journée state, the off / testers / public switch       |
| `20260925090200_predictions_api.sql`                | a journée, the rankings, my predictions, saving, the guest import                                       |
| `20260925090300_predictions_leagues.sql`            | Pronostics-only league membership: create, join, leave, new invite code, my leagues, a league's ranking |
| `20260925090400_predictions_scoring.sql`            | the scoring job, the operator functions, the pg_cron jobs                                               |
| `20260925090500_fantasy_league_page_skip_empty.sql` | Fantasy's worker skips leagues without a Fantasy member (production: only after Fantasy GW1 is scored)  |

Tests: `supabase/tests/database/predictions_{rules,play,claim,scoring,leaderboard,leagues}.test.sql`.

**Where the build differs from the plan:**

- The public rankings leave out, when read, players banned or deleted after
  the last scoring run. The plan only unranked them at the next run, which
  would have kept an offensive name on the board until then.
- A rankings page reads one row more than it returns, so the last page carries
  no "next" cursor.
- The database tests are six files, not eight; the league cases share one.

**Built since** (#200, #202): the app (data layer, screens, entry points, FR/AR
text, the Arabic reviewed), audience measurement (Seline) and the
privacy-policy update, the production apply scripts. Then, on the owner's
decision of 25 Sept, the fan votes on match pages (who wins, both teams score,
who scores first; for fun, no points; runbook, "Match votes"). **Still to do:**
part 6 on production.

**Decisions** (24 Sept 2026):

| #   | Question                                               | Decision                                             | Where it changes the plan                                                                                                          |
| --- | ------------------------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Switch on the live score refresh during match windows? | **Yes**                                              | §0, §15 (exact steps; its Edge Function is already deployed, so it's one settings call, run only on the owner's explicit go-ahead) |
| 2   | Analytics                                              | **A cookie-free tool, plus a privacy-policy update** | §11 (Plausible, EU-hosted; 5 events with no identifiers; all 5 KPIs measurable), §15, §16                                          |
| 3   | Leagues for players without a Fantasy team             | **Build Pronostics-only league membership now**      | §3 (new table), §7, §8, §9, §12, §14, §18, Appendix A                                                                              |
| 4   | Who reviews the Arabic?                                | **The owner**                                        | §10, §15 (a review sheet before Stage 4)                                                                                           |
| 5   | Stage 3 testers                                        | **Only the owner**                                   | §3 and §15 (`mode = testers`, one account id)                                                                                      |
| 6   | Can Pronostics-only players also **create** a league?  | **Yes**                                              | §7, §17 item 5 (one small, tested Fantasy filter, made after Fantasy GW1 is scored), Appendix A                                    |
| 7   | Go-ahead for the live refresh                          | **Given ("go")**                                     | **Done on 24 Sept at 19:15:55 UTC**; see the record in §15                                                                         |
| 8   | Plausible account                                      | **Created by the owner** (signed in with GitHub)     | §11: next, add the site `botolago.com` in Plausible                                                                                |

---

What I inspected:

- the repository, `main` at `d257de7`;
- production (`tkewgajrljbwgwedqsxn`) and staging (`srdrflfrfpwixsllveid`), with read-only queries, which `AGENTS.md` allows.

Date: 24 September 2026.

**Words used below:**

- **Database function:** a function the app calls in Supabase (an "RPC").
- **Access rules:** the database's row-level security (RLS).
- **Scheduled job:** pg_cron, the database's built-in timer.
- **Migration:** a file that changes the database structure.
- **Journée:** a Botola round (`app.rounds`).

---

## 0. Nine findings that shape this plan

1. **The season started today.** Journée 1 has 8 matches (24–27 Sept). FAR Rabat – Raja is now marked postponed; the latest provider update we hold (15:03 UTC, just after its 15:00 kick-off time) says so. Journée 2 (2–3 Oct) is published and also has a postponed match with no date.
2. **A postponed match carries a fake 0–0.** In production, FAR – Raja is stored as `status = postponed`, `home_score = 0`, `away_score = 0`. Any scoring that reads the score without checking "finished and final" would give 3 points to everyone who predicted 0–0.
3. **"Time not known yet" is stored as midnight UTC.** When only the date is known, the provider stores 00:00 UTC. The code already recognises this: `app_private.fantasy_kickoff_confirmed` in SQL, and `src/lib/match-kickoff.ts` in the app.
4. **Fantasy's gameweek can't drive Pronostics.** Fantasy only creates a gameweek once every kick-off in the round is confirmed. It handles postponements by hand, and opens GW N+1 only after GW N is fully scored.
   - Today there is no Fantasy GW2, because one Journée 2 match has no date.
   - Fantasy GW1 is still "open" about five hours after its 13:30 UTC deadline. That deadline was set from FAR – Raja's 15:00 kick-off, and Fantasy can't lock a gameweek that contains a postponed match until an operator resolves it.
   - With a lock per match, Pronostics would simply lock FAR – Raja and leave the other 7 matches open.
   - Pronostics reads the same round table Fantasy is built from (`app.rounds`), so "Journée 6" is always the same number in both games.
5. **Results currently arrive hours late.** In production, the 15-minute live score refresh and the whole email system are switched off.
   - The settings row `app_private.notification_email_settings` shows `mode = off`, `football_live_refresh_enabled = false`, and no dispatcher address.
   - Matches are refreshed by the hourly job, which in practice runs every 2–8 hours. Tonight's match data was last refreshed at 15:03 UTC.
   - Pronostics' "check your results" step needs the live refresh switched on during match windows.
   - **Decided: switch it on.** Its Edge Function (`football-live-refresh`) was deployed to production on 24 Sept, and the scheduler secret it needs is already in Vault. So switching it on is one settings call (§15).
   - **Done:** switched on at 19:15:55 UTC on 24 Sept, on the owner's go-ahead (record in §15).
6. **Joining a league requires a Fantasy team.** `app.fantasy_league_memberships` needs both `user_id` and `fantasy_team_id`. A Pronostics tab inside existing Fantasy leagues is easy. Letting a Pronostics-only player join a league is not.
   - **Decided: build Pronostics-only membership now** (§7). Production has only one active league today, so this is about growth, not migration.
7. **There is no visitor analytics at all**, and the privacy policy says so. Three of the five KPIs can be measured from the database. The other two need an owner decision.
   - **Decided: a cookie-free tool plus a privacy-policy update** (§11). The policy already lists "measuring the audience" as a purpose (legitimate interest, aggregated data). What changes is the processor table, which today says "no audience-measurement tool", and the cookie paragraph.
8. **The phone bottom bar is full.** It has 5 items and is already tight at 320 px in Arabic. Adding a 6th isn't safe for MVP.
9. **Real usage is still small, but the database has limited headroom.**
   - Production has 28 accounts, 6 Fantasy teams and 2 leagues. Staging has no real matches and no users.
   - A load test measured about 65 requests/second for the Fantasy mix before errors (on the Medium tier; production's tier isn't recorded). So the design still has to be economical.

---

## 1. What already exists and can be reused

| Need                                       | What exists                                                                                                                                                                                                                                                                                        | Where                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Matches                                    | `app.fixtures`: `kickoff_at` (never empty), `status` (13 values), `home_score`/`away_score`, `finalized_at`, `round_id`, `season_id`                                                                                                                                                               | `supabase/migrations/20260720095345_football_match_ingestion.sql`                      |
| "This match is final"                      | `finalized_at` is set once, and only with status `finished` (FT/AET/FT_PEN). Later refreshes never erase it                                                                                                                                                                                        | `20260922200000_fixture_finalization_preserved.sql`                                    |
| Old or duplicate provider updates          | `app_private.protect_fixture_freshness` rejects stale updates and stops a finished or cancelled match from changing status. Scores can still be corrected                                                                                                                                          | `20260720095345…sql`, lines 182–213                                                    |
| Journées                                   | `app.rounds` (`round_number`, `name`), `fixtures.round_id`, and the index `fixtures_season_round_kickoff_idx`                                                                                                                                                                                      | `20260720095330_football_catalog.sql`                                                  |
| Current season                             | `app.seasons.is_current` (one per competition)                                                                                                                                                                                                                                                     | same                                                                                   |
| Club names in FR/AR, and crests            | `app.teams`, `app.team_translations` (all 16 clubs have Arabic names), crests for all 21 teams. Match data builder: `app_private.football_match_json(fixture_id, lang)`                                                                                                                            | `20260921190000_team_translations.sql`, `20260720095354_football_api_security.sql`     |
| "Time not confirmed" test                  | `app_private.fantasy_kickoff_confirmed()`; in the app, `isKickoffTimeUnconfirmed` and `isKickoffDateUnconfirmed`                                                                                                                                                                                   | `20260918120000_fantasy_calendar_sync.sql`; `src/lib/match-kickoff.ts`                 |
| Grouping matches by day                    | `groupByMatchDay` ("Aujourd'hui / Demain / Samedi 26 septembre", Casablanca time)                                                                                                                                                                                                                  | `src/lib/match-days.ts`                                                                |
| Example of a lock enforced in the database | `app_private.fantasy_assert_mutable_gameweek` raises `PT409 fantasy_gameweek_locked`                                                                                                                                                                                                               | `20260720141854_fantasy_api_security.sql`, lines 25–43                                 |
| Accounts                                   | `app.profiles` (display name, username, language). Bans: `app_private.user_is_banned` and the trigger `app_private.refuse_banned_actor`. Masked names: `app_private.fantasy_mask_username`. Staff: `app_private.staff_principals`                                                                  | identity, moderation and prizes migrations                                             |
| Leagues                                    | `app.fantasy_leagues`, `app.fantasy_league_memberships` (unique `(league_id, user_id)`), the access check in `api.fantasy_league_standings`, and the league page tabs                                                                                                                              | `20260720141850…sql`, `20260921200000…sql`, `src/routes/fantasy.leagues.$leagueId.tsx` |
| Ranking pattern                            | `app.fantasy_rankings` (saved ranks, read page by page). Copy the pattern, not the table                                                                                                                                                                                                           | `20260720141850…sql`, `20260921180000…sql`                                             |
| Background jobs                            | Scheduled jobs written in SQL (`news-publish-due-editions`, `notification-email-tick`); an on/off settings row with `test_user_ids`; a repeat-safe batch job pattern (`api.service_evaluate_fantasy_prizes`)                                                                                       | `20260922180100…sql`, `20260924140100…sql`, `20260924120000…sql`                       |
| Screen components                          | UI kit (`UiTabs`, `UiTable`, `UiCard`, `UiSheet`, `ui.hitArea` for 44 px touch targets), `ClubCrest`, `MatchCard`, `GameweekSelector` (‹ › switcher), `ShareButton`, `ListPager`, the ranking rows in `src/routes/fantasy.rankings.tsx`, the sticky bottom bar pattern, skeletons and empty states | `src/components/**`                                                                    |
| Storing data on the phone                  | `src/lib/storage.ts` (safe, keys prefixed `botolago.`). Precedent for importing local data after sign-in: `src/services/fantasy-import-decision.ts`                                                                                                                                                |                                                                                        |
| Sign-in prompt                             | `useAuth().requireAuth`, `AuthPromptDialog`                                                                                                                                                                                                                                                        | `src/auth/AuthProvider.tsx`                                                            |
| Feature flags                              | Build-time flags, each with a list of the surfaces it hides                                                                                                                                                                                                                                        | `src/lib/feature-flags.ts`                                                             |
| Data layer template                        | Prizes: `src/services/prizes.ts` and `src/backend/prizes/*` (zod contracts, Supabase and mock repositories, data-mode switch)                                                                                                                                                                      |                                                                                        |
| Translations                               | One dictionary (`src/i18n/dictionaries.ts`) with an FR/AR parity check. "Journée" / "الجولة" are already used. Arabic shows Western digits (`ar-MA`)                                                                                                                                               | `scripts/qa/i18n-gate.ts`                                                              |
| Search engines                             | `head()` per route; the "server loader → `initialData`" pattern for pages that must show content to search engines                                                                                                                                                                                 | `src/routes/matches.$matchId.tsx`, `src/lib/sitemap.ts`                                |
| Tests and CI                               | pgTAP (65 files), Bun tests, Playwright (mock data, FR/AR × 6 screen sizes). Both `application-quality` and `database-quality` must pass                                                                                                                                                           | `.github/workflows/backend-quality.yml`                                                |

**Not there yet, so it must be built:**

- prediction tables and database functions;
- a "current journée" function (none exists anywhere);
- a public "matches of one journée" read;
- runtime feature flags;
- any analytics;
- a score stepper;
- league invite links.

---

## 2. Architecture

```
SportsMonks ─► existing ingestion ─► app.fixtures / app.rounds   (unchanged; Pronostics only reads them)
                                            │
Pronostics page / match card ── read ──► api.predictions_round            (public, one call)
                                            │
signed-in tap ─► 1-second batch ─► api.save_predictions ─► lock check (database clock) ─► app.predictions
guest tap ─────► this phone only (botolago.predictions.guest.v1) ─► after sign-up: api.claim_guest_predictions
                                            │
Scheduled job every 5 min ─► app_private.predictions_score_tick()
    finds matches that became final (or were corrected) ─► scores their predictions 3/1/0
    ─► rebuilds the journée and season totals of the players concerned ─► re-ranks
                                            ▼
                               app.prediction_standings
                                            ▼
        api.predictions_leaderboard (journée / season)     api.predictions_league_standings (league tab)

League invite code or link ─► api.join_prediction_league ─► app.prediction_league_members   (no Fantasy team needed)
A league's Pronostics ranking = its Fantasy members + its Pronostics-only members, each person once
```

The design follows these rules:

- **Each match locks at its own kick-off.** There is no gameweek deadline and no stored gameweek state. A journée's status ("en cours", "terminée", "provisoire") is worked out from its matches whenever it is read.
- **One source of truth for matches:** the existing match and round tables. Nothing is copied.
- **Scores are recalculated from the facts, never added up step by step.** Running the job twice, or after a correction, gives the same answer.
- **Every rule is enforced in the database.** The screen only mirrors it.
- **Pronostics stays separate from the rest.** It adds no trigger on `app.fixtures` and changes nothing in ingestion, Fantasy or live scoring. If the Pronostics job fails, football data and Fantasy carry on.

**Why not use Fantasy's gameweeks?**

- Fantasy's gameweek is built from the same round (`fantasy_gameweeks.football_round_id`, with `sequence_number = round_number`). On top of that it adds a squad deadline and manual handling of postponements.
- Pronostics needs neither, and it must keep working while Fantasy waits on an operator, as it does right now.
- What Pronostics does reuse from Fantasy's work: the "time not confirmed" test, the "final" signal fixed in PR #161, and the link between matches and rounds.

---

## 3. Database design

Seven new tables. **No existing table's structure changes.** (If Pronostics-only players may create leagues, `app.fantasy_leagues` receives new _rows_ through a Pronostics function; its columns stay the same. See §7.)

| Table                                    | Purpose                                                                    | Important fields                                                                                                                                                                                                                                                                                                                                                                                                   | Constraints                                                                                                           | Indexes                                                                                                        | Access / RLS                                                                                                                                                                 | Deletion                                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `app.predictions`                        | One row per player per match                                               | `id uuid` primary key; `user_id` → `app.profiles`; `fixture_id` → `app.fixtures`; `home_goals`, `away_goals` (smallint); `home_team_id`, `away_team_id` (copied from the match when saved); `origin` (`direct`/`guest_claim`); `submitted_at` (server time of the player's last change); `points`, `result_kind` (`exact`/`outcome`/`miss`/`void`/`late`), `rule_version`, `scored_at`; `created_at`, `updated_at` | **unique (`fixture_id`, `user_id`)**; goals between 0 and 20; `origin` and `result_kind` limited to the listed values | the unique index (serves scoring by match and "my predictions for these matches"); (`user_id`, `submitted_at`) | access rules forced on; no direct access for app users; a "read your own rows" rule as a backstop; writes only through database functions; ban trigger `refuse_banned_actor` | when a user is deleted, their rows are deleted too; deleting a match is refused                                    |
| `app.prediction_standings`               | Totals and rank per player, per journée and for the whole season           | `id uuid` primary key; `season_id`; `round_id` (empty = season row); `user_id`; `points`, `exact_count`, `outcome_count`, `miss_count`, `void_count`, `scored_count`, `predicted_count`, `rounds_played` (season rows only), `rank`, `updated_at`                                                                                                                                                                  | unique (`season_id`, `round_id`, `user_id`), with an empty `round_id` counted as one value; counts can't be negative  | (`round_id`, `rank`, `id`) on journée rows; (`season_id`, `rank`, `id`) on season rows; (`user_id`)            | access rules forced on; no direct access; written only by the scoring job                                                                                                    | user deleted → rows deleted; deleting a season or round is refused                                                 |
| `app.prediction_league_members`          | Pronostics-only membership of an existing league (no Fantasy team needed)  | `id uuid` primary key; `league_id` → `app.fantasy_leagues`; `user_id` → `app.profiles`; `role` (`owner`/`member`); `status` (`active`/`left`); `joined_at`, `left_at`, `created_at`, `updated_at`                                                                                                                                                                                                                  | unique (`league_id`, `user_id`); `role` and `status` limited to the listed values                                     | the unique index; (`user_id`, `status`, `joined_at`)                                                           | access rules forced on; no direct access; writes only through the league functions; ban trigger                                                                              | user deleted → rows deleted; **league deleted → rows deleted** (so Fantasy's season clean-up script keeps working) |
| `app_private.prediction_fixture_scoring` | Scoring record: one row per match, saying which result was scored and when | `fixture_id` primary key; `season_id`, `round_id`; `state` (`scored`/`void`); `result_home`, `result_away`; `fixture_status`; `fixture_kickoff_at` (the final kick-off, used by the late rule); home/away team ids; `override` (`void`) with `override_reason` and `override_at`; `rule_version`; `revision` (1, 2, 3… one per re-score); `predictions_scored`; `scored_at`                                        | `state` and `override` limited to the listed values                                                                   | primary key                                                                                                    | internal schema, no app access at all                                                                                                                                        | deleting a match is refused                                                                                        |
| `app_private.prediction_settings`        | A single row of switches                                                   | `mode` (`off`/`testers`/`public`, starts at `off`); `scoring_enabled`; `tester_user_ids uuid[]` (Stage 3: the owner's account only); `rule_version` (1); `max_items_per_save` (16); `max_claim_items` (40)                                                                                                                                                                                                         | exactly one row (same approach as `notification_email_settings`)                                                      | –                                                                                                              | changed only by `app_private.predictions_configure(…)`, which the owner runs in the SQL editor                                                                               | –                                                                                                                  |
| `app_private.prediction_job_runs`        | Log of job runs that did something, and of operator actions                | `started_at`, `finished_at`, `kind` (`tick`/`operator`), `outcome`, counts, `detail jsonb`, `error`, `reason`                                                                                                                                                                                                                                                                                                      | –                                                                                                                     | (`started_at`)                                                                                                 | internal                                                                                                                                                                     | rows older than 90 days are removed                                                                                |
| `app_private.prediction_guest_claims`    | One row per guest-to-account import (for the audit and the conversion KPI) | `user_id`, `claimed_at`, `submitted`, `imported`, `kept_existing`, `rejected_started`, `rejected_invalid`                                                                                                                                                                                                                                                                                                          | –                                                                                                                     | (`claimed_at`), (`user_id`)                                                                                    | internal                                                                                                                                                                     | user deleted → rows deleted                                                                                        |

**Why a separate `submitted_at`:** the shared trigger `app_private.set_updated_at()` changes `updated_at` on every update, including when the job writes points. The late rule needs the time the _player_ last changed the prediction.

**Why copy the team ids:** the provider can change a match's teams on any refresh.

- Scoring matches goals to teams, so if home and away are swapped, the player's real intent still scores.
- If the match now has completely different teams, the prediction is voided.

**Why fixed text values and not enums:** `fantasy_fixture_assignments.assignment_status` does the same. It means database functions that visitors can call don't need access to the `app` types (the rule from `20260921120000…sql`).

**Built so later features don't need a rewrite:**

- Bonus questions get their own tables, and their points are added into `prediction_standings`.
- A rule change raises `rule_version` and leaves already-scored history alone.
- Monthly, rolling, average or sponsored leaderboards are queries over the journée rows, each of which is tied to real match dates.

---

## 4. Playing without an account

|                          | A. Phone only (localStorage)                                          | B. Anonymous accounts on the server (Supabase anonymous sign-in)                                                                                                                                                      | C. Hybrid (phone + a server "guest token")                                   |
| ------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Abuse / spam             | None: nothing reaches the server                                      | High: every visitor creates an `auth.users` row. Needs a CAPTCHA, and there is none today                                                                                                                             | Medium: an open write entry point for anyone; needs rate limits and clean-up |
| Duplicates               | No effect, because guests aren't ranked                               | Many junk accounts                                                                                                                                                                                                    | Many junk tokens                                                             |
| Moving to a real account | Import after sign-up; only matches not yet started count              | Automatic when the same person upgrades on the same device; can't merge into an existing account                                                                                                                      | Import checked by the server, even after kick-off                            |
| Privacy                  | Best: the data stays on the phone                                     | The server keeps data about unregistered people                                                                                                                                                                       | The server keeps data tied to a device token                                 |
| Leaderboard integrity    | Safe: guests are never ranked, and the import checks kick-off         | Safe, if every database function checks `is_anonymous`                                                                                                                                                                | Safe                                                                         |
| Experience               | Good. One catch: register before kick-off, or those picks don't count | Best                                                                                                                                                                                                                  | Best                                                                         |
| Complexity               | Low                                                                   | **High.** Anonymous users get the `authenticated` role, so every existing function open to signed-in users would open to them too. The sign-up trigger would create profiles for them, and admin counts would inflate | Medium to high                                                               |
| Access rules             | Nothing new                                                           | Every existing grant to signed-in users needs an anonymous check                                                                                                                                                      | A new public write function plus a clean-up job                              |

**Recommendation: A.**

- It is the simplest and the safest option.
- It fits the architecture rule that browser storage is for drafts only and guests are not signed-in users (`docs/backend/GREENFIELD_MASTER_PLAN.md`, §1 and §4).
- Anonymous sign-in is deliberately off: `supabase/config.toml` has `enable_anonymous_sign_ins = false`.
- Measure how many guest picks are lost at sign-up (with the claims table). If that number is large, move to C in V2.

**What happens when a guest signs up or signs in:**

1. Guest picks are stored under `botolago.predictions.guest.v1`. That key is versioned and is not under `botolago.auth.*`, which sign-out wipes. Each entry holds the match id, the two scores, the two team ids, and the phone's time (for display only).
2. When the account goes from guest to signed in, the app sends every entry for this season in one call: `api.claim_guest_predictions`, up to 40 entries. This runs from one effect in `src/auth/AuthProvider.tsx`, next to the ban check, so it covers register, log-in and Google.
3. The database handles each entry:
   - Match not found, wrong season or bad numbers → **rejected (invalid)**.
   - Match already kicked off, or no longer open → **rejected (started)**. This is the anti-cheat rule: nobody can "predict" a result after seeing it.
   - The account already has a prediction for that match → **the account's version is kept**. The server wins, because phone times can't be trusted.
   - Otherwise → **imported**, with `origin = guest_claim` and `submitted_at` set to the current server time.
4. Everything happens in one transaction, and running it twice changes nothing. One row is added to `prediction_guest_claims`.
5. The app shows one message, for example "5 pronostics ajoutés à votre compte · 2 déjà présents · 1 match déjà commencé", then removes the imported entries from the phone. Picks rejected as "started" stay visible on the phone only, marked "non comptabilisé".

**Edge cases:**

- **Signing up on a different device:** nothing to import. This is expected, and the screen text says so.
- **Signing out:** the guest store on the phone starts empty. The account's picks are never copied back to the phone.
- **Storage blocked by the browser:** picks are kept only for the visit, and the user is asked to create an account.

---

## 5. Locking each match at kick-off

**The rule.** One SQL function, `app_private.prediction_fixture_open(status, kickoff_at, now)`, is used by every write:

> A match can be predicted only if it belongs to the current Botola Pro season, has a journée, has status `scheduled` or `not_started`, **and the database clock is before its stored kick-off time.**

**How it is enforced:**

- **Same statement, database clock.** In `api.save_predictions` and `api.claim_guest_predictions`, the check is part of the very SQL statement that writes the row (`insert … select … where open(…)` and `on conflict … do update … where open(…)`), using `statement_timestamp()`. The phone never sends a time, so a wrong or faked phone clock can't unlock anything.
- **Rejected picks.** A rejected item comes back as `locked`. The screen shows "Match commencé : pronostic verrouillé" and goes back to the saved value.
- **Safety net at scoring.** A prediction whose `submitted_at` is at or after the match's _final_ kick-off time scores nothing (`result_kind = late`). This covers a kick-off moved earlier that our database learned about late, which is likely today with refreshes every 2–8 hours.
- **No lock on matches.** Saving never locks a row in `app.fixtures`, so saves can't slow down score ingestion.

| Situation                                                            | Can the player edit?                                                                                                               | Scoring                                            |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Normal, before kick-off                                              | Yes                                                                                                                                | –                                                  |
| At or after kick-off (any status)                                    | No                                                                                                                                 | when final                                         |
| Time not confirmed (00:00 UTC placeholder)                           | Yes, until the placeholder moment, i.e. the very start of match day. This always errs early. The screen says "Horaire à confirmer" | –                                                  |
| Kick-off moved later                                                 | Yes, until the new time (the lock follows the stored time)                                                                         | –                                                  |
| Kick-off moved earlier                                               | Until the new time, once we know it. Picks made after the real kick-off are voided                                                 | late rule                                          |
| `delayed`                                                            | No                                                                                                                                 | when final                                         |
| `postponed`                                                          | No, but the pick is kept                                                                                                           | waits                                              |
| Postponed, then rescheduled (status back to `not_started`, new time) | Yes again, until the new kick-off. Same prediction row                                                                             | normal                                             |
| `suspended` (interrupted)                                            | No                                                                                                                                 | when final                                         |
| `cancelled`, `abandoned`                                             | No                                                                                                                                 | void: not counted                                  |
| `finished` but never finalised (walkover, awarded)                   | No                                                                                                                                 | waits; an operator decides, usually void           |
| The provider sends the same update twice                             | –                                                                                                                                  | no effect: the scoring record sees nothing changed |

**The "next lock" line in the header** shows the earliest kick-off among matches still open. It is only information; it never decides whether a match can be edited.

**Which journée opens by default.** One function, `app_private.predictions_current_round(season, now)`, tested with fixed times:

- The default is the journée of the earliest match still open, **ignoring**:
  - a match left over from an older journée once a later journée has mostly been played (a rescheduled postponement);
  - a single match brought forward from a later journée while the current journée still has most of its matches to play.
- If nothing is open, the default is the journée of the most recently played match.
- The page always has a ‹ › switcher, and `?journee=N` in the address.

---

## 6. Scoring

**Rule v1:**

- **Exact score:** 3 points.
- **Right outcome (home win, draw or away win) but wrong score:** 1 point.
- **Otherwise:** 0.

In SQL: `case when p_home = r_home and p_away = r_away then 3 when sign(p_home - p_away) = sign(r_home - r_away) then 1 else 0 end`. This is one pure SQL function. The same function exists in TypeScript for guests, and both are tested against the same list of cases.

| Prediction     | Result | Points | Shown as                    |
| -------------- | ------ | ------ | --------------------------- |
| Raja 2–1 Wydad | 2–1    | +3     | "Score exact"               |
| 1–0            | 2–1    | +1     | "Bon résultat (Raja gagne)" |
| 1–1            | 2–1    | 0      | "Raté"                      |
| 0–1            | 2–1    | 0      | "Raté"                      |
| 1–1            | 0–0    | +1     | "Bon résultat (match nul)"  |

**When scoring runs: option A, as each match is finalised, via a scheduled job every 5 minutes.**

- A match is final when `status = 'finished'` **and** `finalized_at is not null`. The score used is `home_score`/`away_score`. Botola Pro league matches have no extra time.
- `cancelled` or `abandoned` matches, and matches an operator voids: predictions are marked `void`, get no points and aren't counted.
- Postponed, suspended, walkover and awarded matches (the last two are never finalised): wait.

|                         | A. Per match, when it is final    | B. Whole journée at the end                                                | C. Calculated each time it is read                                                             |
| ----------------------- | --------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| How fast results appear | Minutes after the data arrives    | Only after the last match. A postponed match can block a journée for weeks | Instantly                                                                                      |
| Safe to run again       | Yes                               | Yes                                                                        | Yes                                                                                            |
| Database load           | Small bursts, about 8 per journée | One burst                                                                  | **Every page view** recalculates, and leaderboards scan everything, worst of all on match days |
| Corrections             | Re-score one match                | Re-score the journée                                                       | Automatic                                                                                      |
| Audit trail             | One record per match              | One record per journée                                                     | None                                                                                           |

**A wins.** C is only fine for a player's own match cards, which the page shows directly anyway.

**What one run of the job does** (`app_private.predictions_score_tick()`):

1. If `mode = off` or scoring is switched off, it does nothing and writes nothing.
2. It takes a lock that doesn't wait (`pg_try_advisory_xact_lock`). If another run is in progress, it stops.
3. It finds matches that need (re)scoring: matches with predictions and no scoring record yet, or whose current state differs from their record. "State" covers: final or not, void, score, teams, kick-off, journée, and any operator decision. At most 4 matches per run, so each transaction stays short.
4. For each such match, one `update` sets `points` and `result_kind` on all its predictions (goals matched by team id, late rule applied). The scoring record is written with `revision + 1`.
5. For the players concerned, their journée row and season row are **rebuilt from their predictions** (not added to). Ranks for the affected journée and season are then recalculated, and only the rows whose rank changed are rewritten.
6. It writes one log row if anything happened.

**Corrections** (for example, SportsMonks changes 2–1 to 2–2 the next day):

1. Ingestion updates the score and keeps `finalized_at`; only a change of status is blocked.
2. The next run sees that the scoring record says 2–1 but the match says 2–2.
3. It re-scores that match, rebuilds the totals of everyone who predicted it, re-ranks, and logs "revision 2: 2–1 → 2–2".
4. The match card then shows "Résultat corrigé".

The same path handles a match moving to another journée, or its teams changing.

**Operator controls.** No admin screen for MVP. These are SQL functions the owner runs, each logged with a reason:

- `app_private.predictions_configure(mode, scoring_enabled, tester_user_ids)`
- `…_void_fixture(fixture_id, reason)`
- `…_unvoid_fixture(fixture_id, reason)`
- `…_rescore_fixture(fixture_id, reason)`
- a read-only `…_status()` that shows, per journée: players, predictions, matches scored / voided / waiting, matches finished but not final for more than 6 hours, the last run, and the last error.

---

## 7. Leaderboards

- **Journée leaderboard:** every signed-in player with at least one scored prediction in that journée. It is marked "provisoire" while any match of the journée isn't final or void (a postponed match counts), with a note such as "1 match à jouer".
- **Season leaderboard:** the sum of the journée totals. It shows points, exact scores and journées played.
- **League tab:** the members of a Fantasy league, ranked on the same totals (journée or season).

**Tie-break recommendation: points, then exact scores, then a shared rank ("ex æquo").**

- **"Correct outcomes" adds nothing.** With 3/1/0 scoring, points = 3 × exact scores + 1 × other correct outcomes. So two players level on points _and_ on exact scores always have the same number of outcomes.
- **"Earliest complete submission" is rejected.** It punishes people who wait for team news, and after a guest import the time recorded is the import time. It measures speed, not skill.
- **Tied players share a rank** (1, 2, 2, 4) and are listed in a stable order. Nothing is random.
- **If prizes come later**, the fairest extra tie-break is "smallest total goal error": the sum of the gaps between predicted and real goals. It can be computed from saved data at that point.

**How ranks are computed.** Ranks are **saved** in `app.prediction_standings` by the scoring job, as Fantasy does for its rankings. Leaderboards are read far more often than they change (the job runs about 8 times per journée), so reading a page stays a short, indexed read.

- **One page:** `where round_id = $1 and rank is not null order by rank, id limit 50`, continuing "after this rank" with the cursor `(rank, id)`. It uses the index (`round_id`, `rank`, `id`). The season works the same way with (`season_id`, `rank`, `id`) on season rows. The cursor uses the row id, never the user id.
- **"My rank":** one lookup on the unique key.
- **Total number of players:** one count on the same index, on the first page only.
- **League tab:**
  - Members are everyone active in the league through **either** path: `app.fantasy_league_memberships` (Fantasy players) **or** `app.prediction_league_members` (Pronostics-only players), each person once (`union` on `user_id`).
  - Their standings rows are ranked when read, with `rank()`, because leagues are small (capped at 500 Pronostics-only members).
  - Access: the league is active and the caller is an active member through either path (the Fantasy check copied from `api.fantasy_league_standings`, extended to the new table).
- **Hidden from leaderboards:** banned users (`app_private.user_is_banned`) and deleted profiles. Guests are never on the server in the first place.
- **Names:**
  - Signed-in viewers see display names, the same rule as Fantasy standings.
  - Visitors see masked usernames such as `h***7` (`app_private.fantasy_mask_username`).
  - There are no profile pages.
- **Page size:** 50 rows (maximum 100). Never load the whole leaderboard; `/fantasy/rankings` reads up to 2,000 rows, and that shouldn't be copied.

**People who join mid-season:**

- The journée leaderboard is the main social one: everyone starts at 0 each week.
- The season leaderboard shows "journées jouées".
- Because journée rows are saved, an "average per journée (minimum 5)" leaderboard, monthly leaderboards or sponsored weekly competitions can be added later as plain queries, without touching history.

**Mini-leagues in MVP (decided: Pronostics-only membership is built now).**

_The model: one league, two games._

- A league is still one row in `app.fantasy_leagues`, with one name, one owner and one invite code.
- There are two ways to be in it:
  - as a **Fantasy member**: the existing table, which needs a Fantasy team;
  - as a **Pronostics member**: the new `app.prediction_league_members`, which only needs an account.
- The league's **Pronostics** ranking includes both kinds of members, each person once.
- The league's **Fantasy** ranking, its `member_count`, Fantasy prizes and every Fantasy screen keep seeing Fantasy members only. Nothing changes for Fantasy.
- It's automatic: every league gets a Pronostics side, with no opt-in.
- Head-to-head leagues and cups don't exist in the database yet (only placeholders in the app), so there's nothing to decide for them now.
- Guests can't be members. The invite page asks them to create an account first, then brings them back and joins them (§9).

_What players can do in MVP:_

| Action                                     | Who                                     | How                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Join with a code or an invite link         | any signed-in player                    | `api.join_prediction_league(p_invite_code)`: same code as Fantasy, same normalisation and fingerprint (`encode(digest(upper(btrim(code))), 'hex')`, sha256), private and active leagues of the current Fantasy season only. Already in through Fantasy → "déjà membre", no second row. Left before → joined again. |
| Leave                                      | Pronostics-only members (not the owner) | `api.leave_prediction_league(p_league_id)`                                                                                                                                                                                                                                                                         |
| See my leagues                             | any signed-in player                    | `api.my_prediction_leagues()`: both kinds, with my rank in each                                                                                                                                                                                                                                                    |
| See a league's Pronostics ranking          | active members of either kind           | `api.predictions_league_standings(p_league_id, p_round_number)`                                                                                                                                                                                                                                                    |
| **Create a league without a Fantasy team** | any signed-in player (decided)          | `api.create_prediction_league(p_name)` plus `api.reset_prediction_league_invite_code(p_league_id)` for an owner who lost the code (details below)                                                                                                                                                                  |

_Limits (anti-spam, all checked in the database):_

- at most 50 active leagues per player;
- at most 500 Pronostics-only members per league;
- at most 5 leagues created per player per season;
- league names 3–80 characters, the same rule as Fantasy.

_Invite codes stay secret (same approach as Fantasy):_

- They're stored only as a fingerprint (a sha256 hash) plus the last 4 characters.
- They're shown in full only once, at creation (or after a reset).
- A wrong code gets the same answer whether or not the league exists ("Code invalide").
- Codes never go into logs, analytics or the page address sent to the server (see the invite link in §9).

_Creating a league (decided: yes):_

- **Why it matters:** without it, a group of friends where nobody plays Fantasy can't start a league, and the "join a mini-league" step only works when a Fantasy player invites them.
- **How it works:**
  - The Pronostics function creates a normal private league row in `app.fantasy_leagues`, in the current Fantasy season, with the caller as `owner_user_id` and `member_count = 0` (it counts Fantasy members only).
  - It records the owner in `app.prediction_league_members` with `role = owner`.
  - The code is minted and fingerprinted exactly like `api.create_fantasy_league`, so Fantasy players can join the same league with the same code, through Fantasy.
- **What was checked in Fantasy:**
  - Fantasy's "rankings complete" check before a gameweek closes only looks at Fantasy memberships, so a league without Fantasy members can't block Fantasy scoring.
  - **But** Fantasy's per-league ranking loop (`api.service_fantasy_scoring_league_page`) walks _every_ active league of the season. Thousands of Pronostics-only leagues would add thousands of empty ranking passes to each Fantasy gameweek close.
  - The fix: one filter in that loop, "skip leagues with no active Fantasy member". It's a small change to a Fantasy function, so it has to be proven by a test that Fantasy rankings are identical, and made **after Fantasy GW1 has been scored**.
- **Known limitation:** `app.fantasy_leagues.owner_user_id` blocks deleting the owner's account (the same rule already applies to Fantasy owners). When account deletion is built, leagues will need an ownership transfer or archive step.
- **Not in MVP:** archiving a league from Pronostics; removing members; one-tap "also play Fantasy in this league" after creating a Fantasy team (V1.1: a strong conversion hook).

---

## 8. Screens and interactions

**To create:**

- Routes:
  - `src/routes/pronostics.tsx` is a layout that renders `<Outlet/>`, as the nested-route test requires.
  - `pronostics.index.tsx` serves `/pronostics` (with `?journee=N` and `?tab=classement|ligues`). It gets a server loader so search engines see the matches, the same pattern as `matches.$matchId.tsx`.
  - The league pages are `pronostics.ligues.index.tsx` (my leagues, create, join with a code), `pronostics.ligues.rejoindre.tsx` (the invite landing page) and `pronostics.ligues.$leagueId.tsx` (a league's Pronostics ranking, invite panel for the owner, "Quitter"). All league pages are `noindex`.
- League components in `src/components/predictions/`: `MyLeaguesList`, `JoinLeagueForm` (removes spaces from the code, like the Fantasy join), `CreateLeagueForm`, `InviteLinkShare` (WhatsApp / copy; the code is shown once), and `LeaguePredictionsStandings`, shared by the Pronostics league page and the Fantasy league page's new tab.
- In `src/components/predictions/`:
  - `PredictionsHeader`: title, progress, next lock.
  - `RoundSwitcher`: "‹ Journée 6 · En cours ›", built like `GameweekSelector`.
  - `FixturePredictionCard` and `ScoreStepper`.
  - `PredictionResult`: +3/+1/0 with the reason.
  - `PredictionsStickyBar`: progress, save state, sign-up button for guests, share.
  - `PredictionsLeaderboard`: journée/season, with the player's own row.
  - `MatchPredictionCard` (match page), `LeaguePredictionsTab`, `PredictionsHomeCard`, `GuestClaimNotice`.
  - `ScoringRulesSheet`: a bottom sheet with the 3/1/0 rules.
- The data layer, in `src/backend/predictions/`: zod contracts, Supabase repository, mock repository, error mapping, TypeScript scorer, guest store and save queue. The service `src/services/predictions.ts` gets its own `VITE_PREDICTIONS_DATA_MODE` switch, like prizes.

**To modify:**

- `src/routes/index.tsx`: Home card and discovery tile.
- `src/routes/matches.$matchId.tsx`: a card, not a 5th tab (a test pins the 4 tabs).
- `src/components/matches/MatchesTabs.tsx`: a third tab.
- `src/components/shell/primary-nav.ts`: keep "Matches" highlighted on `/pronostics`.
- `src/routes/fantasy.leagues.$leagueId.tsx`: tabs become "Fantasy | Pronostics | Coupe".
- The Fantasy `InviteCode` component (moved into a shared file by open PR #183): add a "Partager le lien d'invitation" button, so a Fantasy owner can also invite friends who only want Pronostics. Coordinate with PR #183.
- `src/auth/AuthProvider.tsx`: the guest import.
- `src/components/auth/AuthPromptDialog.tsx`: optional, keep `?journee=` when sending people back after sign-in.
- `src/lib/sitemap.ts`, `src/lib/feature-flags.ts`, `src/i18n/dictionaries.ts`.

**To reuse:** `groupByMatchDay`, `ClubCrest`, `clubShortCode`, `UiTabs`, `UiTable`/`UiTR highlighted`, `ListPager`, the `MyRankCard`/`RankingRow` patterns, `ShareButton`, `UiSheet`, `EmptyState` and skeletons, the sticky bar pattern, `requireAuth`.

**Phone layout (360–430 px):**

```
Pronostics — Journée 6
‹  Journée 6 · En cours  ›
6/8 pronostics · Prochain verrouillage : ven. 20:00
[ Pronostics | Classement | Ligues ]
Vendredi 26 septembre
┌──────────────────────────────────────────┐
│ (crest) Raja          20:00     Wydad (crest) │
│       [−] 2 [+]     –     [−] 1 [+]      ✓ │
└──────────────────────────────────────────┘
Samedi 27 septembre
 …
Résultats  (finished matches shrink to one line: "Raja 2–1 Wydad · Vous 2–1 · +3")
──────────── sticky bar ────────────
6/8 · Enregistré ✓                   [Partager]
(guest: "Enregistré sur ce téléphone · Créer mon compte")
```

- **Why two lines per match:** teams and time on the first line, the two steppers on the second. That is the only layout that fits 360 px with 44 px buttons. A single line needs about 344 px and only fits from 390 px.
- **Why the page stays short:** finished matches shrink to one line, so a full journée is about 1.5 screens.

**Score input: − n + steppers, not number fields.**

- **Starting state:** each side shows "–" (no prediction). The first tap on either side sets both sides to 0 and then applies the tap.
- **Speed:** 1–0 is 1 tap, 2–1 is 3 taps, 0–0 is 1 tap on "−". A whole journée takes about 15–20 taps.
- **Details:** 44 px touch targets (`ui.hitArea`), numbers in the score font, each number in its own `<bdi>`. Range 0–9; "−" is disabled at 0.
- **Why not number fields:** the keyboard covers half the screen, iOS zooms in, Arabic keyboards type ٠١٢, and every match needs two fields with focus jumping between them.
- **No clear/delete button in MVP.** A prediction can be changed but not removed.

**Saving: short delay, then one batch.**

- **How it works:**
  - Every tap updates the screen immediately.
  - After 1 second without taps, one `api.save_predictions` call sends every changed match on the page.
  - Only one request is sent at a time, and it always carries the latest values, so an older request can never overwrite a newer one.
  - The app also saves immediately when the page is hidden, and immediately if a changed match locks within 2 minutes.
  - Changes not yet sent are kept in a per-account draft (`predictions.pending.<uid>`) and retried.
  - The sticky bar always shows the state: "Enregistré", "Hors connexion" or "Échec, réessayer".
- **Why this over the alternatives:** saving on every tap would send about 20 requests per journée, and a "Save" button loses picks when people forget to press it.
- **Guests** save to the phone only.

**Results on each match:**

- The normal case reads "Raja 2–1 Wydad · Votre pronostic : 1–0 · +1 · Bon résultat (Raja gagne)".
- Other messages: "Pas de pronostic", "Match reporté · votre pronostic est gardé", "Annulé · non comptabilisé", "Enregistré après le coup d'envoi · non comptabilisé", "Résultat corrigé".

**Server time:** every call returns `serverTime`. Countdowns and lock states use the gap between server time and phone time, so a wrong phone clock doesn't mislead the player (and can't unlock anything anyway).

**Match page card, using the same prediction:**

- Before kick-off it shows the same stepper, using the same save call and the same cached data as `/pronostics`.
- After kick-off it shows "Votre pronostic : 2–1 · +3".
- It links to "Pronostiquer toute la journée".

**Prompts that encourage signing up or trying Fantasy:**

- After 3 picks, a guest sees a card that doesn't block anything: "Créez un compte gratuit avant le coup d'envoi pour être classé".
- On the leaderboard, a guest sees their own unranked row: "Vous : 7 pts, non classé".
- After results, signed-in players with no Fantasy team see "Envie d'aller plus loin ? Composez votre équipe Fantasy".

---

## 9. How people find it: entry points, sharing, search engines, reminders

**MVP entry points (three):**

1. **Home.**
   - A Pronostics card right after the upcoming-matches block. For players: "Journée 6 · 3/8 pronostics · verrouillage ven. 20:00". For guests: "Devinez les scores de la journée en 1 minute".
   - A 6th discovery tile, which also makes two neat rows of three.
   - The order of Home is pinned by `index.home-structure.test.ts`; update that test.
2. **Match page.** A "Votre pronostic" card between the score header and the tabs. This is where Google and social-media visitors land.
3. **Matches section.** A third tab, "Matchs | Classement | Pronostics", with the bottom bar's "Matches" item highlighted on `/pronostics`. Casual fans spend their time here; Fantasy players get the league tab.

**Not in MVP:**

- A bottom-bar slot. The bar is full; revisit if the KPIs are strong, for example by moving Profile into the header.
- A Fantasy hub tile.
- News.

**Sharing (links only):**

- **Messages** (Arabic versions too):
  - After predicting: "J'ai fait mes pronostics pour la Journée 6 de la Botola sur BotolaGO. À toi !"
  - After results: "J'ai trouvé 6/8 résultats lors de la Journée 6 (dont 2 scores exacts) sur BotolaGO. Tu peux faire mieux ?"
  - "6/8" means exact scores plus correct outcomes, out of the matches scored.
- **Share options:** the phone's native share sheet, a WhatsApp button (`https://wa.me/?text=`; WhatsApp is the main channel in Morocco), and copy link. Extend `ShareButton` for this.
- **The link:** `https://botolago.com/pronostics?journee=6`.
  - The player's score is not put in the link: it couldn't be trusted, and it would need public profiles.
  - Add tracking tags (`utm_source=share&utm_medium=whatsapp|native|copy&utm_campaign=pronostics`). Plausible reads them, which shows how many visitors each share channel brings. Never put a league invite code in these tags.
- **Link preview:** `/pronostics` gets its own preview title and description, written in both languages ("Pronostics · التوقعات — BotolaGO"), because a preview can't know the reader's language. The image is `/og-image.jpg`, or a fixed `/og-pronostics.jpg` if design provides one.
- **League invite links:** `https://botolago.com/pronostics/ligues/rejoindre#code=XXXX`.
  - The code goes after the `#`. Browsers never send that part to our server, the hosting logs or the analytics tool.
  - The page reads the code and removes it from the address bar. It keeps the code in `sessionStorage` only while a guest signs up (the sign-in prompt currently drops anything after `?`), then joins them and clears it.
  - The landing page reads "{owner} t'invite dans « {league} » · Rejoindre en Pronostics (gratuit)". Fantasy players also see "Tu as une équipe Fantasy ? Rejoins aussi en Fantasy".
  - Shared from the Pronostics league page (owner, right after creating the league or resetting the code) and from Fantasy's create-league screen.

**Search engines:**

- **What is indexed:** only `/pronostics`, rendered on the server with the current journée's matches (public data only). A player's own predictions load on the phone after sign-in and are never in the page HTML.
- **Canonical address:** `https://botolago.com/pronostics`, without `?journee` or `?tab`.
- **Indexing:** `index,follow` only once the feature is promoted and `mode = public`. Before that, `noindex`.
- **Sitemap:** add the page to `SITEMAP_STATIC_PATHS` behind the flag. `robots.txt` doesn't change.
- **`/fr/pronostics` and `/ar/pronostics` aren't possible yet.**
  - The site has no language in its addresses: the language lives in `botolago.language` in the browser, the server always renders French, and `head()` can't see the language.
  - Adding language addresses for one page would create duplicate pages. It's a site-wide decision, and Pronostics follows it later.
  - So there are no hreflang tags for now.
- **Pages like `/pronostics/journee-6`:** not in MVP. They are only worth it with unique content (for example, "65 % voient Raja gagner"), and even then it's about 30 pages per season, not thousands.

**Reminders: not at launch.**

- **Why not:** email is off in production. The free Resend plan gives about 90 usable emails a day, shared with match emails. And adding an email type means a new email type value, new FR/AR templates, rewriting four large email functions (planning, staleness, fan-out, claiming), and changing and redeploying the sending function.
- **When email is live (V1.1):** one email per journée.
  - **Who:** **only** people who predicted in the previous journée **and** still have open matches with no prediction.
  - **When:** 24 hours before the journée's first confirmed kick-off, not a fixed Thursday (Journée 1 started on a Thursday).
  - **Not to:** Fantasy players who have never tried Pronostics. That would be cross-promotion, and no marketing consent is recorded.
  - **How:** model it on the existing `deadline_24h` email, with its own on/off setting in the user's preferences.
- **Until then**, the countdown on the Home card is the reminder.

---

## 10. French and Arabic

**Keys:**

- About 140 new keys, counting plural forms (about 106 for the game, plus about 34 for leagues and invites), mostly under `predictions.*`, plus `matches.tab.predictions` and one Home discovery key. The full FR/AR list is in Appendix B.
- **The owner reviews the Arabic.** Step 9 produces a review sheet: every Arabic string next to its French version, plus Arabic screenshots of each screen at 390 px (predict, results, leaderboard, leagues, invite page, guest prompts, errors). Stage 4 waits for the owner's corrections.
- Reuse existing keys where the same word already exists (`nav.fantasy`, `fpl.gameweek`, `standings.points_*`, `article.share`, `fpl.copied`).
- Have a native speaker review the Arabic before Stage 4.

**Gate rules:**

- The translation check compares key counts to fixed baselines.
- Every key must be used through a literal `t("…")` call.
- Plurals use `_one/_two/_few/_other` keys **in both languages** (French repeats forms), picked in literal branches as `src/components/matches/standings-copy.ts` does.
- That way the counts of unused keys and non-literal calls don't move.

**Terms:** "Pronostics" / "التوقعات"; "Journée" / "الجولة" (already used); "Score exact" / "نتيجة دقيقة"; "Bon résultat" / "نتيجة صحيحة"; "Reporté" / "مؤجلة".

**Right-to-left checklist:**

- **Match row:**
  - The home team comes first in the markup, so in Arabic it sits on the right, with its stepper beside it.
  - Never print a score as one string like "2–1": inside an Arabic paragraph it displays as "1–2". Use three elements (home number, dash, away number) with a `<bdi>` around each number, as `DESIGN_SYSTEM_V2.md` requires.
- **Steppers:** they follow the reading direction and so mirror in Arabic. The + and − icons themselves don't flip.
- **Share text:** wrap scores and team names in direction-isolation marks (U+2068 … U+2069), so WhatsApp shows them in the right order.
- **Numbers:** Western digits via `ar-MA` (the house rule).
- **Dates and times:** `Africa/Casablanca` through the existing helpers; day headings via `groupByMatchDay`.
- **Club names:** they come from `app.team_translations` in the requested language, and cached data is keyed by language.
- **Leaderboards:** names use `dir="auto"`, and ties show "=". In the "+3" badges the sign stays before the number (`<bdi>`).
- **Status labels and errors:** every server error code is mapped to a translated message (`prediction_locked`, `predictions_unavailable`, `account_banned`, `league_access_denied`, network error). Map them explicitly, because the generic Fantasy error mapper is known to lose codes.
- **Page titles:** `head()` is French only (a site-wide limit). The Arabic title is set after load, as other pages already do.

---

## 11. Measuring it

Today the app has **no visitor analytics**, and the privacy policy says no audience-measurement tool is used (`src/content/legal/documents.ts`; a test expects the policy to change if one is added).

**What the database can measure without any tracking** (registered players only):

| KPI                                               | How                                                                                                                                                                                                  |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2. Completion rate                                | Per journée: players who predicted every match of the journée that ended final ÷ players with at least one prediction (compare `prediction_standings.scored_count` with the number of final matches) |
| 3. Week-over-week retention                       | Players with predictions in journée N who also predicted in N+1 ÷ players in N                                                                                                                       |
| 5. Predictor → Fantasy within 30 days             | Players with no Fantasy team at their first prediction whose `fantasy_teams.created_at` falls within 30 days of it ÷ those players                                                                   |
| 4 (partly). Accounts that came through Pronostics | New accounts whose first action was a guest import (`prediction_guest_claims`)                                                                                                                       |
| 1 (partly). Participation of signed-in users      | Players with at least one prediction in week W ÷ signed-in users active in W (the figure on the admin dashboard)                                                                                     |

**Decided: a cookie-free tool plus a privacy-policy update.**

> **Changed 2026-09-25 (owner):** Seline replaces Plausible, and it is switched on. The owner created the Seline project for `botolago.com` and asked for its script on every page. Same approach as below (page views cleaned before they leave the phone, the same five events, names only), with the privacy policy naming Seline from version 1.2. How it is installed: `docs/backend/PREDICTIONS_OPERATIONS_RUNBOOK.md`, "Audience measurement (Seline)". The Plausible notes below are kept as the record of the first choice.

**Which tool: Plausible Analytics.**

- It uses no cookies and stores nothing on the phone, and it is hosted in the EU (Germany) on every plan.
- Plans start at about $9/month; custom events are included.
- Umami's free cloud plan was considered, but EU-only hosting isn't clear for its cloud version, and self-hosting would add servers to run. The privacy policy already names EU regions for its processors.
- **The account exists:** the owner created it on 24 Sept, signing in with GitHub.
- **Next owner steps in Plausible (a few minutes):**
  - Add the site `botolago.com`, with the reporting time zone set to Africa/Casablanca.
  - Copy the script snippet Plausible shows on the site's installation page and pass it to the coding session. It isn't secret.
  - **Don't paste it into the site yourself yet** (for example through Lovable). It must go live in the same release as the privacy-policy update.
  - When the code ships, add the 5 custom events below as "goals", so they show up in the dashboard.

**How it's wired, with no identifiers:**

- The Plausible script is added once, in the root layout (`src/routes/__root.tsx`), behind a new build flag, `ANALYTICS_ENABLED`, whose gated surfaces are the script and the privacy-policy rows. It counts page views on all pages, which gives the "weekly visitors" figure.
- One small helper, `src/lib/analytics.ts` (`track(name)`), does nothing on the server, in mock mode, or when the script didn't load.
- The events use **names only, with no extra details**, so the cheapest plan is enough. Plausible's custom properties need a higher plan and aren't needed here.
- Signed-in players' activity comes from the database, which is exact, so the only client events needed are these five:

| Event                              | Fired when                                                       | Deduplicated how (no identifier)                            |
| ---------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| `pronostics_guest_start`           | A guest makes their first prediction of a journée on this phone  | the guest store remembers which journées this phone started |
| `pronostics_guest_start_returning` | Same moment, when this phone also predicted the previous journée | the same memory                                             |
| `pronostics_guest_complete`        | A guest has predicted every open match of the journée            | the guest store remembers "completed" journées              |
| `pronostics_signup_click`          | A guest taps "Créer mon compte" in Pronostics                    | –                                                           |
| `pronostics_share`                 | Any share action (Pronostics or league invite)                   | –                                                           |

**All five KPIs, and where each number comes from:**

| KPI                                   | Numerator                                                                                                                | Denominator                                                   | Source                                                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Participation (weekly)             | signed-in predictors that week (database) + `pronostics_guest_start` that week                                           | unique visitors that week (Plausible)                         | both. Caveat: tools without cookies count a person once per day, so a weekly visitor count over-counts people who come on several days. The rate is a floor; follow the trend |
| 2. Completion (per journée)           | signed-in players who predicted every match that ended final (database) + `pronostics_guest_complete`                    | signed-in starters + `pronostics_guest_start`                 | both                                                                                                                                                                          |
| 3. Week-over-week retention           | signed-in: players of journée N who also played N+1 (database, exact). Guests: `pronostics_guest_start_returning` in N+1 | signed-in players of N; guests: `pronostics_guest_start` in N | both                                                                                                                                                                          |
| 4. Guest → account                    | guest imports with at least one prediction sent (`prediction_guest_claims`, exact)                                       | `pronostics_guest_start` in the same period                   | both                                                                                                                                                                          |
| 5. Predictor → Fantasy within 30 days | players with no Fantasy team at their first prediction who create one within 30 days                                     | those players                                                 | database, exact                                                                                                                                                               |

**Also measured from the database:** leagues joined through Pronostics, and invite joins per league.

**Privacy-policy changes** (owner-approved wording, in FR and AR, in `src/content/legal/documents.ts`):

1. Processor table: replace "Aucun outil de mesure d'audience / لا تُستعمل أي أداة لقياس الجمهور" with "Plausible Analytics: pages vues et événements agrégés, sans cookie ni identifiant, Union européenne (Allemagne)", and its Arabic version.
2. Cookie paragraph: state that audience measurement uses no cookie and stores nothing on the device.
3. Storage: predictions made without an account stay in the device's local storage until the person creates an account, needed for the service they asked for.
4. Update `src/content/legal/legal-content.test.ts`, item 7, which is written to force exactly this review.
5. Check with whoever handles the CNDP declaration (currently "en cours") whether analytics and Pronostics need to be added to it.

**Query sketches for the database KPIs:** Appendix C.

---

## 12. Security and cheating

**Required before launch:**

1. **The lock is checked in the database**, in the same statement and with the database clock (§5), for both saves and imports.
2. **The late rule** voids picks made after the real kick-off (§5).
3. **One prediction per player per match:** a unique key, with "insert or update".
4. **Writing needs an account.** Tables are not open to the app, and guests never write to the server.
5. **Input limits:** at most 16 items per save and 40 per import; goals 0–20; ids must be valid; current season and Botola Pro only.
6. **The `mode` switch** (off/testers/public) is checked inside every database function. Calling a function directly gets exactly the same rules as the app.
7. **Banned players** can't write (the `refuse_banned_actor` trigger) and are left off leaderboards.
8. **Only finished and final matches are scored.** This is where the fake 0–0 test lives.
9. **Visitors see masked names.**
10. **The job and operator functions** can't be called by the app at all.
11. **League invite codes**:
    - stored only as a fingerprint plus the last 4 characters;
    - shown in full once;
    - a wrong code gets the same answer as a league that doesn't exist;
    - in links, the code goes after `#`, so it never reaches server logs or analytics;
    - never written to any log.
12. **League limits**:
    - 50 active leagues per player;
    - 500 Pronostics-only members per league;
    - 5 leagues created per player per season.

    Banned players can't join or create (ban trigger). Only members can read a league's ranking.

13. **Fantasy stays unchanged by league membership**: Pronostics never writes `fantasy_league_memberships` or `member_count`. Tests prove Fantasy rankings are identical with and without Pronostics members.

**Can wait:**

- **A per-player limit on how often they can save:** add the existing `assert_notification_user_rate_limit` pattern if abuse appears.
- **A CAPTCHA on sign-up:** already a pre-launch item for accounts in general. Required before prizes.
- **Detecting multiple accounts, an edit-history table, stronger identity checks:** needed only once there are prizes.

**Why the rest is already covered:**

- Replaying a request after kick-off is refused. Before kick-off, it only re-applies the player's own values.
- There is no time field to fake.
- Having many guest identities doesn't matter, because guests aren't ranked.

---

## 13. Database load

- **Each page view:** one call for everyone (`api.predictions_round`: up to 16 matches plus a 30-row summary of journées; well under 10 ms). Signed-in players get one more call (`api.my_predictions`: up to 16 rows).
- **Saving:** 1–3 batched calls per visit (each writes up to 16 rows), not one call per match.
- **Leaderboard:** one call that reads 50 rows from an index, plus one lookup for the player's own row.
- **Scoring:** for each final match, one update over its predictions. Totals are rebuilt only for the players concerned, then one re-rank per affected leaderboard. At most 4 matches per run, short transactions, and only after matches finish.
- **Caching:**
  - Journée data is reused for 60 s. Leaderboards are reused for 5 min, and refreshed sooner when the journée's scoring version changes (`api.predictions_round` returns it).
  - There is no automatic refreshing, except every 2 min while one of the journée's matches is being played and the page is on screen.
  - There are no live data connections.
- **Estimated peak at 5,000 weekly players:** about 30 requests per second in the last 10 minutes before a Friday kick-off.
  - The measured ceiling is about 65 for the whole app.
  - The Fantasy deadline comes 90 minutes earlier, so the two peaks don't overlap.
  - At 10 times that audience, the database size (not the design) becomes the limit.
  - Watch the new functions in `pg_stat_statements`.
- **League pages:** one call reads the league's members from the two membership tables (both indexed by league) and joins their saved totals. It's bounded by the 500-member cap.
- **Fantasy's scoring job and Pronostics-created leagues:** without the filter in §7, every such league would add two empty ranking passes to each Fantasy gameweek close. With the filter, zero.
- **Growth:** about 2.4 million prediction rows per season at 10,000 weekly players (roughly 0.4 GB including indexes). No need to split the table for MVP.
- **Time limits:** visitors' calls are cut off after 3 seconds. Every read here is bounded and uses an index. No helper function is called once per row over a large set (the lesson from News); the match data builder runs for at most 16 rows.

---

## 14. Tests

**Database tests (pgTAP, one file each).** The functions take an explicit "now", as `notification_email_delivery.test.sql` does.

- `predictions_schema_rls`:
  - the tables exist, access rules are forced on, and there is no direct access;
  - visitors can call the public reads but not the saves;
  - visitor-callable functions don't use `app` types.
- `predictions_locking`:
  - open or locked by status;
  - the exact boundary: 1 microsecond before kick-off is open, exactly at kick-off is locked, 1 second after is locked;
  - the placeholder kick-off; `delayed`; `postponed`; a rescheduled match reopens;
  - a kick-off moved earlier, then the late rule;
  - saving is refused after kick-off, and no time parameter exists.
- `predictions_scoring`:
  - every rule case: exact, outcome (home win, away win, draw), miss, 0–0, high scores;
  - **a postponed match with a stored 0–0 is not scored** (today's production case);
  - cancelled and abandoned are void; finished but not finalised waits;
  - a correction re-scores and rebuilds totals; running the job twice changes nothing;
  - a late prediction; a home/away swap; operator void and unvoid; a match moved to another journée.
- `predictions_standings`: ties share a rank; exact scores break ties; season sums; journées played; banned players hidden; a deleted account disappears; page-by-page reading; masked names versus display names.
- `predictions_claim`: open matches are imported; started ones are rejected; the account's version wins; running it twice changes nothing; limits; visitors can't call it.
- `predictions_league`: members only; non-members refused; former members excluded.
- `predictions_league_members`:
  - Joining:
    - the same code joins through Fantasy (`api.join_fantasy_league`) and through Pronostics (both directions);
    - a code with spaces, or in lower case, is accepted;
    - wrong, archived, public and other-season leagues are refused with the same answer;
    - rejoining after leaving works;
    - a Fantasy member joining through Pronostics gets no second row;
    - the limits (50 leagues, 500 members) are refused on time;
    - banned players can't join.
  - Rankings and access:
    - the ranking lists everyone once, whichever way they joined;
    - a visitor can't call any league function.
  - Fantasy isolation:
    - deleting a league (Fantasy's clean-up) removes its Pronostics members;
    - **Fantasy isolation:** `member_count`, `fantasy_league_memberships` and a full Fantasy ranking recalculation are identical before and after Pronostics members join.
- `predictions_league_create`:
  - the owner row is written;
  - `member_count = 0`;
  - the returned code works in Fantasy's join;
  - the per-season creation limit holds;
  - reset makes the old code fail and the new one work;
  - only the owner can reset.
  - Fantasy's league loop skips leagues with no Fantasy member, and the Fantasy rankings are identical to before the filter.
- `predictions_current_round`: season start, middle of a journée, between journées, a rescheduled leftover, a match brought forward, end of season.
- `predictions_mode`: off/testers/public on every function (league functions included); the tester list.

**Bun unit tests:**

- the TypeScript scorer, against the same case list as SQL;
- analytics: `track()` does nothing on the server, in mock mode, or when the flag is off; guest events fire once per journée per phone (start, start returning, complete); an invite code never appears in any tracked address;
- the invite link: the code is read from after `#`, removed from the address bar, and kept only for the sign-up round trip;
- the legal test: when `ANALYTICS_ENABLED` is on, the privacy policy names Plausible in FR and AR;
- the guest store: versions, corrupt data, blocked storage, pruning;
- the save queue: delay, one request at a time, saving just before a lock, retry;
- zod contracts, the feature-flag surfaces list, the sitemap, and the translation check.

**Playwright (mock data, FR and AR, at 360, 390 and 430 px):**

- **Guest journey:**
  1. Predict every match.
  2. Close and reopen: the picks are still there.
  3. Move the clock past the first kick-off (Playwright's clock): that match locks.
  4. Results show local points.
  5. Register: the import summary appears, the picks are on the account, and the player appears on the leaderboard.
- **Signed-in journey:** predict, edit, lock, results, leaderboard, league tab, and the match page card showing the same prediction.
- **Phone clock 2 hours off:** lock states still follow server time (the mock keeps its own server time).
- **League journey:**
  1. A guest opens an invite link, signs up, and lands in the league.
  2. They predict and appear in the league's Pronostics ranking.
  3. A Fantasy member sees the same ranking in the Fantasy league's Pronostics tab.
  4. The guest leaves the league.
  5. The code never shows in the address bar after the page loads.
- **Existing check:** add `/pronostics` to `anonymous.acceptance`.
- **Measurement rules from `CLAUDE.md`:**
  - Check overflow with element boxes, not `scrollWidth === clientWidth` (the page clips overflow, so that check misses it).
  - Read contrast from rendered pixels.
  - Run the dev server on its own port.

**Stage 2 rehearsal with the real clock (staging):** lock at the real kick-off second, finalisation, a correction, a postponement and reschedule, and a guest import. Save the evidence.

---

## 15. Rollout, feature flag, operations

**Three switches:**

- **The database `mode`** (`off` → `testers` → `public`), in `app_private.prediction_settings`.
  - This is the real gate: checked inside every database function, instant, no deploy needed.
  - `testers` means only the accounts in `tester_user_ids`. Decided: **only the owner's account.**
- **Build flag `PRONOSTICS_ENABLED`** in `src/lib/feature-flags.ts`: the `/pronostics` page exists.
  - While `mode` isn't `public` (and the viewer isn't a tester), the page shows "Bientôt disponible" with `noindex`.
  - When the flag is off, the page redirects to Home, like News and Prizes do.
- **Build flag `PRONOSTICS_PROMOTED`:** the entry points (Home card and tile, Matches tab, match card, league tab), the sitemap and indexing.
  - Each flag lists the surfaces it hides, as the house convention requires.
  - The entry points also hide themselves when `mode` is `off`.

| Stage                     | What happens                                                                                                                                                                                                                                                                                                                                                                                                                      | Move on when                                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Local                  | Local Supabase replay, pgTAP, Bun, Playwright (mock)                                                                                                                                                                                                                                                                                                                                                                              | CI is green on both required jobs                                                                                                                                     |
| 2. Staging                | Staging has no real matches. Seed a synthetic "2089/90" season, following the existing "2089/90 Capacity" convention, with a journée whose kick-offs are minutes away. Drive status changes and corrections through the real `api.ingest_football_fixture`. Use test accounts. First check that nothing else is writing to staging                                                                                                | The real-clock rehearsal passes and the evidence is saved                                                                                                             |
| 3. Production, owner only | Apply the migrations (`mode` `off`, job idle) → verify → set `mode` to `testers` with `tester_user_ids` = the owner's account, and `PRONOSTICS_ENABLED` on. The owner tests the entry points on a preview deployment of a small PR that turns `PROMOTED` on (not merged before Stage 5). Run it over one real journée, including creating a league, joining it from a second test account the owner controls, and the invite link | One journée predicted, locked, scored and ranked correctly; the league ranking correct                                                                                |
| 4. Small public launch    | `mode` `public`; `PROMOTED` still off. Share the link in the owner's channels                                                                                                                                                                                                                                                                                                                                                     | After 1–2 journées: no scoring errors, no late saves accepted, imports succeed more than 95 % of the time, calls are fast (95 % under 300 ms), no database CPU spikes |
| 5. Everyone               | `PROMOTED` on: entry points, sitemap, indexing                                                                                                                                                                                                                                                                                                                                                                                    | –                                                                                                                                                                     |

**Needed before Stage 4:**

- the live score refresh switched on (steps below; it can be done now, independently of Pronostics);
- a Plausible account (owner), the `ANALYTICS_ENABLED` build, and the privacy-policy update, all live together;
- the owner's review of the Arabic (§10).

**Switching on the live score refresh (decided: yes). A production write: it runs only on the owner's explicit go-ahead for this operation.**

**Done. Record of the write** (database `tkewgajrljbwgwedqsxn`, 24 Sept 2026):

- **Before:** at 19:15:27 UTC, no database job was running, and no GitHub workflow run was in progress or queued.
- **Dry run (19:15:4x):** it produced exactly `mode=off`, the functions address set, `football_live_refresh_enabled=true`, `activated_at=null`. A re-read confirmed it was rolled back.
- **Applied at 19:15:55 UTC:** `notification_email_configure('off', 'https://tkewgajrljbwgwedqsxn.supabase.co/functions/v1', null, true)`.
- **After:**
  - email `mode` is still `off`, and `activated_at` is still empty (email was never activated);
  - the live refresh is on;
  - the change is logged as audit row #3 (`notification_email_configured`).
- **Verification:** the first live calls come with the 20:00 UTC match (Amal Tiznit – Ittihad Tanger). Read-only check-ins are scheduled for 20:20 and 22:25 UTC.
- **Repository record:** the build session should add a short `docs/production/APPLIED_2026_09_24_LIVE_REFRESH_ON.md`, because this planning session wasn't allowed to change repository files.
- **What's already in place:**
  - `football-live-refresh` is deployed (production, 24 Sept).
  - The Vault secret `botolago_scheduler_token` exists.
  - The scheduled job `football-live-refresh` runs every 15 minutes and currently answers "disabled".
- **What's missing:** the settings row has no functions address, and the refresh is off.
- **Email stays off:** the mode argument is passed explicitly as `'off'`. The function refuses an empty mode (`notification_email_mode_invalid`); empty values only work for the _other_ arguments.
- **Steps**, following `CLAUDE.md` (dry run first) and `AGENTS.md` (check nothing else is writing, read before and after):
  1. Read the settings row (`mode`, `functions_base_url`, `football_live_refresh_enabled`).
  2. Dry run: the same call inside a `DO` block that ends with a deliberate `raise`, reporting the new values. Re-read to confirm nothing changed.
  3. Run it for real: `select app_private.notification_email_configure('off', 'https://tkewgajrljbwgwedqsxn.supabase.co/functions/v1', null, true);`
  4. Read the settings row again.
  5. Verify at the next match: from 10 minutes before kick-off, the job's answer becomes "invoked"; `net._http_response` shows HTTP 200; the fixture's `provider_updated_at` moves forward during the match; the fixture reaches `finished` with `finalized_at` set shortly after the final whistle.
- **To undo:** `select app_private.notification_email_configure('off', null, null, false);` This is the documented "pause everything" command; the functions address is kept.
- **Cost:** it only calls SportsMonks while a match is about to start or being played (about 4 calls an hour, around 50 on a busy match day). That is negligible for both SportsMonks and Supabase.
- **Once it's on:** `AGENTS.md` already tells anyone about to write fixtures or notifications to pause it and restore it afterwards.

**Timing:** don't apply the production migrations while Fantasy GW1 is being locked and scored. It is the first real run of that pipeline, and it needs a quiet database (`AGENTS.md`: one writer at a time).

**Rolling back:**

- `select app_private.predictions_configure('off', …)` stops everything at once: saves are refused, pages show "indisponible", the job idles, and the data is kept.
- The flags can then be turned off in the next deploy.
- Removing the feature completely is a forward migration that drops the new objects. Nothing existing depends on them.

**Operations:**

- Add the new job to `AGENTS.md`'s list of scheduled database writers, with how to pause it.
- Write `docs/backend/PREDICTIONS_OPERATIONS_RUNBOOK.md`: status, void, rescore, pause.
- No admin screen is needed for MVP. A read-only card on the admin dashboard can come later.

---

## 16. Files likely to change

**New:**

- **Migrations:** `supabase/migrations/<ts>_predictions_schema.sql`, `<ts>_predictions_rules.sql`, `<ts>_predictions_api.sql`, `<ts>_predictions_scoring_job.sql`.
- **Database tests:** `supabase/tests/database/predictions_*.test.sql` (8 files, §14).
- **Data layer:** `src/backend/predictions/{contracts,supabase-repository,mock-repository,errors,scoring,scoring-cases,guest-store,save-queue}.ts`, plus tests; `src/services/predictions.ts`.
- **Screens:** `src/components/predictions/*` (§8); routes `src/routes/pronostics.tsx` (layout), `pronostics.index.tsx`, `pronostics.ligues.index.tsx`, `pronostics.ligues.rejoindre.tsx`, `pronostics.ligues.$leagueId.tsx`.
- **Analytics:** `src/lib/analytics.ts` (plus its test).
- **Database tests (leagues):** `predictions_league_members.test.sql`, plus `predictions_league_create.test.sql`.
- **End-to-end test:** `tests/e2e/predictions.leagues.e2e.ts`.
- **End-to-end tests:** `tests/e2e/predictions.guest.e2e.ts`, `tests/e2e/predictions.signed-in.e2e.ts`.
- **Scripts:** `scripts/backend/apply-<ts>-predictions.sql` (plus its test); `scripts/backend/predictions-staging-rehearsal.sql` (plus a clean-up script).
- **Docs:** `docs/production/APPLIED_2026_09_24_LIVE_REFRESH_ON.md` (record of the live-refresh switch-on, §15), `docs/backend/PREDICTIONS_DOMAIN_PLAN.md` (this plan), `docs/backend/PREDICTIONS_OPERATIONS_RUNBOOK.md`, `docs/production/APPLIED_<date>_PREDICTIONS.md`, `docs/engineering/tasks/BG-0146/*`.

**Modified:**

- **Flags and translations:** `src/lib/feature-flags.ts` (plus its test; new flags `PRONOSTICS_ENABLED`, `PRONOSTICS_PROMOTED`, `ANALYTICS_ENABLED`), `src/i18n/dictionaries.ts`.
- **Analytics script:** `src/routes/__root.tsx` (the Plausible script in the page head, behind `ANALYTICS_ENABLED`).
- **Entry points:** `src/routes/index.tsx` (plus `index.home-structure.test.ts`), `src/routes/matches.$matchId.tsx`, `src/components/matches/MatchesTabs.tsx`, `src/components/shell/primary-nav.ts` (plus the shell tests), `src/routes/fantasy.leagues.$leagueId.tsx`.
- **Sign-in and sharing:** `src/auth/AuthProvider.tsx`, `src/components/auth/AuthPromptDialog.tsx` (optional), `src/components/fantasy-lists/ShareButton.tsx`, and Fantasy's `InviteCode` component ("Partager le lien d'invitation"; coordinate with PR #183, which moves it).
- **Other app files:** `src/lib/sitemap.ts` (plus its test), `src/lib/storage.ts` (`STORAGE_KEYS`).
- **Configuration:** `.env.example`, `.env.production` (`VITE_PREDICTIONS_DATA_MODE`).
- **Existing test:** `tests/e2e/anonymous.acceptance.e2e.ts`.
- **Legal and process:** `src/content/legal/documents.ts` (Plausible row, cookie paragraph and guest storage, in FR and AR; wording approved by the owner), `src/content/legal/legal-content.test.ts` (item 7), `AGENTS.md` (scheduled writers), `docs/engineering/LAUNCH_LEDGER.yaml` (next free id: BG-0146).

**Regenerated:** `src/backend/generated/database.types.ts`, `src/routeTree.gen.ts`.

---

## 17. Database changes (not applied)

**Five migrations:**

1. **Schema:** 7 tables (including `app.prediction_league_members`), checks, indexes, access rules forced on, permissions removed, the ban and `updated_at` triggers, and the settings row with `mode = off`.
2. **Rules:** points, "is this match open", current journée, and access. These are pure or read-only functions, each taking an explicit "now".
3. **App-facing functions:** 11 `api.*` functions with explicit permissions. The league functions are `join_prediction_league`, `leave_prediction_league`, `my_prediction_leagues`, `create_prediction_league` and `reset_prediction_league_invite_code`. Visitors can call `predictions_round` and `predictions_leaderboard`; signed-in players, the rest. The job and operator functions are open to no app role.
4. **Scoring:** the run function, the scoring-record logic, the operator functions, the scheduled job `predictions-score-tick` every 5 minutes, and a job that clears old run history.

5. **Only after Fantasy GW1 has been scored (needed because league creation was approved):** replace `api.service_fantasy_scoring_league_page` with the same body plus one filter, "the league has at least one active Fantasy member". It must ship with a test proving Fantasy rankings are identical. This is the **only** change to an existing Fantasy function in the whole plan.

**What does not change:**

- No existing table, and no existing function except item 5.
- No filling-in of past data.
- Production data stays untouched until people play.

**Migration timestamps:**

- Pick unused slots after the newest migration on `main` (currently `20260924180200`).
- Check open pull requests first: PR #183 already uses `20260924120000`, which the prizes migration also uses.
- `bun run backend:migrations:check` must pass.

**Also:** regenerate the database types (`backend:types:generate`), and `supabase db lint` must pass.

**Applying to production:**

- Use a guarded apply script: safety checks first, `lock_timeout 5s`, `statement_timeout 120s`.
- Rehearse it ending in `rollback`, then run it with `commit` when the owner says go.
- Record it in `docs/production/APPLIED_…md`, following `RELEASE_ACTIVATION_MIGRATION_RUNBOOK.md`.
- Before running: check nothing else is writing (`AGENTS.md`). These migrations don't write matches or notifications, so pausing email and the live refresh isn't needed, but avoid the time slot of the Fantasy orchestrator's hourly run.

---

## 18. Build order for the coding session

Each step ends with both CI jobs green and can be reviewed on its own.

0.  **Switch on the live score refresh: DONE** (24 Sept, 19:15:55 UTC, on the owner's go-ahead; §15). _Done when:_ one real match is refreshed during play and finalised within about 15 minutes of the final whistle. This is being checked on the 20:00 UTC match.
1.  **Record the owner's decisions** (the table at the top of this plan) and open BG-0146 in the ledger. _Done when:_ the ledger test passes.
2.  **Schema migration.** _Done when:_ the migrations check, a local reset, the `predictions_schema_rls` database test, the database lint and the generated types all pass.
3.  **Rule functions** (points, "is this match open", current journée, access). _Done when:_ the boundary tests and the journée scenario tests pass.
4.  **Write functions:**
    - `save_predictions`, `claim_guest_predictions` and the ban trigger;
    - the league functions `join_prediction_league` and `leave_prediction_league`;
    - `create_prediction_league` and `reset_prediction_league_invite_code`.

    _Done when:_ the locking, claim, mode and league-membership tests pass with two users and a visitor, including the **same invite code working in both Fantasy and Pronostics**, and Fantasy rankings being unchanged.

5.  **Read functions** (`predictions_round`, `my_predictions`, `predictions_leaderboard`, `predictions_league_standings` for both kinds of members, `my_prediction_leagues`). _Done when:_ the database tests pass, including a visitor calling the public reads.
6.  **Scoring job**, scoring record, standings, ranks, operator functions, and the scheduled job (idle while `off`). _Done when:_ the scoring and standings tests pass, including the fake 0–0, correction and run-twice cases.
7.  **Frontend data layer:** contracts, repositories (Supabase and mock), service and data-mode switch, TypeScript scorer, guest store, save queue. _Done when:_ the Bun tests pass.
8.  **`/pronostics` prediction view:** header, switcher, cards, steppers, sticky bar, server loader, page head, flags, FR/AR keys. _Done when:_ typecheck, the translation check and Playwright in FR/AR at 360/390/430 all pass.
9.  **Results and leaderboards** (journée/season, the guest's own row). _Done when:_ the end-to-end, right-to-left and overflow checks pass, and the **Arabic review sheet** (every string plus Arabic screenshots at 390 px) is handed to the owner.
10. **Guest import on sign-in**, with the summary message. _Done when:_ the guest-to-account end-to-end test passes.
11. **Match page card.** _Done when:_ an end-to-end test shows the same prediction on both screens, and the match page's 4-tab test still passes unchanged.
12. **Leagues:**
    - the Pronostics league pages (my leagues, join with a code, the invite landing page with the code after `#`, the league ranking, leave, create, and reset the code);
    - the Fantasy league page's "Pronostics" tab;
    - the "Partager le lien d'invitation" button on Fantasy's invite code.

    _Done when:_ the league end-to-end test (mock data) passes in FR and AR.

13. **Entry points** (Home card and tile, Matches tab, nav highlight), sitemap and sharing. _Done when:_ the Home structure, shell, flag and sitemap tests are updated, and with the flags off nothing shows.
14. **Analytics and privacy policy (decided):** - the Plausible script behind `ANALYTICS_ENABLED`; - the `track()` helper and the 5 guest events; - the privacy-policy changes in FR and AR, and the legal test (item 7).

        The owner creates the Plausible account and approves the wording. *Done when:* the unit and legal tests pass, and a preview build shows page views and a test event in Plausible, with no cookie or local-storage entry from the tool.

    14b. **After Fantasy GW1 has been scored:** the Fantasy league-loop filter (migration 5). _Done when:_ its test shows identical Fantasy rankings.

15. **Documentation:** runbook, the scheduled-writer entry in `AGENTS.md`, the ledger.
16. **Staging rehearsal** (Stage 2), then the production apply (Stage 3), then Stages 4 and 5.

Once the contracts in Appendix A are agreed, steps 7–13 can run alongside steps 2–6, using the mock repository.

---

## 19. Risks

**Critical**

- **Results arrive hours late.** The live refresh and email are off, and matches are refreshed only every 2–8 hours. The "check your results" loop feels broken, and kick-off changes arrive late.
  - _Fix:_ switch the live refresh on for match windows before Stage 4. Meanwhile the late rule keeps things fair.
- **Scoring a match that wasn't played.** The postponed FAR – Raja is stored as 0–0, so everyone who said 0–0 would get wrong points.
  - _Fix:_ score only finished and final matches, and test with exactly this case.

**High**

- **The Botola calendar is messy.** Matches get postponed or brought forward, and journées are published one at a time. This can open the wrong journée by default and make leaderboards confusing.
  - _Fix:_ locks per match, the current-journée rule with its tests, and "provisoire" labels.
- **Analytics must be live, and the privacy policy must match it, before Stage 4.** Decided: Plausible plus a policy update. The risk is launching without them and losing the first journées' data, or turning the script on before the policy says so.
  - _Fix:_ one flag (`ANALYTICS_ENABLED`) switches the script, and the legal test fails if the policy doesn't name the tool.
- **Limited database headroom.** About 65 requests/second measured, and a 3-second time limit for visitors.
  - _Fix:_ saved ranks, one call per page view, limited page sizes, caching and monitoring.
- **League membership opens a second way into Fantasy leagues** (decided: build it now). If done carelessly, it could change Fantasy counts or rankings, and leagues created in Pronostics (with no Fantasy members) could slow Fantasy's gameweek close.
  - _Fix:_ a separate membership table. Pronostics never writes Fantasy memberships or `member_count`. Tests prove Fantasy rankings are identical. The one Fantasy change (the league-loop filter) comes after GW1, with its own test.

**Medium**

- **Guests who register after kick-off lose those picks.** That's the price of option A.
  - _Fix:_ prompt before the first kick-off, and measure it with the claims table.
- **Arabic score direction and copy quality.**
  - _Fix:_ a `<bdi>` around each number, isolated share text, a native review, end-to-end checks.
- **Walkover or awarded matches, or stuck matches, never become final.**
  - _Fix:_ the status report and the operator "void" function.
- **A new scheduled job writes to the database.**
  - _Fix:_ an entry in `AGENTS.md`, an off switch, and the job does nothing while off.
- **Migration timestamps clash with parallel work.** This has already happened.
  - _Fix:_ reserve slots, and rely on the migrations check.
- **Names shown on public leaderboards.**
  - _Fix:_ masked for visitors, and no profile pages.
- **Invite codes leaking.** A code in a shared link could reach logs or analytics, or be forwarded beyond the group.
  - _Fix:_ the code goes after `#` in the link, it's stored only as a fingerprint, and the owner can reset it (in Pronostics; Fantasy owners also get a reset from PR #183).
- **Leagues created by Pronostics-only players block their account deletion,** the same way league ownership already does in Fantasy.
  - _Fix:_ design an ownership transfer or archive step when account deletion is built.

**Low**

- **Weekly visitor counts are approximate.** Tools without cookies count a person once per day, so KPI 1's denominator is inflated and the rate is a floor.
  - _Fix:_ read it as a trend. All the other KPIs rely on exact database numbers or on events deduplicated on the phone.
- **One person with several accounts.** There are no prizes, and each account needs a verified email.
  - _Fix:_ a CAPTCHA before prizes.
- **An older save overwrites a newer one.**
  - _Fix:_ only one save request at a time.
- **The provider swaps home and away.**
  - _Fix:_ goals are matched by team.
- **The draft Firebase migration plan (PR #127).** If it goes ahead, Pronostics would need moving like everything else.
  - _Fix:_ keep the rules small and documented.
- **Build flags depend on how the app is deployed** (Lovable publish or Vercel).
  - _Fix:_ the database `mode` is the instant switch either way.

---

## 20. Final recommendation

**Is this MVP technically right for BotolaGO now? Yes.**

- It adds to the system without disturbing it. It reuses matches, journées, clubs, accounts, leagues and the existing job patterns. It adds 3 player tables, 4 small internal tables and one scheduled job, and changes nothing that exists, except one small, tested Fantasy filter that comes with league creation.
- **The two earlier conditions are met or decided:** the live refresh was switched on on 24 Sept at 19:15:55 UTC, and analytics will be Plausible (account created) with a policy update.
- **Timing:** start the production database work only after Fantasy GW1 has been locked and scored.

**What to change from Fable's MVP:**

1. "Gameweek" means the provider's journée (the same source as Fantasy), not Fantasy's gameweek state. Postponed matches stay in their journée, and journée leaderboards say "provisoire" until complete.
2. Guests play on their phone only. After sign-up, only picks for matches not yet started are imported.
3. Tie-break: points, then exact scores, then a shared rank. Drop "correct outcomes" (it can never break a tie) and "earliest submission" (unfair).
4. No reminder email at launch: email is off and the free plan is tiny. Afterwards: one reminder per journée, only to last journée's players who still have matches to predict, 24 hours before the first kick-off, not on a fixed Thursday.
5. Leagues: one league, two games. Anyone with an account can join a league with its code or invite link, with no Fantasy team needed, and the league's Pronostics ranking includes everyone. (Owner decision.)
6. No bottom-bar slot. The entry points are the Home card, the match page card and the Matches tab.
7. One address, `/pronostics`, without `/fr` or `/ar`, because the site has no language addresses. No per-journée pages yet.
8. Analytics: Plausible, with no cookies or identifiers, plus a privacy-policy update. All five KPIs become measurable. (Owner decision.)

**Smallest version worth launching:**

- `/pronostics` covering the current and next journée: a lock per match, and results with points and the reason for them;
- guest play, with import on sign-up;
- journée and season leaderboards;
- the match page card, the Home card and link sharing;
- leagues: create, join with a code or link, league ranking, leave, and the Fantasy league tab;
- Plausible and the updated privacy policy.

**Wait for V2:**

- bonus questions, first scorer, streaks, badges, prizes and sponsors;
- the reminder email (V1.1);
- one-tap "also play Fantasy in this league" (V1.1);
- archiving a league from Pronostics, and removing members;
- public profiles;
- per-journée search pages with community stats;
- image cards and push notifications;
- average and monthly leaderboards;
- server-side guest tokens (option C), if many guest picks turn out to be lost at sign-up;
- a bottom-bar slot;
- live "points if the match ended now".

**Owner decisions (24 Sept 2026):**

1. Live score refresh: **yes**. It's ready to run as described in §15, on an explicit go-ahead for that write.
2. Analytics: **a cookie-free tool plus a privacy-policy update**. Plausible is recommended; the owner creates the account.
3. Leagues: **Pronostics-only membership now**.
4. Arabic review: **the owner**.
5. Stage 3 testers: **the owner only**.

6. League creation by Pronostics-only players: **yes**.
7. Live refresh: **switched on** (§15 record).
8. Plausible account: **created**.

**Still open:** nothing. The next step is the owner authorising the coding session. The build then follows §18, starting from step 1.

---

## Appendix A — Database function contracts

Every function below:

- is `security definer` with `set search_path = ''`;
- takes and returns JSON;
- returns `schemaVersion: 1`.

**1. `api.predictions_round(p_round_number integer default null, p_language text default 'fr') returns jsonb`**

- Callable by: visitors, signed-in users, service role.
- Response:

```json
{
  "schemaVersion": 1,
  "mode": "public",
  "allowed": true,
  "serverTime": "2026-09-26T15:02:11Z",
  "season": { "id": "…", "label": "2026/2027" },
  "round": {
    "id": "…",
    "number": 6,
    "name": "6",
    "state": "in_progress",
    "nextLockAt": "…",
    "provisional": true,
    "scoringVersion": 12
  },
  "rounds": [{ "number": 1, "state": "provisional" }],
  "fixtures": [
    {
      "id": "…",
      "kickoffAt": "…",
      "kickoffConfirmed": true,
      "status": "not_started",
      "open": true,
      "home": {
        "id": "…",
        "name": "Raja Casablanca",
        "shortName": "Raja",
        "code": "RCA",
        "crestUrl": "…"
      },
      "away": { "id": "…", "name": "…", "shortName": "…", "code": "…", "crestUrl": "…" },
      "result": null,
      "final": false,
      "void": false,
      "corrected": false
    }
  ]
}
```

- Errors: `PT400 invalid_language`, `PT404 round_not_found`.
- When `mode` isn't `public` and the caller isn't allowed, only `{ mode, allowed: false }` comes back.

**2. `api.my_predictions(p_round_number integer default null, p_fixture_id uuid default null) returns jsonb`**

- Callable by: signed-in users.
- Response:

```json
{
  "serverTime": "…",
  "items": [
    {
      "fixtureId": "…",
      "home": 2,
      "away": 1,
      "submittedAt": "…",
      "points": 3,
      "resultKind": "exact"
    }
  ],
  "summary": {
    "predicted": 6,
    "eligible": 8,
    "points": 9,
    "exact": 2,
    "rank": 12,
    "provisional": true
  }
}
```

**3. `api.save_predictions(p_items jsonb) returns jsonb`**

- Callable by: signed-in users.
- Input: `[{ "fixtureId": "…", "home": 2, "away": 1 }]`, 1 to 16 items, each match at most once.
- Response: `{ "serverTime": "…", "results": [ { "fixtureId": "…", "status": "saved|unchanged|locked|not_eligible|invalid", "home": 2, "away": 1, "submittedAt": "…" } ] }`.
- Errors: `PT401 not_authenticated`, `PT403 predictions_unavailable`, `PT403 account_banned`, `PT400 invalid_prediction_payload`.

**4. `api.claim_guest_predictions(p_items jsonb) returns jsonb`**

- Callable by: signed-in users.
- Input: `[{ "fixtureId", "home", "away", "homeTeamId", "awayTeamId" }]`, at most 40 items.
- Response: `{ "imported": 5, "keptExisting": 2, "started": 1, "invalid": 0, "results": [ … ] }`.

**5. `api.predictions_leaderboard(p_scope text, p_round_number integer default null, p_after_rank integer default null, p_after_id uuid default null, p_limit integer default 50) returns jsonb`**

- Callable by: visitors and signed-in users.
- `p_scope` is `round` or `season`. `p_limit` is between 1 and 100. The two cursor values must be given together or not at all.
- Response: `{ "scope": "round", "round": 6, "provisional": true, "total": 1240, "items": [ { "rank": 1, "tied": false, "name": "…", "points": 14, "exact": 3, "roundsPlayed": null, "isMe": false } ], "nextCursor": { "rank": 50, "id": "…" } | null, "me": { "rank": 12, "points": 9, "exact": 2 } | null }`.

**6. `api.predictions_league_standings(p_league_id uuid, p_round_number integer default null) returns jsonb`**

- Callable by: signed-in users.
- Response: `{ "league": { "id": "…", "name": "…" }, "scope": "season|round", "items": [ { "rank", "tied", "name", "points", "exact", "isMe" } ], "notPlayed": 3 }`, up to 500 members.
- Errors: `PT403 league_access_denied`.

**7. `api.join_prediction_league(p_invite_code text) returns jsonb`**

- Callable by: signed-in users.
- The code is normalised and fingerprinted exactly like `api.join_fantasy_league`: `encode(extensions.digest(convert_to(upper(btrim(code)), 'UTF8'), 'sha256'), 'hex')`. The app strips inner spaces first.
- Only private, active leagues of the current Fantasy season are accepted.
- Response: `{ "leagueId": "…", "name": "…", "joined": true | false, "via": "predictions" | "fantasy" }`. `joined: false` means already a member, through either path.
- Errors: `PT404 invite_code_invalid` (the same for a wrong code, an archived league or another season); `PT409 league_limit_reached` (50 leagues per player, 500 Pronostics members per league); `PT403 predictions_unavailable`; `PT403 account_banned`.

**8. `api.leave_prediction_league(p_league_id uuid) returns jsonb`**

- Callable by: signed-in users.
- Leaves the Pronostics-only membership. The owner can't leave (`PT409 league_owner_cannot_leave`). Fantasy membership is never touched.

**9. `api.my_prediction_leagues() returns jsonb`**

- Callable by: signed-in users.
- Response: `{ "items": [ { "leagueId": "…", "name": "…", "via": "fantasy" | "predictions", "role": "owner" | "member", "members": 12, "myRank": 3, "inviteCodeHint": "A1F9" (owner only) } ] }`, at most 50 items.

**10. `api.create_prediction_league(p_name text) returns jsonb`**- Callable by: signed-in users.

- Creates a private league in the current Fantasy season, with `owner_user_id` = the caller, `member_count = 0`, and the code minted and fingerprinted exactly like `api.create_fantasy_league`. Writes the owner row in `app.prediction_league_members`.
- A second tap with the same name within 60 seconds returns the same league. The Fantasy idempotency table isn't used, because its rows would block account deletion.
- Response: `{ "leagueId": "…", "name": "…", "inviteCode": "…" }`. The code is shown once.
- Errors: `PT400 validation_failed` (name 3–80 characters); `PT409 league_create_limit_reached` (5 per season).

**11. `api.reset_prediction_league_invite_code(p_league_id uuid) returns jsonb`**- Callable by: the league's owner (`owner_user_id = auth.uid()`), for private, active leagues.

- Mints a new code and replaces the fingerprint and hint, so the old code stops working at once.
- Response: `{ "inviteCode": "…" }`, shown once. Every refusal is `PT403 league_access_denied`.

**Internal functions** (no app role can call them):

- `app_private.prediction_points`
- `app_private.prediction_fixture_open`
- `app_private.predictions_current_round`
- `app_private.predictions_access_allowed`
- `app_private.predictions_score_tick`
- `app_private.predictions_configure`
- `app_private.predictions_void_fixture`, `…_unvoid_fixture`, `…_rescore_fixture`
- `app_private.predictions_status`

---

## Appendix B — Translation keys (draft; the Arabic needs a native review)

Every key exists in both languages. Plural sets use `_one/_two/_few/_other` in **both** languages, picked in literal branches, as `standings-copy.ts` does.

**The page:**

| Key                            | FR                                                                                                                                                            | AR                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `predictions.title`            | Pronostics                                                                                                                                                    | التوقعات                                                                                                           |
| `predictions.title_round`      | Pronostics — Journée {n}                                                                                                                                      | التوقعات — الجولة {n}                                                                                              |
| `predictions.meta_title`       | Pronostics Botola Pro · BotolaGO                                                                                                                              | توقعات البطولة الاحترافية · BotolaGO                                                                               |
| `predictions.meta_description` | Pronostiquez gratuitement les scores de la Botola Pro : 3 points pour le score exact, 1 point pour le bon résultat. Classements par journée et sur la saison. | توقّع مجانًا نتائج البطولة الاحترافية: 3 نقاط للنتيجة الدقيقة ونقطة واحدة للنتيجة الصحيحة. ترتيب لكل جولة وللموسم. |
| `predictions.og_title`         | Pronostics · التوقعات — BotolaGO                                                                                                                              | Pronostics · التوقعات — BotolaGO                                                                                   |
| `predictions.progress`         | {done}/{total} pronostics                                                                                                                                     | {done}/{total} توقعات                                                                                              |
| `predictions.all_done`         | Tous vos pronostics sont faits                                                                                                                                | أكملت كل توقعاتك                                                                                                   |
| `predictions.next_lock`        | Prochain verrouillage : {when}                                                                                                                                | الإغلاق القادم: {when}                                                                                             |
| `predictions.tab.predict`      | Mes pronostics                                                                                                                                                | توقعاتي                                                                                                            |
| `predictions.tab.board`        | Classement                                                                                                                                                    | الترتيب                                                                                                            |

**Journée switcher and states:**

| Key                                   | FR                 | AR             |
| ------------------------------------- | ------------------ | -------------- |
| `predictions.round.previous`          | Journée précédente | الجولة السابقة |
| `predictions.round.next`              | Journée suivante   | الجولة التالية |
| `predictions.round.state_upcoming`    | À venir            | قادمة          |
| `predictions.round.state_open`        | Ouverte            | مفتوحة         |
| `predictions.round.state_in_progress` | En cours           | جارية          |
| `predictions.round.state_completed`   | Terminée           | منتهية         |
| `predictions.round.state_provisional` | Provisoire         | مؤقتة          |

**Match cards and steppers:**

| Key                                 | FR                                                   | AR                           |
| ----------------------------------- | ---------------------------------------------------- | ---------------------------- |
| `predictions.fixture.until`         | Jusqu'à {time}                                       | حتى {time}                   |
| `predictions.fixture.locks_in`      | Verrouillage dans {duration}                         | يُغلق بعد {duration}         |
| `predictions.fixture.time_tbc`      | Horaire à confirmer                                  | التوقيت غير مؤكد بعد         |
| `predictions.fixture.locked`        | Verrouillé                                           | مُغلق                        |
| `predictions.fixture.postponed`     | Reporté · votre pronostic est gardé                  | مؤجلة · نحتفظ بتوقعك         |
| `predictions.fixture.rescheduled`   | Nouvelle date : vous pouvez modifier votre pronostic | موعد جديد: يمكنك تعديل توقعك |
| `predictions.fixture.cancelled`     | Annulé · non comptabilisé                            | ملغاة · لا تُحتسب            |
| `predictions.fixture.abandoned`     | Arrêté · non comptabilisé                            | متوقفة · لا تُحتسب           |
| `predictions.fixture.no_prediction` | Pas de pronostic                                     | بدون توقع                    |
| `predictions.stepper.group`         | Buts de {team}                                       | أهداف {team}                 |
| `predictions.stepper.increase`      | Ajouter un but à {team}                              | إضافة هدف لـ{team}           |
| `predictions.stepper.decrease`      | Retirer un but à {team}                              | إنقاص هدف من {team}          |

**Results:**

| Key                               | FR                                                  | AR                                     |
| --------------------------------- | --------------------------------------------------- | -------------------------------------- |
| `predictions.result.yours`        | Votre pronostic : {score}                           | توقعك: {score}                         |
| `predictions.result.final`        | Score final : {score}                               | النتيجة النهائية: {score}              |
| `predictions.result.exact`        | Score exact                                         | نتيجة دقيقة                            |
| `predictions.result.outcome_win`  | Bon résultat ({team} gagne)                         | نتيجة صحيحة (فوز {team})               |
| `predictions.result.outcome_draw` | Bon résultat (match nul)                            | نتيجة صحيحة (تعادل)                    |
| `predictions.result.miss`         | Raté                                                | توقع خاطئ                              |
| `predictions.result.late`         | Enregistré après le coup d'envoi · non comptabilisé | سُجِّل بعد انطلاق المباراة · لا يُحتسب |
| `predictions.result.pending`      | En attente du résultat officiel                     | في انتظار النتيجة الرسمية              |
| `predictions.result.corrected`    | Résultat corrigé                                    | نتيجة مُصحَّحة                         |

**Scoring rules:**

| Key                           | FR                                                                           | AR                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `predictions.rules.title`     | Comment gagner des points                                                    | كيف تجمع النقاط                                                                     |
| `predictions.rules.exact`     | Score exact : 3 points                                                       | النتيجة الدقيقة: 3 نقاط                                                             |
| `predictions.rules.outcome`   | Bon vainqueur ou bon match nul : 1 point                                     | الفائز الصحيح أو التعادل الصحيح: نقطة واحدة                                         |
| `predictions.rules.miss`      | Sinon : 0 point                                                              | غير ذلك: 0 نقطة                                                                     |
| `predictions.rules.lock`      | Chaque pronostic se verrouille au coup d'envoi de son match.                 | يُغلق كل توقع عند انطلاق مباراته.                                                   |
| `predictions.rules.postponed` | Match reporté : votre pronostic est gardé pour la nouvelle date.             | مباراة مؤجلة: نحتفظ بتوقعك للموعد الجديد.                                           |
| `predictions.rules.ties`      | À égalité de points, le plus de scores exacts passe devant ; sinon, ex æquo. | عند التساوي في النقاط يتقدم صاحب أكبر عدد من النتائج الدقيقة، وإلا يتقاسمان المركز. |

**Saving:**

| Key                        | FR                                        | AR                                       |
| -------------------------- | ----------------------------------------- | ---------------------------------------- |
| `predictions.save.saving`  | Enregistrement…                           | جارٍ الحفظ…                              |
| `predictions.save.saved`   | Enregistré                                | تم الحفظ                                 |
| `predictions.save.offline` | Hors connexion · nouvel essai automatique | لا يوجد اتصال · ستُعاد المحاولة تلقائيًا |
| `predictions.save.failed`  | Échec de l'enregistrement                 | تعذّر الحفظ                              |
| `predictions.save.retry`   | Réessayer                                 | أعد المحاولة                             |
| `predictions.save.locked`  | Match commencé : pronostic verrouillé     | انطلقت المباراة: أُغلق التوقع            |

**Guests:**

| Key                                 | FR                                                                                                      | AR                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `predictions.guest.saved_local`     | Enregistré sur ce téléphone                                                                             | محفوظ على هذا الهاتف                                                         |
| `predictions.guest.cta_title`       | Entrez au classement                                                                                    | ادخل الترتيب                                                                 |
| `predictions.guest.cta_body`        | Créez un compte gratuit avant le coup d'envoi pour que vos pronostics comptent et vous suivent partout. | أنشئ حسابًا مجانيًا قبل انطلاق المباريات لتُحتسب توقعاتك وتجدها على أي جهاز. |
| `predictions.guest.cta_button`      | Créer mon compte                                                                                        | إنشاء حسابي                                                                  |
| `predictions.guest.unranked`        | Vous : {points} (non classé)                                                                            | أنت: {points} (خارج الترتيب)                                                 |
| `predictions.guest.storage_blocked` | Votre navigateur bloque l'enregistrement : créez un compte pour garder vos pronostics.                  | متصفحك يمنع الحفظ: أنشئ حسابًا للاحتفاظ بتوقعاتك.                            |

**Leaderboards:**

| Key                            | FR                                                     | AR                                  |
| ------------------------------ | ------------------------------------------------------ | ----------------------------------- |
| `predictions.board.round`      | Journée                                                | الجولة                              |
| `predictions.board.season`     | Saison                                                 | الموسم                              |
| `predictions.board.col_rank`   | Rang                                                   | المركز                              |
| `predictions.board.col_player` | Joueur                                                 | اللاعب                              |
| `predictions.board.col_points` | Pts                                                    | النقاط                              |
| `predictions.board.col_exact`  | Exacts                                                 | دقيقة                               |
| `predictions.board.col_rounds` | J.                                                     | الجولات                             |
| `predictions.board.you`        | Vous                                                   | أنت                                 |
| `predictions.board.tied`       | ex æquo                                                | بالتساوي                            |
| `predictions.board.empty`      | Le classement apparaît après le premier match terminé. | يظهر الترتيب بعد انتهاء أول مباراة. |

**League tab, match card, Home, Matches:**

| Key                             | FR                                           | AR                                |
| ------------------------------- | -------------------------------------------- | --------------------------------- |
| `predictions.league.tab`        | Pronostics                                   | التوقعات                          |
| `predictions.match.title`       | Votre pronostic                              | توقعك                             |
| `predictions.match.all_round`   | Pronostiquer toute la journée                | توقّع كل مباريات الجولة           |
| `predictions.home.guest_line`   | Devinez les scores de la journée en 1 minute | توقّع نتائج الجولة في دقيقة واحدة |
| `predictions.home.cta`          | Pronostiquer                                 | توقّع الآن                        |
| `predictions.home.results_line` | Journée {n} : {points} · {place}             | الجولة {n}: {points} · {place}    |
| `matches.tab.predictions`       | Pronostics                                   | التوقعات                          |
| `home.discover.predictions`     | Pronostics                                   | التوقعات                          |

**Sharing and Fantasy:**

| Key                          | FR                                                                                                                             | AR                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `predictions.share.before`   | J'ai fait mes pronostics pour la Journée {n} de la Botola sur BotolaGO. À toi !                                                | أكملت توقعاتي للجولة {n} من البطولة على BotolaGO. دورك الآن!                                             |
| `predictions.share.after`    | Journée {n} de la Botola : {correct}/{played} bons pronostics, dont {exact} scores exacts, sur BotolaGO. Tu peux faire mieux ? | الجولة {n} من البطولة: {correct}/{played} توقعات صحيحة، منها {exact} دقيقة، على BotolaGO. هل تتفوق عليّ؟ |
| `predictions.share.whatsapp` | WhatsApp                                                                                                                       | واتساب                                                                                                   |
| `predictions.fantasy_cta`    | Envie d'aller plus loin ? Composez votre équipe Fantasy.                                                                       | تريد المزيد؟ كوّن فريقك في الفانتازي.                                                                    |

**Page states and errors:**

| Key                               | FR                                                      | AR                               |
| --------------------------------- | ------------------------------------------------------- | -------------------------------- |
| `predictions.state.unavailable`   | Pronostics momentanément indisponibles                  | التوقعات غير متاحة مؤقتًا        |
| `predictions.state.coming_soon`   | Bientôt disponible                                      | قريبًا                           |
| `predictions.state.no_fixtures`   | Les matchs de cette journée ne sont pas encore publiés. | لم تُنشر مباريات هذه الجولة بعد. |
| `predictions.error.league_access` | Réservé aux membres de cette ligue                      | مخصص لأعضاء هذا الدوري           |

**Leagues and invites** (added in version 2):

| Key                                           | FR                                                                                     | AR                                                                        |
| --------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `predictions.tab.leagues`                     | Ligues                                                                                 | الدوريات                                                                  |
| `predictions.leagues.title`                   | Mes ligues                                                                             | دورياتي                                                                   |
| `predictions.leagues.empty`                   | Pas encore de ligue. Rejoignez celle de vos amis avec leur code.                       | لا دوري بعد. انضم إلى دوري أصدقائك بواسطة الرمز.                          |
| `predictions.leagues.join`                    | Rejoindre une ligue                                                                    | الانضمام إلى دوري                                                         |
| `predictions.leagues.code_label`              | Code d'invitation                                                                      | رمز الدعوة                                                                |
| `predictions.leagues.join_button`             | Rejoindre                                                                              | انضمام                                                                    |
| `predictions.leagues.code_invalid`            | Code invalide                                                                          | رمز غير صالح                                                              |
| `predictions.leagues.joined`                  | Vous avez rejoint « {league} »                                                         | انضممت إلى «{league}»                                                     |
| `predictions.leagues.already_member`          | Vous êtes déjà membre de cette ligue                                                   | أنت عضو في هذا الدوري بالفعل                                              |
| `predictions.leagues.limit`                   | Limite de ligues atteinte                                                              | بلغت الحد الأقصى من الدوريات                                              |
| `predictions.leagues.full`                    | Cette ligue est complète                                                               | هذا الدوري مكتمل                                                          |
| `predictions.leagues.invite_title`            | {owner} vous invite dans « {league} »                                                  | {owner} يدعوك إلى «{league}»                                              |
| `predictions.leagues.invite_join_predictions` | Rejoindre en Pronostics (gratuit)                                                      | الانضمام في التوقعات (مجانًا)                                             |
| `predictions.leagues.invite_fantasy_hint`     | Vous avez une équipe Fantasy ? Rejoignez aussi en Fantasy                              | لديك فريق في الفانتازي؟ انضم أيضًا في الفانتازي                           |
| `predictions.leagues.invite_signup`           | Créez un compte pour rejoindre la ligue                                                | أنشئ حسابًا للانضمام إلى الدوري                                           |
| `predictions.leagues.share_link`              | Partager le lien d'invitation                                                          | مشاركة رابط الدعوة                                                        |
| `predictions.leagues.share_text`              | Rejoins ma ligue « {league} » sur BotolaGO et pronostique la Botola avec nous : {link} | انضم إلى دوري «{league}» على BotolaGO وتوقّع مباريات البطولة معنا: {link} |
| `predictions.leagues.code_once`               | Copiez-le maintenant : il ne s'affichera plus                                          | انسخه الآن: لن يظهر مرة أخرى                                              |
| `predictions.leagues.code_hint`               | Code se terminant par {hint}                                                           | رمز ينتهي بـ{hint}                                                        |
| `predictions.leagues.leave`                   | Quitter la ligue                                                                       | مغادرة الدوري                                                             |
| `predictions.leagues.leave_confirm`           | Quitter « {league} » ? Vos pronostics restent enregistrés.                             | مغادرة «{league}»؟ تبقى توقعاتك محفوظة.                                   |
| `predictions.leagues.via_fantasy`             | Membre Fantasy                                                                         | عضو في الفانتازي                                                          |
| `predictions.leagues.via_predictions`         | Membre Pronostics                                                                      | عضو في التوقعات                                                           |
| `predictions.leagues.see_fantasy`             | Voir le classement Fantasy                                                             | عرض ترتيب الفانتازي                                                       |
| `predictions.leagues.create`                  | Créer une ligue                                                                        | إنشاء دوري                                                                |
| `predictions.leagues.name_label`              | Nom de la ligue                                                                        | اسم الدوري                                                                |
| `predictions.leagues.create_button`           | Créer                                                                                  | إنشاء                                                                     |
| `predictions.leagues.create_limit`            | Vous avez atteint le nombre maximum de ligues créées cette saison                      | بلغت الحد الأقصى من الدوريات التي أنشأتها هذا الموسم                      |
| `predictions.leagues.reset_code`              | Nouveau code d'invitation                                                              | رمز دعوة جديد                                                             |
| `predictions.leagues.reset_warning`           | L'ancien code ne fonctionnera plus.                                                    | لن يعمل الرمز القديم بعد الآن.                                            |

**Plural sets** (each has `_one`, `_two`, `_few` and `_other`, in both languages):

| Base key                          | FR (\_one / \_other)                                                                                | AR (\_one / \_two / \_few / \_other)                                                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `predictions.remaining`           | 1 match à pronostiquer / {n} matchs à pronostiquer                                                  | مباراة واحدة للتوقع / مباراتان للتوقع / {n} مباريات للتوقع / {n} مباراة للتوقع                                                                       |
| `predictions.claim.imported`      | 1 pronostic ajouté à votre compte / {n} pronostics ajoutés à votre compte                           | أُضيف توقع واحد إلى حسابك / أُضيف توقعان إلى حسابك / أُضيفت {n} توقعات إلى حسابك / أُضيف {n} توقعًا إلى حسابك                                        |
| `predictions.claim.kept`          | 1 pronostic déjà sur votre compte a été gardé / {n} pronostics déjà sur votre compte ont été gardés | احتفظنا بتوقع واحد في حسابك / احتفظنا بتوقعين في حسابك / احتفظنا بـ{n} توقعات في حسابك / احتفظنا بـ{n} توقعًا في حسابك                               |
| `predictions.claim.started`       | 1 match déjà commencé n'a pas pu être ajouté / {n} matchs déjà commencés n'ont pas pu être ajoutés  | مباراة واحدة انطلقت ولم يُضف توقعها / مباراتان انطلقتا ولم يُضف توقعهما / {n} مباريات انطلقت ولم تُضف توقعاتها / {n} مباراة انطلقت ولم تُضف توقعاتها |
| `predictions.board.matches_left`  | Provisoire · 1 match à jouer / Provisoire · {n} matchs à jouer                                      | مؤقت · مباراة واحدة متبقية / مؤقت · مباراتان متبقيتان / مؤقت · {n} مباريات متبقية / مؤقت · {n} مباراة متبقية                                         |
| `predictions.league.not_played`   | 1 membre n'a pas encore joué / {n} membres n'ont pas encore joué                                    | عضو واحد لم يشارك بعد / عضوان لم يشاركا بعد / {n} أعضاء لم يشاركوا بعد / {n} عضوًا لم يشاركوا بعد                                                    |
| `predictions.board.rounds_played` | 1 journée / {n} journées                                                                            | جولة واحدة / جولتان / {n} جولات / {n} جولة                                                                                                           |
| `predictions.leagues.members`     | 1 membre / {n} membres                                                                              | عضو واحد / عضوان / {n} أعضاء / {n} عضوًا                                                                                                             |

That is 108 single keys plus 8 plural sets of 4 keys each: about 140 keys per language.

---

## Appendix C — KPI query sketches (to finish during step 15)

```sql
-- Players per journée (registered)
with played as (
  select distinct p.user_id, f.round_id
  from app.predictions p
  join app.fixtures f on f.id = p.fixture_id
  join app.seasons s on s.id = f.season_id and s.is_current
)
-- KPI 3: journée N → N+1 retention
select r.round_number,
       count(*) filter (where nxt.user_id is not null)::numeric / nullif(count(*), 0) as retention
from played pl
join app.rounds r on r.id = pl.round_id
left join app.rounds r2 on r2.season_id = r.season_id and r2.round_number = r.round_number + 1
left join played nxt on nxt.user_id = pl.user_id and nxt.round_id = r2.id
group by r.round_number
order by 1;

-- KPI 2: completion per journée (players who predicted every match that ended final)
select s.round_id,
       count(*) filter (where s.scored_count = fx.final_count)::numeric / nullif(count(*), 0) as completion
from app.prediction_standings s
join (select round_id, count(*) as final_count
      from app_private.prediction_fixture_scoring
      where state = 'scored'
      group by round_id) fx using (round_id)
where s.round_id is not null
group by s.round_id;

-- KPI 5: predictor → Fantasy within 30 days
with first_pred as (
  select user_id, min(created_at) as first_at from app.predictions group by user_id
), first_team as (
  select user_id, min(created_at) as team_at from app.fantasy_teams group by user_id
)
select count(*) filter (where ft.team_at > fp.first_at
                          and ft.team_at <= fp.first_at + interval '30 days')::numeric
       / nullif(count(*) filter (where ft.team_at is null or ft.team_at > fp.first_at), 0) as conversion
from first_pred fp
left join first_team ft using (user_id)
where fp.first_at < now() - interval '30 days';

-- KPI 4: guests who converted, per week
-- (divide by the Plausible event count pronostics_guest_start for the same week)
select date_trunc('week', claimed_at) as week, count(distinct user_id) as converted_guests
from app_private.prediction_guest_claims
where imported > 0
group by 1
order by 1;
```
