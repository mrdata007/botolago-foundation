begin;

select extensions.no_plan();

-- Player photo releases (20260926070000). Private intake, approval
-- prerequisites, the guardian rule, in-app versus social scope, revocation,
-- expiry, replacement, and the silhouette fallback (a null read).

insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('b1000000-0000-4000-8000-000000000001', 'MA', 'MAR')
on conflict do nothing;

insert into app.players (id, slug, full_name, display_name, position) values
  ('b2000000-0000-4000-8000-000000000001', 'photo-adult', 'Photo Adult', 'P. Adult', 'forward'),
  ('b2000000-0000-4000-8000-000000000002', 'photo-minor', 'Photo Minor', 'P. Minor', 'defender'),
  ('b2000000-0000-4000-8000-000000000003', 'photo-unknown', 'Photo Unknown', 'P. Unknown', 'midfielder'),
  ('b2000000-0000-4000-8000-000000000004', 'photo-eighteen', 'Photo Eighteen', 'P. Eighteen', 'goalkeeper');

-- Dates of birth through the attribute resolver (20260926060000).
do $$
begin
  perform app_private.record_player_attribute_observation(player_id::uuid, 'date_of_birth',
    date_of_birth, null, 'provider', 'sportsmonks', 'photo-test', '2026-09-01T00:00:00Z')
  from (values
    ('b2000000-0000-4000-8000-000000000001', '2000-01-01'),
    ('b2000000-0000-4000-8000-000000000002', '2010-06-15'),
    ('b2000000-0000-4000-8000-000000000004', '2008-03-10')
  ) birth(player_id, date_of_birth);
  perform app_private.resolve_player_attributes(array[
    'b2000000-0000-4000-8000-000000000001'::uuid, 'b2000000-0000-4000-8000-000000000002'::uuid,
    'b2000000-0000-4000-8000-000000000004'::uuid]);
end;
$$;

-- Files as the storage job and staff upload would leave them.
create function pg_temp.put_object(p_bucket text, p_name text)
returns void language sql as $$
  insert into storage.objects (bucket_id, name) values (p_bucket, p_name);
$$;
create function pg_temp.intake(p_player uuid, p_n integer)
returns text language sql immutable as $$
  select 'players/' || p_player || '/c' || lpad(p_n::text, 7, '0') || '-0000-4000-8000-000000000001.jpg';
$$;
create function pg_temp.doc(p_player uuid, p_n integer)
returns text language sql immutable as $$
  select 'players/' || p_player || '/release-' || p_n || '.pdf';
$$;
-- Submit with sensible defaults; each call gets its own original.
create function pg_temp.submit(
  p_player uuid, p_n integer, p_signer text default 'player', p_scope text default 'in_app',
  p_captured date default date '2026-09-01', p_expires date default null
) returns uuid language sql as $$
  select app_private.submit_player_photo_release(
    p_player, pg_temp.intake(p_player, p_n), pg_temp.doc(p_player, p_n),
    p_captured, date '2026-09-02', p_signer, p_scope, 'club_licence',
    'Club photographer', 'Wydad AC', p_expires, 'b9000000-0000-4000-8000-000000000001');
$$;
create function pg_temp.files(p_player uuid, p_n integer)
returns void language sql as $$
  select pg_temp.put_object('player-photo-intake', pg_temp.intake(p_player, p_n));
  select pg_temp.put_object('player-photo-releases', pg_temp.doc(p_player, p_n));
$$;
create function pg_temp.derivative(p_release uuid)
returns text language plpgsql as $$
declare
  v_path text;
begin
  select 'football/players/' || player_id || '/' || id || '.webp' into v_path
  from app_private.player_photo_releases where id = p_release;
  perform pg_temp.put_object('football-media', v_path);
  return v_path;
end;
$$;
create function pg_temp.approve_and_publish(p_release uuid)
returns uuid language plpgsql as $$
begin
  perform app_private.approve_player_photo_release(p_release, 'b9000000-0000-4000-8000-000000000002');
  return app_private.publish_player_photo_release(p_release, pg_temp.derivative(p_release), 512, 512, 'image/webp');
end;
$$;

