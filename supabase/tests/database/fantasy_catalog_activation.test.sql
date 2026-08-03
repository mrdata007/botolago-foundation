begin;

select extensions.no_plan();

select extensions.ok(
  (select bool_and(relrowsecurity and relforcerowsecurity)
   from pg_class where oid in (
     'app_private.fantasy_initial_price_evidence'::regclass,
     'app_private.fantasy_catalog_activation_runs'::regclass,
     'app_private.fantasy_registration_activation_runs'::regclass
   )),
  'Fantasy activation journals enable and force RLS'
);
select extensions.ok(
  not has_function_privilege(
    'anon',
    'api.preview_fantasy_catalog_activation(uuid,text,integer,integer,integer,integer,integer)',
    'execute'
  ),
  'anonymous clients cannot preview a service-controlled catalog activation'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'api.service_stage_fantasy_catalog(uuid,text,text,uuid,integer,integer,integer,integer,integer)',
    'execute'
  ),
  'authenticated clients cannot stage a Fantasy catalog'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'api.service_stage_fantasy_catalog(uuid,text,text,uuid,integer,integer,integer,integer,integer)',
    'execute'
  ),
  'the trusted service role can reach the guarded catalog transaction'
);

select extensions.is(
  app_private.fantasy_initial_price_v1('GK', 4, 1),
  4.0::numeric,
  'a minimum-rated goalkeeper receives the minimum goalkeeper price'
);
select extensions.is(
  app_private.fantasy_initial_price_v1('MID', 10, 1),
  12.5::numeric,
  'a maximum-rated midfielder receives the maximum midfielder price'
);
select extensions.is(
  app_private.fantasy_initial_price_v1('FWD', 10, 0),
  7.2::numeric,
  'zero-confidence evidence shrinks to the neutral forward price'
);
select extensions.throws_ok(
  $$select app_private.fantasy_initial_price_v1('UNKNOWN', 6, 1)$$,
  'PT400',
  'invalid_initial_price_input',
  'unknown positions cannot be priced'
);

insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('ca000000-0000-4000-8000-000000000001', 'MA', 'MAR');

insert into app.competitions (
  id, slug, name, short_name, competition_type, country_id, active
) values (
  'ca100000-0000-4000-8000-000000000001',
  'catalog-activation-league', 'Catalog Activation League', 'CAL',
  'league', 'ca000000-0000-4000-8000-000000000001', true
);

insert into app.seasons (
  id, competition_id, label, starts_on, ends_on, status, is_current
) values
  (
    'ca200000-0000-4000-8000-000000000001',
    'ca100000-0000-4000-8000-000000000001', 'Prior Season',
    current_date - 400, current_date - 40, 'completed', false
  ),
  (
    'ca200000-0000-4000-8000-000000000002',
    'ca100000-0000-4000-8000-000000000001', 'Activation Season',
    current_date + 40, current_date + 300, 'planned', true
  );

insert into app.teams (
  id, slug, name, short_name, code, country_id, active
)
select md5('catalog-team:' || team_number)::uuid,
  'catalog-team-' || team_number,
  'Catalog Team ' || team_number,
  'Team ' || team_number,
  'C' || lpad(team_number::text, 2, '0'),
  'ca000000-0000-4000-8000-000000000001', true
from generate_series(1, 16) team_number;

insert into app.players (
  id, slug, full_name, display_name, position, active
)
select md5('catalog-player:' || team_number || ':' || player_number)::uuid,
  'catalog-player-' || team_number || '-' || player_number,
  'Catalog Player ' || team_number || ' ' || player_number,
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
select md5('catalog-membership:' || team_number || ':' || player_number)::uuid,
  md5('catalog-player:' || team_number || ':' || player_number)::uuid,
  md5('catalog-team:' || team_number)::uuid,
  'ca200000-0000-4000-8000-000000000002',
  player_number, 'player', current_date + 40, true
from generate_series(1, 16) team_number
cross join generate_series(1, 15) player_number;

insert into app.player_season_ratings (
  id, football_season_id, player_id, position, source_provider,
  source_version, algorithm_version, appearances, starts, minutes,
  goals, assists, clean_sheets, goals_conceded, saves, penalties_saved,
  penalties_missed, yellow_cards, red_cards, second_yellow_dismissals,
  own_goals, provider_rating, fantasy_equivalent_points, points_per_90,
  confidence, rating, active, source_updated_at
) values
  (
    'ca300000-0000-4000-8000-000000000001',
    'ca200000-0000-4000-8000-000000000001',
    md5('catalog-player:1:8')::uuid, 'midfielder', 'sportsmonks',
    'catalog-test:v1', 'botolago-preseason-rating-v1', 30, 28, 2500,
    14, 12, 8, 20, 0, 0, 0, 2, 0, 0, 0, 8.8, 220, 7.920,
    1, 10, true, statement_timestamp()
  ),
  (
    'ca300000-0000-4000-8000-000000000002',
    'ca200000-0000-4000-8000-000000000001',
    md5('catalog-player:1:13')::uuid, 'forward', 'sportsmonks',
    'catalog-test:v1', 'botolago-preseason-rating-v1', 20, 10, 1000,
    1, 1, 0, 0, 0, 0, 0, 3, 0, 0, 0, 5.1, 35, 3.150,
    1, 4, true, statement_timestamp()
  );

