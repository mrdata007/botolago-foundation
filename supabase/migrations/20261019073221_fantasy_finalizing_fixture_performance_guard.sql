-- Close the remaining sealed-input gap (SEC-01). Ordinary fixture corrections
-- and performance imports refuse while an assigned gameweek is finalizing.
-- They can be retried after finalization; no snapshot is reopened or rewritten.
-- Nonblocking row locks serialize an import with finalization without a lock-order cycle.
-- Existing snapshot assertions and every ingestion/auth guard remain unchanged.

create function app_private.fantasy_assert_fixture_inputs_writable(p_fixture_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare week record;
begin
  -- A row trigger already holds its fixture/performance row. Finalization
  -- locks the gameweek first, then fixtures FOR SHARE. Waiting here could
  -- deadlock with that order, so refuse a busy gameweek and let ingestion retry.
  -- If ingestion gets KEY SHARE first, finalization waits for its transaction.
  -- Inspect all assigned rows in a deterministic order, including assignments
  -- that do not count points (the legacy document still includes those rows).
  for week in
    select g.id, g.status from app.fantasy_gameweeks g
    where g.status in ('open','locked','live','provisional','finalizing')
      and exists (select 1 from app.fantasy_fixture_assignments a
        where a.gameweek_id=g.id and a.fixture_id=any(p_fixture_ids)
          and a.superseded_at is null)
    order by g.id for key share of g nowait
  loop
    if week.status='finalizing' then
      raise exception using errcode='PT409', message='fantasy_scoring_inputs_frozen';
    end if;
  end loop;
exception when lock_not_available then
  raise exception using errcode='PT409', message='fantasy_scoring_inputs_frozen';
end $$;
revoke all on function app_private.fantasy_assert_fixture_inputs_writable(uuid[])
  from public,anon,authenticated,service_role;

create function app_private.fantasy_guard_finalizing_fixture()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP='UPDATE' and row(old.id,old.competition_id,old.season_id,
      old.home_team_id,old.away_team_id,old.kickoff_at,old.status,
      old.home_score,old.away_score,old.finalized_at,old.source_sequence,old.source_version)
    is not distinct from row(new.id,new.competition_id,new.season_id,
      new.home_team_id,new.away_team_id,new.kickoff_at,new.status,
      new.home_score,new.away_score,new.finalized_at,new.source_sequence,new.source_version) then
    return new;
  end if;
  perform app_private.fantasy_assert_fixture_inputs_writable(array[old.id]);
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function app_private.fantasy_guard_finalizing_fixture()
  from public,anon,authenticated,service_role;
create trigger fixtures_guard_finalizing_scoring_inputs
before update or delete on app.fixtures for each row
execute function app_private.fantasy_guard_finalizing_fixture();

create function app_private.fantasy_guard_finalizing_fixture_performance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare old_fixture uuid; new_fixture uuid;
begin
  -- The document reads active performance rows. Its digest explicitly omits
  -- these three metadata timestamps, so heartbeat-only updates stay writable.
  if TG_OP='UPDATE' and (
    (not old.active and not new.active)
    or (to_jsonb(old)-'created_at'-'updated_at'-'provider_observed_at')
      is not distinct from (to_jsonb(new)-'created_at'-'updated_at'-'provider_observed_at')) then
    return new;
  end if;
  if TG_OP='INSERT' and not new.active then return new; end if;
  if TG_OP='DELETE' and not old.active then return old; end if;
  if TG_OP<>'INSERT' then old_fixture:=old.fixture_id; end if;
  if TG_OP<>'DELETE' then new_fixture:=new.fixture_id; end if;
  perform app_private.fantasy_assert_fixture_inputs_writable(array[old_fixture,new_fixture]);
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function app_private.fantasy_guard_finalizing_fixture_performance()
  from public,anon,authenticated,service_role;
create trigger player_fixture_performances_guard_finalizing_scoring_inputs
before insert or update or delete on app.player_fixture_performances for each row
execute function app_private.fantasy_guard_finalizing_fixture_performance();

create function app_private.fantasy_guard_finalizing_fixture_coverage()
returns trigger language plpgsql security definer set search_path = '' as $$
declare old_fixture uuid; new_fixture uuid;
begin
  if TG_OP='UPDATE' and
    (to_jsonb(old)-'created_at'-'updated_at'-'provider_observed_at')
      is not distinct from (to_jsonb(new)-'created_at'-'updated_at'-'provider_observed_at') then
    return new;
  end if;
  if TG_OP<>'INSERT' then old_fixture:=old.fixture_id; end if;
  if TG_OP<>'DELETE' then new_fixture:=new.fixture_id; end if;
  perform app_private.fantasy_assert_fixture_inputs_writable(array[old_fixture,new_fixture]);
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function app_private.fantasy_guard_finalizing_fixture_coverage()
  from public,anon,authenticated,service_role;
create trigger coverage_guard_finalizing_scoring_inputs
before insert or update or delete on app_private.historical_performance_fixture_coverage for each row
execute function app_private.fantasy_guard_finalizing_fixture_coverage();
