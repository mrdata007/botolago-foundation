begin;

select extensions.no_plan();

-- The data desk (20260926080000): the sweep opens and closes issues, fans
-- report errors under a limit, staff close issues, and nothing is removed.

-- A current season with one match.
insert into app.competitions (id, slug, name, competition_type)
values ('c1000000-0000-4000-8000-000000000001', 'desk-league', 'Desk League', 'league');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, is_current, status)
values ('c1100000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
  '2026/2027', '2026-07-01', '2027-06-30', true, 'active');
insert into app.teams (id, slug, name, short_name) values
  ('c1200000-0000-4000-8000-000000000001', 'desk-home', 'Desk Home', 'Home'),
  ('c1200000-0000-4000-8000-000000000002', 'desk-away', 'Desk Away', 'Away');
insert into app.fixtures (id, competition_id, season_id, home_team_id, away_team_id,
  kickoff_at, provider_updated_at, status, home_score, away_score)
values ('c1300000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
  'c1100000-0000-4000-8000-000000000001', 'c1200000-0000-4000-8000-000000000001',
  'c1200000-0000-4000-8000-000000000002', '2026-09-24T19:00:00Z', '2026-09-24T21:00:00Z',
  'finished', 1, 0);

insert into app.players (id, slug, full_name, display_name, position) values
  ('c2000000-0000-4000-8000-000000000001', 'desk-squad', 'Desk Squad', 'D. Squad', 'defender'),
  ('c2000000-0000-4000-8000-000000000002', 'desk-minutes', 'Desk Minutes', 'D. Minutes', 'forward'),
  ('c2000000-0000-4000-8000-000000000003', 'desk-known', 'Desk Known', 'D. Known', 'midfielder'),
  ('c2000000-0000-4000-8000-000000000004', 'desk-idle', 'Desk Idle', 'D. Idle', 'goalkeeper');

-- Player 1: in the squad, no date of birth.
insert into app.team_memberships (player_id, team_id, season_id, valid_from, active)
values ('c2000000-0000-4000-8000-000000000001', 'c1200000-0000-4000-8000-000000000001',
  'c1100000-0000-4000-8000-000000000001', '2026-07-01', true);
-- Player 2: played, no date of birth, no membership.
insert into app.player_fixture_performances (
  football_season_id, fixture_id, player_id, team_id, position, source_provider, source_version,
  started, appeared, minutes, goals, assists, clean_sheets, goals_conceded, penalties_missed,
  yellow_cards, red_cards, second_yellow_dismissals, own_goals, provider_observed_at
) values (
  'c1100000-0000-4000-8000-000000000001', 'c1300000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000002', 'c1200000-0000-4000-8000-000000000001', 'forward',
  'sportsmonks', 'sportsmonks:' || repeat('a', 64), true, true, 90, 1, 0, 0, 0, 0, 0, 0, 0, 0,
  '2026-09-24T21:00:00Z'
);
-- Player 3: a date of birth two sources disagree on.
do $$
begin
  perform app_private.record_player_attribute_observation('c2000000-0000-4000-8000-000000000003',
    'date_of_birth', '2004-01-01', null, 'provider', 'sportsmonks', 'sm:3', '2026-09-01T00:00:00Z');
  perform app_private.record_player_attribute_observation('c2000000-0000-4000-8000-000000000003',
    'date_of_birth', '2004-01-02', null, 'provider', 'bsd', 'bsd:3', '2026-09-02T00:00:00Z');
  perform app_private.resolve_player_attributes(array['c2000000-0000-4000-8000-000000000003'::uuid]);
end;
$$;
-- A lineup entry with only a name.
insert into app.lineups (id, fixture_id, team_id, provider_updated_at)
values ('c1400000-0000-4000-8000-000000000001', 'c1300000-0000-4000-8000-000000000001',
  'c1200000-0000-4000-8000-000000000001', '2026-09-24T21:00:00Z');
insert into app.lineup_players (id, lineup_id, slot, display_order, player_name)
values ('c1500000-0000-4000-8000-000000000001', 'c1400000-0000-4000-8000-000000000001',
  'starting', 1, 'Unknown Starter');

