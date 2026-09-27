-- BotolaGO Production V2
-- Pépites, migration 5 of the v1 sequence: weekly editions and the tick.
-- docs/engineering/PEPITES_ARCHITECTURE.md §3.6, §5.1-5.3 and §5.5.
--
-- An edition is one week's Top 10: the editor's choice among a run's ranked
-- players, published once and then frozen.
--
--   draft ──> scheduled ──> published ──> superseded (by its correction)
--     ^           │                   └──> withdrawn
--     └───────────┘
--
-- Every move is made by one named function, under the week lock, with an
-- actor. A trigger rejects any other move, any column change a move does not
-- list, and any write made without going through those functions. Entries
-- can be written only while their edition is a draft; publication writes
-- none, so a published Top 10 never changes.
--
-- The tick (pg_cron, every 15 minutes) scores the latest completed round when
-- its inputs change, re-points that round's open edition to the new revision,
-- makes Monday's draft, publishes what is due and runs the daily checks. It
-- writes nothing while app_private.pepites_settings.mode is 'off', which is
-- the default: this migration switches nothing on.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
create table app_private.pepites_settings (
  id boolean primary key default true,
  mode text not null default 'off',
  auto_publish boolean not null default false,
  publish_local_time time not null default '20:00',
  draft_local_time time not null default '12:00',
  -- null: the most recent current season. Set it if a second competition ever
  -- has a current season at the same time.
  competition_id uuid references app.competitions(id) on delete restrict,
  last_daily_on date,
  updated_at timestamptz not null default statement_timestamp(),
  constraint pepites_settings_singleton check (id),
  constraint pepites_settings_mode_check check (mode in ('off', 'staff', 'public')),
  constraint pepites_settings_times_check check (draft_local_time < publish_local_time)
);

comment on table app_private.pepites_settings is
  'Pépites switches, one row. mode off|staff|public (off: the tick writes nothing and nobody sees Pépites). Times are Africa/Casablanca. Changed through app_private.pepites_configure.';

alter table app_private.pepites_settings enable row level security;
alter table app_private.pepites_settings force row level security;
revoke all on table app_private.pepites_settings from public, anon, authenticated, service_role;

insert into app_private.pepites_settings (id) values (true);

-- What the tick and the operator did, and the alerts sent (each key once).
create table app_private.pepites_job_log (
  id bigint generated always as identity primary key,
  kind text not null,
  at timestamptz not null default clock_timestamp(),
  outcome text not null,
  detail jsonb not null default '{}'::jsonb,
  error text,
  constraint pepites_job_log_kind_check check (kind in ('tick', 'operator')),
  constraint pepites_job_log_error_check check (error is null or char_length(error) <= 2000)
);
create index pepites_job_log_at_idx on app_private.pepites_job_log (at desc);

create table app_private.pepites_notices (
  key text primary key,
  subject text not null,
  body text not null,
  sent_at timestamptz not null default clock_timestamp(),
  constraint pepites_notices_key_check check (char_length(key) between 1 and 300)
);

-- Failed scoring attempts per round and input fingerprint (§5.1: at most 3).
create table app_private.pepites_run_attempts (
  season_id uuid not null references app.seasons(id) on delete restrict,
  round_number integer not null,
  input_fingerprint text not null,
  failures integer not null default 0,
  last_run_id uuid references app.pepites_runs(id) on delete restrict,
  updated_at timestamptz not null default statement_timestamp(),
  primary key (season_id, round_number, input_fingerprint)
);

comment on table app_private.pepites_job_log is
  'Pépites tick passes that did something or failed, and operator actions.';
comment on table app_private.pepites_notices is
  'Alerts and editor notices already sent, one per key, so a condition seen on every tick is announced once.';
comment on table app_private.pepites_run_attempts is
  'Failed weekly runs per round and input fingerprint. The tick stops retrying after 3 and alerts once.';

alter table app_private.pepites_job_log enable row level security;
alter table app_private.pepites_job_log force row level security;
alter table app_private.pepites_notices enable row level security;
alter table app_private.pepites_notices force row level security;
alter table app_private.pepites_run_attempts enable row level security;
alter table app_private.pepites_run_attempts force row level security;
revoke all on table app_private.pepites_job_log, app_private.pepites_notices,
  app_private.pepites_run_attempts from public, anon, authenticated, service_role;

-- The current season now honours the settings' competition.
create or replace function app_private.pepites_current_season()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select season.id
  from app.seasons season
  cross join app_private.pepites_settings settings
  where settings.id
    and season.is_current
    and (settings.competition_id is null or season.competition_id = settings.competition_id)
  order by season.starts_on desc, season.id desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Weeks
-- ---------------------------------------------------------------------------
-- Week 1 is the Monday-to-Sunday week holding the season's first day.
create function app_private.pepites_week_start(p_on date)
returns date
language sql
immutable
set search_path = ''
as $$
  select p_on - (extract(isodow from p_on)::integer - 1);
$$;

create function app_private.pepites_week_number(p_season_id uuid, p_on date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select ((app_private.pepites_week_start(p_on) - app_private.pepites_week_start(season.starts_on)) / 7) + 1
  from app.seasons season
  where season.id = p_season_id;
$$;

-- The Monday of a season's week, and its default publication time.
create function app_private.pepites_week_monday(p_season_id uuid, p_week integer)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.pepites_week_start(season.starts_on) + (p_week - 1) * 7
  from app.seasons season
  where season.id = p_season_id;
$$;

create function app_private.pepites_local_at(p_on date, p_local_time time)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (p_on + p_local_time) at time zone 'Africa/Casablanca';
$$;

-- ---------------------------------------------------------------------------
-- Editions
-- ---------------------------------------------------------------------------
create table app.pepites_editions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references app.seasons(id) on delete restrict,
  week_number integer not null,
  round_number integer not null,
  run_id uuid not null references app.pepites_runs(id) on delete restrict,
  status text not null default 'draft',
  corrects_edition_id uuid references app.pepites_editions(id) on delete restrict,
  previous_edition_id uuid references app.pepites_editions(id) on delete restrict,
  superseded_by uuid references app.pepites_editions(id) on delete restrict,
  scheduled_for timestamptz,
  published_at timestamptz,
  published_by uuid,
  withdrawn_at timestamptz,
  withdrawn_reason text,
  created_by uuid,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint pepites_editions_week_check check (week_number between 1 and 60),
  constraint pepites_editions_round_check check (round_number between 1 and 60),
  constraint pepites_editions_status_check check (
    status in ('draft', 'scheduled', 'published', 'withdrawn', 'superseded')
  ),
  constraint pepites_editions_state_check check (
    (status <> 'scheduled' or scheduled_for is not null)
    and ((status in ('published', 'withdrawn', 'superseded')) = (published_at is not null))
    and ((status = 'withdrawn') = (withdrawn_at is not null and withdrawn_reason is not null))
    and ((status = 'superseded') = (superseded_by is not null))
    and (status in ('published', 'withdrawn', 'superseded') or previous_edition_id is null)
  ),
  constraint pepites_editions_reason_check check (
    withdrawn_reason is null or char_length(withdrawn_reason) between 8 and 500
  ),
  constraint pepites_editions_not_self_check check (
    corrects_edition_id is distinct from id and previous_edition_id is distinct from id
    and superseded_by is distinct from id
  )
);

