# Hand-off: build the backend of the BotolaGO Manager Card

You are taking over the backend of the **BotolaGO Manager Card** in
`mrdata007/botolago-foundation`.

- **Research base.** Read-only research against `origin/main` at `3f9c57fc` (merge of PR
  #378, 2026-10-07), re-checked 2026-10-08. Main may have moved; re-check what you rely on.
- **"Verify first"** marks a claim nobody confirmed. Check it before treating it as fact.
- **Not in the repository:** the owner's design brief (its substance is in section 4). The
  two design explorations sit on unmerged branches (section 7).

---

## 1. Mission

1. **Build** the server side of the Manager Card: the data model; a deterministic
   computation of OVR, tier and the four stats from stored Fantasy data; a read API, an
   on/off switch and a scheduled job; tests, generated types and docs.
2. **Out of scope:** the card UI (routes, components, share images); merging and deploying;
   any production write.
3. **First deliverable:** a design doc and the section 5 decision list, sent to the owner.
   No formula is coded until the owner answers.
4. **End state:** one **draft** PR with migrations, pgTAP and bun tests, regenerated types,
   the design doc, a runbook, a guarded apply script and an AGENTS.md entry. Everything
   ships switched off, with no rules row.
5. **Verification:** the local stack or CI only (section 2, "No Docker").

---

## 2. Hard rules for this work

CLAUDE.md and AGENTS.md load automatically. These are the parts that apply here.

**One writer per database** (AGENTS.md "One writer at a time, per database")
- Before any write, follow its "Before writing" checklist.
- Read the scheduled jobs from `cron.job`. Main schedules 18; the AGENTS.md list omits five
  (`ops-alert-tick`, `notification-push-tick`, `ai-content-generate`,
  `news-publish-due-editions-history-prune`, `notification-email-history-prune`) and says
  15 minutes for `football-live-refresh`, which now runs every minute (`20260924200500`).
- Locally, `docker ps` first: no other session may share your stack during `backend:db:reset`.
- If you write to a shared database, report it as "When you are the writer" requires.

**Production** (`tkewgajrljbwgwedqsxn`): only through CLAUDE.md "Production database writes"
and `docs/backend/RELEASE_ACTIVATION_MIGRATION_RUNBOOK.md`. You prepare a guarded apply
script; the owner runs it. Any read of staging or production also needs the owner's leave.

**Tools you must not reach for** without the owner's prior approval naming the project and
the operation: Supabase MCP `apply_migration`, `execute_sql` (read-only included),
`deploy_edge_function`, any `*_branch` tool, and `generate_typescript_types` against any
remote project; Lovable MCP `send_message`, `deploy_project`, `query_database`; GitHub
`merge_pull_request`, and `actions_run_trigger` or any workflow dispatch (it can start
`staging-database-update` and the `production-*` workflows).

**No Docker.** Cloud containers usually have none (`docker ps` fails), and
`backend:db:reset`, `db:test`, `db:lint`, `types:generate` and `types:check` need it. Then:
1. Open the draft PR as soon as the first schema commit is pushed. `backend-quality` runs
   only on pull requests, and its `database-quality` job is the only place pgTAP runs.
2. Types: if "Verify generated database types" fails, CI uploads
   `generated-database-types-<run_id>` (kept 1 day). Fetch it with
   `gh run download <run_id> -n generated-database-types-<run_id>`, commit, re-push within
   the day. Never hand-edit the file or generate it from a remote project.
3. A Phase 2–5 "Accept" that needs a database is met only by a green `database-quality` run,
   linked in your report.

**Migrations** (CLAUDE.md "Migrations", `docs/backend/MIGRATIONS.md`)
- Forward-only, unique timestamps (`bun run backend:migrations:check`). One slot per file,
  from the current UTC time (`supabase migration new`), later than main's latest
  (`20261006143700` at research time) and any newer open-PR version. Re-check against main
  and every open PR right before pushing and before marking the PR ready.
- #348, #337, #240 and #183 reuse versions main holds and must renumber, perhaps near your
  slot; #125, #254, #245, #116 and #155 are older.
- `gh pr list` and `gh pr create` fail here (GraphQL 403). Use REST:
  `gh api 'repos/mrdata007/botolago-foundation/pulls?state=open&per_page=100' --jq '.[].number'`,
  then `gh api 'repos/mrdata007/botolago-foundation/pulls/<n>/files?per_page=100&page=<p>' --jq '.[].filename'`
  (no `--paginate`: it fails through the proxy), or
  `git ls-tree -r --name-only origin/<branch> -- supabase/migrations`.
- To change an existing function, write a new migration with `create or replace`.
- MIGRATIONS.md lags practice: it puts `security definer` functions in `app_private`, but
  `api.*` security definer RPCs with the step-up are the norm. Follow recent migrations.

**Git:** never rewrite pushed history (the branch syncs to Lovable). Bring in main by merge
commit only. After a merge, regenerate `database.types.ts` (or take CI's artifact) rather
than hand-resolve it; #337, #245 and #183 also touch it. Keep AGENTS.md and runbook edits in
their own commits (#240 touches AGENTS.md and the ledger, #359 the deletion runbook).

**New scheduled job:** add it and its prune companion to AGENTS.md "Check the scheduled jobs
too" (name, cadence, what it writes, switch, exact pause and restore SQL), shaped like the
`account-deletion-tick` entry. Add only yours; offer the owner a separate commit for the
stale entries.

**Business rules** stay as they are (AGENTS.md "Screen work" rule 6; PRODUCT.md "Game logic
runs on the server"). The card only *reads* Fantasy data and writes no Fantasy table. OVR,
tier, founder and serial are display-only: no prize, ranking, league or Fantasy rule may
read them.

**Draft PR, then wait** (AGENTS.md rule 7): no merge, migration apply, Edge Function deploy
or Lovable Publish without the owner.

---

## 3. What already exists

### 3.1 No Manager Card backend on any pushed branch

- **Main** has no card, OVR, tier, stat, XP, badge, founder or member-number object.
- **Every remote branch** (357 on 2026-10-08), searched under `supabase/`,
  `scripts/backend/`, `src/backend/`, `docs/backend/` for `manager_card`, "manager card" and
  `managercard`: nothing.
- **The design explorations are front end only, with fixed fictional samples:** Claude,
  draft PR #380 (`design-lab/manager-cards-claude/`); Codex, draft PR #377
  (`design-lab/manager-cards/`). No formula exists; 84, 91, 82, 86, 78 are samples.
- **Unpushed work is unknown.** The owner said "Codex already did work on backend". A Codex
  cloud task, a local branch or a staging change would not show in git. Ask (Phase 0).

### 3.2 Architecture

**Who built what.** "Codex built the backend" is this author's reading of the owner's
words: only #246, #248 and #249 (adaptive scoring, incremental points, season reliability)
are on `codex/*` branches; #1–#6 and #28–#31 came from `backend/*` branches that name no
tool. Claude agents added prizes, recaps, the lifecycle tick, step-up, account deletion,
Pronostics and Pépites.

**Environments.** Production `tkewgajrljbwgwedqsxn`, staging `srdrflfrfpwixsllveid`,
legacy `kxpaudvntwxpahyjtxbk` (never touch).

**Schemas.** `app` holds tables (RLS enabled and forced, `revoke all` from the four roles,
no policies); `api` is the only schema PostgREST exposes, and browsers read only through
its RPCs; `app_private` holds helpers, settings, ledgers and logs. Default privileges revoke
everything.

**RPC shape.** Templates with the step-up: `20261005130000_fantasy_public_recaps.sql`,
`20261006143700_account_deletion_automatic.sql` (`20260925090200_predictions_api.sql` shows
grants and errors only; its step-up came in `20260926003100`).
- `security definer`, `set search_path = ''`, caller from `(select auth.uid())`; errors
  `PT400/401/403/404/409` with snake_case messages.
- `revoke all … from public`, then `grant execute` to `authenticated, service_role`, plus
  `anon` only for public reads. Service-only RPCs are `api.service_*`.
- Arguments use only `pg_catalog` types (`uuid`, `text`, `integer`, `bigint`, …), never an
  `app.*` enum or composite (`20260921120000_fantasy_leagues_anon_callable_signature.sql`).

**App data layer.** `src/backend/<domain>/` with `contracts.ts` (zod), `errors.ts`,
`supabase-repository.ts`, `mock-repository.ts`; model `src/backend/predictions/`; clients
from `src/integrations/supabase/v2-client.ts`.

### 3.3 Data the card reads

**Identity**
- `app.profiles` (`20260720075453_identity_domain.sql`): `id` → `auth.users` on delete
  cascade; `username` **nullable**, else `^[a-z0-9][a-z0-9_-]{2,19}$`; `display_name`
  default `''`; `avatar_path` (private bucket); `preferred_language`; `created_at`;
  `deleted_at`. No country, sequence or public number; every key is a uuid.
- `20260720095330_football_catalog.sql`: `app.teams` (`short_name`, `code`,
  `crest_asset_id`, nullable `primary_color`/`secondary_color`), `app.countries(iso_alpha2,
  iso_alpha3, flag_emoji)`, `app.country_translations`, and `user_preferences.favorite_team_id`
  → `app.teams` on delete set null. `app.team_translations(team_id, language, name,
  short_name)`: `20260921190000_team_translations.sql`.

**Visibility in force**
- `display_name` is not public to anonymous readers (`20260921180000_fantasy_overall_standings.sql:51-72`;
  `src/backend/fantasy/contracts.ts:201`). Signed-in readers get the display name when
  non-blank, else the team name; anonymous readers get the team name (elsewhere a masked
  username, `app_private.fantasy_mask_username`).
- Deleted profiles: Fantasy boards LEFT JOIN profiles `deleted_at is null`, so the row stays
  under the team name, which `account_deletion_disable` renamed to `Manager XXXXXX`. The
  Pronostics leaderboard INNER JOINs and drops the row (`20260925090200:629-677`).
- Only the owner can read an avatar. There is no public profile view; GREENFIELD_MASTER_PLAN
  §5 requires an explicit filtered view first.

**Signup dates are unreliable.** The identity backfill stamped `profiles.created_at` for
existing users, and production holds E2E accounts (`e2e.fantasy.recovery@botolago.com`,
`docs/backend/FANTASY_2026_27_BRIDGE_ACTIVATION.md` ~line 80).

**Fantasy** (`20260720141826`, `…141847`, `…141850`, `20260927140000`; RLS forced, no browser
grants)
- **Gameweeks.** `fantasy_gameweeks`: `sequence_number`, `status`, `points_state`,
  `scoring_input_version`, `finalized_at`. Status enum: `scheduled, open, locked, live,
  provisional, finalizing, finalized, corrected, cancelled`; the table check makes
  `finalized` and `corrected` the final pair. **Stable** = `status in
  ('finalized','corrected') and points_state = 'final'`, the `fantasy_prizes` predicate
  (`20260924120000:530, 651, 796`), also used by public recaps. `cancelled` never counts.
- **Version.** A gameweek's current calculation version is its `scoring_input_version`
  (rescoring bumps it). `app_private.fantasy_gameweek_postwork` is keyed `(gameweek_id,
  calculation_version)`, so a gameweek can have several rows. Opening the next gameweek
  requires the row for the current version to have `completed_at` set
  (`20260914200740:137-139`); use the same test.
- **Rules.** Legal XI 1 GK, 3–5 DEF, 2–5 MID, 1–3 FWD (`fantasy_position_rules`); captain ×2,
  Triple Captain ×3; the vice is promoted only when the captain records zero total official
  minutes (`FANTASY_RULES_V1.md:56-57`).
- **Teams** `unique (user_id, fantasy_season_id)`, `user_id` **RESTRICT** to profiles.
  `fantasy_lineup_players` holds `captain`, `vice_captain` and the *chosen* `multiplier`.
  `fantasy_transfer_batches` (`gameweek_id` = the open gameweek, `point_hit` per batch,
  `chip_type`) and `fantasy_transfers` (`player_out_id`, `player_in_id`). Chips: Wildcard
  1/2, Free Hit (squad restored), Bench Boost, Triple Captain.
- **Player points.** `fantasy_player_gameweek_points` holds `final_points`, `minutes_played`,
  `did_play` **for every player in the season, owned or not**, so the best captain, the
  optimal XI and a sold player's points are exact.
- **Team results** (`fantasy_team_gameweek_results`): `starting_points` (XI, no multiplier),
  `captain_points` (bonus only), `bench_points`, `transfer_hit`, `chip_type`, `final_score`,
  `state`, `calculation_version`, `scoring_details` (`effectiveCaptainId`, `substitutions`,
  `players`; since `20260927140000`). `rank`/`overall_rank` are never written. Lineups copy
  forward, so a result count measures enrolment, not activity.
- **Rankings** (`fantasy_rankings`): `gameweek_id` and `league_id` both null = season board;
  `gameweek_id` alone = that gameweek's board; `league_id` = a league. Columns include `rank`,
  `previous_rank`, `total_points`, `gameweek_points`, `transfer_hits`,
  `calculation_version`. Upserted in place, so `previous_rank` is the only history.
- **Activity.** Only `app_private.fantasy_mutation_audit` (a 365-day security audit). Build
  no product logic on it.

**Read RPCs to model on:** `api.get_my_fantasy_history`, `api.fantasy_gameweek_summary`
(anon), `api.fantasy_overall_standings`, and the closest precedent
`api.public_fantasy_gameweek_recap` (two switches, alias-only public data, trusts
`scoring_details`' captain only when the parts add up to `final_score`).

**PR #376** stops the silent default captain. Until it ships, a stored captain may be the
slot-1 goalkeeper rather than a choice (D12).

### 3.4 Pipeline, jobs and guards

**Finalisation.** `scripts/backend/fantasy-lifecycle-runner.ts` (hourly, via
`fantasy-season-orchestrator.ts`) scores, finalises and ranks; `finishPublishedWork()` then
runs prices, notifications, postwork, `evaluateFantasyPrizes` and the next gameweek's
preparation. Do not wire card work into postwork: it would block the next gameweek.

**Prize precedent:** never throws, tolerates `PGRST202`; a ledger
(`app_private.fantasy_prize_evaluations`) makes re-runs no-ops; advisory lock
`botolago.fantasy_prize_evaluation`.

**pg_cron and switch** (template `20261006143700_account_deletion_automatic.sql`):
singleton settings row `id boolean primary key default true check (id)`, all off;
`app_private.<x>_configure(...)` executable by `postgres` only; when off the tick returns
`{"outcome":"off"}` and writes nothing; prune companion at a free 03:xx minute (taken:
03:17, 03:27, 03:37 twice, 03:41, 03:53); health by renaming `app_private.ops_health_checks()`
and wrapping it. `news-sitemap-refresh` sets `set local statement_timeout` in its command
(`20260926003050:274`).

**MFA step-up** (`20260926003100`): every `api` function that reads or writes the caller
(`auth.uid()`, `auth.jwt()`, `auth.email()` or `request.jwt` in it or a callee) runs
`perform app_private.assert_mfa_step_up();`. `ordinary_account_mfa_step_up_reads.test.sql`
hard-codes **77** (line 412) with a description listing every source (line 413);
`ordinary_account_mfa_step_up.test.sql` hard-codes the **26** tables carrying
`app_private.refuse_unverified_mfa_actor()`.

**Account deletion** (`20261006143700`, `docs/backend/ACCOUNT_DELETION_RUNBOOK.md`): on
request `account_deletion_disable` sets `deleted_at` and renames teams; seven days later
`account_deletion_erase` tries the other writers' advisory locks without waiting, deletes
Fantasy rows explicitly, then `delete from auth.users`, which cascades.
`account_deletion_automatic.test.sql` (~line 201) hard-codes the four lock keys. Large
functions are patched by a `pg_get_functiondef` find-and-replace in a new migration. No test
checks deletion coverage across the catalogue. **Production:** PR #359 reports that the
`20261006143700` apply script stopped on production because `app.fantasy_public_recaps`
(`20261005130000`) was missing, and saved nothing. Whether either has been applied since is
unverified. Your migration depends on both.

### 3.5 Open PRs that matter

- **#379:** no migrations (Edge Function auth). You should not need an Edge Function.
- **#348:** `app_private.ranking_hidden_accounts`, the only definition of owner and test
  accounts, unmerged and due to renumber. Do not reference it (D13).
- **#359:** the recaps apply script. **#376:** captaincy. **#377, #380:** the labs.

---

## 4. The product

**What the card is.** A user's permanent football identity: "Fantasy team generates
performance → performance makes the card better" (owner). It shows a name, an OVR, a tier
(HOMA → STADE → PRO → CHAMPION → LEGEND), four stats (CAP captain decisions, SEL selection,
TRF transfers, CON consistency), a season, a permanent ID (`BOT #004821`), an optional
FOUNDER 2026 mark, a country, a club and an avatar. The aim is status and comparison ("I'm
86 OVR, you're only 78") for young Moroccan fans, without pay-to-win. Sample ALI: 84, PRO,
CAP 91, SEL 82, TRF 86, CON 78 (the stats' mean rounds to 84). *Front-end context, build
nothing for it:* full card, 44–80px token, 24–32px mini, 1080×1920 share story.

The owner's original lifecycle, word for word: "Fantasy performance → Manager XP → card
progression → better OVR → better visual tier → badges / achievements → social status →
sharing → more Fantasy engagement." It came with "Do NOT implement the progression system
yet" for the design phase; this hand-off is the owner's request to start it (see D10 for XP).

**The lab's sample shape** (Claude lab `src/kit.js`): uppercase codes (`"HOMA"`…`"LEGEND"`,
`{CAP, SEL, TRF, CON}`); `name {lat, ar}`; `id "BOT #004821"` plus `serial "004821"` (a
string); `country {lat, ar, code: "MAR"}` (ISO alpha-3); `club {lat, ar, initials, primary,
secondary}`. `CONTRACT.md` is the concept modules' render contract, not a data API.

**Data contract (proposal).** The backend returns codes, numbers and stored names (club
translations, display name); the client holds every UI label and maps the codes.

| Field | Shape | Source today | Status |
|---|---|---|---|
| Name | string | `display_name` if non-blank, else team name (the signed-in board rule) | exists (D17) |
| Handle | `username` or null (client shows a dash) | `profiles.username` | exists |
| OVR | integer | none | new (D1, D6) |
| Tier | `homa\|stade\|pro\|champion\|legend` | none | new (D9) |
| Stats | `cap, sel, trf, con`, nullable integers | none | new (D2–D5) |
| Provisional, gameweeks counted, rules version | bool, int, text | none | new (D8) |
| Season | label (`2026/27`) | `fantasy_seasons` → `app.seasons.label` | exists |
| ID | 6-digit serial string; client adds `BOT #` | none | new, **immutable**, seeds textures (D14) |
| Founder | cohort year or null | none | new (D13) |
| Join year | year | `profiles.created_at` (unreliable) | decide |
| Club | team id, code, fr/ar short name, nullable colours | preferences → `app.teams`, `team_translations` | exists |
| Country | ISO code | none | D16 |
| Avatar | shared drawn figure, or photo | owner-only `avatar_path` | D17 |
| Row context | rank, points | `fantasy_rankings` | exists |
| History | OVR per gameweek, seasons, tier changes | none | new (D18) |

**Binding rules, with sources**
- **Free to play** (PRODUCT.md ~245, owner brief): no purchase, no stake, nothing that looks
  like betting or pay-to-win. Updates are deterministic.
- **Independent** (PRODUCT.md ~246): nothing implies affiliation with the FRMF, the LNFP or a
  club.
- **Data honesty** (PRODUCT.md, owner brief): unknown is null and shows as a dash, never 0;
  provisional is labelled; never invent ratings or user counts (a sequential ID reveals the
  count).
- **The server computes everything** (PRODUCT.md).
- **Languages** (PRODUCT.md): French and Arabic equal; Arabic right-to-left with Western,
  left-to-right digits; no English locale.
- **Images** (PRODUCT.md 249–258, front-end context): no player photo without a signed
  release (a released photo may appear in share images); crests in share images undecided,
  club discs used today.

**To confirm with the owner** (Claude lab critics, `DIRECTIONS.md` binding rules, or this
author; no PRODUCT.md or owner source): never the words "pull", "pack" or "level up" (lab
rule 5); club colour on the 44px token (lab rule 8); no QR code; an ID never shows a
denominator ("x/1000") and is never chosen, bought or granted later; the founder offer closes
by date, not count; founder status never upgrades, looks the same at every tier, and later
cohorts get a different mark. (The owner's brief did suggest a "numbered edition mark" and
asked designers to think about rarity.)

---

## 5. Decisions the owner must make before any formula is coded

Put these in plain words, each with your recommendation, so that a reply such as "yes to all
except 4 and 9" settles them. Once a formula meets real data, changing it means a new rules
version, not an edit.

**Safe before any answer:** the schema (serial nullable); a versioned, immutable rules table
holding weights, thresholds, window and minimums as data, **with no row shipped**; the
switch and the ledger; account-deletion coverage; the read API and its tests, with
placeholder rules inserted inside each test's rolled-back transaction.

**Formulas** (every N and minimum is a placeholder, revisited at calibration)

1. **OVR.** **Recommend the equal-weight mean of the four stats, rounded** (not a weighted
   mean or a rank): it explains itself and matches the sample (91/82/86/78 → 84). One stat
   null: average three; fewer than three: null. So a manager who never transfers gets an OVR
   from three stats.
2. **CAP.** **Recommend: per stable gameweek, the effective captain's `final_points` ÷ the
   best in that locked XI, averaged** (over bonus-against-average or top-scorer share). The
   vice counts only when the captain has `minutes_played = 0` (zero official minutes, not
   `did_play`); both at 0: skip. Cross-check `scoring_details` when present. Skip a best
   score of 0 or less; clamp negative ratios to 0. The design doc defines double gameweeks.
3. **SEL.** **Recommend `starting_points` ÷ the best legal XI from that week's 15** (over
   1 − bench ÷ total), **excluding Bench Boost weeks** and any optimum of 0 or less.
4. **TRF.** **Recommend: per confirmed batch, over N = 3 stable gameweeks (not the holding
   period), incoming minus outgoing `final_points`, minus `point_hit` divided across the
   batch's transfers, averaged per transfer.** Exclude Free Hit, include Wildcards, count a
   batch once its window is final. No batch: **null**, not 0, which can hide a manager who
   never acts.
5. **CON.** **Recommend the share of stable gameweeks in the top half of that week's board**
   ("you beat half the managers in 7 of 9"), over "at or above average" or percentile
   spread. Needs final gameweek boards: verify first.
6. **Scale.** **Recommend integers 1–99 from fixed piecewise-linear scales,** calibrated once
   on real 2026/27 data (a read the owner grants) and frozen in the rules row, so a card moves
   only when its owner's data does. Never calibrate on invented numbers.
7. **Window.** **Recommend per season,** frozen at season end into history. Until a new season
   reaches its minimum, show last season's values with its label; in the first season, a dash.
8. **Minimum.** **Recommend null until 3 final results, `provisional` until 5.** Count only
   `state='final'` rows. Neither lab draws this state yet.
9. **Tiers.** **Recommend fixed OVR thresholds** set at calibration so LEGEND ≈ top 1%,
   CHAMPION next 4%, PRO next 15%, STADE next 30%, HOMA the rest (a proposal). **May they
   fall?** Recommend yes, as honest measurements; the record (seasons, best tier, founder)
   only grows. Note: your brief describes progression, and users may read a falling tier as
   a loss. The alternative is a season-best tier with the current OVR beside it.
10. **XP.** Your brief plans XP in the long-term lifecycle (performance → XP → progression →
    OVR → tier → badges). The labs were told not to build it, a lab-scope rule now superseded
    by this backend request. **Recommend no XP in v1,** because no formula or rule defines it
    yet. Your decision.
11. **Cadence.** **Recommend once per stable gameweek, never during live play.**
12. **What counts.** **Recommend every final result,** passive weeks included. For CAP, ask
    whether to exclude weeks whose deadline fell before PR #376 shipped.

**Identity**

13. **Founder.** **Recommend: a 2026/27 team created before a cut-off, plus one final
    result, excluding staff and test accounts** (account dates are unreliable). Granted once
    after the cut-off by a guarded script the owner runs, never later. **Safe now:** the
    column, and a grant function taking the cut-off and an explicit exclusion array, also
    excluding `app_private.staff_principals` and `@botolago.com` accounts (swap in #348's
    table by a new migration once it lands).
14. **BOT number.** **Recommend random and unique, 100000–999999** (`^[1-9][0-9]{5}$`, about
    900,000), assigned once when a card row is created, never reused, managers only.
    Sequential numbers leak the user count, and a leading zero would fake early-adopter
    status. Ask: exclude special numbers (repeated digits)? And confirm that a serial-seeded
    texture (lab concept 01 seeds with `parseInt(serial)`) never yields rarer-looking
    variants, since the draw is chance and permanent.
15. **Deleted accounts.** **Recommend retiring the number forever** in a private list with no
    user id; founder status goes with the account. Reissuing would recreate the deleted card.
16. **Country.** **Recommend none in v1, or an optional user-chosen field** (`app.countries`).
    Never infer it.
17. **Name, avatar, club.** **Recommend** one name in both scripts (the board rule); no avatar
    on other people's cards (owner-only storage), the client draws the shared figure; club
    colours null when missing.
18. **History.** The directions need seasons, gameweeks, previous OVR, tier-ups or join
    year. **Recommend one snapshot row per (manager, season, evaluated gameweek),** which
    covers all. A "seen" record is D21.
19. **Visibility.** **Recommend signed-in readers only, behind a read switch** (not opt-in
    or full public), addressed by Fantasy team id, never a user id, nothing for anonymous
    readers. For a deleted-pending profile, no card (the Pronostics behaviour), not the
    Fantasy boards' renamed row.
20. **Privacy.** Does the privacy policy need a line saying ratings are visible to signed-in
    users? (Owner or legal.)
21. **Seen moments.** **Recommend recording on the server which onboarding moments each manager
    has seen**: one small table, written only by an acknowledgement RPC. This reverses D18's
    "defer any seen flag". Without it the app falls back to keys on the device: a moment can show
    again on a second phone, and the owner loses the only privacy-light measure of whether
    managers came back to see their first rating (aggregate counts of acknowledgements). Your
    decision.

**Front end only:** French or English on the Latin card; Arabic tier names and SEL label; the
direction; the Semelle cultural test (flagged by the lab's own critics in `CRITIQUE.md`: a
shown sole is an insult); achievements (none in v1); section 4's "to confirm" list.

---

## 6. Implementation plan

**Conventions**
- **Task number.** The ledger is unordered (its tail is BG-0054). Highest on main:
  `grep -o 'BG-0[0-9]\{3\}' docs/engineering/LAUNCH_LEDGER.yaml | sort -u | tail -1`; on each
  open PR branch:
  `git show origin/<branch>:docs/engineering/LAUNCH_LEDGER.yaml | grep -o 'BG-0[0-9]*' | sort -u | tail -1`.
  On 2026-10-08 main ends at BG-0157 and no checked branch claims BG-0158. Re-check before
  merging.
- **Branch:** your session's, or `agent/BG-0158-manager-card-backend`. **Commits:**
  `BG-0158: <summary>`. **Object names are proposals.**

**Phase 0: read and confirm**
- Read section 7; `git fetch --unshallow` if shallow; list open PRs and their migrations.
- Confirm from the repository: no script writes `rank`/`overall_rank`; version and postwork
  semantics; lock keys; step-up counts.
- Do not read staging or production. Ask the owner instead: does `profiles.created_at` equal
  `auth.users.created_at`; which ruleset 2026/27 uses; do old results have null
  `scoring_details`; are gameweek boards final once the gameweek is; are `20261005130000` and
  `20261006143700` applied on production.
- Also ask: "You said Codex already did backend work. I found no Manager Card backend on any
  branch, PR or commit as of <date>. Is there unpushed Codex work on the card (a Codex task,
  a local branch, a staging change) I should build on or wait for? Is any Codex agent writing
  to staging or production now?" No Phase 2 until answered.
- **Accept:** a short note of what you confirmed and where facts differ from this prompt.

**Phase 1: design doc and decisions**
- `docs/backend/MANAGER_CARD_DOMAIN_PLAN.md` (model `PREDICTIONS_DOMAIN_PLAN.md`): sources per
  stat, every D2–D5 edge case, schema, computation, API, visibility, deletion, switch, job,
  risks. Add `docs/engineering/tasks/BG-0158/engineering-brief.yaml` (template
  `docs/engineering/schemas/engineering-brief.yaml`) and the ledger entry.
- Send the first report (section 8), then **end your turn and wait**. Phase 2 starts only on
  an explicit answer: the decisions, or "build the decision-free parts first".
- **Accept:** the owner's answers recorded in the doc.

**Phase 2: schema, switch, deletion coverage**

Every table: RLS forced, `revoke all`, every foreign-key column indexed. Rows keyed to a
season or gameweek reference it on delete cascade or carry no foreign key; check against
`api.service_rollback_fantasy_catalog` (`20260918170000`) and
`scripts/backend/fantasy-catalog-restage-maintenance.sql`.
- `app.manager_cards`: `user_id` PK → `app.profiles(id)` on delete cascade; `serial`
  nullable, unique, never updated (check per D14); founder cohort and granted-at.
- `app.manager_card_seasons`: user, season, `fantasy_team_id` (on delete cascade); `ovr`,
  `tier`, four nullable stats, raw ratios, gameweeks counted, `provisional`, `rules_version`,
  through-gameweek, `calculated_at`.
- `app.manager_card_gameweeks`: history, keyed (user, gameweek).
- `app_private`: versioned rules (**no row**); settings (`compute_enabled`, `read_enabled`,
  both false); ledger keyed (gameweek, rules version, `scoring_input_version`); a job log;
  retired serials without user id, filled by an AFTER DELETE trigger on the card row.

A separate migration adds the card lock to `account_deletion_erase`; it raises unless the
anchor occurs exactly once and the new definition differs from the old. Add the key to the
array in `account_deletion_automatic.test.sql`; name the tables, serial retirement and lock
in `ACCOUNT_DELETION_RUNBOOK.md`.

**Accept:** `backend:migrations:check` passes; deleting a test user removes every card row
and retires the serial; a deleted-pending profile's card is hidden by every read RPC and
skipped by the tick; with the switches off, nothing writes.

**Phase 3: computation** (after the D1–D12 answers)

An `app_private` function evaluates one gameweek under one rules version:
- **Evaluable:** stable, with the postwork row for its current `scoring_input_version`
  completed. Walk the season in sequence order, skipping `cancelled`.
- **Corrections:** when a gameweek's version differs from its ledger row, re-evaluate it and
  every later gameweek in order. Read the version at the start and end; abort without
  writing if it changed.
- Skip deleted-pending profiles. Recompute season values from all final rows, never deltas,
  so re-runs are identical. Write season and history rows, then the ledger row, under its own
  advisory lock. Assign serials only once D14 and D15 are answered.
- **No rules, no work:** without an active rules row the tick returns
  `{"outcome":"no_rules"}` and writes nothing, even with `compute_enabled` true.
- **Batches:** `set local statement_timeout` in the tick. Size batches on a synthetic local
  fixture of at least 50,000 teams (`docs/operations/LOAD_TEST.md`) or the owner's figure;
  record the time per batch in the PR.

**Driver:** pg_cron `manager-card-tick`, every 15 minutes, evaluates every unevaluated
evaluable gameweek in order, capped per run. No separate backfill; nothing hooks the runner.
`manager-card-history-prune` deletes only `manager-card-tick` rows older than 7 days from
`cron.job_run_details` and old job-log rows, never `app.*` card tables. You run the
computation only locally or in CI; on staging or production the owner runs everything, dry
runs included (a rolled-back run still writes), from a guarded script you prepare. Founder is
granted only through its own function.

**Accept:** hand-computed fixtures reproduce every stat, OVR and tier; a second run changes
nothing; null, provisional, Bench Boost, Free Hit, corrected, cancelled and `no_rules` cases
hold; no Fantasy table is written; the prune spares card history.

**Phase 4: read API** (`security definer`, `search_path ''`, `pg_catalog` arguments)
- `api.get_my_manager_card()`; `api.manager_card_status()` and `api.ack_manager_card_moments(text[])` (see section 6a); one card by Fantasy team id; a batch of up to 100 team ids for
  ranking rows (fields a proposal, settled in the design doc once a direction is picked); the
  caller's history, keyset-paged.
- Each is gated by `read_enabled`, filters `deleted_at`, never returns a user id or e-mail,
  follows D19 grants, and, since it calls `auth.uid()`, runs
  `perform app_private.assert_mfa_step_up();`. Raise the 77 by exactly that number and add
  "the N Manager Card reads (<version>)" to the line-413 description.
- Name and handle follow the section 4 contract, with pgTAP cases for both fallbacks.
- Optionally `src/backend/manager-card/{contracts,errors,supabase-repository,mock-repository}.ts`,
  mock data labelled as a sample. No routes, no components.

**Accept:** cross-user and anonymous denial, refusal while off, deleted profiles hidden.

**Phase 5: tests, types, docs, apply script**
- **pgTAP** `supabase/tests/database/manager_card.test.sql`:
  `begin; select extensions.plan(N); … select * from extensions.finish(); rollback;`,
  assertions as `extensions.is`/`extensions.ok`, helpers `pg_temp.id`/`pg_temp.act`. Cover
  constraints, grants, RLS, denial, switch-off, fixtures, idempotency, corrections, deletion
  cascade, serial retirement, the erase lock.
- **Bun tests** for scripts and repositories.
- **Runbook** `docs/backend/MANAGER_CARD_OPERATIONS_RUNBOOK.md` (switches, rules, founder
  grant, pausing, health); the **AGENTS.md** entry.
- **Apply script (mandatory)** `scripts/backend/apply-<version>-manager-card.sql`, modelled
  on `apply-20261006143700-account-deletion-automatic.sql`: rehearsal by default; sha256 of
  each migration; preflight refusing unless `20261005130000` and `20261006143700` are in
  `supabase_migrations.schema_migrations` and no new object exists; postflight checking both
  switches false, the grants and the erase lock. With its bun test. Never run it.
- **Optional:** an `ops_health_checks` wrapper.
- **Run** where possible: `backend:migrations:check`, `backend:secrets:check`,
  `backend:db:reset`, `backend:db:test`, `backend:db:lint`, `backend:types:check`,
  `bun run test`, `typecheck`, `lint`, `build`.

**Phase 6: PR.** Create it (if not already open) with
`gh api repos/mrdata007/botolago-foundation/pulls -f title=... -f head=<branch> -f base=main -F draft=true -f body=...`
or GitHub MCP `create_pull_request` with draft true. Description: the brief and decisions;
what ships off; evidence (what ran, where, what did not); production order `20261005130000`
→ `20261006143700` → this feature; the owner's actions. **Accept:** both `backend-quality`
jobs (`application-quality`, `database-quality`) green, run linked; a local run alone is not
evidence to report. Then wait.

---

## 6a. Onboarding moments (milestones the app shows once)

**Why this exists.** The app will show a few one-time moments around the card: the card's
birth with the first squad, the first rating, the end of "provisional", a first higher tier,
founder, a season's close, and the next season's start. Each must appear once per account
across devices, never before its data exists, and never hold the number back (lab rule 5).
The server derives every moment from rows it already writes and records which ones the
manager has seen. Routes, components and copy stay out of scope (section 1).

**Rules for this part** (in addition to sections 2 and 4)
- **Display-only.** No prize, ranking, league, Fantasy rule or job reads a moment or an
  acknowledgement. Acknowledging writes nothing but the acknowledgement.
- **Signed-in only for anything personal** (D19). The one anonymous read returns the switch and
  the two minimums, nothing else.
- **Null until the minimum** (D8). No moment is derived from a null OVR; `first_rating` exists
  only once an OVR exists, which may be later than the third counted result (D1).
- **Ships off.** With `read_enabled` false or no active rules row: the status read says
  `enabled: false`, the card reads refuse as Phase 4 says, the acknowledgement RPC refuses, and
  nothing is written.
- **Account deletion** covers the new table by cascade; `ACCOUNT_DELETION_RUNBOOK.md` names it.
  A deleted-pending profile gets no card and no moments, and cannot acknowledge.
- **No event table, no queue, no notification, no e-mail, no push.** Moments are recomputed from
  rows on every read, so re-runs and corrections cannot create duplicates.
- **No browser write at save.** The tick creates card rows; the read answers `forming` until it
  has (below).

**D21** (seen moments) is in section 5.

### Data model (Phase 2)

**`app.manager_card_moment_acks`** (name a proposal)

| Column | Type | Rule |
|---|---|---|
| `user_id` | `uuid not null` | → `app.profiles(id)` **on delete cascade** |
| `moment_key` | `text not null` | check on the allowed shapes (below) |
| `acknowledged_at` | `timestamptz not null default now()` | |

- Primary key `(user_id, moment_key)`. Its leading column indexes the foreign key.
- Key check:
  `moment_key ~ '^(card_created|founder_granted|tier_changed:(stade|pro|champion|legend)|(first_rating|provisional_cleared|season_closed|season_started):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'`.
  The uuid is the `fantasy_season_id`; tier codes are the contract's lowercase codes. `homa` is
  never a key.
- RLS enabled and forced, `revoke all` from the four roles, no policies, like every `app` table.
- **No foreign key to cards, seasons or gameweeks** (section 2's rule on season-keyed rows): an
  acknowledgement can precede the card row (the forming answer), and a key whose season is
  removed by `api.service_rollback_fantasy_catalog` simply stops matching any moment. Check this
  against `scripts/backend/fantasy-catalog-restage-maintenance.sql` as Phase 2 asks.
- A few rows per manager per season. Kept for the life of the account (they are what stops
  repeats); never pruned.
- **Verify first:** whether tables written only through `api.*` RPCs carry
  `app_private.refuse_unverified_mfa_actor()` like the 26 in
  `ordinary_account_mfa_step_up.test.sql`. If the pattern applies, add the trigger and raise 26 by
  one.

### Tick additions (Phase 3)

- **Card rows.** Each run first inserts missing `app.manager_cards` rows for managers with a team
  in the current fantasy season whose profile is not deleted-pending, capped per run, idempotent,
  under the tick's lock. The serial is assigned as D14 says, only once D14 and D15 are answered
  (null before). The number therefore appears within one run (15 minutes) of the first save, with
  no browser write.
- **Season rows from the first final result.** Write the season row with `gameweeks_counted` and a
  null OVR from the first stable gameweek, so "1/3" is a server fact.
- **History rows below the minimum.** One row per evaluated gameweek (D18) even while OVR is null:
  `ovr` (nullable), `tier` (null while OVR is null), `provisional`, `gameweeks_counted`,
  `calculated_at`, `rules_version`, calculation version.
- **Season close.** A `closed_at` on `app.manager_card_seasons`, set once when the season's last
  gameweek is evaluated and the fantasy season is over (D7's freeze). **Verify first** how a
  fantasy season's end is recorded.
- **Founder.** `founder_granted_at` (planned) and a `founder_cutoff_date` the grant function records
  once, alongside the cohort (D13).

### Moments: derivation (Phase 4)

Each moment is returned by `api.get_my_manager_card()` only while it is **pending** (derivable,
not acknowledged, and inside its window). `occurred_at` is the source row's time.

| Kind | Key | Exists when | Values returned | Returned while |
|---|---|---|---|---|
| `card_created` | `card_created` | The caller has a card row, or the forming answer applies | `season_label`, `created_at` (null for the forming answer) | not acknowledged |
| `first_rating` | `first_rating:<fs>` | The season's lowest-sequence history row with OVR not null | `gameweek_seq`, `ovr`, `tier`, `provisional`, `gameweeks_counted` on that row, `calculated_at`, `first_ever` (no earlier season has a non-null OVR) | not acknowledged, and `<fs>` is the current fantasy season |
| `provisional_cleared` | `provisional_cleared:<fs>` | The season's lowest-sequence history row with OVR not null and `provisional = false` | `gameweek_seq`, `ovr`, `gameweeks_counted` | not acknowledged, current season |
| `tier_changed` | `tier_changed:<tier>` | The account's earliest history row (any season) at that tier, tier ≠ `homa` | `tier`, `previous_tier` (the row before), `ovr`, `gameweek_seq`, `season_label` | not acknowledged, and the current tier ranks at or above it |
| `founder_granted` | `founder_granted` | Founder cohort not null | `cohort`, `founder_granted_at`, `founder_cutoff_date` (nullable) | not acknowledged |
| `season_closed` | `season_closed:<fs>` | The caller's season row for `<fs>` has `closed_at` | `season_label`, `ovr`, `tier` | not acknowledged, and `<fs>` is the caller's most recently closed season |
| `season_started` | `season_started:<fs>` | The caller has a team in `<fs>` and a closed season row for an earlier season | `season_label`, `previous {label, ovr, tier}` | not acknowledged, `<fs>` current, and that season's OVR still null |

- A jump from HOMA straight to PRO yields `tier_changed:pro` only. A fall is never a moment.
- A correction that re-evaluates gameweeks recomputes the same keys; it never creates a second
  moment and never returns an acknowledged one to pending.
- Values are codes and numbers. The client holds every label (section 4 contract).
- If D21 is declined, return the same list with `acknowledged` omitted; the app keeps device keys.

### RPCs (proposals, Phase 4)

All `security definer`, `set search_path = ''`, `pg_catalog` argument types only, errors
`PT400/401/403/404/409` with snake_case messages (section 3.2).

1. **`api.manager_card_status()` → `jsonb`** `{enabled boolean, min_rated integer|null,
   min_confirmed integer|null}`.
   - `enabled` = `read_enabled` and an active rules row. Minimums from that row; null when not
     enabled.
   - Grants: `anon, authenticated, service_role`. Reads no caller (no `auth.uid()`), so **no
     step-up and no change to the 77**. No personal data, no counts.
   - Why: guest copy must never promise a card while the feature is off. It does not weaken D19:
     anonymous readers still get no card data.
2. **`api.get_my_manager_card()`**, additions to the planned read:
   - `rating_state`: `forming` (counted below the minimum), `insufficient` (minimum reached, OVR
     null), `provisional`, `rated`.
   - `gameweeks_counted`, `min_rated`, `min_confirmed`, `rules_version`, `through_gameweek_seq`,
     `calculated_at`.
   - `rating_gameweeks integer[]|null`: sequence numbers of the first `min_rated` non-cancelled
     gameweeks from the team's first counted gameweek, only those already in the calendar, plus
     `rating_gameweeks_complete boolean`. **Verify first** how the team's first gameweek is known
     (the initial squad's `acquired_gameweek_id`, or the enrolment gameweek).
   - Null reasons: `ovr_null_reason` in `pending_minimum | too_few_stats`; each stat as
     `{value, null_reason}` with `null_reason` in a **closed set**: `pending_minimum`,
     `no_transfers`, `window_open`, `excluded_weeks_only`, `board_not_final`, `pre_captain_fix`.
     The set is versioned with the rules version; the design doc defines when each applies.
   - `previous_season {label, ovr, tier}|null` (D7), `season_closed boolean`.
   - `founder_granted_at`, `founder_cutoff_date` (nullable).
   - `first_rated_gameweek_seq` (current season, nullable), `best_tier` (all seasons).
   - `next_tier {code, from_ovr}|null`, only if D9 uses fixed thresholds.
   - `moments`: the pending list above.
   - **Forming answer.** If no card row exists yet and the caller has a team in the current
     fantasy season and no `deleted_at`, return the card with `rating_state 'forming'`,
     `gameweeks_counted` 0, `serial` null, founder null, `created_at` null, and `moments` holding
     `card_created`. Gated like the rest.
   - Already counted in the step-up plan; no further change.
3. **`api.ack_manager_card_moments(p_keys text[])` → `text[]`**
   - Caller from `(select auth.uid())`; `perform app_private.assert_mfa_step_up();`.
   - Inserts one row per key, `on conflict do nothing`; returns every key now acknowledged (new or
     earlier). Duplicates in the array are ignored.
   - Errors: `PT401 not_authenticated`; `PT403 manager_card_disabled` (read off or no rules);
     `PT404 manager_card_not_found` (no card row and no forming answer, or deleted-pending);
     `PT400 invalid_moment_key` (empty array, more than 16 keys, or a key failing the shape check);
     `PT409 moment_not_available` (a well-formed key that is not currently derivable for the
     caller, so founder cannot be acknowledged before the grant). The app ignores `PT409`.
   - Grants: `authenticated, service_role`. Never `anon`.
   - Writes only the caller's rows and nothing else.
   - Raises the step-up count by one. **Verify first** which test counts a caller-writing
     function (section 3.4's 77 lists every caller-reading `api` function).
4. **Batch read** (planned, up to 100 Fantasy team ids): add `rating_state`, `gameweeks_counted`,
   `provisional`, `first_rated_gameweek_seq`. Never moments or acknowledgements.
5. **History read** (planned): rows must carry `tier`; used for replay and `tier_changed`.

### Verify first (Phase 0)

- **Club.** Profile setup saves the club as `favorite_team_provisional_ref`
  (`src/services/auth-supabase.ts:529` → `complete_onboarding`,
  `src/backend/identity/supabase-repositories.ts:86–92`). Nothing in the client writes
  `favorite_team_id`, which section 4's club row reads. Find what the reference holds and whether
  it maps to one `app.teams` row. The card read returns `favorite_team_id`'s team, else the
  resolved reference, else null. Never write `user_preferences` from the card.
- **Name.** Whether registration writes the full name ("Nom complet") into `display_name`, the
  card name under D17.
- The team's first counted gameweek (for `rating_gameweeks`) and how a fantasy season's end is
  recorded (for `closed_at`).
- The two step-up questions above.
- Whether an account data export exists that must list the new table.

### Operations (Phase 5 runbook)

- **Launch order.** Active rules row → `compute_enabled` → let the tick catch up until the ledger
  holds every evaluable gameweek of the season → `read_enabled`. Switching reads on earlier shows
  launch-day managers 0/3 and then a jump.
- Turning reads off hides every moment and keeps the acknowledgements; turning them back on
  resumes where people left off.
- **Measurement.** The owner may grant aggregate-only reads of acknowledgements (counts per key per
  week, joined to history for first-rating reach, or to `preferred_language` for a French/Arabic
  split). Never export rows with user ids.
- No new scheduled job; the tick's AGENTS.md entry already covers its writes. The acknowledgement
  RPC writes only its own table, which no job writes.

### Tests (Phase 5)

pgTAP in `supabase/tests/database/manager_card.test.sql` or a sibling
`manager_card_moments.test.sql`, with placeholder rules inside each test's rolled-back transaction.
- **Table:** RLS enabled and forced; no grants to `anon` or `authenticated`; the key check rejects
  `first_rating:not-a-uuid`, `tier_changed:homa`, `founder_granted:x`.
- **Status:** callable by `anon`; `enabled` false with the switch off, false with the switch on and
  no rules, true with both; minimums from the rules row; no other keys in the result.
- **Forming answer:** a manager with a team and no card row gets `forming`, serial null, and
  `card_created` pending; after acknowledging, it is gone.
- **Derivation fixtures:** `first_rating` at the lowest non-null row, **not** at the third counted
  row when OVR stays null there (two null stats); `provisional_cleared`; `tier_changed` only for
  tiers never held and only while held; HOMA never a key; HOMA → PRO yields only `pro`; founder
  absent before the grant and present after; `season_closed` and `season_started`; a moment from an
  earlier season is not returned; a correction re-evaluation creates no second moment and does not
  reopen an acknowledged one.
- **Acknowledgement:** idempotent (a second call changes nothing and returns the same keys); a
  batch; 17 keys refused; a malformed key refused; founder before the grant refused (`PT409`);
  anonymous refused; switch off refused; deleted-pending refused; an unverified MFA actor refused,
  as the other step-up tests do. A caller can only write their own rows (keys carry no user id).
- **Deletion:** `account_deletion_erase` removes the caller's acknowledgements through the cascade;
  a new account starts with none.
- **Display-only:** no Fantasy, prize or ranking function references the table (a catalog search,
  like the other display-only guards).
- **Counts:** the step-up counts raised by exactly the number added, with the description lines
  updated.
- **Bun:** the repository maps `moments`, `rating_state` and the null reasons; mock data is
  labelled as samples.

### Accept

- **Phase 2:** `backend:migrations:check` passes; table, check and grants as above; deleting a
  test user removes their acknowledgements.
- **Phase 4:** with the switches off nothing reads or writes; the anonymous status returns only its
  three fields; the forming answer and every derivation fixture hold; acknowledgements are
  idempotent and refuse moments that do not exist yet; the step-up counts are raised.
- **Phase 5:** a green `database-quality` run, linked; the runbook has the launch order and the
  aggregate-only measurement rule; the apply script's postflight checks that the status grant
  includes `anon` and the acknowledgement grant does not.

### Where it slots into the phases

- **Phase 0:** add the "Verify first" list to the questions you confirm or ask.
- **Phase 1:** a design-doc section "Onboarding moments" (derivation table, keys, RPCs); D21 in
  the decision list and one line for it in the first report.
- **Phase 2:** the acknowledgement table, RLS, grants, deletion coverage and the runbook entry.
  It is decision-free apart from D21 and can be built as soon as D21 is answered.
- **Phase 3:** card rows created by the tick; season rows from the first final result; history
  rows below the minimum with `tier`; `closed_at`; the founder cut-off stored by the grant.
- **Phase 4:** the status RPC, the read additions with the forming answer and `moments`, the
  acknowledgement RPC, the batch and history additions.
- **Phase 5:** the tests, the runbook section, the apply-script postflight.
- **Phase 6:** the PR description lists D21 and what the read returns for onboarding.

### Later (only when the owner asks, after D2, D3 and D5)

Per-round ingredients for the app's weekly fact during the wait, on each history row: the
effective captain's base points, the best base points in the locked XI, starting points, the best
legal XI from the 15, a top-half flag, each nullable with an exclusion reason. These are the facts
the ratios are built from, not ratings, with the same visibility as the history read.

### Not proposed, and why

- **An `ensure` or `claim` RPC at save.** A browser write on the activation path, more step-up
  surface, and a serial failure that could block a save. The forming answer and the tick give the
  same result within one run.
- **An event table.** Every moment is derivable from rows the tick already writes; a table would
  need its own deletion coverage and could disagree with history after a correction.
- **Notifications.** Push and e-mail are off in production; no moment depends on one.

---

---

## 7. Files to read first, in order

1. `AGENTS.md`, `CLAUDE.md`.
2. `PRODUCT.md` ~225–260.
3. `docs/backend/GREENFIELD_MASTER_PLAN.md` §1, §2, §5, §6.
4. `docs/backend/MIGRATIONS.md` (lags practice), `scripts/backend/validate-migrations.mjs`.
5. `docs/backend/IDENTITY_AUTH_RUNBOOK.md`, `20260720075453_identity_domain.sql`,
   `20260720095330_football_catalog.sql`.
6. `docs/backend/FANTASY_DOMAIN_PLAN.md`, `FANTASY_RULES_V1.md`.
7. Migrations `20260720141826`, `…141847`, `…141850`, `20260914200740`, `20260914200744`,
   `20260927140000`.
8. `docs/backend/INCREMENTAL_FANTASY_POINTS.md`, `FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md`.
9. `scripts/backend/fantasy-lifecycle-runner.ts`, `20260924120000_fantasy_prizes.sql`.
10. `docs/backend/FANTASY_PUBLIC_RECAPS.md`, `20261005130000_fantasy_public_recaps.sql`.
11. `20260921180000_fantasy_overall_standings.sql`, `20260921200000_fantasy_points_read_surfaces.sql`.
12. `docs/backend/ACCOUNT_DELETION_RUNBOOK.md`, `20261006143700_account_deletion_automatic.sql`,
    `scripts/backend/apply-20261006143700-account-deletion-automatic.sql` and its test.
13. `20260926003100_ordinary_account_mfa_step_up.sql`, both `ordinary_account_mfa_step_up*.test.sql`.
14. `20260925090200_predictions_api.sql` (grants, errors).
15. `supabase/tests/README.md`, `account_deletion_automatic.test.sql`.
16. `src/backend/predictions/`, `src/backend/fantasy/contracts.ts` ~201.
17. `docs/engineering/schemas/engineering-brief.yaml`, `docs/engineering/AGENT_SYSTEM.md` §27–29.
18. `docs/operations/DEPLOYMENT.md`, `docs/backend/MIGRATION_DRIFT.md`,
    `docs/backend/RELEASE_ACTIVATION_MIGRATION_RUNBOOK.md`.
19. The labs. First
    `git fetch origin claude/affectionate-galileo-8l9mxh:refs/remotes/origin/claude/affectionate-galileo-8l9mxh design/manager-card-exploration:refs/remotes/origin/design/manager-card-exploration`.
    Claude: `git show origin/claude/affectionate-galileo-8l9mxh:design-lab/manager-cards-claude/CONTRACT.md`,
    then `DIRECTIONS.md`, `CRITIQUE.md`, `src/kit.js`. Codex:
    `git show origin/design/manager-card-exploration:design-lab/manager-cards/BRIEF.md`
    (values inlined, no profile object).
20. `git show origin/claude/affectionate-galileo-8l9mxh:design-lab/manager-cards-claude/ONBOARDING_PLAN.md`:
    the front-end onboarding plan section 6a serves (moments, states, copy).

---

## 8. Reporting back to the owner

The owner prefers short, plain answers without jargon.

**First report (Phase 1):** two or three sentences on what you found; the Phase 0 questions
(unpushed Codex work, production state); the section 5 list (D1–D21), one plain line each with your
recommendation; "Which do you change?"; the design doc link. Then stop and wait.

**Final report**
- One paragraph on what the card can now do; what is off and how to turn it on.
- What you tested and where (local, CI), and what did not run; any database you wrote to.
- The owner's remaining actions, in order:
  1. apply `20261005130000`, then `20261006143700` (#359 reports the last attempt failed;
     verify), then this feature's guarded script;
  2. calibrate and apply rules v1: an aggregate-only production read the owner grants, then a
     new migration or guarded owner-run script inserting rules version 1;
  3. set the founder cut-off and run the grant;
  4. switch the feature on.
- The draft PR link.

**Always:** never claim a check you did not run; never state an unverified item as fact; ask
before any write, or any read of staging or production, outside your local stack.