-- ---------------------------------------------------------------------------
-- Private intake
-- ---------------------------------------------------------------------------
select extensions.is(
  (select pg_catalog.string_agg(id || ':' || public::text, ',' order by id) from storage.buckets
   where id in ('player-photo-intake', 'player-photo-releases')),
  'player-photo-intake:false,player-photo-releases:false',
  'the intake and release-document buckets exist and are private'
);
select extensions.ok(
  (select public from storage.buckets where id = 'football-media'),
  'football-media stays the only public bucket involved: it gets derivatives only'
);
select extensions.ok(
  not exists (
    select 1 from pg_catalog.pg_policies policy
    where policy.schemaname = 'storage' and policy.tablename = 'objects'
      and (coalesce(policy.qual, '') ~ 'player-photo' or coalesce(policy.with_check, '') ~ 'player-photo')
  ),
  'no storage policy opens either private bucket'
);
select pg_temp.files('b2000000-0000-4000-8000-000000000001', 1);
set local role anon;
select extensions.is(
  (select count(*)::integer from storage.objects
   where bucket_id in ('player-photo-intake', 'player-photo-releases')),
  0,
  'an anonymous visitor sees no intake original or release document'
);
reset role;
set local role authenticated;
select extensions.is(
  (select count(*)::integer from storage.objects
   where bucket_id in ('player-photo-intake', 'player-photo-releases')),
  0,
  'a signed-in account sees no intake original or release document'
);
reset role;

select extensions.throws_ok(
  $$select app_private.submit_player_photo_release(
    'b2000000-0000-4000-8000-000000000001',
    'football/players/b2000000-0000-4000-8000-000000000001/x.jpg',
    'players/b2000000-0000-4000-8000-000000000001/release-9.pdf',
    '2026-09-01', '2026-09-02', 'player', 'in_app', 'club_licence', 'C', 'O', null,
    'b9000000-0000-4000-8000-000000000001')$$,
  '23514', 'PHOTO_RELEASE_PATH_INVALID',
  'an original in the public bucket''s layout is refused'
);
select extensions.throws_ok(
  $$select app_private.submit_player_photo_release(
    'b2000000-0000-4000-8000-000000000001',
    pg_temp.intake('b2000000-0000-4000-8000-000000000002', 1),
    pg_temp.doc('b2000000-0000-4000-8000-000000000001', 1),
    '2026-09-01', '2026-09-02', 'player', 'in_app', 'club_licence', 'C', 'O', null,
    'b9000000-0000-4000-8000-000000000001')$$,
  '23514', 'PHOTO_RELEASE_PATH_INVALID',
  'an original filed under another player is refused'
);
select extensions.throws_ok(
  $$select pg_temp.submit('b2000000-0000-4000-8000-000000000001', 50, 'coach')$$,
  '23514', 'PHOTO_RELEASE_INVALID',
  'an unknown signer role is refused'
);
select extensions.throws_ok(
  $$select pg_temp.submit('b2000000-0000-4000-8000-000000000001', 51, 'player', 'everywhere')$$,
  '23514', 'PHOTO_RELEASE_INVALID',
  'an unknown scope is refused'
);
select extensions.throws_ok(
  $$select pg_temp.submit('b2000000-0000-4000-8000-000000000001', 52, 'player', 'in_app',
    current_date + 1)$$,
  '23514', 'PHOTO_RELEASE_DATES_INVALID',
  'a capture date in the future is refused'
);

create temporary table r on commit drop as
select pg_temp.submit('b2000000-0000-4000-8000-000000000001', 1) as adult_app;
select extensions.is(
  (select status from app_private.player_photo_releases where id = (select adult_app from r)),
  'pending',
  'a submitted release starts pending'
);
select extensions.is(
  (select count(*)::integer from app.media_assets where kind = 'player_photo'),
  0,
  'submission creates no public asset'
);
select extensions.is(
  app_private.player_photo_for('b2000000-0000-4000-8000-000000000001', 'app'),
  null,
  'no photo yet: the read is null, so the UI draws the silhouette'
);

-- ---------------------------------------------------------------------------
-- Approval prerequisites
-- ---------------------------------------------------------------------------
alter table r add column no_files uuid, add column no_document uuid, add column unknown_birth uuid,
  add column before_birth uuid, add column expired uuid;
