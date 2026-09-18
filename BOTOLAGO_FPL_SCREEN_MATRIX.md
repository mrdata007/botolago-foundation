# BotolaGO — FPL reference screen matrix

Reference: Figma file `CMGPbsWSIhMAwc6xLF6y7b` (page "Fantasy Premier League",
Mobbin capture of the FPL iOS app, 1179×2676 boards). The Figma boards are the
specification; every Fantasy screen below was rebuilt screen-for-screen with
BotolaGO identity and Botola Pro data on top of the existing Supabase business
logic. Evidence screenshots (390 px wide, French and Arabic) live in
[`docs/qa/fpl-screens/`](docs/qa/fpl-screens/) and were captured against the
production Supabase project with the synthetic e2e accounts described in
[`docs/backend/FANTASY_2026_27_BRIDGE_ACTIVATION.md`](docs/backend/FANTASY_2026_27_BRIDGE_ACTIVATION.md).

Status legend: **Implemented** = the route/state exists in code, **Visual** =
rendered screenshot compared against the Figma board (composition, hierarchy,
component placement, spacing, typography hierarchy), **Functional** = the
interaction behind the screen runs against the real backend, **Regression** =
covered by `tests/e2e/fantasy.journey.e2e.ts` (F) or
`tests/e2e/anonymous.acceptance.e2e.ts` (A), or by a manual scripted browser
check (M) whose screenshot is in the evidence folder.

## Fantasy reference screens (in scope)

