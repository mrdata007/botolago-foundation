# Manager Card and the rating points: proposal

Status: **approved, implemented on branch `claude/manager-card-percentile`.**
Written 2026-10-14 against `origin/main` `45e99f4` as a proposal. The owner
chose option A on 2026-10-14 (decisions in section 6). Built as migration
`20261014160000_manager_card_gameweek_percentile`, rules v4 and the guarded
script `scripts/backend/apply-manager-card-rules-v4-percentile.sql`; how to
install it is in `MANAGER_CARD_OPERATIONS_RUNBOOK.md`, "Rules v4". Section 7
says where the build differs from the text below.

Context: from Fantasy gameweek 5 of 2026/27 a player's points for a match are
his SofaScore rating rounded half up, 5 when he appeared without a rating, 0
when he did not appear (`FANTASY_RATING_POINTS.md`). GW1-4 keep the category
scale (`FANTASY_RULES_V1.md`). The Manager Card (`MANAGER_CARD_OPERATIONS_RUNBOOK.md`,
rules v3 "week one") was calibrated on category-scale points. Its risk list
already says: "Its figures will shift from GW5. Recalibrating is a follow-up."
This is that follow-up.

## In short (for the owner)

- **If nothing is done**, from GW5 almost every card climbs, and keeps climbing
  all season, because the new points make two of the four stats (CAP and SEL)
  much easier to score high on. That is not because managers got better. In the
  simulation below, the average Curva rating goes from about 51 to about 62 by
  the end of the season. The LASTREET tier empties (39% of cards to 0.1%), and a
  quarter of cards reach PRO.
- **The notifications would say the wrong thing.** In a normal week about as
  many cards go up as down (43% / 43%). At GW5 about 70% would get "Votre note
  Curva monte" and 16% "descend". The upward lean lasts for weeks (59% up at GW6,
  55% at GW7).
- **Recommended fix (option A):** score each week's captain, eleven and
  transfers by **where the manager ranks among all managers that week**,
  instead of by raw points. Consistency (CON) already works this way. A good
  captain choice then counts the same whether points come from goals or from
  ratings. Cards move by about the same amount up and down at GW5, as in any
  other week, and the scale does not need recalibrating again for any future
  change to how points are awarded. This needs a small code change (one database
  function, a new rules version 4 and its guarded owner script), not just a
  settings change.
- **Until it ships:** switch the card's calculation off (one line, below) once
  GW4's cards are done. Cards stay as they are, and nobody sees anything
  different, because a card only moves when a gameweek is locked, and GW5 locks
  1 to 3 weeks after its matches (the SofaScore wait). Then switch it back on
  with version 4.
- **Your decisions:** (1) option A, B or C; (2) whether to pause the calculation
  now; (3) whether you are fine with the stats meaning "how you rank against
  other managers that week" instead of "a fixed share of the best possible"
  (the decision of 2026-10-08 chose fixed meanings because there were only 7
  teams then).

## 1. What the card reads, and which part depends on point sizes

Every stat is an average over the manager's finished gameweeks of one figure per
week (per transfer for TRF). Each average is then mapped onto 1-99 by the
rules' `scales`, pulled toward 50 by the shrinkage (k = 4). OVR is the rounded
mean of the four, and the tier comes from OVR and the `tiers` cut-offs
(`app_private.manager_card_evaluate_gameweek`, body of
`20261012200100_manager_card_week_one.sql`). The rules v3 row:
`cap [[0,1],[1,99]]`, `sel [[0.5,1],[0.8,50],[1,99]]`,
`trf [[-10,1],[0,50],[10,99]]`, `con [[0,1],[1,99]]`, tiers STADE 50, PRO 65,
CHAMPION 80, LEGEND 90 (below 50 is `homa`, shown as LASTREET).

