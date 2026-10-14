-- Fantasy points from the SofaScore match rating (docs/backend/FANTASY_RATING_POINTS.md).
--
-- THE RULE (owner decision of 2026-10-13), from the gameweek the owner switches on:
--   * a player's points for one match are his SofaScore rating for that match,
--     rounded to the nearest whole number, halves up (7.5 -> 8, 7.49 -> 7);
--   * 5 points when he appeared (minutes > 0) and SofaScore gave him no rating;
--   * 0 when he did not appear.
-- That one `rating` line replaces every other category (appearance, goals,
-- assists, clean sheet, goals conceded, saves, penalties, cards, own goals).
-- Captain, vice-captain, Triple Captain, Bench Boost, automatic substitutions
-- and transfer hits are unchanged. Points stay whole numbers everywhere.
--
-- WHAT THIS MIGRATION ADDS. Nothing changes until the owner runs
-- scripts/backend/activate-fantasy-rating-points.sql (default: off).
--   1. Ruleset v3.0 (botolago-fantasy-v3.0), a copy of the adaptive v2.1 catalog
--      (positions, chips, deadlines, prices...) WITHOUT its category scoring rows:
--      the rating rule has no table of categories. Inactive; no season points at it.
--   2. app_private.fantasy_rating_policy: per season, the first gameweek and the
--      switch (off by default); app_private.fantasy_rating_scoring_enabled(gw);
--      app_private.fantasy_rating_points_configure, owner-run, which refuses to
--      switch on unless the first gameweek and every later one are still
--      scheduled or open, and refuses to switch off once a gameweek at or after
--      it is finalizing or final.
--   3. A check on every new Fantasy observation: a player's `rating`, when
--      present, is null or a number from 0 to 10 with at most two decimals.
--   4. The scoring input document of a gameweek under the rule: ruleset v3.0,
--      scoringVersion 3, and each player-fixture's `rating` from the fixture's
--      observation. Every other gameweek's document is returned unchanged, byte
--      for byte, so no digest, snapshot or result of GW1-4 moves.
--   5. api.fantasy_rules says, while the rule is on, from which gameweek
--      (`ratingScoring`), so the rules page can state it.
-- The save (api.service_persist_fantasy_scoring_results) learns the `rating`
-- category in the next migration, 20261014090100.

do $$
begin
  if to_regprocedure('app_private.fantasy_scoring_input_document(uuid)') is null
    or to_regprocedure('app_private.fantasy_adaptive_enabled(uuid)') is null
    or to_regclass('app_private.fantasy_adaptive_policy') is null
    or to_regclass('app_private.fantasy_fixture_observations') is null
    or to_regprocedure('api.fantasy_rules(uuid)') is null
    or not exists (select 1 from app.fantasy_rulesets where id = 'f6200000-0000-4000-8000-000000000201') then
    raise exception 'fantasy_rating_points_prerequisite_missing: apply the adaptive Fantasy scoring migrations (20260927094823, 20260927120659, 20260927140000) first';
  end if;
  if to_regprocedure('app_private.fantasy_scoring_input_document_before_rating(uuid)') is not null then
    raise exception 'fantasy_rating_points_already_installed';
  end if;
  -- The rules reader this replaces must be the reviewed one (20260927120659).
  if md5((select prosrc from pg_proc where oid = 'api.fantasy_rules(uuid)'::regprocedure))
    is distinct from '90f39413302aca609fd9ad62f8ec3e99' then
    raise exception 'fantasy_rating_points_unexpected_rules_body: api.fantasy_rules is not the version of migration 20260927120659';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Ruleset v3.0: the v2.1 catalog without category scoring rows.
-- ---------------------------------------------------------------------------
do $$
declare old_id uuid := 'f6200000-0000-4000-8000-000000000201';
 new_id uuid := 'f6200000-0000-4000-8000-000000000300'; tbl text; cols text;
