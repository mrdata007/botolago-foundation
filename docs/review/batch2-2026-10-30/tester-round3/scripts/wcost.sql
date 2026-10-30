\pset format unaligned
\pset tuples_only on
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
create or replace function pg_temp.wms(season_board boolean) returns text language plpgsql as $$
declare t0 timestamptz; ts numeric[] := '{}'; t numeric; r int;
begin
  for i in 1..5 loop
    t0 := clock_timestamp();
    if season_board then
      perform api.service_recalculate_fantasy_rankings('d6300000-0000-4000-8000-000000000001', null, null, 9 + i);
    else
      perform api.service_recalculate_fantasy_rankings('d6300000-0000-4000-8000-000000000001', null, 'da000001-0000-4000-8000-000000000001', 9 + i);
    end if;
    ts := ts || (extract(epoch from clock_timestamp() - t0) * 1000);
  end loop;
  select round(percentile_cont(0.5) within group (order by x)::numeric, 0) into t from unnest(ts) x;
  return t::text;
end $$;
select 'writer season board (5000 teams) ms | ' || pg_temp.wms(true);
select 'writer league board (250 teams) ms | ' || pg_temp.wms(false);