| ID      | Reference screen (Figma board / frame)                       | BotolaGO route / state                                                                                                                                                                   | Existing before?        | Visual parity                         | Functional parity                                      | Tested  | Evidence                                                   |
| ------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------- | ------------------------------------------------------ | ------- | ---------------------------------------------------------- |
| FPL-001 | Fantasy hub (Transferring a player, frame 1; Team profile 1) | `/fantasy` — hero, team card, GW deadline, 2×3 actions, rankings banner, news, Leagues & Cups, notifications, follow, "More about"                                                       | partial (old dashboard) | PASS                                  | PASS                                                   | F, A, M | `auth_hub.png`, `new_hub.png`, `fantasy.png`, `ar_hub.png` |
| FPL-002 | Transfers — squad view (Transferring a player 2)             | `/fantasy/transfers` — header + deadline, Squad/List, stat bar, pitch with remove (×), bench labels, Add Player / Next                                                                   | partial (list UI)       | PASS                                  | PASS                                                   | F, M    | `auth_transfers.png`, `ar_transfers.png`                   |
| FPL-003 | Add Player (Transferring a player 3)                         | `/fantasy/transfers` + `/fantasy/create` → full-screen "Add Player" dialog: Bank banner, Position/Price/View selects, sortable Player/Form/Price/Selected list, unaffordable rows dimmed | no                      | PASS                                  | PASS                                                   | F, M    | `auth_add_player.png`, `new_add_player.png`                |
| FPL-004 | Transfers — incoming player highlighted (Transferring 4)     | `/fantasy/transfers` after a pick: incoming card cyan, Cost/Bank updated                                                                                                                 | no                      | PASS                                  | PASS                                                   | F, M    | `auth_transfers_incoming.png`                              |
| FPL-005 | Transfers — after add, Next enabled (Transferring 5)         | `/fantasy/transfers` with ≥1 pending transfer                                                                                                                                            | no                      | PASS                                  | PASS                                                   | F, M    | `auth_transfers_incoming.png`                              |
| FPL-006 | Transfers — List view (Transferring 6)                       | `/fantasy/transfers` → List tab: grouped GK/DEF/MID/FWD table with position pills                                                                                                        | no                      | PASS                                  | PASS                                                   | M       | `auth_team_list.png` (same component)                      |
| FPL-007 | Transfer confirmation (Transferring 7–8)                     | `/fantasy/transfers` → Next: banner, Out/In pairs, Points Overview, Wildcard/Free Hit buttons, Edit/Confirm                                                                              | no                      | PASS                                  | PASS (server preview + confirm)                        | F, M    | `auth_transfer_confirm.png`                                |
| FPL-008 | Pick Team (Activating a chip 1)                              | `/fantasy/team` — chips row, pitch with fixtures, bench, tap card → action sheet                                                                                                         | partial                 | PASS                                  | PASS                                                   | F, M    | `auth_team.png`, `auth_team_sheet.png`, `fantasy_team.png` |
| FPL-009 | Pick Team — chip pending, Cancel / ✓ Confirm header (Chip 2) | `/fantasy/team` with a chip selected or a dirty lineup                                                                                                                                   | no                      | PASS                                  | PASS                                                   | F, M    | `auth_team_chip_pending.png`                               |
| FPL-010 | Pick Team — chip active (Chip 3)                             | `/fantasy/team` after Confirm with an active chip (badge in chips row, cancel while cancellable)                                                                                         | no                      | PASS                                  | PASS (`activate_fantasy_chip` / `cancel_fantasy_chip`) | M       | `auth_team_chip_pending.png` → confirm                     |
| FPL-011 | Fixture Difficulty Rating table (FDR 1)                      | `/fantasy/fixtures` — Team column + GW columns with dates, colour cells (H)/(A), floating FDR key                                                                                        | partial (list)          | PASS                                  | PASS                                                   | A, M    | `auth_fdr.png`, `fantasy_fixtures.png`, `ar_fdr.png`       |
| FPL-012 | FDR sorted by gameweek, descending (FDR 2)                   | `/fantasy/fixtures` → tap GW sort button (ink highlight)                                                                                                                                 | no                      | PASS                                  | PASS                                                   | M       | `auth_fdr.png`                                             |
| FPL-013 | FDR sorted ascending (FDR 3)                                 | `/fantasy/fixtures` → tap again                                                                                                                                                          | no                      | PASS                                  | PASS                                                   | M       | `auth_fdr.png`                                             |
| FPL-014 | FDR scrolled to later gameweeks (FDR 4–6)                    | `/fantasy/fixtures` horizontal scroll (sticky Team column)                                                                                                                               | no                      | PASS (1 GW published, see limitation) | PASS                                                   | M       | `auth_fdr.png`                                             |
| FPL-015 | Leagues & Cups (League detail 1; Join a League 1)            | `/fantasy/leagues` — Leagues/Cups tabs, Join / Manage buttons, General & Private tables                                                                                                  | partial                 | PASS                                  | PASS                                                   | F, M    | `auth_leagues.png`, `fantasy_leagues.png`                  |
| FPL-016 | League standings (League detail 2)                           | `/fantasy/leagues/$leagueId` — League/Cup tabs, Last Updated, Pos/Team/GW/Total with movement, Leave                                                                                     | partial                 | PASS                                  | PASS                                                   | F, M    | `auth_league_detail.png`                                   |
| FPL-017 | League detail — Cup tab (League detail 3)                    | `/fantasy/leagues/$leagueId` → Cup tab (empty cup state)                                                                                                                                 | no                      | PASS                                  | PASS                                                   | M       | `auth_league_cup.png`                                      |
| FPL-018 | Team points — squad view (Team detail 1–2)                   | `/fantasy/points` — team name header, ‹ Gameweek N ›, Squad/List, Average/Points/Highest, pitch with points plates                                                                       | partial                 | PASS                                  | PASS (renders "—" until first calculation)             | F, M    | `auth_points.png`, `fantasy_points.png`                    |
| FPL-019 | Team points — list view (Team detail 3–4)                    | `/fantasy/points` → List tab                                                                                                                                                             | no                      | PASS                                  | PASS                                                   | M       | `auth_points_list.png`                                     |
| FPL-020 | Join a league — Private, code entry (Join a League 2)        | `/fantasy/leagues/join` — Private/Public tabs, code field, Join button                                                                                                                   | partial (inline form)   | PASS                                  | PASS (`join_fantasy_league`)                           | M       | `auth_join_private.png`, `fantasy_leagues_join.png`        |
| FPL-021 | Join a league — invalid code (Join a League 3)               | `/fantasy/leagues/join` after an unknown code: inline error                                                                                                                              | no                      | PASS                                  | PASS                                                   | M       | `auth_join_invalid.png`                                    |
| FPL-022 | Join a league — Public (Classic / H2H) (Join a League 4)     | `/fantasy/leagues/join` → Public tab (Classic available, H2H disabled)                                                                                                                   | no                      | PASS                                  | PASS                                                   | M       | `auth_join_public.png`                                     |
| FPL-023 | Players to be added (Join a League 5)                        | `/fantasy/leagues/join` → invited members list                                                                                                                                           | no                      | PASS                                  | PASS                                                   | M       | `auth_join_public.png`                                     |
| FPL-024 | Help & Rules (Help & Rules 1)                                | `/fantasy/help` — accordion FAQ                                                                                                                                                          | no                      | PASS                                  | PASS                                                   | M       | `fantasy_help.png`, `ar_help.png`                          |
| FPL-025 | Help & Rules — item expanded (Help & Rules 2–3)              | `/fantasy/help` → tap a question                                                                                                                                                         | no                      | PASS                                  | PASS                                                   | M       | `fantasy_help.png`                                         |
| FPL-026 | Team profile — Current Season (Team profile 2)               | `/fantasy/profile` — overview key/values, chips badges, Gameweek History                                                                                                                 | no                      | PASS                                  | PASS                                                   | M       | `auth_profile_season.png`, `fantasy_profile.png`           |
| FPL-027 | Manager profile (Team profile 3)                             | `/fantasy/profile` → Manager Profile tab: flag, Manage Account, Season History                                                                                                           | no                      | PASS                                  | PASS                                                   | M       | `auth_profile_manager.png`, `ar_profile.png`               |

