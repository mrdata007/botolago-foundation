begin;

select extensions.no_plan();

-- Privileges: the inspector is private; the api entry points keep their grants.
select extensions.ok(
  not has_function_privilege(
    'anon', 'app_private.fantasy_rating_inputs_degenerate(uuid)', 'execute'
  ),
  'anonymous clients cannot call the private rating degeneracy inspector'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated', 'app_private.fantasy_rating_inputs_degenerate(uuid)', 'execute'
  ),
  'authenticated clients cannot call the private rating degeneracy inspector'
);
select extensions.ok(
  not has_function_privilege(
    'service_role', 'app_private.fantasy_rating_inputs_degenerate(uuid)', 'execute'
  ),
  'the service role reaches the inspector only through the api functions'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'api.preview_fantasy_catalog_activation(uuid,text,integer,integer,integer,integer,integer)',
    'execute'
  ),
  'the service role keeps its preview grant after the guard migration'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'api.service_stage_fantasy_catalog(uuid,text,text,uuid,integer,integer,integer,integer,integer)',
    'execute'
  ),
  'the service role keeps its stage grant after the guard migration'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'api.service_stage_fantasy_catalog(uuid,text,text,uuid,integer,integer,integer,integer,integer)',
    'execute'
  ),
  'authenticated clients still cannot stage a Fantasy catalog'
);

-- A season without candidates is not degenerate (nothing to price).
select extensions.is(
  app_private.fantasy_rating_inputs_degenerate('d9200000-0000-4000-8000-0000000000ff'),
  '{"candidates": 0, "degenerate": false, "maxConfidence": null, "distinctRatings": 0}'::jsonb,
  'a season with no candidates reports zero candidates and is not degenerate'
);

-- Deterministic 16-club fixture identical in shape to the catalog activation
-- test, under its own identifiers.
insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('d9000000-0000-4000-8000-000000000001', 'MA', 'MAR');

insert into app.competitions (
  id, slug, name, short_name, competition_type, country_id, active
) values (
  'd9100000-0000-4000-8000-000000000001',
  'degeneracy-guard-league', 'Degeneracy Guard League', 'DGL',
  'league', 'd9000000-0000-4000-8000-000000000001', true
);

insert into app.seasons (
  id, competition_id, label, starts_on, ends_on, status, is_current
) values
  (
    'd9200000-0000-4000-8000-000000000001',
    'd9100000-0000-4000-8000-000000000001', 'Prior Season',
    current_date - 400, current_date - 40, 'completed', false
  ),
  (
    'd9200000-0000-4000-8000-000000000002',
    'd9100000-0000-4000-8000-000000000001', 'Guarded Season',
    current_date + 40, current_date + 300, 'planned', true
  );

insert into app.teams (
  id, slug, name, short_name, code, country_id, active
)
select md5('degeneracy-team:' || team_number)::uuid,
  'degeneracy-team-' || team_number,
  'Degeneracy Team ' || team_number,
  'Team ' || team_number,
  'D' || lpad(team_number::text, 2, '0'),
  'd9000000-0000-4000-8000-000000000001', true
from generate_series(1, 16) team_number;

insert into app.players (
  id, slug, full_name, display_name, position, active
)
select md5('degeneracy-player:' || team_number || ':' || player_number)::uuid,
  'degeneracy-player-' || team_number || '-' || player_number,
  'Degeneracy Player ' || team_number || ' ' || player_number,
  'Player ' || team_number || '-' || player_number,
  case
    when player_number <= 2 then 'goalkeeper'::app.football_position
    when player_number <= 7 then 'defender'::app.football_position
    when player_number <= 12 then 'midfielder'::app.football_position
    else 'forward'::app.football_position
  end,
  true
from generate_series(1, 16) team_number
cross join generate_series(1, 15) player_number;

insert into app.team_memberships (
  id, player_id, team_id, season_id, shirt_number, squad_role,
  valid_from, active
)
select md5('degeneracy-membership:' || team_number || ':' || player_number)::uuid,
  md5('degeneracy-player:' || team_number || ':' || player_number)::uuid,
  md5('degeneracy-team:' || team_number)::uuid,
  'd9200000-0000-4000-8000-000000000002',
  player_number, 'player', current_date + 40, true