| Stat | Weekly figure (exact)                                                                                                                                       | Kind                                      | What rating points do to it                                                                                                                                                                                                                                                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CAP  | effective captain's points / best picked starter's points (captain, else vice if the captain did not play; skipped when no captain played or the best is 0) | ratio of two point totals                 | **Inflates strongly.** Old points: a quiet captain gets 2 next to a 10-point haul (0.2). Ratings: 7 next to 9 (0.78). The ratio has no fixed meaning once the floor moves from about 1-2 to about 6. Simulated weekly mean: 0.47 old, **0.88** rating. Scale `[0,1]->[1,99]` turns that into roughly +40 on the stat.                                             |
| SEL  | points of the eleven picked / best legal eleven of the fifteen (Bench Boost weeks skipped)                                                                  | ratio                                     | **Inflates.** Every player who played scores 5-10, so the picked eleven is nearly as good as the best one unless a starter did not play. Mean 0.80 old, **0.86** rating, on a scale whose middle point is 0.8.                                                                                                                                                    |
| TRF  | per transfer: sum over a 3-gameweek window of (player in's points - player out's points) - hit / transfers in the batch                                     | **raw points**                            | **Changes meaning but hardly moves on average.** Form-chasing gains shrink (a goal is no longer +5), and selling a player who stopped playing becomes worth about +6.5 a week instead of about +2. The two effects roughly cancel on spread (sd 7.2 old, 8.2 rating). A 4-point hit is now worth less than one appearance. Windows across GW5 mix the two scales. |
| CON  | 1 if the team is in the top half of all active teams that week, else 0 (`rank() - 1` teams above, `above * 2 < n`)                                          | **rank** (does not depend on point sizes) | **Almost unaffected.** One side effect: team totals become close integers (sd about 5 on about 80, against 10 on about 42), so ties are common, and a team tied across the middle counts as top half. Weekly top-half share 52% old, **55-56%** rating, so CON creeps up by about 3 over the season.                                                              |

Everything after the weekly figures (shrinkage, OVR, tiers, provisional flag)
is rule-blind. So the damage comes from two places: CAP and SEL compare raw
point totals whose floor moved, and the fixed scales were drawn for the old
spread.

### Mixing GW1-4 with GW5+

The averages are plain averages across weeks. One `scales` row applies to the
whole season, and there is no per-week scale. So for the rest of the season a
card's CAP and SEL average blend old-scale weeks (around 0.47 / 0.80) with
rating weeks (around 0.88 / 0.86), and the blend drifts toward the rating
values as weeks accumulate. This is why the inflation is **gradual and keeps
going**, not a one-off step. It is also why a constants-only recalibration
(option B) cannot be right for both kinds of week at once.

### Rating-change notifications and trends

A change is recorded, and notified, when this week's OVR differs from the
previous week's under the same rules version (`mc_chg` in the evaluate
function). The notification goes out only for the season's latest finished
gameweek, and only if `notify_ovr_changes` is on. The in-app animation
(`card.ovrChanges`) plays even with the notification off. Under inflation, most
changes point upward, so most managers get "monte" whatever they did. The
history chart (`app.manager_card_gameweeks`) shows every line rising from GW5.

A new rules version recomputes every finished gameweek **silently**: rows still
under the old version record no change. That is what makes options A and B
deployable without a flood of notifications.

## 2. Simulation

A Bun/TypeScript model (session scratchpad `mcard/sim.ts`, not committed; it
can be added on request) builds one synthetic Botola season: 16 clubs, 320
players with quality, roles (regular, rotation, back-up keeper) and injuries,
and 30 gameweeks of Poisson matches with goals, assists, clean sheets, saves,
cards and own goals. It also builds 2,000 managers, each with a hidden skill,
who pick 15-man squads (2/5/5/3, at most 3 per club), an eleven in a legal
formation, a captain and vice, and 0-2 transfers a week (a 4-point hit on the
second). Each player-match is scored **twice from the same events**: under the
v1 category table, and as a SofaScore-like rating (mean 6.6, sd about 0.6,
bumped by goals, assists and clean sheets; short substitute appearances often
unrated, so 5), rounded half up. Managers' choices do not depend on the scoring,
so every difference is the scoring rule alone. The card is then computed
exactly as the evaluate function does under rules v3 (ratios, the TRF window
and its readiness, top half with `rank()`, the scales, k = 4 shrinkage, neutral
50 for an empty stat, OVR, tiers).

