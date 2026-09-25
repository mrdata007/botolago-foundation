-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20260925234000_match_votes: the fan votes on match pages
-- (BG-0146, owner decision 2026-09-25), for fun: who wins, will both teams
-- score, who scores first. No points; the page shows the fans' shares.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Make sure no other database work is running right now, no
--      match is being played, and it is not minute 12 of an hour (the Fantasy
--      orchestrator).
--   2. Pause the two jobs that write fixtures, as AGENTS.md asks before a write
--      that touches fixture tables (this script refuses while either is on).
--      Note the email mode first (select mode from
--      app_private.notification_email_settings): it goes back as it was.
--        select app_private.fantasy_automation_configure(false);
--        select app_private.notification_email_configure('<email mode>', null, null, false);
--   3. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one
--      transaction, checked, and then ROLLED BACK. The result row should say
--      "Rehearsal passed".
--   4. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied".
--   5. Whatever the result, switch both jobs back on:
--        select app_private.fantasy_automation_configure(true);
--        select app_private.notification_email_configure('<email mode>', null, null, true);
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, before Pronostics parts 1 to 5 (the switch and the
--     per-match lock it reuses), without the account bans of 20260924160000,
--     while a match is being played, or while the Fantasy tick or the live
--     score refresh is on;
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result: the table, its forced row security and that no client
--     reads it; both functions and who may call them; and one real read of the
--     next match's votes, as a visitor.
--
-- LOCKS
--   The new table points at fixtures and profiles. Creating those links pauses
--   WRITES to those two tables (never reads) until the end of this
--   transaction, well under a second. The lock timeout is short, so it gives
--   up rather than queue behind the live site; if it does, run it again.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  missing text[] := '{}';
  object_name text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20260925234000') then
    raise exception 'stop: migration 20260925234000 is already recorded as applied';
  end if;
  if to_regclass('app.match_votes') is not null then
    raise exception 'stop: app.match_votes already exists, but the migration is not recorded -- find out why before going on';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260925090400') then
    raise exception 'stop: Pronostics parts 1 to 5 are not applied yet -- run apply-20260925090000-predictions.sql first';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260924160000') then
    missing := missing || 'migration 20260924160000 (account bans)'::text;
  end if;
  foreach object_name in array array[
    'app.fixtures', 'app.profiles', 'app_private.user_bans',
    'app_private.fantasy_automation_settings', 'app_private.notification_email_settings'
  ] loop
    if to_regclass(object_name) is null then
      missing := missing || object_name;
    end if;
  end loop;
  foreach object_name in array array[
    'app_private.predictions_access_allowed(uuid)',
    'app_private.predictions_current_season()',
    'app_private.prediction_fixture_open(app.fixture_status, timestamp with time zone, timestamp with time zone)',
    'app_private.refuse_banned_actor()',
    'app_private.set_updated_at()'
  ] loop
    if to_regprocedure(object_name) is null then
      missing := missing || object_name;
    end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the database is missing what this update builds on: %', missing;
  end if;

  -- AGENTS.md: a write that touches fixture tables runs with the jobs that
  -- write them paused, and not while a match is being played.
  if exists (select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled) then
    raise exception 'stop: the Fantasy lifecycle tick is on -- pause it first with select app_private.fantasy_automation_configure(false); and switch it back on afterwards';
  end if;
  if exists (select 1 from app_private.notification_email_settings where football_live_refresh_enabled) then
    raise exception 'stop: the live score refresh is on -- pause it first with select app_private.notification_email_configure(''<email mode>'', null, null, false); and switch it back on afterwards';
  end if;
  if exists (
    select 1 from app.fixtures
    where status in ('live_first_half', 'half_time', 'live_second_half', 'extra_time', 'penalties')
  ) then
    raise exception 'stop: a match is being played -- run this between matches';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20260925234000, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260925234000',
  'match_votes',
  array[$bg_20260925234000_file$-- BotolaGO Production V2
-- Match votes (BG-0146, owner decision 2026-09-25): three fan votes per match,
-- in the style of Sofascore's, for fun: who wins, will both teams score, who
-- scores first. No points: the page shows what share of fans picked each
-- answer.
--
-- * One row per account, match and question. A vote can change until the
--   match kicks off, by the same per-match lock as Pronostics
--   (app_private.prediction_fixture_open), and only on a match Pronostics
--   covers: the current season, a match with a journée.
-- * Open and shown where Pronostics is (app_private.predictions_access_allowed):
--   the one switch in app_private.prediction_settings covers both.
-- * Read back only as totals, plus the caller's own choices. The totals leave
--   out banned and deleted accounts, as the Pronostics rankings do.
-- * Visitors vote on the phone; the page sends those votes through
--   api.cast_match_vote once the visitor signs in.
--
-- Plan: docs/backend/PREDICTIONS_DOMAIN_PLAN.md (BG-0146).

create table app.match_votes (
  fixture_id uuid not null references app.fixtures(id) on delete cascade,
  user_id uuid not null references app.profiles(id) on delete cascade,
  question text not null,
  choice text not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (fixture_id, user_id, question),
  constraint match_votes_choice_check check (
    (question = 'winner' and choice in ('home', 'draw', 'away'))
    or (question = 'both_score' and choice in ('yes', 'no'))
    or (question = 'first_goal' and choice in ('home', 'none', 'away'))
  )
);
create index match_votes_user_idx on app.match_votes (user_id);

comment on table app.match_votes is
  'Fan votes on a match, for fun (no points): winner, both_score, first_goal. Written only by api.cast_match_vote; read only as totals by api.match_votes.';

alter table app.match_votes enable row level security;
alter table app.match_votes force row level security;
revoke all on app.match_votes from public, anon, authenticated, service_role;

create trigger match_votes_set_updated_at before update on app.match_votes
for each row execute function app_private.set_updated_at();

-- A banned account cannot vote.
create trigger match_votes_refuse_banned_actor
before insert or update on app.match_votes
for each row execute function app_private.refuse_banned_actor();

-- ---------------------------------------------------------------------------
-- api.match_votes: the totals and the caller's own choices
-- ---------------------------------------------------------------------------
create or replace function api.match_votes(p_fixture_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  now_ts timestamptz := statement_timestamp();
  fixture app.fixtures%rowtype;
  covered boolean;
  questions jsonb;
begin
  if not app_private.predictions_access_allowed(caller) then
    return jsonb_build_object('schemaVersion', 1, 'allowed', false, 'serverTime', now_ts);
  end if;
  if p_fixture_id is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  select * into fixture from app.fixtures where id = p_fixture_id;
  covered := found and fixture.round_id is not null
    and fixture.season_id is not distinct from app_private.predictions_current_season();

  with counted as (
    select vote.question, vote.choice, count(*) as votes
    from app.match_votes vote
    join app.profiles profile on profile.id = vote.user_id and profile.deleted_at is null
    where vote.fixture_id = p_fixture_id
      and not exists (
        select 1 from app_private.user_bans ban
        where ban.user_id = vote.user_id and ban.lifted_at is null
          and ban.starts_at <= now_ts and (ban.ends_at is null or ban.ends_at > now_ts)
      )
    group by vote.question, vote.choice
  ),
  asked (position, question, choices) as (
    values
      (1, 'winner', array['home', 'draw', 'away']),
      (2, 'both_score', array['yes', 'no']),
      (3, 'first_goal', array['home', 'none', 'away'])
  )
  select jsonb_agg(jsonb_build_object(
      'question', asked.question,
      'counts', (
        select jsonb_object_agg(option.choice, coalesce(counted.votes, 0))
        from unnest(asked.choices) as option(choice)
        left join counted on counted.question = asked.question and counted.choice = option.choice
      ),
      'mine', (
        select vote.choice from app.match_votes vote
        where vote.fixture_id = p_fixture_id and vote.question = asked.question
          and caller is not null and vote.user_id = caller
      )
    ) order by asked.position)
  into questions
  from asked;

  return jsonb_build_object(
    'schemaVersion', 1,
    'allowed', true,
    'serverTime', now_ts,
    'fixtureId', p_fixture_id,
    'covered', covered,
    'open', covered
      and app_private.prediction_fixture_open(fixture.status, fixture.kickoff_at, now_ts),
    'questions', questions
  );
end;
$$;

comment on function api.match_votes(uuid) is
  'Public: the fan votes on a match as totals per answer (banned and deleted accounts left out), the caller''s own choices (null for visitors), whether the match is covered (current Pronostics season, has a journée) and still open (before kick-off). allowed=false while Pronostics is off for the caller.';

-- ---------------------------------------------------------------------------
-- api.cast_match_vote: a signed-in player's vote, changeable until kick-off
-- ---------------------------------------------------------------------------
create or replace function api.cast_match_vote(p_fixture_id uuid, p_question text, p_choice text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  now_ts timestamptz := statement_timestamp();
  fixture app.fixtures%rowtype;
  written integer;
begin
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  if p_fixture_id is null or p_question is null or p_choice is null or not (
    (p_question = 'winner' and p_choice in ('home', 'draw', 'away'))
    or (p_question = 'both_score' and p_choice in ('yes', 'no'))
    or (p_question = 'first_goal' and p_choice in ('home', 'none', 'away'))
  ) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  select * into fixture from app.fixtures where id = p_fixture_id;
  if not found or fixture.round_id is null
    or fixture.season_id is distinct from app_private.predictions_current_season() then
    raise exception using errcode = 'PT404', message = 'match_vote_unavailable';
  end if;

  -- The lock is checked in the statement that writes, as for predictions.
  insert into app.match_votes (fixture_id, user_id, question, choice)
  select target.id, caller, p_question, p_choice
  from app.fixtures target
  where target.id = p_fixture_id
    and app_private.prediction_fixture_open(target.status, target.kickoff_at, now_ts)
  on conflict (fixture_id, user_id, question) do update set choice = excluded.choice;
  get diagnostics written = row_count;
  if written = 0 then
    raise exception using errcode = 'PT409', message = 'match_vote_closed';
  end if;

  return api.match_votes(p_fixture_id);
end;
$$;

comment on function api.cast_match_vote(uuid, text, text) is
  'Signed-in: records or changes the caller''s vote on one question of a match (winner: home/draw/away; both_score: yes/no; first_goal: home/none/away) until kick-off, then answers as api.match_votes. match_vote_unavailable for a match Pronostics does not cover, match_vote_closed once it has kicked off.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function api.match_votes(uuid) from public;
revoke all on function api.cast_match_vote(uuid, text, text) from public;

grant execute on function api.match_votes(uuid) to anon, authenticated, service_role;
grant execute on function api.cast_match_vote(uuid, text, text) to authenticated, service_role;
$bg_20260925234000_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20260925234000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20260925234000'
  );
begin
  if encode(sha256(convert_to(part_20260925234000, 'UTF8')), 'hex')
    is distinct from '3c235ea8b8fa6d88d903f4d6f507857dc4119f84283990a1b877300262c21f08' then
    raise exception 'stop: 20260925234000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20260925234000;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  next_fixture uuid;
  answer jsonb;
begin
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'app.match_votes'::regclass) then
    problems := problems || 'app.match_votes does not force row security'::text;
  end if;
  if exists (
    select 1
    from unnest(array['anon', 'authenticated', 'service_role']) as r(role)
    cross join unnest(array['select', 'insert', 'update', 'delete']) as p(privilege)
    where has_table_privilege(r.role, 'app.match_votes', p.privilege)
  ) then
    problems := problems || 'an API role holds a privilege on app.match_votes'::text;
  end if;
  if not has_function_privilege('anon', 'api.match_votes(uuid)', 'execute')
    or not has_function_privilege('authenticated', 'api.match_votes(uuid)', 'execute') then
    problems := problems || 'visitors or players cannot read the votes'::text;
  end if;
  if has_function_privilege('anon', 'api.cast_match_vote(uuid, text, text)', 'execute')
    or not has_function_privilege('authenticated', 'api.cast_match_vote(uuid, text, text)', 'execute') then
    problems := problems || 'api.cast_match_vote is callable by the wrong roles'::text;
  end if;
  if exists (select 1 from app.match_votes) then
    problems := problems || 'app.match_votes is not empty'::text;
  end if;

  -- One real read, as a visitor, of the next match Pronostics covers.
  select fixture.id into next_fixture
  from app.fixtures fixture
  where fixture.season_id = app_private.predictions_current_season()
    and fixture.round_id is not null
    and app_private.prediction_fixture_open(fixture.status, fixture.kickoff_at, statement_timestamp())
  order by fixture.kickoff_at
  limit 1;
  perform set_config('request.jwt.claims', '', true);
  if next_fixture is not null then
    answer := api.match_votes(next_fixture);
    if (answer ->> 'allowed')::boolean then
      if not coalesce((answer ->> 'covered')::boolean and (answer ->> 'open')::boolean, false)
        or jsonb_array_length(answer -> 'questions') <> 3 then
        problems := problems || ('a visitor reads ' || answer::text);
      end if;
    end if;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20260925234000')
    then 'Applied. The match pages can take fan votes.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