-- ---------------------------------------------------------------------------
-- The sweep opens
-- ---------------------------------------------------------------------------
select extensions.is(
  app_private.pepites_current_season(),
  'c1100000-0000-4000-8000-000000000001'::uuid,
  'the current season is found'
);
select extensions.is(
  (app_private.data_desk_sweep() ->> 'opened')::integer,
  4,
  'the first sweep opens four issues'
);
select extensions.is(
  (select pg_catalog.string_agg(entity_type || ':' || field || ':' || kind, ',' order by entity_type, field, entity_id)
   from app_private.data_desk_issues where status = 'open'),
  'lineup_player:player_id:unlinked,player:date_of_birth:missing,player:date_of_birth:missing,player:date_of_birth:conflict',
  'a missing date for the squad player and for the player with minutes, a conflict, an unlinked lineup entry'
);
select extensions.ok(
  not exists (select 1 from app_private.data_desk_issues
    where entity_id = 'c2000000-0000-4000-8000-000000000004'),
  'a player outside the season''s squads and matches raises nothing'
);
select extensions.is(
  (app_private.data_desk_sweep() ->> 'opened')::integer,
  0,
  'sweeping again opens nothing new: one open issue per entity, field and kind'
);

-- ---------------------------------------------------------------------------
-- The sweep closes what it opened once the cause is gone
-- ---------------------------------------------------------------------------
do $$
begin
  perform app_private.record_player_attribute_observation('c2000000-0000-4000-8000-000000000002',
    'date_of_birth', '2005-05-05', null, 'provider', 'sportsmonks', 'sm:2', '2026-09-25T00:00:00Z');
  perform app_private.resolve_player_attributes(array['c2000000-0000-4000-8000-000000000002'::uuid]);
end;
$$;
update app.lineup_players set player_id = 'c2000000-0000-4000-8000-000000000004'
where id = 'c1500000-0000-4000-8000-000000000001';
select extensions.is(
  (app_private.data_desk_sweep() ->> 'closed')::integer,
  2,
  'the date now known and the linked lineup entry close their issues'
);
select extensions.is(
  (select resolution_note from app_private.data_desk_issues
   where entity_id = 'c2000000-0000-4000-8000-000000000002'),
  'Cause gone (sweep)',
  'and say why'
);

-- ---------------------------------------------------------------------------
-- A photo whose rights no longer hold
-- ---------------------------------------------------------------------------
do $$
declare
  v_release uuid;
  v_player uuid := 'c2000000-0000-4000-8000-000000000003';
begin
  -- Settle the conflict first: a manual date, an adult on the capture date.
  perform app_private.record_player_attribute_observation(v_player, 'date_of_birth', '2004-01-01',
    null, 'manual', null, 'desk', '2026-09-03T00:00:00Z', 'c9000000-0000-4000-8000-000000000001', 'Checked');
  perform app_private.resolve_player_attributes(array[v_player]);
  insert into storage.objects (bucket_id, name) values
    ('player-photo-intake', 'players/' || v_player || '/d0000001-0000-4000-8000-000000000001.jpg'),
    ('player-photo-releases', 'players/' || v_player || '/release.pdf');
  v_release := app_private.submit_player_photo_release(v_player,
    'players/' || v_player || '/d0000001-0000-4000-8000-000000000001.jpg',
    'players/' || v_player || '/release.pdf', '2026-09-01', '2026-09-01', 'player', 'in_app',
    'club_licence', 'Club', 'Club', null, 'c9000000-0000-4000-8000-000000000001');
  perform app_private.approve_player_photo_release(v_release, 'c9000000-0000-4000-8000-000000000001');
  insert into storage.objects (bucket_id, name)
  values ('football-media', 'football/players/' || v_player || '/' || v_release || '.webp');
  perform app_private.publish_player_photo_release(v_release,
    'football/players/' || v_player || '/' || v_release || '.webp', 512, 512, 'image/webp');
  -- Then the date is corrected: he was 17 when the photo was taken.
  perform app_private.record_player_attribute_observation(v_player, 'date_of_birth', '2009-01-01',
    null, 'manual', null, 'desk', '2026-09-04T00:00:00Z', 'c9000000-0000-4000-8000-000000000001', 'Corrected');
  perform app_private.resolve_player_attributes(array[v_player]);
end;
$$;
select app_private.data_desk_sweep();
select extensions.ok(
  exists (select 1 from app_private.data_desk_issues
    where entity_type = 'photo' and field = 'rights' and status = 'open'
      and details -> 'problems' ? 'guardian_required'),
  'a published photo that now needs a guardian release is raised for the desk'
);

-- ---------------------------------------------------------------------------
-- Fan reports
-- ---------------------------------------------------------------------------
select extensions.throws_ok(
  $$select app_private.report_data_issue('player', 'c2000000-0000-4000-8000-000000000001',
    'date_of_birth', 'Wrong year', null)$$,
  'PT401', 'data_desk_unauthenticated',
  'a report needs a signed-in account'
);
select extensions.throws_ok(
  $$select app_private.report_data_issue('player', 'c2000000-0000-4000-8000-000000000001',
    'password', 'Wrong year', 'c9100000-0000-4000-8000-000000000001')$$,
  '22023', 'DATA_DESK_REPORT_INVALID',
  'only known fields can be reported'
);
select extensions.is(
  app_private.report_data_issue('player', 'c2000000-0000-4000-8000-000000000001',
    'date_of_birth', 'He was born in 2003', 'c9100000-0000-4000-8000-000000000001'),
  app_private.report_data_issue('player', 'c2000000-0000-4000-8000-000000000001',
    'date_of_birth', 'Again: 2003', 'c9100000-0000-4000-8000-000000000001'),
  'the same fan reporting the same field again adds nothing'
);
select app_private.report_data_issue('player', 'c2000000-0000-4000-8000-000000000001',
  field, 'Report ' || field, 'c9100000-0000-4000-8000-000000000001')