from generate_series(1, 16) team_number
cross join generate_series(1, 15) player_number;

insert into app.rounds (
  id, season_id, round_number, name, starts_at, ends_at, status
)
select md5('degeneracy-round:' || round_number)::uuid,
  'd9200000-0000-4000-8000-000000000002', round_number,
  'Gameweek ' || round_number,
  statement_timestamp() + interval '45 days' + (round_number - 1) * interval '7 days',
  statement_timestamp() + interval '47 days' + (round_number - 1) * interval '7 days',
  'planned'
from generate_series(1, 30) round_number;

with pairings as (
  select round_number, match_number,
    case
      when match_number = 0 then 16
      else mod((case when round_number > 15 then round_number - 15 else round_number end)
        - 1 + match_number, 15) + 1
    end as first_team,
    case
      when match_number = 0
        then case when round_number > 15 then round_number - 15 else round_number end
      else mod((case when round_number > 15 then round_number - 15 else round_number end)
        - 1 - match_number + 150, 15) + 1
    end as second_team
  from generate_series(1, 30) round_number
  cross join generate_series(0, 7) match_number
), fixtures as (
  select round_number, match_number,
    case when round_number <= 15 then first_team else second_team end as home_team,
    case when round_number <= 15 then second_team else first_team end as away_team
  from pairings
)
insert into app.fixtures (
  id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, period, provider_updated_at, source_sequence,
  source_version
)
select md5('degeneracy-fixture:' || round_number || ':' || match_number)::uuid,
  'd9100000-0000-4000-8000-000000000001',
  'd9200000-0000-4000-8000-000000000002',
  md5('degeneracy-round:' || round_number)::uuid,
  md5('degeneracy-team:' || home_team)::uuid,
  md5('degeneracy-team:' || away_team)::uuid,
  statement_timestamp() + interval '45 days'
    + (round_number - 1) * interval '7 days'
    + match_number * interval '1 hour',
  'scheduled', 'pre_match', statement_timestamp(),
  (round_number * 10 + match_number)::bigint,
  'degeneracy-test:v1'
from fixtures;

