-- BotolaGO Production V2
-- News activation: scheduled articles actually publish.
--
-- Until now "Programmé" stored status = 'scheduled' and a scheduled_at, and
-- nothing ever moved a due edition to 'published' (audit, 2026-09-22). This
-- migration adds:
--
--   * app_private.news_publish_due_editions(): publishes every edition whose
--     scheduled_at has passed, one row at a time inside its own
--     sub-transaction (a failing row is recorded and retried next minute; it
--     never blocks the others). Rows are claimed with FOR UPDATE SKIP LOCKED
--     and re-checked on update, so two overlapping runs cannot publish the
--     same edition twice. A published edition is no longer 'scheduled', so a
--     re-run finds nothing: one status change, one revision snapshot and one
--     audit event per publication. No notification is emitted (news
--     notifications are created only by the separate service RPC).
--   * a pg_cron job running it every minute inside the database -- no Edge
--     Function, secret or external scheduler involved.
--   * observability: a heartbeat row updated on every run, a run log for every
--     run that had due work or failed, pg_cron's own cron.job_run_details, and
--     api.editorial_schedule_health() for the CMS.
--   * api.editorial_transition_article: a schedule must be in the future, and
--     a scheduled edition can be rescheduled (scheduled -> scheduled) without
--     the draft -> review round trip.
--
-- published_at is the scheduled time (the time the article was meant to go
-- out), or the original publication time when a previously published edition
-- is re-scheduled. All times are timestamptz (UTC).

create extension if not exists pg_cron;

create table app_private.news_schedule_heartbeat (
  id boolean primary key default true,
  last_run_at timestamptz not null,
  last_outcome text not null,
  constraint news_schedule_heartbeat_singleton check (id),
  constraint news_schedule_heartbeat_outcome_check check (
    last_outcome in ('idle', 'succeeded', 'partial', 'failed')
  )
);

create table app_private.news_schedule_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  due_count integer not null,
  published_count integer not null,
  failed_count integer not null,
  published_edition_ids uuid[] not null default '{}',
  failed_edition_ids uuid[] not null default '{}',
  last_error text,
  outcome text not null,
  constraint news_schedule_runs_outcome_check check (outcome in ('succeeded', 'partial', 'failed')),
  constraint news_schedule_runs_counts_check check (
    due_count >= 0 and published_count >= 0 and failed_count >= 0
    and published_count + failed_count <= due_count
  ),
  constraint news_schedule_runs_error_check check (last_error is null or char_length(last_error) <= 600)
);
create index news_schedule_runs_started_idx on app_private.news_schedule_runs (started_at desc);

alter table app_private.news_schedule_heartbeat enable row level security;
alter table app_private.news_schedule_heartbeat force row level security;
alter table app_private.news_schedule_runs enable row level security;
alter table app_private.news_schedule_runs force row level security;
revoke all on app_private.news_schedule_heartbeat, app_private.news_schedule_runs
from public, anon, authenticated, service_role;

create or replace function app_private.news_publish_due_editions(p_limit integer default 100)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  run_started timestamptz := clock_timestamp();
  batch_size integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  due record;
  due_count integer := 0;
  published uuid[] := '{}'::uuid[];
  failed uuid[] := '{}'::uuid[];
  last_error text;
  outcome text;
begin
  for due in
    select edition.id, edition.story_id, edition.scheduled_at
    from app.article_editions edition
    where edition.status = 'scheduled'
      and edition.scheduled_at <= clock_timestamp()
    order by edition.scheduled_at, edition.id
    limit batch_size
    for update of edition skip locked
  loop
    due_count := due_count + 1;
    begin
      if not app_private.news_story_is_publishable(due.story_id) then
        raise exception using errcode = '22023', message = 'news_imported_story_requires_conversion';
      end if;
      update app.article_editions edition set
        status = 'published',
        visibility = case when edition.visibility = 'private' then 'public' else edition.visibility end,
        published_at = coalesce(edition.published_at, edition.scheduled_at),
        unpublished_at = null,
        scheduled_at = null
      where edition.id = due.id and edition.status = 'scheduled';
      if found then
        perform app_private.write_editorial_audit(
          'article_scheduled_publication', due.story_id, due.id,
          jsonb_build_object('from', 'scheduled', 'to', 'published', 'scheduledAt', due.scheduled_at)
        );
        published := published || due.id;
      end if;
    exception when others then
      failed := failed || due.id;
      last_error := left(format('%s %s: %s', due.id, sqlstate, sqlerrm), 600);
    end;
  end loop;

  outcome := case
    when due_count = 0 then 'idle'
    when cardinality(failed) = 0 then 'succeeded'
    when cardinality(published) = 0 then 'failed'
    else 'partial'
  end;

  insert into app_private.news_schedule_heartbeat (id, last_run_at, last_outcome)
  values (true, run_started, outcome)
  on conflict (id) do update set last_run_at = excluded.last_run_at, last_outcome = excluded.last_outcome;

  if due_count > 0 then
    insert into app_private.news_schedule_runs (
      started_at, finished_at, due_count, published_count, failed_count,
      published_edition_ids, failed_edition_ids, last_error, outcome
    ) values (
      run_started, clock_timestamp(), due_count, cardinality(published), cardinality(failed),
      published, failed, last_error, outcome
    );
  end if;

  return jsonb_build_object(
    'outcome', outcome,
    'due', due_count,
    'published', to_jsonb(published),
    'failed', to_jsonb(failed)
  );
end;
$$;

