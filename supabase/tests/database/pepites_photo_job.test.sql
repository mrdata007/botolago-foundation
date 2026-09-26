begin;

select extensions.no_plan();

-- The photo storage job's database side (20260926130000): its work list,
-- publication with the rights checked again, deletion bookkeeping, and the
-- staff upload paths.

insert into app.players (id, slug, full_name, display_name, position) values
  ('a2000000-0000-4000-8000-000000000001', 'photo-job-adult', 'Photo Job Adult', 'J. Adult', 'forward'),
  ('a2000000-0000-4000-8000-000000000002', 'photo-job-later', 'Photo Job Later', 'J. Later', 'defender');
do $$
begin
  perform app_private.record_player_attribute_observation(player_id::uuid, 'date_of_birth',
    date_of_birth, null, 'provider', 'sportsmonks', 'photo-job-test', '2026-09-01T00:00:00Z')
  from (values
    ('a2000000-0000-4000-8000-000000000001', '2000-01-01'),
    ('a2000000-0000-4000-8000-000000000002', '2001-01-01')
  ) birth(player_id, date_of_birth);
  perform app_private.resolve_player_attributes(array[
    'a2000000-0000-4000-8000-000000000001'::uuid, 'a2000000-0000-4000-8000-000000000002'::uuid]);
end;
$$;

create function pg_temp.release(p_player uuid, p_n integer) returns uuid language plpgsql as $$
declare
  v_intake text := 'players/' || p_player || '/a' || lpad(p_n::text, 7, '0') || '-0000-4000-8000-000000000001.jpg';
  v_doc text := 'players/' || p_player || '/release-' || p_n || '.pdf';
  v_id uuid;
begin
  insert into storage.objects (bucket_id, name) values ('player-photo-intake', v_intake),
    ('player-photo-releases', v_doc);
  v_id := app_private.submit_player_photo_release(p_player, v_intake, v_doc, date '2026-09-01',
    date '2026-09-02', 'player', 'in_app_and_social', 'club_licence', 'Club photographer', 'Club',
    null, 'a9000000-0000-4000-8000-000000000001');
  perform app_private.approve_player_photo_release(v_id, 'a9000000-0000-4000-8000-000000000002');
  return v_id;
end;
$$;
create temporary table releases on commit drop as
select pg_temp.release('a2000000-0000-4000-8000-000000000001', 1) as adult,
  pg_temp.release('a2000000-0000-4000-8000-000000000002', 2) as later;
grant select on releases to public;

-- ===========================================================================
-- Service only
-- ===========================================================================
select extensions.throws_ok(
  $$select api.service_player_photo_work(20)$$,
  'PT403', 'service_role_required', 'the work list is the service''s'
);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select extensions.ok(
  (select jsonb_array_length(work -> 'publish') = 2
     and work #>> '{publish,0,releaseId}' = (select adult::text from releases)
     and work #>> '{publish,0,publicPath}' = 'football/players/a2000000-0000-4000-8000-000000000001/'
       || (select adult::text from releases) || '.webp'
     and work -> 'delete' = '[]'::jsonb
   from api.service_player_photo_work(20) work),
  'the job sees the approved releases, oldest first, with the one public path each may use'
);

-- ===========================================================================
-- Publication
-- ===========================================================================
select extensions.throws_ok(
  format($$select api.service_publish_player_photo(%L, %L, 512, 512, 'image/webp')$$,
    (select adult from releases),
    'football/players/a2000000-0000-4000-8000-000000000001/' || (select adult from releases) || '.webp'),
  'P0002', 'PHOTO_DERIVATIVE_MISSING', 'nothing is published before the derivative is in the bucket'
);
insert into storage.objects (bucket_id, name)
values ('football-media', 'football/players/a2000000-0000-4000-8000-000000000001/' || (select adult from releases) || '.webp');
select extensions.ok(
  (api.service_publish_player_photo((select adult from releases),
    'football/players/a2000000-0000-4000-8000-000000000001/' || (select adult from releases) || '.webp',
    512, 512, 'image/webp') ->> 'assetId') is not null,
  'with it, the release is published'
);
select extensions.ok(
  (select photo_asset_id is not null from app.players where id = 'a2000000-0000-4000-8000-000000000001')
  and app_private.player_photo_for('a2000000-0000-4000-8000-000000000001', 'app') is not null,
  'and the player''s page gets the photo'
);

-- The rights are checked again at publication: a corrected date of birth
-- makes the second player a minor on the capture date, with a release he
-- signed himself.
do $$
begin
  perform app_private.record_player_attribute_observation('a2000000-0000-4000-8000-000000000002',
    'date_of_birth', '2010-01-01', null, 'manual', null, 'photo-job-test', now(),
    'a9000000-0000-4000-8000-000000000003', 'Corrected from the club''s registration.');
  perform app_private.resolve_player_attributes(array['a2000000-0000-4000-8000-000000000002'::uuid]);
end;
$$;
insert into storage.objects (bucket_id, name)
values ('football-media', 'football/players/a2000000-0000-4000-8000-000000000002/' || (select later from releases) || '.webp');
select extensions.throws_ok(
  format($$select api.service_publish_player_photo(%L, %L, 512, 512, 'image/webp')$$,
    (select later from releases),
    'football/players/a2000000-0000-4000-8000-000000000002/' || (select later from releases) || '.webp'),
  '23514', 'PHOTO_RELEASE_PROBLEMS', 'rights that no longer hold stop publication (the job then deletes its file)'
);

-- ===========================================================================
-- Deletions
-- ===========================================================================
select app_private.revoke_player_photo_release((select adult from releases), 'Consent withdrawn by the player',
  'a9000000-0000-4000-8000-000000000002');
create temporary table work on commit drop as select api.service_player_photo_work(20) as value;
select extensions.is(
  (select array_agg(item ->> 'bucket' order by item ->> 'bucket') from work, jsonb_array_elements(value -> 'delete') item),
  array['football-media', 'player-photo-intake'],
  'a revoked photo queues its public derivative and its original for deletion (the signed release stays)'
);
select extensions.is(
  (select count(*)::integer from work, jsonb_array_elements(value -> 'delete') item
   where (api.service_complete_photo_deletion((item ->> 'id')::uuid) ->> 'completed')::boolean),
  2,
  'the job marks each deletion done'
);
select extensions.is(
  jsonb_array_length(api.service_player_photo_work(20) -> 'delete'), 0,
  'and they leave the work list'
);
select extensions.is(
  api.service_complete_photo_deletion((select (item ->> 'id')::uuid from work, jsonb_array_elements(value -> 'delete') item limit 1)) ->> 'completed',
  'false',
  'completing one twice changes nothing'
);

-- ===========================================================================
-- Staff upload paths
-- ===========================================================================
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"a9000000-0000-4000-8000-000000000009","aal":"aal1"}', true);
select extensions.throws_ok(
  $$select api.admin_player_photo_upload_paths('a2000000-0000-4000-8000-000000000001', 'jpg', 'pdf')$$,
  'PT403', null, 'only staff with football.correct get upload paths'
);
select extensions.ok(
  not has_function_privilege('anon', 'api.admin_player_photo_upload_paths(uuid, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'api.service_player_photo_work(integer)', 'execute')
  and has_function_privilege('service_role', 'api.service_publish_player_photo(uuid, text, integer, integer, text)', 'execute'),
  'the job''s functions are the service role''s; upload paths are for signed-in staff'
);

select * from extensions.finish();
rollback;
