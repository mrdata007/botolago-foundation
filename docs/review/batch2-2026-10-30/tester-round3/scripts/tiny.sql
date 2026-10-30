\pset format unaligned
\pset tuples_only on
set session_replication_role = replica;
insert into app.fantasy_leagues (id, fantasy_season_id, owner_user_id, name, visibility, member_count, active)
values ('db000001-0000-4000-8000-000000000001', 'd6300000-0000-4000-8000-000000000001', 'd8000001-0000-4000-8000-000000000001', 'Tiny', 'public', 5, true);
insert into app.fantasy_league_memberships (league_id, fantasy_team_id, user_id, role, status)
select 'db000001-0000-4000-8000-000000000001', ('d9' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid, ('d8' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 'member', 'active' from generate_series(1,5) i;
set session_replication_role = origin;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
create or replace function pg_temp.wms() returns text language plpgsql as $$
declare t0 timestamptz; ts numeric[] := '{}'; t numeric;
begin
  for i in 1..9 loop
    t0 := clock_timestamp();
    perform api.service_recalculate_fantasy_rankings('d6300000-0000-4000-8000-000000000001', null, 'db000001-0000-4000-8000-000000000001', 20 + i);
    ts := ts || (extract(epoch from clock_timestamp() - t0) * 1000);
  end loop;
  select round(percentile_cont(0.5) within group (order by x)::numeric, 0) into t from unnest(ts) x;
  return t::text;
end $$;
select 'writer 5-team league board ms | ' || pg_temp.wms();