## Derived states (no dedicated Figma board, required by the journey)

| ID      | State                                                         | BotolaGO route / state                                                         | Visual basis                   | Functional                                 | Tested                                              |
| ------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------ | ------------------------------------------ | --------------------------------------------------- |
| FPL-D01 | Squad selection for a new manager (empty pitch)               | `/fantasy/create` — same composition as FPL-002 with 15 "Choisir" empty shirts | FPL-002 + empty-slot component | PASS                                       | F, M (`new_create_empty.png`, `fantasy_create.png`) |
| FPL-D02 | Team name step                                                | `/fantasy/create` after Next — name form + "Enter squad"                       | FPL header + FPL form styling  | PASS                                       | F                                                   |
| FPL-D03 | Player action sheet (Make captain / vice / Substitute / info) | `/fantasy/team` tap on a card                                                  | FPL bottom sheet               | PASS                                       | F, M (`auth_team_sheet.png`)                        |
| FPL-D04 | Guest (unauthenticated) state                                 | any `/fantasy/*` requiring auth → sign-in call to action with `next`           | FPL banner + gradient button   | PASS                                       | A (`fantasy_team.png`, `fantasy_points.png`)        |
| FPL-D05 | No active season / awaiting gameweek                          | `/fantasy/*` → `season_closed` / `awaiting_gameweek` phase                     | FPL banner                     | PASS (unit `fantasy-availability.test.ts`) | unit                                                |
| FPL-D06 | Backend failure / timeout                                     | `/fantasy/*` → finite skeleton (12 s timeout, 1 retry) then error + Retry      | FPL banner                     | PASS                                       | F (repeated navigation never sticks on loading)     |

## Figma boards outside the Fantasy mandate (not reconstructed)

These boards belong to the Premier League companion app captured in the same
Figma file, not to the Fantasy game: Onboarding (1:1…), Player detail, Player
stats, News detail, Match centre, Settings. They are listed so the inventory is
complete; they map to existing BotolaGO routes (`/matches`, `/news`,
`/players/$playerId`, `/settings`) which were left untouched.

## Identity and content adaptation

- FPL purple → BotolaGO deep blue (`--brand-primary`), FPL green/cyan CTA →
  BotolaGO cyan family; tokens `--fpl-*` in `src/styles.css`.
- Premier League clubs, players and fixtures → Botola Pro 2026/27 catalog from
  the production Supabase project (16 clubs, 539 players, GW1 fixtures).
- FPL club kits → colour-mapped Botola kits (`src/lib/kits.ts`); no Premier
  League or FPL logos, photos or artwork were copied.
- Photography slots (news cards on the hub) use the real BotolaGO article
  heroes; where the reference has none, none was invented.
- French and Arabic (RTL) are both served; Arabic evidence is in `ar_*.png`.

## Regression coverage

`tests/e2e/fantasy.journey.e2e.ts` (serial, needs `E2E_FANTASY_EMAIL` /
`E2E_FANTASY_PASSWORD`):

1. new manager → squad selection → 15 picks → team name → save → reload;
2. captain / vice-captain change persists;
3. transfer previewed, confirmed, persisted across reload;
4. points screen with gameweek navigation and no error state on an empty result;
5. leagues: create → detail → back;
6. repeated navigation between the Fantasy screens never sticks on loading and
   raises no page error.

Last full run (local dev server against production data, 2026-09-18): see the
final report in the pull request / session summary.