-- Scenario 1: no rating rows at all. Every candidate resolves to the
-- 6.0 / 0 fallback, which is exactly the degenerate signature.
select extensions.is(
  app_private.fantasy_rating_inputs_degenerate('d9200000-0000-4000-8000-000000000002'),
  '{"candidates": 240, "degenerate": true, "maxConfidence": 0.0, "distinctRatings": 1}'::jsonb,
  'a season whose candidates all fall back to 6.0 / 0 is reported as degenerate'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select set_config(
  'test.degenerate_preview',
  api.preview_fantasy_catalog_activation(
    'd9200000-0000-4000-8000-000000000002',
    'botolago-fantasy-v1.1', 16, 30, 240, 240, 800
  )::text,
  true
);
select extensions.ok(
  (current_setting('test.degenerate_preview')::jsonb ->> 'ready')::boolean,
  'the structural preview still passes on degenerate rating inputs (unchanged blockers)'
);
select extensions.is(
  current_setting('test.degenerate_preview')::jsonb -> 'blockers',
  '[]'::jsonb,
  'the degeneracy signal is reported separately and does not alter the blocker list'
);
select extensions.ok(
  (current_setting('test.degenerate_preview')::jsonb
    -> 'ratingDegeneracy' ->> 'degenerate')::boolean,
  'the preview loudly reports ratingDegeneracy.degenerate = true'
);
select extensions.is(
  current_setting('test.degenerate_preview')::jsonb -> 'ratingDegeneracy' ->> 'candidates',
  '240',
  'the preview degeneracy report counts every catalog candidate'
);
select extensions.is(
  current_setting('test.degenerate_preview')::jsonb -> 'ratingDegeneracy' ->> 'distinctRatings',
  '1',
  'the preview degeneracy report shows a single distinct source rating'
);
select extensions.ok(
  (current_setting('test.degenerate_preview')::jsonb ->> 'sourceDigest')
    ~ '^[0-9a-f]{64}$',
  'the preview still emits its immutable source digest'
);

select extensions.throws_ok(
  format(
    $$select api.service_stage_fantasy_catalog(
      'd9200000-0000-4000-8000-000000000002',
      'botolago-fantasy-v1.1', %L,
      'd9400000-0000-4000-8000-000000000001', 16, 30, 240, 240, 800
    )$$,
    current_setting('test.degenerate_preview')::jsonb ->> 'sourceDigest'
  ),
  'PT409',
  'fantasy_rating_inputs_degenerate',
  'staging refuses degenerate rating inputs with an explicit error'
);
reset role;

select extensions.is(
  (select count(*)::integer from app.fantasy_seasons
   where football_season_id = 'd9200000-0000-4000-8000-000000000002'),
  0,
  'the refused stage creates no Fantasy season'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_competitions
   where football_competition_id = 'd9100000-0000-4000-8000-000000000001'),
  0,
  'the refused stage creates no Fantasy competition'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_players fantasy_player
   join app.fantasy_seasons fantasy_season on fantasy_season.id = fantasy_player.fantasy_season_id
   where fantasy_season.football_season_id = 'd9200000-0000-4000-8000-000000000002'),
  0,
  'the refused stage inserts zero Fantasy players'
);
select extensions.is(
  (select count(*)::integer from app_private.fantasy_initial_price_evidence evidence
   join app.fantasy_players fantasy_player on fantasy_player.id = evidence.fantasy_player_id
   join app.fantasy_seasons fantasy_season on fantasy_season.id = fantasy_player.fantasy_season_id
   where fantasy_season.football_season_id = 'd9200000-0000-4000-8000-000000000002'),
  0,
  'the refused stage writes zero price evidence rows'
);
select extensions.is(
  (select count(*)::integer from app_private.fantasy_catalog_activation_runs
   where football_season_id = 'd9200000-0000-4000-8000-000000000002'),
  0,
  'the refused stage journals no activation run'
);

-- Scenario 2: the production signature - one active placeholder row per
-- player, all rating 6.0 / confidence 0 with no minutes. Still degenerate.
insert into app.player_season_ratings (
  id, football_season_id, player_id, position, source_provider,
  source_version, algorithm_version, appearances, starts, minutes,
  goals, assists, clean_sheets, goals_conceded, saves, penalties_saved,
  penalties_missed, yellow_cards, red_cards, second_yellow_dismissals,
  own_goals, provider_rating, fantasy_equivalent_points, points_per_90,
  confidence, rating, active, source_updated_at
)
select md5('degeneracy-rating:' || team_number || ':' || player_number)::uuid,
  'd9200000-0000-4000-8000-000000000001',
  md5('degeneracy-player:' || team_number || ':' || player_number)::uuid,
  case
    when player_number <= 2 then 'goalkeeper'::app.football_position
    when player_number <= 7 then 'defender'::app.football_position
    when player_number <= 12 then 'midfielder'::app.football_position
    else 'forward'::app.football_position
  end,
  'sportsmonks', 'degeneracy-test:v1', 'botolago-preseason-rating-v1',
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, null, 0, 0,
  0, 6, true, statement_timestamp()
from generate_series(1, 16) team_number
cross join generate_series(1, 15) player_number;

select extensions.ok(
  (app_private.fantasy_rating_inputs_degenerate('d9200000-0000-4000-8000-000000000002')
    ->> 'degenerate')::boolean,
  'a full set of persisted 6.0 / 0 placeholder ratings is still degenerate'
);
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config(
  'test.placeholder_preview',
  api.preview_fantasy_catalog_activation(
    'd9200000-0000-4000-8000-000000000002',
    'botolago-fantasy-v1.1', 16, 30, 240, 240, 800
  )::text,
  true
);
select extensions.is(
  current_setting('test.placeholder_preview')::jsonb -> 'counts' ->> 'ratedPlayers',
  '240',
  'placeholder ratings count as rated players, which is why the guard exists'
);
select extensions.throws_ok(
  format(
    $$select api.service_stage_fantasy_catalog(
      'd9200000-0000-4000-8000-000000000002',
      'botolago-fantasy-v1.1', %L,
      'd9400000-0000-4000-8000-000000000002', 16, 30, 240, 240, 800
    )$$,
    current_setting('test.placeholder_preview')::jsonb ->> 'sourceDigest'
  ),
  'PT409',
  'fantasy_rating_inputs_degenerate',
  'staging refuses a catalog fed only by placeholder 6.0 / 0 ratings'
);
reset role;
select extensions.is(
  (select count(*)::integer from app.fantasy_seasons
   where football_season_id = 'd9200000-0000-4000-8000-000000000002'),
  0,
  'the second refused stage still creates no Fantasy season'
);

