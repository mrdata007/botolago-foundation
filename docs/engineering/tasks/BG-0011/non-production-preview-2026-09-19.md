# BG-0011 option B — non-production preview (2026-09-19)

**Status: entirely local/isolated. No Supabase project, no network calls, no production data
were touched to produce this preview.** Every number below is labeled as one of:

- **MEASURED** — carried over verbatim from BG-0044's real production probe (this sandbox has no
  way to re-verify it; it was not re-measured here).
- **SIMULATED** — computed in this sandbox by running the actual, unmodified
  `normalizeHistoricalFixture` and `calculatePreseasonRatings` functions from this branch against
  synthetic input data shaped like real SportsMonks payloads.
- **ILLUSTRATIVE** — a plausible synthetic squad/statistics shape invented for this preview
  because this sandbox has no access to the real Fantasy catalog or real player statistics. Do
  not treat any ILLUSTRATIVE number as a production estimate.

Simulation script: a throwaway `simulate.ts` run from the session scratchpad (not committed to the
repo — it is a one-off preview script, not part of the shipped codebase). It imports the real
`supabase/functions/_shared/sportsmonks-historical-player-performance.ts`
(`normalizeHistoricalFixture`) and `supabase/functions/_shared/sportsmonks-player-ratings.ts`
(`calculatePreseasonRatings`) from this branch — no ingestion or rating logic was reimplemented
for this preview. The price formula is a hand-mirrored copy of the existing, unmodified SQL
function `app_private.fantasy_initial_price_v1`
(`supabase/migrations/20260803210943_fantasy_catalog_activation.sql`); this task did not invent a
new pricing formula.

## 1. Fixture coverage (MEASURED histogram, SIMULATED classification)

The anonymous-starter histogram itself is **MEASURED** (BG-0044, real season-26027 production
data). Whether each bucket is accepted or quarantined under the code in this branch is
**SIMULATED**: one representative fixture per histogram bucket was built as a synthetic
SportsMonks-shaped payload and run through the real `normalizeHistoricalFixture`.

| anonymousStarterRows | fixtures (MEASURED) | classification (SIMULATED, real code) |
|---:|---:|---|
| 0 | 176 | ACCEPTED |
| 1 | 50 | ACCEPTED |
| 2 | 11 | ACCEPTED |
| 4 | 1 | ACCEPTED |
| 7 | 1 | QUARANTINED (fixture 19596474, MEASURED) |
| 8 | 1 | QUARANTINED (fixture 19596475, MEASURED) |
| **Total** | **240** | **238 accepted / 2 quarantined** |

This matches BG-0044's measured 238/240 and the two named outlier fixtures exactly. No fixture
between the histogram's given buckets (3, 5, 6 anonymous) was measured in season 26027; the
implementation's behavior for those counts is covered instead by the unit and pgTAP regression
tests (`sportsmonks-historical-anonymous-starters.test.ts`, cases a–g).

## 2. Mapped vs unmapped catalog players

**From a prior probe, not re-verified in this isolated run** (no DB access available here):

- Total Fantasy catalog players: 539
- Mapped to a SportsMonks provider id: 497
- Eligible (mapped and otherwise activation-ready): 459
- Unmapped: 42

This sandbox could not query `app_private.football_provider_mappings` or `app.players` against a
real or even a local Supabase instance (no Docker daemon available — see the implementation
report), so these four numbers are carried over unchanged and are explicitly **not** confirmed
fresh here.

## 3. Illustrative squad simulation (SIMULATED classification + rating + price, ILLUSTRATIVE data)

Because the real catalog could not be reached, an **illustrative** 176-player, 8-club synthetic
squad was built (22 players per club: 2 GK / 6 DEF / 8 MID / 6 FWD — a plausible squad-depth
shape, not the real Botola Pro squads) with a synthetic appearance-rate spread per squad slot
(0.9 / 0.75 / 0.55 / 0.3 / 0.02 of 30 rounds) and roughly 1-in-13 players marked as carrying no
provider mapping (chosen to sit in the same order of magnitude as the prior probe's ~92%
mapped rate; not derived from real data). The real `calculatePreseasonRatings` (algorithm
`botolago-preseason-rating-v2-fixture-performance`) was then run on the mapped, ≥3-appearance
subset, and the real `app_private.fantasy_initial_price_v1` formula was mirrored to price every
player (usable and fallback alike).

