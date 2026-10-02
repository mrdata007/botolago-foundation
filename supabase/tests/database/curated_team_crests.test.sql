begin;

select extensions.no_plan();

select extensions.ok(
  not has_function_privilege(
    'anon',
    'api.service_set_curated_team_crest(text,text,text,text)',
    'execute'
  ),
  'anonymous users cannot set a curated crest'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'api.service_set_curated_team_crest(text,text,text,text)',
    'execute'
  ),
  'signed-in users cannot set a curated crest'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'api.service_set_curated_team_crest(text,text,text,text)',
    'execute'
  ),
  'service role can set a curated crest'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select api.ingest_football_catalog_entity(
  'sportsmonks',
  'team',
  '1002',
  jsonb_build_object(
    'name', 'Curated Crest Team',
    'shortName', 'CCT',
    'code', 'CCT',
    'countryCode', 'MA',
    'crestSourceUrl', 'https://cdn.sportmonks.com/images/soccer/teams/1002.png',
    'freshness', jsonb_build_object(
      'updatedAt', statement_timestamp(),
      'sourceSequence', 1002,
      'sourceVersion', 'sportsmonks:1002:curated-crest-test'
    )
  )
);

select api.attach_football_team_crest(
  'sportsmonks',
  '1002',
  'https://cdn.sportmonks.com/images/soccer/teams/1002.png',
  'football/teams/1002/crest.png',
  'image/png',
  statement_timestamp()
);

select extensions.is(
  api.service_set_curated_team_crest(
    '1002',
    'football/teams/1002/crest-curated.png',
    'image/png',
    'Supplied by BotolaGO'
  ) ->> 'storagePath',
  'football/teams/1002/crest-curated.png',
  'a curated crest is linked to the team'
);

-- The provider sync runs again: it must not take the team back.
select api.attach_football_team_crest(
  'sportsmonks',
  '1002',
  'https://cdn.sportmonks.com/images/soccer/teams/1002.png',
  'football/teams/1002/crest.png',
  'image/png',
  statement_timestamp()
);

select extensions.throws_ok(
  $$select api.service_set_curated_team_crest(
    '1002', 'football/teams/1002/crest.png', 'image/png', 'Supplied by BotolaGO'
  )$$,
  '22023',
  'INVALID_CREST_PAYLOAD',
  'the curated path is the only path accepted'
);
select extensions.throws_ok(
  $$select api.service_set_curated_team_crest(
    '1002', 'football/teams/1002/crest-curated.png', 'image/png', 'SportsMonks Football API'
  )$$,
  '22023',
  'INVALID_CREST_PAYLOAD',
  'a curated crest cannot claim the provider as its source'
);
select extensions.throws_ok(
  $$select api.service_set_curated_team_crest(
    '999999', 'football/teams/999999/crest-curated.png', 'image/png', 'Supplied by BotolaGO'
  )$$,
  'P0002',
  'MAPPING_NOT_FOUND',
  'an unknown team is refused'
);

reset role;

select extensions.is(
  (
    select media.storage_path
    from app.teams team
    join app.media_assets media on media.id = team.crest_asset_id
    where team.name = 'Curated Crest Team'
  ),
  'football/teams/1002/crest-curated.png',
  'the provider sync left the curated crest in place'
);
select extensions.is(
  (
    select media.attribution
    from app.teams team
    join app.media_assets media on media.id = team.crest_asset_id
    where team.name = 'Curated Crest Team'
  ),
  'Supplied by BotolaGO',
  'the curated crest keeps its own attribution'
);

select * from extensions.finish();

rollback;
