# BotolaGO Fantasy Ruleset v1.0

## Status

This is the approved, immutable launch ruleset for BotolaGO Fantasy V2. The
database code is `botolago-fantasy-v1.0`, major version `1`, minor version `0`.
Future changes require a newly published ruleset version; historical seasons
must never be edited in place.

## Squad and formation

- initial budget: `100.0`;
- squad size: `15` (`2 GK`, `5 DEF`, `5 MID`, `3 FWD`);
- maximum players from one canonical Football team: `3`;
- starting XI: exactly `11`, with `1 GK`, `3–5 DEF`, `2–5 MID`, and `1–3 FWD`;
- exactly one captain and one distinct vice-captain;
- substitutes have an explicit order and goalkeeper substitution remains
  position-specific.

## Deadlines and transfers

- deadline: 90 minutes before the first fixture assigned to the gameweek;
- the database clock is authoritative and there is no grace period;
- one free transfer is granted per ordinary transition, with a maximum of two;
- each transfer beyond the available allowance costs four points;
- Wildcard and Free Hit transfers do not incur hits;
- the first gameweek after Wildcard or Free Hit starts with one free transfer;
- transfer application is atomic, idempotent, and uses the server sale price.

The sale price grants half of a price rise, rounded down in `0.2` increments:
purchase price plus `floor((current - purchase) / 0.2) * 0.1`; a loss uses the
current price.

## Scoring

| Event                                   |  GK | DEF | MID | FWD |
| --------------------------------------- | --: | --: | --: | --: |
| Appearance under 60 official minutes    |   1 |   1 |   1 |   1 |
| Appearance at least 60 official minutes |   2 |   2 |   2 |   2 |
| Goal                                    |  10 |   6 |   5 |   4 |
| Official assist                         |   3 |   3 |   3 |   3 |
| Clean sheet                             |   4 |   4 |   1 |   0 |
| Every three goalkeeper saves            |   1 |   — |   — |   — |
| Penalty save                            |   5 |   — |   — |   — |
| Every two goals conceded                |  -1 |  -1 |   0 |   0 |
| Penalty miss                            |  -2 |  -2 |  -2 |  -2 |
| Yellow card                             |  -1 |  -1 |  -1 |  -1 |
| Direct red card                         |  -3 |  -3 |  -3 |  -3 |
| Second-yellow dismissal, total          |  -3 |  -3 |  -3 |  -3 |
| Own goal                                |  -2 |  -2 |  -2 |  -2 |

Only official provider minutes and official assists are accepted. Bonus and
player-of-the-match categories are disabled in v1.0. Double-gameweek points
aggregate every assigned fixture.

The captain multiplier is two; Triple Captain is three. A vice-captain is
promoted only when the captain records zero total official minutes. Automatic
substitutions apply only to zero-minute players, preserve a valid formation,
and follow bench order. Bench Boost includes all bench points.

## Chips

- one chip may be active in a gameweek;
- activation is non-cancellable after confirmation;
- Wildcard allocation 1 is valid in gameweeks 1–15;
- Wildcard allocation 2 is valid in gameweeks 16 through the final gameweek;
- Free Hit, Bench Boost, and Triple Captain are each available once;
- for a season shorter than 30 gameweeks, the published season midpoint is the
  split and is stored explicitly.

Chip use is deadline-safe and idempotent. Free Hit captures its original squad
once and restoration is independently idempotent.

## Price movement

- initial range: `4.0–12.5`;
- absolute range: `3.5–15.0`;
- movement step: `0.1`, capped at `0.2` per run;
- demand threshold is the greater of 250 net transfers and the configured
  percentage of active Fantasy teams;
- a net movement of at least `+3%`/`-3%` changes the price by `0.1`;
- a net movement of at least `+8%`/`-8%` changes the price by `0.2`.

Workers calculate demand from confirmed transfer data and use a source version
so retries cannot apply a movement twice.

## Exceptional fixtures and corrections

Fixture assignment is frozen at the gameweek deadline. A fixture completed
within 48 hours of its original assignment remains in that gameweek; later
completion moves to a controlled future assignment. Replays scored from the
beginning replace, rather than duplicate, the abandoned attempt. Unresolved
fixtures keep affected results provisional. The ordinary correction window is
72 hours after finalization, with a new calculation version and audit record.

## Rankings

Ranking order is deterministic:

1. total points descending;
2. accumulated transfer-hit points ascending;
3. confirmed transfers ascending;
4. latest finalized gameweek score descending;
5. Fantasy-team creation timestamp ascending;
6. Fantasy-team UUID ascending.

No rank is returned until the ranking worker has calculated it. Fixture
difficulty ratings are disabled in v1.0.

## Player statistics presentation (BG-0071)

The three numbers a manager reads when picking — total points, form, and
ownership — are _presentation_ of scored data, not scoring rules. They are
computed at read time and are deliberately **not** part of the immutable
ruleset: changing any of them is a forward migration, never a ruleset version
bump. Two read RPCs own them, and nothing else may recompute them (the browser
in particular must not: the database is the scoring authority).