update r set no_files = pg_temp.submit('b2000000-0000-4000-8000-000000000001', 2);
select extensions.throws_ok(
  format('select app_private.approve_player_photo_release(%L, %L)',
    (select no_files from r), 'b9000000-0000-4000-8000-000000000002'),
  '23514', 'PHOTO_RELEASE_PREREQUISITES',
  'approval is refused while the original and the document are missing'
);
select pg_temp.put_object('player-photo-intake', pg_temp.intake('b2000000-0000-4000-8000-000000000001', 2));
select extensions.throws_ok(
  format('select app_private.approve_player_photo_release(%L, %L)',
    (select no_files from r), 'b9000000-0000-4000-8000-000000000002'),
  '23514', 'PHOTO_RELEASE_PREREQUISITES',
  'approval is refused while the signed document is missing'
);
select extensions.is(
  app_private.player_photo_release_problems(
    (select release from app_private.player_photo_releases release where id = (select no_files from r))),
  array['document_missing'],
  'the missing document is named'
);

update r set unknown_birth = pg_temp.submit('b2000000-0000-4000-8000-000000000003', 1);
select pg_temp.files('b2000000-0000-4000-8000-000000000003', 1);
select extensions.is(
  app_private.player_photo_release_problems(
    (select release from app_private.player_photo_releases release where id = (select unknown_birth from r))),
  array['date_of_birth_unknown'],
  'an unknown date of birth blocks approval'
);
select extensions.throws_ok(
  format('select app_private.approve_player_photo_release(%L, %L)',
    (select unknown_birth from r), 'b9000000-0000-4000-8000-000000000002'),
  '23514', 'PHOTO_RELEASE_PREREQUISITES',
  'so approval is refused'
);

update r set before_birth = pg_temp.submit('b2000000-0000-4000-8000-000000000001', 3, 'player', 'in_app', date '1999-12-31');
select pg_temp.files('b2000000-0000-4000-8000-000000000001', 3);
select extensions.ok(
  'captured_before_birth' = any(app_private.player_photo_release_problems(
    (select release from app_private.player_photo_releases release where id = (select before_birth from r)))),
  'a capture date before the birth date blocks approval'
);

update r set expired = pg_temp.submit('b2000000-0000-4000-8000-000000000001', 4, 'player', 'in_app',
  date '2026-09-01', current_date);
select pg_temp.files('b2000000-0000-4000-8000-000000000001', 4);
select extensions.ok(
  'expired' = any(app_private.player_photo_release_problems(
    (select release from app_private.player_photo_releases release where id = (select expired from r)))),
  'a release already expired cannot be approved'
);

select extensions.throws_ok(
  format('select app_private.approve_player_photo_release(%L, null)', (select adult_app from r)),
  '23514', 'PHOTO_RELEASE_ACTOR_REQUIRED',
  'an approval records who approved'
);
select extensions.lives_ok(
  format('select app_private.approve_player_photo_release(%L, %L)',
    (select adult_app from r), 'b9000000-0000-4000-8000-000000000002'),
  'with both files, a known date of birth and an adult signer, approval passes'
);
select extensions.is(
  app_private.player_photo_for('b2000000-0000-4000-8000-000000000001', 'app'),
  null,
  'approved is not published: still the silhouette'
);

-- ---------------------------------------------------------------------------
-- Guardian requirement
-- ---------------------------------------------------------------------------
alter table r add column minor_player uuid, add column minor_guardian uuid, add column eighteen uuid,
  add column seventeen uuid;
update r set minor_player = pg_temp.submit('b2000000-0000-4000-8000-000000000002', 1, 'player');
select pg_temp.files('b2000000-0000-4000-8000-000000000002', 1);
select extensions.is(
  app_private.player_photo_release_problems(
    (select release from app_private.player_photo_releases release where id = (select minor_player from r))),
  array['guardian_required'],
  'a player aged 16 on the capture date needs a guardian release'
);
select extensions.throws_ok(
  format('select app_private.approve_player_photo_release(%L, %L)',
    (select minor_player from r), 'b9000000-0000-4000-8000-000000000002'),
  '23514', 'PHOTO_RELEASE_PREREQUISITES',
  'a minor''s own signature is not enough'
);
update r set minor_guardian = pg_temp.submit('b2000000-0000-4000-8000-000000000002', 2, 'guardian');
select pg_temp.files('b2000000-0000-4000-8000-000000000002', 2);
select extensions.lives_ok(
  format('select app_private.approve_player_photo_release(%L, %L)',
    (select minor_guardian from r), 'b9000000-0000-4000-8000-000000000002'),
  'a guardian release for a minor is approved'
);
-- Born 10 March 2008: 18 on 10 March 2026, 17 the day before.
update r set eighteen = pg_temp.submit('b2000000-0000-4000-8000-000000000004', 1, 'player', 'in_app', date '2026-03-10');
select pg_temp.files('b2000000-0000-4000-8000-000000000004', 1);
select extensions.is(
  app_private.player_photo_release_problems(
    (select release from app_private.player_photo_releases release where id = (select eighteen from r))),
  '{}'::text[],
  'on the 18th birthday the player signs for himself'
);
update r set seventeen = pg_temp.submit('b2000000-0000-4000-8000-000000000004', 2, 'player', 'in_app', date '2026-03-09');
select pg_temp.files('b2000000-0000-4000-8000-000000000004', 2);
select extensions.is(
  app_private.player_photo_release_problems(
    (select release from app_private.player_photo_releases release where id = (select seventeen from r))),
  array['guardian_required'],
  'the day before, a guardian must sign'
);