begin
 insert into app.fantasy_rulesets select (jsonb_populate_record(null::app.fantasy_rulesets,
  to_jsonb(r)||jsonb_build_object('id',new_id,'version',3,'minor_version',0,
   'ruleset_code','botolago-fantasy-v3.0','name','BotolaGO Fantasy v3.0 (SofaScore rating)',
   'active',false,'effective_from',statement_timestamp(),'published_at',statement_timestamp()))).*
 from app.fantasy_rulesets r where r.id=old_id;
 foreach tbl in array array['fantasy_position_rules','fantasy_ruleset_features',
  'fantasy_deadline_rules','fantasy_chip_rules','fantasy_price_rules','fantasy_ranking_tiebreak_rules',
  'fantasy_fixture_rules','fantasy_fixture_difficulty_rules'] loop
  select string_agg(quote_ident(column_name),',' order by ordinal_position) into cols
   from information_schema.columns where table_schema='app' and table_name=tbl and column_name<>'id';
  execute format('insert into app.%I (%s) select %s from jsonb_populate_recordset(null::app.%I,
    (select jsonb_agg(to_jsonb(t)||jsonb_build_object(''ruleset_id'',$1)) from app.%I t where ruleset_id=$2))',tbl,cols,cols,tbl,tbl)
   using new_id,old_id;
 end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The per-season switch.
-- ---------------------------------------------------------------------------
create table app_private.fantasy_rating_policy (
  season_id uuid primary key references app.fantasy_seasons(id),
  from_gameweek integer not null check (from_gameweek > 0),
  enabled boolean not null default false,
  updated_at timestamptz not null default statement_timestamp()
);
alter table app_private.fantasy_rating_policy enable row level security;
alter table app_private.fantasy_rating_policy force row level security;
revoke all on app_private.fantasy_rating_policy from public, anon, authenticated, service_role;
comment on table app_private.fantasy_rating_policy is
  'Per-season switch of the rating rule (docs/backend/FANTASY_RATING_POINTS.md): from from_gameweek, points = SofaScore rating rounded, 5 without a rating, 0 without an appearance. Default off. Changed only by app_private.fantasy_rating_points_configure.';

-- On for a gameweek: switched on, at or after the first gameweek, and on the
-- adaptive (observation) path, which is where the rating comes from.
create function app_private.fantasy_rating_scoring_enabled(p_gameweek_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from app.fantasy_gameweeks g
    join app_private.fantasy_rating_policy p on p.season_id = g.fantasy_season_id
   where g.id = p_gameweek_id and p.enabled and g.sequence_number >= p.from_gameweek)
   and app_private.fantasy_adaptive_enabled(p_gameweek_id);
$$;
revoke all on function app_private.fantasy_rating_scoring_enabled(uuid) from public, anon, authenticated, service_role;

