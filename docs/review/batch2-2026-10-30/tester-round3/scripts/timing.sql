\pset format unaligned
\pset tuples_only on
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"d8000010-0000-4000-8000-000000000001","aal":"aal2"}', false);
create or replace function pg_temp.ms(call text) returns numeric language plpgsql as $$
declare t0 timestamptz; ts numeric[] := '{}'; t numeric;
begin
  execute call; execute call;
  for i in 1..9 loop
    t0 := clock_timestamp(); execute call; t := extract(epoch from clock_timestamp() - t0) * 1000; ts := ts || t;
  end loop;
  select round(percentile_cont(0.5) within group (order by x)::numeric, 1) into t from unnest(ts) x;
  return t;
end $$;
select 'overall 50 rows | ' || pg_temp.ms($$select api.fantasy_overall_standings('d6300000-0000-4000-8000-000000000001', null, null, null, 50)$$);
select 'overall 1 row | ' || pg_temp.ms($$select api.fantasy_overall_standings('d6300000-0000-4000-8000-000000000001', null, null, null, 1)$$);
select 'overall gw5 50 rows | ' || pg_temp.ms($$select api.fantasy_overall_standings('d6300000-0000-4000-8000-000000000001', 'd6400005-0000-4000-8000-000000000001', null, null, 50)$$);
select 'league 50 rows | ' || pg_temp.ms($$select api.fantasy_league_standings('da000001-0000-4000-8000-000000000001', null, null, null, 50)$$);
select 'league 1 row | ' || pg_temp.ms($$select api.fantasy_league_standings('da000001-0000-4000-8000-000000000001', null, null, null, 1)$$);
select 'hub | ' || pg_temp.ms($$select api.fantasy_hub('fr')$$);
select 'hidden_ahead | ' || pg_temp.ms($$select app_private.fantasy_hidden_ahead('d6300000-0000-4000-8000-000000000001', null, null, 2500::bigint, false)$$);
