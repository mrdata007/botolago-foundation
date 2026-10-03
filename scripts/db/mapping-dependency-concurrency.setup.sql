-- Committed (not rolled back) synthetic world for the concurrency checks. Run ONLY against a scratch
-- database created from a migrated template, never against anything shared. See the .sh next to it.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('e1000000-0000-4000-8000-0000000000d1', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'conc-d1@example.test', 'hash', now(), '{}', '{"username":"conc_d1"}', now(), now());
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('e3000000-0000-4000-8000-0000000000d1', 'e1000000-0000-4000-8000-0000000000d1', 'TOTP', 'totp', 'verified', now(), now());
insert into auth.sessions (id, user_id, created_at)
values ('e2000000-0000-4000-8000-0000000000d1', 'e1000000-0000-4000-8000-0000000000d1', now());
insert into app_private.staff_principals (auth_user_id) values ('e1000000-0000-4000-8000-0000000000d1');
insert into app_private.staff_role_assignments (staff_principal_id, role_id, grant_reason)
select sp.id, r.id, 'Test operator for the concurrency checks.'
from app_private.staff_principals sp, app_private.admin_roles r
where sp.auth_user_id = 'e1000000-0000-4000-8000-0000000000d1' and r.name = 'football_operator';
update app_private.football_mapping_settings set allow_self_approval = true;

insert into app.teams (id, slug, name, short_name)
select ('e4000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'conc-club-' || g, 'Conc Club ' || g, 'C' || g from generate_series(1, 2) g;
create table public.conc_world as
  select i, 1 + (i % 2) as club, (array['G','D','M','F'])[1 + (i % 4)] as pos, date '1990-02-02' + (i * 3) as dob, 1 + (i % 98) as shirt
  from generate_series(1, 40) i;
insert into app.players (id, slug, full_name, display_name, position)
select ('a1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'conc-player-' || i, 'Real Name ' || i, 'Display Name ' || i,
  (case pos when 'G' then 'goalkeeper' when 'D' then 'defender' when 'M' then 'midfielder' else 'forward' end)::app.football_position from public.conc_world;
-- Two spare players with no provider mapping: somewhere to retarget a supporting mapping to.
insert into app.players (id, slug, full_name, display_name, position)
select ('a1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'conc-spare-' || i, 'Spare Name ' || i, 'Spare Display ' || i, 'midfielder'::app.football_position
from generate_series(41, 42) i;
insert into app.team_memberships (player_id, team_id, valid_from, shirt_number)
select ('a1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, ('e4000000-0000-4000-8000-' || lpad(club::text, 12, '0'))::uuid, date '2026-07-01', shirt from public.conc_world;

select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select api.football_mapping_record_observations(jsonb_agg(jsonb_build_object(
  'provider', 'sofascore', 'externalPlayerId', 'S' || i, 'providerTeamId', 'PT' || club, 'clubKey', 'conc-club-' || club,
  'appTeamId', 'e4000000-0000-4000-8000-' || lpad(club::text, 12, '0'), 'squadCompleteness', 'COMPLETE',
  'registeredTeamDisagreement', false, 'shirtNumber', shirt, 'positionSignal', pos, 'dobState', 'valid',
  'birthDate', dob::text, 'dobJanuary1', false, 'displayName', 'Provider Name ' || i))) from public.conc_world;
select api.football_mapping_record_observations(jsonb_agg(jsonb_build_object(
  'provider', 'flashscore', 'externalPlayerId', 'F' || i, 'providerTeamId', 'FT' || club, 'clubKey', 'conc-club-' || club,
  'appTeamId', 'e4000000-0000-4000-8000-' || lpad(club::text, 12, '0'), 'squadCompleteness', 'COMPLETE',
  'registeredTeamDisagreement', false, 'shirtNumber', shirt, 'positionSignal', pos, 'dobState', 'missing',
  'displayName', 'Flash Name ' || i))) from public.conc_world;

-- The Sofascore side, through the reviewed flow (so the supporting mappings carry real provenance).
select set_config('request.jwt.claims',
  '{"sub":"e1000000-0000-4000-8000-0000000000d1","role":"authenticated","aal":"aal2","session_id":"e2000000-0000-4000-8000-0000000000d1"}', false);
do $$
declare g integer;
begin
  -- Small batches: a proposal's recorded response has a size limit.
  for g in 0..4 loop
    perform api.admin_football_mapping_propose((select jsonb_agg(jsonb_build_object('kind', 'map', 'sofascoreCandidateId', c.id,
      'appPlayerId', 'a1000000-0000-4000-8000-' || lpad(substr(c.external_id, 2), 12, '0'), 'basis', 'manual') order by c.id)
      from app_private.football_player_mapping_candidates c
      where c.provider_name = 'sofascore' and (substr(c.external_id, 2)::int - 1) / 8 = g),
      'Seed the Sofascore side for the concurrency checks.', gen_random_uuid());
  end loop;
end $$;
do $$
declare p record;
begin
  for p in select id, fingerprint from app_private.football_player_mapping_proposals where status = 'pending' order by id loop
    perform api.admin_football_mapping_decide(p.id, 'approve', 'Approved to seed the concurrency world.', p.fingerprint, false, gen_random_uuid());
    perform api.admin_football_mapping_execute(p.id, gen_random_uuid());
  end loop;
end $$;

-- Flashscore proposals, one per player, approved and waiting to be executed.
create table public.conc_pending (i integer primary key, proposal uuid not null, supporting uuid not null);
do $$
declare w record; v jsonb; pid uuid; sup uuid; fp text;
begin
  for w in select i from public.conc_world order by i loop
    select id into sup from app_private.football_provider_mappings where provider_name = 'sofascore' and external_id = 'S' || w.i;
    v := api.admin_football_mapping_propose(jsonb_build_array(jsonb_build_object('kind', 'map',
      'flashscoreCandidateId', (select id from app_private.football_player_mapping_candidates where provider_name = 'flashscore' and external_id = 'F' || w.i),
      'appPlayerId', 'a1000000-0000-4000-8000-' || lpad(w.i::text, 12, '0'), 'basis', 'incident',
      'evidenceClass', 'F1_REVIEWED_SOFASCORE_EVENTS', 'supportingMappingId', sup,
      'evidenceRefs', jsonb_build_array(jsonb_build_object('source', 'reviewed_sofascore_mapping', 'sofascoreId', 'S' || w.i, 'mappingId', sup)))),
      'Batch-reviewed Flashscore identity for the concurrency checks.', gen_random_uuid());
    pid := (v -> 'proposals' -> 0 ->> 'id')::uuid; fp := v -> 'proposals' -> 0 ->> 'fingerprint';
    perform api.admin_football_mapping_decide(pid, 'approve', 'Approved for the concurrency checks.', fp, false, gen_random_uuid());
    insert into public.conc_pending values (w.i, pid, sup);
  end loop;
end $$;
select count(*) as pending_flashscore_proposals from public.conc_pending;