insert into app.rounds (
  id, season_id, round_number, name, starts_at, ends_at, status
)
select md5('catalog-round:' || round_number)::uuid,
  'ca200000-0000-4000-8000-000000000002', round_number,
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
select md5('catalog-fixture:' || round_number || ':' || match_number)::uuid,
  'ca100000-0000-4000-8000-000000000001',
  'ca200000-0000-4000-8000-000000000002',
  md5('catalog-round:' || round_number)::uuid,
  md5('catalog-team:' || home_team)::uuid,
  md5('catalog-team:' || away_team)::uuid,
  statement_timestamp() + interval '45 days'
    + (round_number - 1) * interval '7 days'
    + match_number * interval '1 hour',
  'scheduled', 'pre_match', statement_timestamp(),
  (round_number * 10 + match_number)::bigint,
  'catalog-test:v1'
from fixtures;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select set_config(
  'test.catalog_preview',
  api.preview_fantasy_catalog_activation(
    'ca200000-0000-4000-8000-000000000002',
    'botolago-fantasy-v1.1', 16, 30, 240, 240, 800
  )::text,
  true
);
select extensions.ok(
  (current_setting('test.catalog_preview')::jsonb ->> 'ready')::boolean,
  'a complete deterministic 16-club catalog passes the activation preview'
);
select extensions.is(
  current_setting('test.catalog_preview')::jsonb -> 'counts' ->> 'players',
  '240',
  'the activation preview resolves all 240 eligible players exactly once'
);
select extensions.is(
  current_setting('test.catalog_preview')::jsonb -> 'counts' ->> 'ratedPlayers',
  '2',
  'the activation preview reports historical rating coverage honestly'
);
select extensions.is(
  current_setting('test.catalog_preview')::jsonb -> 'counts' ->> 'invalidRounds',
  '0',
  'the deterministic double round-robin fixture topology is complete'
);
select extensions.ok(
  (current_setting('test.catalog_preview')::jsonb ->> 'sourceDigest')
    ~ '^[0-9a-f]{64}$',
  'the preview emits one immutable SHA-256 source digest'
);

select extensions.throws_ok(
  $$select api.service_stage_fantasy_catalog(
    'ca200000-0000-4000-8000-000000000002',
    'botolago-fantasy-v1.1', repeat('0', 64),
    'ca400000-0000-4000-8000-000000000001', 16, 30, 240, 240, 800
  )$$,
  'PT409',
  'stale_update',
  'staging rejects a stale source digest before creating partial state'
);

select set_config(
  'test.catalog_stage',
  api.service_stage_fantasy_catalog(
    'ca200000-0000-4000-8000-000000000002',
    'botolago-fantasy-v1.1',
    current_setting('test.catalog_preview')::jsonb ->> 'sourceDigest',
    'ca400000-0000-4000-8000-000000000001', 16, 30, 240, 240, 800
  )::text,
  true
);
reset role;
select extensions.is(
  (select count(*)::integer from app.fantasy_players
   where fantasy_season_id = (current_setting('test.catalog_stage')::jsonb
     ->> 'fantasySeasonId')::uuid),
  240,
  'the atomic stage operation creates the complete Fantasy player catalog'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_gameweeks
   where fantasy_season_id = (current_setting('test.catalog_stage')::jsonb
     ->> 'fantasySeasonId')::uuid),
  30,
  'the stage operation creates one authoritative gameweek per Football round'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_fixture_assignments
   where fantasy_season_id = (current_setting('test.catalog_stage')::jsonb
     ->> 'fantasySeasonId')::uuid),
  240,
  'the stage operation assigns every eligible fixture exactly once'
);
select extensions.is(
  (select count(*)::integer from app_private.fantasy_initial_price_evidence),
  240,
  'every opening price has immutable evidence'
);
select extensions.is(
  (select price::text from app.fantasy_players
   where fantasy_season_id = (current_setting('test.catalog_stage')::jsonb
       ->> 'fantasySeasonId')::uuid
     and football_player_id = md5('catalog-player:1:8')::uuid),
  '12.50',
  'a fully rated elite midfielder receives the position-band maximum'
);
select extensions.is(
  (select price::text from app.fantasy_players
   where fantasy_season_id = (current_setting('test.catalog_stage')::jsonb
       ->> 'fantasySeasonId')::uuid
     and football_player_id = md5('catalog-player:1:13')::uuid),
  '4.50',
  'a fully rated minimum forward receives the position-band minimum'
);
select extensions.is(
  (select status::text from app.fantasy_seasons
   where id = (current_setting('test.catalog_stage')::jsonb
     ->> 'fantasySeasonId')::uuid),
  'planned',
  'staging does not silently open registration'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  api.service_stage_fantasy_catalog(
    'ca200000-0000-4000-8000-000000000002',
    'botolago-fantasy-v1.1',
    current_setting('test.catalog_preview')::jsonb ->> 'sourceDigest',
    'ca400000-0000-4000-8000-000000000001', 16, 30, 240, 240, 800
  ) ->> 'fantasySeasonId',
  current_setting('test.catalog_stage')::jsonb ->> 'fantasySeasonId',
  'an identical stage retry returns the original authoritative season'
);
select extensions.throws_ok(
  $$select api.service_stage_fantasy_catalog(
    'ca200000-0000-4000-8000-000000000002',
    'botolago-fantasy-v1.1',
    current_setting('test.catalog_preview')::jsonb ->> 'sourceDigest',
    'ca400000-0000-4000-8000-000000000001', 16, 30, 240, 240, 801
  )$$,
  'PT409',
  'idempotency_conflict',
  'an idempotency key cannot be replayed with changed activation bounds'
);

