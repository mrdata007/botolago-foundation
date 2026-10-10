-- Fantasy R4 / P6 — opt-in public gameweek recaps.
--
-- A manager may publish the recap of one finalized gameweek under a display
-- alias they choose. Anyone holding the link reads a narrow, server-built
-- projection of it; nothing else about the account is reachable from it.
--
-- What this migration adds, and the rules each part keeps:
--
--   app.fantasy_public_recaps
--     One row per publication. `public_id` is 128 random bits (base64url, 22
--     characters): the only key a reader holds, so it is not guessable and
--     the table cannot be walked. The owner's ids never leave the database.
--     At most one live publication per team and gameweek (partial unique
--     index). Revoking keeps the row for the record, clears the alias and
--     never comes back: publishing again mints a new `public_id`, so a
--     revoked link stays dead ("no accidental resurrection").
--
--   app_private.fantasy_public_recap_settings
--     One row, two switches, both OFF by default: `publish_enabled` (new
--     publications) and `read_enabled` (public reads). Turning `read_enabled`
--     off withdraws every public page at once, server-side, without a deploy.
--     Changed only through app_private.fantasy_public_recap_configure, which
--     no client role may call.
--
--   api.publish_fantasy_gameweek_recap(team, gameweek, alias)
--     Signed-in owner only (and the MFA step-up), switch on, gameweek
--     finalized or corrected and the team's result final. Idempotent: an
--     existing live publication is returned (its alias updated).
--   api.revoke_fantasy_gameweek_recap(public_id)
--     Owner only. Idempotent.
--   api.my_fantasy_gameweek_recap_publication(team, gameweek)
--     Owner only: the live publication, or null.
--   api.public_fantasy_gameweek_recap(public_id)
--     anon and authenticated. Null — one answer for "unknown", "revoked" and
--     "switched off", so a reader learns nothing from a wrong id — or the
--     public projection, built here from the stored result:
--       season name, gameweek number, alias, final score, corrected flag,
--       calculation version, updated time, transfer cost, chip, and the
--       effective captain (name, points, multiplier) only when the stored
--       bonus agrees with points × (multiplier − 1) and the parts add up to
--       the final score — the same rule as the private recap
--       (src/services/gameweek-recap.ts).
--     Read live, so an authoritative correction shows up on the link with
--     its revision, and revocation takes effect on the next request.
--     No email, real name, private league, invite code or future squad.
--
-- Nothing here writes to existing tables or changes an existing function.

-- ---------------------------------------------------------------------------
-- The switches: one row, both off, changed only by a guarded script.
-- ---------------------------------------------------------------------------
create table app_private.fantasy_public_recap_settings (
  singleton boolean primary key default true,
  publish_enabled boolean not null default false,
  read_enabled boolean not null default false,
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_public_recap_settings_singleton_check check (singleton)
);
insert into app_private.fantasy_public_recap_settings (singleton) values (true);
alter table app_private.fantasy_public_recap_settings enable row level security;
alter table app_private.fantasy_public_recap_settings force row level security;
revoke all on table app_private.fantasy_public_recap_settings
  from public, anon, authenticated, service_role;
comment on table app_private.fantasy_public_recap_settings is
  'One row. publish_enabled lets owners publish new public recaps; read_enabled serves them. Both start off. Set read_enabled = false to withdraw every public recap page at once.';

