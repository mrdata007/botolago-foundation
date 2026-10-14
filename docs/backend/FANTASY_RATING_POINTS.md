# Fantasy points from the SofaScore rating

Owner decision of 2026-10-13. Status: built, **off**. Nothing changes until the
owner runs `scripts/backend/activate-fantasy-rating-points.sql`.

## The rule

From Fantasy gameweek 5 of the 2026/27 season onward:

| Player in a match                    | Fantasy points                                            |
| ------------------------------------ | --------------------------------------------------------- |
| Appeared (minutes > 0) with a rating | His SofaScore rating rounded to a whole number, halves up |
| Appeared without a SofaScore rating  | 5                                                         |
| Did not appear                       | 0                                                         |

Rounding: 7.5 gives 8, 7.49 gives 7, 6.5 gives 7, 5.55 gives 6. Points stay whole
numbers everywhere; no integer column became a decimal.

That one line (category `rating`) **replaces** every other category for those
gameweeks: appearance, goals, assists, clean sheet, goals conceded, saves,
penalties, cards, own goals.

Unchanged: captain (x2), vice-captain, Triple Captain, Bench Boost, automatic
substitutions (a starter who did not appear is replaced as before), transfer hits,
every rule outside points. GW1-4 and every result already saved stay exactly as
they are. A gameweek with two matches for a club sums one `rating` line per match.