Points per player-match when he appeared:

| Rule     | Mean | sd   | 5th-95th pct | Range  | Most common                      |
| -------- | ---- | ---- | ------------ | ------ | -------------------------------- |
| Category | 2.68 | 2.37 | 1 to 7       | -3..18 | 1 (35%), 2 (30%), 6 (11%)        |
| Rating   | 6.48 | 0.78 | 5 to 8       | 4..10  | 6 (42%), 7 (41%), 5 (9%), 8 (7%) |

Team weekly score: 41.7 ± 10.0 (category) against 80.8 ± 5.1 (rating). The
spread relative to the mean drops from 0.24 to 0.06.

### Cards under today's rules v3 (seed 7, 2,000 managers)

| Scenario                         | GW  | OVR mean | p10-p90 | CAP  | SEL  | TRF  | CON  | LASTREET / STADE / PRO |
| -------------------------------- | --- | -------- | ------- | ---- | ---- | ---- | ---- | ---------------------- |
| Category points all season       | 4   | 50.8     | 45-57   | 49.5 | 51.6 | 50.5 | 51.3 | 39.0 / 61.0 / 0.1      |
| (reference: no rule change)      | 30  | 50.2     | 46-55   | 47.6 | 50.0 | 51.0 | 51.9 | 42.3 / 57.7 / 0.0      |
| **Do nothing** (rating from GW5) | 5   | 52.5     | 47-58   | 53.9 | 53.7 | 50.8 | 51.0 | 26.7 / 73.1 / 0.2      |
|                                  | 6   | 53.6     | 48-60   | 57.0 | 54.5 | 51.2 | 51.1 | 19.3 / 80.3 / 0.5      |
|                                  | 10  | 56.7     | 51-62   | 65.1 | 56.7 | 52.1 | 52.3 | 4.6 / 91.2 / 4.2       |
|                                  | 20  | 59.9     | 55-65   | 74.5 | 58.8 | 52.1 | 53.7 | 0.7 / 87.0 / 12.3      |
|                                  | 30  | 61.7     | 57-66   | 78.3 | 60.9 | 52.4 | 54.6 | 0.1 / 75.8 / 24.1      |

Week-to-week movement, which is what the notifications and the animation report:

| Scenario                   | Week     | Up        | Down      | Tier up   | Tier down |
| -------------------------- | -------- | --------- | --------- | --------- | --------- |
| Category points all season | GW4->GW5 | 42.8%     | 43.0%     | 9.2%      | 8.7%      |
| **Do nothing**             | GW4->GW5 | **68.8%** | **15.7%** | **14.4%** | 1.9%      |
|                            | GW5->GW6 | 59.1%     | 22.1%     | 10.0%     | 2.3%      |
|                            | GW6->GW7 | 54.6%     | 28.3%     | 8.1%      | 1.9%      |

A second run (seed 11, 1,000 managers) gives the same picture: GW4->GW5 72.6%
up / 14.6% down, OVR mean 61.7 at GW30, PRO 25.1%.

**What is synthetic and what is not.** The direction and rough size of the
CAP/SEL inflation follow from the arithmetic (the floor moving from about 1-2 to
about 6) and do not depend on the model's details. The tier shares do depend on
them. In this model nobody reaches PRO under the category rule, because the
modelled skill spread is modest and k = 4 shrinkage plus averaging four stats
compresses OVR. Real tier shares must be read from production (the runbook's
aggregate health query `select tier, provisional, count(*) from
app.manager_card_seasons group by 1, 2`, owner-authorised). No production data
was read for this proposal.

## 3. Options

### Option A: rank each week among managers (per-gameweek percentile). Recommended.

