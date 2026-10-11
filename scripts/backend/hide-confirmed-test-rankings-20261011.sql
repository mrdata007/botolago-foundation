-- Reviewed owner SQL path from docs/backend/PUBLIC_RANKING_EXCLUSIONS.md.
-- Owner confirmed ak47 FC must remain visible. Hide only these four QA users.
-- Rehearse rollback, read back, then change only rollback to commit.
begin;
set local lock_timeout = '5s';
select app_private.hold_scheduled_jobs();
do $owner$
declare
  owner_auth_user constant uuid := 'd4eaa24d-ab24-45c6-9bdd-f8b8bac3b731';
  targets constant uuid[] := array['cdf81faf-70e5-4e02-ab32-c64d154361f4',
    '658c908d-03c7-454a-bab6-7e113059c36b','aa0b368a-c94b-41b1-9aed-4474d3304a31',
    '14d0a2db-6385-4c85-a5d8-b1544773e465']::uuid[];
  reason constant text := 'Verified QA and E2E test account hidden from public rankings (owner decision 2026-10-11).';
  actor uuid; target uuid;
begin
  if exists(select 1 from cron.job where active)
    or exists(select 1 from app_private.account_deletion_settings where enabled)
    or exists(select 1 from app_private.manager_card_settings where compute_enabled)
  then raise exception 'stop: pause and drain production writers first'; end if;
  select id into actor from app_private.staff_principals
    where auth_user_id=owner_auth_user and status='active';
  if actor is null then raise exception 'owner is not an active staff principal'; end if;
  if (select count(*) from app.fantasy_teams t join app.profiles p on p.id=t.user_id
    where (p.id,p.username,p.display_name,t.name) in (
      ('cdf81faf-70e5-4e02-ab32-c64d154361f4'::uuid,'bg0090qa','BG0090 Verifier','BG0090 Verif FC'),
      ('658c908d-03c7-454a-bab6-7e113059c36b'::uuid,'botolago_e2e','BotolaGO E2E','BotolaGO E2E XI'),
      ('aa0b368a-c94b-41b1-9aed-4474d3304a31'::uuid,'compak09230454','Compak Test','E2E Botola XI'),
      ('14d0a2db-6385-4c85-a5d8-b1544773e465'::uuid,'qalaunch0925','QA Launch 0925','QA Launch 0925'))
    )<>4 then raise exception 'stop: verified QA identities changed'; end if;
  if exists(select 1 from app_private.public_ranking_exclusions) then
    raise exception 'stop: exclusion baseline changed'; end if;
  foreach target in array targets loop
    if not exists(select 1 from app.profiles where id=target) then raise exception 'no profile %',target; end if;
    insert into app_private.public_ranking_exclusions(user_id,reason,created_by_principal_id)
      values(target,reason,actor);
    perform app_private.write_admin_audit(actor,'rankings.set_exclusion','rankings',target,
      reason,gen_random_uuid(),gen_random_uuid(),null,
      jsonb_build_object('status','shown'),jsonb_build_object('status','hidden'));
  end loop;
  if (select count(*) from app_private.public_ranking_exclusions)<>4
    or exists(select 1 from app_private.public_ranking_exclusions where user_id=owner_auth_user)
  then raise exception 'stop: exclusion verification failed'; end if;
end;
$owner$;
rollback;
