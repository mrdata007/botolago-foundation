# BotolaGO — FPL reference screen matrix

Reference: Figma file `CMGPbsWSIhMAwc6xLF6y7b` (page "Fantasy Premier League",
Mobbin capture of the FPL iOS app, 1179×2676 boards). The Figma boards are the
specification; every Fantasy screen below was rebuilt screen-for-screen with
BotolaGO identity and Botola Pro data on top of the existing Supabase business
logic. Evidence screenshots (390 px wide, French and Arabic, plus desktop
journeys) live in [`docs/qa/fpl-screens/`](docs/qa/fpl-screens/) and were
captured against the production Supabase project with the synthetic accounts
described in
[`docs/backend/FANTASY_2026_27_BRIDGE_ACTIVATION.md`](docs/backend/FANTASY_2026_27_BRIDGE_ACTIVATION.md).

An independent QA pass re-opened every board and re-compared it with the
rendered application on 2026-09-18; the corrections it produced and the
remaining visible differences are recorded in
[`docs/qa/FANTASY_INDEPENDENT_QA_2026_09_18.md`](docs/qa/FANTASY_INDEPENDENT_QA_2026_09_18.md).
The verdicts below are those of that pass.

Status legend: **Implemented** = the route/state exists in code, **Visual** =
rendered screenshot compared side by side with the Figma board (layout
geometry, component placement, spacing, typography hierarchy, pitch structure,
cards, navigation, tabs, buttons, sheets), **Functional** = the interaction
behind the screen runs against the real backend, **Tested** = covered by
`tests/e2e/fantasy.journey.e2e.ts` (F), `tests/e2e/anonymous.acceptance.e2e.ts`
(A), the scripted manual journey on mobile and desktop (J) or a scripted
browser capture (M). "PASS\*" = layout implemented and verified, but the
populated state depends on data production does not have yet (one gameweek,
no results).

## Reference inventory

| Count                                  | Value                                                            |
| -------------------------------------- | ---------------------------------------------------------------- |
| Fantasy reference states (FPL-001…027) | 27                                                               |
| Derived BotolaGO states (FPL-D01…D06)  | 6                                                                |
| BotolaGO Fantasy states in total       | 33                                                               |
| Reference screens previously missed    | 0 (the file has no squad-selection boards; see the QA report §1) |

## Fantasy reference screens (in scope)

