-- LOCAL ONLY: optional Fantasy fixture after pepites-local-preview-seed.sql.
-- Refuses any catalog other than that fictional seed. Keep all scheduled
-- writers paused and notification email off while running it (AGENTS.md).
begin;
do $$
begin
  if not exists (select 1 from auth.users where id = '7e090000-0000-4000-8000-000000000001'
      and email = 'fan@pepites.local')
    or exists (select 1 from app.competitions where id <> '7e000000-0000-4000-8000-000000000001')
    or exists (select 1 from app.fantasy_seasons)
    or exists (select 1 from app_private.notification_email_settings where mode <> 'off')
  then raise exception 'pepites-local-fantasy-seed requires a fresh fictional Pépites local seed with email off';
  end if;
end;
$$;
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('7e610000-0000-4000-8000-000000000001', '7e000000-0000-4000-8000-000000000001',
  'pepites-local-fantasy', 'Local Pépites Fantasy', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id,
  name, status, starts_at, ends_at)
values ('7e620000-0000-4000-8000-000000000001', '7e610000-0000-4000-8000-000000000001',
  '7e010000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000101',
  'Local Pépites Fantasy', 'active', now() - interval '1 day', now() + interval '90 days');
insert into app.fantasy_players (id, fantasy_season_id, football_player_id, football_team_id,
  position_id, price)
select replace(player.id::text, '7e030000', '7e600000')::uuid,
  '7e620000-0000-4000-8000-000000000001', player.id, membership.team_id, position.id,
  case when player.id = '7e030000-0000-4000-8000-000000000188' then 12.5 else 6.5 end
from app.players player
join app.team_memberships membership on membership.player_id = player.id
  and membership.season_id = '7e010000-0000-4000-8000-000000000001' and membership.active
join app.fantasy_positions position on position.code = app_private.pepites_position_group(player.position);
insert into app.fantasy_gameweeks (id, fantasy_season_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status)
values ('7e630000-0000-4000-8000-000000000001', '7e620000-0000-4000-8000-000000000001',
  1, 'Local preview GW', now() + interval '1 day', now() + interval '25 hours',
  now() + interval '7 days', 'open');
-- Three players from club 1 let the browser exercise the club limit. All
-- positions and the 4-4-2 lineup are validated by the real create-team RPC.
select set_config('request.jwt.claims',
  '{"sub":"7e090000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
select api.create_fantasy_team('7e620000-0000-4000-8000-000000000001',
  '7e630000-0000-4000-8000-000000000001', 'Pepites Local XI',
  (select jsonb_agg(jsonb_build_object(
    'fantasy_player_id', ('7e600000-0000-4000-8000-' || lpad(n::text, 12, '0')),
    'slot', case when slot <= 11 then 'starter' else 'bench' end,
    'slot_order', case when slot <= 11 then slot else slot - 11 end,
    'captain', slot = 10, 'vice_captain', slot = 11) order by slot)
   from (values (1,1),(2,2),(3,38),(4,56),(5,74),(6,7),(7,133),(8,151),(9,169),
     (10,228),(11,246),(12,19),(13,110),(14,205),(15,264)) selection(slot,n)),
  '7e640000-0000-4000-8000-000000000001');
commit;
