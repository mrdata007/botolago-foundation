# Brief: SofaScore players to confirm (admin screen)

Approved screen work (AGENTS.md, "Screen work"). Written after reading the
existing admin player-mappings screen (`src/routes/admin.football.player-mappings.tsx`,
`src/components/admin/player-mappings/`, the admin hub in
`src/backend/admin/admin-console-contracts.ts`) and before the first interface
change.

The backend already exists and is not touched here:
`api.admin_sofascore_player_match_queue()` and
`api.admin_resolve_sofascore_player_match(p_sofascore_player_id, p_player_id)`
(`supabase/migrations/20261011130000_sofascore_player_auto_map.sql`, section 5).
Today, confirming a player the automatic matcher could not match safely needs
SQL scripts run by the owner. This screen replaces that with one tap and one
confirmation, usable from a phone.

## What must be preserved

- The existing player-mappings screen, its route, its proposal / approval /
  execute flow, its copy and its tests. Nothing in
  `src/components/admin/player-mappings/` or
  `src/routes/admin.football.player-mappings.tsx` changes.
- The admin access model: the route loads its access server-side
  (`route-access.functions.ts`), renders through `AdminFunctionalRoute`, and the
  database re-checks every call (staff, AAL2, `football.read_operations` or
  `football.manage_mappings` to read; `football.manage_mappings` to confirm).
  The screen's `canManage` flag only decides what is drawn, never what is
  allowed.
- Design system V2: kit primitives and `ui.*` tokens, logical properties only,
  44px tap targets, French and Arabic with RTL, plain admin look consistent with
  the other admin pages.
- Fantasy rules, scoring, the gameweek lifecycle and every other business rule.
  No database change, no migration, no script, no new table, nothing run
  against production or staging.
- Public editorial rule: no AI authorship notice anywhere on the screen.

## Improvements

1. A new admin page `/admin/football/sofascore-players`, linked from the admin
   hub navigation next to "Rapprochement joueurs", gated on
   `football.read_operations` like its sibling.
2. It lists the open queue: for each SofaScore player the matcher held, his
   name, shirt number, position, club and side, how often and since when he was
   seen, and a plain-language reason (FR and AR) for each of the seven reasons.
3. Each entry lists the BotolaGO candidates (name, position, shirt number). A
   person with `football.manage_mappings` taps "Confirmer ce joueur" on the
   right one, then confirms once more in a panel that names both players. On
   success the entry leaves the list and the message says the match will be
   retried automatically (within about 15 minutes).
4. A candidate already mapped to another SofaScore id is shown but cannot be
   selected, with the reason. An entry with no candidate (no_candidate,
   duplicate_name_in_squad) shows its explanation and no confirm button, and
   says plainly that adding a player to the app stays a staff job for now.
5. Every refusal code of the resolve function (`queue_entry_not_found`,
   `queue_entry_already_resolved`, `player_not_found`,
   `sofascore_mapping_conflict`, `invalid_resolution`, permission and
   authentication errors) has a plain FR and AR sentence. A malformed row from
   the queue is dropped, never crashes the page, and the page says how many were
   skipped.
6. A development-only sample route with invented data so the screen can be
   seen and tested without a login (same guard as `dev.player-mappings-sample`).

## Acceptance criteria

Functional

- A reader (read permission only) sees the list and every explanation but no
  confirm button; a manager sees the confirm buttons.
- Confirming needs two deliberate taps; cancelling leaves the entry unchanged.
- A candidate with `mappedToSofascoreId` set has no enabled confirm control and
  shows why. An entry with no candidate has no confirm control at all.
- A successful resolve removes the entry and shows the retry message; an
  `alreadyResolved: true` answer is reported as already done, also removing it.
  A refused resolve keeps the entry and shows the sentence for its code.
- Malformed queue rows are ignored without throwing; a malformed result from the
  resolve call is reported as an unavailable service, not as success.
- French and Arabic copy have the same keys and no empty value (test).

Visual

- At 390px and 1280px, in French and Arabic (`dir="rtl"`), no element extends
  beyond the viewport: measured from element bounding rects, not `scrollWidth`.
- Arabic is mirrored with logical properties; ids, shirt numbers and dates stay
  left-to-right data (`bdi` / `dir="ltr"`).
- Tap targets are at least 44px high; text wraps instead of truncating names.

Validation: the repository's typecheck, lint, format check and unit/SSR tests
pass; before/after screenshots (the "before" is the sibling player-mappings
sample, since this screen is new) at both widths in both languages.
