-- Preserve the measured fixture for review, but remove it from active staging
-- discovery/catalogs. Never deletes or changes the pre-existing 50,005 teams.
begin;
set local lock_timeout='10s';
do $$ begin
 if current_setting('botolago.release_drill',true) is distinct from 'srdrflfrfpwixsllveid'
 or exists(select 1 from cron.job where active)
 or exists(select 1 from app_private.fantasy_worker_lease where released_at is null and expires_at>now())
 or exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled or lifecycle_worker_enabled) then
 raise exception 'staging_retire_writers_or_target_guard'; end if;
 if (select count(*) from app.fantasy_teams where fantasy_season_id='f9500000-0000-4000-8000-000000000005')<>5000
 or not exists(select 1 from app.fantasy_seasons where id='f9500000-0000-4000-8000-000000000005'
   and name='Staging Rating Drill 5000' and status='active')
 or not exists(select 1 from app.fantasy_gameweeks where id='f9500000-0000-4000-8000-000000000021' and status='finalized')
 or (select count(*) from app.fantasy_team_gameweek_results where gameweek_id='f9500000-0000-4000-8000-000000000021'
   and state='final' and final_score=96)<>5000 then
 raise exception 'staging_retire_fixture_not_verified'; end if;
end $$;
update app.fantasy_teams set status='archived'
where fantasy_season_id='f9500000-0000-4000-8000-000000000005';
update app.fantasy_seasons set status='completed' where id='f9500000-0000-4000-8000-000000000005';
update app.seasons set status='completed' where id='f9500000-0000-4000-8000-000000000003';
update app.fantasy_competitions set active=false where id='f9500000-0000-4000-8000-000000000004';
update app.competitions set active=false where id='f9500000-0000-4000-8000-000000000002';
update app.fantasy_leagues set active=false where fantasy_season_id='f9500000-0000-4000-8000-000000000005';
update app.fantasy_players set active=false where fantasy_season_id='f9500000-0000-4000-8000-000000000005';
update app.players set active=false where id in
 (select football_player_id from app.fantasy_players where fantasy_season_id='f9500000-0000-4000-8000-000000000005');
update app.teams set active=false where id in
 (select football_team_id from app.fantasy_players where fantasy_season_id='f9500000-0000-4000-8000-000000000005');
select jsonb_build_object('teams',(select count(*) from app.fantasy_teams),
 'drill_archived',(select count(*) from app.fantasy_teams where fantasy_season_id='f9500000-0000-4000-8000-000000000005' and status='archived'),
 'users',(select count(*) from auth.users),
 'non_load_fingerprint',(select md5(string_agg(to_jsonb(t)::text,'|' order by t.id))
   from app.fantasy_teams t join auth.users u on u.id=t.user_id where u.email not like 'fantasy-load-%@staging.botolago.invalid'));
rollback;
