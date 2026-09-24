-- BotolaGO Production V2
-- Pronostics (score predictions), part 6 of 6: Fantasy skips leagues without
-- Fantasy members.
--
-- A league is shared by the two games ("one league, two games"): the row lives
-- in app.fantasy_leagues, Fantasy managers are in app.fantasy_league_memberships
-- and Pronostics-only players are in app.prediction_league_members. A league
-- created from Pronostics starts with no Fantasy member at all.
--
-- The Fantasy finalization worker (scripts/backend/fantasy-lifecycle-runner.ts)
-- walks every active league of the season through this page and makes two
-- ranking calls per league, inside a fixed call budget (maxBatches, default
-- 5000). Ranking a league without Fantasy members writes nothing, so those
-- calls are pure cost, and enough of them would end Fantasy finalization with
-- fantasy_worker_batch_limit. The page now lists only leagues with at least one
-- active Fantasy membership, in both the page and the hasMore probe, so the
-- cursor stays consistent.
--
-- Nothing else changes: same signature, same payload, same grants. A league
-- that gains its first Fantasy member is listed again from the next run.
--
-- Apply only after Fantasy gameweek 1 has been locked and scored in production.
--
-- Plan: docs/backend/PREDICTIONS_DOMAIN_PLAN.md (BG-0146).

create or replace function api.service_fantasy_scoring_league_page(p_gameweek_id uuid,p_after_league_id uuid default null,p_batch_size integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare season_id uuid; ids jsonb; last_id uuid;
begin
  if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
  if p_gameweek_id is null or p_batch_size is null or p_batch_size not between 1 and 100 then raise exception using errcode='PT400',message='validation_failed'; end if;
  select fantasy_season_id into season_id from app.fantasy_gameweeks where id=p_gameweek_id;
  if not found then raise exception using errcode='PT404',message='fantasy_gameweek_not_found'; end if;
  select coalesce(jsonb_agg(id order by id),'[]'::jsonb),(array_agg(id order by id desc))[1] into ids,last_id
    from (select league.id from app.fantasy_leagues league
      where league.fantasy_season_id=season_id and league.active
        and (p_after_league_id is null or league.id>p_after_league_id)
        and exists(select 1 from app.fantasy_league_memberships membership
          where membership.league_id=league.id and membership.status='active')
      order by league.id limit p_batch_size) page;
  return jsonb_build_object('leagueIds',ids,'afterLeagueId',last_id,'hasMore',exists(
    select 1 from app.fantasy_leagues league
    where league.fantasy_season_id=season_id and league.active and league.id>last_id
      and exists(select 1 from app.fantasy_league_memberships membership
        where membership.league_id=league.id and membership.status='active')));
end;
$$;
revoke all on function api.service_fantasy_scoring_league_page(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function api.service_fantasy_scoring_league_page(uuid,uuid,integer) to service_role;
