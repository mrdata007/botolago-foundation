# BotolaGO Fantasy — production launch hardening audit (2026-09-18)

Feature-frozen tree: branch `claude/botolago-fantasy-recovery-jtvxz4`,
commits `5e6035c`, `7a776ae`, `b6ce7c4`, `3b2083a` on top of `main` (`5731246`)
plus this audit's documentation commit. Nothing in this pass adds a feature or
changes a screen.

## 0. Branch verification and merge path

| Check                               | Result                                                                                                                                                                                                                                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commits on the branch not on `main` | exactly the four recovery commits (+ this audit commit)                                                                                                                                                                                                                                                     |
| Commits on `main` not on the branch | none — `main` has not moved since `5731246`                                                                                                                                                                                                                                                                 |
| Content of each commit              | `5e6035c` Fantasy screens/routes/i18n/tokens only; `7a776ae` `eslint.config.js` only; `b6ce7c4` env origin, contracts null-tolerance, kits, points/transfers fixes, e2e suite, docs, evidence; `3b2083a` QA corrections, e2e update, docs, evidence. No lockfile, workflow, migration or dependency change. |
| `git merge-tree origin/main HEAD`   | 0 conflicts; the merged tree's `eslint.config.js` has 0 payload markers and no line over 200 chars                                                                                                                                                                                                          |
| Payload in `origin/main` today      | **yes** (1 occurrence) — every CI run on `main` still executes it                                                                                                                                                                                                                                           |