comment on table app.pepites_editions is
  'A week''s Top 10. draft -> scheduled -> published -> superseded | withdrawn, and scheduled -> draft; each move by one named function under the week lock (§5). Entries are frozen from scheduling on; movement is read from previous_edition_id, fixed at publication.';
comment on column app.pepites_editions.scheduled_for is
  'When it goes out. A draft made by the tick carries its week''s default time (Monday publish_local_time): past it without publication, the edition is delayed.';
comment on column app.pepites_editions.published_by is
  'The staff member who published it; null when the system did (auto-publish, or a scheduled edition published by the tick is still the scheduler''s choice: see pepites_edition_moves).';

create unique index pepites_editions_one_published_key
  on app.pepites_editions (season_id, week_number) where status = 'published';
create unique index pepites_editions_one_open_key
  on app.pepites_editions (season_id, week_number) where status in ('draft', 'scheduled');
create index pepites_editions_season_week_idx
  on app.pepites_editions (season_id, week_number desc, created_at desc);
create index pepites_editions_due_idx
  on app.pepites_editions (scheduled_for) where status in ('draft', 'scheduled');

alter table app.pepites_editions enable row level security;
alter table app.pepites_editions force row level security;
revoke all on table app.pepites_editions from public, anon, authenticated, service_role;

create table app.pepites_edition_entries (
  edition_id uuid not null references app.pepites_editions(id) on delete restrict,
  editorial_rank smallint not null,
  player_id uuid not null references app.players(id) on delete restrict,
  computed_rank integer not null,
  computed_score numeric(7,4) not null,
  reason_fr text,
  reason_ar text,
  updated_at timestamptz not null default statement_timestamp(),
  primary key (edition_id, editorial_rank),
  constraint pepites_edition_entries_player_key unique (edition_id, player_id),
  constraint pepites_edition_entries_rank_check check (editorial_rank between 1 and 10),
  constraint pepites_edition_entries_reason_check check (
    (reason_fr is null or (reason_fr = btrim(reason_fr) and char_length(reason_fr) between 1 and 240))
    and (reason_ar is null or (reason_ar = btrim(reason_ar) and char_length(reason_ar) between 1 and 240))
  )
);

comment on table app.pepites_edition_entries is
  'The editor''s Top 10 of an edition. Written only while the edition is a draft; computed_rank and computed_score are copied from the edition''s run by the trigger on every write.';

create index pepites_edition_entries_player_idx on app.pepites_edition_entries (player_id);

alter table app.pepites_edition_entries enable row level security;
alter table app.pepites_edition_entries force row level security;
revoke all on table app.pepites_edition_entries from public, anon, authenticated, service_role;

-- Every move, with who made it: a staff member's id, or 'system'.
create table app_private.pepites_edition_moves (
  id bigint generated always as identity primary key,
  edition_id uuid not null references app.pepites_editions(id) on delete restrict,
  from_status text,
  to_status text not null,
  actor uuid,
  actor_kind text not null,
  at timestamptz not null default clock_timestamp(),
  detail jsonb not null default '{}'::jsonb,
  constraint pepites_edition_moves_actor_check check (
    (actor_kind = 'system' and actor is null) or (actor_kind = 'staff' and actor is not null)
  )
);
create index pepites_edition_moves_edition_idx on app_private.pepites_edition_moves (edition_id, id);

comment on table app_private.pepites_edition_moves is
  'Audit of edition moves (creation, status changes, re-pointing), written by trigger. Append-only.';

alter table app_private.pepites_edition_moves enable row level security;
alter table app_private.pepites_edition_moves force row level security;
revoke all on table app_private.pepites_edition_moves from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Actor: the edition functions set it for their own writes and restore it
-- ---------------------------------------------------------------------------
-- 'system' or a staff member's id; empty outside the edition functions, so a
-- direct write is rejected.
create function app_private.pepites_actor()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('botolago.pepites_actor', true), '');
$$;

create function app_private.pepites_set_actor(p_actor uuid)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_previous text := coalesce(current_setting('botolago.pepites_actor', true), '');
begin
  perform pg_catalog.set_config('botolago.pepites_actor', coalesce(p_actor::text, 'system'), true);
  return v_previous;
end;
$$;

create function app_private.pepites_restore_actor(p_previous text)
returns void
language sql
volatile
set search_path = ''
as $$
  select pg_catalog.set_config('botolago.pepites_actor', coalesce(p_previous, ''), true);
$$;

-- ---------------------------------------------------------------------------
-- Edition guard: the allowed moves and nothing else (§3.6)
-- ---------------------------------------------------------------------------
create function app_private.pepites_editions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed text[];
  v_allowed text[];
  v_run app.pepites_runs%rowtype;
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception using errcode = '55000', message = 'PEPITES_EDITION_IMMUTABLE';
  end if;
  if app_private.pepites_actor() is null then
    raise exception using errcode = '42501', message = 'PEPITES_EDITION_WRITER_REQUIRED',
      hint = 'Editions change only through the app_private.pepites_* edition functions.';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.previous_edition_id is not null or new.superseded_by is not null
      or new.published_at is not null or new.published_by is not null
      or new.withdrawn_at is not null or new.withdrawn_reason is not null
    then
      raise exception using errcode = '55000', message = 'PEPITES_EDITION_MOVE_REJECTED',
        detail = 'An edition starts as a draft.';
    end if;
  else
    select coalesce(array_agg(key order by key), '{}') into v_changed
    from jsonb_each(pg_catalog.to_jsonb(new)) after_row
    where after_row.key <> 'updated_at'
      and after_row.value is distinct from (pg_catalog.to_jsonb(old) -> after_row.key);

    if cardinality(v_changed) = 0 then
      return new;
    end if;

    v_allowed := case
      when old.status = 'draft' and new.status = 'draft'
        then array['round_number', 'run_id', 'scheduled_for']
      when old.status = 'draft' and new.status = 'scheduled'
        then array['scheduled_for', 'status']
      when old.status = 'scheduled' and new.status = 'draft'
        then array['status']
      when old.status = 'scheduled' and new.status = 'published'
        then array['previous_edition_id', 'published_at', 'published_by', 'status']
      when old.status = 'published' and new.status = 'superseded'
        then array['status', 'superseded_by']
      when old.status = 'published' and new.status = 'withdrawn'
        then array['status', 'withdrawn_at', 'withdrawn_reason']
    end;

    if v_allowed is null or not (v_changed <@ v_allowed) then
      raise exception using errcode = '55000', message = 'PEPITES_EDITION_MOVE_REJECTED',
        detail = format('%s -> %s changing %s', old.status, new.status, array_to_string(v_changed, ', '));
    end if;

    -- Publication and supersession belong to pepites_publish_edition alone.
    if new.status in ('published', 'superseded')
      and coalesce(current_setting('botolago.pepites_publishing', true), '')
        not in (new.id::text, coalesce(new.superseded_by::text, '-'))
    then
      raise exception using errcode = '55000', message = 'PEPITES_EDITION_MOVE_REJECTED',
        detail = 'Only app_private.pepites_publish_edition publishes or supersedes.';
    end if;
    new.updated_at := statement_timestamp();
  end if;

  -- The run: a succeeded weekly run of the same season and round.
  if tg_op = 'INSERT' or new.run_id is distinct from old.run_id then
    select * into v_run from app.pepites_runs where id = new.run_id;
    if v_run.status is distinct from 'succeeded' or v_run.kind <> 'weekly'
      or v_run.season_id <> new.season_id or v_run.as_of_round_number <> new.round_number
    then
      raise exception using errcode = '22023', message = 'PEPITES_EDITION_RUN_INVALID';
    end if;
  end if;
  return new;
