# Manager Card: gap plan between the installed backend (#381) and the merged front end (Gradins)

**Status:** plan, 2026-10-09. Written read-only: no database outside the local stack was touched,
and the local stack (`postgresql://postgres:postgres@127.0.0.1:55322/postgres`, latest applied
migration `20261008123400`, 168 history rows) was only read.

**What this is.** The Gradins front end (PR #382) is merged and ships switched off. It reaches the
database only through `src/backend/manager-card/` and `src/services/manager-card-status-server.ts`.
The backend from PR #381 (five migrations, `20261008123000`–`20261008123400`) is applied on
production, switched off, with no rules row and no cards. Those five files are frozen. This plan
lists everything the server must add or change, **as new forward migrations**, so that every call
the merged front end makes returns exactly what its zod schemas accept, with the semantics of
`docs/product/MANAGER_CARD_SECTION_PLAN.md` (sections 3, 7 and 10).

**The rule used to decide.** The server adapts to the merged, reviewed front end. No front-end
change is needed (section 2.3 says why). The owner-approved decisions D1–D20 of
`docs/backend/MANAGER_CARD_DOMAIN_PLAN.md` are kept: formulas, scales, tiers, minimums, numbers,
founders and the calculation are not touched. Nothing here edits `app_private.manager_card_tick`,
`app_private.manager_card_evaluate_gameweek` or any table #381 created.

**Sources of requirements.** `docs/backend/MANAGER_CARD_BACKEND_PLAN.md` (the earlier front-end
plan) is used for requirements only: status semantics (its 7.2), moments and acknowledgements (its
3.11 and 6), club resolution (5.3), season label (N14), current season (N7), history paging (11.4),
latency budgets (N16), account deletion (9) and the health check (8.5). Its schema is not built.

---

## Contents

1. [The call-by-call gap table](#1-the-call-by-call-gap-table)
2. [Conflicts and which side changes](#2-conflicts-and-which-side-changes)
3. [The new migrations](#3-the-new-migrations)
4. [Account deletion and health](#4-account-deletion-and-health)
5. [pgTAP tests](#5-pgtap-tests)
6. [The contract test (real RPC JSON parsed by contracts.ts)](#6-the-contract-test)
7. [Guarded production apply script, runbook and AGENTS.md](#7-guarded-production-apply-script-runbook-and-agentsmd)
8. [Work packages](#8-work-packages)
9. [Questions for the owner](#9-questions-for-the-owner)

---

## 1. The call-by-call gap table

How the client calls (all through `supabase.schema("api").rpc(...)`,
`src/integrations/supabase/v2-client.ts:57-59`; PostgREST resolves a function by its name **and
its argument names**, so a wrong argument name answers `PGRST202`, which the client reads as
"not deployed" = switched off, silently: `src/backend/manager-card/errors.ts:221-223`).

How the client maps errors (`errors.ts:212-240`): `PGRST202` → `unavailable` (section hides);
`PT401`/`401`/`42501` → `unauthenticated`; `PT404` → `not_found`; `PT400`/`22023` →
`invalid_request`; the step-up's `mfa_required` → `mfa_required`; **anything else, `PT403
manager_card_off` included → `data_unavailable` (the error panel)**. A read answering
`{available: false}` flips the cached status off (`supabase-repository.ts:74-87`,
`src/services/use-manager-card.ts` `markManagerCardOff`).

| #   | Front end calls (file:line)                                                                                                                                                                                                               | Args as sent                                                                                        | Must answer (contracts.ts)                                                                                                                                                    | Off / not signed in / forming                                                                                                                                                                                                                                          | #381 provides (file:line)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Verdict                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 1   | `status()` → `rpc("manager_card_status")`, `supabase-repository.ts:97-104`; read on the **server only**, anonymously (`src/services/manager-card.ts:53-65`, `src/services/manager-card-status-server.ts:68-76`), 800 ms budget, memo 60 s | none                                                                                                | `managerCardStatusSchema` `{enabled: boolean, minRated: int>0 \| null, minConfirmed: int>0 \| null}` (`contracts.ts:38-42`)                                                   | Off: `{enabled:false, minRated:null, minConfirmed:null}`. Callable by **anon** (the server has no session). Never raises.                                                                                                                                              | **Nothing.** No `api.manager_card_status` exists. Today the call answers `PGRST202` → `OFF_STATUS` (`supabase-repository.ts:101`), so the section can never go live.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | **missing**                                                                                             |
| 2   | `myCard()` → `rpc("get_my_manager_card")`, `supabase-repository.ts:106-108`                                                                                                                                                               | none                                                                                                | `myCardResponseSchema` = `{available:false}` or `{available:true, card: myCard \| null}`; `myCard` has 30 keys (`contracts.ts:137-175`, `219-223`)                            | Off (read switch off **or** no usable rules row): HTTP 200 `{available:false}`. No team this season: `{available:true, card:null}`. Forming: a full card with `ratingState:"forming"`. Not signed in: never called (hook gate, `use-manager-card.ts` `useCardAccess`). | `api.get_my_manager_card()`, `20261008123300_manager_card_api.sql:170-193`: raises `PT403 manager_card_off` when off (184-186); returns the **bare card or SQL null**, no `available` wrapper (187); 13 keys from `app_private.manager_card_json` (112-163): `fantasyTeamId` not `teamId`, `founderCohort` not `founder{}`, `stats` as plain numbers not `{value, nullReason}`, `rulesVersion` integer not string, `club` without `slug`/`name`/`city`; no `ratingState`, `ovrNullReason`, `bestTier`, `nextTier`, `minRated`, `minConfirmed`, `throughGameweekSeq`, `calculatedAt`, `firstCountedGameweekSeq`, `firstRatedGameweekSeq`, `ratingGameweeks`, `ratingGameweeksComplete`, `previousSeason`, `seasonClosed`, `seasons`, `createdAt`, `moments`. Picks the latest _qualifying_ season (D7 fallback, 93-108), not the current one. Grants authenticated, service_role (190-191). | **reshape** (same signature: `create or replace`)                                                       |
| 3   | `cards(teamIds)` → `rpc("get_manager_cards", {p_team_ids})`, chunks of 100, `supabase-repository.ts:110-126`                                                                                                                              | `p_team_ids uuid[]` (≤ 100, deduplicated, never empty, never null elements)                         | `cardsResponseSchema` = `{available:false}` or `{available:true, cards: memberCard[]}`; `memberCard` 14 keys (`contracts.ts:177-200`, `224-227`)                              | Off: `{available:false}`. A member with a team and no card row yet: a **forming** member card (section plan 10.9). Deleted-pending or unknown team: omitted.                                                                                                           | `api.get_manager_cards(p_fantasy_team_ids uuid[])`, `…123300…sql:234-280`: **argument name differs** (`p_fantasy_team_ids`), so the client's call answers `PGRST202` today; raises `manager_card_off` (249-251); returns a bare array; omits teams without a season row (272); card shape as row 2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | **reshape** (argument renamed: `drop` + `create`)                                                       |
| 4   | `myHistory({seasonId, beforeSeq, limit})` → `rpc("get_my_manager_card_history", {p_season_id, p_before_seq, p_limit})`, `supabase-repository.ts:128-143`; page size 20 (`use-manager-card.ts:41`)                                         | `p_season_id uuid \| null`, `p_before_seq int \| null`, `p_limit int` (nulls are sent, not omitted) | `historyResponseSchema` = `{available:false}` or `{available:true, items: historyRow[], nextBeforeSeq: int \| null}`; `historyRow` 9 keys (`contracts.ts:202-217`, `228-235`) | Off: `{available:false}`. Season never played or deleted-pending: `items: []`, `nextBeforeSeq: null`.                                                                                                                                                                  | `api.get_my_manager_card_history(p_after_gameweek_sequence integer, p_limit integer)`, `…123300…sql:285-365`: **different signature** (no season argument, different names) → `PGRST202` today; raises `manager_card_off` (306-308); keys `items`/`nextAfter`; items lack `seasonId`, `seasonLabel`, `gameweeksCounted`, `calculatedAt`, and name the sequence `gameweekSequence`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | **reshape** (signature changes: `drop` + `create`)                                                      |
| 5   | `ackMoments(keys)` → `rpc("ack_manager_card_moments", {p_keys})`, ≤ 16 keys, `supabase-repository.ts:145-156`; errors swallowed by `acknowledgeMoments` (`use-manager-card.ts:100-121`)                                                   | `p_keys text[]` (1–16, deduplicated)                                                                | `ackResponseSchema` `{acknowledged: string[], ignored: string[]}` (`contracts.ts:236-239`)                                                                                    | Off: HTTP 200, everything in `ignored`, nothing written. Unknown-but-well-formed key: `ignored`. Malformed: `PT400`.                                                                                                                                                   | **Nothing**: no function, no table to record acknowledgements.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | **missing**                                                                                             |
| —   | (not called)                                                                                                                                                                                                                              | —                                                                                                   | —                                                                                                                                                                             | —                                                                                                                                                                                                                                                                      | `api.get_manager_card(p_fantasy_team_id uuid)`, `…123300…sql:198-229`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | **drop** (unused; its `manager_card_off` error and #381 shape would be a second, inconsistent contract) |

Shapes the five responses share, also missing in #381:

| Piece         | contracts.ts                                                                                                                                 | #381                                                                                                                       | Verdict                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Club          | `cardClubSchema`: `id, slug, code, name{fr,ar}, shortName{fr,ar}, city{fr,ar}\|null, primaryColor, secondaryColor` (`44-53`)                 | `id, code, shortName{fr,ar}, primaryColor, secondaryColor` from `favorite_team_id` only (`…123300…sql:136-145`, `153-158`) | reshape: add `slug`, `name`, `city` (null), resolve `favorite_team_provisional_ref` too |
| Stat          | `{value: 1-99 \| null, nullReason: STAT_NULL_REASONS \| null}` (`54-63`)                                                                     | plain number (`…123300…sql:127-132`); no reason stored anywhere                                                            | reshape: reasons derived at read time (3.2, H7)                                         |
| Moments       | 7-kind discriminated union with fixed keys (`65-125`)                                                                                        | nothing                                                                                                                    | missing: derived at read time + `app.manager_card_moment_acks`                          |
| Seasons       | `seasonSummarySchema` (`127-135`)                                                                                                            | nothing                                                                                                                    | missing: derived from `app.manager_card_seasons`                                        |
| Season label  | `"2026/27"` in every fixture (`fixtures.ts:91`); `nextSeasonLabel` needs `^\d{4}/\d{2}$` (`src/components/gradins/gradins-state.ts:199-205`) | raw `app.seasons.label` (`…123300…sql:124`), `2026/2027` on production                                                     | reshape: shorten `NNNN/NNNN` to `NNNN/NN`                                               |
| Rules version | `rulesVersion: string \| null`, looked up in `FORMULA_KEYS` (empty) (`src/components/manager-card/copy.ts:414`)                              | integer                                                                                                                    | reshape: `'v' \|\| rules_version` (`"v1"`, as the fixtures)                             |

Checked and already compatible: serial format `^[1-9][0-9]{5}$` (`contracts.ts:142-145`;
`20261008123000_manager_card_schema.sql:150`); colours `^#[0-9a-fA-F]{6}$` (`app.teams` checks);
Postgres `jsonb` timestamps (`2026-10-09T07:34:05.437668+00:00`) pass `z.string().datetime({offset:
true})` and v4 uuids pass zod 4's `uuid()` (both measured with zod 4.4.3 in this worktree; the
all-zero uuid does **not** pass, so test fixtures must use v4-shaped ids, as both pgTAP files do).

---

## 2. Conflicts and which side changes

### 2.1 Server adapts (all of these)

| Conflict                                                                                                                 | #381                                                                                      | Front end needs                                                                                                                                                                | Decision                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Off" is an error                                                                                                        | `PT403 manager_card_off` in every read (`…123300…sql:184-186, 213-215, 249-251, 306-308`) | HTTP 200 `{available:false}` (`contracts.ts:11-14`; section plan 10.2). `PT403` maps to `data_unavailable`, the error panel (`errors.ts:236-240`), not to "hide the section".  | Server: every read answers `{available:false}` while not ready. "Ready" = `read_enabled` **and** one active rules row whose numbers are usable (H2). The switch is checked **first**, before the step-up and before reading the caller.                                                      |
| No status read                                                                                                           | —                                                                                         | `api.manager_card_status()` for anon (section plan 3.2, 10.10)                                                                                                                 | Server: new function, `language sql stable security definer`, granted to `anon, authenticated, service_role`, never raises, no `auth.uid()` (so no step-up and no change to the step-up count).                                                                                              |
| Batch argument name                                                                                                      | `p_fantasy_team_ids`                                                                      | `p_team_ids`                                                                                                                                                                   | Server: drop and recreate as `api.get_manager_cards(p_team_ids uuid[])`.                                                                                                                                                                                                                     |
| History signature                                                                                                        | `(integer, integer)`, keyset `nextAfter`                                                  | `(p_season_id uuid, p_before_seq integer, p_limit integer)`, `nextBeforeSeq`                                                                                                   | Server: drop `(integer, integer)`, create `(uuid, integer, integer)` with defaults `null, null, 20`.                                                                                                                                                                                         |
| One-card read                                                                                                            | `get_manager_card(uuid)` exists                                                           | not used                                                                                                                                                                       | Server: drop it (no caller anywhere in `src/`; keeping it keeps a second, off-contract API).                                                                                                                                                                                                 |
| Response wrappers and field names                                                                                        | bare card / bare array / `null`                                                           | `{available, card}`, `{available, cards}`, `{available, items, nextBeforeSeq}`; `teamId`; `founder{}`; `stats.*.{value,nullReason}`; string `rulesVersion`                     | Server: new JSON builders (H9, H10), old builder `app_private.manager_card_json` dropped.                                                                                                                                                                                                    |
| Which season "my card" shows                                                                                             | latest **qualifying** season (D7 applied on the server, `…123300…sql:91-108`)             | the **current** season with `ratingState:"forming"` and `previousSeason` filled; the client shows last season's figures and label (`section plan 7.3`, `gradins-state.ts:119`) | Server: my card is the current Fantasy season (N7, H3), `previousSeason` carries last season. **D7's meaning is unchanged**: what the manager sees is still "last season's card with its label until this season reaches the minimum"; only where the fallback is drawn moved to the client. |
| Acknowledgements                                                                                                         | none                                                                                      | `ack_manager_card_moments` + server record (old plan D21, approved 2026-10-08)                                                                                                 | Server: `app.manager_card_moment_acks` + the RPC.                                                                                                                                                                                                                                            |
| Moments, seasons, club name/slug/city, null reasons, rating state, best/next tier, first counted/rated, rating gameweeks | none                                                                                      | `contracts.ts:65-175`                                                                                                                                                          | Server: derived at read time from #381's tables (no new column on any #381 table, no change to the tick).                                                                                                                                                                                    |
| Batch omits teams without a card                                                                                         | omitted (`…123300…sql:272`)                                                               | forming member card (section plan 10.9; `src/components/gradins/people.ts:84-92`)                                                                                              | Server: a team with no season row returns a forming member card (serial and founder from the card row if any).                                                                                                                                                                               |

### 2.2 Tensions with the owner-approved plan, listed for the owner (none changes a D-decision)

1. **Domain plan section 5** (approved document, not a numbered decision) says the reads "refuse
   with `PT403 manager_card_off`". The merged front end needs `{available:false}`. The server
   adapts; the switch means the same thing. No owner action needed beyond noting it.
2. **D7** is preserved in what the manager sees (row "Which season" above). The server now names
   the current season and adds `previousSeason`; the client draws the fallback.
3. **D19** (any signed-in reader may read a card by Fantasy team id) is kept as approved. The old
   front-end plan's N6 (league-mates only) is **not** built. The merged front end only ever asks
   for league members and the caller (`src/components/gradins/use-gradins-people.ts:62-65`,
   `src/components/manager-card/inline/LeagueRowMini.tsx:24-25`), so either rule works with it.
4. **Season close**: #381 has no notion of a closed season. The front end has `seasonClosed`,
   `closedAt`, and the `season_closed` / `season_started` moments. Nothing in the app marks a
   Fantasy season `completed` today (no migration sets that status; checked with grep). Plan: a
   season counts as closed when `app.fantasy_seasons.status = 'completed'`, `closedAt =
fantasy_seasons.ends_at`. Until something marks a season completed these stay false/empty,
   which is harmless before May 2027. Question 1 in section 9.
5. **Founder cut-off date**: `founder.cutoffDate` is nullable in the contract; #381's grant does
   not store the cut-off (`20261008123200_manager_card_compute.sql:902-965`). Plan: `null`; the
   front end already hides the line when null (`src/components/gradins/FounderBlock.tsx:66`).
   Question 2.
6. **Club city**: `app.team_translations` has no city and `app.teams.city` is Latin only. Plan:
   `city: null` (allowed by `contracts.ts:50`). Question 3.

### 2.3 Front-end changes

**None required.** Every contract field can be produced from #381's tables at read time. The
`UntypedApi` cast in `supabase-repository.ts:29-38` can be removed once the generated types
include the new functions, but that is optional tidying in a front-end lane, not part of this plan.

---

## 3. The new migrations

### 3.0 Slots

Checked on 2026-10-10 after `git fetch origin`, across all 367 remote branches (every open PR
head included): the highest migration anywhere else was `20261009211234` (story presentation
repair, PR #390). Re-checked later the same day, after main gained the compact story labels (PR
#393) and was merged into this branch, across all 371 remote refs: the highest migration anywhere
else is now `20261010055425` (compact story labels, PR #393, on `main`). The slots below still sort
after it. Slots chosen (unique, 100 seconds apart):

| Slot             | File                                                               | Package |
| ---------------- | ------------------------------------------------------------------ | ------- |
| `20261010120000` | `supabase/migrations/20261010120000_manager_card_moment_acks.sql`  | P1      |
| `20261010120100` | `supabase/migrations/20261010120100_manager_card_read_helpers.sql` | P1      |
| `20261010120200` | `supabase/migrations/20261010120200_manager_card_api_v2.sql`       | P1      |
| `20261010120300` | `supabase/migrations/20261010120300_manager_card_health.sql`       | P3      |

Re-run the collision command from the brief immediately before the first push and again before
merge; if another lane takes one of these four, move ours (they are unapplied everywhere).

**Moved twice, on 2026-10-09 and on 2026-10-10.** The four were first written at
`20261009100000` to `20261009100300`, before Home stories (PR #386) reached main. It added
`20261009094920` and `20261009113132`, and the second sorted after those slots, so repository order
would no longer have matched apply order (the guarded script could not have said which migration
goes first). Nothing had been applied anywhere but a local stack, so the four moved in place to
`20261009120000` to `20261009120300`. Main then gained the AI home stories (`20261009195943`, PR
#389) and the story presentation repair (`20261009211234`, PR #390), which sort after those slots
too, so on 2026-10-10 the four moved a second time, in place, keeping their names, their order
and the 100-second gaps, to the slots in the table above (`20261010120000` to `20261010120300`).
Both times nothing was applied anywhere but a local stack (checked: neither main nor any remote
branch but this one holds a version of the four), and the newest migration anywhere else was then
`20261009211234`. Main later gained the compact story labels (`20261010055425`, PR #393), which
sorts before `20261010120000` as well, so the four did **not** move a third time: only the script's
newest-migration guard moved, to `20261010055425`. On 2026-10-10 the owner read production (173
rows, newest `20261010073509`, the removal of public AI notices, PR #396, which has no apply
script): that migration also sorts before `20261010120000`, so the four still did not move, and the
guard moved again, to `20261010073509`, the one it now requires first.

Common rules for every function below: `set search_path = ''`; every name schema-qualified;
`revoke all on function … from public, anon, authenticated, service_role;` then only the grants
named. Helpers live in `app_private`, are **not** `security definer` (they run inside the
`security definer` api functions, owned by `postgres`, as #381's helpers do,
`…123300…sql:65-165`), are named `manager_card_*` (the existing test counts and checks that
prefix, `supabase/tests/database/manager_card.test.sql:582-599`) and get no grant at all. Each gets
a `comment on function`. Nothing ships switched on; no rules row is inserted.

### 3.1 `20261010120000_manager_card_moment_acks.sql` — one table

Header comment: what it is (D21: the moments a manager has seen, recorded on the server, written
only by `api.ack_manager_card_moments`), display only, deletion by cascade from the profile.

```sql
create table app.manager_card_moment_acks (
  user_id uuid not null references app.profiles(id) on delete cascade,
  moment_key text not null,
  acknowledged_at timestamptz not null default statement_timestamp(),
  constraint manager_card_moment_acks_pkey primary key (user_id, moment_key),
  constraint manager_card_moment_acks_key_check check (
    char_length(moment_key) <= 80 and moment_key ~ (
      '^(card_created|founder_granted|tier_changed:(stade|pro|champion|legend)|'
      || '(first_rating|provisional_cleared|season_closed|season_started):'
      || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'))
);
alter table app.manager_card_moment_acks enable row level security;
alter table app.manager_card_moment_acks force row level security;
revoke all on app.manager_card_moment_acks from public, anon, authenticated, service_role;
create trigger manager_card_moment_acks_refuse_unverified_mfa_actor
before insert or update or delete on app.manager_card_moment_acks
for each statement execute function app_private.refuse_unverified_mfa_actor();
comment on table app.manager_card_moment_acks is '…';
```

- The uuid in a key is a `fantasy_season_id`. `homa` is never a key (a card starts there). The
  regex is the same set `contracts.ts:65-125` accepts, narrowed as its comment at `93-95` says.
- No foreign key to `app.manager_cards` (`card_created` can be acknowledged on a forming card that
  has no card row yet) and none to seasons (a key whose season disappears simply stops matching).
- The primary key's leading column is the foreign key column, so no extra index.
- The statement trigger: every table an ordinary api function writes for the caller carries it
  (rule of `20260926003100`; the list is asserted in
  `supabase/tests/database/ordinary_account_mfa_step_up.test.sql:137-160`). Count 26 → 27.
- No policy (row security forced, no grants): only the definer function reads and writes it.
- Never pruned: it is what stops a moment repeating.

### 3.2 `20261010120100_manager_card_read_helpers.sql` — ten helpers

No api function here; the file depends on 3.1 (H8 reads the acknowledgements) and on #381's tables.
#381's `app_private.manager_card_minimum()` and `app_private.manager_card_qualifies(integer,
smallint)` (`…123300…sql:65-89`) stay and are reused.

Tier order everywhere: `homa < stade < pro < champion < legend`.
"Qualifies" below means `gameweeks_counted >= min_rated` (with a usable rules row, which every read
requires, #381's `manager_card_qualifies(counted, ovr)` reduces to exactly that).
"Rated row" means a history row (`app.manager_card_gameweeks`) that qualifies and has `ovr is not
null`. "The order" of a manager's history rows is `fantasy_seasons.starts_at, fantasy_seasons.id,
fantasy_gameweeks.sequence_number`.

**H1. `app_private.manager_card_active_rules()`**
`returns table (version integer, min_rated integer, min_confirmed integer, tiers jsonb, cap_ignore timestamptz, usable boolean)`,
`language plpgsql stable`. Reads the one `active` row of `app_private.manager_card_rules`; no row:
returns no row. Never raises:

- `min_rated` = `config->>'minimum_gameweeks'` when it matches `^[0-9]{1,6}$`, else null;
- `min_confirmed` = `config->>'provisional_below'`, same guard;
- `tiers` = `config->'tiers'`;
- `cap_ignore` = `(config->>'cap_ignore_deadlines_before')::timestamptz` when that is a JSON
  string, inside `begin … exception when others then null; end` (rules v1's script already
  validates it, `scripts/backend/apply-manager-card-rules-v1-fixed-scales.sql:197-205`);
- `usable` = `min_rated >= 1 and min_confirmed >= min_rated` and each of `stade, pro, champion,
legend` in `tiers` is a JSON number between 1 and 99 and they strictly rise in that order.
  (A rules row that is not usable makes the section read as off rather than answer a DTO the
  zod schemas refuse: `minRated` must be a positive integer, `nextTier.fromOvr` 1–99.)

**H2. `app_private.manager_card_read_ready()`** `returns boolean`, `language sql stable`:
`coalesce((select read_enabled from app_private.manager_card_settings where id), false) and
coalesce((select usable from app_private.manager_card_active_rules()), false)`.

**H3. `app_private.manager_card_fantasy_season()`** `returns uuid`, `language sql stable` (N7):
the `app.fantasy_seasons` row with status in `('registration_open','active')`, latest
`starts_at`, then `id`; when none, the latest `'completed'` one by `starts_at desc, id desc`;
else null. (Same first rule as `app_private.fantasy_prize_current_season()`.)

**H4. `app_private.manager_card_season_label(p_fantasy_season_id uuid)`** `returns text`,
`language sql stable` (N14): `app.seasons.label` through `fantasy_seasons.football_season_id`;
when it matches `^[0-9]{4}/[0-9]{4}$` return `left(label, 5) || right(label, 2)`
(`2026/2027` → `2026/27`), else the label as it is. Null for an unknown season.

**H5. `app_private.manager_card_tier_rank(p_tier text)`** `returns integer`, `language sql
immutable`: `homa` 1, `stade` 2, `pro` 3, `champion` 4, `legend` 5, anything else null.

**H6. `app_private.manager_card_club(p_user_id uuid)`** `returns jsonb`, `language sql stable`
(old plan 5.3, N4). The club is `app.user_preferences.favorite_team_id`; else
`favorite_team_provisional_ref` matched to `app.teams.id::text`, else to `app.teams.slug`
(id match first; `limit 1`); else none → SQL null. Inactive clubs still resolve. The card never
writes `user_preferences`. JSON, exactly these 8 keys:
`id` team id; `slug`; `code` = `nullif(btrim(code), '')`;
`name` = `{fr: coalesce(fr.name, team.name), ar: coalesce(ar.name, team.name)}`;
`shortName` = `{fr: coalesce(fr.short_name, team.short_name), ar: coalesce(ar.short_name, team.short_name)}`
(the #381 rule, `…123300…sql:139-142`); `city` = JSON `null` (2.2 item 6);
`primaryColor`, `secondaryColor` as stored (null when none).
(`fr`/`ar` = `app.team_translations` rows with `language = 'fr'` / `'ar'`.)

**H7. `app_private.manager_card_stat_reasons(p_user_id uuid, p_fantasy_season_id uuid, p_fantasy_team_id uuid, p_cap_ignore timestamptz)`**
`returns jsonb`, `language sql stable`. Called only when the season qualifies; for each stat the
reason it is null **if** it is null (the caller uses it only for null stats). Returns
`{cap, sel, trf, con}`:

- `trf`: no `app.fantasy_transfer_batches` row with `status = 'confirmed'` for the team →
  `no_transfers`; confirmed batches exist but every one is `chip_type = 'free_hit'` →
  `excluded_weeks_only`; otherwise `window_open` (a countable batch whose 3-week window has not
  finished: exactly #381's readiness rule, `…123200…sql:548-588`). Read live (index
  `fantasy_transfer_batches_history_idx` on `fantasy_team_id`), so the reason changes as soon as a
  transfer is confirmed.
- `cap`: `pre_captain_fix` when `p_cap_ignore` is not null and the manager has a history row in
  that season whose gameweek `deadline_at < p_cap_ignore`; else `excluded_weeks_only` (every
  counted week skipped: no captain, best starter ≤ 0, or a captain mismatch; #381 lines 439-445).
- `sel`: `excluded_weeks_only` (every week Bench Boost or optimum ≤ 0).
- `con`: `excluded_weeks_only` (cannot happen while a week is counted; kept for a closed answer).
- `board_not_final` is never emitted (CON reads final results, domain plan section 0 item 2).
- Under the minimum the caller does not use H7: every stat is `pending_minimum`.

**H8. `app_private.manager_card_moments(p_user_id uuid)`**
`returns table (moment_key text, occurred_at timestamptz, moment jsonb, pending boolean)`,
`language sql stable` (old plan 6.2, adapted to #381's tables). It returns every **derivable**
moment; `pending` = derivable **and** not in `app.manager_card_moment_acks` for the user **and**
inside its window. `moment` is the complete DTO of `contracts.ts:65-125` (`kind`, `key` and the
kind's fields, nothing else). Inputs: current season CS = H3; the user's team T in CS (may be
none); card row C (may be none); rules from H1; the user's rated rows in the order above.

| Kind / key                                                            | Derivable when                                                                                                                                                                                         | Fields                                                                                                                                                                  | Window (for `pending`)                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `card_created` / `card_created`                                       | C exists, or T exists (forming, no card row)                                                                                                                                                           | `occurredAt` = `C.created_at` or JSON null; `seasonLabel` = H4(CS)                                                                                                      | always                                                                    |
| `first_rating` / `first_rating:<fs>`                                  | season fs has a rated row; the first one in the order                                                                                                                                                  | `occurredAt` = that row's `calculated_at`; `gameweekSeq`, `ovr`, `tier`, `provisional`, `gameweeksCounted` of that row; `firstEver` = no rated row in an earlier season | fs = CS                                                                   |
| `provisional_cleared` / `provisional_cleared:<fs>`                    | season fs has a rated row with `provisional = false`; the first one                                                                                                                                    | `occurredAt`, `gameweekSeq`, `ovr`, `gameweeksCounted` of that row                                                                                                      | fs = CS                                                                   |
| `tier_changed` / `tier_changed:<X>`, X ∈ stade, pro, champion, legend | E = the first rated row (whole account, all seasons) with tier X; P = the rated row just before E in the order; P exists and rank(P.tier) < rank(X) (so a first-ever rating and a fall never make one) | `occurredAt` = E.`calculated_at`; `tier` X; `previousTier` P.tier; `ovr`, `gameweekSeq` of E; `seasonLabel` = H4(E's season)                                            | the card's current tier (my card, CS, qualifying) ranks ≥ X               |
| `founder_granted` / `founder_granted`                                 | `C.founder_cohort` not null                                                                                                                                                                            | `occurredAt` = `C.founder_granted_at`; `cohort`; `cutoffDate` JSON null                                                                                                 | always                                                                    |
| `season_closed` / `season_closed:<fs>`                                | the user has a season row in fs and fs `status = 'completed'`                                                                                                                                          | `occurredAt` = fs.`ends_at`; `seasonLabel`; `ovr`, `tier` of that season row, null unless it qualifies                                                                  | fs is the user's most recent (by `starts_at`) completed season with a row |
| `season_started` / `season_started:<CS>`                              | T exists in CS, and the user has a season row in a completed season that starts before CS                                                                                                              | `occurredAt` = T.`created_at`; `seasonLabel` = H4(CS); `previous` = `{label, ovr, tier}` of the most recent such season (qualifying-gated)                              | the current card's `ovr` is null                                          |

Ordered by `occurred_at` (nulls first), then `moment_key`. A rules change or a correction recomputes
the same keys, so an acknowledged moment never comes back.

**H9. `app_private.manager_card_my_card(p_user_id uuid)`** `returns jsonb`, `language plpgsql
stable`. Returns SQL null when: no profile, `profiles.deleted_at` set, CS (H3) null, or the user has
no `app.fantasy_teams` row in CS. Otherwise exactly these 30 keys (`contracts.ts:137-175`), with
R = `app.manager_card_seasons (user, CS)` (may be none), C = card row (may be none), rules = H1:

| Key                        | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `teamId`                   | T.id                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `name`                     | `coalesce(nullif(btrim(profile.display_name), ''), T.name)` (D17, the #381 rule)                                                                                                                                                                                                                                                                                                                                                                                                 |
| `handle`                   | `profiles.username` or null                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `season`                   | `{id: CS, label: H4(CS)}`                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `serial`                   | C.serial or null                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `founder`                  | C.founder_cohort not null → `{cohort, grantedAt: C.founder_granted_at, cutoffDate: null}`; else null                                                                                                                                                                                                                                                                                                                                                                             |
| `club`                     | H6(user)                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `ratingState`              | no R or `R.gameweeks_counted < min_rated` → `forming`; R.ovr null → `insufficient`; R.provisional → `provisional`; else `rated`                                                                                                                                                                                                                                                                                                                                                  |
| `ovr`                      | R.ovr when R qualifies, else null                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `ovrNullReason`            | forming → `pending_minimum`; insufficient → `too_few_stats`; else null                                                                                                                                                                                                                                                                                                                                                                                                           |
| `tier`                     | R.tier when `ovr` not null, else null (never `homa` before a rating)                                                                                                                                                                                                                                                                                                                                                                                                             |
| `bestTier`                 | highest-rank tier among the season's rated rows (CS), else null (N13: this season)                                                                                                                                                                                                                                                                                                                                                                                               |
| `nextTier`                 | null when `ovr` null or tier `legend`; else `{code: next tier, fromOvr: ceil(tiers->>next)::int}`                                                                                                                                                                                                                                                                                                                                                                                |
| `provisional`              | `ovr is not null and R.provisional`                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `stats`                    | `{cap, sel, trf, con}`, each `{value, nullReason}`: forming → `{null, "pending_minimum"}`; else `value` = R.<stat> and `nullReason` = null when value not null, else H7's reason                                                                                                                                                                                                                                                                                                 |
| `gameweeksCounted`         | R.gameweeks_counted, else 0                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `minRated`, `minConfirmed` | H1                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `rulesVersion`             | `'v' \|\| R.rules_version`, else null                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `throughGameweekSeq`       | `sequence_number` of R.through_gameweek_id, else null                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `calculatedAt`             | R.calculated_at, else null                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `firstCountedGameweekSeq`  | min `sequence_number` of the user's history rows in CS, else null                                                                                                                                                                                                                                                                                                                                                                                                                |
| `firstRatedGameweekSeq`    | min `sequence_number` of the user's rated rows in CS, else null                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ratingGameweeks`          | only while `forming` and CS not completed, else null. `counted` = sequences of the user's history rows in CS, ascending. `start` = `max(counted) + 1`, else the team's first `app.fantasy_lineups` gameweek sequence, else the first CS gameweek whose status is in `scheduled, open, locked, live, provisional, finalizing`. Then append non-cancelled CS gameweek sequences `>= start` in order until there are `min_rated` entries (only gameweeks that exist). Empty → null. |
| `ratingGameweeksComplete`  | `ratingGameweeks` not null and has `min_rated` entries                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `previousSeason`           | the user's season row in the latest Fantasy season with `starts_at <` CS's: `{label: H4, ovr, tier}` (qualifying-gated); else null                                                                                                                                                                                                                                                                                                                                               |
| `seasonClosed`             | CS `status = 'completed'`                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `seasons`                  | every season row of the user plus CS when it has none, newest `starts_at` first: `{seasonId, label: H4, ovr (gated), tier (gated), bestTier (that season's rated rows), gameweeksCounted (0 when none), closedAt: ends_at when completed else null}`                                                                                                                                                                                                                             |
| `createdAt`                | C.created_at, else null                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `moments`                  | `jsonb_agg(moment order by occurred_at nulls first, moment_key)` of H8 where `pending`, else `[]`                                                                                                                                                                                                                                                                                                                                                                                |

**H10. `app_private.manager_card_member_card(p_fantasy_team_ids uuid[])`** `returns table (team_id uuid, card jsonb)`,
`language sql stable`, set-based (one row per known team in the list, so a batch of 100 is one statement; a function
called per team measured 200 ms for 100). T = the team (any season, as #381: answered for the team's own season, no
D7 fallback, `…123300…sql:36-39`); U = T.user_id; no row when the team is unknown or the profile
has `deleted_at`. R = `manager_card_seasons (U, T.fantasy_season_id)`; C = card row. Exactly these
14 keys (`contracts.ts:177-200`): `teamId`, `name` (H9 rule), `club` H6(U), `serial`,
`founderCohort` (C or null), `seasonLabel` H4, `ratingState` (H9 rule), `ovr`, `tier`,
`provisional` (H9 rules), `stats` `{cap, sel, trf, con}` values only (null unless qualifying),
`gameweeksCounted` (0 without R), `minRated`, `firstRatedGameweekSeq`. A team with no R is a
forming member card. No `handle`, no moments, no user id, no e-mail.

Grants for all ten: `revoke all … from public, anon, authenticated, service_role;` nothing else.

### 3.3 `20261010120200_manager_card_api_v2.sql` — the five api functions

Header comment: replaces #381's read API with the merged front end's contract (this plan, section
2); drops what that contract does not use; off is an answer.

Order in the file:

1. `drop function api.get_manager_card(uuid);`
2. `drop function api.get_manager_cards(uuid[]);`
3. `drop function api.get_my_manager_card_history(integer, integer);`
4. the five functions below;
5. `drop function app_private.manager_card_json(uuid, uuid);` and
   `drop function app_private.manager_card_current_season(uuid);` (only the dropped/replaced api
   functions reference them; checked on the local stack with a `prosrc` search);
6. revokes, grants, comments;
7. `notify pgrst, 'reload schema';` (the `pgrst_ddl_watch` event trigger also reloads; this is
   belt and braces).

Common to the four signed-in functions, in this order: (a) argument shape check where the
function has one (`PT400 validation_failed`, the #381 message); (b) `if not
app_private.manager_card_read_ready() then return <off answer>; end if;`; (c) `perform
app_private.assert_mfa_step_up();`; (d) `actor := (select auth.uid())`, null →
`raise exception using errcode = 'PT401', message = 'authentication_required'`. All `security
definer`, `set search_path = ''`, `revoke all … from public, anon, authenticated, service_role;
grant execute … to authenticated, service_role;`. (Service role with no user still gets `PT401`,
as #381.)

| Function                                                                                                                                          | Body                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`api.manager_card_status()`** `returns jsonb`, `language sql stable security definer`                                                           | `jsonb_build_object('enabled', ready, 'minRated', case when ready then min_rated end, 'minConfirmed', case when ready then min_confirmed end)` with `ready = H2`, numbers from H1. No `auth.uid()`, no step-up, never raises. **Grants: `anon, authenticated, service_role`.** Budget ≤ 5 ms (two one-row reads).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **`api.get_my_manager_card()`** `create or replace` (same signature, grants kept; restate them anyway), `stable`                                  | off → `{"available": false}`; else `jsonb_build_object('available', true, 'card', app_private.manager_card_my_card(actor))` (SQL null becomes JSON `null`: no team this season, or deleted-pending). Budget: database time ≤ 40 ms.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **`api.get_manager_cards(p_team_ids uuid[])`** new, `stable`                                                                                      | (a) `p_team_ids` null, or more than 100 **distinct non-null** ids → `PT400 validation_failed` (null elements are ignored and duplicates collapse, as #381); off → `{"available": false}`; empty → `{"available": true, "cards": []}`; else `cards` = H10 of each distinct id in order of first occurrence, nulls left out. Budget: ≤ 80 ms for 100 ids.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **`api.get_my_manager_card_history(p_season_id uuid default null, p_before_seq integer default null, p_limit integer default 20)`** new, `stable` | (a) `p_limit` null or not in 1..50, or `p_before_seq < 1` → `PT400 validation_failed` (50 keeps #381's bound; the client sends 20); off → `{"available": false}`; deleted-pending → `{"available": true, "items": [], "nextBeforeSeq": null}`; season = `coalesce(p_season_id, H3)`; rows = the caller's `app.manager_card_gameweeks` in that season with `sequence_number < p_before_seq` (all when null), newest first, `p_limit + 1` fetched; `items` = the first `p_limit`, each exactly `{seasonId, seasonLabel: H4, gameweekSeq, ovr, tier, provisional, gameweeksCounted, stats{cap,sel,trf,con}, calculatedAt}` with figures null unless the row qualifies and `provisional = (ovr is not null and row.provisional)`; `nextBeforeSeq` = last item's sequence when a row beyond `p_limit` exists, else null. Budget ≤ 20 ms. |
| **`api.ack_manager_card_moments(p_keys text[])`** new, **`volatile`**                                                                             | (a) `p_keys` null, empty, any element null, more than 16 distinct, or any key failing the 3.1 key check → `PT400 validation_failed`; off → `{"acknowledged": [], "ignored": <distinct keys in request order>}`, nothing written; step-up; actor; deleted-pending → all ignored, nothing written; insert into `app.manager_card_moment_acks (user_id, moment_key)` the keys that are **derivable now** (`moment_key` in H8 for the actor, pending or not, so a benign race never fails) `on conflict do nothing`; answer `acknowledged` = request keys now on record for the actor (new or earlier), `ignored` = the rest, each in request order. HTTP 200 in every case but malformed input, no user and the step-up. Budget ≤ 30 ms.                                                                                               |

Comments (`comment on function`) state, for each: what it returns, that off is `{available:false}`
(or all-ignored for the ack), the grants, and "display only".

**Impact on production objects** (where #381 is applied):

- `api.get_my_manager_card()`: replaced in place; owner and grants unchanged.
- `api.get_manager_card(uuid)`, `api.get_manager_cards(uuid[])`,
  `api.get_my_manager_card_history(integer,integer)`: dropped with their grants. Nothing calls them
  (the merged client calls other names/arguments, and they answer `manager_card_off` anyway while
  reads are off). The new `get_manager_cards(uuid[])` has the same type signature but a new
  argument name, so it must be dropped first (`create or replace` cannot rename a parameter).
- `app_private.manager_card_json(uuid,uuid)`, `app_private.manager_card_current_season(uuid)`:
  dropped; no grants to lose.
- New: one table, ten helpers, `api.manager_card_status()` (granted to anon),
  `api.get_manager_cards(uuid[])`, `api.get_my_manager_card_history(uuid,integer,integer)`,
  `api.ack_manager_card_moments(text[])`.
- Switches, rules, the tick, the jobs, the erase lock, every #381 table: untouched. Compute may be
  on or off during the apply; **reads must be off** (the apply script refuses otherwise).

Counts the existing tests assert, after P1 and P3:

| Assertion                                                                                                                                                 | Before                       | After                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| api functions running `perform app_private.assert_mfa_step_up();` and executable by authenticated (`ordinary_account_mfa_step_up_reads.test.sql:407-413`) | 81 (incl. #381's four reads) | **81** (−`get_manager_card` +`ack_manager_card_moments`; `manager_card_status` has no step-up). Update the description text. |
| tables with the statement-level step-up trigger (`ordinary_account_mfa_step_up.test.sql:137-160`)                                                         | 26                           | **27**, add `'app.manager_card_moment_acks'` between `'app.followed_teams'` and `'app.match_votes'` (collate "C")            |
| `app_private` functions named `^manager_card` (`manager_card.test.sql:582-585`)                                                                           | 17                           | **25** after P1 (17 − 2 dropped + 10), **26** after P3 (+`manager_card_health`)                                              |
| api functions matching `manager_card` (`manager_card.test.sql:612-615`)                                                                                   | 4                            | **5**                                                                                                                        |
| card tables in `card_tables` (`manager_card.test.sql:540-548`, 24 refusals at 576-581)                                                                    | 8 / 24                       | **9 / 27** (add `app.manager_card_moment_acks`)                                                                              |

### 3.4 `20261010120300_manager_card_health.sql` — the `manager_card` health check

Pattern of `20261006143700_account_deletion_automatic.sql:916-1018`:

1. `alter function app_private.ops_health_checks() rename to ops_health_checks_before_manager_card;`
2. `create function app_private.manager_card_health() returns jsonb` (`language sql` or plpgsql,
   `stable`, `set search_path = ''`, not definer), returning
   `{"name": "manager_card", "status": ok|warn|fail, "detail": text}` with counts only, no user id:
   - S = settings row; R = H1 (usable or not); `stale` = evaluable gameweeks (the runbook's query,
     `docs/backend/MANAGER_CARD_OPERATIONS_RUNBOOK.md:319-330`: stable, postwork for the current
     `scoring_input_version` completed) with no `app_private.manager_card_evaluations` row for
     R.version and that version; `oldest` = the earliest postwork `completed_at` among them;
     `errors` = `app_private.manager_card_job_log` rows with `outcome = 'error'` started in the
     last 24 h.
   - **ok** "switched off" when compute and read are both off.
   - **warn** "reads on but no usable rules: the section answers off" when read on and not usable.
   - **warn** "compute on but no usable rules" when compute on and not usable.
   - **warn** "reads on, compute off: cards frozen" when read on and compute off.
   - **fail** when compute on, rules usable, and `oldest < now() - 12 hours`: "N finished
     gameweek(s) waiting for their cards for more than 12 hours".
   - **warn** same with 2 hours.
   - **warn** when `errors > 0`: "N tick error(s) in the last 24 hours".
   - else **ok** "cards current under rules vN".
3. `create function app_private.ops_health_checks() returns jsonb language plpgsql volatile
security definer set search_path = ''` that calls `ops_health_checks_before_manager_card()`,
   appends `app_private.manager_card_health()` **last**, and recomputes the overall status exactly
   as the account-deletion wrapper does (`…143700…sql:966-975`).
4. `revoke all on function app_private.ops_health_checks(), app_private.ops_health_checks_before_manager_card(), app_private.manager_card_health() from public, anon, authenticated, service_role;`
   `grant execute on function app_private.ops_health_checks(), app_private.ops_health_checks_before_manager_card() to postgres;`

`fail` pages the owner through `ops-alert-tick` like every other check. Do **not** add
`manager_card` to `REQUIRED_DATABASE_CHECKS` in `scripts/ops/watchdog.ts:40-50` until production
has it (old plan 8.5).

Test edits this forces (in P3):

- `supabase/tests/database/ops_health_fantasy_coverage_and_scoring.test.sql:34-40`: append
  `'manager_card'` after `'account_deletion'` and update the description.
- `supabase/tests/database/manager_card.test.sql:1548-1554` (guard "no function outside the card's
  own reads or writes a card table"): `ops_health_checks` now calls `manager_card_health()`;
  exclude it by name (`and p.proname <> 'ops_health_checks'`) with a comment saying why.

---

## 4. Account deletion and health

**Deletion: no new code, one new cascade.**

- `app.manager_card_moment_acks.user_id` references `app.profiles(id) on delete cascade`. The
  erasure (`app_private.account_deletion_erase(uuid,integer)`, as patched by
  `20261008123100_manager_card_erase_lock.sql`) ends with `delete from auth.users` (line 199 of its
  current definition on the local stack), and `app.profiles` cascades from `auth.users`
  (`profiles_id_fkey`, `on delete cascade`, checked locally). So acknowledgements go with the
  account, like #381's card rows. Nothing is kept: acknowledgements carry no number to retire.
- **No new lock.** The erasure already takes `botolago:manager-card`
  (`20261008123100…sql:25-36`). That lock guards the tick, which never writes acknowledgements.
  The ack RPC writes only the caller's own rows and ignores a deleted-pending caller (profiles get
  `deleted_at` when deletion is requested, so a pending erasure never races a live ack). The only
  race left (an ack insert in flight at the very moment the profile row is deleted) fails with a
  foreign-key error that the client swallows (`use-manager-card.ts:114-120`). Acceptable.
- Reads: H9 and H10 return nothing for a deleted-pending profile; the history answers empty; the
  ack ignores everything (same rule as #381).
- Docs: `docs/backend/ACCOUNT_DELETION_RUNBOOK.md:65-68` gains the acknowledgements table in its
  cascade list (P4).

**Health: add it (3.4), in its own migration.** #381 added none. Once compute is on, the one
silent failure that matters is "a finished gameweek never got its cards"; the 12-hour `fail`
pages the owner. If the owner prefers a smaller apply, 3.4 can be left out without affecting the
front end (question 4).

---

## 5. pgTAP tests

Run locally (the stack in this worktree is already up on port 55322):

```bash
cd /home/user/mc-backend
bun run backend:migrations:check
bun run backend:db:reset        # applies every migration, the new ones included
bun run backend:db:test         # supabase test db --local supabase/tests/database (whole suite)
bun run backend:db:lint
```

One writer at a time: only one package at a time may run `backend:db:reset` / `backend:db:test`
against this stack (AGENTS.md, "One writer at a time, per database"). Do not claim a test passed
that did not run (CLAUDE.md, "Evidence"); CI's `database-quality` job is the authority.

### 5.1 Edits to existing files (P1, except where marked P3)

| File                                                                            | Edit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/tests/database/manager_card.test.sql`                                 | (1) `card_tables` + acks table; 8 → 9 and 24 → 27 (lines 540-581). (2) 17 → 25 app_private functions (582-585; P3 makes it 26). (3) Grants block 600-615: the reads list becomes `api.get_my_manager_card()`, `api.get_manager_cards(uuid[])`, `api.get_my_manager_card_history(uuid,integer,integer)`, `api.ack_manager_card_moments(text[])` (authenticated + service_role, not anon); add `api.manager_card_status()` granted to anon, authenticated and service_role; "exactly four" → five. (4) The off block 846-878 (`read_calls`): calls become the new signatures; expected answers become: visitor (authenticated role, no user) and service role with reads off → `{"available": false}` (the switch is checked first now); anon → `42501` for the four signed-in ones; signed-in A at aal1 with reads off → `{"available": false}`; Y at aal1 with reads off → `{"available": false}` (switch first); add: with reads **on**, visitor and service role → `PT401 authentication_required`, Y at aal1 → `PT403 mfa_required`, Y at aal2 → reaches the answer. (5) The reads block 1050-1207: rewrite each assertion to the new shapes, keeping the same people and the same figures (A: OVR 81 champion, stats 84/85/55/99 as `{value, nullReason:null}`, `rulesVersion "v1"`, club with `slug`, `name`, `city: null`; B: TRF `{null, "no_transfers"}`; G: `club: null`; F: **now** `ratingState "forming"`, season 2089/90, `gameweeksCounted 2`, `previousSeason {label "2088/89", ovr 71, tier "pro"}`; D: not visible anywhere). Replace `api.get_manager_card(%L)` checks with `api.get_manager_cards(array[%L])` checks. History: the new arguments, `nextBeforeSeq`, the 9-key rows. (6) Line 1294: `#>> '{stats,cap}'` → `#>> '{card,stats,cap,value}'` and `->> 'ovr'` → `#>> '{card,ovr}'`. (7) Line 1429: `-> 'founderCohort'` → `#> '{card,founder,cohort}'`. (8) P3: guard at 1548-1554 excludes `ops_health_checks`. (9) Header comment: migrations `20261008123000 .. 20261010120300`; `plan(149)` → the new total. |
| `supabase/tests/database/ordinary_account_mfa_step_up.test.sql`                 | 137-160: add `'app.manager_card_moment_acks'`; 26 → 27.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `supabase/tests/database/ordinary_account_mfa_step_up_reads.test.sql`           | 407-413: count stays 81; the description names "the three Manager Card reads and the acknowledgement (20261010120200)".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `supabase/tests/database/ops_health_fantasy_coverage_and_scoring.test.sql` (P3) | 34-40: append `'manager_card'`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

### 5.2 New file `supabase/tests/database/manager_card_api.test.sql` (P2)

`begin; select extensions.plan(N); … select * from extensions.finish(); rollback;`. Its own
hand-seeded fixture (no tick run): uuids from `('bc1e0000-0000-4000-8000-' || lpad(n::text, 12,
'0'))::uuid` (v4-shaped). Reuse the `pg_temp.run(user, aal, expr, role)` helper of
`manager_card.test.sql:182-204` (copy it). Insert rules v1 inside the test
(`{"minimum_gameweeks": 3, "provisional_below": 5, "trf_window_gameweeks": 3, "batch_size": 2000,
"scales": …, "tiers": {"stade": 50, "pro": 65, "champion": 80, "legend": 90},
"cap_ignore_deadlines_before": "2089-09-05T00:00:00Z"}`).

Fixture: football seasons `2088/2089` (completed) and `2089/2090` (active, so the label check
sees `2089/90`); Fantasy seasons FS0 `completed` and FS1 `active`; FS1 gameweeks 1–3 finalized,
4 cancelled, 5–6 scheduled; FS0 gameweek 1 finalized. Two clubs: K1 with `fr` and `ar`
translations and colours, K2 slug `club-ref` with no translation (reached through
`favorite_team_provisional_ref = 'club-ref'`). Users:

Gameweek deadlines: FS1 gameweek n at `2089-09-01 10:00 UTC + 7 × (n − 1) days`, so only GW1
falls before `cap_ignore`.

- **M** rated: team in FS1, card row with serial and founder cohort 2026; FS1 season row counted
  3, through GW3, OVR 82 champion, provisional true, stats 90/80/null/76 (TRF null, no batch;
  (90 + 80 + 76) / 3 = 82); FS1 history rows GW1 (counted 1, figures null), GW2 (2, null), GW3
  (3, OVR 82 champion, provisional); an FS0 season row and one FS0 history row, counted 30,
  OVR 55 stade, not provisional. So `tier_changed:champion` is derivable with
  `previousTier "stade"`, `tier_changed:stade` and `tier_changed:pro` are not, `first_rating:<FS1>` has
  `firstEver: false`, and `season_closed:<FS0>` is derivable; favourite club K1.
- **N** forming: team in FS1, lineup for GW2, **no card row**, no season row; club via
  provisional ref K2.
- **P** new season: FS0 season row OVR 71 pro (FS0 completed), FS1 team and season row counted 1.
- **Q** insufficient: FS1 season row counted 3, OVR null, CAP null with a history row whose
  gameweek deadline precedes `cap_ignore`, TRF null with one Free Hit batch only, SEL/CON values.
- **R** deleted-pending (`profiles.deleted_at` set), with a card, season and history rows.
- **V** verified MFA factor, team in FS1 (for the step-up cases).
- **W** signed in, no Fantasy team.

Cases (each one assertion, grouped):

#### Shape and grants

1. `api.manager_card_status`, `get_my_manager_card`, `get_manager_cards(uuid[])`,
   `get_my_manager_card_history(uuid,integer,integer)`, `ack_manager_card_moments(text[])` exist,
   are `security definer` with `search_path=""`; status executable by anon, authenticated,
   service_role; the other four by authenticated and service_role, not anon; PUBLIC holds nothing.
2. `api.get_manager_card(uuid)`, `api.get_my_manager_card_history(integer,integer)`,
   `app_private.manager_card_json(uuid,uuid)`, `app_private.manager_card_current_season(uuid)` do
   not exist (`to_regprocedure` is null).
3. The acks table: row security enabled and forced, no policy, no right for any API role, FK to
   `app.profiles` with `confdeltype = 'c'`, the statement trigger present.

#### Off

4. Reads off: status = `{"enabled": false, "minRated": null, "minConfirmed": null}` for anon,
   authenticated and service_role.
5. Reads off: `get_my_manager_card`, `get_manager_cards`, history each answer exactly
   `{"available": false}` for M at aal1, and for V at **aal1** (switch before step-up).
6. Reads off: ack answers `{"acknowledged": [], "ignored": ["card_created"]}` and writes no row.
7. Reads on, **no** rules row (test it before inserting the rules row): status `enabled: false`;
   reads `{"available": false}`.
8. Reads on, rules row with `minimum_gameweeks` 0 (not usable; inside an `outcome`-style block that
   is undone): status off, reads off.
9. Reads on and rules usable: status = `{"enabled": true, "minRated": 3, "minConfirmed": 5}`
   (for anon too).

#### Signed-in rules

10. anon → `42501` on the four signed-in functions.
11. authenticated with no user, and service_role → `PT401 authentication_required` (reads on).
12. V at aal1 → `PT403 mfa_required`; at aal2 → answers.

#### Key sets (equal to the zod schemas)

13. `jsonb_object_keys` of `card` for M = the 30 keys of `myCardSchema` (sorted list literal).
14. Each `stats.*` has exactly `{nullReason, value}`; `season` exactly `{id, label}`; `founder`
    exactly `{cohort, cutoffDate, grantedAt}`; `nextTier` exactly `{code, fromOvr}`;
    `previousSeason` exactly `{label, ovr, tier}`.
15. `club` exactly the 8 keys of `cardClubSchema`, and `name` / `shortName` exactly `{ar, fr}`.
16. Each `seasons[]` element exactly the 7 keys of `seasonSummarySchema`.
17. Member card exactly the 14 keys of `memberCardSchema`; its `stats` exactly
    `{cap, con, sel, trf}`.
18. History item exactly the 9 keys of `historyRowSchema`; the page exactly
    `{available, items, nextBeforeSeq}`.
19. Each moment kind's key set exactly as `contracts.ts:65-125` (seven cases, one per kind;
    `season_started.previous` exactly `{label, ovr, tier}`).
20. Ack answer exactly `{acknowledged, ignored}`; status exactly `{enabled, minConfirmed, minRated}`.

#### Values

21. M: `ratingState "provisional"`, `ovr 82`, `tier "champion"`, `bestTier "champion"`,
    `nextTier {"code": "legend", "fromOvr": 90}`, `rulesVersion "v1"`, `gameweeksCounted 3`,
    `throughGameweekSeq 3`, `firstCountedGameweekSeq 1`, `firstRatedGameweekSeq 3`,
    `previousSeason {"label": "2088/89", "ovr": 55, "tier": "stade"}`, `ratingGameweeks null`,
    `ratingGameweeksComplete false`, `serial` six digits, `founder.cohort 2026`,
    `founder.cutoffDate null`, `season.label "2089/90"`,
    `stats.trf {"value": null, "nullReason": "no_transfers"}`.
22. N (no card row): `ratingState "forming"`, `serial null`, `createdAt null`,
    `ovrNullReason "pending_minimum"`, every stat `{null, "pending_minimum"}`,
    `gameweeksCounted 0`, `ratingGameweeks [2, 3, 5]` (cancelled GW4 skipped),
    `ratingGameweeksComplete true`, `club.slug "club-ref"` (provisional reference),
    `moments` = one `card_created` with `occurredAt null`.
23. P: `ratingState "forming"`, `previousSeason {"label": "2088/89", "ovr": 71, "tier": "pro"}`,
    `seasons` newest first with FS0 `closedAt` = FS0 `ends_at`; pending moments include
    `season_closed:<FS0>` and `season_started:<FS1>`.
24. Q: `ratingState "insufficient"`, `ovrNullReason "too_few_stats"`,
    `stats.cap.nullReason "pre_captain_fix"`, `stats.trf.nullReason "excluded_weeks_only"`.
25. W: `{"available": true, "card": null}`. R: `{"available": true, "card": null}`.
26. Batch read as W: order of first occurrence, duplicates and null elements collapse; unknown
    team and R's team omitted; N's team present as a forming member card; 101 distinct ids →
    `PT400`; null array → `PT400`; empty → `{"available": true, "cards": []}`.
27. Another user's card (M read by W through the batch) carries no user id, no e-mail, no
    `handle` and no `moments` (`position()` checks as `manager_card.test.sql:1097-1102`).
28. History for M: `(null, null, 2)` → GW3, GW2 and `nextBeforeSeq 2`; `(null, 2, 2)` → GW1 and
    `nextBeforeSeq null`; GW1/GW2 figures null and `provisional false`; `(FS0, null, 20)` → the
    FS0 row with `seasonLabel "2088/89"`; a season M never played → empty; R → empty;
    `p_limit` 0, 51 or null, or `p_before_seq` 0 → `PT400`.

#### Moments and acknowledgements

29. M's pending moments, exactly: `card_created`, `first_rating:<FS1>` (`firstEver false`),
    `tier_changed:champion` (`previousTier "stade"`), `founder_granted`, `season_closed:<FS0>`;
    not `provisional_cleared` (still provisional), not `first_rating:<FS0>` (not the current
    season), not `season_started:<FS1>` (M's OVR is not null); ordered by `occurredAt` nulls
    first, then key.
30. Ack `["first_rating:<FS1>", "tier_changed:legend", "card_created"]` as M →
    `acknowledged ["first_rating:<FS1>", "card_created"]`, `ignored ["tier_changed:legend"]`
    (well formed, not derivable); two rows written.
31. The same call again → the same answer, still two rows (idempotent).
32. After acking, `get_my_manager_card` no longer lists those two moments.
33. A malformed key (`"tier_changed:homa"`, `"first_rating:not-a-uuid"`), a null element, 17
    distinct keys, or an empty array → `PT400 validation_failed`, nothing written.
34. R (deleted-pending) acks → everything ignored, nothing written.
35. Reads switched off after acking: the acknowledgements stay; an ack call answers all ignored.
36. Deleting M's `auth.users` row removes M's acknowledgements (cascade through the profile).

#### Guard

37. No function outside the card's own (and `ops_health_checks`) names
    `app.manager_card_moment_acks` (same regex style as `manager_card.test.sql:1548-1554`).

P3 adds to the same file (or to `manager_card.test.sql`): the `manager_card` check is last in
`ops_health_checks()`; its status for "both off" (ok), "reads on, no rules" (warn), "compute on,
rules, a gameweek finished 3 h ago not evaluated" (warn), "13 h" (fail), "an error log row" (warn);
`detail` contains no uuid.

---

## 6. The contract test

**File:** `scripts/backend/manager-card-contract-e2e.test.ts` (bun test), with its seed
`scripts/backend/manager-card-contract-seed.sql`. Pattern:
`scripts/backend/historical-performance-e2e-wire-format.test.ts` (Bun's built-in `Bun.SQL`, no new
dependency, opt-in by environment variable).

- Opt-in: runs only when `MANAGER_CARD_E2E_DB_URL` is set; skipped otherwise; fails (does not skip)
  when set and unreachable.
- Everything happens inside **one** transaction that is always rolled back (`sql.begin(async (tx)
=> { …; throw ROLLBACK })` with a sentinel), so it leaves no row behind.
- Seed: the seed file (the pgTAP fixture of 5.2, as plain SQL, plus the rules row and
  `select app_private.manager_card_configure(null, true)`).
- Calls exactly as PostgREST would: `set local role authenticated` (or `anon`),
  `select set_config('request.jwt.claims', '{"sub": …, "role": "authenticated", "aal": "aal1"}',
true)`, then `select api.<fn>(<named args>)::text`, parsed with `JSON.parse`, then:
  - `managerCardStatusSchema.parse` (as anon), off and on;
  - `myCardResponseSchema.parse` for M, N, P, Q, W, and with reads off;
  - `cardsResponseSchema.parse` for a batch of all teams, and off;
  - `historyResponseSchema.parse` for page 1, page 2, another season, off;
  - `ackResponseSchema.parse` for a mixed ack and an off ack.
- Strictness: zod objects strip unknown keys, so each test also checks that the parsed value
  `toEqual`s the raw value (an extra or renamed key then fails).
- Coverage: across all parsed cards, every `ratingState` and every moment `kind` appears at least
  once (assert the set).
- Imports the schemas from `src/backend/manager-card/contracts.ts` (path alias `@/` resolves under
  bun from `tsconfig.json`).
- CI: add a step to `database-quality` in `.github/workflows/backend-quality.yml`, after the
  historical wire-format step (lines 126-134):
  ```yaml
  - name: Manager Card contract (real RPC JSON parsed by contracts.ts)
    run: bun test scripts/backend/manager-card-contract-e2e.test.ts
    env:
      MANAGER_CARD_E2E_DB_URL: postgres://postgres:postgres@127.0.0.1:55322/postgres
  ```
- Local run:
  `MANAGER_CARD_E2E_DB_URL=postgres://postgres:postgres@127.0.0.1:55322/postgres bun test scripts/backend/manager-card-contract-e2e.test.ts`
- Latency (old plan N16): the same file, in its transaction, seeds 100 extra teams with season and
  history rows and logs `explain (analyze, format json)` execution times of `get_my_manager_card`
  and a 100-id `get_manager_cards`; it asserts ≤ 40 ms and ≤ 80 ms **only** when
  `MANAGER_CARD_E2E_STRICT_TIMING=1` (CI machines vary), and always prints the numbers. Record the
  measured numbers in the runbook.

---

## 7. Guarded production apply script, runbook and AGENTS.md

### 7.1 `scripts/backend/apply-20261010120000-manager-card-api-v2.sql`

Model: `scripts/backend/apply-20261008123000-manager-card.sql` (header 1-60, preflight 68-…,
records whole files as `statements[1]`, sha256 check, `execute`, postflight, rehearsal by
`rollback;`, result row). Same structure, for the **four** new migrations:

- Header: what it applies, that it changes nothing anyone sees (reads stay off), WHEN (after merge;
  any quiet moment; not at minute 12), BEFORE (nothing else writing; the owner's check that reads
  are off), HOW (rehearsal then `commit;`), WHAT IT DOES.
- `begin; set local lock_timeout = '5s'; set local statement_timeout = '60s';`
- **Preflight**, refusing (`raise exception 'stop: …'`) unless:
  - `supabase_migrations.schema_migrations` has all five `20261008123000…123400` and none of the
    four new versions;
  - the newest recorded migration is **exactly `20261010073509`** (the removal of public AI notices,
    PR #396, on `main`, applied on production, no apply script: the last repository migration before
    these four), checked after the "none of the four
    is recorded" test so a re-run says so. `20261009091728` (PR #384) wraps
    `app_private.ops_health_checks()` first and `20261010120300` wraps it again, so the migrations
    must go in repository order. The chain is #381's five, then `apply-fantasy-durable-progression.sql`
    (wants `20261008123400` newest), then `apply-home-stories.sql` (wants `20261009091728` newest),
    then `apply-ai-home-stories.sql` (PR #389, `20261009195943`; wants `20261009113132` newest),
    then `apply-story-presentation-repair.sql` (PR #390, `20261009211234`; wants `20261009195943`
    newest), then `refresh-initial-home-stories.sql` (PR #390; records no migration; wants 171 rows
    and `20261009211234` newest, and the AI stories switch off at six attempts, which it switches
    back on), then `apply-compact-story-labels.sql` (PR #393, `20261010055425`; wants
    `20261009211234` newest, the switch on at six attempts and no story generating), then `20261010073509` (PR #396, which has no apply script), then this one.
    Each migration script wants its predecessor newest, so this one comparison covers the
    **versions** of the whole chain and nothing more: each earlier script's own preconditions (row
    counts, switches, drained workers) still apply when it runs, and the refresh leaves no ledger
    row, so the comparison cannot show whether it ran. The refresh must come before the compact
    story labels: after them its pins (171 rows, newest `20261009211234`) refuse for good. The
    refusal names the version it found and the migrations to apply first;
  - each of the five #381 rows' `statements[1]` sha256 equals the repository file's (the same
    hashes as the 2026-10-08 script, `apply-20261008123000-manager-card.sql:1989-2007`), so the
    installed objects are the reviewed ones;
  - `app_private.manager_card_settings.read_enabled` is false (**this apply must not change a live
    answer**); compute may be either;
  - present: `api.get_my_manager_card()`, `api.get_manager_card(uuid)`,
    `api.get_manager_cards(uuid[])`, `api.get_my_manager_card_history(integer,integer)`,
    `app_private.manager_card_json(uuid,uuid)`, `app_private.manager_card_current_season(uuid)`,
    `app_private.manager_card_minimum()`, `app_private.manager_card_qualifies(integer,smallint)`,
    `app_private.assert_mfa_step_up()`, `app_private.refuse_unverified_mfa_actor()`,
    `app_private.ops_health_checks()`, `app_private.ops_health_checks_before_account_deletion()`;
  - absent: `app.manager_card_moment_acks`, `api.manager_card_status()`,
    `api.ack_manager_card_moments(text[])`, `app_private.ops_health_checks_before_manager_card()`.
  - No Fantasy pause is required (no Fantasy table is touched; the only foreign key added points at
    `app.profiles`). The script does not check the Fantasy switch.
- Insert the four history rows (version, name, `array[$bg_<version>_file$…$bg_<version>_file$]`),
  check each sha256, then `execute` each in order (the 2026-10-08 script's pattern).
- **Postflight** (saves nothing of its own):
  - the five functions exist with exactly the grants of 3.3 (status: anon, authenticated,
    service_role; the other four: authenticated, service_role; none to PUBLIC);
  - the four dropped objects are gone;
  - acks table: forced row security, no API right, the trigger present, zero rows;
  - every `app_private` function matching `manager_card` is executable by no API role;
  - `api.manager_card_status()` = `{"enabled": false, "minRated": null, "minConfirmed": null}`;
  - `app_private.ops_health_checks() -> 'checks'` ends with `name = 'manager_card'`;
  - read switch still false; compute unchanged from the preflight's reading; rules rows unchanged
    in count; card table row counts unchanged (baseline read in the preflight, compared here);
  - nine history rows for `20261008123000…20261010120300`.
- `rollback;` as shipped; the final `select case …` result row ("Applied…" / "Rehearsal passed…").

### 7.2 `scripts/backend/apply-manager-card-api-v2-script.test.ts`

Copy `scripts/backend/apply-manager-card-script.test.ts` and adapt: the four migrations carried
byte for byte once, in order, each hash the file's; every hash checked before the first `execute`;
the five #381 hashes present in the preflight; ships with `rollback;` and no `commit;` line outside
comments; never calls `manager_card_configure`, never inserts into `manager_card_rules`, never
`update`s `manager_card_settings`; refuses when `read_enabled` is true (the string check is in the
preflight); the postflight names `manager_card_status`, the dropped functions and `manager_card`.
Run: `bun test scripts/backend/apply-manager-card-api-v2-script.test.ts`.

### 7.3 Docs

- `docs/backend/MANAGER_CARD_OPERATIONS_RUNBOOK.md`:
  - "What ships": reads answer `{available:false}` (not `manager_card_off`); `api.manager_card_status()`.
  - "The two switches": `read` now governs the status (`enabled`), the four reads and the
    acknowledgements; "ready" also needs a usable rules row.
  - New "The app's switch" section (section plan 3.6, 10.15): `MANAGER_CARD_ENABLED` in
    `src/lib/feature-flags.ts` can go to `true` before or after the read switch; the read switch
    is the launch; switching reads off hides Gradins within about a minute (the server memo,
    `manager-card-status-server.ts:15`) with no republish.
  - "Health checks": the `manager_card` check and its thresholds.
  - New "Latency": the budgets and the measured numbers from P2.
  - "Account deletion": the acknowledgements cascade.
  - "Production order": insert the new apply script after step 2 and before switching reads on, and
    before it, in this order, #384's `20261009091728`
    (`scripts/backend/apply-fantasy-durable-progression.sql`), Home stories'
    `20261009094920` and `20261009113132` (`scripts/backend/apply-home-stories.sql`, PR #386), AI
    home stories' `20261009195943` (`scripts/backend/apply-ai-home-stories.sql`, PR #389), the
    story presentation repair's `20261009211234`
    (`scripts/backend/apply-story-presentation-repair.sql`, PR #390), then, after deploying the
    repaired worker and publishing the website, the initial home stories refresh
    (`scripts/backend/refresh-initial-home-stories.sql`, PR #390; rehearse, then commit; it records
    no migration, and it switches the AI stories back on at six attempts), and last the compact
    story labels' `20261010055425` (`scripts/backend/apply-compact-story-labels.sql`, PR #393),
    which needs that switch on and no story still generating, so the refresh must come first and
    its three replacement images must have finished.
- `AGENTS.md` (after the `manager-card-history-prune` paragraph, lines 168-173), add:
  > Where migration 20261010120200 is applied, signed-in users also write
  > `app.manager_card_moment_acks` (through `api.ack_manager_card_moments`) while the read switch
  > is on; that is ordinary app traffic, each user writing only their own rows. For a write that
  > touches that table, switch reads off for its length and restore them afterwards (this hides
  > Gradins for that time): `select app_private.manager_card_configure(null, false);`
  > `select app_private.manager_card_configure(null, true);`
- `docs/backend/ACCOUNT_DELETION_RUNBOOK.md:65-68`: add `manager_card_moment_acks` to the cascade.
- `docs/backend/MANAGER_CARD_DOMAIN_PLAN.md` section 5: one line at its top, "Superseded by
  `MANAGER_CARD_GAP_PLAN.md` (the merged front end's contract); formulas and D1–D20 unchanged."
- `docs/backend/MANAGER_CARD_BACKEND_PLAN.md`: one status line under the title, "Requirements
  source only; the schema built is #381 plus `MANAGER_CARD_GAP_PLAN.md`."
- `docs/engineering/tasks/BG-0158/IMPLEMENTATION_PLAN.md`: add the four new slots to its migration
  table (lines 39-43).
- `docs/production/APPLIED_*`: written only after the owner has run the script, not before.

---

## 8. Work packages

Every package works in `/home/user/mc-backend` on branch `claude/manager-card-backend`, commits
with `BG-0158: <summary>` and the session's attribution lines, never pushes force, never touches a
remote database, and never edits the five `20261008123*` migrations. **Packages that use the local
database (P1, P2, P3) run one at a time**, in that order (one writer per database). P4 has no
database and can be written in parallel with P2/P3, but its hashes are taken last.

### P1 — Migrations and the existing tests (DB; first; alone on the database)

Owns: `supabase/migrations/20261010120000_manager_card_moment_acks.sql`,
`supabase/migrations/20261010120100_manager_card_read_helpers.sql`,
`supabase/migrations/20261010120200_manager_card_api_v2.sql`,
`supabase/tests/database/manager_card.test.sql`,
`supabase/tests/database/ordinary_account_mfa_step_up.test.sql`,
`supabase/tests/database/ordinary_account_mfa_step_up_reads.test.sql`,
`src/backend/generated/database.types.ts` (generated only).

Does: sections 3.1, 3.2, 3.3 and the P1 rows of 5.1.

Done when (paste the output):

```bash
bun run backend:migrations:check
bun run backend:db:reset
bun run backend:db:test
bun run backend:db:lint
bun run backend:types:generate && bun run backend:types:check
bun test src/backend/manager-card
bun run typecheck
```

Commits: `BG-0158: record moment acknowledgements (20261010120000)`,
`BG-0158: read helpers for the Gradins contract (20261010120100)`,
`BG-0158: Gradins read API, off is an answer (20261010120200)`,
`BG-0158: update the Manager Card and step-up tests for the new API`,
`BG-0158: regenerate database types`.

### P2 — New pgTAP file and the contract test (DB; after P1; alone on the database)

Owns: `supabase/tests/database/manager_card_api.test.sql`,
`scripts/backend/manager-card-contract-e2e.test.ts`,
`scripts/backend/manager-card-contract-seed.sql`,
`.github/workflows/backend-quality.yml` (the one step of section 6).

Does: sections 5.2 (cases 1–37) and 6. If a case shows a migration is wrong, fix the P1
migration in place (it is unapplied everywhere: confirm with
`select version from supabase_migrations.schema_migrations where version like '20261009%'` on the
local stack only) and note it in the commit.

Done when:

```bash
bun run backend:db:reset
bun run backend:db:test
MANAGER_CARD_E2E_DB_URL=postgres://postgres:postgres@127.0.0.1:55322/postgres \
  bun test scripts/backend/manager-card-contract-e2e.test.ts
bun test scripts/backend/manager-card-contract-e2e.test.ts   # unset: skips
```

Commits: `BG-0158: pgTAP for the Gradins read API and acknowledgements`,
`BG-0158: contract test parsing real RPC JSON with contracts.ts`,
`BG-0158: run the Manager Card contract test in database-quality`.

### P3 — Health check (DB; after P2; alone on the database)

Owns: `supabase/migrations/20261010120300_manager_card_health.sql`,
`supabase/tests/database/ops_health_fantasy_coverage_and_scoring.test.sql`,
the guard lines and function count of `supabase/tests/database/manager_card.test.sql`,
the health cases appended to `supabase/tests/database/manager_card_api.test.sql`,
`src/backend/generated/database.types.ts` (regenerate if it changes).

Does: section 3.4 and its test edits.

Done when: the P1 command list again (reset, test, lint, types check).
Commits: `BG-0158: manager_card health check (20261010120300)`,
`BG-0158: health check tests`.

### P4 — Apply script, its test and the docs (no DB; can start while P2/P3 run; hashes last)

Owns: `scripts/backend/apply-20261010120000-manager-card-api-v2.sql`,
`scripts/backend/apply-manager-card-api-v2-script.test.ts`,
`docs/backend/MANAGER_CARD_OPERATIONS_RUNBOOK.md`, `AGENTS.md` (the one paragraph of 7.3),
`docs/backend/ACCOUNT_DELETION_RUNBOOK.md`, `docs/backend/MANAGER_CARD_DOMAIN_PLAN.md` (one line),
`docs/backend/MANAGER_CARD_BACKEND_PLAN.md` (one line),
`docs/engineering/tasks/BG-0158/IMPLEMENTATION_PLAN.md`.

Does: section 7. The script must carry the four migrations **as finally committed** by P1 and P3:
build it (or re-embed and re-hash) only after P3's last migration commit, and re-run its test after
any later migration edit.

Done when:

```bash
bun test scripts/backend/apply-manager-card-api-v2-script.test.ts scripts/backend/apply-manager-card-script.test.ts
bun run format:check
```

Optional, local only, with the owner's permission to write to the local stack: run the script's
rehearsal against a freshly reset local stack where the four new migrations are **not** applied
(reset with them moved aside, run, reset again) and see "Rehearsal passed".
Commits: `BG-0158: guarded apply script for the Gradins read API`,
`BG-0158: runbook, AGENTS.md and deletion notes for the Gradins read API`.

### Order and parallelism

```
P1 (DB) ──► P2 (DB) ──► P3 (DB)
                 └──── P4 docs (no DB, in parallel) ──► P4 script hashes (after P3)
```

Never run two of P1/P2/P3 at once; never run any of them while another lane uses port 55322.

---

## 9. Questions for the owner

Each has the default the build uses meanwhile.

1. **End of season.** Nothing in the app marks a Fantasy season "finished" today. The card will
   treat a season as finished only when its status is set to completed, and the season-end
   moments wait for that. Is that fine until we add a proper season close before May 2027?
   _Default: yes, wait for the completed status._
2. **Founder date.** Should a founder's card show the cut-off date ("fondateur, inscrit avant le
   1er novembre")? We do not store it today. _Default: no date shown; we can store it with the
   grant later._
3. **Club city.** We have no Arabic city names for clubs. _Default: no city on the card._
4. **Health alert.** Should the owner be paged when a finished gameweek has waited more than 12
   hours for its cards (a warning after 2 hours), only while the card is switched on?
   _Default: yes._
