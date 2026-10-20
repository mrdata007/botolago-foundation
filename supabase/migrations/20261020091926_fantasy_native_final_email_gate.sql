-- Native scoring deliberately disables the old category/rating policy. Final
-- manager emails authorize the current native seal, not that obsolete switch.
-- Preserve every recipient, consent, version, selected-player and dedup guard.
do $patch$
declare source text;old_gate text:=$old$  if not exists(select 1 from app_private.fantasy_api_rating_seasons s where s.season_id=g.fantasy_season_id and g.sequence_number>=s.from_gameweek)
   or not exists(select 1 from app_private.fantasy_rating_policy p where p.season_id=g.fantasy_season_id and p.enabled and g.sequence_number>=p.from_gameweek)then return null;end if;$old$;
new_gate text:=$new$  if not exists(select 1 from app_private.fantasy_api_rating_seasons s where s.season_id=g.fantasy_season_id and g.sequence_number>=s.from_gameweek)
   or not exists(select 1 from app_private.fantasy_scoring_snapshots s
    where s.gameweek_id=g.id and s.calculation_version=g.scoring_input_version
    and s.sealed_at is not null and s.players_persisted
    and s.payload->>'apiNativeRatings'='true'and s.payload->>'ratingScoring'='true'
    and s.payload->>'scoringVersion'='3'and s.payload#>>'{ruleset,version}'='3'
    and case when jsonb_typeof(s.payload->'pendingFixtures')='array'then jsonb_array_length(s.payload->'pendingFixtures')end=0
    and case when jsonb_typeof(s.payload->'pendingPlayerIds')='array'then jsonb_array_length(s.payload->'pendingPlayerIds')end=0
    and not app_private.fantasy_actual_ratings_pending(s.payload))then return null;end if;$new$;
begin
 if md5((select prosrc from pg_proc where oid='app_private.fantasy_email_payload(app_private.notification_events,uuid,timestamptz)'::regprocedure))<>'78046004541638577c66200720ed430f'then raise exception 'native_final_email_baseline_changed';end if;
 source:=pg_get_functiondef('app_private.fantasy_email_payload(app_private.notification_events,uuid,timestamptz)'::regprocedure);
 if position(old_gate in source)=0 then raise exception 'native_final_email_gate_anchor_missing';end if;
 execute replace(source,old_gate,new_gate);
end $patch$;
