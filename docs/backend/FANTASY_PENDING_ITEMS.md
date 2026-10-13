# Fantasy: pending scoring items and the set-based points save

**Status:** in development on branch `claude/fantasy-pending-items-fast-save`. Nothing is
applied or deployed.

**Owner decisions** (2026-10-13; recorded in
`docs/audits/2026-10-13-fantasy-scoring-reliability/OWNER_DECISIONS.md` on branch
`claude/fantasy-scoring-reliability-audit`):

- **P2:** publish confirmed points; only the affected scoring item waits.
- **P4 and Q1:** minutes conflicts decide eligibility only when both versions agree.
- **P5:** own-goal events count, and a second yellow is handled for that player only.

This document is the brief that AGENTS.md "Screen work" rule 3 asks for. It is also the
shared contract between the parts of the change.

## What must be preserved

- Point values, ruleset rows, full/simple mode selection, the 12-hour cutoff and mode locks.
- Captaincy, vice-captaincy, automatic substitutions, chips and transfer hits.
- Unknown participation **never** triggers an automatic substitution or a vice-captain
  promotion. `pendingPlayerIds` keeps that protection.
- Unknown is never stored or shown as a confirmed zero.
- A gameweek **does not finalize** while any item is pending. The fallback rule (P6) is not
  built here.
- Replays and retries never duplicate points. A stale worker cannot overwrite a newer
  calculation.
- These stay strict (true contradictions):
  - the final score must agree with the database's score;
  - the goal incidents must add up to the score;
  - fixture links;
  - reviewed identities;
  - dated memberships;
  - 11 starters a side.
- The visual identity and every business rule are unchanged.

## Improvements

1. **Set-based points save.** `api.service_persist_fantasy_scoring_results` produces the same
   rows and totals as today without the per-row rescans. The base is PR #452's migration
   20261012174642 (branch `codex/gw3-scoring-save-set-based`), reviewed and ported. The
   timestamp is new, because #452 is unmerged.
2. **One local doubt no longer holds the whole match.** Uncertain facts become `unknown` on
   the affected player's row. Every other fact counts.
3. **Per-item pending.** A category whose facts are unknown is _pending_ for that player and
   fixture. It is not absent and not zero. The fixture itself publishes.
4. **The app shows pending items as pending**, never as 0, and labels totals that still have
   pending items.

## Contract

### C1. Observation rows (SofaScore builder → SQL wrapper and recorder)

Everything below is additive. Rows without the new keys mean exactly what they mean today.

#### Event order

- Order events by `(minute, addedMinutes ?? 0)`.
- A goal and a substitution or sending-off are ambiguous only when **both** numbers are equal.
- An ambiguous goal makes `goalsConceded` and `cleanSheet` `unknown` for the players changed
  at that moment. It does not hold the match.
- Exception: a player whose minutes are under 60 in every version cannot have kept a clean
  sheet, so his `cleanSheet` is verified `false` (no reason); only `goalsConceded` stays
  `unknown`. A pending item must exist only when resolving it could change points.

#### Minutes: two versions

- **Version S:** SofaScore `minutesPlayed`, capped to 1–90.
- **Version T:** the substitution and sending-off timeline.
- **Agree:** S and T are on the same side of 60 (both under 60, or both 60 or more).
  - `stats.minutes` = S, verified. This is the owner decision of 2026-10-13.
  - Within the existing −2/+6 tolerance the timeline value is used; beyond it S, as decided
    2026-10-13.
- **Straddle:** one is under 60 and the other is 60 or more.
  - `stats.minutes` = the lower value, verified.
  - The row carries `pendingItems: [{ "category": "appearance", "reason": "minutes_conflict" }]`.
  - The appearance event is scored at the confirmed (short) value, and the item is shown as
    pending a possible upgrade.
- **`cleanSheet`:** work it out under both versions: at least 60 minutes, and no goal
  conceded while on the pitch during that version's window.
  - A version under 60 minutes is `false` whatever the goals.
  - Same answer under both → verified.
  - Different answers → `unknown`.
- **`goalsConceded`:** verified only when both windows give the same count **and** the minutes
  agree, or the count is 0. Otherwise it is `unknown`.
- **No `minutesPlayed`:** only T exists, so nothing conflicts.
- **A substitute with minutes but no substitution incident** (previously
  `appearance_unexplained`):
  - his `minutes` is `unknown`, which means his participation is unknown, so he goes into
    `pendingPlayerIds`;
  - every other player is unaffected.

#### Cards

- **A player with a `card/yellowRed` incident:**
  - `secondYellowDismissals` = 1;
  - `yellowCards` = 0, whether or not his first yellow is also listed;
  - `redCards` = 0;
  - total −3, as published.
- **Contradictions** make that player's three card fields `unknown`. Examples:
  - two plain yellows and no `yellowRed`;
  - a `yellowRed` together with a direct `red`.
- **The second-yellow match hold is removed.**

#### Own goals

- **Recognising the event:** `goal/ownGoal` is an own goal by the named player.
- **Sides:**
  - the conceding side is the named player's lineup side;
  - the goal counts for the other side;
  - `isHome` is not relied on.
- **Effects:**
  - the player's `ownGoals` is his own-goal events;
  - the goal is in his side's goals conceded.