-- ---------------------------------------------------------------------------
-- Publication
-- ---------------------------------------------------------------------------
select extensions.throws_ok(
  format('select app_private.publish_player_photo_release(%L, %L, 512, 512, %L)',
    (select adult_app from r), 'football/players/elsewhere.webp', 'image/webp'),
  '23514', 'PHOTO_DERIVATIVE_INVALID',
  'a derivative at any other path is refused'
);
select extensions.throws_ok(
  format('select app_private.publish_player_photo_release(%L, %L, 512, 512, %L)',
    (select adult_app from r),
    'football/players/b2000000-0000-4000-8000-000000000001/' || (select adult_app from r) || '.webp',
    'image/webp'),
  'P0002', 'PHOTO_DERIVATIVE_MISSING',
  'a derivative that is not in storage is refused'
);
select extensions.throws_ok(
  format('select app_private.publish_player_photo_release(%L, %L, 512, 384, %L)',
    (select adult_app from r), pg_temp.derivative((select adult_app from r)), 'image/webp'),
  '23514', 'PHOTO_DERIVATIVE_INVALID',
  'a derivative that is not square is refused'
);
select extensions.throws_ok(
  format('select app_private.publish_player_photo_release(%L, %L, 512, 512, %L)',
    (select no_files from r),
    'football/players/b2000000-0000-4000-8000-000000000001/' || (select no_files from r) || '.webp',
    'image/webp'),
  '55000', 'PHOTO_RELEASE_TRANSITION_NOT_ALLOWED',
  'a release that was never approved cannot be published'
);
alter table r add column adult_asset uuid;
update r set adult_asset = app_private.publish_player_photo_release(
  (select adult_app from r),
  'football/players/b2000000-0000-4000-8000-000000000001/' || (select adult_app from r) || '.webp',
  512, 512, 'image/webp');
select extensions.is(
  (select validation_status::text || ' ' || kind::text || ' ' || credit || ' ' || copyright_owner || ' ' || license_code
   from app.media_assets where id = (select adult_asset from r)),
  'validated player_photo Club photographer Wydad AC club_licence',
  'publication creates the validated public asset with credit, owner and licence'
);
select extensions.is(
  (select photo_asset_id from app.players where id = 'b2000000-0000-4000-8000-000000000001'),
  (select adult_asset from r),
  'the player now points at it'
);

-- ---------------------------------------------------------------------------
-- In-app versus social scope
-- ---------------------------------------------------------------------------
select extensions.is(
  app_private.player_photo_for('b2000000-0000-4000-8000-000000000001', 'app') ->> 'storagePath',
  'football/players/b2000000-0000-4000-8000-000000000001/' || (select adult_app from r) || '.webp',
  'an in-app release is shown in the app'
);
select extensions.is(
  app_private.player_photo_for('b2000000-0000-4000-8000-000000000001', 'share'),
  null,
  'but not on share images: the share image draws the silhouette'
);
alter table r add column minor_asset uuid;
update r set minor_asset = app_private.publish_player_photo_release(
  (select minor_guardian from r), pg_temp.derivative((select minor_guardian from r)), 512, 512, 'image/webp');