| ID      | Reference screen (Figma board / frame)                        | BotolaGO route / state                                                                                                                                         | Existing before? | Visual | Functional | Tested  | Evidence                                                                        |
| ------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------ | ---------- | ------- | ------------------------------------------------------------------------------- |
| FPL-001 | Fantasy hub (Transferring a player 1:166; Team profile 1:205) | `/fantasy` — brand hero, team card, GW pill + deadline, 2×3 actions, rankings banner, News & Video, Leagues & Cups, Notifications, Follow, "More about"        | partial          | PASS   | PASS       | F, A, J | `auth_hub.png`, `anon_fantasy.png`, `ar_hub.png`, `journey/desktop_01_hub.png`  |
| FPL-002 | Transfers — squad view (1:167)                                | `/fantasy/transfers` — Back header + deadline, Squad/List, four-cell stat bar, 15-man pitch 2-5-5-3 with price plates, Add Player / Next                       | partial          | PASS   | PASS       | F, J    | `auth_transfers.png`, `ar_transfers.png`, `journey/desktop_11_transfers.png`    |
| FPL-003 | Add Player (1:168)                                            | Full-screen "Add Player": Bank banner, Position / Price / View selects, sortable Player · Form · Current Price · Selected list, taken/unaffordable rows dimmed | no               | PASS   | PASS       | F, J    | `auth_add_player.png`, `auth_add_player_any.png`, `new_add_player.png`          |
| FPL-004 | Transfers — incoming player chosen, replace mode (1:169)      | `/fantasy/transfers` after Add Player: non-matching positions dimmed, "Incoming Player" strip, tap the outgoing player                                         | no               | PASS   | PASS       | J, M    | `auth_transfers_replace_mode.png`                                               |
| FPL-005 | Transfers — after add, Next enabled (1:170)                   | `/fantasy/transfers` with the incoming card highlighted (cyan plate), Cost / Bank updated, Reset shown                                                         | no               | PASS   | PASS       | F, J    | `auth_transfers_incoming.png`, `journey/mobile_12_transfers_incoming.png`       |
| FPL-006 | Transfers — List view (1:171)                                 | `/fantasy/transfers` → List: position pills, Form · Current · Selling · Purchase price                                                                         | no               | PASS   | PASS       | M       | (captured in QA run `transfers_list`; same component as `auth_team_list.png`)   |
| FPL-007 | Transfer confirmation (1:172–1:173)                           | Banner, Transfer Out / Transfer In tiles, activation note, bottom-anchored Points Overview, Wildcard / Free Hit buttons, Edit Transfers / Confirm              | no               | PASS   | PASS       | F, J    | `auth_transfer_confirm.png`, `journey/mobile_13_transfer_confirm.png`           |
| FPL-008 | Pick Team (1:175)                                             | `/fantasy/team` — chips row, XI on the pitch with fixture plates, labelled bench, tap card → action sheet                                                      | partial          | PASS   | PASS       | F, J    | `auth_team.png`, `auth_team_sheet.png`, `journey/mobile_09_team.png`            |
| FPL-009 | Pick Team — chip pending, "✕ Cancel / ✓ Confirm" (1:176)      | `/fantasy/team` with a chip selected or a dirty lineup: Cancel pill replaces Back, Confirm pill on the right, bench outlined                                   | no               | PASS   | PASS       | F, M    | `auth_team_chip_pending.png`                                                    |
| FPL-010 | Pick Team — chip active (1:177)                               | `/fantasy/team` after Confirm: ACTIVE badge in the chips row, cancel link while cancellable                                                                    | no               | PASS   | PASS       | M       | `auth_team_chip_pending.png` → confirm                                          |
| FPL-011 | Fixture Difficulty Rating (1:179)                             | `/fantasy/fixtures` — fixed Team column, one 84 px column per gameweek with date, colour cells (H)/(A), floating FDR key                                       | partial          | PASS   | PASS       | A, M    | `auth_fdr.png`, `anon_fantasy_fixtures.png`, `ar_fdr.png`                       |
| FPL-012 | FDR sorted by gameweek, descending (1:180)                    | `/fantasy/fixtures` → tap a GW sort button                                                                                                                     | no               | PASS   | PASS       | M       | `auth_fdr.png`                                                                  |
| FPL-013 | FDR sorted ascending (1:181)                                  | `/fantasy/fixtures` → tap again                                                                                                                                | no               | PASS   | PASS       | M       | `auth_fdr.png`                                                                  |
| FPL-014 | FDR scrolled to later gameweeks (1:182–1:184)                 | `/fantasy/fixtures` horizontal scroll with sticky Team column                                                                                                  | no               | PASS\* | PASS       | M       | `auth_fdr.png`                                                                  |
| FPL-015 | Leagues & Cups (1:186; Join a League 1:195)                   | `/fantasy` section and `/fantasy/leagues` — Leagues/Cups tabs, Join / Configure, General & Private tables                                                      | partial          | PASS   | PASS       | F, J    | `auth_leagues.png`, `anon_fantasy_leagues.png`, `journey/mobile_17_leagues.png` |
| FPL-016 | League standings (1:187)                                      | `/fantasy/leagues/$leagueId` — League/Cup tabs, Last Updated, Pos · Team · GW · Total with movement                                                            | partial          | PASS\* | PASS       | F, M    | `auth_league_detail.png`                                                        |
| FPL-017 | League detail — Cup tab (1:188)                               | `/fantasy/leagues/$leagueId` → Cup                                                                                                                             | no               | PASS   | PASS       | M       | `auth_league_cup.png`                                                           |
| FPL-018 | Team points — squad view (1:190–1:191)                        | `/fantasy/points` — team name header, ‹ Gameweek N ›, Squad/List, Average · Points · Highest, pitch with points plates                                         | partial          | PASS\* | PASS       | F, J    | `auth_points.png`, `journey/mobile_15_points.png`                               |
| FPL-019 | Team points — list view (1:192–1:193)                         | `/fantasy/points` → List                                                                                                                                       | no               | PASS\* | PASS       | J       | `auth_points_list.png`                                                          |
| FPL-020 | Join a league — Private code (1:196)                          | `/fantasy/leagues/join` — Leagues header with Done, "Join a League" title, Private/Public, code field, gradient button                                         | partial          | PASS   | PASS       | J, M    | `auth_join_private.png`, `anon_fantasy_leagues_join.png`                        |
| FPL-021 | Join a league — invalid code (1:197)                          | `/fantasy/leagues/join` after an unknown code                                                                                                                  | no               | PASS   | PASS       | M       | `auth_join_invalid.png`                                                         |
| FPL-022 | Join a league — Public, Classic / Head to Head (1:198)        | `/fantasy/leagues/join` → Public                                                                                                                               | no               | PASS   | PASS       | M       | `auth_join_public.png`                                                          |
| FPL-023 | Players to be added after the next points update (1:199)      | `/fantasy/leagues/join` → pending members list                                                                                                                 | no               | PASS\* | PASS       | M       | `auth_join_public.png`                                                          |
| FPL-024 | Help & Rules (1:201)                                          | `/fantasy/help` — "How can we help?", ink section pills, accordion rows                                                                                        | no               | PASS   | PASS       | J       | `anon_fantasy_help.png`, `ar_help.png`                                          |
| FPL-025 | Help & Rules — item expanded (1:202–1:203)                    | `/fantasy/help` → tap a question (gradient header, chevron up)                                                                                                 | no               | PASS   | PASS       | J       | `journey/mobile_19_help_expanded.png`                                           |
| FPL-026 | Team profile — Current Season (1:206)                         | `/fantasy/profile` — Team Overview rows, chip badges, Gameweek History                                                                                         | no               | PASS   | PASS       | M       | `auth_profile_season.png`, `anon_fantasy_profile.png`                           |
| FPL-027 | Manager profile (1:207)                                       | `/fantasy/profile` → Manager Profile: flag, Manage Account, Season History                                                                                     | no               | PASS   | PASS       | M       | `auth_profile_manager.png`, `ar_profile.png`                                    |

