# Manager Card — domain plan (BG-0158)

**Status:** approved. On 2026-10-08 the owner answered "yes to all decisions"
(D1–D20 as recommended below, including D12's "ignore CAP weeks before #376",
D14's open questions settled as: no special-number exclusion, and textures must
not make numbers look rarer), and said to build from scratch (earlier unpushed
Codex work is not used; no Codex agent is writing). The build order is in
`docs/engineering/tasks/BG-0158/IMPLEMENTATION_PLAN.md`. Research base: `origin/main`
at `3f9c57fc` (merge of #378), re-checked 2026-10-08.

The Manager Card is a user's football identity, built from their Fantasy play:
a name, an overall rating (OVR), a tier (HOMA → STADE → PRO → CHAMPION →
LEGEND), four stats (CAP captain choices, SEL team selection, TRF transfers,
CON consistency), a season, a permanent number (`BOT #004821`), an optional
FOUNDER mark and a club. This plan covers the server side only: the tables, the
calculation, the read functions, the switch, the scheduled job, deletion and
tests. The card's screens are out of scope.

---

## 0. What was checked, and where the hand-off was wrong or vague

Checked in the repository (no staging or production read was made):

| Claim                                                                     | Result                                                                                                            | Evidence                                         |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| No Manager Card backend exists                                            | Confirmed on main and on every open PR (36 open on 2026-10-08)                                                    | `git ls-tree`, open PR list                      |
| Nothing writes `rank`/`overall_rank` on team results                      | Confirmed: only read, never written                                                                               | grep of `supabase/migrations`, `scripts/backend` |
| Next gameweek opens only after postwork for the current version completes | Confirmed, **and** it requires `status = 'finalized'` exactly                                                     | `20260914200740` lines 137–139                   |
| Erasure lock keys                                                         | Four: `fantasy:lifecycle-tick`, `botolago:predictions-score`, `pepites_tick`, `botolago.fantasy_prize_evaluation` | `account_deletion_automatic.test.sql:198–203`    |
| Step-up counts                                                            | 77 api functions (line 412), 26 tables (line 159)                                                                 | both `ordinary_account_mfa_step_up*.test.sql`    |
| Scheduled jobs on main                                                    | 18                                                                                                                | `cron.schedule` names in migrations              |
| Latest migration on main                                                  | `20261006143700`                                                                                                  | `supabase/migrations`                            |
| Highest task number                                                       | BG-0157; BG-0158 is free                                                                                          | `LAUNCH_LEDGER.yaml`                             |
| Docker in this container                                                  | Not available                                                                                                     | `docker ps` fails; database tests run in CI only |

Where the facts differ from the hand-off:

1. **"Corrected" never happens.** The `corrected` gameweek status is allowed by
   the table check but no function or script ever sets it. In practice every
   stable gameweek is `finalized`. The plan still accepts both (the prize
   predicate does), so nothing breaks if a correction path is added later.
2. **Gameweek boards are not a safe source for CON.** `api.service_recalculate_fantasy_rankings`
   ranks a gameweek board on `coalesce(final_score, provisional_score)` and is
   called during every scoring publish, including provisional ones. Whether the
   board is rewritten after finalisation depends on run order. Rather than rely
   on it, CON reads the **final team results** of every active team for that
   gameweek directly. This removes the "verify first" on D5.
3. **`starting_points` already includes automatic substitutions.** A bench
   player who came on counts; the starter he replaced does not
   (`20260927140000` lines 300–311). SEL therefore compares the eleven that
   actually scored with the best eleven the fifteen could have produced.
4. **Double gameweeks need no special rule.** Player points are stored once per
   player per gameweek, already summed across both matches.
5. **Gameweek boards include only `active` teams.** `suspended` and `archived`
   teams are left out; CON uses the same rule.

Questions only the owner can answer (asked in the first report):

- Is there unpushed Codex work on the card (a Codex task, a local branch, a
  staging change)? Is any Codex agent writing to staging or production now?
- Have `20261005130000` (public recaps) and `20261006143700` (automatic
  account deletion) been applied to production? #359 reports the last attempt
  stopped. This feature depends on both.
- Does `profiles.created_at` match `auth.users.created_at` on production?
- Which ruleset does the 2026/27 Fantasy season use?
- Do old team results have an empty `scoring_details` (before `20260927140000`)?

---

## 1. Sources the card reads

The card writes no Fantasy table. It only reads:

| Data                  | Table                                                                                                                          | Used for                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| Which gameweeks count | `app.fantasy_gameweeks` (`status`, `points_state`, `scoring_input_version`, `sequence_number`)                                 | the evaluation order     |
| Postwork done         | `app_private.fantasy_gameweek_postwork` (`gameweek_id`, `calculation_version`, `completed_at`)                                 | "evaluable" test         |
| Each team's week      | `app.fantasy_team_gameweek_results` (`state`, `final_score`, `starting_points`, `chip_type`, `scoring_details`)                | CON, SEL, counting weeks |
| Each player's week    | `app.fantasy_player_gameweek_points` (`final_points`, `minutes_played`) — every player in the season, owned or not             | CAP, SEL, TRF            |
| The locked line-up    | `app.fantasy_lineups`, `app.fantasy_lineup_players` (`slot`, `captain`, `vice_captain`)                                        | CAP, SEL                 |
| Transfers             | `app.fantasy_transfer_batches` (`status`, `point_hit`, `transfers_count`, `chip_type`, `gameweek_id`), `app.fantasy_transfers` | TRF                      |
| Name, handle          | `app.profiles` (`display_name`, `username`, `deleted_at`), `app.fantasy_teams.name`                                            | card face                |
| Club                  | `app.user_preferences.favorite_team_id` → `app.teams`, `app.team_translations`                                                 | card face                |
| Season label          | `app.fantasy_seasons` → `app.seasons`                                                                                          | card face                |

A gameweek is **stable** when `status in ('finalized','corrected') and
points_state = 'final'` (the prize predicate). It is **evaluable** when it is
stable **and** the postwork row for its current `scoring_input_version` has
`completed_at` set. `cancelled` gameweeks never count.

---

## 2. Decisions for the owner

Every number below (3 weeks, 5 weeks, 1–99, tier shares) is a starting point,
fixed for good only at calibration. Once a formula meets real data, changing it
means a new rules version, not an edit.

**Safe to build before any answer:** the tables (with the number column empty),
a rules table holding every weight and threshold as data **with no row
shipped**, the on/off switches, the job ledger, deletion coverage, and the read
functions with their tests (tests insert placeholder rules inside a
transaction that is rolled back).

### Formulas

| #   | Question          | Recommendation                                                                                                                                                                                                                                                                                |
| --- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | How is OVR made?  | Plain average of the four stats, rounded. One stat missing: average the other three. Two or more missing: no OVR.                                                                                                                                                                             |
| D2  | CAP (captain)     | Each week: your captain's points ÷ the best points among your eleven starters. Averaged over the season. The vice counts only if the captain played zero minutes. Weeks where the best starter scored 0 or less are skipped.                                                                  |
| D3  | SEL (selection)   | Each week: your eleven's points ÷ the best legal eleven you could have picked from your fifteen. Bench Boost weeks are skipped.                                                                                                                                                               |
| D4  | TRF (transfers)   | Each transfer: points the new player scored over the next 3 gameweeks minus what the sold player scored, minus its share of any points hit. Free Hit weeks skipped, Wildcards counted. No transfers at all: no TRF (a dash, not 0).                                                           |
| D5  | CON (consistency) | Share of weeks you finished in the top half of all managers that week ("you beat half the managers in 7 of 9").                                                                                                                                                                               |
| D6  | Scale             | Each raw figure turned into a whole number 1–99 by a fixed scale, set once from real 2026/27 data and then frozen, so a card moves only when its owner's results do.                                                                                                                          |
| D7  | Window            | One card per season. Until a new season has enough weeks, show last season's card with its label.                                                                                                                                                                                             |
| D8  | Minimum           | No card until 3 finished weeks; marked "provisional" until 5.                                                                                                                                                                                                                                 |
| D9  | Tiers             | Fixed OVR cut-offs set at calibration (aim: LEGEND top 1%, CHAMPION next 4%, PRO next 15%, STADE next 30%, HOMA the rest). Tiers may go down as well as up; the record (seasons played, best tier, founder) only grows. Alternative: show the season's best tier, with today's OVR beside it. |
| D10 | XP                | No XP in version 1: nothing defines it yet.                                                                                                                                                                                                                                                   |
| D11 | When it updates   | Once per finished gameweek, never during live play.                                                                                                                                                                                                                                           |
| D12 | What counts       | Every finished week, including weeks the manager did nothing. Question: for CAP, ignore weeks before PR #376 (before that, a manager who never picked a captain got the goalkeeper by default)? Recommend yes.                                                                                |

### Identity

| #   | Question           | Recommendation                                                                                                                                                                                                                                         |
| --- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D13 | FOUNDER            | Given to 2026/27 teams created before a cut-off date with at least one finished week, excluding staff and test accounts. Granted once, after the cut-off, by a script the owner runs. Never later.                                                     |
| D14 | BOT number         | Random 6 digits, 100000–999999, unique, assigned once, never changed. Not counted up (that would reveal how many users there are). Questions: leave out "special" numbers like 111111? Confirm the card's texture never makes some numbers look rarer. |
| D15 | Deleted account    | The number is retired forever (kept on a private list with no link to the person). Founder goes with the account.                                                                                                                                      |
| D16 | Country            | None in version 1. Never guessed. Optional later as the user's own choice.                                                                                                                                                                             |
| D17 | Name, photo, club  | Name: display name, else team name (same as the leaderboards). No photo on other people's cards (photos are private today); the app draws a shared figure. Club colours left empty when unknown.                                                       |
| D18 | History            | One saved row per manager per finished gameweek per season. Covers OVR over time, past seasons and tier changes.                                                                                                                                       |
| D19 | Who can see a card | Signed-in users only, behind an on/off switch, looked up by Fantasy team, never by user id. Nothing for visitors. An account waiting to be deleted shows no card.                                                                                      |
| D20 | Privacy policy     | Does it need a line saying ratings are visible to signed-in users? (Owner or legal.)                                                                                                                                                                   |

---

## 3. Calculation in detail (applies once D1–D12 are answered)

All figures are recalculated from every final row each time, never added up
step by step, so running it twice gives the same result.

### CAP — captain choices

For each evaluable gameweek where the team has a `final` result and a lineup:

- Starters: the 11 `slot = 'starter'` rows of that gameweek's lineup.
- Effective captain: the `captain` row; if that player's `minutes_played = 0`
  for the gameweek, the `vice_captain` row instead; if both are 0, skip the week.
- When `scoring_details->>'effectiveCaptainId'` is present, it must match;
  if not, the week is skipped and counted in the job log (never guessed).
- Ratio = captain's `final_points` ÷ max `final_points` among the 11 starters.
  Best ≤ 0: skip. Negative ratio: 0.
- Season CAP raw = mean of the weekly ratios. Triple Captain weeks count like
  any other (the choice is the same choice).
- If D12's "ignore before #376" is accepted, weeks whose deadline precedes a
  date stored in the rules row are skipped.

### SEL — selection

- Fifteen players of that week's lineup (on a Free Hit week, the Free Hit
  squad, which is what the lineup holds).