Turn each weekly figure into the manager's **percentile among the cohort of
that week** before averaging. CAP and SEL use all teams rated that week. TRF
uses all transfers made for the same gameweek, so they share the same 3-week
window and the same mix of scales. CON stays as it is (it is already a rank),
with one tie fix. The scales for CAP, SEL and TRF become `[[0,1],[0.5,50],[1,99]]`:
the median manager of the week sits at 50.

Simulation, same world, same tiers as v3:

| Scenario                     | GW  | OVR mean | p10-p90 | CAP  | SEL  | TRF  | CON  | LASTREET / STADE |
| ---------------------------- | --- | -------- | ------- | ---- | ---- | ---- | ---- | ---------------- |
| A, rating from GW5           | 4   | 50.6     | 45-57   | 50.2 | 50.2 | 50.0 | 51.3 | 40.8 / 59.3      |
|                              | 5   | 50.4     | 44-56   | 50.0 | 50.0 | 50.0 | 51.0 | 42.8 / 57.1      |
|                              | 10  | 50.8     | 45-57   | 50.0 | 50.0 | 50.2 | 52.3 | 38.9 / 61.1      |
|                              | 30  | 51.3     | 46-56   | 50.0 | 50.0 | 50.1 | 54.6 | 31.1 / 69.0      |
| A, category points all along | 30  | 50.6     | 47-55   | 50.0 | 50.0 | 50.1 | 51.9 | 36.4 / 63.6      |

GW4->GW5 movement under A: **38.8% up, 44.5% down**, tier up 6.2%, tier down
8.2%. That is the same as any ordinary week (category points all along under A:
42.1% / 44.3%). Activating A recomputes GW1-4 silently. Against today's v3
cards at GW4, the mean change is -0.2, the mean absolute change 0.7 and the
95th percentile 2. 5.6% of cards change tier, almost all at the LASTREET/STADE
line at 50. If GW5 had already been evaluated under v3 before A arrives, A pulls
GW5 back down by about 2 on average, silently. The CON column still creeps up
(+2.7 by GW30) through ties. The tie fix below removes that and was not
simulated.

