-- BotolaGO Production V2
-- Raises the left-out limits of 20261004120000 so that a fixture where one
-- side is almost entirely unknown to the catalogue can still come in, when
-- nobody holds any of the players left out.
--
-- WHY. 19874709 (MAS vs Zemamra, GW1): none of Zemamra's 19 lineup players is
-- placeable (13 have no provider mapping, 6 no 2026/27 club record there) and
-- 7 of MAS's 20 are not either: 26 rows to leave out, 13 to keep. The rule
-- capped the rows left out in all at 20 and the rows kept at 22 minimum (the
-- coverage table's bounds from last season's importer), so it refused
-- (LEFT_OUT_ROWS_EXCEEDED) although nobody's points depend on those 26: the
-- only held Zemamra player is the owner-confirmed absent one, and every held
-- MAS player is mapped. Owner decision 2026-10-04: raise the limit.
--
-- WHAT CHANGES. Only the limits. Every check on held players stays as it is.
--   * Left-out (named, unplaceable) rows: at most 40, counted apart from the
--     unnamed rows, which keep their own bound of 20.
--   * Rows kept: at least 11 (one side), and kept plus left out at least 22
--     (every named lineup row is still accounted for).
-- The coverage table's checks, the scoring document's fixture check and the
-- import's own limit are changed to match. The two functions are patched in
-- place (their exact text is replaced once each, and the migration stops if
-- it is not found exactly once), so nothing else in them changes.

alter table app_private.historical_performance_fixture_coverage
  drop constraint historical_performance_coverage_counts_check;
alter table app_private.historical_performance_fixture_coverage
  add constraint historical_performance_coverage_counts_check check (
    lineup_rows_seen between 22 and 100
    and valid_player_rows between 11 and 100
    and valid_player_rows + excluded_mapping_rows >= 22
    and excluded_incomplete_rows - excluded_mapping_rows between 0 and 20
    and lineup_rows_seen = valid_player_rows + excluded_incomplete_rows
    and anonymous_starter_rows between 0 and 22
    and identified_starter_rows = 22 - anonymous_starter_rows
    and team_count = 2 and detail_rows >= 0 and invalid_detail_rows >= 0
    and (coverage_outcome = 'quarantined') = (anonymous_starter_rows > 4)
    and case when coverage_outcome = 'accepted'
      then starter_rows between 0 and identified_starter_rows and performance_rows = valid_player_rows
      else starter_rows = 0 and performance_rows = 0
    end
    and (anonymous_starter_rows = 0
      or source_version ~ '^sportsmonks-(current-)?fixture:[0-9a-f]{64}$')
  );
alter table app_private.historical_performance_fixture_coverage
  drop constraint historical_performance_coverage_mapping_exclusions_check;
alter table app_private.historical_performance_fixture_coverage
  add constraint historical_performance_coverage_mapping_exclusions_check check (
    excluded_mapping_rows between 0 and excluded_incomplete_rows and excluded_mapping_rows <= 40
  );

do $limits$
declare
  definition text;
  old_text text;
  new_text text;
begin
  -- The import (20261004120000).
  definition := pg_get_functiondef(
    'api.ingest_current_player_fixture_performance(text,text,text,jsonb,jsonb,timestamptz)'::regprocedure);
  old_text := '  if jsonb_array_length(left_out) + unnamed_rows > 20 or jsonb_array_length(placed) < 22 then';
  new_text := '  if jsonb_array_length(left_out) > 40 or jsonb_array_length(placed) < 11 then';
  if (length(definition) - length(replace(definition, old_text, ''))) / length(old_text) <> 1 then
    raise exception 'left-out limit: the import is not the 20261004120000 version';
  end if;
  execute replace(definition, old_text, new_text);

  -- The scoring document's fixture check (20261004120000).
  definition := pg_get_functiondef('app_private.fantasy_validate_scoring_document_v1(jsonb)'::regprocedure);
  old_text := '      or coalesce((f#>>''{coverage,excluded_incomplete_rows}'')::integer,-1)
        not between coalesce((f#>>''{coverage,anonymous_starter_rows}'')::integer,0)
          + coalesce((f#>>''{coverage,excluded_mapping_rows}'')::integer,0) and 20';
  new_text := '      or coalesce((f#>>''{coverage,excluded_incomplete_rows}'')::integer,-1)
          - coalesce((f#>>''{coverage,excluded_mapping_rows}'')::integer,0)
        not between coalesce((f#>>''{coverage,anonymous_starter_rows}'')::integer,0) and 20
      or coalesce((f#>>''{coverage,excluded_mapping_rows}'')::integer,0) > 40';
  if (length(definition) - length(replace(definition, old_text, ''))) / length(old_text) <> 1 then
    raise exception 'left-out limit: the scoring check is not the 20261004120000 version';
  end if;
  execute replace(definition, old_text, new_text);
end
$limits$;
