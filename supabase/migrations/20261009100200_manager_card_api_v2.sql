-- Manager Card (BG-0158), gap plan 3.3: the read API of the merged Gradins front end.
--
-- Replaces #381's read API (20261008123300) with the contract in
-- src/backend/manager-card/contracts.ts and drops what that contract does not
-- use. OFF IS AN ANSWER, not an error: while app_private.manager_card_read_ready()
-- is false (switch off, or no usable active rules row) every read answers HTTP
-- 200 {"available": false} (the acknowledgement answers everything "ignored"),
-- checked before the step-up and before the caller is read.
--
--   api.manager_card_status()                         anon too; never raises
--   api.get_my_manager_card()                         {available, card}
--   api.get_manager_cards(p_team_ids)                 {available, cards}
--   api.get_my_manager_card_history(season, before, limit)
--                                                     {available, items, nextBeforeSeq}
--   api.ack_manager_card_moments(p_keys)              {acknowledged, ignored}
--
-- The four signed-in functions run, in this order: argument check (PT400
-- validation_failed), the off answer, app_private.assert_mfa_step_up(), the
-- caller (PT401 authentication_required). Granted to authenticated and
-- service_role, never to anon. Display only: the acknowledgement writes only
-- app.manager_card_moment_acks.

drop function api.get_manager_card(uuid);
drop function api.get_manager_cards(uuid[]);
drop function api.get_my_manager_card_history(integer, integer);

-- ---------------------------------------------------------------------------
-- api.manager_card_status
-- ---------------------------------------------------------------------------
create function api.manager_card_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'enabled', app_private.manager_card_read_ready(),
    'minRated', case when app_private.manager_card_read_ready()
      then (select r.min_rated from app_private.manager_card_active_rules() r) end,
    'minConfirmed', case when app_private.manager_card_read_ready()
      then (select r.min_confirmed from app_private.manager_card_active_rules() r) end
  );
$$;

-- ---------------------------------------------------------------------------
-- api.get_my_manager_card
-- ---------------------------------------------------------------------------
create or replace function api.get_my_manager_card()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid;
begin
  if not app_private.manager_card_read_ready() then
    return jsonb_build_object('available', false);
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  return jsonb_build_object('available', true, 'card', app_private.manager_card_my_card(actor));
end;
$$;