- **Pros:** the scale does not depend on the scoring rule, so it fixes GW5 and
  any future scoring change for good. GW1-4 and GW5+ are comparable within one
  average. No constants have to be invented before real rating data exists.
  The runbook forbids invented scales, and here the stat scales follow from
  their meaning (50 = the week's median manager). Tier cut-offs can be
  calibrated from GW1-4 real data and stay valid after GW5. Week-to-week
  movement stays balanced, so the notifications stay honest.
- **Cons:** the stats become relative ("better than 70% of managers at
  captaincy this week") rather than absolute ("your captain scored 70% of your
  best starter"). That reverses the owner's 2026-10-08 choice of fixed
  "by meaning" scales. With very few managers in a week the percentile is
  coarse (steps of 1/(n-1)). Below about 20 teams a week it is noisy, but the
  average over weeks and the shrinkage smooth it. A manager's old-week
  percentile can shift slightly when teams leave the cohort (the card already
  recomputes everything each time, so this is consistent, but it is a new kind
  of small movement). Raw columns (`cap_raw` and the others) then hold average
  percentiles. No API returns them, but the calibration dry run reads them.
- **Effort:** about 1.5-2 days of agent work plus review and CI: one migration
  replacing `app_private.manager_card_evaluate_gameweek`, a pgTAP test, a
  guarded owner script for rules v4, its script test, and the runbook section.
  It follows the v2 and v3 pattern exactly. No UI or copy change: the stat
  labels ("Vos capitaines", "Votre onze de départ", "Vos transferts", "Votre
  régularité") still describe what is measured.
- **What the owner sees:** after activation, cards barely move (a silent
  recompute, about ±1). From then on cards move as usual, about as many up as
  down. No PRO/CHAMPION inflation over the season.

### Option B: rules v4 with recalibrated constants (no code)

Insert rules v4 with new `scales` fitted to rating points. This is the only
option that needs no code, so a guarded script is a copy of
`apply-manager-card-rules-v3-week-one.sql`'s rules part with a new JSON.

To illustrate, scales were fitted on synthetic data by matching quantiles: a
pure-rating season under v4 gives the score distribution that v3 gives a
category season at GW10. They came out as
`cap [[0.793,27],[0.831,35],[0.871,48],[0.913,62],[0.942,71]]`,
`sel [[0.788,36],[0.823,42],[0.863,50],[0.899,60],[0.919,68]]`,
`trf [[-7.25,16],[-3.2,33],[0.8,52],[5.5,73],[9.5,91]]`. Applied to the real
mixed season:

| GW  | OVR mean | CAP  | SEL  | LASTREET / STADE |
| --- | -------- | ---- | ---- | ---------------- |
| 4   | 46.9     | 39.3 | 46.1 | 75.2 / 24.9      |
| 10  | 46.3     | 34.8 | 46.8 | 78.5 / 21.5      |
| 30  | 47.8     | 37.5 | 48.0 | 65.6 / 34.4      |

The silent recompute at activation drops GW4 cards by 3.9 on average and moves
36% of cards down a tier. The old-scale weeks keep dragging CAP down all season,
because one scale cannot fit both kinds of week.

- **Pros:** no code, an established owner-script pattern, about an hour of work
  once the numbers exist.
- **Cons:** the constants must come from **real** rating gameweeks (the runbook
  forbids invented scales). That means waiting for about 3 locked rating weeks,
  around GW8 given the SofaScore wait, with inflated
  cards or a frozen card until then. The GW1-4 contamination never goes away
  (above). The CAP scale becomes very steep (the whole range in 0.79-0.94), so
  small differences swing the stat. Every future scoring change repeats all of
  this.
- **What the owner sees:** either a frozen card until about GW8, or about three
  weeks of inflation. Then a silent drop at activation (about a third of cards
  lose a tier) and a CAP stat that sits low all season.

No v4 script is drafted, because B is not recommended. If the owner chooses it,
the script is the v3 script's rules part with the calibrated JSON, the guard
"exactly three rules rows, v3 active", and "v4 differs from v3 only in
`scales`".

### Option C: rebase at GW5 (card counts only GW5 onward)

Add a rules key such as `count_from_gameweek: 5`, so the card ignores GW1-4.
Then calibrate the scales for rating points as in B.

- **Pros:** no mixing. Under the new rule alone, the card's meaning is clean.
- **Cons:** needs code (about the same size as A) **and** B's real-data
  calibration (so the same wait). It throws away four weeks of every manager's
  history. Week-one shrinkage puts every card back near 50 at GW5, so good
  managers fall and weak ones rise: a mass movement, silent only because it
  comes with a new version. It repeats at every future scoring change.
- **What the owner sees:** at GW5 (or whenever v4 lands) every card resets
  toward 50. GW1-4 disappear from the card's history.

### Not an option on its own: switching notifications off

`select app_private.manager_card_notify_configure(false);` stops the messages
but not the inflation or the in-app "up" animation. It is useful only as an
extra safety while deciding.

## 4. Recommendation

**Option A**, with the calculation paused from now until it is applied.

1. **Now (owner, one line, no code):** once GW4's cards are evaluated (the job
   log shows `evaluated` for GW4 with `morePending: false`), switch compute
   off and leave reads alone. First note what it was:
   ```sql
   select compute_enabled, read_enabled, notify_ovr_changes from app_private.manager_card_settings;
   select app_private.manager_card_configure(false, null);
   ```
   Cards keep showing GW4's figures, and that is all they would show anyway
   until GW5 locks (gameweek lock waits for SofaScore's full statistics, 5-21
   days after the matches; `SOFASCORE_STAGED_STATS.md`). The ops health check
   `manager_card` reports **warn** ("reads on and compute off") while paused.
   That is expected, and it does not page. A GW1-4 correction made meanwhile
   reaches the cards when compute is back on.
2. **Build A** on a feature branch (spec below), and let CI `database-quality` pass.
3. **Apply** through its guarded script, with the card's writers paused (they
   are already). Then switch compute back on. The tick recomputes GW1-4 under
   v4 silently. If GW5 locked meanwhile, GW5 is evaluated under v4 and its
   change is recorded and notified like any normal week. This is correct,
   because GW4 and GW5 are now under the same version and GW5 has no earlier
   row.

If the pause is not wanted, the cost of letting GW5 run under v3 first is
bounded. Most managers get a misleading "monte" for GW5 (about 70%). A's
activation later pulls the cards back down by about 2, silently.

## 5. Option A in detail (to build after the owner's go)

### Migration `<new unique timestamp>_manager_card_gameweek_percentile.sql`

Replaces `app_private.manager_card_evaluate_gameweek(uuid, integer)` (current
body: `20261012200100`). Same signature, owner, `security definer`, empty
`search_path` and grants. One new optional rules key:

- `"normalize"`: `"none"` (the default when absent) or `"gameweek_percentile"`.
  Anything else raises `manager_card_rules_invalid`. **Absent means exactly
  today's figures**: v1, v2 and v3 rows must give identical output (pgTAP
  asserts it, as `manager_card_week_one.test.sql` does for v3).

