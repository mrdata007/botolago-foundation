-- AI-written content for Botola Pro 1: match previews, match recaps, news
-- reports and blogs, published automatically, with the owner emailed about
-- every article.
--
-- Shape:
--   * pg_cron wakes the Edge Function `ai-content-generate` every 30 minutes
--     (app_private.ai_content_tick), but only while the owner has switched the
--     feature on. It is OFF by default and ships off.
--   * api.service_ai_content_plan() tells the function what is worth writing
--     (finished matches without a recap, upcoming matches without a preview,
--     fresh ingested news, an occasional blog) and hands it the FACTS to write
--     from. The model is told to use nothing else.
--   * api.service_ai_content_publish() stores the finished article as a
--     published edition, enforcing the daily cap and the kill switch inside
--     the database, so a bug in the function cannot publish past them.
--   * Every article is recorded in app_private.ai_content_articles; the
--     function emails the owner for each unnotified row and marks it.
--
-- Owner, once:
--   select app_private.ai_content_configure(true, '<competition slug>', 6);
-- Pause at any time:
--   select app_private.ai_content_configure(false);

insert into app.publishers (
  slug, name, source_type, trust_status, ingestion_mode, website_url, active
) values (
  'botolago-ai', 'BotolaGO', 'internal', 'trusted', 'manual', 'https://botolago.com', true
)
on conflict (slug) do nothing;

create table app_private.ai_content_settings (
  id boolean primary key default true,
  enabled boolean not null default false,
  competition_id uuid references app.competitions(id) on delete restrict,
  max_articles_per_day integer not null default 6,
  updated_at timestamptz not null default statement_timestamp(),
  constraint ai_content_settings_singleton check (id),
  constraint ai_content_settings_cap_check check (max_articles_per_day between 1 and 24),
  constraint ai_content_settings_competition_check check (not enabled or competition_id is not null)
);
insert into app_private.ai_content_settings (id) values (true);

create table app_private.ai_content_articles (
  id uuid primary key default gen_random_uuid(),
  article_edition_id uuid not null unique references app.article_editions(id) on delete restrict,
  story_id uuid not null references app.stories(id) on delete restrict,
  kind text not null,
  fixture_id uuid references app.fixtures(id) on delete restrict,
  language app.language_code not null,
  source_edition_ids uuid[] not null default '{}',
  model text not null,
  created_at timestamptz not null default statement_timestamp(),
  owner_notified_at timestamptz,
  notify_attempts integer not null default 0,
  constraint ai_content_articles_kind_check check (
    kind in ('match_preview', 'match_recap', 'news_report', 'blog')
  ),
  constraint ai_content_articles_fixture_check check (
    (kind in ('match_preview', 'match_recap')) = (fixture_id is not null)
  ),
  constraint ai_content_articles_model_check check (char_length(model) between 1 and 100)
);
create unique index ai_content_articles_fixture_kind_language_key
  on app_private.ai_content_articles (kind, fixture_id, language)
  where fixture_id is not null;
create index ai_content_articles_created_idx on app_private.ai_content_articles (created_at desc);
create index ai_content_articles_unnotified_idx
  on app_private.ai_content_articles (created_at) where owner_notified_at is null;

alter table app_private.ai_content_settings enable row level security;
alter table app_private.ai_content_settings force row level security;
alter table app_private.ai_content_articles enable row level security;
alter table app_private.ai_content_articles force row level security;
revoke all on app_private.ai_content_settings, app_private.ai_content_articles
from public, anon, authenticated, service_role;