end;
$$;

create trigger pepites_editions_guard
before insert or update or delete on app.pepites_editions
for each row execute function app_private.pepites_editions_guard();
create trigger pepites_editions_no_truncate
before truncate on app.pepites_editions
for each statement execute function app_private.pepites_editions_guard();

create function app_private.pepites_editions_record_move()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := app_private.pepites_actor();
begin
  if tg_op = 'INSERT' or new.status <> old.status or new.run_id <> old.run_id then
    insert into app_private.pepites_edition_moves (edition_id, from_status, to_status, actor, actor_kind, detail)
    values (
      new.id,
      case when tg_op = 'UPDATE' then old.status end,
      new.status,
      case when v_actor <> 'system' then v_actor::uuid end,
      case when v_actor = 'system' then 'system' else 'staff' end,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'runId', new.run_id,
        'previousRunId', case when tg_op = 'UPDATE' and new.run_id <> old.run_id then old.run_id end,
        'scheduledFor', new.scheduled_for
      ))
    );
  end if;
  return null;
end;
$$;

create trigger pepites_editions_record_move
after insert or update on app.pepites_editions
for each row execute function app_private.pepites_editions_record_move();

create function app_private.pepites_edition_moves_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'PEPITES_EDITION_MOVES_APPEND_ONLY';
end;
$$;

create trigger pepites_edition_moves_guard
before update or delete on app_private.pepites_edition_moves
for each row execute function app_private.pepites_edition_moves_guard();
create trigger pepites_edition_moves_no_truncate
before truncate on app_private.pepites_edition_moves
for each statement execute function app_private.pepites_edition_moves_guard();

-- ---------------------------------------------------------------------------
-- Entry guard: drafts only; computed values copied from the run
-- ---------------------------------------------------------------------------
create function app_private.pepites_edition_entries_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_edition_id uuid;
  v_status text;
  v_run_id uuid;
  v_rank integer;
  v_score numeric(7,4);
begin
  if tg_op = 'TRUNCATE' then
    raise exception using errcode = '55000', message = 'PEPITES_EDITION_NOT_DRAFT';
  end if;
  if app_private.pepites_actor() is null then
    raise exception using errcode = '42501', message = 'PEPITES_EDITION_WRITER_REQUIRED',
      hint = 'Entries change only through the app_private.pepites_* edition functions.';
  end if;
  if tg_op = 'UPDATE' and new.edition_id <> old.edition_id then
    raise exception using errcode = '55000', message = 'PEPITES_EDITION_NOT_DRAFT';
  end if;
  v_edition_id := case when tg_op = 'DELETE' then old.edition_id else new.edition_id end;

  -- FOR SHARE: the edition cannot leave draft until this write commits.
  select edition.status, edition.run_id into v_status, v_run_id
  from app.pepites_editions edition
  where edition.id = v_edition_id
  for share;
  if v_status is distinct from 'draft' then
    raise exception using errcode = '55000', message = 'PEPITES_EDITION_NOT_DRAFT';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  select score.rank, score.score_exact into v_rank, v_score
  from app.pepites_player_scores score
  where score.run_id = v_run_id and score.player_id = new.player_id and score.rank is not null;
  if v_rank is null then
    raise exception using errcode = '22023', message = 'PEPITES_ENTRY_PLAYER_NOT_RANKED',
      detail = new.player_id::text;
  end if;
  new.computed_rank := v_rank;
  new.computed_score := v_score;
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

create trigger pepites_edition_entries_guard
before insert or update or delete on app.pepites_edition_entries
for each row execute function app_private.pepites_edition_entries_guard();
create trigger pepites_edition_entries_no_truncate
before truncate on app.pepites_edition_entries
for each statement execute function app_private.pepites_edition_entries_guard();

-- ---------------------------------------------------------------------------
-- Locks, notices, checks
-- ---------------------------------------------------------------------------
-- §5.5: every edition change takes this first.
create function app_private.pepites_lock_week(p_season_id uuid, p_week integer)
returns void
language sql
volatile
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pepites_edition:' || p_season_id || ':' || p_week, 0)
  );
$$;

-- Locks the week of an edition, then the edition row. Returns it.
create function app_private.pepites_lock_edition(p_edition_id uuid)
returns app.pepites_editions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
  v_week integer;
  v_edition app.pepites_editions%rowtype;
begin
  select edition.season_id, edition.week_number into v_season_id, v_week
  from app.pepites_editions edition where edition.id = p_edition_id;
  if v_season_id is null then
    raise exception using errcode = 'P0002', message = 'PEPITES_EDITION_NOT_FOUND';
  end if;
  perform app_private.pepites_lock_week(v_season_id, v_week);
  select * into v_edition from app.pepites_editions where id = p_edition_id for update;
  return v_edition;
end;
$$;

