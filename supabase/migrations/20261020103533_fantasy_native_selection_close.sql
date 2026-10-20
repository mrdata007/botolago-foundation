-- Selection carry-over does not require a rating or a published score.
-- The original complete-scoring close and all finalization guards stay intact.
alter table app_private.fantasy_gameweek_close
  add column close_kind text not null default 'scoring_complete'
  check (close_kind in ('scoring_complete', 'selection_only'));

comment on column app_private.fantasy_gameweek_close.close_kind is
  'selection_only is an administrative native-rating close; its version/digest identify the carry-over receipt, never a published scoring snapshot.';

create function app_private.fantasy_selection_ratings_pending(p_gameweek_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare d jsonb;
begin
 d:=app_private.fantasy_scoring_input_document(p_gameweek_id);
 return d->>'apiNativeRatings' is distinct from 'true'
   or coalesce(app_private.fantasy_actual_ratings_pending(d),true)
   or jsonb_array_length(coalesce(d->'pendingFixtures','[]'::jsonb))>0
   or jsonb_array_length(coalesce(d->'pendingPlayerIds','[]'::jsonb))>0;
end $$;
revoke all on function app_private.fantasy_selection_ratings_pending(uuid) from public,anon,authenticated,service_role;

-- A selection-only close intentionally has no persisted scoring calculation.
-- Preserve existing published/sealed display precedence, but expose pending
-- flags from the native document while this closed round awaits its first score.
create or replace function app_private.fantasy_rating_display_document(p_gameweek_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select proposal from app_private.fantasy_current_rating_publications where gameweek_id=p_gameweek_id),
 (select payload from app_private.fantasy_scoring_snapshots where gameweek_id=p_gameweek_id
   and payload->>'apiNativeRatings'='true'and players_persisted order by calculation_version desc limit 1),
 (select app_private.fantasy_scoring_input_document(g.id)from app.fantasy_gameweeks g
   join app_private.fantasy_api_rating_seasons p on p.season_id=g.fantasy_season_id
   where g.id=p_gameweek_id and g.status='provisional'and g.closed_at is not null
     and g.sequence_number>=p.from_gameweek));
$$;