With `gameweek_percentile`, between the existing temp tables and `mc_fig`:

- **CAP:** a new `mc_cap` column (or a `mc_cap_n` table) with the mid-rank
  percentile of `ratio` among the rows of the same `gameweek_id` whose `ratio`
  is not null:
  ```sql
  case
    when ratio is null then null
    when count(ratio) over (partition by gameweek_id) <= 1 then 0.5
    else ((rank() over (partition by gameweek_id order by ratio) - 1)
          + (count(*) over (partition by gameweek_id, ratio) - 1) / 2.0)
         / (count(ratio) over (partition by gameweek_id) - 1)
  end
  ```
  Mid-rank, not `percent_rank()`, because ties are frequent with rating points
  (many captains are the best starter, ratio 1). `percent_rank()`
  would put all of them at the bottom of their tie. Skipped weeks (null ratio)
  stay skipped and keep counting nothing toward n.
- **SEL:** the same over `mc_sel.ratio` by `gameweek_id` (Bench Boost weeks
  remain absent).
- **TRF:** `mc_trf` gains the batch's `b_seq`, and the value becomes its
  mid-rank percentile among the ready transfers with the same `b_seq`. All of
  them share one window, so they become ready together. At the season's last
  gameweek a short window is still compared like with like.
- **CON tie fix:** the weekly value becomes 1 when the whole tie group is in the
  top half, 0 when it is wholly in the bottom half, and 0.5 when it straddles
  the middle. With `above` = teams strictly ahead and `upto` = teams ahead or
  level (self included): `1 if upto * 2 <= n`, `0 if above * 2 >= n`, else
  `0.5`. This removes the 52%->55% creep that ties cause with rating points.
  Only under `gameweek_percentile`.
- **The cohort** is the teams this run rates (`mc_teams`: active teams of the
  season with a final result in the gameweek being evaluated), the same base
  every other stat already uses. For past weeks it can differ from that week's
  full field only by teams that have since left or been deactivated. That is
  acceptable and documented.
- Averages, shrinkage, `empty_stat_neutral`, OVR, tiers, provisional, the
  change and notification logic and every write: unchanged. `cap_raw`,
  `sel_raw` and `trf_raw` store the averaged percentile (0-1) under v4. Nothing
  reads them outside the card and the calibration dry run.

Load: three extra window passes over tables the function already builds, each
O(teams x gameweeks). That is small next to the existing best-eleven search.

### Rules v4 (inserted by the owner script, active)

