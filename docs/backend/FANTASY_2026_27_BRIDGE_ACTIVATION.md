# Fantasy 2026/27 — production activation with bridged data

Date: 2026-09-18. Project: BotolaGO Production V2 (`tkewgajrljbwgwedqsxn`).

## Why

Production had no Fantasy season at all (`api.fantasy_hub` returned
`fantasy_season_closed`) and the `/fantasy` layout gated every child route on
that availability query, so the public app showed "Chargement…" or the
unavailable banner forever. The recovery workflow
(`football-current-season-recovery.yml`) could not open the season because the
provider still lacks squads for the two promoted clubs and the guard refused
`current_squad_empty_or_oversized`.

## What was done (all with real data, no fabricated dataset)

| Step | Change                                                                                                                                                                                                                                                                    | Source                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1    | `app.seasons` 2026/27 (`d03223b0-8f4a-4309-93e1-2a708d7c3584`): `ends_on` corrected from `2026-09-24` to `2027-06-30`                                                                                                                                                     | provider season metadata was truncated to the first round   |
| 2    | 42 `app.players` inserted for Amal Tiznit and Widad Témara (2 existing players reused)                                                                                                                                                                                    | public 2025/26 squad lists (Soccerway, footballdatabase.eu) |
| 3    | 539 `app.team_memberships` for the 2026/27 season: 459 latest provider memberships for the 13 continuing clubs, 36 for MA Tétouan (2024/25 provider squad), 21 Tiznit, 23 Témara; `valid_from 2026-09-24`, `valid_to 2027-06-30`; duplicate shirt numbers nulled          | provider + step 2                                           |
| 4    | `api.service_stage_fantasy_catalog` activation `c0de2026-0917-4a11-8f00-000000000001`, source digest `9eede640…5885b` → fantasy season `9918cf95-9ed5-4d7b-99ca-eb9bfc29a258`, 539 fantasy players priced 4.8–7.2 by the reviewed price algorithm, 1 gameweek, 8 fixtures | existing activation pipeline                                |
| 5    | `api.service_open_fantasy_registration` (`…0002`) → season status `registration_open`, GW1 `3cc19aaa-ea33-4909-845b-db33314b4071` status `open`, deadline `2026-09-23T22:30:00Z`                                                                                          | existing pipeline                                           |

Verified state on 2026-09-18: 16 clubs with memberships, 539 memberships, 539
fantasy players, 1 gameweek, 8 fixtures, `api.fantasy_hub` → `registration_open`.

## Known limitations (to be replaced, not hidden)

1. **Calendar depth.** The provider has published only round 1 (8 fixtures,
   kickoff `2026-09-24T00:00Z`, which is a placeholder time). The Fantasy
   season therefore has a single gameweek; the FDR screen shows one column and
   the points gameweek selector cannot move. When further rounds land in
   `app.rounds` / `app.fixtures` with confirmed kickoffs,
   `api.service_sync_fantasy_calendar` (migration
   `20260918120000_fantasy_calendar_sync.sql`, called by the scheduled
   orchestrator) stages them as `scheduled` gameweeks and the lifecycle worker
   opens each one after the previous postwork.
2. **Deadline.** Derived from the placeholder kickoff (90 minutes before). The
   calendar sync realigns GW1's assignments, window and deadline as soon as the
   provider publishes a non-midnight kickoff, provided the current deadline has
   not passed; `scripts/backend/fantasy-realign-gameweek-calendar.sql` remains
   the manual fallback.
3. **Promoted-club rosters** come from public 2025/26 lists, not the provider.
   When the provider publishes Tiznit / Témara squads, the normal
   `service_ingest_current_football_squads` run supersedes these memberships
   (`valid_to` is bounded to the season end).
4. **No results yet.** `get_my_fantasy_points` returns `result: null` and null
   per-player scoring until the first calculation; the client contract now
   accepts that and renders "—" plates.

## Synthetic accounts (production, test only)

`e2e.fantasy.recovery@botolago.com` (team "E2E Botola XI",
`ccd4d5c4-2cd2-4b0d-82f4-7f22f0d435b9`) and
`e2e.fantasy.newcomer@botolago.com` (no team). Created directly in
`auth.users` / `auth.identities` for the browser regression suite; delete or
rotate them before public launch if they are not wanted (their password is
held only by the owner and the CI secret `E2E_FANTASY_PASSWORD`).

## Environment and security checks performed

- `.env.production` `VITE_APP_URL` corrected from `https://botolago.lovable.app`
  to `https://botolago.com` (Auth redirects and canonical origin). The
  Supabase Auth **Site URL** and **Redirect URLs** cannot be edited through the
  MCP tooling: verify in the dashboard that `https://botolago.com/**` is
  allowed and that the Lovable preview domain is only kept if still used.
- Supabase security advisor (2026-09-18): the 36 `anon`-executable
  `SECURITY DEFINER` functions are exactly the public read contracts
  (`fantasy_*` reads, `football_*` reads, `news_*` reads,
  `username_availability`); every `api.*` function pins `search_path = ""`;
  all `service_*`, ingestion and admin worker functions are executable by
  neither `anon` nor `authenticated`; `rls_enabled_no_policy` (112 tables in
  `app` / `app_private`) is the intended deny-all posture behind the RPC
  surface. Nothing was removed.
- **Leaked-password protection is still disabled** (advisor WARN). It is a
  dashboard-only setting: Authentication → Providers → Email → "Prevent use of
  leaked passwords". Enable it before launch.
- Staging project `srdrflfrfpwixsllveid` is inactive; nothing was applied there.
- See `docs/qa/SECURITY_INCIDENT_2026_09_18_ESLINT_LOADER.md` for the
  malicious loader found in the repository during this pass.