-- ---------------------------------------------------------------------------
-- api.get_manager_cards
-- ---------------------------------------------------------------------------
create function api.get_manager_cards(p_team_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid;
  result jsonb;
begin
  if p_team_ids is null
    or (select count(distinct asked.id) from unnest(p_team_ids) as asked(id)) > 100 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if not app_private.manager_card_read_ready() then
    return jsonb_build_object('available', false);
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  -- The order each team was first asked for; unknown teams and hidden
  -- profiles are left out.
  select coalesce(jsonb_agg(found.card order by found.position), '[]'::jsonb)
  into result
  from (
    select asked.position, built.card
    from (
      select t.id, min(t.position) as position
      from unnest(p_team_ids) with ordinality as t(id, position)
      where t.id is not null
      group by t.id
    ) asked
    cross join lateral (
      select app_private.manager_card_member_card(asked.id) as card
    ) built
    where built.card is not null
  ) found;
  return jsonb_build_object('available', true, 'cards', result);
end;
$$;

-- ---------------------------------------------------------------------------
-- api.get_my_manager_card_history
-- ---------------------------------------------------------------------------
create function api.get_my_manager_card_history(
  p_season_id uuid default null,
  p_before_seq integer default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid;
  v_season uuid;
  rules record;
  page_items jsonb;
  last_sequence integer;
  more boolean;
begin
  if p_limit is null or p_limit not between 1 and 50
    or (p_before_seq is not null and p_before_seq < 1) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if not app_private.manager_card_read_ready() then
    return jsonb_build_object('available', false);
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;

  v_season := coalesce(p_season_id, app_private.manager_card_fantasy_season());
  if v_season is null or not exists (
    select 1 from app.profiles profile where profile.id = actor and profile.deleted_at is null
  ) then
    return jsonb_build_object('available', true, 'items', '[]'::jsonb, 'nextBeforeSeq', null);
  end if;
  select * into rules from app_private.manager_card_active_rules() r;

  -- One row more than asked for says whether there is another page.
  with page as (
    select gw.sequence_number, history.fantasy_season_id, history.ovr, history.tier,
      history.cap, history.sel, history.trf, history.con, history.provisional,
      history.gameweeks_counted, history.calculated_at,
      history.gameweeks_counted >= rules.min_rated as ok,
      row_number() over (order by gw.sequence_number desc) as position
    from app.manager_card_gameweeks history
    join app.fantasy_gameweeks gw on gw.id = history.gameweek_id
    where history.user_id = actor
      and history.fantasy_season_id = v_season
      and (p_before_seq is null or gw.sequence_number < p_before_seq)
    order by gw.sequence_number desc
    limit p_limit + 1
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'seasonId', page.fantasy_season_id,
      'seasonLabel', app_private.manager_card_season_label(page.fantasy_season_id),
      'gameweekSeq', page.sequence_number,
      'ovr', case when page.ok then page.ovr end,
      'tier', case when page.ok and page.ovr is not null then page.tier end,
      'provisional', page.ok and page.ovr is not null and page.provisional,
      'gameweeksCounted', page.gameweeks_counted,
      'stats', jsonb_build_object(
        'cap', case when page.ok then page.cap end,
        'sel', case when page.ok then page.sel end,
        'trf', case when page.ok then page.trf end,
        'con', case when page.ok then page.con end
      ),
      'calculatedAt', page.calculated_at
    ) order by page.sequence_number desc) filter (where page.position <= p_limit), '[]'::jsonb),
    min(page.sequence_number) filter (where page.position <= p_limit),
    coalesce(bool_or(page.position > p_limit), false)
  into page_items, last_sequence, more
  from page;

  return jsonb_build_object(
    'available', true,
    'items', page_items,
    'nextBeforeSeq', case when more then last_sequence end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- api.ack_manager_card_moments
-- ---------------------------------------------------------------------------
create function api.ack_manager_card_moments(p_keys text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid;
  asked text[];
  acknowledged text[];
  ignored text[];
begin
  if p_keys is null or cardinality(p_keys) = 0
    or exists (select 1 from unnest(p_keys) as k(key) where k.key is null) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  -- Distinct keys in request order.
  select coalesce(array_agg(d.key order by d.position), '{}')
  into asked
  from (
    select k.key, min(k.position) as position
    from unnest(p_keys) with ordinality as k(key, position)
    group by k.key
  ) d;
  if cardinality(asked) > 16 or exists (
    select 1 from unnest(asked) as k(key)
    where char_length(k.key) > 80 or k.key !~ (
      '^(card_created|founder_granted|tier_changed:(stade|pro|champion|legend)|'
      || '(first_rating|provisional_cleared|season_closed|season_started):'
      || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$')
  ) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if not app_private.manager_card_read_ready() then
    return jsonb_build_object('acknowledged', '[]'::jsonb, 'ignored', to_jsonb(asked));
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  if not exists (
    select 1 from app.profiles profile where profile.id = actor and profile.deleted_at is null
  ) then
    return jsonb_build_object('acknowledged', '[]'::jsonb, 'ignored', to_jsonb(asked));
  end if;

  -- Only moments that are derivable now (pending or not), so a benign race
  -- never fails.
  insert into app.manager_card_moment_acks (user_id, moment_key)
  select actor, m.moment_key
  from app_private.manager_card_moments(actor) m
  where m.moment_key = any (asked)
  on conflict do nothing;

  select coalesce(array_agg(k.key order by k.position) filter (where a.moment_key is not null), '{}'),
    coalesce(array_agg(k.key order by k.position) filter (where a.moment_key is null), '{}')
  into acknowledged, ignored
  from unnest(asked) with ordinality as k(key, position)
  left join app.manager_card_moment_acks a on a.user_id = actor and a.moment_key = k.key;

  return jsonb_build_object('acknowledged', to_jsonb(acknowledged), 'ignored', to_jsonb(ignored));
end;
$$;

-- The #381 builders have no caller left.
drop function app_private.manager_card_json(uuid, uuid);
drop function app_private.manager_card_current_season(uuid);

-- ---------------------------------------------------------------------------
-- Grants and comments
-- ---------------------------------------------------------------------------
revoke all on function api.manager_card_status() from public, anon, authenticated, service_role;
grant execute on function api.manager_card_status() to anon, authenticated, service_role;
revoke all on function api.get_my_manager_card() from public, anon, authenticated, service_role;
grant execute on function api.get_my_manager_card() to authenticated, service_role;
revoke all on function api.get_manager_cards(uuid[]) from public, anon, authenticated, service_role;
grant execute on function api.get_manager_cards(uuid[]) to authenticated, service_role;
revoke all on function api.get_my_manager_card_history(uuid, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function api.get_my_manager_card_history(uuid, integer, integer)
  to authenticated, service_role;
revoke all on function api.ack_manager_card_moments(text[])
  from public, anon, authenticated, service_role;
grant execute on function api.ack_manager_card_moments(text[]) to authenticated, service_role;

comment on function api.manager_card_status() is
  'Whether the Manager Card section is on: {enabled, minRated, minConfirmed}, numbers null while off. Granted to anon too; reads no caller, no step-up, never raises. Off means the switch is off or the active rules row is not usable. Display only.';
comment on function api.get_my_manager_card() is
  'The caller''s Manager Card for the current Fantasy season: {available:true, card} (card null without a team this season), or {available:false} while off. Signed-in, step-up. Display only.';
comment on function api.get_manager_cards(uuid[]) is
  'Member cards for up to 100 distinct Fantasy team ids, in the order first asked: {available:true, cards}, or {available:false} while off. A team with no card row is a forming card; unknown teams and deleted-pending profiles are left out. Signed-in, step-up. Display only.';
comment on function api.get_my_manager_card_history(uuid, integer, integer) is
  'The caller''s card history for a season (default the current one), newest gameweek first, keyset by sequence (limit 1..50): {available:true, items, nextBeforeSeq}, or {available:false} while off. Signed-in, step-up. Display only.';
comment on function api.ack_manager_card_moments(text[]) is
  'Records Manager Card moments as seen (1..16 well-formed keys): {acknowledged, ignored}. While off everything is ignored and nothing is written. Only moments derivable now are recorded. Signed-in, step-up. Display only.';

notify pgrst, 'reload schema';