This supersedes decision D3 of `FANTASY_SOFASCORE_FLASHSCORE_PLAN.md` ("ratings are
display only") from the gameweek the rule starts.

## How it is built

| Part                        | Where                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| The arithmetic              | `supabase/functions/_shared/fantasy-rating-scoring.ts` (`ratingPoints`, `scoreRatingPlayerFixture`)        |
| The worker                  | `supabase/functions/_shared/fantasy-lifecycle-worker.ts` (`calculateSnapshotResults`)                      |
| The rating in observations  | `supabase/functions/_shared/sofascore-fantasy.ts` (`ObservationRow.rating`)                                |
| Ruleset, switch, document   | `supabase/migrations/20261014090000_fantasy_rating_points.sql`                                             |
| The save                    | `supabase/migrations/20261014090100_fantasy_rating_points_save.sql`                                        |
| The owner's switch          | `scripts/backend/activate-fantasy-rating-points.sql`                                                       |
| Rules page, labels, landing | `src/routes/fantasy.rules.tsx`, `src/i18n/dictionary-{fr,ar}.ts`, `src/components/landing/LandingPage.tsx` |

1. **The rating travels with the facts.** The SofaScore builder puts each player's
   match rating from the lineup reply into his observation row, as a top-level
   `rating` (two decimals at most, `null` when SofaScore gave none). It is outside
   `stats` on purpose: every statistic there is a whole number the adaptive checks
   certify. Observations recorded before this change have no `rating`; it reads as
   `null`. A database trigger refuses a rating that is not `null` or a number from
   0 to 10 with at most two decimals (`fantasy_observation_rating_invalid`).
2. **Ruleset v3.0** (`f6200000-0000-4000-8000-000000000300`,
   `botolago-fantasy-v3.0`): a copy of the v2.1 catalog (positions and formations,
   chips, deadlines, prices) without category scoring rows. Inactive; no season
   points at it. The rule is reached only through the switch.
3. **The switch**: `app_private.fantasy_rating_policy` (one row per season:
   `from_gameweek`, `enabled`, default off), read by
   `app_private.fantasy_rating_scoring_enabled(gameweek)`, which is true from the
   first gameweek on, and only where adaptive scoring is on (the rating comes from
   its observations). Changed only by
   `app_private.fantasy_rating_points_configure(season, enabled, from_gameweek)`,
   executable by `postgres` alone:
   - switching **on** needs the adaptive policy (not paused, from that gameweek or
     earlier) and refuses (`fantasy_rating_gameweek_started`) unless the first
     gameweek and every later one are still `scheduled` or `open`: a gameweek is
     scored under one rule from its deadline;
   - the first gameweek cannot be moved while on (`fantasy_rating_policy_immutable`);
   - switching **off** is the emergency way back while no gameweek under the rule
     is `finalizing`, `finalized` or `corrected`
     (`fantasy_rating_finalized_history_protected` after that). Off, the next
     scoring pass rescores the gameweek under the category scale.
4. **The scoring document.** `app_private.fantasy_scoring_input_document` gains one
   outer layer (the previous function is kept as
   `fantasy_scoring_input_document_before_rating`). For a gameweek under the rule
   it sets `ruleset` to v3.0, `scoringVersion` to 3, `ratingScoring` to true, and
   gives each player-fixture the `rating` of the observation its fixture is scored
   from. Every other gameweek's document is returned unchanged, byte for byte, so
   no snapshot digest of GW1-4 moves (the pgTAP test and the owner script both
   compare them).
5. **The worker** accepts ruleset 3.0 only with scoring version 3 on the adaptive
   document (anything else is still `fantasy_scoring_rules_unsupported`). It gives
   a player one `rating` event per match when his minutes are established (as for
   `appearance`) and above zero, worth `ratingPoints(rating)`; no event otherwise.
   Captain, chips and substitutions run on those totals as before. v1/v2 snapshots
   are scored by the same code as before.
6. **The save** (`api.service_persist_fantasy_scoring_results`, replacing the body
   of `20261013180000` behind an md5 guard) accepts, for a scoring-version-3
   snapshot, exactly one `rating` event for each appearing player and none for the
   others, and recomputes the figure from the snapshot's own rating
   (`floor(rating + 0.5)`, 5 without one): a wrong figure is
   `fantasy_point_event_invalid`. For v1/v2 snapshots nothing changed; `rating` is
   refused there like any unknown category.
7. **What players see.** The points screen labels the line "Note SofaScore" /
   "تقييم SofaScore" (`fantasy.points.event.rating`). The rules page, while the rule
   is on (`api.fantasy_rules` returns `ratingScoring: {fromGameweek, noRatingPoints}`),
   states in French and Arabic: points = SofaScore rating rounded to the nearest
   whole number, 5 when he played without a rating, 0 when he did not play, the
   captain doubles; the category scale stays below it, labelled "until GW4". The
   landing page and the Fantasy onboarding quote no scale at all (audit FANT-06): they
   say points follow match performance and point to the rules page, which names the
   scale in force and its first round. With both policies present, the rules page's
   "how points are validated" card names the rounds each explanation governs (audit
   LOC-01, `src/lib/fantasy-scoring-policy.ts`).

## Screen change brief (AGENTS.md, "Screen work")

Approved scope: the owner's rule change of 2026-10-13, which the public copy must
state truthfully. Text only; no layout, component or style change.

- **Preserved:** the rules page structure, every card and its order, the category
  scale table (unchanged, still drawn from `api.fantasy_rules`), the points screen,
  the landing page layout and its three-row "Extrait du barème" list, brand and
  business rules.
- **Changed:** the rules page's scoring card states the rating rule (FR and AR)
  while `ratingScoring` is present, with the category scale below it labelled
  "until GW4"; the points line label `rating`; the landing step 3, its three scale
  examples and the "how do you score" answer, and the Fantasy onboarding step 2, now
  describe the rating rule instead of goals, assists and clean sheets.
- **Acceptance:** with the rule off the rules page renders exactly as before; with it
  on it shows the rating sentence with the first gameweek and the earlier table
  below; the same keys and slots exist in French and Arabic
  (`src/routes/fantasy-rules.ssr.test.tsx`); no AI mention anywhere (public
  editorial rule). Screenshots, mobile/desktop and RTL visual checks are still to be
  done before the pull request leaves draft.

## Turning it on

Owner action, after the two migrations are applied and the Edge Functions
`fantasy-lifecycle-worker` and `football-live-refresh` run this code (the worker
must know ruleset 3.0 before a GW5 snapshot exists; the observations must carry the
rating). Before the GW5 deadline:

1. Run `scripts/backend/activate-fantasy-rating-points.sql` as it is. It ends in
   `rollback`. Its guards stop with `stop: ...` unless the migrations and the
   reviewed function bodies are there, adaptive scoring is on, the season has no
   policy row yet, GW5 is `scheduled` or `open` and no later gameweek started. It
   prints the switch, which gameweeks it covers, and what the rules page will say,
   and it stops if the document of any gameweek before GW5 moved.
2. Check `select count(*) from app_private.fantasy_rating_policy;` is still 0.
3. Change only the final `rollback;` to `commit;` and run it once.

It writes one row of `app_private.fantasy_rating_policy`. No background job needs
pausing for it (none writes that table); the configure function locks the season's
gameweeks while it decides, so none can change status underneath it.

## Corrections and late ratings

A rating is part of the observation and of its digest. A later SofaScore pull with
a different rating (the staged re-pulls of `SOFASCORE_STAGED_STATS.md`, or a
reviewed correction) records a new observation, which bumps the gameweek's scoring
input version and changes its document digest, so the next pass computes a new
calculation version and the points follow. Nothing extra is needed. The builder
also records the rating explicitly, so this no longer depends on the raw-payload
digest in the references.

## Risks the owner should know

- **Ratings arrive late on Botola matches.** SofaScore publishes the full
  statistics, rating included, 5 to 16 days after a match on many Botola games
  (`SOFASCORE_STAGED_STATS.md`). Until then every player who appeared has no
  rating and scores **5**: provisional points look flat right after the match
  and move when the ratings arrive. A match that never gets full coverage
  (`FINAL_LIMITED` after 21 days) keeps 5 for everyone, and those 5s become final.
- **Players SofaScore does not rate.** A substitute with a few minutes often has no
  rating: he gets 5, possibly more than a rated starter who played badly (a 4.2
  rating gives 4).
- **Observations recorded before the deploy** have no rating, so a GW5 match
  recorded by older code scores 5 for everyone until a re-pull records the
  ratings. Deploy before GW5's first match.
- **A rating flip-flop** (A, then B, then A again) does not record the third pull:
  the observation with digest A already exists, so the latest stays B. This is the
  recorder's existing de-duplication, unchanged here.
- **The Manager Card** scales (`MANAGER_CARD_OPERATIONS_RUNBOOK.md`) were
  calibrated on v1 point sizes (a typical player 2-6 points a match, now 5-8).
  Under rules v3 its figures would shift from GW5. The follow-up is rules v4
  (owner decision 2026-10-14): CAP, SEL and TRF are ranked among the managers
  of each week, so the card no longer depends on point sizes. Card compute is
  paused from GW4 until v4 is installed; see the runbook's "Rules v4" section
  and `MANAGER_CARD_RATING_POINTS_PROPOSAL.md`.
- **Emergency off** before GW5 finalizes rescoring under the category scale is a
  visible change of every GW5 total; use it only if the ratings are wrong.

## Tests

- `supabase/functions/_shared/fantasy-rating-scoring.test.ts`: rounding, 5 without
  a rating, refusal of impossible ratings.
- `scripts/backend/fantasy-lifecycle-runner.test.ts` ("rating gameweek"): captain,
  Triple Captain, Bench Boost, automatic substitution, vice-captain, unknown
  participation, double gameweek, ruleset 3.0 acceptance and refusals, v2 unchanged.
- `src/backend/fantasy/sofascore-fantasy.test.ts`: the rating in each row, null
  when absent, two decimals, a rating-only correction changes the request digest.
- `supabase/tests/database/fantasy_rating_points.test.sql`: off by default, owner
  only, refusals at a locked or started gameweek, GW4 document unchanged byte for
  byte, GW5 document (ruleset v3.0, version 3, ratings), the save's checks and
  totals, a rating correction changes the digest, v2 still refuses `rating`,
  switching off before and not after finalization.
- `supabase/tests/database/sofascore_fantasy_observations.test.sql` (2.7-2.10): the
  SofaScore recorder accepts rows with a rating and refuses impossible ones.
- `scripts/backend/activate-fantasy-rating-points-script.test.ts`: the owner script
  is a rehearsal, writes only the switch, guards before it, pins the reviewed bodies.
- `src/routes/fantasy-rules.ssr.test.tsx`: the rules page in both states.
