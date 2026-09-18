-- BG-0032: api.service_rollback_fantasy_catalog left app.fantasy_leagues,
-- app.fantasy_league_memberships and app.fantasy_rankings behind (all
-- ON DELETE RESTRICT against app.fantasy_seasons / app.fantasy_leagues /
-- app.fantasy_teams), so the final `delete from app.fantasy_seasons` raised a
-- foreign-key violation on any season that ever had a league — even a league
-- with zero members. This additive migration re-creates the function with
-- ordered cleanup of rankings, then league memberships, then leagues, before
-- the existing deletes, preserving every existing safety guard byte-for-byte
-- (PT403 forbidden, PT404 fantasy_catalog_not_found, PT409 stale_update, the
-- already-rolled-back short-circuit, the advisory lock, and — unchanged and
-- unweakened — the PT409 fantasy_catalog_in_use guard that refuses while any
-- app.fantasy_teams row still exists for the season).
--
-- app_private.fantasy_mutation_audit was investigated and intentionally left
-- untouched: its schema (20260720141847_fantasy_teams_transfers_chips.sql)
-- has no fantasy_season_id or fantasy_league_id column and no foreign key to
-- app.fantasy_seasons or app.fantasy_leagues — only `fantasy_team_id
-- references app.fantasy_teams(id) on delete restrict` and `user_id
-- references app.profiles(id) on delete restrict`. Because the
-- fantasy_catalog_in_use guard above already refuses to proceed while any
-- app.fantasy_teams row exists for this season, and this function never
-- deletes app.fantasy_teams rows, no audit row can reference a team of this
-- season at the point the season is deleted (a team is never deleted while an
-- audit row references it, so if zero teams exist for the season, zero audit
-- rows can be pointing at a team that belonged to it). mutation_audit
-- therefore cannot block `delete from app.fantasy_seasons` under any
-- reachable state, and no cleanup for it is added here.
create or replace function api.service_rollback_fantasy_catalog(
  p_catalog_activation_id uuid,
  p_expected_source_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare catalog_run app_private.fantasy_catalog_activation_runs%rowtype;
declare fantasy_competition_id uuid;
declare removed_players integer;
declare removed_gameweeks integer;
declare removed_fixtures integer;
declare removed_leagues integer;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  select * into catalog_run from app_private.fantasy_catalog_activation_runs
  where id = p_catalog_activation_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_catalog_not_found';
  end if;
  if catalog_run.source_digest <> p_expected_source_digest then
    raise exception using errcode = 'PT409', message = 'stale_update';
  end if;
  if catalog_run.rolled_back_at is not null then
    return jsonb_build_object(
      'activationId', catalog_run.id, 'fantasySeasonId', catalog_run.fantasy_season_id,
      'rolledBackAt', catalog_run.rolled_back_at, 'alreadyRolledBack', true
    );
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'fantasy:catalog:' || catalog_run.football_season_id::text, 0
  ));
  if exists (select 1 from app.fantasy_teams team
    where team.fantasy_season_id = catalog_run.fantasy_season_id) then
    raise exception using errcode = 'PT409', message = 'fantasy_catalog_in_use';
  end if;

  select season.fantasy_competition_id into fantasy_competition_id
  from app.fantasy_seasons season where season.id = catalog_run.fantasy_season_id;

  -- Ordered league/membership/ranking cleanup (FK-safe): rankings reference
  -- fantasy_seasons, fantasy_teams and fantasy_leagues, so they are removed
  -- first; league memberships reference fantasy_leagues (and fantasy_teams,
  -- which is never touched here), so they are removed before the leagues
  -- themselves; leagues reference fantasy_seasons and are removed last of the
  -- three, before the season delete below. Nothing here deletes or otherwise
  -- affects app.fantasy_teams rows.
  delete from app.fantasy_rankings ranking
  where ranking.fantasy_season_id = catalog_run.fantasy_season_id;

  delete from app.fantasy_league_memberships membership
  using app.fantasy_leagues league
  where league.fantasy_season_id = catalog_run.fantasy_season_id
    and membership.league_id = league.id;

  select count(*) into removed_leagues from app.fantasy_leagues league
  where league.fantasy_season_id = catalog_run.fantasy_season_id;
  delete from app.fantasy_leagues league
  where league.fantasy_season_id = catalog_run.fantasy_season_id;

  select count(*) into removed_fixtures from app.fantasy_fixture_assignments
  where fantasy_season_id = catalog_run.fantasy_season_id;
  delete from app.fantasy_fixture_assignments
  where fantasy_season_id = catalog_run.fantasy_season_id;

  delete from app.fantasy_player_price_history history
  using app.fantasy_players player
  where player.fantasy_season_id = catalog_run.fantasy_season_id
    and history.fantasy_player_id = player.id;
  delete from app_private.fantasy_initial_price_evidence evidence
  using app.fantasy_players player
  where player.fantasy_season_id = catalog_run.fantasy_season_id
    and evidence.fantasy_player_id = player.id;
  select count(*) into removed_players from app.fantasy_players
  where fantasy_season_id = catalog_run.fantasy_season_id;
  delete from app.fantasy_players
  where fantasy_season_id = catalog_run.fantasy_season_id;

  select count(*) into removed_gameweeks from app.fantasy_gameweeks
  where fantasy_season_id = catalog_run.fantasy_season_id;
  delete from app.fantasy_gameweeks
  where fantasy_season_id = catalog_run.fantasy_season_id;
  delete from app.fantasy_seasons where id = catalog_run.fantasy_season_id;
  update app.fantasy_competitions competition set active = false
  where competition.id = fantasy_competition_id
    and not exists (select 1 from app.fantasy_seasons season
      where season.fantasy_competition_id = competition.id);
  delete from app.fantasy_competitions competition
  where competition.id = fantasy_competition_id
    and not exists (select 1 from app.fantasy_seasons season
      where season.fantasy_competition_id = competition.id)
    and not exists (select 1 from app.fantasy_rulesets rules
      where rules.fantasy_competition_id = competition.id);

  update app_private.fantasy_catalog_activation_runs
  set rolled_back_at = statement_timestamp()
  where id = catalog_run.id
  returning * into catalog_run;

  return jsonb_build_object(
    'activationId', catalog_run.id,
    'fantasySeasonId', catalog_run.fantasy_season_id,
    'rolledBackAt', catalog_run.rolled_back_at,
    'alreadyRolledBack', false,
    'removed', jsonb_build_object(
      'players', removed_players,
      'gameweeks', removed_gameweeks,
      'fixtures', removed_fixtures,
      'leagues', removed_leagues
    )
  );
end;
$$;

revoke all on function api.service_rollback_fantasy_catalog(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function api.service_rollback_fantasy_catalog(uuid, text)
  to service_role;
