-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- READ ONLY. Verify the committed identity/catalog repair for fixture 19874705
-- (the 17 reviewed provider players), or show that it has not been applied.
--
-- Nothing here writes: one SELECT, no function with side effects. Run it
-- before the repair (the baseline) and again after; compare the "hash" rows.
-- Every table the repair must NOT touch has a count and a content hash; the
-- tables it adds to are listed with their counts so the deltas can be read off.
--
-- Rows (k, v):
--   target            one line per reviewed provider id: canonical player,
--                     club record(s) this season, Fantasy entry, price history
--   identity_40       the importer's two identity checks for all 40 lineup
--                     players of the fixture (mapping, dated club record)
--   applied_update    the applied-update record(s) of a scoped observation
--   hash:* / count:*  the content fingerprint of every table
-- ============================================================================
with want(ext, pos, price) as (values
  ('37532637','DEF',5.00),('37753134','DEF',5.00),('38227065','DEF',5.00),('38227326','DEF',5.00),('37308657','DEF',5.00),
  ('37901711','GK',4.80),('37947231','GK',4.80),
  ('37612154','MID',7.20),('38227066','MID',7.20),('38227067','MID',7.20),('38227072','MID',7.20),
  ('38227323','MID',7.20),('38227325','MID',7.20),('37640437','MID',7.20),
  ('38227068','FWD',7.20),('38227324','FWD',7.20),('37635144','FWD',7.20)),
season as (select s.id, s.starts_on, s.ends_on from app.seasons s where s.is_current and s.label = '2026/2027'),
mapped as (
  select w.*, m.internal_entity_id as pid
  from want w left join app_private.football_provider_mappings m
    on m.provider_name = 'sportsmonks' and m.entity_type = 'player' and m.external_id = w.ext and m.active),
detail as (
  select mapped.ext,
    format('%s | canonical=%s | %s | position=%s | mappings=%s | clubs=%s | fantasy=%s | price_history=%s',
      mapped.ext, coalesce(mapped.pid::text, 'NONE'), coalesce(p.full_name, '-'), coalesce(p.position::text, '-'),
      (select count(*) from app_private.football_provider_mappings x
        where x.provider_name = 'sportsmonks' and x.entity_type = 'player' and x.external_id = mapped.ext and x.active),
      coalesce((select string_agg(t.name || ' ' || tm.valid_from || '..' || coalesce(tm.valid_to::text, 'open')
          || case when tm.active then '' else ' (inactive)' end, '; ' order by tm.valid_from)
        from app.team_memberships tm join app.teams t on t.id = tm.team_id, season
        where tm.player_id = mapped.pid and tm.season_id = season.id), 'none'),
      coalesce((select pos.code || ' ' || fp.price || ' ' || fp.status || ' active=' || fp.active || ' eligible=' || fp.eligible
        from app.fantasy_players fp join app.fantasy_positions pos on pos.id = fp.position_id
        where fp.football_player_id = mapped.pid limit 1), 'none'),
      (select count(*) from app.fantasy_player_price_history h join app.fantasy_players fp on fp.id = h.fantasy_player_id
        where fp.football_player_id = mapped.pid)) as line
  from mapped left join app.players p on p.id = mapped.pid),
lp(pid, team_ext) as (values
  ('96745','9535'),('96791','9535'),('97716','9535'),('99069','9535'),('102034','9535'),('1477806','9535'),
  ('29720396','9535'),('37308657','9511'),('37317114','9535'),('37317122','9535'),('37317162','9535'),
  ('37532637','9511'),('37544140','9535'),('37548304','9535'),('37550261','9535'),('37560934','9535'),
  ('37593680','9535'),('37612154','9511'),('37620075','9535'),('37635144','9511'),('37640437','9535'),
  ('37656682','9535'),('37677290','9535'),('37677307','9511'),('37699556','9511'),('37753134','9511'),
  ('37775778','9511'),('37787446','9511'),('37901711','9511'),('37947231','9511'),('38201352','9535'),
  ('38227065','9511'),('38227066','9511'),('38227067','9511'),('38227068','9511'),('38227072','9511'),
  ('38227323','9511'),('38227324','9511'),('38227325','9511'),('38227326','9511')),
fixture as (
  select f.* from app.fixtures f join app_private.football_provider_mappings m
    on m.internal_entity_id = f.id and m.entity_type = 'fixture' and m.provider_name = 'sportsmonks'
    and m.active and m.external_id = '19874705'),