select set_config(
  'test.registration_open',
  api.service_open_fantasy_registration(
    'ca400000-0000-4000-8000-000000000001',
    current_setting('test.catalog_preview')::jsonb ->> 'sourceDigest',
    'ca500000-0000-4000-8000-000000000001'
  )::text,
  true
);
reset role;
select extensions.is(
  (select status::text from app.fantasy_seasons
   where id = (current_setting('test.catalog_stage')::jsonb
     ->> 'fantasySeasonId')::uuid),
  'registration_open',
  'the separate open transaction moves the staged season into registration'
);
select extensions.is(
  (select status::text from app.fantasy_gameweeks
   where id = (current_setting('test.registration_open')::jsonb
     ->> 'firstGameweekId')::uuid),
  'open',
  'the server opens only the first gameweek'
);
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  api.service_open_fantasy_registration(
    'ca400000-0000-4000-8000-000000000001',
    current_setting('test.catalog_preview')::jsonb ->> 'sourceDigest',
    'ca500000-0000-4000-8000-000000000001'
  ) ->> 'firstGameweekId',
  current_setting('test.registration_open')::jsonb ->> 'firstGameweekId',
  'an identical registration retry is idempotent'
);

select set_config(
  'test.catalog_rollback',
  api.service_rollback_fantasy_catalog(
    'ca400000-0000-4000-8000-000000000001',
    current_setting('test.catalog_preview')::jsonb ->> 'sourceDigest'
  )::text,
  true
);
reset role;
select extensions.is(
  current_setting('test.catalog_rollback')::jsonb -> 'removed' ->> 'players',
  '240',
  'rollback reports every removed player'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_seasons
   where football_season_id = 'ca200000-0000-4000-8000-000000000002'),
  0,
  'rollback removes all staged public Fantasy state'
);
select extensions.ok(
  (select rolled_back_at is not null
   from app_private.fantasy_catalog_activation_runs
   where id = 'ca400000-0000-4000-8000-000000000001'),
  'rollback preserves and stamps the private activation journal'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config(
  'test.catalog_restage',
  api.service_stage_fantasy_catalog(
    'ca200000-0000-4000-8000-000000000002',
    'botolago-fantasy-v1.1',
    current_setting('test.catalog_preview')::jsonb ->> 'sourceDigest',
    'ca400000-0000-4000-8000-000000000002', 16, 30, 240, 240, 800
  )::text,
  true
);
select extensions.ok(
  current_setting('test.catalog_restage')::jsonb ->> 'fantasySeasonId'
    <> current_setting('test.catalog_stage')::jsonb ->> 'fantasySeasonId',
  'a fully rolled-back catalog can be safely restaged with a fresh journal key'
);
select api.service_rollback_fantasy_catalog(
  'ca400000-0000-4000-8000-000000000002',
  current_setting('test.catalog_preview')::jsonb ->> 'sourceDigest'
);

reset role;

-- Two active rows for one season can be non-overlapping historically. The
-- preview must still reject both as a duplicate current catalog identity.
update app.team_memberships
set valid_to = current_date + 40
where player_id = md5('catalog-player:1:1')::uuid
  and season_id = 'ca200000-0000-4000-8000-000000000002';
insert into app.team_memberships (
  id, player_id, team_id, season_id, shirt_number, squad_role,
  valid_from, active
) values (
  'ca600000-0000-4000-8000-000000000001',
  md5('catalog-player:1:1')::uuid, md5('catalog-team:2')::uuid,
  'ca200000-0000-4000-8000-000000000002', null, 'player',
  current_date + 41, true
);
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.ok(
  api.preview_fantasy_catalog_activation(
    'ca200000-0000-4000-8000-000000000002',
    'botolago-fantasy-v1.1', 16, 30, 240, 240, 800
  ) -> 'blockers' ? 'duplicate_player_membership',
  'duplicate player memberships block activation explicitly'
);
reset role;

delete from app.fixtures
where id = md5('catalog-fixture:1:0')::uuid;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.ok(
  api.preview_fantasy_catalog_activation(
    'ca200000-0000-4000-8000-000000000002',
    'botolago-fantasy-v1.1', 16, 30, 240, 240, 800
  ) -> 'blockers' ? 'round_topology_invalid',
  'an incomplete fixture round blocks activation'
);
reset role;

select * from extensions.finish();
rollback;