### Usable vs fallback (SIMULATED, ILLUSTRATIVE data)

| | count |
|---|---:|
| Total illustrative players | 176 |
| Usable (mapped, ≥3 synthetic appearances → real historical rating) | 142 |
| Fallback (unmapped or <3 appearances → documented 6.0 rating / 0 confidence) | 34 |

The <3-appearance fallback (players synthesized with a 0.02 appearance rate, i.e. essentially a
never-used fringe squad slot) demonstrates that this branch's rating/price path still routes
data-poor players to the documented fallback rather than fabricating a rating for them — this
behavior comes from the unmodified `calculatePreseasonRatings`/pricing path, not from anything
changed in this task.

### Price distribution by position (SIMULATED, ILLUSTRATIVE data — not a production estimate)

| Position | n | usable | min | median | max |
|---|---:|---:|---:|---:|---:|
| GK | 16 | 15 | 4.8 | 5.3 | 5.3 |
| DEF | 48 | 37 | 4.9 | 5.6 | 5.8 |
| MID | 64 | 52 | 6.9 | 8.5 | 9.0 |
| FWD | 48 | 38 | 7.0 | 8.6 | 9.0 |

GK/DEF prices cluster low and MID/FWD high because `fantasy_initial_price_v1`'s own bounds do
(GK 4.0–6.5, DEF 4.0–7.0, MID/FWD 4.5–12.5) — this is the existing pricing formula's shape, not
an artifact of BG-0011.

### Price distribution by club (SIMULATED, ILLUSTRATIVE data)

Every club was given an identical illustrative squad shape and appearance-rate spread, so per-club
totals cluster tightly (157.1–159.9 total illustrative squad value across the 8 clubs) with 3–5
fallback players each — this is an artifact of the identical synthetic input, not a claim about
real clubs.

### Price ties

14 of the 176 illustrative players' prices are shared with at least one other player (15 distinct
price points among 176 players). **Legitimate price ties across players are expected** — nothing
in this task or the pricing formula guarantees, or should guarantee, unique prices.

## 4. Material bias check: does quarantining the 2 outlier fixtures skew any club?

**MEASURED, from BG-0044's engineering-brief-a1-starter-rows.yaml finding on the (larger, 64-fixture)
prior all-or-nothing rule**: under the *old* rule, quarantining was materially club-biased —
CRKZ/HUSA/KACM/UTS lost 30–37% of their fixtures. **Under this task's rule, only 2 of 240 fixtures
(0.83%) are quarantined**, a two-order-of-magnitude reduction in excluded data. This preview does
not have real fixture-to-club data to compute the exact 2-fixture bias precisely (fixture
19596474/19596475's home/away clubs were not part of BG-0044's saved artifact excerpt available in
this sandbox), but the structural conclusion holds: with only 2/240 fixtures excluded instead of
64/240, any single club can lose at most 2 of its ~30 fixtures (6.7%) under the new rule, and in
practice at most one club's data is thinned by up to 2 fixtures (if both outliers involve the same
club) — nowhere near the 30–37% impact the old option-(c)-style "quarantine on any shortfall" rule
would have produced. **This is a reasoned bound, not a measured club-level figure; a real
production audit before dispatch should compute the exact two clubs affected and confirm this
bound holds** (see the production prerequisites in the engineering brief).

## 5. Limitations, stated plainly

- No real Supabase stack (local or remote) was reachable in this sandbox — see the implementation
  report for why (no Docker daemon, no `supabase` CLI).
- The squad/statistics/price numbers in sections 3–4 are illustrative synthetic data, sized to be
  plausible, not measurements of the real BotolaGO Fantasy catalog.
- Only the fixture-coverage classification (section 1) and the mapped/unmapped baseline (section
  2, carried over) rest on real measured production numbers.
- This preview is not a promise of final production prices, ratings, or coverage — it is a
  demonstration that the changed code (`normalizeHistoricalFixture`, `calculatePreseasonRatings`,
  the unmodified pricing formula) behaves as designed when exercised end to end on realistic
  shapes.