create function app_private.fantasy_public_recap_configure(
  p_publish_enabled boolean,
  p_read_enabled boolean
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update app_private.fantasy_public_recap_settings
  set publish_enabled = coalesce(p_publish_enabled, publish_enabled),
      read_enabled = coalesce(p_read_enabled, read_enabled),
      updated_at = statement_timestamp()
  where singleton;
$$;
revoke all on function app_private.fantasy_public_recap_configure(boolean, boolean)
  from public, anon, authenticated, service_role;
comment on function app_private.fantasy_public_recap_configure(boolean, boolean) is
  'Owner-run switch for public recaps: (publish, read); null leaves a switch as it is.';

-- ---------------------------------------------------------------------------
-- The publications.
-- ---------------------------------------------------------------------------
create table app.fantasy_public_recaps (
  id uuid primary key default gen_random_uuid(),
  public_id text not null,
  fantasy_team_id uuid not null references app.fantasy_teams(id) on delete restrict,
  gameweek_id uuid not null references app.fantasy_gameweeks(id) on delete restrict,
  user_id uuid not null references app.profiles(id) on delete restrict,
  alias text,
  status text not null default 'published',
  published_at timestamptz not null default statement_timestamp(),
  revoked_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_public_recaps_public_id_key unique (public_id),
  constraint fantasy_public_recaps_public_id_check check (public_id ~ '^[A-Za-z0-9_-]{22}$'),
  constraint fantasy_public_recaps_status_check check (status in ('published', 'revoked')),
  constraint fantasy_public_recaps_state_check check (
    (status = 'published' and revoked_at is null and alias is not null)
    or (status = 'revoked' and revoked_at is not null and alias is null)
  ),
  constraint fantasy_public_recaps_alias_check check (
    alias is null or (
      alias = btrim(alias) and char_length(alias) between 2 and 40
      and alias !~ '[[:cntrl:]]'
    )
  )
);
create unique index fantasy_public_recaps_live_key
  on app.fantasy_public_recaps (fantasy_team_id, gameweek_id)
  where status = 'published';
create index fantasy_public_recaps_user_idx on app.fantasy_public_recaps (user_id);
alter table app.fantasy_public_recaps enable row level security;
alter table app.fantasy_public_recaps force row level security;
revoke all on table app.fantasy_public_recaps from public, anon, authenticated, service_role;
comment on table app.fantasy_public_recaps is
  'Opt-in public gameweek recaps. Read and written only through the api.*_fantasy_gameweek_recap functions.';

-- ---------------------------------------------------------------------------
-- Helpers.
-- ---------------------------------------------------------------------------
create function app_private.fantasy_public_recap_id()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(rtrim(encode(extensions.gen_random_bytes(16), 'base64'), '='), '+/', '-_');
$$;
revoke all on function app_private.fantasy_public_recap_id()
  from public, anon, authenticated, service_role;

-- Refuses anyone but the signed-in owner of the team (PT401 / PT403).
create function app_private.fantasy_public_recap_owner(p_team_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  perform app_private.assert_mfa_step_up();
  if not exists (
    select 1 from app.fantasy_teams team
    where team.id = p_team_id and team.user_id = actor
  ) then
    raise exception using errcode = 'PT403', message = 'fantasy_team_forbidden';
  end if;
  return actor;
end;
$$;
revoke all on function app_private.fantasy_public_recap_owner(uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Publish / revoke / the owner's view.
-- ---------------------------------------------------------------------------
create function api.publish_fantasy_gameweek_recap(
  p_team_id uuid,
  p_gameweek_id uuid,
  p_alias text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid;
  clean_alias text := btrim(coalesce(p_alias, ''));
  live app.fantasy_public_recaps;
begin
  actor := app_private.fantasy_public_recap_owner(p_team_id);
  if not coalesce((select publish_enabled from app_private.fantasy_public_recap_settings where singleton), false) then
    raise exception using errcode = 'PT403', message = 'public_recap_disabled';
  end if;
  if char_length(clean_alias) not between 2 and 40 or clean_alias ~ '[[:cntrl:]]' then
    raise exception using errcode = 'PT400', message = 'public_recap_alias_invalid';
  end if;
  if not exists (
    select 1
    from app.fantasy_team_gameweek_results result
    join app.fantasy_gameweeks gameweek on gameweek.id = result.gameweek_id
    join app.fantasy_teams team on team.id = result.fantasy_team_id
    where result.fantasy_team_id = p_team_id and result.gameweek_id = p_gameweek_id
      and result.state = 'final' and result.final_score is not null
      and gameweek.status in ('finalized', 'corrected')
      and gameweek.fantasy_season_id = team.fantasy_season_id
  ) then
    raise exception using errcode = 'PT409', message = 'public_recap_not_final';
  end if;

  select * into live from app.fantasy_public_recaps
  where fantasy_team_id = p_team_id and gameweek_id = p_gameweek_id and status = 'published'
  for update;
  if found then
    update app.fantasy_public_recaps
    set alias = clean_alias, updated_at = statement_timestamp()
    where id = live.id
    returning * into live;
  else
    begin
      insert into app.fantasy_public_recaps (public_id, fantasy_team_id, gameweek_id, user_id, alias)
      values (app_private.fantasy_public_recap_id(), p_team_id, p_gameweek_id, actor, clean_alias)
      returning * into live;
    exception when unique_violation then
      -- A second tap raced the first: both get the one live publication.
      select * into live from app.fantasy_public_recaps
      where fantasy_team_id = p_team_id and gameweek_id = p_gameweek_id and status = 'published';
      if not found then raise; end if;
    end;
  end if;

  return jsonb_build_object(
    'publicId', live.public_id,
    'alias', live.alias,
    'publishedAt', live.published_at
  );
end;
$$;
revoke all on function api.publish_fantasy_gameweek_recap(uuid, uuid, text) from public, anon;
grant execute on function api.publish_fantasy_gameweek_recap(uuid, uuid, text)
  to authenticated, service_role;

create function api.revoke_fantasy_gameweek_recap(p_public_id text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target app.fantasy_public_recaps;
begin
  perform app_private.assert_mfa_step_up();
  if (select auth.uid()) is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  select * into target from app.fantasy_public_recaps where public_id = p_public_id for update;
  -- The same refusal for "no such link" and "not yours": an id is not probed.
  if not found or target.user_id is distinct from (select auth.uid()) then
    raise exception using errcode = 'PT404', message = 'public_recap_not_found';
  end if;
  perform app_private.fantasy_public_recap_owner(target.fantasy_team_id);
  if target.status = 'revoked' then return; end if;
  update app.fantasy_public_recaps
  set status = 'revoked', alias = null, revoked_at = statement_timestamp(),
      updated_at = statement_timestamp()
  where id = target.id;
end;
$$;
revoke all on function api.revoke_fantasy_gameweek_recap(text) from public, anon;
grant execute on function api.revoke_fantasy_gameweek_recap(text) to authenticated, service_role;

create function api.my_fantasy_gameweek_recap_publication(p_team_id uuid, p_gameweek_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  live app.fantasy_public_recaps;
begin
  perform app_private.fantasy_public_recap_owner(p_team_id);
  select * into live from app.fantasy_public_recaps
  where fantasy_team_id = p_team_id and gameweek_id = p_gameweek_id and status = 'published';
  return jsonb_build_object(
    'publishEnabled',
      coalesce((select publish_enabled from app_private.fantasy_public_recap_settings where singleton), false),
    'publication', case when found then jsonb_build_object(
      'publicId', live.public_id,
      'alias', live.alias,
      'publishedAt', live.published_at
    ) end
  );
end;
$$;
revoke all on function api.my_fantasy_gameweek_recap_publication(uuid, uuid) from public, anon;
grant execute on function api.my_fantasy_gameweek_recap_publication(uuid, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The public read.
-- ---------------------------------------------------------------------------
create function api.public_fantasy_gameweek_recap(p_public_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  live app.fantasy_public_recaps;
  result app.fantasy_team_gameweek_results;
  gameweek app.fantasy_gameweeks;
  season_name text;
  captain_id uuid;
  multiplier numeric;
  captain_points integer;
  captain_name text;
  reconciled boolean;
  captain jsonb;
begin
  if p_public_id is null or p_public_id !~ '^[A-Za-z0-9_-]{22}$' then return null; end if;
  if not coalesce((select read_enabled from app_private.fantasy_public_recap_settings where singleton), false) then
    return null;
  end if;
  select * into live from app.fantasy_public_recaps
  where public_id = p_public_id and status = 'published';
  if not found then return null; end if;

  select * into result from app.fantasy_team_gameweek_results
  where fantasy_team_id = live.fantasy_team_id and gameweek_id = live.gameweek_id
    and state = 'final' and final_score is not null;
  if not found then return null; end if;
  select * into gameweek from app.fantasy_gameweeks where id = live.gameweek_id;
  if gameweek.status not in ('finalized', 'corrected') then return null; end if;
  select season.name into season_name from app.fantasy_seasons season
  where season.id = gameweek.fantasy_season_id;

  reconciled := result.starting_points
    + case when result.chip_type::text = 'bench_boost' then result.bench_points else 0 end
    + result.captain_points - result.transfer_hit = result.final_score;

  if reconciled and result.scoring_details ? 'effectiveCaptainId' then
    captain_id := nullif(result.scoring_details ->> 'effectiveCaptainId', '')::uuid;
    select (player ->> 'multiplier')::numeric into multiplier
    from jsonb_array_elements(result.scoring_details -> 'players') player
    where player ->> 'fantasyPlayerId' = captain_id::text;
    select coalesce(points.final_points, points.provisional_points) into captain_points
    from app.fantasy_player_gameweek_points points
    where points.fantasy_player_id = captain_id and points.gameweek_id = live.gameweek_id;
    if captain_points is not null and multiplier is not null
      and captain_points * (multiplier - 1) = result.captain_points
    then
      select coalesce(football_player.display_name, football_player.full_name) into captain_name
      from app.fantasy_players fantasy_player
      join app.players football_player on football_player.id = fantasy_player.football_player_id
      where fantasy_player.id = captain_id;
      captain := jsonb_build_object(
        'name', captain_name,
        'points', captain_points,
        'multiplier', multiplier,
        'counted', (captain_points * multiplier)::integer
      );
    end if;
  end if;

  return jsonb_build_object(
    'seasonName', season_name,
    'gameweek', gameweek.sequence_number,
    'alias', live.alias,
    'total', result.final_score,
    'corrected', gameweek.status = 'corrected',
    'calculationVersion', result.calculation_version,
    'updatedAt', greatest(result.updated_at, coalesce(gameweek.corrected_at, result.updated_at)),
    'reconciled', reconciled,
    'transferHit', case when reconciled then result.transfer_hit else 0 end,
    'chipType', result.chip_type,
    'captain', captain
  );
end;
$$;
revoke all on function api.public_fantasy_gameweek_recap(text) from public;
grant execute on function api.public_fantasy_gameweek_recap(text) to anon, authenticated, service_role;