```json
{
  "minimum_gameweeks": 1,
  "provisional_below": 5,
  "trf_window_gameweeks": 3,
  "batch_size": 2000,
  "normalize": "gameweek_percentile",
  "scales": {
    "cap": [
      [0, 1],
      [0.5, 50],
      [1, 99]
    ],
    "sel": [
      [0, 1],
      [0.5, 50],
      [1, 99]
    ],
    "trf": [
      [0, 1],
      [0.5, 50],
      [1, 99]
    ],
    "con": [
      [0, 1],
      [1, 99]
    ]
  },
  "tiers": { "stade": 50, "pro": 65, "champion": 80, "legend": 90 },
  "shrinkage": { "cap": 4, "sel": 4, "con": 4, "trf": 4 },
  "sel_numerator": "picked_starters",
  "ovr_min_stats": 1,
  "empty_stat_neutral": true
}
```

The differences from v3 are only `normalize` and the three `scales`. The tiers
are kept on purpose. Under A, OVR does not depend on the scoring rule, so if the
owner wants the tier shares of the domain plan (LEGEND top 1%, CHAMPION 4%,
PRO 15%, STADE 30%), the calibration dry run can place them on real GW1-4 data
and they stay valid afterwards. That is a separate, later rules version, and
the owner's call.

### Files

- `supabase/migrations/<ts>_manager_card_gameweek_percentile.sql` (the function
  only; check the timestamp with `bun run backend:migrations:check`).
- `supabase/tests/database/manager_card_gameweek_percentile.test.sql`: v3 rows
  unchanged byte for byte; percentile values on a seeded week (ties, n = 1, a
  null CAP week); TRF cohort by `b_seq`; the CON tie rule; scale-invariance
  (multiplying every point by k and adding c leaves the v4 card unchanged, which
  is the property that matters); an invalid `normalize` gives
  `manager_card_rules_invalid`.
- `scripts/backend/apply-manager-card-rules-v4-percentile.sql`: same structure
  as the v3 script. Guards: v3 migrations recorded; writers paused and drained
  (compute off, `manager-card-tick` inactive or idle); the md5 of the current
  function body equals the `20261012200100` body; the sha256 of the migration
  text; exactly three rules rows with v3 active; v4 differs from v3 only in
  `normalize` and `scales`. Then it applies the migration, verifies body md5,
  owner, `security definer`, `search_path` and grants, inserts v4 active,
  checks that the tick answers `off` and wrote nothing, and ends in `rollback;`.
- `scripts/backend/apply-manager-card-rules-v4-percentile-script.test.ts`.
- `scripts/backend/manager-card-calibration-dry-run.sql`: report the percentile
  raws as such when `normalize` is set (it proposes scales today; under v4 only
  tiers are left to propose).
- `docs/backend/MANAGER_CARD_OPERATIONS_RUNBOOK.md`: a "Rules v4" section, plus
  a pointer from the `FANTASY_RATING_POINTS.md` risk line.

### Rollout (owner, following AGENTS.md "One writer at a time")

1. Compute already off (step 1 of the recommendation). Also pause the tick by
   name, as the v2/v3 runbook does, and wait for no run in progress:
   `select cron.alter_job((select jobid from cron.job where jobname = 'manager-card-tick'), active := false);`
2. Rehearse the v4 script (it ends in `rollback`), confirm separately that there
   is no `<ts>` row in `supabase_migrations.schema_migrations` and v3 is still
   active, then change only the last line to `commit;` and run it once.
3. Resume the tick (`active := true`) and `select app_private.manager_card_configure(true, null);`.
4. Watch the job log until `evaluated` with `morePending: false`. Check
   `select tier, provisional, count(*) from app.manager_card_seasons group by 1, 2;`
   against the value before. A silent shift of about ±1 is expected.
5. Restore `notify_ovr_changes` to what it was if it was touched.

To go back: insert a v5 with v3's JSON (rows are never edited). The function
without `normalize` is v3's calculation.

## 6. Owner decisions (2026-10-14)

1. **Option**: A, approved.
2. **Pause**: card compute is switched off once GW4's cards are done, until v4
   is applied.