-- Owner switch. Enabling needs a competition (matched by slug).
create or replace function app_private.ai_content_configure(
  p_enabled boolean,
  p_competition_slug text default null,
  p_max_articles_per_day integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target_competition uuid;
  state app_private.ai_content_settings%rowtype;
begin
  if p_enabled is null then
    raise exception using errcode = '22023', message = 'ai_content_setting_required';
  end if;
  if p_competition_slug is not null then
    select id into target_competition from app.competitions where slug = p_competition_slug and active;
    if target_competition is null then
      raise exception using errcode = 'P0002', message = 'ai_content_competition_not_found';
    end if;
  end if;
  update app_private.ai_content_settings
  set enabled = p_enabled,
      competition_id = coalesce(target_competition, competition_id),
      max_articles_per_day = coalesce(p_max_articles_per_day, max_articles_per_day),
      updated_at = statement_timestamp()
  where id
  returning * into state;
  return jsonb_build_object(
    'enabled', state.enabled,
    'competitionId', state.competition_id,
    'maxArticlesPerDay', state.max_articles_per_day
  );
exception when check_violation then
  raise exception using errcode = '22023', message = 'ai_content_configuration_invalid',
    hint = 'enabling needs a competition slug, and the daily cap must be 1 to 24';
end;
$$;
revoke all on function app_private.ai_content_configure(boolean, text, integer)
from public, anon, authenticated, service_role;

-- What the model may write from. Service role only.
create or replace function api.service_ai_content_plan()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings app_private.ai_content_settings%rowtype;
  used integer;
  remaining integer;
  jobs jsonb := '[]'::jsonb;
  news jsonb;
  recent_results jsonb;
  model_budget integer;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = '42501', message = 'ai_content_service_role_required';
  end if;
  select * into settings from app_private.ai_content_settings where id;
  if not settings.enabled or settings.competition_id is null then
    return jsonb_build_object('enabled', false, 'jobs', '[]'::jsonb);
  end if;

  select count(distinct story_id) into used
  from app_private.ai_content_articles
  where created_at > statement_timestamp() - interval '24 hours';
  remaining := settings.max_articles_per_day - used;
  if remaining <= 0 then
    return jsonb_build_object('enabled', true, 'jobs', '[]'::jsonb, 'remaining', 0);
  end if;
  model_budget := least(remaining, 3);

  -- Recaps: finished matches of the last 24 hours with a final score.
  jobs := jobs || coalesce((
    select jsonb_agg(job order by kickoff_at desc) from (
      select f.kickoff_at, jsonb_build_object(
        'kind', 'match_recap',
        'fixtureId', f.id,
        'facts', jsonb_build_object(
          'kickoffAt', f.kickoff_at,
          'home', jsonb_build_object('fr', coalesce(ht_fr.name, ht.name), 'ar', coalesce(ht_ar.name, ht.name)),
          'away', jsonb_build_object('fr', coalesce(at_fr.name, at.name), 'ar', coalesce(at_ar.name, at.name)),
          'homeScore', f.home_score, 'awayScore', f.away_score,
          'halfTimeHome', f.half_time_home_score, 'halfTimeAway', f.half_time_away_score,
          'penaltyHome', f.penalty_home_score, 'penaltyAway', f.penalty_away_score
        )
      ) as job
      from app.fixtures f
      join app.teams ht on ht.id = f.home_team_id
      join app.teams at on at.id = f.away_team_id
      left join app.team_translations ht_fr on ht_fr.team_id = ht.id and ht_fr.language = 'fr'
      left join app.team_translations ht_ar on ht_ar.team_id = ht.id and ht_ar.language = 'ar'
      left join app.team_translations at_fr on at_fr.team_id = at.id and at_fr.language = 'fr'
      left join app.team_translations at_ar on at_ar.team_id = at.id and at_ar.language = 'ar'
      where f.competition_id = settings.competition_id
        and f.status = 'finished'
        and f.home_score is not null
        and f.kickoff_at > statement_timestamp() - interval '24 hours'
        and not exists (
          select 1 from app_private.ai_content_articles a
          where a.kind = 'match_recap' and a.fixture_id = f.id
        )
      order by f.kickoff_at desc
      limit model_budget
    ) recaps
  ), '[]'::jsonb);

  -- Previews: matches kicking off between 2 and 30 hours from now, with each
  -- side's last five finished results as the only "form" the model may cite.
  jobs := jobs || coalesce((
    select jsonb_agg(job order by kickoff_at) from (
      select f.kickoff_at, jsonb_build_object(
        'kind', 'match_preview',
        'fixtureId', f.id,
        'facts', jsonb_build_object(
          'kickoffAt', f.kickoff_at,
          'home', jsonb_build_object('fr', coalesce(ht_fr.name, ht.name), 'ar', coalesce(ht_ar.name, ht.name)),
          'away', jsonb_build_object('fr', coalesce(at_fr.name, at.name), 'ar', coalesce(at_ar.name, at.name)),
          'homeLastResults', (
            select coalesce(jsonb_agg(r order by r.kickoff_at desc), '[]'::jsonb) from (
              select p.kickoff_at, p.home_team_id = ht.id as played_home,
                     case when p.home_team_id = ht.id then p.home_score else p.away_score end as scored,
                     case when p.home_team_id = ht.id then p.away_score else p.home_score end as conceded,
                     coalesce(opp_fr.name, opp.name) as opponent
              from app.fixtures p
              join app.teams opp on opp.id = case when p.home_team_id = ht.id then p.away_team_id else p.home_team_id end
              left join app.team_translations opp_fr on opp_fr.team_id = opp.id and opp_fr.language = 'fr'
              where p.status = 'finished' and p.home_score is not null
                and ht.id in (p.home_team_id, p.away_team_id)
                and p.kickoff_at < f.kickoff_at
              order by p.kickoff_at desc limit 5
            ) r
          ),
          'awayLastResults', (
            select coalesce(jsonb_agg(r order by r.kickoff_at desc), '[]'::jsonb) from (
              select p.kickoff_at, p.home_team_id = at.id as played_home,
                     case when p.home_team_id = at.id then p.home_score else p.away_score end as scored,
                     case when p.home_team_id = at.id then p.away_score else p.home_score end as conceded,
                     coalesce(opp_fr.name, opp.name) as opponent
              from app.fixtures p
              join app.teams opp on opp.id = case when p.home_team_id = at.id then p.away_team_id else p.home_team_id end
              left join app.team_translations opp_fr on opp_fr.team_id = opp.id and opp_fr.language = 'fr'
              where p.status = 'finished' and p.home_score is not null
                and at.id in (p.home_team_id, p.away_team_id)
                and p.kickoff_at < f.kickoff_at
              order by p.kickoff_at desc limit 5
            ) r
          )
        )
      ) as job
      from app.fixtures f
      join app.teams ht on ht.id = f.home_team_id
      join app.teams at on at.id = f.away_team_id
      left join app.team_translations ht_fr on ht_fr.team_id = ht.id and ht_fr.language = 'fr'
      left join app.team_translations ht_ar on ht_ar.team_id = ht.id and ht_ar.language = 'ar'
      left join app.team_translations at_fr on at_fr.team_id = at.id and at_fr.language = 'fr'
      left join app.team_translations at_ar on at_ar.team_id = at.id and at_ar.language = 'ar'
      where f.competition_id = settings.competition_id
        and f.status in ('scheduled', 'not_started')
        and f.kickoff_at between statement_timestamp() + interval '2 hours'
                             and statement_timestamp() + interval '30 hours'
        and not exists (
          select 1 from app_private.ai_content_articles a
          where a.kind = 'match_preview' and a.fixture_id = f.id
        )
      order by f.kickoff_at
      limit model_budget
    ) previews
  ), '[]'::jsonb);

  -- Ingested news not yet used as a source: title, excerpt, original
  -- publisher and link. This is all the model sees of other outlets' work.
  select coalesce(jsonb_agg(item order by published_at desc), '[]'::jsonb) into news from (
    select e.published_at, jsonb_build_object(
      'editionId', e.id,
      'language', e.language,
      'title', e.title,
      'excerpt', e.summary,
      'sourceName', p.name,
      'sourceUrl', s.canonical_url,
      'publishedAt', e.published_at
    ) as item
    from app.article_editions e
    join app.stories s on s.id = e.story_id and s.deleted_at is null
    join app.publishers p on p.id = s.publisher_id
    where e.status = 'published' and e.visibility = 'public'
      and e.published_at > statement_timestamp() - interval '12 hours'
      and p.slug <> 'botolago-ai'
      and s.canonical_url is not null
      and not exists (
        select 1 from app_private.ai_content_articles a where e.id = any (a.source_edition_ids)
      )
    order by e.published_at desc
    limit 8
  ) fresh;

  if jsonb_array_length(news) >= 3 then
    jobs := jobs || jsonb_build_array(jsonb_build_object('kind', 'news_report', 'fixtureId', null, 'news', news));
  end if;

  -- A blog at most every three days, from the same news plus recent results.
  if not exists (
    select 1 from app_private.ai_content_articles
    where kind = 'blog' and created_at > statement_timestamp() - interval '3 days'
  ) and jsonb_array_length(news) >= 3 then
    select coalesce(jsonb_agg(r order by r.kickoff_at desc), '[]'::jsonb) into recent_results from (
      select f.kickoff_at,
             coalesce(ht_fr.name, ht.name) as home, coalesce(at_fr.name, at.name) as away,
             f.home_score, f.away_score
      from app.fixtures f
      join app.teams ht on ht.id = f.home_team_id
      join app.teams at on at.id = f.away_team_id
      left join app.team_translations ht_fr on ht_fr.team_id = ht.id and ht_fr.language = 'fr'
      left join app.team_translations at_fr on at_fr.team_id = at.id and at_fr.language = 'fr'
      where f.competition_id = settings.competition_id and f.status = 'finished' and f.home_score is not null
      order by f.kickoff_at desc limit 10
    ) r;
    jobs := jobs || jsonb_build_array(jsonb_build_object(
      'kind', 'blog', 'fixtureId', null, 'news', news, 'recentResults', recent_results
    ));
  end if;

  -- Never hand out more work than the daily cap leaves room for.
  return jsonb_build_object(
    'enabled', true,
    'remaining', remaining,
    'jobs', (select coalesce(jsonb_agg(j), '[]'::jsonb)
             from (select j from jsonb_array_elements(jobs) with ordinality as t(j, n)
                   order by n limit remaining) limited)
  );
end;
$$;

-- Stores BOTH language editions of one article as published, in this single
-- call, so either both are live or neither is: a failure on the second edition
-- rolls the first back with it. p_editions is a JSON array of exactly two
-- objects, one for 'fr' and one for 'ar', each with slug, title, summary,
-- bodyHtml and readingTimeMinutes.
create or replace function api.service_ai_content_publish(
  p_kind text,
  p_fixture_id uuid,
  p_editions jsonb,
  p_source_edition_ids uuid[],
  p_model text,
  p_sanitizer_version text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings app_private.ai_content_settings%rowtype;
  ai_publisher app.publishers%rowtype;
  target_story_id uuid;
  target_edition_id uuid;
  latest_taxonomy_id uuid;
  used integer;
  edition jsonb;
  edition_language text;
  edition_html text;
  edition_slug text;
  edition_title text;
  edition_summary text;
  edition_minutes integer;
  published_ids uuid[] := '{}';
begin
  if not app_private.is_service_request() then
    raise exception using errcode = '42501', message = 'ai_content_service_role_required';
  end if;
  if p_kind not in ('match_preview', 'match_recap', 'news_report', 'blog')
    or p_sanitizer_version <> 'ai-content-v1'
    or (p_kind in ('match_preview', 'match_recap')) <> (p_fixture_id is not null)
    or p_model is null or char_length(p_model) not between 1 and 100
    or p_editions is null or jsonb_typeof(p_editions) <> 'array'
    or jsonb_array_length(p_editions) <> 2
    or (select count(distinct e ->> 'language') from jsonb_array_elements(p_editions) e) <> 2
    or exists (
      select 1 from jsonb_array_elements(p_editions) e where (e ->> 'language') not in ('fr', 'ar')
    )
  then
    raise exception using errcode = '22023', message = 'ai_content_invalid_article';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai-content-publish', 0));

  select * into settings from app_private.ai_content_settings where id;
  if not settings.enabled then
    raise exception using errcode = '42501', message = 'ai_content_disabled';
  end if;
  if p_fixture_id is not null and not exists (
    select 1 from app.fixtures where id = p_fixture_id and competition_id = settings.competition_id
  ) then
    raise exception using errcode = 'P0002', message = 'ai_content_fixture_not_found';
  end if;

  select count(distinct story_id) into used
  from app_private.ai_content_articles
  where created_at > statement_timestamp() - interval '24 hours';
  if used >= settings.max_articles_per_day then
    raise exception using errcode = '53400', message = 'ai_content_daily_cap_reached';
  end if;

  select * into ai_publisher from app.publishers where slug = 'botolago-ai' and active;
  if not found then
    raise exception using errcode = 'P0002', message = 'ai_content_publisher_missing';
  end if;
  insert into app.stories (origin, original_language, publisher_id)
  values ('manual', 'fr', ai_publisher.id)
  returning id into target_story_id;

  select id into latest_taxonomy_id from app.taxonomies
  where taxonomy_type = 'category' and slug = 'latest' and active;
  if latest_taxonomy_id is not null then
    insert into app.story_taxonomies (story_id, taxonomy_id, is_primary)
    values (target_story_id, latest_taxonomy_id, true)
    on conflict (story_id, taxonomy_id) do nothing;
  end if;

  for edition in select e from jsonb_array_elements(p_editions) e loop
    edition_language := edition ->> 'language';
    edition_slug := edition ->> 'slug';
    edition_title := edition ->> 'title';
    edition_summary := edition ->> 'summary';
    edition_html := edition ->> 'bodyHtml';
    edition_minutes := (edition ->> 'readingTimeMinutes')::integer;
    if edition_slug is null or edition_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(edition_slug) > 160
      or edition_title is null or edition_title <> btrim(edition_title) or char_length(edition_title) not between 5 and 220
      or edition_summary is null or edition_summary <> btrim(edition_summary) or char_length(edition_summary) not between 10 and 1000
      or edition_minutes is null or edition_minutes not between 1 and 60
      or edition_html is null or char_length(edition_html) not between 200 and 20000
      or edition_html ~* '<[[:space:]]*(script|iframe|object|embed|style|form|input|button|textarea|select|meta|link|img)([[:space:]>])'
      or edition_html ~* 'on[a-z]+[[:space:]]*='
      or edition_html ~* '(javascript|data[[:space:]]*:[[:space:]]*text/html)[[:space:]]*:'
    then
      raise exception using errcode = '22023', message = 'ai_content_invalid_article';
    end if;

    insert into app.article_editions (
      story_id, language, slug, title, summary, body_format, body_source, body_html,
      status, visibility, published_at, reading_time_minutes, sanitizer_version
    ) values (
      target_story_id, edition_language::app.language_code, edition_slug, edition_title,
      edition_summary, 'rich_text', null, edition_html, 'published', 'public',
      statement_timestamp(), edition_minutes, p_sanitizer_version
    ) returning id into target_edition_id;

    insert into app_private.ai_content_articles (
      article_edition_id, story_id, kind, fixture_id, language, source_edition_ids, model
    ) values (
      target_edition_id, target_story_id, p_kind, p_fixture_id, edition_language::app.language_code,
      coalesce(p_source_edition_ids, '{}'), p_model
    );
    published_ids := published_ids || target_edition_id;
  end loop;

  return jsonb_build_object('storyId', target_story_id, 'articleIds', to_jsonb(published_ids));
exception when unique_violation then
  raise exception using errcode = '23505', message = 'ai_content_already_published';
end;
$$;

-- Articles the owner has not been emailed about yet (new, or a send failed).
create or replace function api.service_ai_content_pending_notices()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.is_service_request() then
    raise exception using errcode = '42501', message = 'ai_content_service_role_required';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'kind', a.kind, 'language', a.language, 'title', e.title,
      'slug', e.slug, 'publishedAt', e.published_at, 'model', a.model
    ) order by a.created_at)
    from (select * from app_private.ai_content_articles
          where owner_notified_at is null and notify_attempts < 5
          order by created_at limit 20) a
    join app.article_editions e on e.id = a.article_edition_id
  ), '[]'::jsonb);
