-- BotolaGO Production V2
-- Faster settling of short cameos: one more rating poll mark, 24 h 30 min after
-- full time.
--
-- Why. The audited Not-rated rule (20261019172832, owner-approved 2026-10-19)
-- settles a 1 to 9 minute appearance whose rating stays empty only after TWO
-- successful reads at least 24 hours apart (checks and captures). The poll
-- back-off of 20261026143000 reads at 15 min, 1 h, 3 h, 12 h, 24 h, 48 h, ... So
-- the first read lands about 15 minutes after the whistle and the next read that
-- is 24 h after it is the 48 h mark: a cameo settled two days after the match,
-- which is later than the journée's publication slot (two Moroccan days after
-- the last match, 14:00).
--
-- What changes. One mark, 24 h 30 min, between the 24 h and 48 h marks. A read
-- at about 24.5 h is more than 24 h after a read in the first half hour, so the
-- cameo rule can be satisfied at about 24.5 h. The cameo rule itself is not
-- touched. Nothing else in the function changes: same joins, same gameweek
-- rules, same "none once the latest source is complete", same retry of a failed
-- attempt every 30 minutes for six hours after a mark.
--
-- Cost. At most one extra SportAPI call per finished counted match whose latest
-- rating source is not yet complete at 24 h 30 min, once. For a journée of 8
-- matches that is at most 8 calls (fewer, for a match whose ratings were all in
-- by then), plus 30 minute retries of a failed read inside the six hour window.

do $mark$
declare
  source text;
  old_marks constant text := 'interval ''12 hours'',interval ''24 hours'',interval ''48 hours''';
  new_marks constant text := 'interval ''12 hours'',interval ''24 hours'',interval ''24 hours 30 minutes'',interval ''48 hours''';
begin
  if md5((select prosrc from pg_proc where oid = 'app_private.fantasy_api_rating_candidates()'::regprocedure))
    is distinct from '4a087788345c2eb22f486c57526f1c8a' then
    raise exception 'rating_poll_mark_unexpected_previous_body';
  end if;
  source := pg_get_functiondef('app_private.fantasy_api_rating_candidates()'::regprocedure);
  if (length(source) - length(replace(source, old_marks, ''))) <> length(old_marks) then
    raise exception 'rating_poll_mark_anchor_not_unique';
  end if;
  execute replace(source, old_marks, new_marks);
end
$mark$;

comment on function app_private.fantasy_api_rating_candidates() is
  'Finished Fantasy fixtures whose rating poll is due: a fixed back-off after full time (15 min, 1 h, 3 h, 12 h, 24 h, 24 h 30 min, 48 h, 4 d, 7 d, 14 d), none once the latest rating source is complete, failed attempts retried every 30 minutes for 6 hours after a mark. The 24 h 30 min mark lets the Not-rated rule (two reads 24 h apart) settle a cameo at about 24.5 h.';
