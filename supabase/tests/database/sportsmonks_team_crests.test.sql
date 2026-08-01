begin;

select extensions.no_plan();

select extensions.ok(
  exists (
    select 1
    from storage.buckets
    where id = 'football-media'
      and public
      and file_size_limit = 2000000
  ),
  'football media bucket is public and bounded'
);
select extensions.ok(
  not has_function_privilege(
    'anon',
    'api.attach_football_team_crest(text,text,text,text,text,timestamptz)',
    'execute'
  ),
  'anonymous users cannot attach provider crests'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'api.attach_football_team_crest(text,text,text,text,text,timestamptz)',
    'execute'
  ),
  'service role can attach provider crests'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select api.ingest_football_catalog_entity(
  'sportsmonks',
  'team',
  '1001',
  jsonb_build_object(
    'name', 'Crest Test Team',
    'shortName', 'CTT',
    'code', 'CTT',
    'countryCode', 'MA',
    'crestSourceUrl', 'https://cdn.sportmonks.com/images/soccer/teams/1001.png',
    'freshness', jsonb_build_object(
      'updatedAt', statement_timestamp(),
      'sourceSequence', 1001,
      'sourceVersion', 'sportsmonks:1001:crest-test'
    )
  )
);

select extensions.is(
  api.attach_football_team_crest(
    'sportsmonks',
    '1001',
    'https://cdn.sportmonks.com/images/soccer/teams/1001.png',
    'football/teams/1001/crest.png',
    'image/png',
    statement_timestamp()
  ) ->> 'storagePath',
  'football/teams/1001/crest.png',
  'validated provider crest is linked to the canonical team'
);

reset role;

select extensions.is(
  (
    select count(*)::integer
    from app.teams team
    join app.media_assets media on media.id = team.crest_asset_id
    where team.name = 'Crest Test Team'
      and media.kind = 'team_crest'
      and media.storage_path = 'football/teams/1001/crest.png'
      and media.validation_status = 'validated'
  ),
  1,
  'one validated managed crest record exists'
);

select * from extensions.finish();
rollback;