-- Owner-run (postgres only). Switching on needs the adaptive policy from that
-- gameweek or earlier and refuses once the first gameweek (or a later one) is
-- locked, live or past it: a gameweek is scored under one rule from its lock.
-- Switching off refuses once a gameweek under the rule is finalizing or final;
-- before that it is the emergency way back (the gameweek is then rescored under
-- the category rule on the next pass).
create function app_private.fantasy_rating_points_configure(
  p_season_id uuid, p_enabled boolean, p_from_gameweek integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_policy app_private.fantasy_rating_policy%rowtype; first_status text;
begin
  if p_season_id is null or p_enabled is null or p_from_gameweek is null or p_from_gameweek < 1 then
    raise exception using errcode = 'PT400', message = 'validation_failed'; end if;
  perform id from app.fantasy_seasons where id = p_season_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'fantasy_season_not_found'; end if;
  -- Gameweek status changes take this lock too, so none moves while this decides.
  perform id from app.fantasy_gameweeks where fantasy_season_id = p_season_id order by id for update;
  select * into current_policy from app_private.fantasy_rating_policy where season_id = p_season_id for update;

  if p_enabled then
    if current_policy.enabled and current_policy.from_gameweek = p_from_gameweek then
      return jsonb_build_object('seasonId', p_season_id, 'enabled', true, 'fromGameweek', p_from_gameweek, 'changed', false);
    end if;
    if current_policy.enabled then
      raise exception using errcode = 'PT409', message = 'fantasy_rating_policy_immutable'; end if;
    if not exists(select 1 from app_private.fantasy_adaptive_policy a
                   where a.season_id = p_season_id and not a.paused and a.from_gameweek <= p_from_gameweek) then
      raise exception using errcode = 'PT409', message = 'fantasy_rating_prerequisites_missing'; end if;
    select g.status::text into first_status from app.fantasy_gameweeks g
     where g.fantasy_season_id = p_season_id and g.sequence_number = p_from_gameweek;
    if first_status is null then
      raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found'; end if;
    if exists(select 1 from app.fantasy_gameweeks g where g.fantasy_season_id = p_season_id
               and g.sequence_number >= p_from_gameweek and g.status not in ('scheduled', 'open')) then
      raise exception using errcode = 'PT409', message = 'fantasy_rating_gameweek_started'; end if;
  else
    if current_policy.season_id is null or not current_policy.enabled then
      return jsonb_build_object('seasonId', p_season_id, 'enabled', false,
        'fromGameweek', coalesce(current_policy.from_gameweek, p_from_gameweek), 'changed', false);
    end if;
    if p_from_gameweek <> current_policy.from_gameweek then
      raise exception using errcode = 'PT409', message = 'fantasy_rating_policy_immutable'; end if;
    if exists(select 1 from app.fantasy_gameweeks g where g.fantasy_season_id = p_season_id
               and g.sequence_number >= current_policy.from_gameweek
               and g.status in ('finalizing', 'finalized', 'corrected')) then
      raise exception using errcode = 'PT409', message = 'fantasy_rating_finalized_history_protected'; end if;
  end if;
  insert into app_private.fantasy_rating_policy(season_id, from_gameweek, enabled)
  values (p_season_id, p_from_gameweek, p_enabled)
  on conflict (season_id) do update set enabled = excluded.enabled,
    from_gameweek = excluded.from_gameweek, updated_at = statement_timestamp();
  return jsonb_build_object('seasonId', p_season_id, 'enabled', p_enabled, 'fromGameweek', p_from_gameweek, 'changed', true);
end $$;
revoke all on function app_private.fantasy_rating_points_configure(uuid, boolean, integer)
  from public, anon, authenticated, service_role;
comment on function app_private.fantasy_rating_points_configure(uuid, boolean, integer) is
  'Owner-run switch of the rating rule for a season from a gameweek. On: needs the adaptive policy and every gameweek from the first one still scheduled or open. Off: refused once a gameweek under the rule is finalizing or final. Executable by postgres only.';

-- ---------------------------------------------------------------------------
-- 3. A rating in a Fantasy observation is null or 0..10 with two decimals at most.
-- ---------------------------------------------------------------------------
create function app_private.fantasy_observation_rating_check()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists(select 1 from jsonb_array_elements(case when jsonb_typeof(new.payload->'players') = 'array'
                                                     then new.payload->'players' else '[]'::jsonb end) r
             where jsonb_typeof(r) = 'object' and r ? 'rating'
               and not (jsonb_typeof(r->'rating') = 'null'
                 or (jsonb_typeof(r->'rating') = 'number'
                     and (r->>'rating')::numeric between 0 and 10
                     and (r->>'rating')::numeric = round((r->>'rating')::numeric, 2)))) then
    raise exception using errcode = 'PT400', message = 'fantasy_observation_rating_invalid';
  end if;
  return new;
end $$;
revoke all on function app_private.fantasy_observation_rating_check() from public, anon, authenticated, service_role;
create trigger fantasy_observation_rating_check before insert on app_private.fantasy_fixture_observations
  for each row execute function app_private.fantasy_observation_rating_check();

-- ---------------------------------------------------------------------------
-- 4. The scoring input document of a gameweek under the rule.
-- ---------------------------------------------------------------------------
alter function app_private.fantasy_scoring_input_document(uuid) rename to fantasy_scoring_input_document_before_rating;
revoke all on function app_private.fantasy_scoring_input_document_before_rating(uuid) from public, anon, authenticated, service_role;
create function app_private.fantasy_scoring_input_document(p_gameweek_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d jsonb; rules jsonb; rows jsonb;
begin
  d := app_private.fantasy_scoring_input_document_before_rating(p_gameweek_id);
  -- Every gameweek outside the rule: the document it always was, byte for byte.
  if not app_private.fantasy_rating_scoring_enabled(p_gameweek_id)
    or not coalesce((d->>'adaptive')::boolean, false) then
    return d;
  end if;
  select to_jsonb(r) - 'created_at' - 'updated_at' into rules
    from app.fantasy_rulesets r where r.id = 'f6200000-0000-4000-8000-000000000300';
  -- Each player-fixture gets the rating of the observation its fixture is scored
  -- from (the fixture's observationId), null when the player has no row there
  -- (he did not appear) or SofaScore gave him none. A new observation, a
  -- corrected rating included, is a new document digest and so a new calculation.
  with ratings as (
    select f->>'fixtureId' as fixture_id, r->>'playerId' as player_id,
           case when jsonb_typeof(r->'rating') = 'number' then r->'rating' end as rating
      from jsonb_array_elements(d->'fixtures') f
      join app_private.fantasy_fixture_observations o
        on o.id = case when jsonb_typeof(f->'observationId') = 'number' then (f->>'observationId')::bigint end
     cross join lateral jsonb_array_elements(case when jsonb_typeof(o.payload->'players') = 'array'
                                                  then o.payload->'players' else '[]'::jsonb end) r
  )
  select coalesce(jsonb_agg(x.pf || jsonb_build_object('rating',
           (select rt.rating from ratings rt
             where rt.fixture_id = x.pf->>'fixtureId' and rt.player_id = x.pf->>'playerId' limit 1))
         order by x.ord), '[]'::jsonb)
    into rows
    from jsonb_array_elements(d->'playerFixtures') with ordinality x(pf, ord);
  return d || jsonb_build_object('scoringVersion', 3, 'ratingScoring', true, 'ruleset', rules,
    'playerFixtures', rows);
end $$;
revoke all on function app_private.fantasy_scoring_input_document(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. The rules the page reads: the previous body, plus `ratingScoring` while on.
-- ---------------------------------------------------------------------------
create or replace function api.fantasy_rules(p_season_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select api.fantasy_rules_v1(p_season_id)||coalesce((select jsonb_build_object('adaptiveScoring',
 jsonb_build_object('fromGameweek',p.from_gameweek,'selectionDelayHours',12,'scope','fixture','lateModeUpgrade',false,'estimatesFinalForRankings',p.ruleset_id='f6200000-0000-4000-8000-000000000201'::uuid),
 'rulesetId',p.ruleset_id,'rulesetCode',r.ruleset_code,'rulesetVersion',r.version,'rulesetSemanticVersion',r.version::text||'.'||r.minor_version::text)
 from app_private.fantasy_adaptive_policy p join app.fantasy_rulesets r on r.id=p.ruleset_id where p.season_id=p_season_id),'{}')
 ||coalesce((select jsonb_build_object('ratingScoring',jsonb_build_object('fromGameweek',rp.from_gameweek,'noRatingPoints',5))
 from app_private.fantasy_rating_policy rp where rp.season_id=p_season_id and rp.enabled),'{}');
$$;
revoke all on function api.fantasy_rules(uuid) from public;
grant execute on function api.fantasy_rules(uuid) to anon, authenticated, service_role;
