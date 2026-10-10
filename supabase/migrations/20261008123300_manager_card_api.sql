-- Manager Card (BG-0158), part 3: the read API.
--
-- Four signed-in reads over the tables of 20261008123000. The calculation that
-- fills those tables is 20261008123200; this file only reads them, and depends
-- on neither it nor the jobs (20261008123400).
--
--   api.get_my_manager_card()                       the caller's card
--   api.get_manager_card(p_fantasy_team_id)         one card, by Fantasy team
--   api.get_manager_cards(p_fantasy_team_ids)       up to 100, for ranking rows
--   api.get_my_manager_card_history(after, limit)   the caller's card over time
--
-- DISPLAY ONLY, SIGNED-IN ONLY (D19). Every function runs the MFA step-up as
-- its first statement, requires a caller (PT401), is refused while
-- app_private.manager_card_settings.read_enabled is false (PT403
-- manager_card_off), is granted to authenticated and service_role and never to
-- anon. A card is looked up by Fantasy team, never by user id, and no function
-- returns a user id or an e-mail. A profile with deleted_at set (an account
-- waiting to be erased) has no card: the single reads answer null, the batch
-- read leaves it out, the caller's own history is empty.
--
-- WHICH SEASON'S CARD (D7)
--
--   A season "qualifies" when its row has gameweeks_counted >= the minimum in
--   the active rules (config->>'minimum_gameweeks'). With no active rules row
--   the minimum is unknown, and a season qualifies when it has an OVR.
--
--   api.get_my_manager_card and the history read choose the caller's most
--   recent season (fantasy_seasons.starts_at, then id) that qualifies. When the
--   latest season is still under the minimum, that is last season's card, with
--   last season's label. When no season qualifies, the card is the latest
--   season's row with its figures null (a manager with a number and no rating
--   yet). When the caller has no manager_card_seasons row at all there is
--   nothing to show and the answer is null (a card row with no season has no
--   team to name).
--
--   api.get_manager_card and api.get_manager_cards answer for the season the
--   asked-for team belongs to. The D7 fallback is NOT applied to other
--   people's cards: a team under the minimum shows its season with null
--   figures, so a ranking row never shows a figure from another season.
--
-- WHAT A CARD SAYS
--
--   name   the profile display name when it is not blank, else the Fantasy
--          team name (the rule of api.fantasy_overall_standings, 20260921180000;
--          here the reader is always signed in, so the display name may be
--          shown).
--   handle the username or null. serial is the six-digit number as a string
--          (100000-999999), or null before one is assigned.
--   club   from user_preferences.favorite_team_id: id, code, shortName in both
--          languages (translation, else the Latin short name) and the two
--          colours; null when no favourite club is set. Colours are null when
--          the catalogue has none.
--   figures (ovr, tier, the four stats) are null while the season is under the
--          minimum, whatever the row holds.
--
-- Helpers live in app_private, are not granted to any API role and do not read
-- the caller; the api functions own the caller, the step-up and the switch.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The active rules' minimum number of gameweeks, or null (no active rules, or
-- no usable minimum).
create function app_private.manager_card_minimum()
returns integer
language sql
stable
set search_path = ''
as $$
  select (rules.config ->> 'minimum_gameweeks')::integer
  from app_private.manager_card_rules rules
  where rules.active and (rules.config ->> 'minimum_gameweeks') ~ '^[0-9]{1,6}$';
$$;
revoke all on function app_private.manager_card_minimum()
  from public, anon, authenticated, service_role;

-- Does a season row count? Under the minimum it does not; with no known
-- minimum it counts when it has an OVR.
create function app_private.manager_card_qualifies(p_gameweeks_counted integer, p_ovr smallint)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(p_gameweeks_counted >= app_private.manager_card_minimum(), p_ovr is not null);
$$;
revoke all on function app_private.manager_card_qualifies(integer, smallint)
  from public, anon, authenticated, service_role;