comment on function app_private.news_publish_due_editions(integer) is
  'Publishes scheduled editions whose scheduled_at has passed. Idempotent; run every minute by the pg_cron job news-publish-due-editions.';

revoke all on function app_private.news_publish_due_editions(integer)
from public, anon, authenticated, service_role;
grant execute on function app_private.news_publish_due_editions(integer) to postgres;

-- The job. cron.schedule with a name replaces an existing job of that name,
-- so re-applying this is harmless.
select cron.schedule(
  'news-publish-due-editions',
  '* * * * *',
  'select app_private.news_publish_due_editions();'
);

-- pg_cron keeps one history row per run (1,440 a day for the job above).
-- Keep a week of this job's history and nothing older.
select cron.schedule(
  'news-publish-due-editions-history-prune',
  '17 3 * * *',
  $prune$
    delete from cron.job_run_details
    where jobid = (select jobid from cron.job where jobname = 'news-publish-due-editions')
      and end_time < now() - interval '7 days'
  $prune$
);

-- Health for the CMS: is the job there and running, and is anything overdue?
create or replace function api.editorial_schedule_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  heartbeat app_private.news_schedule_heartbeat%rowtype;
  last_failure app_private.news_schedule_runs%rowtype;
begin
  if not app_private.has_editorial_role('editor') then
    raise exception using errcode = '42501', message = 'news_editorial_forbidden';
  end if;
  select * into heartbeat from app_private.news_schedule_heartbeat where id = true;
  select * into last_failure from app_private.news_schedule_runs
  where failed_count > 0 order by started_at desc limit 1;
  return jsonb_build_object(
    'jobActive', exists (
      select 1 from cron.job where jobname = 'news-publish-due-editions' and active
    ),
    'lastRunAt', heartbeat.last_run_at,
    'lastOutcome', heartbeat.last_outcome,
    'scheduledCount', (select count(*) from app.article_editions where status = 'scheduled'),
    'overdueCount', (
      select count(*) from app.article_editions
      where status = 'scheduled' and scheduled_at < statement_timestamp() - interval '5 minutes'
    ),
    'lastFailure', case when last_failure.id is null then null else jsonb_build_object(
      'at', last_failure.started_at,
      'failedCount', last_failure.failed_count,
      'error', last_failure.last_error
    ) end
  );
end;
$$;

revoke all on function api.editorial_schedule_health() from public, anon, authenticated, service_role;
grant execute on function api.editorial_schedule_health() to authenticated;

-- Transitions: previous definition (20260922180000) plus a future-only
-- schedule and scheduled -> scheduled rescheduling.
create or replace function api.editorial_transition_article(
  p_article_edition_id uuid,
  p_target_status app.publication_status,
  p_scheduled_at timestamptz default null,
  p_visibility app.article_visibility default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  edition app.article_editions%rowtype;
  required_role app_private.editorial_role;
  next_visibility app.article_visibility;
begin
  required_role := case when p_target_status in ('published', 'scheduled', 'unpublished', 'archived')
    then 'publisher'::app_private.editorial_role else 'editor'::app_private.editorial_role end;
  if not app_private.has_editorial_role(required_role) then
    raise exception using errcode = '42501', message = 'news_editorial_forbidden';
  end if;
  select * into edition from app.article_editions where id = p_article_edition_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'news_article_not_found'; end if;

  if p_target_status not in ('unpublished', 'archived')
    and not app_private.news_story_is_publishable(edition.story_id)
  then
    raise exception using errcode = '22023', message = 'news_imported_story_requires_conversion';
  end if;

  if p_target_status = 'scheduled'
    and (p_scheduled_at is null or p_scheduled_at <= statement_timestamp())
  then
    raise exception using errcode = '22023', message = 'news_schedule_must_be_future';
  end if;

  if not (
    (edition.status = 'draft' and p_target_status in ('in_review', 'rejected'))
    or (edition.status = 'in_review' and p_target_status in ('draft', 'scheduled', 'published', 'rejected'))
    or (edition.status = 'scheduled' and p_target_status in ('draft', 'scheduled', 'published', 'unpublished'))
    or (edition.status = 'published' and p_target_status in ('unpublished', 'archived'))
    or (edition.status = 'unpublished' and p_target_status in ('draft', 'published', 'archived'))
    or (edition.status = 'rejected' and p_target_status = 'draft')
    or (edition.status = 'archived' and p_target_status = 'draft')
  ) then
    raise exception using errcode = '22023', message = 'news_invalid_status_transition';
  end if;

  next_visibility := coalesce(p_visibility, case when p_target_status in ('published', 'scheduled')
    then 'public'::app.article_visibility else edition.visibility end);
  update app.article_editions set
    status = p_target_status,
    visibility = next_visibility,
    scheduled_at = case when p_target_status = 'scheduled' then p_scheduled_at else null end,
    published_at = case when p_target_status = 'published' then coalesce(edition.published_at, statement_timestamp())
                        else edition.published_at end,
    unpublished_at = case when p_target_status in ('unpublished', 'archived') then statement_timestamp()
                          when p_target_status = 'published' then null else edition.unpublished_at end,
    updated_by = auth.uid()
  where id = edition.id;
  perform app_private.write_editorial_audit(
    'article_status_changed', edition.story_id, edition.id,
    jsonb_strip_nulls(jsonb_build_object(
      'from', edition.status, 'to', p_target_status,
      'scheduledAt', case when p_target_status = 'scheduled' then p_scheduled_at end
    ))
  );
  return jsonb_build_object('articleId', edition.id, 'status', p_target_status, 'visibility', next_visibility);
end;
$$;
