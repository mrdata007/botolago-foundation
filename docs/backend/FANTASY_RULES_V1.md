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