-- Scenario 3: healthy inputs - one real rating differentiates the set. The
-- stage must behave exactly as before the guard.
update app.player_season_ratings
set rating = 8.8, confidence = 1, appearances = 30, starts = 28, minutes = 2500,
  goals = 14, assists = 12, provider_rating = 8.8,
  fantasy_equivalent_points = 220, points_per_90 = 7.920
where id = md5('degeneracy-rating:1:8')::uuid;

select extensions.is(
  app_private.fantasy_rating_inputs_degenerate('d9200000-0000-4000-8000-000000000002'),
  '{"candidates": 240, "degenerate": false, "maxConfidence": 1.0, "distinctRatings": 2}'::jsonb,
  'one differentiated rating with confidence makes the inputs non-degenerate'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config(
  'test.healthy_preview',
  api.preview_fantasy_catalog_activation(
    'd9200000-0000-4000-8000-000000000002',
    'botolago-fantasy-v1.1', 16, 30, 240, 240, 800
  )::text,
  true
);
select extensions.ok(
  (current_setting('test.healthy_preview')::jsonb ->> 'ready')::boolean,
  'healthy rating inputs pass the activation preview'
);
select extensions.ok(
  not (current_setting('test.healthy_preview')::jsonb
    -> 'ratingDegeneracy' ->> 'degenerate')::boolean,
  'the preview reports ratingDegeneracy.degenerate = false for healthy inputs'
);
select set_config(
  'test.healthy_stage',
  api.service_stage_fantasy_catalog(
    'd9200000-0000-4000-8000-000000000002',
    'botolago-fantasy-v1.1',
    current_setting('test.healthy_preview')::jsonb ->> 'sourceDigest',
    'd9400000-0000-4000-8000-000000000003', 16, 30, 240, 240, 800
  )::text,
  true
);
reset role;

select extensions.is(
  (select count(*)::integer from app.fantasy_players
   where fantasy_season_id = (current_setting('test.healthy_stage')::jsonb
     ->> 'fantasySeasonId')::uuid),
  240,
  'healthy inputs stage the complete Fantasy player catalog as before'
);
select extensions.is(
  (select count(*)::integer from app_private.fantasy_initial_price_evidence evidence
   join app.fantasy_players fantasy_player on fantasy_player.id = evidence.fantasy_player_id
   where fantasy_player.fantasy_season_id = (current_setting('test.healthy_stage')::jsonb
     ->> 'fantasySeasonId')::uuid),
  240,
  'healthy inputs produce one evidence row per staged player'
);
select extensions.is(
  (select price::text from app.fantasy_players
   where fantasy_season_id = (current_setting('test.healthy_stage')::jsonb
       ->> 'fantasySeasonId')::uuid
     and football_player_id = md5('degeneracy-player:1:8')::uuid),
  '12.50',
  'the differentiated midfielder is priced by the unchanged formula'
);
select extensions.is(
  (select count(distinct price)::integer from app.fantasy_players
   where fantasy_season_id = (current_setting('test.healthy_stage')::jsonb
     ->> 'fantasySeasonId')::uuid),
  5,
  'the staged catalog carries the four neutral band prices plus the rated player'
);
select extensions.is(
  (select status::text from app.fantasy_seasons
   where id = (current_setting('test.healthy_stage')::jsonb
     ->> 'fantasySeasonId')::uuid),
  'planned',
  'the guarded stage still leaves the season planned'
);

select * from extensions.finish();
rollback;