**Safest merge path:** a fast-forward. `main` is an ancestor of the branch, so
`git checkout main && git merge --ff-only claude/botolago-fantasy-recovery-jtvxz4 && git push origin main`
(or a GitHub PR merged with "Rebase and merge" / fast-forward; avoid "Squash",
which would hide the security commit's history). Because the merge is a
fast-forward there is no merge commit in which a payload could be re-injected;
the resulting `main` tree is byte-identical to the branch tree verified below.
After the push, confirm on GitHub that `main:eslint.config.js` is 72 lines.

## 1. Security

- **Final tree:** `eslint.config.js` 72 lines, no line > 200 characters; no
  `_0x…(`, `global.i =`, `ETH_RPC_URL`, `eth_getTransactionCount` or
  `createRequire(import.meta` in any tracked file (the incident report is the
  only textual mention); no `eval`, `new Function` or `child_process` in app or
  config code; `package.json` has no install/prepare hooks; the config files that
  Node executes (`vite.config.ts`, `playwright.config.ts`, `eslint.config.js`,
  `bunfig.toml`) are clean; `bun.lock` is unchanged from `main`.
- **Provenance correction:** the payload is not in PR #135's branch commit
  `9def3e1` (max diff line 95 chars). It first exists in the **merge commit**
  `5731246` itself (2026-09-14 22:00 +01:00, author `mrdata007`). The merge was
  produced locally (or by a tool acting locally) and pushed with the extra
  line: an "evil merge". The producing workstation/toolchain is the primary
  suspect. Details in `docs/qa/SECURITY_INCIDENT_2026_09_18_ESLINT_LOADER.md`.
- **Execution paths that ran the loader since 2026-09-14 22:00:**
  1. GitHub Actions `Backend quality → application-quality` on every PR/push
     (default `GITHUB_TOKEN` only, `contents: read`; no repository secrets are
     passed to that job).
  2. Any developer machine, Lovable build sandbox or agent session that ran
     `bun run lint` (this session did, three times, before the cause was found;
     its container held GitHub, AWS and Google Cloud tokens in the environment).
- **Credentials to rotate (names only):**
  - GitHub: any personal / fine-grained token or SSH key on the machine that
    merged PR #135 and on any machine that ran lint; the Claude/agent GitHub
    App installation token is short-lived and expires on its own.
  - Supabase: `SUPABASE_ACCESS_TOKEN` (management API PAT), `SUPABASE_SECRET_KEY`
    (service role, rotate from the dashboard and update the GitHub environment
    `production-admin-activation`), `SUPABASE_DB_PASSWORD`, the local Supabase
    CLI login on developer machines. The publishable key is public by design.
  - Providers: `SPORTSMONKS_API_TOKEN`, `GNEWS_API_KEY`,
    `NEWS_INGESTION_TRIGGER_SECRET`, `BOTOLAGO_AAL2_NON_STAFF_ACCESS_TOKEN`.
  - Cloud: AWS and Google Cloud credentials present on affected machines or
    sessions.
    Repository secrets referenced by workflows that never ran lint in the same
    job (data ingestion jobs) are lower risk but are listed because the same
    developer machines hold copies.

## 2. Fantasy lifecycle — proven, not inspected

The production lifecycle is: SportsMonks fixtures → `app.fixtures` and
`app.rounds` (recovery workflow) → `service_stage_fantasy_catalog` creates
gameweeks and fixture assignments (activation only) → deadline (ruleset rule:
first kickoff − 90 min) → `service_advance_fantasy_lifecycle` freezes lineups,
goes `live` when a fixture starts and `provisional` when all are finished with
`finalized_at` → performances workflow writes `app.player_fixture_performances`
and the coverage rows → worker computes points, persists, finalizes, rolls
free transfers, ranks overall and leagues, completes the gameweek → postwork
(prices, notifications) → `service_prepare_next_fantasy_gameweek` carries every
squad into the next `scheduled` gameweek and opens it.

Rehearsal method: one SQL transaction on the production database, service
context via `request.jwt.claims`, ending in `RAISE EXCEPTION` so everything
rolls back; residue checked afterwards (all counters back to zero, GW1 `open`,
deadline unchanged, no performance/coverage/result/ranking/price rows,
teams still on GW1). Synthetic inputs were injected only inside that
transaction (finished results, one full-appearance performance row per
player, provider-format coverage rows, a round 2 with 8 mirrored fixtures).

| Step                                                                | Result (rolled back)                                                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Calendar realignment to 2026-09-24 20:00 UTC                        | deadline → 18:30 UTC via `fantasy_calculate_deadline`, audit row written                                           |
| Deadline passes → `service_advance_fantasy_lifecycle`               | `open → locked`, 3 lineups frozen                                                                                  |
| Before kickoff                                                      | `waiting: football_not_started` (no false start)                                                                   |
| Fixtures finished + finalized, performances + coverage present      | `locked → live → provisional`, season `registration_open → active`                                                 |
| Scoring snapshot + `service_persist_fantasy_scoring_results`        | 539 player results in 3.6 s; 3 team results: E2E Botola XI 8 pts (22 + 2 captain − 16 hit), QA Botola XI 24 pts ×2 |
| Finalization, Free Hit restore, free-transfer rollover              | 3 final results; free transfers 0 → 1 for every team                                                               |
| Rankings                                                            | overall 1–3 and 6 league ranking rows                                                                              |
| `service_complete_fantasy_gameweek`                                 | `finalized`                                                                                                        |
| Postwork: prices (6 batches, 539 history rows), notifications, done | `completed: true`; `nextGameweekId: null` on the real data (no GW2 exists)                                         |
| Synthetic GW2 (round 2, 8 fixtures, `scheduled`, deadline derived)  | `service_prepare_next_fantasy_gameweek` → GW2 `open`, 3 teams and 3 lineups carried, hub reports gameweek 2        |
| Whole chain                                                         | 5.0 s of database time                                                                                             |

**What prevents GW1 from closing and GW2 from operating automatically today:**

1. **Nothing is scheduled.** Fantasy progression runs only through the manual
   GitHub workflow `Run one reviewed Fantasy gameweek worker`
   (`fantasy-manual-worker.yml`), which additionally requires the repository
   variable `FANTASY_MANUAL_WORKER_ENABLED=true` (never set; 0 runs so far).
   Results and statistics also arrive only by manual dispatch:
   `Recover published current-season Football data` (fixtures/results; its daily
   schedule is gated by `FOOTBALL_CURRENT_SCHEDULE_ENABLED`, currently skipped,
   and its `refresh` mode requires a verified canary run id that does not exist,
   so only owner-dispatched `canary` runs work) and `Ingest current finished
Football performances` (5 fixtures per dispatch → 2 dispatches per round).
   Note that the recovery run reports `failure` at its final squad-guard step
   (`current_squad_empty_or_oversized`, promoted clubs missing at the provider)
   but its fixture phase has already committed — run #7 on 2026-09-17 is what
   wrote the current fixture rows.
2. **No GW2 exists and no supported operation can create it.** The only
   function that inserts `app.fantasy_gameweeks` / `app.fantasy_fixture_assignments`
   is `api.service_stage_fantasy_catalog`, which runs once at activation. The
   provider has published a single round; when round 2 lands in `app.rounds`
   there is still no service RPC to stage it as a gameweek. The rehearsal
   proves the _progression_ mechanics work once a `scheduled` GW2 with 8
   assignments exists, but creating it currently requires a reviewed database
   operation (new migration/service function or a guarded SQL runbook).
3. **Kickoff changes are not mirrored into assignments.** The worker refuses to
   freeze when `fixture.kickoff_at ≠ assignment.assigned_kickoff_at`
   (`fantasy_fixture_resolution_required`). The 8 fixtures carry the provider's
   placeholder `2026-09-24 00:00 UTC`; the first provider refresh that publishes
   the real time will change `kickoff_at` and block GW1 unless the assignments
   and deadline are realigned. Section 4 provides the mechanism.

## 3. Production data

| Check (539 players, season `9918cf95…`)        | Result                                                                                                                                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Duplicate football players                     | 0                                                                                                                                                                                                                                                            |
| Missing position                               | 0                                                                                                                                                                                                                                                            |
| Price null / outside 4.0–15.0 / not a 0.1 step | 0                                                                                                                                                                                                                                                            |
| Ineligible or inactive                         | 0                                                                                                                                                                                                                                                            |
| Clubs in catalog                               | 16, every club has ≥ 2 GK, ≥ 4 DEF, ≥ 6 MID, ≥ 3 FWD                                                                                                                                                                                                         |
| Player's club ≠ 2026/27 membership             | 0                                                                                                                                                                                                                                                            |
| Player in two clubs                            | 0                                                                                                                                                                                                                                                            |
| Same full name in the same club                | 2 clusters, distinct provider identities: "Abdallah Boukhanfer" ×2 (Hassania, born 1998 and 2000, MID), "Abdoulaye Coulibaly" ×3 (WCA, born 1991 / 2008 / unknown, MID/FWD). Likely homonyms plus one duplicate; not blocking, flagged for editorial review. |
| Clubs                                          | 16 active, all with crests, 21–47 memberships each; `code` is null for 15 of 16 (only WCA), so short codes on FDR/kit plates come from the name fallback                                                                                                     |
| Fixtures                                       | 8 in round 1, every club exactly once, all `not_started`, all `2026-09-24 00:00 UTC` (placeholder), provider refs present, 8 fantasy assignments aligned                                                                                                     |
| Rounds                                         | 1 (`planned`)                                                                                                                                                                                                                                                |

**How new fixtures and gameweeks enter:** SportsMonks → recovery workflow
(`canary` dispatch) → `app.rounds` / `app.fixtures` (fixture windows are cut from
the _provider's_ season start/end, which still says the season ends on
24 September, so later rounds will not be fetched until SportsMonks corrects
the season end). Gameweeks and assignments for those rounds: **no automated
path** (see §2, item 2).

## 4. Deadline correctness

- The database derives every deadline from the ruleset rule (90 minutes before
  the first kickoff); the current 2026-09-23 22:30 UTC value is derived from
  the provider's midnight placeholder, so it is wrong by construction.
- Public sources: the LNFP fixed the opening day as Thursday 24 September 2026
  (allAfrica, LeSiteinfo, Innovant, Elbotola). One fixture site (Foot Mercato)
  lists all eight matchday-1 games at 21:00 local time (20:00 UTC); no second
  source with kickoff times was reachable. That is not enough to rewrite
  production competition data on my own authority.
- **Mechanism delivered:** `scripts/backend/fantasy-realign-gameweek-calendar.sql`
  realigns fixtures, assignments, gameweek window and deadline for one open
  gameweek in a single guarded transaction (open status, deadline still in the
  future, no fixture started, new deadline in the future; the database trigger
  audits the change). It was exercised in the rehearsal (§2, step 1). The owner
  runs it once the LNFP programme is confirmed, or after the provider refresh
  publishes the real kickoff (in that case the script only mirrors the fixture
  time into the assignments and deadline).

## 5. Authentication

| Check                                   | Result                                                                                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider settings (`/auth/v1/settings`) | email provider on, sign-ups enabled, e-mail confirmation required (`mailer_autoconfirm: false`), no social providers                                                    |
| Sign-up                                 | registration form collects display name + username, sends them as user metadata; the `handle_new_auth_user` trigger creates profile + preferences                       |
| Login / logout / session persistence    | smoke test (§7): login, reload keeps session, logout from Profile, login again keeps the team                                                                           |
| Password reset                          | `POST /auth/v1/recover` → 200; redirect built from `VITE_APP_URL` (`https://botolago.com/auth/callback`)                                                                |
| Redirect allow-list / Site URL          | **not verifiable through the tooling** (dashboard only). Must contain `https://botolago.com/**`; the Lovable preview domain is only needed if the preview is still used |
| Leaked-password protection              | still disabled (advisor WARN) — dashboard toggle                                                                                                                        |

## 6. Production deployment

- `botolago.com` serves the Lovable publish of project `9f9face2…` whose latest
  synced commit is `5731246` (= `main`). The site therefore still runs the
  pre-recovery Fantasy and the loader-carrying tree (the loader only executes
  under ESLint, not in the browser bundle). After the fast-forward merge Lovable
  syncs `main` automatically; a **Publish** is still required to update
  `botolago.com`.
- `.env.production` (in the repo, used by `vite build`): all data modes
  `supabase`, `VITE_APP_URL=https://botolago.com`, production project ref/URL/
  publishable key. `www.botolago.com` and `botolago.lovable.app` redirect (302).
- Routing, mobile (390 px) and desktop (1280 px) viewports: covered by the
  journeys and smoke test screenshots in `docs/qa/fpl-screens/journey/` and the
  anonymous Playwright matrix (320/375/390/430/tablet/desktop, fr + ar).
- Production build: `bun run build` succeeds on the final tree.

## 7. Final smoke test (final tree, production backend)

Account created for this purpose: `e2e.fantasy.launch@botolago.com`
(synthetic, confirmed, same password policy as the other e2e accounts; delete
after launch). Driven through the real controls on the 390×844 viewport:

login → Fantasy tab → hub CTA → squad selection → 15 players picked one by one
→ remove via sheet → Add Player (any position) → captain + vice from the sheet
→ Next → team name → Enter squad → My Team → reload keeps 15 → Transfers →
tap player → Transfer out → pick → Next → Confirm → reload keeps the transfer →
Points → Leagues → Join → Help & Rules → back to Team → Profile → Se déconnecter
→ My Team asks to sign in → login → My Team still has 15 players.
**26/26 steps OK, no page errors.**

Automated regression on the final tree: typecheck clean; `bun test` 622 pass;
lint 0 errors (12 pre-existing warnings); build OK; Playwright: see §8.

## 8. Automated regression

First run (concurrent with the lifecycle rehearsal holding row locks on GW1):
13 passed, 1 failed (`captain and vice-captain … persist` timed out waiting
for the save toast while the rehearsal transaction held the gameweek row
lock), 3 skipped. Re-run with a quiet database: **18 passed, 0 failed,
3 skipped** (staging suite; staging project inactive).

## 9. Launch checklist

### BLOCKING — must be completed before launch

| #   | Item                                                                                                                                                                                                                                                                                                                                         | Status                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Merge the recovery branch into `main` by fast-forward and confirm `main:eslint.config.js` is clean                                                                                                                                                                                                                                           | **Owner action** (I verified the merge is conflict-free and payload-free; I do not merge to `main` without your go)                      |
| B2  | Rotate the credentials listed in §1 and inspect the machine that produced merge commit `5731246`                                                                                                                                                                                                                                             | **Owner action**                                                                                                                         |
| B3  | Publish the merged `main` from Lovable so `botolago.com` serves the recovered Fantasy                                                                                                                                                                                                                                                        | **Owner action** (after B1; Lovable syncs `main` automatically, publish is a click)                                                      |
| B4  | Set the real GW1 kickoff: run `scripts/backend/fantasy-realign-gameweek-calendar.sql` with the LNFP kickoff (Foot Mercato lists 24 Sept 21:00 local) before the current 23 Sept 22:30 UTC deadline                                                                                                                                           | **Owner action** (script delivered and rehearsed; needs the official time confirmed)                                                     |
| B5  | Decide and staff the GW1 close: after the last match, dispatch `Recover published current-season Football data` (mode `canary`), then `Ingest current finished Football performances` (2 batches), set `FANTASY_MANUAL_WORKER_ENABLED=true`, dispatch `Run one reviewed Fantasy gameweek worker` for `3cc19aaa-…` with calculation version 1 | **Owner action** — no schedule exists; the database side is proven (§2)                                                                  |
| B6  | Provide a supported way to stage GW2+ (service RPC or reviewed SQL runbook that creates the `scheduled` gameweek + 8 assignments from `app.rounds`/`app.fixtures`); without it the season stops after GW1                                                                                                                                    | **Owner decision** — feature freeze forbids me from adding the migration unasked; rehearsal proves the progression works once GW2 exists |
| B7  | Supabase Auth: confirm Site URL / Redirect URLs include `https://botolago.com/**`; enable leaked-password protection                                                                                                                                                                                                                         | **Owner action** (dashboard only)                                                                                                        |
| B8  | Delete or keep the three synthetic accounts (`e2e.fantasy.recovery/newcomer/launch@botolago.com`) and their teams/leagues before public rankings matter                                                                                                                                                                                      | **Owner decision** (I recommend deleting them after B5's first run is verified)                                                          |

### NON-BLOCKING — can be completed after launch

| #   | Item                                                                                                                                       | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| N1  | Review the two same-name clusters (Boukhanfer ×2 at Hassania, Coulibaly ×3 at WCA) with the provider                                       | open   |
| N2  | Fill `app.teams.code` for the 15 clubs without a short code (FDR/kit plates use the name fallback)                                         | open   |
| N3  | Enable `FOOTBALL_CURRENT_SCHEDULE_ENABLED` once a verified canary run id exists, so fixtures/results refresh daily without dispatch        | open   |
| N4  | Provider season end still says 24 September: later rounds will not be fetched until SportsMonks corrects it or the window logic is widened | open   |
| N5  | Add the CI guard against long/obfuscated lines recommended in the incident report                                                          | open   |
| N6  | French news heroes absent in production (Arabic has them); hub cards stay text-only until editorial attaches images                        | open   |
| N7  | Head-to-head public leagues not offered by the backend (control shown disabled)                                                            | open   |

**Verdict:** the application tree is verified (smoke 26/26, Playwright 18/18,
622 unit tests, clean typecheck/lint/build, lifecycle proven end to end on the
database), but the product is **not launch-ready** while B1–B8 are open: the
live site still runs the old tree, credentials are unrotated, GW1's deadline is
derived from a placeholder, nothing closes GW1 without a manual dispatch, and
GW2 cannot exist without a new database operation.
