-- BotolaGO Production V2
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