select extensions.is(
  app_private.player_photo_for('b2000000-0000-4000-8000-000000000002', 'share'),
  null,
  'a guardian in-app release is not for share images either'
);
alter table r add column adult_social uuid;
update r set adult_social = pg_temp.submit('b2000000-0000-4000-8000-000000000001', 10, 'player', 'in_app_and_social');
select pg_temp.files('b2000000-0000-4000-8000-000000000001', 10);
select pg_temp.approve_and_publish((select adult_social from r));
select extensions.is(
  app_private.player_photo_for('b2000000-0000-4000-8000-000000000001', 'share') ->> 'scope',
  'in_app_and_social',
  'a social release is used on share images'
);
select extensions.throws_ok(
  $$select app_private.player_photo_for('b2000000-0000-4000-8000-000000000001', 'poster')$$,
  '22023', 'PHOTO_USE_INVALID',
  'only the two uses exist'
);

-- ---------------------------------------------------------------------------
-- Replacement
-- ---------------------------------------------------------------------------
select extensions.is(
  (select status from app_private.player_photo_releases where id = (select adult_app from r)),
  'replaced',
  'publishing a newer release replaces the player''s previous one'
);
select extensions.is(
  (select validation_status::text from app.media_assets where id = (select adult_asset from r)),
  'expired',
  'the replaced public asset is withdrawn'
);
select extensions.is(
  (select count(*)::integer from app_private.player_photo_releases
   where player_id = 'b2000000-0000-4000-8000-000000000001' and status = 'published'),
  1,
  'one published photo per player'
);
select extensions.ok(
  exists (select 1 from app_private.player_photo_storage_deletions
    where release_id = (select adult_app from r) and bucket_id = 'football-media' and reason = 'replaced'),
  'the replaced derivative is queued for deletion'
);

-- ---------------------------------------------------------------------------
-- Read-time rights: a corrected date of birth
-- ---------------------------------------------------------------------------
-- Player 4 (born 2008-03-10) signed himself on his 18th birthday. If his
-- date of birth is corrected to 2008-09-01, he was 17 on that day.
select pg_temp.approve_and_publish((select eighteen from r));
select extensions.ok(
  app_private.player_photo_for('b2000000-0000-4000-8000-000000000004', 'app') is not null,
  'the adult-signed photo is shown'
);
do $$
begin
  perform app_private.record_player_attribute_observation('b2000000-0000-4000-8000-000000000004',
    'date_of_birth', '2008-09-01', null, 'manual', null, 'data-desk', '2026-09-20T00:00:00Z',
    'b9000000-0000-4000-8000-000000000003', 'Birth certificate');
  perform app_private.resolve_player_attributes(array['b2000000-0000-4000-8000-000000000004'::uuid]);
end;
$$;
select extensions.is(
  app_private.player_photo_for('b2000000-0000-4000-8000-000000000004', 'app'),
  null,
  'after the correction he was a minor on the capture date: silhouette until a guardian release'
);

-- ---------------------------------------------------------------------------
-- Revocation
-- ---------------------------------------------------------------------------
select extensions.throws_ok(
  format('select app_private.revoke_player_photo_release(%L, %L, %L)',
    (select adult_social from r), ' ', 'b9000000-0000-4000-8000-000000000002'),
  '23514', 'PHOTO_RELEASE_REASON_REQUIRED',
  'a revocation records its reason'
);
select app_private.revoke_player_photo_release((select adult_social from r),
  'Player withdrew consent', 'b9000000-0000-4000-8000-000000000002');
select extensions.is(
  app_private.player_photo_for('b2000000-0000-4000-8000-000000000001', 'app'),
  null,
  'a revoked photo is gone from the app at once: silhouette'
);
select extensions.is(
  app_private.player_photo_for('b2000000-0000-4000-8000-000000000001', 'share'),
  null,
  'and from share images'
);
select extensions.is(
  (select validation_status::text from app.media_assets
   where id = (select public_asset_id from app_private.player_photo_releases where id = (select adult_social from r))),
  'rejected',
  'its public asset is rejected'
);
select extensions.is(
  (select photo_asset_id from app.players where id = 'b2000000-0000-4000-8000-000000000001'),
  null::uuid,
  'the player no longer points at it'
);
select extensions.is(
  (select pg_catalog.string_agg(bucket_id, ',' order by bucket_id) from app_private.player_photo_storage_deletions
   where release_id = (select adult_social from r)),
  'football-media,player-photo-intake',
  'the public derivative and the original are queued for deletion'
);
select extensions.ok(
  not exists (select 1 from app_private.player_photo_storage_deletions
    where release_id = (select adult_social from r) and bucket_id = 'player-photo-releases'),
  'the signed document is kept as the record of consent'
);
select extensions.throws_ok(
  format('select app_private.approve_player_photo_release(%L, %L)',
    (select adult_social from r), 'b9000000-0000-4000-8000-000000000002'),
  '55000', 'PHOTO_RELEASE_TRANSITION_NOT_ALLOWED',
  'a revoked release cannot come back'
);
select app_private.revoke_player_photo_release((select no_files from r), 'Wrong player', 'b9000000-0000-4000-8000-000000000002');
select extensions.is(
  (select status from app_private.player_photo_releases where id = (select no_files from r)),
  'revoked',
  'a release can be revoked before it is ever published'
);
select extensions.ok(
  not exists (select 1 from app_private.player_photo_storage_deletions
    where release_id = (select no_files from r) and bucket_id = 'football-media'),
  'a release revoked before approval has no public file to delete'
);