- Best legal eleven: the highest-scoring 1 GK + 3–5 DEF + 2–5 MID + 1–3 FWD
  from those fifteen, by `final_points` (`fantasy_position_rules`). With 15
  players this is a small fixed search (at most a handful of formations).
- Ratio = `starting_points` ÷ best eleven. Skip Bench Boost weeks and any
  optimum ≤ 0. Clamp to 0..1.
- Season SEL raw = mean of weekly ratios.

### TRF — transfers

- Every `confirmed` batch of the season except Free Hit batches.
- Window: the batch's gameweek and the next stable gameweeks until 3 have been
  counted (cancelled gameweeks are skipped, not counted). A batch counts once
  all 3 are evaluable, or once the season's last gameweek is, using what exists.
- Per transfer: Σ in-player `final_points` − Σ out-player `final_points` over
  the window, minus `point_hit ÷ transfers_count`.
- Season TRF raw = mean per transfer. No batch: null.

### CON — consistency

- For each evaluable gameweek: rank every `active` team's `final_score`.
  The manager is in the top half when fewer than half of the teams scored
  strictly more (ties count in the manager's favour).
- Season CON raw = weeks in the top half ÷ weeks counted.

### From raw figures to the card

- Each raw figure goes through its piecewise-linear scale (points stored in the
  rules row) to a whole number 1–99.
- OVR per D1; tier from the rules row's cut-offs.
- Weeks counted = the team's `final` results in evaluable gameweeks.
  Under the minimum: everything null. Under the provisional mark: `provisional`.

### Corrections

The ledger is keyed (gameweek, rules version, `scoring_input_version`). When a
gameweek's current version has no ledger row, that gameweek and every later
one are re-evaluated in order. The version is read at the start and end of a
run; if it changed, the run stops without writing.

---

## 4. Tables (names are proposals)

Every table: row security on and forced, all rights revoked from the four
roles, no policies, every foreign-key column indexed.

- `app.manager_cards` — one row per manager. `user_id` primary key →
  `app.profiles(id)` on delete cascade; `serial` text, nullable, unique,
  checked `^[1-9][0-9]{5}$`, never updated once set (trigger);
  `founder_cohort` smallint null; `founder_granted_at`; `created_at`.
- `app.manager_card_seasons` — (user, Fantasy season) → card; `fantasy_team_id`
  on delete cascade; `ovr`, `tier`, `cap`, `sel`, `trf`, `con` (nullable
  smallints); the four raw figures; `gameweeks_counted`; `provisional`;
  `rules_version`; `through_gameweek_id`; `calculated_at`.
- `app.manager_card_gameweeks` — history: (user, gameweek) → the same figures
  as of that gameweek.
- `app_private.manager_card_rules` — versioned, immutable once used: scales,
  cut-offs, window, minimums, optional CAP start date. **No row shipped.**
- `app_private.manager_card_settings` — singleton (`id boolean primary key
default true check (id)`), `compute_enabled false`, `read_enabled false`.
- `app_private.manager_card_evaluations` — the ledger.
- `app_private.manager_card_job_log` — one row per tick.
- `app_private.manager_card_retired_serials` — `serial` only, no user id,
  filled by an AFTER DELETE trigger on `app.manager_cards`.

Season- or gameweek-keyed rows cascade from their parent so the existing
catalogue rollback (`api.service_rollback_fantasy_catalog`,
`fantasy-catalog-restage-maintenance.sql`) still works; this is checked before
the schema is pushed.

## 5. Read functions

All `security definer`, `set search_path = ''`, arguments of plain types only,
`perform app_private.assert_mfa_step_up();`, refused with `PT403
manager_card_off` while `read_enabled` is false, granted to `authenticated` and
`service_role` only (D19):

- `api.get_my_manager_card()` — the caller's current card.
- `api.get_manager_card(p_fantasy_team_id uuid)` — one card.
- `api.get_manager_cards(p_fantasy_team_ids uuid[])` — up to 100, for ranking
  rows.
- `api.get_my_manager_card_history(p_after_gameweek_id uuid, p_limit integer)`
  — keyset-paged history.

None returns a user id or e-mail. A profile with `deleted_at` set returns no
card. The step-up test's 77 rises by exactly four, with its description line
updated.

## 6. Switch and scheduled job

- `app_private.manager_card_configure(p_compute boolean, p_read boolean)`,
  executable by `postgres` only.
- pg_cron `manager-card-tick` every 15 minutes: off → `{"outcome":"off"}`; no
  rules row → `{"outcome":"no_rules"}`; otherwise evaluates the unevaluated
  evaluable gameweeks in order, capped per run, under its own advisory lock
  `botolago:manager-card`, with `set local statement_timeout`.
- `manager-card-history-prune` daily at 03:47 UTC (free slot): deletes only this
  tick's `cron.job_run_details` rows older than 7 days and job-log rows older
  than 180 days. Never touches `app.*` card tables.
- Not wired into the Fantasy runner's postwork, so it can never hold up the
  next gameweek.
- AGENTS.md gets one entry for both jobs, shaped like `account-deletion-tick`.

## 7. Account deletion

- Card rows cascade from `app.profiles`; the AFTER DELETE trigger retires the
  number.
- A separate migration adds `botolago:manager-card` to the locks
  `app_private.account_deletion_erase` tries, by a find-and-replace that raises
  unless the anchor occurs exactly once. The test's key array gains it.
- `ACCOUNT_DELETION_RUNBOOK.md` names the tables, the retirement and the lock.

## 8. Business-rule guard

OVR, tier, founder and number are display-only. No prize, ranking, league or
Fantasy rule may read them; a pgTAP check asserts no function outside the card's
own reads `app.manager_card*`.

## 9. Tests

- pgTAP `supabase/tests/database/manager_card.test.sql`: constraints, grants,
  row security, cross-user and visitor refusal, switch off, hand-computed
  fixtures for every stat, OVR and tier, a second run changing nothing, null,
  provisional, Bench Boost, Free Hit, cancelled and `no_rules` cases, deletion
  cascade, number retirement, the erase lock.
- Bun tests for the apply script and any repository code.
- Run in CI (`database-quality`), since this container has no Docker.

## 10. Production

A guarded `scripts/backend/apply-<version>-manager-card.sql`, rehearsal by
default, refusing unless `20261005130000` and `20261006143700` are recorded and
no card object exists; it checks both switches off afterwards. The owner runs
it. Order: `20261005130000` → `20261006143700` → this feature → calibration
and rules v1 → founder grant → switch on.

## 11. Risks

- **Calibration needs a real-data read.** Scales cannot be set on invented
  numbers; the owner must grant an aggregate-only read of production.
- **Falling tiers** may feel like a loss to users (D9).
- **Default captains before #376** make early CAP noisy (D12).
- **Load:** the tick reads every team's lineup per gameweek; batches are sized
  on a local 50,000-team fixture before the PR is marked ready.
- **Unreliable signup dates** rule out "join year" from `profiles.created_at`
  until the owner confirms it.