end;
$$;

create or replace function api.service_ai_content_record_notice(p_ids uuid[], p_sent boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not app_private.is_service_request() then
    raise exception using errcode = '42501', message = 'ai_content_service_role_required';
  end if;
  if p_sent then
    update app_private.ai_content_articles set owner_notified_at = statement_timestamp()
    where id = any (p_ids) and owner_notified_at is null;
  else
    update app_private.ai_content_articles set notify_attempts = notify_attempts + 1
    where id = any (p_ids) and owner_notified_at is null;
  end if;
end;
$$;

revoke all on function api.service_ai_content_plan() from public, anon, authenticated;
revoke all on function api.service_ai_content_publish(
  text, uuid, jsonb, uuid[], text, text
) from public, anon, authenticated;
revoke all on function api.service_ai_content_pending_notices() from public, anon, authenticated;
revoke all on function api.service_ai_content_record_notice(uuid[], boolean) from public, anon, authenticated;
grant execute on function api.service_ai_content_plan() to service_role;
grant execute on function api.service_ai_content_publish(
  text, uuid, jsonb, uuid[], text, text
) to service_role;
grant execute on function api.service_ai_content_pending_notices() to service_role;
grant execute on function api.service_ai_content_record_notice(uuid[], boolean) to service_role;

-- The 30-minute wake-up. It also runs while the feature is off if an email is
-- still owed, so a pause never swallows a notice for an article already live.
create or replace function app_private.ai_content_tick()
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings app_private.ai_content_settings%rowtype;
  base_url text;
begin
  select * into settings from app_private.ai_content_settings where id;
  if not settings.enabled
    and not exists (select 1 from app_private.ai_content_articles where owner_notified_at is null and notify_attempts < 5)
  then
    return null;
  end if;
  select functions_base_url into base_url from app_private.notification_email_settings where id;
  return app_private.invoke_scheduled_function(base_url, 'ai-content-generate', '{}'::jsonb);
end;
$$;
revoke all on function app_private.ai_content_tick() from public, anon, authenticated, service_role;
grant execute on function app_private.ai_content_tick() to postgres;

select cron.schedule('ai-content-generate', '*/30 * * * *', 'select app_private.ai_content_tick();');