## Derived states (no dedicated Figma board, required by the journey)

| ID      | State                                                   | BotolaGO route / state                                                                                   | Visual basis                   | Functional | Tested                                                             |
| ------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------- | ------------------------------------------------------------------ |
| FPL-D01 | Squad selection for a new manager (empty 15-slot pitch) | `/fantasy/create` — FPL-002 composition with 15 "Choisir" shirts in 2-5-5-3                              | FPL-002 + empty-slot component | PASS       | F, J (`new_create_empty.png`, `journey/mobile_05_create_full.png`) |
| FPL-D02 | Team name step                                          | `/fantasy/create` after Next — name field, summary rows, "Enter squad"                                   | FPL header + FPL form styling  | PASS       | F, J (`journey/mobile_08_team_name.png`)                           |
| FPL-D03 | Player action sheet                                     | Pick Team: captain / vice / substitute / info · Transfers: transfer out / undo / info · Create: + remove | FPL bottom sheet               | PASS       | F, J (`auth_team_sheet.png`, `auth_transfers_sheet.png`)           |
| FPL-D04 | Guest (unauthenticated) state                           | any `/fantasy/*` requiring auth → sign-in call to action with `next`                                     | FPL banner + gradient button   | PASS       | A (`anon_fantasy_team.png`, `anon_fantasy_points.png`)             |
| FPL-D05 | No active season / awaiting gameweek                    | `/fantasy/*` → `season_closed` / `awaiting_gameweek` phase                                               | FPL banner                     | PASS       | unit (`fantasy-availability.test.ts`)                              |
| FPL-D06 | Backend failure / timeout                               | `/fantasy/*` → finite skeleton (12 s timeout, 1 retry) then error + Retry                                | FPL banner                     | PASS       | F (repeated navigation never sticks on loading)                    |

## Figma boards outside the Fantasy mandate (not reconstructed)

Onboarding, welcome, account management, More, login, password reset, news,
player detail and stats, match centre, league tables, quiz, awards, Hall of
Fame, history, legal pages: these belong to the Premier League companion app
captured in the same file. They map to existing BotolaGO routes (`/matches`,
`/news`, `/players/$playerId`, `/settings`) which were left untouched.

## Identity and content adaptation

- FPL purple → BotolaGO deep blue (`--brand-primary`), FPL green/cyan CTA →
  BotolaGO cyan family; tokens `--fpl-*` in `src/styles.css`.
- Premier League clubs, players and fixtures → Botola Pro 2026/27 catalog from
  the production Supabase project (16 clubs, 539 players, GW1 fixtures).
- FPL club kits → colour-mapped Botola kits (`src/lib/kits.ts`); no Premier
  League or FPL logos, photos or artwork were copied.
- Photography slots (hub news cards) use real BotolaGO article heroes when the
  feed has them (Arabic today); when none exist the card is text-only rather
  than an invented photo or gradient.
- French and Arabic (RTL) are both served; Arabic evidence is in `ar_*.png`.

## Regression coverage

`tests/e2e/fantasy.journey.e2e.ts` (serial, needs `E2E_FANTASY_EMAIL` /
`E2E_FANTASY_PASSWORD`):

1. new manager → squad selection → 15 picks → team name → save → reload;
2. captain / vice-captain change persists;
3. transfer via card → "Transfer out" → Add Player → Next → Confirm, persisted
   across reload;
4. points screen with gameweek navigation and no error state on an empty result;
5. leagues: create → detail → back;
6. repeated navigation between the Fantasy screens never sticks on loading and
   raises no page error.

Last full run (local dev server against production data, 2026-09-18): 18
passed, 3 skipped (staging suite, staging project inactive); `bun test` 622
pass; typecheck, lint (0 errors) and build clean.