3. **Meaning of the stats**: accepted. Under A, CAP, SEL and TRF say "how you
   ranked against other managers that week" (50 = the middle manager), which
   replaces the 2026-10-08 fixed-meaning scales.
4. **Optional, later**: an owner-authorised aggregate read of production (counts
   and percentiles only) to see the real tier shares and, if wanted, place the
   tier cut-offs at the domain plan's target shares in a later rules version.
   Not decided; not part of this build.

## 7. As built (differences from the text above)

- **Timestamp**: `20261014160000` (moved from `20261014150000`, which PR #474
  took on `main` first; after every migration on `main` and PR
  #473's `20261014120000`).
- **Scale invariance, stated exactly.** Section 5 says "multiplying every point
  by k and adding c leaves the v4 card unchanged". Multiplying holds for every
  card (players, team totals and hits all times k), and pgTAP checks it on
  every history row. Adding a constant to every player's points leaves TRF and
  CON unchanged, and CAP and SEL unchanged between teams whose best starter and
  best eleven score the same (pgTAP checks such a fixture). Between teams whose
  best differ, a shift can reorder a few ratios (`(a + c) / (b + c)` does not
  keep the order of `a / b` in general), so individual cards can move a little;
  what always holds is that each week's cohort averages exactly 0.5, so cards
  cannot climb as a group, which is the GW5 problem. pgTAP checks the 0.5 mean
  too, and shows v3 moving under both changes.
- **CON tie rule and odd fields.** With the formula of section 5, the middle
  team of an odd field (no tie) also counts 0.5 (v3: 1). That follows from
  "straddles the middle" and keeps the weekly mean at 0.5; it was not
  simulated.
- **The raw figures are now returned by an API.** PR #466 (BotolaGO+ premium
  reads, merged after this proposal) returns `cap_raw`, `sel_raw`, `trf_raw` and
  `con_raw` as `raw` in `api.get_my_card_career`. Under v4 they are average
  percentiles. Nothing on screen shows `raw`; the career's own `averageShare`
  and `averageGain` are computed from points and are unchanged, but no longer
  equal `raw.cap` and `raw.trf` under v4 (the premium pgTAP test that checks
  that equality uses its own rules without `normalize`, and passes).
- **Calibration dry run unchanged.** `manager-card-calibration-dry-run.sql`
  refuses once any rules row or card exists (it is the pre-v1 tool), so it
  could not run on production again in any case. A v4-aware tier calibration
  is part of the optional later step 4.
- **Rollout.** As section 5, with two ways to pause (the card alone, or the
  maintenance pause `sofascore-rating-release-pause.sql` /
  `sofascore-rating-release-resume.sql`, whose pause step expects compute on);
  see the runbook.
- **No UI or copy change.** The card's French and Arabic labels and onboarding
  text name what each stat is about ("Vos capitaines", "Votre onze de départ",
  "Elle mesurera vos choix : capitaine, titulaires, transferts, régularité")
  and give no fixed meaning that becomes wrong.

## Evidence and limits

- The proposal (sections 1 to 6) read only: the card's migrations
  (`20261008123200`, `20261012170000`, `20261012200100`), the rules scripts
  v1-v3, the runbook, `FANTASY_RULES_V1.md`, `FANTASY_RATING_POINTS.md` and
  `SOFASCORE_STAGED_STATS.md`. No database was read or written for it.
- The build (section 7) was tested on a local Supabase stack only: the pgTAP
  file `manager_card_gameweek_percentile.test.sql` (expected figures from an
  independent reference calculation), the full pgTAP suite, and a rehearsal of
  the guarded script on a local database at `main`'s state (see the runbook).
  Production was not read or written.
- All figures are from the synthetic simulation (seed 7 with 2,000 managers;
  seed 11 with 1,000 managers as a check). The model simplifies automatic
  substitutions (no formation check), has no chips and no double gameweeks, and
  its rating is a model of SofaScore, not SofaScore. The direction of the
  CAP/SEL inflation is arithmetic. Its size and the tier shares are
  model-dependent.
