-- P3/P4/P5 controls, only after the real worker has published QA GW1.
-- No historic result, locked lineup or sealed snapshot is rewritten.
begin;
set local lock_timeout='10s';
do $$ begin
 if current_setting('botolago.release_drill',true) is distinct from 'srdrflfrfpwixsllveid' then
   raise exception 'staging_qa_target_refused'; end if;
 if exists(select 1 from cron.job where active)
 or exists(select 1 from app_private.fantasy_worker_lease where released_at is null and expires_at>now())
 or exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled or lifecycle_worker_enabled) then
   raise exception 'staging_qa_writer_window_required'; end if;
 if not exists(select 1 from app.fantasy_gameweeks
   where id='f9600000-0000-4000-8000-000000000021' and status='finalized')
 or not exists(select 1 from app.fantasy_gameweeks
   where id='f9600000-0000-4000-8000-000000000022' and status='open')
 or (select count(*) from app.fantasy_team_gameweek_results
   where gameweek_id='f9600000-0000-4000-8000-000000000021'
     and state='final' and final_score=96 and bench_points=32)<>123 then
   raise exception 'staging_qa_worker_proof_missing'; end if;
 if exists(select 1 from app.fantasy_player_price_history
   where fantasy_player_id='f9600000-0000-4000-8000-000000002001'
     and reason='staging_phone_qa_controlled_change') then
   raise exception 'staging_qa_controls_already_applied'; end if;
end $$;

insert into app.fantasy_player_price_history
 (fantasy_player_id,gameweek_id,old_price,new_price,reason,effective_at,source_version)
select p.id,'f9600000-0000-4000-8000-000000000022',p.price,7.4,
 'staging_phone_qa_controlled_change',statement_timestamp(),
 coalesce((select max(h.source_version) from app.fantasy_player_price_history h where h.fantasy_player_id=p.id),0)+1
from app.fantasy_players p where p.id='f9600000-0000-4000-8000-000000002001';
update app.fantasy_players set price=7.4 where id='f9600000-0000-4000-8000-000000002001';
update app.fantasy_squad_memberships m
set current_sale_price=app_private.fantasy_calculate_sale_price(s.ruleset_id,m.purchase_price,p.price)
from app.fantasy_players p join app.fantasy_seasons s on s.id=p.fantasy_season_id
where m.fantasy_player_id=p.id and p.fantasy_season_id='f9600000-0000-4000-8000-000000000005' and m.sold_at is null;
update app.fantasy_teams t set team_value=(select sum(p.price)
 from app.fantasy_squad_memberships m join app.fantasy_players p on p.id=m.fantasy_player_id
 where m.fantasy_team_id=t.id and m.sold_at is null)
where t.fantasy_season_id='f9600000-0000-4000-8000-000000000005';

-- Owned but unavailable in the buying pool. Identity/history rows remain.
update app.fantasy_players set active=false where id='f9600000-0000-4000-8000-000000002011';
-- Only the newly created non-login synthetic profile is hidden; existing users
-- and all their other seasons are unchanged.
update app.profiles set deleted_at=statement_timestamp()
where id='f9600000-0000-4000-8000-000000090000';

do $$ begin
 if (select count(*) from app.fantasy_squad_memberships
   where fantasy_player_id='f9600000-0000-4000-8000-000000002001'
     and sold_at is null and purchase_price=7 and current_sale_price=7.2)<>123 then
   raise exception 'staging_qa_sale_value_mismatch'; end if;
end $$;
select jsonb_build_object('controlsReady',true,'purchasePrice',7,'marketPrice',7.4,'saleValue',7.2,
 'unavailablePlayer','f9600000-0000-4000-8000-000000002011',
 'privateLeague','f9600000-0000-4000-8000-000000040000');
commit;
