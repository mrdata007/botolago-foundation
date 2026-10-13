-- SYNTHETIC benchmark of the lookup pattern in api.service_persist_fantasy_scoring_results
-- (20260927140000:186-224): per input row, rescan p_player_results; twice (validate + insert).
create function pg_temp.mk(n int) returns jsonb language sql as $$
 select jsonb_agg(jsonb_build_object('fantasyPlayerId',gen_random_uuid(),'fixtureId','f'||(i%8),'playerId','p'||i,
   'events',(select jsonb_agg(jsonb_build_object('category','c'||k,'points',1,'sourceKey','fixture-stats:x:'||i||':c'||k)) from generate_series(1,8) k)))
 from generate_series(1,n) i $$;
create function pg_temp.quadratic(r jsonb) returns int language plpgsql as $$
declare input_row jsonb; result_row jsonb; ev jsonb; c int:=0; pass int;
begin
 for pass in 1..2 loop
  for input_row in select value from jsonb_array_elements(r) loop
   select value into result_row from jsonb_array_elements(r)
    where value->>'fantasyPlayerId'=input_row->>'fantasyPlayerId' and value->>'fixtureId'=input_row->>'fixtureId';
   for ev in select value from jsonb_array_elements(result_row->'events') loop c:=c+1; end loop;
  end loop;
 end loop; return c; end $$;
create function pg_temp.setbased(r jsonb) returns int language sql as $$
 select count(*)::int from jsonb_array_elements(r) a join jsonb_array_elements(r) b
  on a->>'fantasyPlayerId'=b->>'fantasyPlayerId' and a->>'fixtureId'=b->>'fixtureId'
  cross join lateral jsonb_array_elements(b->'events') e $$;
\timing on
select pg_temp.quadratic(pg_temp.mk(250)) as quad_250;
select pg_temp.setbased(pg_temp.mk(250)) as set_250;
select pg_temp.quadratic(pg_temp.mk(500)) as quad_500;
select pg_temp.setbased(pg_temp.mk(500)) as set_500;
select pg_temp.quadratic(pg_temp.mk(1000)) as quad_1000;
select pg_temp.setbased(pg_temp.mk(1000)) as set_1000;
select pg_temp.quadratic(pg_temp.mk(2000)) as quad_2000;
select pg_temp.setbased(pg_temp.mk(2000)) as set_2000;
select pg_temp.quadratic(pg_temp.mk(4000)) as quad_4000;
select pg_temp.setbased(pg_temp.mk(4000)) as set_4000;