-- The season whose card a manager's own reads show (D7): the latest qualifying
-- season, else the latest season. Null when the manager has no season row.
create function app_private.manager_card_current_season(p_user_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select cs.fantasy_season_id
  from app.manager_card_seasons cs
  join app.fantasy_seasons fs on fs.id = cs.fantasy_season_id
  where cs.user_id = p_user_id
  order by not app_private.manager_card_qualifies(cs.gameweeks_counted, cs.ovr),
    fs.starts_at desc, fs.id desc
  limit 1;
$$;
revoke all on function app_private.manager_card_current_season(uuid)
  from public, anon, authenticated, service_role;

-- One card as the API shows it, or null: no card row, no row for that season,
-- or a profile waiting to be erased. No user id, no e-mail.
create function app_private.manager_card_json(p_user_id uuid, p_fantasy_season_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'fantasyTeamId', cs.fantasy_team_id,
    'name', coalesce(nullif(btrim(profile.display_name), ''), team.name),
    'handle', profile.username,
    'serial', card.serial,
    'founderCohort', card.founder_cohort,
    'season', jsonb_build_object('id', cs.fantasy_season_id, 'label', season.label),
    'ovr', case when qualified.ok then cs.ovr end,
    'tier', case when qualified.ok then cs.tier end,
    'stats', jsonb_build_object(
      'cap', case when qualified.ok then cs.cap end,
      'sel', case when qualified.ok then cs.sel end,
      'trf', case when qualified.ok then cs.trf end,
      'con', case when qualified.ok then cs.con end
    ),
    'provisional', cs.provisional,
    'gameweeksCounted', cs.gameweeks_counted,
    'rulesVersion', cs.rules_version,
    'club', case when club.id is null then null else jsonb_build_object(
      'id', club.id,
      'code', club.code,
      'shortName', jsonb_build_object(
        'fr', coalesce(club_fr.short_name, club.short_name),
        'ar', coalesce(club_ar.short_name, club.short_name)
      ),
      'primaryColor', club.primary_color,
      'secondaryColor', club.secondary_color
    ) end
  )
  from app.manager_card_seasons cs
  join app.manager_cards card on card.user_id = cs.user_id
  join app.profiles profile on profile.id = cs.user_id and profile.deleted_at is null
  join app.fantasy_teams team on team.id = cs.fantasy_team_id
  join app.fantasy_seasons fs on fs.id = cs.fantasy_season_id
  join app.seasons season on season.id = fs.football_season_id
  left join app.user_preferences preference on preference.user_id = cs.user_id
  left join app.teams club on club.id = preference.favorite_team_id
  left join app.team_translations club_fr
    on club_fr.team_id = club.id and club_fr.language = 'fr'
  left join app.team_translations club_ar
    on club_ar.team_id = club.id and club_ar.language = 'ar'
  cross join lateral (
    select app_private.manager_card_qualifies(cs.gameweeks_counted, cs.ovr) as ok
  ) qualified
  where cs.user_id = p_user_id and cs.fantasy_season_id = p_fantasy_season_id;
$$;
revoke all on function app_private.manager_card_json(uuid, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- api.get_my_manager_card
-- ---------------------------------------------------------------------------
create function api.get_my_manager_card()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  perform app_private.assert_mfa_step_up();
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  if not coalesce((select read_enabled from app_private.manager_card_settings where id), false) then
    raise exception using errcode = 'PT403', message = 'manager_card_off';
  end if;
  return app_private.manager_card_json(actor, app_private.manager_card_current_season(actor));
end;
$$;
revoke all on function api.get_my_manager_card() from public, anon, authenticated, service_role;
grant execute on function api.get_my_manager_card() to authenticated, service_role;
comment on function api.get_my_manager_card() is
  'The caller''s Manager Card (latest qualifying season, else the latest season with null figures), or null. Signed-in, step-up, refused with manager_card_off while the switch is off.';

-- ---------------------------------------------------------------------------
-- api.get_manager_card
-- ---------------------------------------------------------------------------
create function api.get_manager_card(p_fantasy_team_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target app.fantasy_teams%rowtype;
begin
  perform app_private.assert_mfa_step_up();
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  if not coalesce((select read_enabled from app_private.manager_card_settings where id), false) then
    raise exception using errcode = 'PT403', message = 'manager_card_off';
  end if;
  if p_fantasy_team_id is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select * into target from app.fantasy_teams team where team.id = p_fantasy_team_id;
  if not found then
    return null;
  end if;
  return app_private.manager_card_json(target.user_id, target.fantasy_season_id);
end;
$$;
revoke all on function api.get_manager_card(uuid) from public, anon, authenticated, service_role;
grant execute on function api.get_manager_card(uuid) to authenticated, service_role;
comment on function api.get_manager_card(uuid) is
  'One manager''s card for the season of the given Fantasy team, or null (unknown team, no card, profile waiting to be erased). No fallback to another season. Signed-in, step-up, manager_card_off while the switch is off.';

-- ---------------------------------------------------------------------------
-- api.get_manager_cards
-- ---------------------------------------------------------------------------
create function api.get_manager_cards(p_fantasy_team_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  result jsonb;
begin
  perform app_private.assert_mfa_step_up();
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  if not coalesce((select read_enabled from app_private.manager_card_settings where id), false) then
    raise exception using errcode = 'PT403', message = 'manager_card_off';
  end if;
  if p_fantasy_team_ids is null
    or (select count(distinct asked.id) from unnest(p_fantasy_team_ids) as asked(id)) > 100 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  -- Stable order: the order each team was first asked for. Unknown teams,
  -- teams without a card and hidden profiles are left out.
  select coalesce(jsonb_agg(found.card order by found.position), '[]'::jsonb)
  into result
  from (
    select asked.position, built.card
    from (
      select t.id, min(t.position) as position
      from unnest(p_fantasy_team_ids) with ordinality as t(id, position)
      where t.id is not null
      group by t.id
    ) asked
    join app.fantasy_teams team on team.id = asked.id
    cross join lateral (
      select app_private.manager_card_json(team.user_id, team.fantasy_season_id) as card
    ) built
    where built.card is not null
  ) found;
  return result;
end;
$$;
revoke all on function api.get_manager_cards(uuid[]) from public, anon, authenticated, service_role;
grant execute on function api.get_manager_cards(uuid[]) to authenticated, service_role;
comment on function api.get_manager_cards(uuid[]) is
  'Cards for up to 100 distinct Fantasy teams, in the order first asked; teams without a visible card are omitted. Signed-in, step-up, manager_card_off while the switch is off.';

-- ---------------------------------------------------------------------------
-- api.get_my_manager_card_history
-- ---------------------------------------------------------------------------
create function api.get_my_manager_card_history(
  p_after_gameweek_sequence integer default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  card_season uuid;
  page_items jsonb;
  last_sequence integer;
  more boolean;
begin
  perform app_private.assert_mfa_step_up();
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  if not coalesce((select read_enabled from app_private.manager_card_settings where id), false) then
    raise exception using errcode = 'PT403', message = 'manager_card_off';
  end if;
  if p_limit is null or p_limit not between 1 and 50
    or (p_after_gameweek_sequence is not null and p_after_gameweek_sequence < 1) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  card_season := app_private.manager_card_current_season(actor);
  if card_season is null or not exists (
    select 1 from app.profiles profile where profile.id = actor and profile.deleted_at is null
  ) then
    return jsonb_build_object('items', '[]'::jsonb, 'nextAfter', null);
  end if;

  -- One row more than asked for says whether there is another page.
  with page as (
    select gameweek.sequence_number, history.ovr, history.tier, history.cap,
      history.sel, history.trf, history.con, history.provisional,
      app_private.manager_card_qualifies(history.gameweeks_counted, history.ovr) as ok,
      row_number() over (order by gameweek.sequence_number desc) as position
    from app.manager_card_gameweeks history
    join app.fantasy_gameweeks gameweek on gameweek.id = history.gameweek_id
    where history.user_id = actor
      and history.fantasy_season_id = card_season
      and (p_after_gameweek_sequence is null
        or gameweek.sequence_number < p_after_gameweek_sequence)
    order by gameweek.sequence_number desc
    limit p_limit + 1
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'gameweekSequence', page.sequence_number,
      'ovr', case when page.ok then page.ovr end,
      'tier', case when page.ok then page.tier end,
      'stats', jsonb_build_object(
        'cap', case when page.ok then page.cap end,
        'sel', case when page.ok then page.sel end,
        'trf', case when page.ok then page.trf end,
        'con', case when page.ok then page.con end
      ),
      'provisional', page.provisional
    ) order by page.sequence_number desc) filter (where page.position <= p_limit), '[]'::jsonb),
    min(page.sequence_number) filter (where page.position <= p_limit),
    coalesce(bool_or(page.position > p_limit), false)
  into page_items, last_sequence, more
  from page;

  return jsonb_build_object(
    'items', page_items,
    'nextAfter', case when more then last_sequence else null end
  );
end;
$$;
revoke all on function api.get_my_manager_card_history(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function api.get_my_manager_card_history(integer, integer)
  to authenticated, service_role;
comment on function api.get_my_manager_card_history(integer, integer) is
  'The caller''s card history for the season shown by get_my_manager_card, newest gameweek first, keyset by gameweek sequence (limit 1..50). Returns {items, nextAfter}. Signed-in, step-up, manager_card_off while the switch is off.';