-- ---------------------------------------------------------------------------
-- Ending an approved release before it is published
-- ---------------------------------------------------------------------------
-- The storage job writes the derivative, then publishes. If a run stops in
-- between, or staff end the release first, the file must still go.
alter table r add column approved_revoked uuid, add column approved_rejected uuid,
  add column pending_rejected uuid;
update r set
  approved_revoked = pg_temp.submit('b2000000-0000-4000-8000-000000000001', 30),
  approved_rejected = pg_temp.submit('b2000000-0000-4000-8000-000000000001', 31),
  pending_rejected = pg_temp.submit('b2000000-0000-4000-8000-000000000001', 32);
select pg_temp.files('b2000000-0000-4000-8000-000000000001', n) from generate_series(30, 32) n;
select app_private.approve_player_photo_release((select approved_revoked from r), 'b9000000-0000-4000-8000-000000000002');
select app_private.approve_player_photo_release((select approved_rejected from r), 'b9000000-0000-4000-8000-000000000002');
select pg_temp.derivative((select approved_revoked from r));
select pg_temp.derivative((select approved_rejected from r));

select app_private.revoke_player_photo_release((select approved_revoked from r),
  'Consent withdrawn before publication', 'b9000000-0000-4000-8000-000000000002');
select extensions.is(
  (select object_path || ' ' || reason from app_private.player_photo_storage_deletions
   where release_id = (select approved_revoked from r) and bucket_id = 'football-media'),
  app_private.player_photo_public_path('b2000000-0000-4000-8000-000000000001',
    (select approved_revoked from r)) || ' revoked',
  'revoking an approved release queues its derivative, at its one path, though it was never published'
);
select extensions.throws_ok(
  format('select app_private.publish_player_photo_release(%L, %L, 512, 512, %L)',
    (select approved_revoked from r),
    app_private.player_photo_public_path('b2000000-0000-4000-8000-000000000001', (select approved_revoked from r)),
    'image/webp'),
  '55000', 'PHOTO_RELEASE_TRANSITION_NOT_ALLOWED',
  'and a late publication of it is refused'
);

select app_private.reject_player_photo_release((select approved_rejected from r),
  'Wrong crop', 'b9000000-0000-4000-8000-000000000002');
select extensions.is(
  (select object_path || ' ' || reason from app_private.player_photo_storage_deletions
   where release_id = (select approved_rejected from r) and bucket_id = 'football-media'),
  app_private.player_photo_public_path('b2000000-0000-4000-8000-000000000001',
    (select approved_rejected from r)) || ' rejected',
  'rejecting an approved release queues its derivative too'
);

select app_private.reject_player_photo_release((select pending_rejected from r),
  'Blurred', 'b9000000-0000-4000-8000-000000000002');
select extensions.ok(
  not exists (select 1 from app_private.player_photo_storage_deletions
    where release_id = (select pending_rejected from r)),
  'rejecting a release still pending queues nothing: no derivative was ever made'
);

-- ---------------------------------------------------------------------------
-- Expiry
-- ---------------------------------------------------------------------------
alter table r add column dated uuid;
update r set dated = pg_temp.submit('b2000000-0000-4000-8000-000000000001', 20, 'player',
  'in_app_and_social', date '2026-09-01', current_date + 30);