from unnest(array['nationality', 'preferred_foot', 'height_cm', 'club']) field;
select extensions.throws_ok(
  $$select app_private.report_data_issue('player', 'c2000000-0000-4000-8000-000000000001',
    'name', 'Sixth report', 'c9100000-0000-4000-8000-000000000001')$$,
  'PT429', 'data_desk_rate_limited',
  'a sixth report within a day is refused'
);
select extensions.lives_ok(
  $$select app_private.report_data_issue('player', 'c2000000-0000-4000-8000-000000000001',
    'date_of_birth', 'Another fan agrees', 'c9100000-0000-4000-8000-000000000002')$$,
  'another fan can report the same field'
);

-- ---------------------------------------------------------------------------
-- Staff close; nothing is edited back or removed
-- ---------------------------------------------------------------------------
select app_private.close_data_desk_issue(
  (select id from app_private.data_desk_issues where kind = 'conflict' and entity_type = 'player'
     and status = 'open' limit 1),
  'resolved', 'Manual date recorded from the birth certificate', 'c9000000-0000-4000-8000-000000000001');
select extensions.is(
  (select count(*)::integer from app_private.data_desk_issues
   where kind = 'conflict' and entity_type = 'player' and status = 'resolved' and resolved_by is not null),
  1,
  'staff resolve an issue, recorded with who and why'
);
select app_private.data_desk_sweep();
select extensions.is(
  (select count(*)::integer from app_private.data_desk_issues
   where kind = 'conflict' and entity_type = 'player' and status = 'open'),
  0,
  'a disagreement a person closed is not reopened while the values stay the same'
);
do $$
begin
  perform app_private.record_player_attribute_observation('c2000000-0000-4000-8000-000000000003',
    'date_of_birth', '2004-01-09', null, 'provider', 'bsd', 'bsd:3', '2026-09-26T00:00:00Z');
end;
$$;
select app_private.data_desk_sweep();
select extensions.is(
  (select count(*)::integer from app_private.data_desk_issues
   where kind = 'conflict' and entity_type = 'player' and status = 'open'),
  1,
  'it is raised again when a source changes its value'
);
select extensions.throws_ok(
  format('select app_private.close_data_desk_issue(%L, %L, %L, %L)',
    (select id from app_private.data_desk_issues where status = 'resolved' limit 1),
    'dismissed', 'Again', 'c9000000-0000-4000-8000-000000000001'),
  'P0002', 'DATA_DESK_ISSUE_NOT_OPEN',
  'a closed issue cannot be closed again'
);
select extensions.throws_ok(
  format('update app_private.data_desk_issues set status = %L, resolved_at = null, resolution_note = null where id = %L',
    'open', (select id from app_private.data_desk_issues where status = 'resolved' limit 1)),
  '55000', 'DATA_DESK_ISSUE_IMMUTABLE',
  'a closed issue stays closed'
);
select extensions.throws_ok(
  $$delete from app_private.data_desk_issues$$,
  '55000', 'DATA_DESK_ISSUE_IMMUTABLE',
  'issues cannot be deleted'
);
select extensions.throws_ok(
  $$truncate app_private.data_desk_issues$$,
  '55000', 'DATA_DESK_ISSUE_IMMUTABLE',
  'issues cannot be truncated'
);
select extensions.ok(
  not exists (
    select 1
    from unnest(array['anon', 'authenticated', 'service_role']) role_name
    cross join unnest(array[
      'app_private.data_desk_sweep(uuid)',
      'app_private.report_data_issue(text,uuid,text,text,uuid)',
      'app_private.close_data_desk_issue(uuid,text,text,uuid)',
      'app_private.pepites_current_season()'
    ]) function_signature
    where pg_catalog.has_function_privilege(role_name, function_signature, 'execute')
  )
  and not exists (
    select 1 from unnest(array['anon', 'authenticated', 'service_role']) role_name
    where pg_catalog.has_table_privilege(role_name, 'app_private.data_desk_issues', 'select')
  ),
  'no client role can call the desk functions or read the issues'
);

select * from extensions.finish();

rollback;
