-- Unknown participation blocks the lineups it can affect. It must not make
-- every gameweek unfinalizable because an unselected squad member is unknown.
-- Fixture readiness and scorer reconciliation are unchanged. Finalizing
-- snapshots already have no pending players, so their digests are preserved.
create or replace function app_private.fantasy_scoring_input_document(p_gameweek_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d jsonb; f jsonb; one_fixture jsonb; ready jsonb:='[]'; pending jsonb:='[]';
 eligible_ids jsonb:='[]'; pending_players jsonb; performances jsonb; reason text;
begin
 d:=app_private.fantasy_scoring_input_document_before_live(p_gameweek_id);
 if not app_private.fantasy_live_scoring_enabled(p_gameweek_id) then return d; end if;
 for f in select value from jsonb_array_elements(d->'fixtures')
 where (value#>>'{assignment,counts_points}')::boolean is true loop
   reason:=null;
   one_fixture:=d||jsonb_build_object('fixtures',jsonb_build_array(f),'playerFixtures',
     (select coalesce(jsonb_agg(p),'[]') from jsonb_array_elements(d->'playerFixtures') p
       where p->>'fixtureId'=f->>'fixtureId'));
   if f->>'status' is distinct from 'finished' or f->>'finalizedAt' is null then
     reason:='fixture_not_finished';
   elsif coalesce((d->>'adaptive')::boolean,false) and
     ((f->>'adaptiveReady')::boolean is distinct from true or f->>'scoringMode' is null) then
     reason:='fixture_data_pending';
   else
     begin
       perform app_private.fantasy_validate_scoring_document(one_fixture);
     exception when sqlstate 'PT409' then
       get stacked diagnostics reason=message_text;
       if reason not in ('fantasy_scoring_input_incomplete','fantasy_scoring_coverage_incomplete',
         'fantasy_goal_totals_mismatch','adaptive_scoring_pending') then raise; end if;
     end;
   end if;
   if reason is null then
     ready:=ready||jsonb_build_array(f);
     eligible_ids:=eligible_ids||jsonb_build_array(f->>'fixtureId');
   else pending:=pending||jsonb_build_array(f||jsonb_build_object('pendingReason',reason)); end if;
 end loop;
 select coalesce(jsonb_agg(p),'[]') into performances
 from jsonb_array_elements(d->'playerFixtures') p where eligible_ids ? (p->>'fixtureId');
 -- Unknown participation never triggers a substitution or vice-captain promotion.
 select coalesce(jsonb_agg(distinct p->>'fantasyPlayerId'),'[]') into pending_players
 from jsonb_array_elements(d->'playerFixtures') p
 where (not (eligible_ids ? (p->>'fixtureId'))
   or (coalesce((d->>'adaptive')::boolean,false) and (p->>'participationKnown')::boolean is distinct from true)
   or exists(select 1 from jsonb_array_elements(ready) ready_fixture
     where ready_fixture->>'fixtureId'=p->>'fixtureId' and coalesce((ready_fixture#>>'{coverage,anonymous_starter_rows}')::int,0)>0
       and not exists(select 1 from app.player_fixture_performances perf
          where perf.fixture_id=(p->>'fixtureId')::uuid and perf.player_id=(p->>'playerId')::uuid and perf.active)))
   and exists(select 1 from app.fantasy_lineup_players lp
     join app.fantasy_lineups l on l.id=lp.lineup_id
     where l.gameweek_id=p_gameweek_id and l.locked_at is not null
       and lp.fantasy_player_id::text=p->>'fantasyPlayerId');
 return d||jsonb_build_object('incremental',true,'fixtures',ready,'pendingFixtures',pending,
   'pendingPlayerIds',pending_players,'playerFixtures',performances);
end $$;
revoke all on function app_private.fantasy_scoring_input_document(uuid) from public,anon,authenticated,service_role;