select pg_temp.files('b2000000-0000-4000-8000-000000000001', 20);
select pg_temp.approve_and_publish((select dated from r));
select extensions.ok(
  app_private.player_photo_for('b2000000-0000-4000-8000-000000000001', 'app', current_date + 29) is not null,
  'the day before expiry the photo is shown'
);
select extensions.is(
  app_private.player_photo_for('b2000000-0000-4000-8000-000000000001', 'app', current_date + 30),
  null,
  'on the expiry date the read is null, before any sweep has run'
);
select extensions.is(
  app_private.expire_player_photo_releases(current_date + 29),
  0,
  'the sweep does nothing before the date'
);
select extensions.is(
  app_private.expire_player_photo_releases(current_date + 30),
  1,
  'on the date the sweep expires the release'
);
select extensions.is(
  (select status || ' ' || (select validation_status::text from app.media_assets where id = release.public_asset_id)
   from app_private.player_photo_releases release where id = (select dated from r)),
  'expired expired',
  'release and public asset are both expired'
);
select extensions.is(
  (select photo_asset_id from app.players where id = 'b2000000-0000-4000-8000-000000000001'),
  null::uuid,
  'the player no longer points at the expired photo'
);
select extensions.is(
  (select count(*)::integer from app_private.player_photo_storage_deletions
   where release_id = (select dated from r) and reason = 'expired'),
  2,
  'the expired derivative and original are queued for deletion'
);
select extensions.is(
  app_private.expire_player_photo_releases(current_date + 30),
  0,
  'running the sweep again changes nothing'
);

-- ---------------------------------------------------------------------------
-- Immutable facts, forward-only status
-- ---------------------------------------------------------------------------
select extensions.throws_ok(
  format('update app_private.player_photo_releases set captured_on = %L where id = %L',
    '2026-08-01', (select minor_guardian from r)),
  '55000', 'PHOTO_RELEASE_IMMUTABLE',
  'the facts of a release cannot be edited'
);
select extensions.throws_ok(
  format('update app_private.player_photo_releases set scope = %L where id = %L',
    'in_app_and_social', (select minor_guardian from r)),
  '55000', 'PHOTO_RELEASE_IMMUTABLE',
  'a scope cannot be widened after signature'
);
select extensions.throws_ok(
  format('update app_private.player_photo_releases set status = %L where id = %L',
    'published', (select seventeen from r)),
  '55000', 'PHOTO_RELEASE_TRANSITION_NOT_ALLOWED',
  'pending cannot jump to published'
);
select extensions.throws_ok(
  format('delete from app_private.player_photo_releases where id = %L', (select seventeen from r)),
  '55000', 'PHOTO_RELEASE_IMMUTABLE',
  'a release cannot be deleted'
);
select extensions.throws_ok(
  $$truncate app_private.player_photo_releases cascade$$,
  '55000', 'PHOTO_RELEASE_IMMUTABLE',
  'releases cannot be truncated'
);

-- ---------------------------------------------------------------------------
-- Nothing is reachable by a client
-- ---------------------------------------------------------------------------
select extensions.ok(
  (select bool_and(relrowsecurity and relforcerowsecurity) from pg_catalog.pg_class
   where oid in ('app_private.player_photo_releases'::regclass,
     'app_private.player_photo_storage_deletions'::regclass)),
  'RLS is enabled and forced on releases and the deletion queue'
);
select extensions.ok(
  not exists (
    select 1
    from unnest(array['anon', 'authenticated', 'service_role']) role_name
    cross join unnest(array[
      'app_private.submit_player_photo_release(uuid,text,text,date,date,text,text,text,text,text,date,uuid)',
      'app_private.approve_player_photo_release(uuid,uuid)',
      'app_private.reject_player_photo_release(uuid,text,uuid)',
      'app_private.player_photo_public_path(uuid,uuid)',
      'app_private.revoke_player_photo_release(uuid,text,uuid)',
      'app_private.expire_player_photo_releases(date)',
      'app_private.publish_player_photo_release(uuid,text,integer,integer,text)',
      'app_private.player_photo_for(uuid,text,date)'
    ]) function_signature
    where pg_catalog.has_function_privilege(role_name, function_signature, 'execute')
  ),
  'no client role can execute the photo functions'
);
select extensions.ok(
  not exists (
    select 1 from unnest(array['anon', 'authenticated', 'service_role']) role_name
    where pg_catalog.has_table_privilege(role_name, 'app_private.player_photo_releases', 'select')
      or pg_catalog.has_table_privilege(role_name, 'app_private.player_photo_storage_deletions', 'select')
  ),
  'no client role can read releases or the deletion queue'
);

select * from extensions.finish();

rollback;
