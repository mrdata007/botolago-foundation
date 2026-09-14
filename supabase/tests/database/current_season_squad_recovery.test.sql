begin;
select extensions.no_plan();

select extensions.ok(
  not has_function_privilege('anon', 'api.service_ingest_current_football_squads(text,text,jsonb,timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'api.service_ingest_current_football_squads(text,text,jsonb,timestamptz)', 'execute')
  and has_function_privilege('service_role', 'api.service_ingest_current_football_squads(text,text,jsonb,timestamptz)', 'execute'),
  'only trusted services can execute current squad recovery'
);
select extensions.ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'app_private.current_football_squad_imports'::regclass),
  'current squad import journal forces RLS'
);
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select extensions.throws_ok(
  $$select api.service_ingest_current_football_squads('sportsmonks','28647','[]',statement_timestamp())$$,
  'PT403', 'forbidden', 'a user JWT cannot invoke the service transaction even through a privileged test connection'
);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select api.ingest_football_catalog_entity('sportsmonks', 'competition', '860', jsonb_build_object(
  'name','Botola Pro','shortName','BPL','type','league','countryCode','MA',
  'freshness',jsonb_build_object('updatedAt',statement_timestamp(),'sourceSequence',1,'sourceVersion','recovery-competition')
));
select api.ingest_football_catalog_entity('sportsmonks', 'season', '28647', jsonb_build_object(
  'competitionExternalId','860','label','2026/2027','startsOn',current_date+10,'endsOn',current_date+300,'current',true,
  'freshness',jsonb_build_object('updatedAt',statement_timestamp(),'sourceSequence',1,'sourceVersion','recovery-season')
));
select api.ingest_football_catalog_entity('sportsmonks', 'season', '26027', jsonb_build_object(
  'competitionExternalId','860','label','2025/2026','startsOn',current_date-300,'endsOn',current_date-20,'current',false,
  'freshness',jsonb_build_object('updatedAt',statement_timestamp(),'sourceSequence',1,'sourceVersion','historical-season')
));
select api.ingest_football_catalog_entity('sportsmonks','team',(5000+n)::text,jsonb_build_object(
  'name','Recovery Club '||n,'shortName','Club '||n,'countryCode','MA',
  'freshness',jsonb_build_object('updatedAt',statement_timestamp(),'sourceSequence',1,'sourceVersion','recovery-team-'||n)
)) from generate_series(1,16) n;

create temp table recovery_input as
select statement_timestamp() as observed_at, jsonb_agg(jsonb_build_object(
  'teamExternalId',(5000+n)::text,
  'memberships',jsonb_build_array(jsonb_build_object(
    'externalPlayerId',(9000+n)::text,'fullName','Recovery Player '||n,'displayName','Player '||n,
    'position','defender','preferredFoot','unknown','shirtNumber',4,
    'freshness',jsonb_build_object('updatedAt',statement_timestamp(),'sourceSequence',1,'sourceVersion','recovery-player-'||n)
  ))
) order by n) as squads from generate_series(1,16) n;

select api.ingest_football_squad('sportsmonks','26027','5001',
  (select squads -> 0 -> 'memberships' from recovery_input),statement_timestamp(),1);
select extensions.is(
  api.service_ingest_current_football_squads('sportsmonks','28647',
    (select squads from recovery_input),(select observed_at from recovery_input)) ->> 'activeMemberships',
  '16','a complete observed club set activates current memberships atomically'
);
select extensions.is((select count(*)::integer from app.team_memberships where active),16,
  'exactly the current membership snapshot is active');
select extensions.is((select count(*)::integer from app.team_memberships membership join app.seasons season on season.id=membership.season_id
  where season.label='2025/2026' and not membership.active),1,'historical membership remains inactive');
select extensions.is(
  api.service_ingest_current_football_squads('sportsmonks','28647',
    (select squads from recovery_input),(select observed_at from recovery_input)) ->> 'activeMemberships',
  '16','identical observation retries return the original result'
);
select extensions.is((select count(*)::integer from app.team_memberships),17,'retry creates no duplicate memberships');
select extensions.throws_ok(
  $$select api.service_ingest_current_football_squads('sportsmonks','28647',
    (select jsonb_set(squads,'{1,memberships,0,externalPlayerId}','"9001"') from recovery_input),
    statement_timestamp()+interval '1 second')$$,
  'PT400','duplicate_current_player_membership','ambiguous cross-club player membership is rejected'
);
select extensions.is((select count(*)::integer from app.team_memberships where active),16,
  'rejected reconciliation preserves all prior active memberships');
select extensions.throws_ok(
  $$select api.service_ingest_current_football_squads('sportsmonks','28647',
    (select jsonb_set(squads,'{15,memberships,0,position}','"unsupported-position"') from recovery_input),
    statement_timestamp()+interval '1 second')$$,
  '22023','INVALID_PROVIDER_PAYLOAD','a late provider validation failure rolls back the entire reconciliation'
);
select extensions.is((select count(*)::integer from app.team_memberships where active),16,
  'a failure after earlier squad writes restores the original active membership set');
select extensions.throws_ok(
  $$select api.service_ingest_current_football_squads('sportsmonks','26027',
    (select squads from recovery_input),statement_timestamp())$$,
  'PT400','invalid_current_squad_input','historical seasons cannot be made current through recovery'
);
select extensions.throws_ok(
  $$select api.service_ingest_current_football_squads('sportsmonks','28647',
    (select squads from recovery_input),(select observed_at-interval '1 second' from recovery_input))$$,
  'PT409','stale_current_squad_observation','an older observation cannot overwrite recovered squads'
);
select extensions.is((select count(*)::integer from app.fantasy_seasons),0,
  'squad recovery does not activate Fantasy or construct a partial season');

select * from extensions.finish();
rollback;