```
api.fantasy_player_season_stats(p_season_id uuid, p_through_gameweek_id uuid default null) returns jsonb
api.fantasy_player_gameweek_history(p_fantasy_player_id uuid) returns jsonb
```

Both are `stable security definer set search_path = ''` and are executable by
`anon` as well as `authenticated`: `/fantasy/players` is a public route. Both
signatures take `uuid` only. That is not a stylistic choice — an argument is
coerced to its parameter type in the _caller's_ context before a `SECURITY
DEFINER` body is entered, so naming an `app`-schema enum or domain in a public
signature demands `USAGE` on `app`, which `anon` does not hold and must not be
given. See BG-0063 and `20260921120000_fantasy_leagues_anon_callable_signature`.
Unknown ids answer `PGRST` / HTTP 404 with `PT404`, not 500.

### A "scored" gameweek

A gameweek counts once the scoring worker has written points for it:
`status in ('provisional', 'finalizing', 'finalized', 'corrected')`. `live` is
excluded — points are still moving inside a match — and so is `open`, even if
the worker has staged rows. `corrected` is included deliberately: dropping it
would erase a gameweek from every total the moment a correction landed.

### Total points

Sum of `coalesce(final_points, provisional_points)` over the player's rows in
scored gameweeks. Provisional points are shown, not hidden; managers expect
live-ish numbers, and the History tab's `state` field is what tells them a
number can still move.

### Form

Form is the FPL convention, which is what every screen is modelled on:

> the mean points per gameweek over the **last 5 scored gameweeks of the
> season**, to one decimal.

Three consequences the frontend depends on:

- **The window belongs to the season, not to the player.** The same five
  gameweeks are averaged for everyone. A player with no points row in one of
  them contributes `0` for that gameweek, exactly as a non-appearance does in
  FPL. A player whose only good score is older than the window therefore reads
  `0.0`, which is correct: his form is gone.
- **Fewer than 5 scored gameweeks → divide by what exists.** With three scored
  gameweeks the denominator is 3, never 5. Early-season form is not damped
  towards zero by gameweeks that have not happened.
- **Zero scored gameweeks → `null`, never `0.0`.** This is the only case that
  may be null, and it is the one the UI renders as a dash (`fantasy.stat.none`).
  "Nothing has scored yet" and "this player has genuinely averaged 0.0" are
  different facts and must not look the same to a manager. Any consumer that
  coalesces this null to 0 reintroduces the defect BG-0071 exists to fix.

The window size is a constant in the function body (`form_window := 5`), not a
ruleset column. Moving to last-3 for the shorter 30-gameweek Botola season is a
one-line forward migration and does not invalidate a season's scoring.

The payload reports `formWindow` and `scoredGameweeksInWindow` so a client can
label the number ("form over 3 gameweeks") without guessing.

### Ownership

Ownership is **derived at read time** and has no stored counter:

- numerator `ownershipCount` — live squad memberships
  (`app.fantasy_squad_memberships` with `sold_at is null`) whose
  `app.fantasy_teams` row is in this season and `status = 'active'`;
- denominator `activeTeamCount` — active teams in the season, the same
  population the price-movement worker counts;
- `ownershipPercent = round(count * 100 / activeTeamCount, 1)`, and `0` when
  `activeTeamCount = 0` rather than a division by zero.

Suspended and archived squads are out of both numerator and denominator. A
transfer out drops the player's ownership on the next read; nothing can drift,
because nothing is cached in a column.

`app.fantasy_players.selected_by_count` is **deprecated and must not be read.**
It was declared with a default of `0` and a `>= 0` check, exposed through
`api.fantasy_player_pool` as `selectedByCount`, and written by nothing — no RPC,
no trigger, no worker. In production all 539 rows were `0` while 105 live squad
memberships existed. BG-0071 comments it as deprecated but does **not** drop it:
the column keeps its place in the `fantasy_player_pool` payload so that a
rollback of this release cannot lose a column and cannot disturb the 22
Playwright journeys pinned to that function's shape. The `DROP COLUMN` is a
separate, clearly-marked follow-up migration, to be applied only after the
frontend has stopped parsing `selectedByCount` as a required field.

### Gameweek history

`api.fantasy_player_gameweek_history` returns one entry per gameweek in which
the player has a points row, oldest first: `gameweekId`, `gameweekSequence`,
`gameweekName`, `points`, `minutesPlayed`, `didPlay`, `state`
(`provisional` | `final`, matching `api.fantasy_top_players`), and `opponents`.

`opponents` is an array, not a single club: a gameweek can legitimately carry
more than one fixture for a club after a reassignment. Only current assignments
(`superseded_at is null`) that `counts_points` are considered, and each entry
carries `teamId`, `shortName`, `name` and `home`. A gameweek with no assignment
yields an empty array, never null.
