# Fantasy: a journée's points are published all at once

Owner request 2026-10-29. Migrations `20261030100000` to `20261030100300`. From
Journée 6, a journée's points, rankings and finalization go out together, at one
fixed moment, when every rating is in. Journée 5 and earlier are not touched.

## The rule

- **Publication time** (`app_private.fantasy_publish_not_before`): the Moroccan
  date of the latest `finalized_at` among the journée's counted matches, plus two
  days, at 14:00 Moroccan time. For a last match on Thursday evening, Saturday
  14:00. It is null until every counted match is finished. Morocco's clock is
  the application's (`app_private.morocco_*`, migration `20261016090000`), not
  the database's own zone data, which is older on production.
- **Release** (`api.service_evaluate_fantasy_publication`, called by the worker
  on every pass): at or after the publication time, if no rating is pending the
  journée is released; if one is pending, the whole journée waits for the next
  14:00 Moroccan time (`deferred_until`), whatever arrives in between. The
  decision is recorded in `app_private.fantasy_publication_state`. A released
  journée stays released, so an interrupted pass resumes.
- **Held means nothing is written.** The database refuses to prepare live
  points, persist results, begin finalization or rank the journée until it is
  released (`fantasy_publication_held`), so a caller cannot bypass the worker.
- **Not held, so unchanged:** the selection close, the next journée's opening,
  the Free Hit restore, the free-transfer rollover and the prices; scoring
  rules, captain, chips, transfers; live match data.
- **Setting.** `app_private.fantasy_publication_settings(season_id,
first_gameweek)`: the first gated journée, 6 when a season has no row. 1000
  switches the rule off for a season.

## What fans see

- The points, history, round recap, public recap, top players and briefing read
  through `app_private.fantasy_visible_*`, which hide a gated journée until it
  is **published**: released and its overall ranking exists. The few seconds the
  worker spends writing the results are not shown either.
- `api.fantasy_gameweeks` carries `publicationHeld` and `publishAt` for each
  journée; `api.get_my_fantasy_points` and `api.fantasy_gameweek_summary` say
  `publicationHeld` and `publishAt` and show no points, rating progress or best
  score for a held journée.
- The points and rankings screens show «Points de la Journée N : samedi 31 oct.
  à 14h» (Arabic too, right to left, Morocco time) and look again every minute,
  so the line leaves by itself once the points are out.

## The watchdog

See [ALERTS.md](../operations/ALERTS.md), "One publication time per journée".
Before the publication time a missing rating is information (`fantasyPublication`
in the health answer). The coverage, scoring and progression checks fail when the
journée is still unpublished 30 minutes after its time with all ratings in, or 7
days after its first time with ratings missing (the owner decides).

## Item F7: a moved match

`api.service_begin_fantasy_selection_close` refused a counted match whose kickoff
differed from the kickoff the assignment was frozen with, so Maghreb Fès v RSB
Berkane (booked 20:00, played 17:00 on 29 Oct 2026) stopped the close and the
opening of Journée 6. The check now accepts a finished match completed within the
ruleset's post-lock window (48 h, `post_lock_completion_window_hours`) of the
frozen kickoff, as long as no lineup locked after its real kickoff. The frozen
assignment is not rewritten (realigning `assigned_kickoff_at` would change a
frozen record); a refusal still says `fantasy_selection_matches_unfinished`.

## Rating polls

`app_private.fantasy_api_rating_candidates` has one more mark, 24 h 30 min after
full time (15 min, 1 h, 3 h, 12 h, 24 h, **24 h 30 min**, 48 h, 4 d, 7 d, 14 d).
The Not-rated rule (two successful reads at least 24 h apart) can then settle a
1 to 9 minute cameo at about 24.5 h instead of 48 h; the rule itself is
unchanged. Cost: at most one extra SportAPI call per finished counted match whose
latest rating source is not yet complete, once (about 8 for a journée of 8
matches, none for a match whose ratings were all in).

## Applying it

Deploy `fantasy-lifecycle-worker` first (safe: against the old database it behaves
as before), then apply
`scripts/backend/apply-20261030100000-publish-journee-at-once.sql` (rehearsal, then
commit; it holds every scheduled job and the Fantasy worker lease while it runs),
then publish the website: `docs/review/batch2-2026-10-30/OWNER_STEPS.md`. If the
database is applied first, deploy the worker within minutes: the old worker is
refused for a gated journée (nothing publishes early, nothing publishes at all).

## Release at the slot

The decision belongs to the slot: a journée is released only if every rating was
ready at or before a slot that has come (a rating source captured, or a Not-rated
settlement recorded, after the slot does not count) and none is pending now;
slots already past are walked in order. Rows written before the gate was switched
on stay hidden (the standings, hub, leagues, rivals and recap read
`app_private.fantasy_visible_rankings` and `fantasy_visible_team_results`, which
take the held journée off every total) and are published at the slot; the worker's
persist and rank then replay over them without duplicates.

### Cost of the standings readers

With no held journée that already has results (every day but the rare one) the
readers run their original bodies on the raw tables: each name the app calls
(`fantasy_hub`, `fantasy_leagues`, `fantasy_league_standings`,
`fantasy_overall_standings`, `get_my_rivals`, `get_my_deadline_briefing`,
`fantasy_hidden_ahead`, `rivals_pair`, `round_recap_league`) is a wrapper that
asks `app_private.fantasy_any_held()` once and calls `<name>_ungated` (the
original, untouched) or `<name>_held` (patched to read the visible views).
While a journée is held, the shown totals and ranks are not computed per row:
`app_private.fantasy_shown_rankings` stores them (the team's published results
added up, ranked with the ranking writer's own tie-break), and a statement
trigger on `app.fantasy_rankings` refreshes only the boards a statement touched.
A full rebuild is `select app_private.fantasy_refresh_shown_rankings();`.
Timings: `scripts/backend/perf/fantasy-standings-held-timing.sql` (scratch
database only).

## Tests

`supabase/tests/database/fantasy_publication_gate.test.sql`,
`fantasy_selection_close_moved_match.test.sql`,
`fantasy_rating_poll_mark_24h30.test.sql` (pgTAP);
`scripts/backend/fantasy-lifecycle-runner-staged.test.ts` (worker);
`scripts/backend/fantasy-season-orchestrator.test.ts` and
`scripts/ops/watchdog.test.ts` (mirrors);
`src/components/fantasy/publication-notice.test.tsx` (website).