- **Contradictions:**
  - an own-goal event that names no player, or a player not in the lineup, keeps the hold;
  - a lineup `ownGoals` that disagrees with that player's events makes his `ownGoals`
    `unknown`.
- **Still strict:** the goals must add up to the score.

#### Unknown evidence

- An `unknown` field may carry `evidence.reason`. It is one of:
  - `timeline_same_moment`;
  - `minutes_conflict`;
  - `card_conflict`;
  - `own_goal_conflict`;
  - `participation_unexplained`;
  - `provider_absent`.

#### Parsing (F2)

- A field that is never scored (`rating`, `position`, names, `incidentClass` on incidents
  that are not score-relevant) is treated as absent when it is `null` or has the wrong type.
  This is reported in diagnostics and never thrown.
- Any field that is scored is still strictly typed.
- An unplaced incident that is not score-relevant is dropped with a diagnostic.

### C2. Recorder readiness (SQL)

- **`simple_ready`** now means the fixture-level facts are established:
  - the score;
  - starters;
  - memberships;
  - goals add up;
  - the completeness flags;
  - every Fantasy-lineup player resolved.

  It **no longer** requires every row's core fields to be certified.

- **`full_ready`** is unchanged. It requires everything verified.
- **New:** the observation stores a `pending_items` count. It counts the core fields that are
  `unknown` (per row, per category) plus the rows' `pendingItems`.
- **Consistency checks** (for example, the clean sheet against the 60-minute rule) apply only
  when every field involved is known.

### C3. Scoring snapshot, scorer and persist

- **Category dependencies** (TypeScript `categoryFields` and the SQL list in persist, kept
  identical):

  | Category         | Depends on                                                                                 |
  | ---------------- | ------------------------------------------------------------------------------------------ |
  | `appearance`     | `minutes`                                                                                  |
  | `clean_sheet`    | `minutes`, `cleanSheet` (the builder certifies `cleanSheet` only when both versions agree) |
  | `goals_conceded` | `minutes`, `goalsConceded`                                                                 |

  The others are unchanged.

- **Each `playerFixtures` entry** gets `pendingCategories: string[]`, sorted. It lists:
  - the categories in the locked mode's scope whose fields are not scorable;
  - plus the categories in the row's `pendingItems`.
- **A pending category emits no event,** except `appearance` with a `pendingItems` upgrade,
  which emits its confirmed value.
- **Out of scope versus pending:** simple-mode excluded categories (assist, saves,
  penalty_save, penalty_miss) are **not** pending. They are "not counted".
- **`pendingPlayerIds`** behaves as today: the player's participation is unknown.
- **Finalization:** `service_begin_fantasy_finalization` refuses with
  `fantasy_pending_items_unresolved` while any counted fixture's snapshot entry has a
  non-empty `pendingCategories`.

### C4. Read contract (database → app)

- **`api.get_my_fantasy_points`:** each player gains
  `pendingItems: [{ fixtureId, category, reason }]` (empty when none) and
  `pointsStatus: "final" | "provisional" | "pending"`:
  - `pending`: no confirmed points row, and his fixture or participation is pending;
  - `provisional`: points exist and either the gameweek is not final or he has pending items;
  - `final`: neither.
- **The team result** gains `pendingItemCount`.
- **`api.fantasy_player_gameweek_history`:** per gameweek, the same `pendingItems` for that
  player.

### C5. App

- **A player with `pointsStatus` `pending`** shows "—" with the label:
  - French: "En attente";
  - Arabic: "قيد الانتظار".

  Never "0".

- **The breakdown** lists each pending item by category name with the badge:
  - French: "En attente de confirmation";
  - Arabic: "بانتظار التأكيد".

  An appearance with a pending upgrade also shows "peut passer à 2 pts" / "قد ترتفع إلى نقطتين".

- **A total with `pendingItemCount` > 0** keeps "Provisoire" / "مبدئية" and adds:
  - French: "N élément(s) en attente";
  - Arabic: "N عنصر قيد الانتظار".

## Acceptance criteria

### Functional

- **Set-based save:** identical rows and totals to the current function on the existing pgTAP
  scenarios and on a 4,000-row synthetic gameweek. It runs in under 2 s locally. Replaying the
  same input changes nothing. A different payload under the same version gives
  `fantasy_scoring_replay_conflict`.
- **Builder** reproductions (from the audit's `repro/builder.repro.test.ts`): each case now
  produces a request, with only the named players' named fields unknown. These cases are:
  - stoppage time;
  - a same-minute goal and substitution;
  - a second yellow;
  - an own goal;
  - a clean sheet across a minutes conflict;
  - a `null` rating, `null` position or `null` incident class.
- **Still held:**
  - goals that do not add up;
  - a score mismatch;
  - an unmapped scorer;
  - an own goal that names no player;
  - three unknown starters on one side.
- **Points:** a fixture with one player's clean sheet pending publishes every other point. The
  player's other categories publish. The gameweek does not finalize.
- **Participation:** an unknown-participation player still blocks automatic substitutions and
  vice-captain promotion in the lineups that hold him, and nowhere else.

### Visual (French and Arabic, mobile and desktop)

- No pending item renders as 0.
- The labels are present and right-to-left layout is correct.
- There are before/after screenshots.

### Measured

All existing related bun and pgTAP suites pass on an isolated local database.