-- Sends an ops alert once per key. Returns whether it was sent now.
create function app_private.pepites_notify(p_key text, p_subject text, p_body text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into app_private.pepites_notices (key, subject, body)
  values (left(p_key, 300), left(p_subject, 200), left(p_body, 4000))
  on conflict (key) do nothing;
  if not found then
    return false;
  end if;
  perform app_private.ops_alert_send('Pépites: ' || left(p_subject, 180), left(p_body, 4000));
  return true;
end;
$$;

-- What stops an edition from being published, as codes. Empty: publishable.
create function app_private.pepites_edition_problems(p_edition_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_remove(array[
    case when run.status is distinct from 'succeeded' then 'run_not_succeeded' end,
    case when (select count(*) from app.pepites_edition_entries entry
               where entry.edition_id = edition.id) <> 10 then 'entries_not_ten' end,
    case when exists (
      select 1 from app.pepites_edition_entries entry
      left join app.pepites_player_scores score
        on score.run_id = edition.run_id and score.player_id = entry.player_id
      where entry.edition_id = edition.id
        and (score.rank is null or score.rank <> entry.computed_rank
          or score.score_exact <> entry.computed_score)
    ) then 'entries_stale' end,
    case when edition.corrects_edition_id is not null and not exists (
      select 1 from app.pepites_editions corrected
      where corrected.id = edition.corrects_edition_id and corrected.status = 'published'
    ) then 'corrected_not_published' end
  ], null)
  from app.pepites_editions edition
  join app.pepites_runs run on run.id = edition.run_id
  where edition.id = p_edition_id;
$$;

-- Replaced by the weekly email migration. Called in the publishing or
-- withdrawing transaction: 'published' enqueues the week's email event,
-- 'withdrawn' cancels what is unsent.
create function app_private.pepites_edition_email_hook(p_edition_id uuid, p_event text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_edition_id is null or p_event not in ('published', 'withdrawn') then
    raise exception using errcode = '22023', message = 'PEPITES_EMAIL_EVENT_INVALID';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rounds and runs
-- ---------------------------------------------------------------------------
-- A round is complete when every fixture in it is finalised, postponed or
-- cancelled, and at least one was finalised. The latest complete round.
create function app_private.pepites_latest_complete_round(p_season_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select max(per_round.round_number)
  from (
    select round.round_number,
      bool_and((fixture.status = 'finished' and fixture.finalized_at is not null)
        or fixture.status in ('postponed', 'cancelled')) as complete,
      bool_or(fixture.status = 'finished' and fixture.finalized_at is not null) as played
    from app.rounds round
    join app.fixtures fixture on fixture.round_id = round.id
    where round.season_id = p_season_id and round.round_number is not null
    group by round.round_number
  ) per_round
  where per_round.complete and per_round.played;
$$;

-- The newest succeeded weekly run of a round.
create function app_private.pepites_latest_run(p_season_id uuid, p_round integer)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select run.id
  from app.pepites_runs run
  where run.season_id = p_season_id and run.kind = 'weekly' and run.status = 'succeeded'
    and (p_round is null or run.as_of_round_number = p_round)
  order by run.as_of_round_number desc, run.finished_at desc, run.revision desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Edition functions. Each takes the week lock first (§5.5). p_actor: the
-- staff member, or null for the system.
-- ---------------------------------------------------------------------------
-- A draft for the week holding p_on, from a run, prefilled with its computed
-- top 10. Its scheduled_for is the week's default publication time.
create function app_private.pepites_create_draft(p_run_id uuid, p_on date, p_actor uuid default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run app.pepites_runs%rowtype;
  v_params jsonb;
  v_settings app_private.pepites_settings%rowtype;
  v_week integer;
  v_edition_id uuid;
  v_previous_actor text;
begin
  select * into v_run from app.pepites_runs where id = p_run_id;
  if v_run.status is distinct from 'succeeded' or v_run.kind <> 'weekly' then
    raise exception using errcode = '22023', message = 'PEPITES_EDITION_RUN_INVALID';
  end if;
  select methodology.params into v_params
  from app.pepites_methodologies methodology where methodology.version = v_run.methodology_version;
  if v_run.as_of_round_number < (v_params ->> 'first_edition_round')::integer then
    raise exception using errcode = '22023', message = 'PEPITES_EDITION_TOO_EARLY';
  end if;
  if v_run.ranked_count < (v_params ->> 'min_eligible_for_edition')::integer then
    raise exception using errcode = '22023', message = 'PEPITES_EDITION_TOO_FEW_RANKED';
  end if;
  select * into v_settings from app_private.pepites_settings where id;

  v_week := app_private.pepites_week_number(v_run.season_id, p_on);
  if v_week is null or v_week not between 1 and 60 then
    raise exception using errcode = '22023', message = 'PEPITES_EDITION_WEEK_INVALID';
  end if;
  perform app_private.pepites_lock_week(v_run.season_id, v_week);
  if exists (
    select 1 from app.pepites_editions edition
    where edition.season_id = v_run.season_id and edition.week_number = v_week
      and edition.status in ('draft', 'scheduled', 'published')
  ) then
    raise exception using errcode = '23505', message = 'PEPITES_WEEK_TAKEN';
  end if;

  v_previous_actor := app_private.pepites_set_actor(p_actor);
  insert into app.pepites_editions (season_id, week_number, round_number, run_id, scheduled_for, created_by)
  values (v_run.season_id, v_week, v_run.as_of_round_number, v_run.id,
    app_private.pepites_local_at(app_private.pepites_week_monday(v_run.season_id, v_week),
      v_settings.publish_local_time),
    p_actor)
  returning id into v_edition_id;

  insert into app.pepites_edition_entries (edition_id, editorial_rank, player_id, computed_rank, computed_score)
  select v_edition_id, score.rank, score.player_id, score.rank, score.score_exact
  from app.pepites_player_scores score
  where score.run_id = v_run.id and score.rank between 1 and 10;
  perform app_private.pepites_restore_actor(v_previous_actor);

  perform app_private.pepites_notify('draft:' || v_edition_id, 'brouillon prêt',
    format('Le Top 10 de la semaine %s (journée %s) est prêt à relire. Publication prévue : %s.',
      v_week, v_run.as_of_round_number,
      to_char(app_private.pepites_local_at(app_private.pepites_week_monday(v_run.season_id, v_week),
        v_settings.publish_local_time) at time zone 'Africa/Casablanca', 'YYYY-MM-DD HH24:MI')));
  return v_edition_id;
end;
$$;

-- The editor's Top 10: a JSON array of {rank, playerId, reasonFr, reasonAr},
-- ranks 1..n without gaps, n <= 10. Replaces the draft's entries.
create function app_private.pepites_set_entries(p_edition_id uuid, p_entries jsonb, p_actor uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_edition app.pepites_editions%rowtype;
  v_count integer;
  v_previous_actor text;
begin
  if p_actor is null then
    raise exception using errcode = '22023', message = 'PEPITES_ACTOR_REQUIRED';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) > 10 then
    raise exception using errcode = '22023', message = 'PEPITES_ENTRIES_INVALID';
  end if;
  v_count := jsonb_array_length(p_entries);
  if exists (
    select 1 from jsonb_array_elements(p_entries) element
    where jsonb_typeof(element) <> 'object'
      or jsonb_typeof(element -> 'rank') <> 'number'
      or jsonb_typeof(element -> 'playerId') <> 'string'
      or (element -> 'playerId') #>> '{}' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      or coalesce(jsonb_typeof(element -> 'reasonFr'), 'null') not in ('string', 'null')
      or coalesce(jsonb_typeof(element -> 'reasonAr'), 'null') not in ('string', 'null')
  ) or (
    select array_agg((element ->> 'rank')::numeric order by (element ->> 'rank')::numeric)
    from jsonb_array_elements(p_entries) element
  ) is distinct from (
    select array_agg(n::numeric order by n) from generate_series(1, v_count) n
  ) then
    raise exception using errcode = '22023', message = 'PEPITES_ENTRIES_INVALID';
  end if;

  v_edition := app_private.pepites_lock_edition(p_edition_id);
  if v_edition.status <> 'draft' then
    raise exception using errcode = '55000', message = 'PEPITES_EDITION_NOT_DRAFT';
  end if;

  v_previous_actor := app_private.pepites_set_actor(p_actor);
  delete from app.pepites_edition_entries where edition_id = p_edition_id;
  insert into app.pepites_edition_entries (edition_id, editorial_rank, player_id, computed_rank,
    computed_score, reason_fr, reason_ar)
  select p_edition_id, (element ->> 'rank')::smallint, (element ->> 'playerId')::uuid, 0, 0,
    nullif(btrim(element ->> 'reasonFr'), ''), nullif(btrim(element ->> 'reasonAr'), '')
  from jsonb_array_elements(p_entries) element;
  perform app_private.pepites_restore_actor(v_previous_actor);

  return pg_catalog.jsonb_build_object('editionId', p_edition_id, 'entries', v_count,
    'problems', to_jsonb(app_private.pepites_edition_problems(p_edition_id)));
end;
$$;

-- draft -> scheduled. The edition must already be publishable.
create function app_private.pepites_schedule(p_edition_id uuid, p_at timestamptz, p_actor uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_edition app.pepites_editions%rowtype;
  v_problems text[];
  v_previous_actor text;
begin
  if p_at is null then
    raise exception using errcode = '22023', message = 'PEPITES_SCHEDULE_TIME_REQUIRED';
  end if;
  v_edition := app_private.pepites_lock_edition(p_edition_id);
  if v_edition.status <> 'draft' then
    raise exception using errcode = '55000', message = 'PEPITES_EDITION_NOT_DRAFT';
  end if;
  v_problems := app_private.pepites_edition_problems(p_edition_id);
  if cardinality(v_problems) > 0 then
    raise exception using errcode = '22023', message = 'PEPITES_EDITION_NOT_READY',
      detail = array_to_string(v_problems, ',');
  end if;
  v_previous_actor := app_private.pepites_set_actor(p_actor);
  update app.pepites_editions set status = 'scheduled', scheduled_for = p_at where id = p_edition_id;
  perform app_private.pepites_restore_actor(v_previous_actor);
  return pg_catalog.jsonb_build_object('editionId', p_edition_id, 'status', 'scheduled', 'scheduledFor', p_at);
end;
$$;

-- scheduled -> draft.
create function app_private.pepites_unschedule(p_edition_id uuid, p_actor uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_edition app.pepites_editions%rowtype;
  v_previous_actor text;
begin
  v_edition := app_private.pepites_lock_edition(p_edition_id);
  if v_edition.status <> 'scheduled' then
    raise exception using errcode = '55000', message = 'PEPITES_EDITION_NOT_SCHEDULED';
  end if;
  v_previous_actor := app_private.pepites_set_actor(p_actor);
  update app.pepites_editions set status = 'draft' where id = p_edition_id;
  perform app_private.pepites_restore_actor(v_previous_actor);
  return pg_catalog.jsonb_build_object('editionId', p_edition_id, 'status', 'draft');
end;
$$;

-- §5.2, in one transaction: lock, idempotence, validate, supersede the
-- corrected edition first, publish, activate the run, enqueue the email.
create function app_private.pepites_publish_edition(p_edition_id uuid, p_actor uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_edition app.pepites_editions%rowtype;
  v_corrected app.pepites_editions%rowtype;
  v_problems text[];
  v_previous_id uuid;
  v_previous_actor text;
  v_previous_publishing text;
begin
  v_edition := app_private.pepites_lock_edition(p_edition_id);
  if v_edition.corrects_edition_id is not null then
    -- In id order with the edition itself; the week lock already serialises
    -- every writer of this week, so this is belt and braces.
    perform 1 from app.pepites_editions edition
    where edition.id in (v_edition.id, v_edition.corrects_edition_id)
    order by edition.id
    for update;
    select * into v_corrected from app.pepites_editions where id = v_edition.corrects_edition_id;
  end if;

  if v_edition.status = 'published' then
    return pg_catalog.jsonb_build_object('editionId', p_edition_id, 'status', 'published',
      'alreadyPublished', true, 'publishedAt', v_edition.published_at);
  end if;
  if v_edition.status <> 'scheduled' then
    raise exception using errcode = '55000', message = 'PEPITES_EDITION_NOT_SCHEDULED',
      detail = v_edition.status;
  end if;
  v_problems := app_private.pepites_edition_problems(p_edition_id);
  if cardinality(v_problems) > 0 then
    raise exception using errcode = '22023', message = 'PEPITES_EDITION_NOT_READY',
      detail = array_to_string(v_problems, ',');
  end if;

  v_previous_actor := app_private.pepites_set_actor(p_actor);
  v_previous_publishing := coalesce(current_setting('botolago.pepites_publishing', true), '');
  perform pg_catalog.set_config('botolago.pepites_publishing', p_edition_id::text, true);

  if v_edition.corrects_edition_id is not null then
    update app.pepites_editions
    set status = 'superseded', superseded_by = p_edition_id
    where id = v_edition.corrects_edition_id;
    v_previous_id := v_corrected.previous_edition_id;
  else
    select edition.id into v_previous_id
    from app.pepites_editions edition
    where edition.season_id = v_edition.season_id and edition.week_number < v_edition.week_number
      and edition.status = 'published'
    order by edition.week_number desc
    limit 1;
  end if;

  update app.pepites_editions
  set status = 'published', published_at = statement_timestamp(), published_by = p_actor,
    previous_edition_id = v_previous_id
  where id = p_edition_id;

  update app.pepites_runs set activated_at = statement_timestamp()
  where id = v_edition.run_id and activated_at is null;

  perform app_private.pepites_edition_email_hook(p_edition_id, 'published');

  perform pg_catalog.set_config('botolago.pepites_publishing', v_previous_publishing, true);
  perform app_private.pepites_restore_actor(v_previous_actor);
  return pg_catalog.jsonb_build_object('editionId', p_edition_id, 'status', 'published',
    'alreadyPublished', false, 'publishedAt', statement_timestamp(),
    'previousEditionId', v_previous_id, 'supersededEditionId', v_edition.corrects_edition_id);
end;
$$;

-- §5.3: point an open edition at a newer revision of its round. A scheduled
-- edition steps back to draft, is re-pointed, and is scheduled again for the
-- same time when all 10 players are still ranked.
create function app_private.pepites_repoint_edition(p_edition_id uuid, p_run_id uuid, p_actor uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_edition app.pepites_editions%rowtype;
  v_removed jsonb;
  v_moved jsonb;
  v_rescheduled boolean := false;
  v_previous_actor text;
begin
  v_edition := app_private.pepites_lock_edition(p_edition_id);
  if v_edition.status not in ('draft', 'scheduled') then
    raise exception using errcode = '55000', message = 'PEPITES_EDITION_NOT_OPEN';
  end if;
  if v_edition.run_id = p_run_id then
    return pg_catalog.jsonb_build_object('editionId', p_edition_id, 'status', v_edition.status,
      'repointed', false);
  end if;

  v_previous_actor := app_private.pepites_set_actor(p_actor);
  if v_edition.status = 'scheduled' then
    update app.pepites_editions set status = 'draft' where id = p_edition_id;
  end if;
  update app.pepites_editions set run_id = p_run_id where id = p_edition_id;

  select coalesce(jsonb_agg(entry.player_id order by entry.editorial_rank), '[]'::jsonb) into v_removed
  from app.pepites_edition_entries entry
  where entry.edition_id = p_edition_id
    and not exists (
      select 1 from app.pepites_player_scores score
      where score.run_id = p_run_id and score.player_id = entry.player_id and score.rank is not null
    );
  delete from app.pepites_edition_entries entry
  where entry.edition_id = p_edition_id
    and not exists (
      select 1 from app.pepites_player_scores score
      where score.run_id = p_run_id and score.player_id = entry.player_id and score.rank is not null
    );

  select coalesce(jsonb_agg(jsonb_build_object('playerId', entry.player_id,
      'from', entry.computed_rank, 'to', score.rank) order by entry.editorial_rank), '[]'::jsonb)
  into v_moved
  from app.pepites_edition_entries entry
  join app.pepites_player_scores score on score.run_id = p_run_id and score.player_id = entry.player_id
  where entry.edition_id = p_edition_id and score.rank <> entry.computed_rank;

  -- The entry trigger copies computed_rank and computed_score from the new
  -- run on every write, so touching the rows refreshes them.
  update app.pepites_edition_entries set updated_at = statement_timestamp()
  where edition_id = p_edition_id;

  if v_edition.status = 'scheduled' and cardinality(app_private.pepites_edition_problems(p_edition_id)) = 0 then
    update app.pepites_editions set status = 'scheduled' where id = p_edition_id;
    v_rescheduled := true;
  end if;
  perform app_private.pepites_restore_actor(v_previous_actor);

  perform app_private.pepites_notify('repoint:' || p_edition_id || ':' || p_run_id,
    case when v_rescheduled then 'Top 10 recalculé, toujours programmé'
      when v_edition.status = 'scheduled' then 'Top 10 recalculé, repassé en brouillon'
      else 'brouillon recalculé' end,
    format('Semaine %s : nouvelles données, le classement a été recalculé. Retirés (plus classés) : %s. Rangs calculés modifiés : %s.%s',
      v_edition.week_number, v_removed, v_moved,
      case when v_edition.status = 'scheduled' and not v_rescheduled
        then ' L''édition doit être complétée puis reprogrammée.' else '' end));

  return pg_catalog.jsonb_build_object('editionId', p_edition_id, 'repointed', true,
    'status', case when v_rescheduled then 'scheduled' else 'draft' end,
    'removed', v_removed, 'moved', v_moved);
end;
$$;

-- §5.3: a draft correcting a published edition, from the newest succeeded run
-- of its round. The corrected edition's entries still ranked are copied, in
-- order, with their reasons.
create function app_private.pepites_create_correction(p_edition_id uuid, p_actor uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_edition app.pepites_editions%rowtype;
  v_run_id uuid;
  v_correction_id uuid;
  v_previous_actor text;
begin
  if p_actor is null then
    raise exception using errcode = '22023', message = 'PEPITES_ACTOR_REQUIRED';
  end if;
  v_edition := app_private.pepites_lock_edition(p_edition_id);
  if v_edition.status <> 'published' then
    raise exception using errcode = '55000', message = 'PEPITES_EDITION_NOT_PUBLISHED';
  end if;
  if exists (
    select 1 from app.pepites_editions edition
    where edition.season_id = v_edition.season_id and edition.week_number = v_edition.week_number
      and edition.status in ('draft', 'scheduled')
  ) then
    raise exception using errcode = '23505', message = 'PEPITES_WEEK_TAKEN';
  end if;
  v_run_id := app_private.pepites_latest_run(v_edition.season_id, v_edition.round_number);

  v_previous_actor := app_private.pepites_set_actor(p_actor);
  insert into app.pepites_editions (season_id, week_number, round_number, run_id,
    corrects_edition_id, created_by)
  values (v_edition.season_id, v_edition.week_number, v_edition.round_number, v_run_id,
    p_edition_id, p_actor)
  returning id into v_correction_id;

  insert into app.pepites_edition_entries (edition_id, editorial_rank, player_id, computed_rank,
    computed_score, reason_fr, reason_ar)
  select v_correction_id, row_number() over (order by entry.editorial_rank), entry.player_id, 0, 0,
    entry.reason_fr, entry.reason_ar
  from app.pepites_edition_entries entry
  where entry.edition_id = p_edition_id
    and exists (
      select 1 from app.pepites_player_scores score
      where score.run_id = v_run_id and score.player_id = entry.player_id and score.rank is not null
    );
  perform app_private.pepites_restore_actor(v_previous_actor);
  return v_correction_id;
end;
$$;

-- published -> withdrawn, with a reason. Unsent emails are cancelled.
create function app_private.pepites_withdraw(p_edition_id uuid, p_reason text, p_actor uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_edition app.pepites_editions%rowtype;
  v_reason text := btrim(p_reason);
  v_previous_actor text;
begin
  if p_actor is null then
    raise exception using errcode = '22023', message = 'PEPITES_ACTOR_REQUIRED';
  end if;
  if v_reason is null or char_length(v_reason) not between 8 and 500 then
    raise exception using errcode = '22023', message = 'PEPITES_REASON_INVALID';
  end if;
  v_edition := app_private.pepites_lock_edition(p_edition_id);
  if v_edition.status <> 'published' then
    raise exception using errcode = '55000', message = 'PEPITES_EDITION_NOT_PUBLISHED';
  end if;
  v_previous_actor := app_private.pepites_set_actor(p_actor);
  update app.pepites_editions
  set status = 'withdrawn', withdrawn_at = statement_timestamp(), withdrawn_reason = v_reason
  where id = p_edition_id;
  perform app_private.pepites_edition_email_hook(p_edition_id, 'withdrawn');
  perform app_private.pepites_restore_actor(v_previous_actor);
  perform app_private.pepites_notify('withdrawn:' || p_edition_id, 'édition retirée',
    format('Semaine %s retirée : %s', v_edition.week_number, v_reason));
  return pg_catalog.jsonb_build_object('editionId', p_edition_id, 'status', 'withdrawn');
end;
$$;

-- ---------------------------------------------------------------------------
-- The operator switch (postgres only), like predictions_configure
-- ---------------------------------------------------------------------------
create function app_private.pepites_configure(
  p_mode text,
  p_auto_publish boolean default null,
  p_competition_id uuid default null,
  p_publish_local_time time default null,
  p_draft_local_time time default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_settings app_private.pepites_settings%rowtype;
begin
  if p_mode is null or p_mode not in ('off', 'staff', 'public') then
    raise exception using errcode = '22023', message = 'PEPITES_MODE_INVALID';
  end if;
  update app_private.pepites_settings set
    mode = p_mode,
    auto_publish = coalesce(p_auto_publish, auto_publish),
    competition_id = coalesce(p_competition_id, competition_id),
    publish_local_time = coalesce(p_publish_local_time, publish_local_time),
    draft_local_time = coalesce(p_draft_local_time, draft_local_time),
    updated_at = statement_timestamp()
  where id
  returning * into v_settings;
  insert into app_private.pepites_job_log (kind, outcome, detail)
  values ('operator', 'configured', pg_catalog.jsonb_build_object('mode', v_settings.mode,
    'autoPublish', v_settings.auto_publish, 'competitionId', v_settings.competition_id,
    'publishLocalTime', v_settings.publish_local_time, 'draftLocalTime', v_settings.draft_local_time));
  return pg_catalog.jsonb_build_object('mode', v_settings.mode, 'autoPublish', v_settings.auto_publish,
    'competitionId', v_settings.competition_id, 'publishLocalTime', v_settings.publish_local_time,
    'draftLocalTime', v_settings.draft_local_time);
end;
$$;

-- ---------------------------------------------------------------------------
-- The tick (§5.1)
-- ---------------------------------------------------------------------------
-- Scores the latest complete round when its inputs changed (at most 3 failed
-- attempts per input fingerprint).
create function app_private.pepites_tick_runs(p_season_id uuid, p_now timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_round integer := app_private.pepites_latest_complete_round(p_season_id);
  v_age_limit integer;
  v_fingerprint text;
  v_failures integer;
  v_run_id uuid;
  v_status text;
  v_error text;
  v_edition_id uuid;
  v_repointed jsonb := '[]'::jsonb;
begin
  if v_round is null then
    return pg_catalog.jsonb_build_object('round', null);
  end if;
  select (methodology.params ->> 'age_limit')::integer into v_age_limit
  from app.pepites_methodologies methodology where methodology.version = 'v1';
  v_fingerprint := app_private.pepites_input_fingerprint(p_season_id, 'weekly', v_round, p_now, v_age_limit);
  if exists (
    select 1 from app.pepites_runs run
    where run.season_id = p_season_id and run.kind = 'weekly' and run.as_of_round_number = v_round
      and run.methodology_version = 'v1' and run.status = 'succeeded'
      and run.input_fingerprint = v_fingerprint
  ) then
    return pg_catalog.jsonb_build_object('round', v_round, 'run', 'unchanged');
  end if;

  select attempts.failures into v_failures
  from app_private.pepites_run_attempts attempts
  where attempts.season_id = p_season_id and attempts.round_number = v_round
    and attempts.input_fingerprint = v_fingerprint;
  if coalesce(v_failures, 0) >= 3 then
    return pg_catalog.jsonb_build_object('round', v_round, 'run', 'gave_up');
  end if;

  v_run_id := app_private.pepites_start_run(p_season_id, 'weekly', v_round, p_now, 'v1');
  select run.status, run.error into v_status, v_error from app.pepites_runs run where run.id = v_run_id;

  if v_status = 'failed' then
    insert into app_private.pepites_run_attempts as attempts
      (season_id, round_number, input_fingerprint, failures, last_run_id)
    values (p_season_id, v_round, v_fingerprint, 1, v_run_id)
    on conflict (season_id, round_number, input_fingerprint) do update
    set failures = attempts.failures + 1, last_run_id = excluded.last_run_id,
      updated_at = statement_timestamp()
    returning failures into v_failures;
    if v_failures >= 3 then
      perform app_private.pepites_notify('run_failed:' || p_season_id || ':' || v_round || ':' || v_fingerprint,
        'le calcul échoue', format('Journée %s : 3 calculs de suite ont échoué. Dernière erreur : %s',
          v_round, v_error));
    end if;
    return pg_catalog.jsonb_build_object('round', v_round, 'run', 'failed', 'runId', v_run_id,
      'failures', v_failures);
  end if;

  -- A new revision: re-point this round's open edition (§5.3). An edition
  -- published while this tick waited for the week lock is left alone, and
  -- the new run is kept for next week.
  for v_edition_id in
    select edition.id from app.pepites_editions edition
    where edition.season_id = p_season_id and edition.round_number = v_round
      and edition.status in ('draft', 'scheduled') and edition.run_id <> v_run_id
    order by edition.id
  loop
    begin
      v_repointed := v_repointed || jsonb_build_array(app_private.pepites_repoint_edition(v_edition_id, v_run_id, null));
    exception when object_not_in_prerequisite_state then
      get stacked diagnostics v_error = message_text;
      if v_error <> 'PEPITES_EDITION_NOT_OPEN' then
        raise;
      end if;
      v_repointed := v_repointed || jsonb_build_array(pg_catalog.jsonb_build_object(
        'editionId', v_edition_id, 'repointed', false, 'reason', 'no_longer_open'));
    end;
  end loop;
  return pg_catalog.jsonb_build_object('round', v_round, 'run', 'scored', 'runId', v_run_id,
    'repointed', v_repointed);
end;
$$;

-- Monday from draft_local_time: a draft for the week, when a run exists for a
-- round newer than every edition already published and §4.2 allows one.
create function app_private.pepites_tick_draft(p_season_id uuid, p_now timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_settings app_private.pepites_settings%rowtype;
  v_local timestamp := p_now at time zone 'Africa/Casablanca';
  v_week integer;
  v_run app.pepites_runs%rowtype;
  v_params jsonb;
  v_last_round integer;
begin
  select * into v_settings from app_private.pepites_settings where id;
  if extract(isodow from v_local) <> 1 or v_local::time < v_settings.draft_local_time then
    return pg_catalog.jsonb_build_object('draft', 'not_now');
  end if;
  v_week := app_private.pepites_week_number(p_season_id, v_local::date);
  if v_week is null or v_week not between 1 and 60 then
    return pg_catalog.jsonb_build_object('draft', 'outside_season');
  end if;
  if exists (
    select 1 from app.pepites_editions edition
    where edition.season_id = p_season_id and edition.week_number = v_week
  ) then
    return pg_catalog.jsonb_build_object('draft', 'exists');
  end if;
  select * into v_run from app.pepites_runs
  where id = app_private.pepites_latest_run(p_season_id, null);
  if v_run.id is null then
    return pg_catalog.jsonb_build_object('draft', 'no_run');
  end if;
  select max(edition.round_number) into v_last_round
  from app.pepites_editions edition
  where edition.season_id = p_season_id and edition.status in ('published', 'superseded', 'withdrawn');
  if v_run.as_of_round_number <= coalesce(v_last_round, 0) then
    return pg_catalog.jsonb_build_object('draft', 'no_new_round');
  end if;
  select methodology.params into v_params
  from app.pepites_methodologies methodology where methodology.version = v_run.methodology_version;
  if v_run.as_of_round_number < (v_params ->> 'first_edition_round')::integer then
    return pg_catalog.jsonb_build_object('draft', 'too_early');
  end if;
  if v_run.ranked_count < (v_params ->> 'min_eligible_for_edition')::integer then
    perform app_private.pepites_notify('too_few:' || p_season_id || ':' || v_week,
      'pas d''édition cette semaine',
      format('Journée %s : %s joueurs classés, il en faut %s. Pas de Top 10 cette semaine.',
        v_run.as_of_round_number, v_run.ranked_count, v_params ->> 'min_eligible_for_edition'));
    return pg_catalog.jsonb_build_object('draft', 'too_few_ranked');
  end if;
  return pg_catalog.jsonb_build_object('draft', 'created',
    'editionId', app_private.pepites_create_draft(v_run.id, v_local::date, null));
end;
$$;

-- From scheduled_for and for 24 hours: publish what is scheduled, auto-publish
-- drafts when allowed, otherwise say once that the edition is late. After 24
-- hours, say once that it was left as it is.
create function app_private.pepites_tick_publish(p_season_id uuid, p_now timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_settings app_private.pepites_settings%rowtype;
  v_edition record;
  v_done jsonb := '[]'::jsonb;
  v_error text;
  v_error_detail text;
begin
  select * into v_settings from app_private.pepites_settings where id;
  for v_edition in
    select edition.id, edition.status, edition.week_number, edition.scheduled_for
    from app.pepites_editions edition
    where edition.season_id = p_season_id and edition.status in ('draft', 'scheduled')
      and edition.scheduled_for <= p_now
    order by edition.week_number, edition.id
  loop
    if p_now >= v_edition.scheduled_for + interval '24 hours' then
      perform app_private.pepites_notify('abandoned:' || v_edition.id, 'édition non publiée après 24 h',
        format('Semaine %s : toujours %s 24 heures après l''heure prévue. Plus rien n''est tenté automatiquement ; publication manuelle possible.',
          v_edition.week_number, v_edition.status));
      continue;
    end if;
    if v_edition.status = 'draft' and not v_settings.auto_publish then
      perform app_private.pepites_notify('delayed:' || v_edition.id, 'édition en retard',
        format('Semaine %s : l''heure de publication est passée et le brouillon n''est pas programmé (publication automatique désactivée).',
          v_edition.week_number));
      continue;
    end if;
    begin
      if v_edition.status = 'draft' then
        perform app_private.pepites_schedule(v_edition.id, v_edition.scheduled_for, null);
      end if;
      perform app_private.pepites_publish_edition(v_edition.id, null);
      v_done := v_done || jsonb_build_array(jsonb_build_object('editionId', v_edition.id, 'published', true));
    exception when others then
      get stacked diagnostics v_error = message_text, v_error_detail = pg_exception_detail;
      perform app_private.pepites_notify('delayed:' || v_edition.id, 'édition en retard',
        format('Semaine %s : la publication a échoué (%s %s). Nouvel essai au prochain passage.',
          v_edition.week_number, v_error, v_error_detail));
      v_done := v_done || jsonb_build_array(jsonb_build_object('editionId', v_edition.id,
        'published', false, 'error', left(v_error, 200), 'detail', left(v_error_detail, 300)));
    end;
  end loop;
  return pg_catalog.jsonb_build_object('publish', v_done);
end;
$$;

-- Once a day (Casablanca date): data desk sweep, photo expiry, and a replay of
-- one activated run, picked at random.
create function app_private.pepites_tick_daily(p_season_id uuid, p_now timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today date := (p_now at time zone 'Africa/Casablanca')::date;
  v_sweep jsonb;
  v_expired integer;
  v_run_id uuid;
  v_replay jsonb;
begin
  update app_private.pepites_settings set last_daily_on = v_today
  where id and last_daily_on is distinct from v_today;
  if not found then
    return pg_catalog.jsonb_build_object('daily', 'done_today');
  end if;
  v_sweep := app_private.data_desk_sweep(p_season_id);
  v_expired := app_private.expire_player_photo_releases(v_today);
  select run.id into v_run_id
  from app.pepites_runs run
  where run.activated_at is not null
  order by pg_catalog.random()
  limit 1;
  if v_run_id is not null then
    v_replay := app_private.pepites_replay(v_run_id);
    if not (v_replay ->> 'matches')::boolean then
      perform app_private.pepites_notify('replay:' || v_run_id || ':' || v_today, 'rejeu différent',
        format('Le rejeu du calcul %s ne retrouve pas les scores enregistrés : %s', v_run_id, v_replay));
    end if;
  end if;
  return pg_catalog.jsonb_build_object('daily', 'ran', 'sweep', v_sweep, 'photosExpired', v_expired,
    'replayedRunId', v_run_id, 'replay', v_replay);
end;
$$;

create function app_private.pepites_tick(p_now timestamptz default statement_timestamp())
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_settings app_private.pepites_settings%rowtype;
  v_season_id uuid;
  v_result jsonb := '{}'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_step jsonb;
  v_previous_actor text;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('pepites_tick', 0)) then
    return pg_catalog.jsonb_build_object('outcome', 'busy');
  end if;
  select * into v_settings from app_private.pepites_settings where id;
  if v_settings.mode = 'off' then
    return pg_catalog.jsonb_build_object('outcome', 'off');
  end if;
  v_season_id := app_private.pepites_current_season();
  if v_season_id is null then
    return pg_catalog.jsonb_build_object('outcome', 'no_season');
  end if;
  v_previous_actor := app_private.pepites_set_actor(null);

  -- Each step in its own subtransaction: one failing step does not undo or
  -- block the others; the error is logged and the next tick tries again.
  begin
    v_step := app_private.pepites_tick_runs(v_season_id, p_now);
    v_result := v_result || pg_catalog.jsonb_build_object('runs', v_step);
  exception when others then
    v_errors := v_errors || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('step', 'runs', 'error', left(sqlstate || ': ' || sqlerrm, 500)));
  end;
  begin
    v_step := app_private.pepites_tick_draft(v_season_id, p_now);
    v_result := v_result || v_step;
  exception when others then
    v_errors := v_errors || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('step', 'draft', 'error', left(sqlstate || ': ' || sqlerrm, 500)));
  end;
  begin
    v_step := app_private.pepites_tick_publish(v_season_id, p_now);
    v_result := v_result || v_step;
  exception when others then
    v_errors := v_errors || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('step', 'publish', 'error', left(sqlstate || ': ' || sqlerrm, 500)));
  end;
  begin
    v_step := app_private.pepites_tick_daily(v_season_id, p_now);
    v_result := v_result || v_step;
  exception when others then
    v_errors := v_errors || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('step', 'daily', 'error', left(sqlstate || ': ' || sqlerrm, 500)));
  end;
  perform app_private.pepites_restore_actor(v_previous_actor);

  v_result := v_result || pg_catalog.jsonb_build_object('outcome',
    case when jsonb_array_length(v_errors) > 0 then 'partial' else 'ok' end, 'errors', v_errors);
  if jsonb_array_length(v_errors) > 0
    or coalesce(v_result #>> '{runs,run}', 'unchanged') not in ('unchanged', 'gave_up')
    or v_result ->> 'draft' = 'created'
    or jsonb_array_length(coalesce(v_result -> 'publish', '[]'::jsonb)) > 0
    or v_result ->> 'daily' = 'ran'
  then
    insert into app_private.pepites_job_log (kind, outcome, detail, error)
    values ('tick', v_result ->> 'outcome', v_result,
      case when jsonb_array_length(v_errors) > 0 then left(v_errors::text, 2000) end);
  end if;
  if jsonb_array_length(v_errors) > 0 then
    perform app_private.pepites_notify('tick_error:' || (p_now at time zone 'Africa/Casablanca')::date,
      'erreur du passage automatique', left(v_errors::text, 3000));
  end if;
  return v_result;
end;
$$;

comment on function app_private.pepites_tick(timestamptz) is
  'Run every 15 minutes by the pg_cron job pepites-tick. Writes nothing while pepites_settings.mode = off. A second concurrent tick exits at once (outcome busy).';

-- ---------------------------------------------------------------------------
-- Grants: nothing for clients. The API migration adds the wrappers.
-- ---------------------------------------------------------------------------
revoke all on function app_private.pepites_week_start(date) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_week_number(uuid, date) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_week_monday(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_local_at(date, time) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_actor() from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_set_actor(uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_restore_actor(text) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_editions_guard() from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_editions_record_move() from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_edition_moves_guard() from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_edition_entries_guard() from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_lock_week(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_lock_edition(uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_notify(text, text, text) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_edition_problems(uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_edition_email_hook(uuid, text) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_latest_complete_round(uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_latest_run(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_create_draft(uuid, date, uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_set_entries(uuid, jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_schedule(uuid, timestamptz, uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_unschedule(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_publish_edition(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_repoint_edition(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_create_correction(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_withdraw(uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_configure(text, boolean, uuid, time, time) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_tick_runs(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_tick_draft(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_tick_publish(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_tick_daily(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_tick(timestamptz) from public, anon, authenticated, service_role;
grant execute on function app_private.pepites_tick(timestamptz) to postgres;

-- ---------------------------------------------------------------------------
-- The job. Idle (no writes) while mode = off, which is the default.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'pepites-tick',
  '*/15 * * * *',
  'select app_private.pepites_tick();'
);

select cron.schedule(
  'pepites-history-prune',
  '41 3 * * *',
  $prune$
    delete from cron.job_run_details
    where jobid = (select jobid from cron.job where jobname = 'pepites-tick')
      and end_time < now() - interval '7 days';
    delete from app_private.pepites_job_log
    where kind = 'tick' and at < now() - interval '180 days';
  $prune$
);