identity as (
  select lp.pid,
    case when team.internal_entity_id is null or team.internal_entity_id not in (fixture.home_team_id, fixture.away_team_id) then 'TEAM_MAPPING_BAD'
         when player.internal_entity_id is null then 'NO_MAPPING'
         when not exists (select 1 from app.team_memberships tm join season on season.id = tm.season_id
            where tm.player_id = player.internal_entity_id and tm.team_id = team.internal_entity_id
              and tm.valid_from <= fixture.kickoff_at::date and (tm.valid_to is null or tm.valid_to >= fixture.kickoff_at::date))
           then 'MAPPED_NO_MEMBERSHIP_FOR_TEAM'
         else 'OK' end as class
  from lp cross join fixture
  left join app_private.football_provider_mappings team on team.provider_name = 'sportsmonks' and team.entity_type = 'team' and team.external_id = lp.team_ext and team.active
  left join app_private.football_provider_mappings player on player.provider_name = 'sportsmonks' and player.entity_type = 'player' and player.external_id = lp.pid and player.active)
select 'now' as k, statement_timestamp()::text as v
union all select 'target ' || ext, line from detail
union all select 'identity_40 ' || class, count(*)::text || coalesce(' [' || string_agg(pid, ',' order by pid) filter (where class <> 'OK') || ']', '') from identity group by class
union all select 'applied_update', coalesce((select string_agg(format('update=%s observation=%s digest=%s at=%s result=%s', u.id, u.observation_id, u.plan_digest, u.applied_at, left(u.result::text, 220)), ' || ' order by u.applied_at)
    from app_private.current_player_list_updates u), 'none')
union all select 'count:players', count(*)::text from app.players
union all select 'hash:players', md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app.players t
union all select 'hash:provider_mappings', count(*) || ' ' || md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app_private.football_provider_mappings t
union all select 'hash:team_memberships', count(*) || ' ' || md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app.team_memberships t
union all select 'hash:fantasy_players', count(*) || ' ' || md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app.fantasy_players t
union all select 'hash:price_history', count(*) || ' ' || md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from app.fantasy_player_price_history t
union all select 'hash:initial_price_evidence', count(*) || ' ' || md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from app_private.fantasy_initial_price_evidence t
union all select 'hash:observations', count(*) || ' ' || md5(coalesce(string_agg(t.id::text || t.observation_digest, '|' order by t.id), '')) from app_private.current_player_list_observations t
union all select 'hash:updates', count(*) || ' ' || md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from app_private.current_player_list_updates t
union all select 'hash:scoring_snapshots', count(*) || ' ' || md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from app_private.fantasy_scoring_snapshots t
union all select 'hash:lineups', count(*) || ' ' || md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from app.fantasy_lineups t
union all select 'hash:lineup_players', count(*) || ' ' || md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from app.fantasy_lineup_players t
union all select 'hash:squad_memberships', count(*) || ' ' || md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app.fantasy_squad_memberships t
union all select 'hash:fantasy_teams', count(*) || ' ' || md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app.fantasy_teams t
union all select 'hash:gameweeks', count(*) || ' ' || md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app.fantasy_gameweeks t
union all select 'hash:point_events', count(*) || ' ' || md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from app.fantasy_player_point_events t
union all select 'hash:gameweek_points', count(*) || ' ' || md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from app.fantasy_player_gameweek_points t
union all select 'hash:performances', count(*) || ' ' || md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from app.player_fixture_performances t
union all select 'hash:performance_coverage', count(*) || ' ' || md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from app_private.historical_performance_fixture_coverage t
union all select 'hash:automation_settings', md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from app_private.fantasy_automation_settings t
union all select 'hash:adaptive_policy', count(*) || ' ' || md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from app_private.fantasy_adaptive_policy t
union all select 'hash:cron_jobs', count(*) || ' ' || md5(coalesce(string_agg(jobid || schedule || active::text || command, '|' order by jobid), '')) from cron.job
union all select 'flag:lifecycle_tick_enabled', lifecycle_tick_enabled::text from app_private.fantasy_automation_settings
union all select 'flag:live_refresh_enabled', football_live_refresh_enabled::text from app_private.notification_email_settings
union all select 'unfinished_cron_runs', count(*)::text from cron.job_run_details where status not in ('succeeded', 'failed')
order by 1;