create function api.service_begin_fantasy_selection_close(p_gameweek_id uuid,p_expected_lock_version bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g app.fantasy_gameweeks%rowtype;s app.fantasy_seasons%rowtype;
 c app_private.fantasy_gameweek_close%rowtype;d jsonb;v bigint;pending boolean;
begin
 if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden';end if;
 if p_gameweek_id is null or p_expected_lock_version is null or p_expected_lock_version<1 then
   raise exception using errcode='PT400',message='validation_failed';end if;
 select *into g from app.fantasy_gameweeks where id=p_gameweek_id for update;
 if not found then raise exception using errcode='PT404',message='fantasy_gameweek_not_found';end if;
 select *into s from app.fantasy_seasons where id=g.fantasy_season_id;
 if s.status not in('registration_open','active') or g.status<>'provisional' or g.deadline_at>statement_timestamp()
   or not exists(select 1 from app_private.fantasy_api_rating_seasons p
     where p.season_id=s.id and g.sequence_number>=p.from_gameweek) then
   raise exception using errcode='PT409',message='fantasy_selection_close_not_allowed';end if;
 if g.closed_at is not null then
   select *into c from app_private.fantasy_gameweek_close where gameweek_id=g.id;
   if not found or c.calculation_version is distinct from g.closed_calculation_version then
     raise exception using errcode='PT409',message='fantasy_close_receipt_missing';end if;
   return jsonb_build_object('closed',true,'closeVersion',c.calculation_version,
     'ratingsPending',app_private.fantasy_selection_ratings_pending(g.id),'stableResult',true);
 end if;
 if g.lock_version<>p_expected_lock_version then
   raise exception using errcode='PT409',message='stale_update';end if;
 -- Serialize the genuine match-end facts and frozen assignment checks with ingestion.
 perform a.id from app.fantasy_fixture_assignments a join app.fixtures f on f.id=a.fixture_id
 where a.gameweek_id=g.id and a.superseded_at is null order by f.id,a.id for share of a,f;
 if not exists(select 1 from app.fantasy_fixture_assignments where gameweek_id=g.id
     and superseded_at is null and counts_points)
   or exists(select 1 from app.fantasy_fixture_assignments a join app.fixtures f on f.id=a.fixture_id
     where a.gameweek_id=g.id and a.superseded_at is null and(
       not a.counts_points or a.frozen_at is null or a.fantasy_season_id<>s.id
       or a.assignment_status not in('assigned','confirmed','reassigned')
       or f.season_id<>s.football_season_id or f.kickoff_at is distinct from a.assigned_kickoff_at
       or not app_private.fantasy_kickoff_confirmed(f.kickoff_at)
       or f.status<>'finished' or f.finalized_at is null or f.finalized_at>statement_timestamp()
       or f.kickoff_at>statement_timestamp() or f.finalized_at<f.kickoff_at
       or f.home_score is null or f.away_score is null))then
   raise exception using errcode='PT409',message='fantasy_selection_matches_unfinished';end if;
 if exists(select 1 from app.fantasy_lineups where gameweek_id=g.id and locked_at is null)
   or exists(select 1 from app.fantasy_teams t where t.fantasy_season_id=s.id and t.status='active'
     and t.current_gameweek_id=g.id and not exists(select 1 from app.fantasy_lineups l
       where l.fantasy_team_id=t.id and l.gameweek_id=g.id and l.locked_at is not null))then
   raise exception using errcode='PT409',message='fantasy_selection_lineups_unlocked';end if;
 d:=app_private.fantasy_scoring_input_document(g.id);
 if d->>'apiNativeRatings' is distinct from 'true' or d->>'scoringVersion' is distinct from '3' then
   raise exception using errcode='PT409',message='fantasy_selection_native_document_required';end if;
 pending:=app_private.fantasy_selection_ratings_pending(g.id);
 -- This is a carry-over version, not a synthesized scoring calculation.
 -- In particular, no scoring_input_version, score, snapshot or rating is written.
 v:=greatest(g.scoring_input_version,1);
 insert into app_private.fantasy_gameweek_close(gameweek_id,calculation_version,input_digest,
   price_source_version,price_player_ids,close_kind)
 values(g.id,v,encode(extensions.digest(d::text,'sha256'),'hex'),g.sequence_number::bigint+1,
   (select coalesce(array_agg(id order by id),'{}'::uuid[])from app.fantasy_players where fantasy_season_id=s.id),
   'selection_only');
 update app.fantasy_gameweeks set closed_at=statement_timestamp(),closed_calculation_version=v,
   lock_version=lock_version+1 where id=g.id;
 return jsonb_build_object('closed',true,'closeVersion',v,'ratingsPending',pending,'stableResult',false);
end $$;
revoke all on function api.service_begin_fantasy_selection_close(uuid,bigint) from public,anon,authenticated;
grant execute on function api.service_begin_fantasy_selection_close(uuid,bigint) to service_role;

create or replace function api.service_fantasy_lifecycle_state(p_gameweek_id uuid)
returns jsonb language sql security definer set search_path='' as $$
 select app_private.fantasy_lifecycle_state_before_api_ratings(p_gameweek_id)
 ||case when exists(select 1 from app.fantasy_gameweeks g join app_private.fantasy_api_rating_seasons p
   on p.season_id=g.fantasy_season_id where g.id=p_gameweek_id and g.sequence_number>=p.from_gameweek)
 then jsonb_build_object('adaptiveScoringEnabled',false,'apiNativeRatings',true,
   'selectionCloseEnabled',true,'selectionRatingsPending',case when exists(select 1 from app.fantasy_gameweeks
     where id=p_gameweek_id and status='provisional')then app_private.fantasy_selection_ratings_pending(p_gameweek_id)else false end)
 else '{}'::jsonb end;
$$;

-- A successor may open inside its last 24 hours. Do not consume its reminder
-- deduplication key while it is still scheduled and cannot accept selections.
do $patch$ declare original text;changed text;
begin
 original:=pg_get_functiondef('app_private.notification_email_plan(timestamptz)'::regprocedure);
 changed:=replace(original,$old$      and gameweek.status in ('scheduled', 'open')$old$,
 $new$      and gameweek.status in ('scheduled', 'open')
      and (not app_private.notification_manager_emails_enabled() or gameweek.status='open')$new$);
 if changed=original then raise exception 'selection_close_reminder_patch_mismatch';end if;
 execute changed;
end $patch$;
