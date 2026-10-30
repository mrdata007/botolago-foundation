-- BotolaGO Production V2
-- Club news email, migration 2 of 2 (docs/backend/CLUB_NEWS_EMAIL.md).
--
-- Once a day at 19:00 Morocco time, every reader whose favourite club was
-- written about in the last 24 hours gets one email listing those articles.
-- No article, no email. It joins the existing leased, quota-aware email
-- pipeline (20260924140100 and later) as one more moment, so every existing
-- guard keeps applying: test/live mode, activation date, daily and monthly
-- quota, unsubscribe token, 23-hour idempotency window, dead letters.
--
-- Who gets it: email notifications on, a confirmed address, the News switch
-- (app.user_preferences.breaking_news, on by default and already on the
-- Profile screen) on, and a favourite club. Re-checked at send time: a reader
-- who switches News off or changes favourite club before the email leaves
-- gets nothing.
--
-- Ships off: 'club_news_digest' is allowed in enabled_types but not added to
-- it. Switching it on is one production write (see the doc).
--
-- Nothing here writes rows except the two in-app templates.

-- ---------------------------------------------------------------------------
-- 1. The type may be switched on
-- ---------------------------------------------------------------------------
alter table app_private.notification_email_settings
  drop constraint notification_email_enabled_types_check;
alter table app_private.notification_email_settings
  add constraint notification_email_enabled_types_check check (enabled_types <@ array[
    'matchday_preview', 'matchday_results', 'round_preview', 'match_starting', 'deadline_24h',
    'gameweek_finalized', 'pepites_weekly', 'gameweek_opened', 'club_news_digest'
  ]::text[]);

-- ---------------------------------------------------------------------------
-- 2. In-app templates (the fan-out stores the in-app notification that
--    carries each email, and needs an active in_app template per language)
-- ---------------------------------------------------------------------------
insert into app.notification_templates (
  template_key, notification_type, category, channel, language, version,
  title_template, body_template, required_variables, max_title_length,
  max_body_length, active, activated_at
) values
  ('club_news_digest', 'club_news_digest', 'news', 'in_app', 'fr', 1,
    'Les actus du jour : {{club}}',
    'Les derniers articles sur votre club.',
    array['club'], 120, 300, true, statement_timestamp()),
  ('club_news_digest', 'club_news_digest', 'news', 'in_app', 'ar', 1,
    'أخبار اليوم: {{club}}',
    'آخر المقالات عن فريقك.',
    array['club'], 120, 300, true, statement_timestamp());

-- ---------------------------------------------------------------------------
-- 3. Payload: the club's articles first made public inside the window
-- ---------------------------------------------------------------------------
-- A story counts once, at the moment its first public edition went out, so a
-- translation published the next day does not send the article again. At
-- most 8 articles are listed (Gmail clips an email past 102 KB); `total`
-- says how many there were. Only French and Arabic editions, only
-- visibility 'public', only what app_private.news_is_public allows.
create function app_private.notification_email_club_news_payload(
  p_team_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = ''
-- Timestamps are rendered as text inside the JSON and follow the session's
-- time zone; pinned so pg_cron and the SQL editor build the same payload.
set timezone = 'UTC'
as $$
  with public_edition as (
    select edition.*
    from app.story_teams relation
    join app.article_editions edition on edition.story_id = relation.story_id
    where relation.team_id = p_team_id
      and edition.language in ('fr', 'ar')
      and edition.visibility = 'public'
      and app_private.news_is_public(edition)
  ),
  story as (
    select public_edition.story_id, min(public_edition.published_at) as published_at
    from public_edition
    group by public_edition.story_id
    having min(public_edition.published_at) > p_from
      and min(public_edition.published_at) <= p_to
  ),
  listed as (
    select story.* from story
    order by story.published_at desc, story.story_id
    limit 8
  ),
  editions as (
    select public_edition.story_id, jsonb_object_agg(public_edition.language::text, jsonb_build_object(
      'id', public_edition.id,
      'title', public_edition.title,
      'summary', left(public_edition.summary, 320),
      'readingMinutes', public_edition.reading_time_minutes,
      'image', case when asset.id is not null then jsonb_build_object(
        'storagePath', asset.storage_path, 'sourceUrl', asset.source_url) end
    )) as value
    from public_edition
    join listed on listed.story_id = public_edition.story_id
    left join app.media_assets asset on asset.id = public_edition.hero_asset_id
    group by public_edition.story_id
  )
  select jsonb_build_object(
    'total', (select count(*) from story),
    'articles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'storyId', listed.story_id,
        'publishedAt', listed.published_at,
        'editions', editions.value
      ) order by listed.published_at desc, listed.story_id)
      from listed join editions on editions.story_id = listed.story_id
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Planner: one moment per club per Morocco day, from 19:00
-- ---------------------------------------------------------------------------
-- The window is yesterday 19:00 to today 19:00 Morocco time, so consecutive
-- days neither overlap nor leave a gap. Planned between 19:00 and 22:00; a
-- club with no reader who chose it as favourite is skipped.
create function app_private.notification_email_plan_club_news(p_now timestamptz)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  local_now timestamp := app_private.morocco_local(p_now);
  today date := app_private.morocco_local(p_now)::date;
  window_start timestamptz;
  window_end timestamptz;
  activation timestamptz;
  club record;
  dedup text;
  payload jsonb;
  planned integer := 0;
begin
  if not app_private.notification_email_type_enabled('club_news_digest') then
    return 0;
  end if;
  select settings.activated_at into activation
  from app_private.notification_email_settings settings
  where settings.id and settings.mode in ('test', 'live');
  if activation is null then
    return 0;
  end if;
  if local_now < today + time '19:00' or local_now >= today + time '22:00' then
    return 0;
  end if;

  window_end := app_private.zone_instant(today + time '19:00', 'Africa/Casablanca');
  window_start := app_private.zone_instant((today - 1) + time '19:00', 'Africa/Casablanca');

  for club in
    select distinct relation.team_id
    from app.article_editions edition
    join app.story_teams relation on relation.story_id = edition.story_id
    where edition.published_at > window_start
      and edition.published_at <= window_end
      and exists (
        select 1 from app.user_preferences preference
        where preference.favorite_team_id = relation.team_id
      )
  loop
    dedup := 'email:club_news_digest:' || today::text || ':' || club.team_id::text;
    continue when exists (
      select 1 from app_private.notification_events event where event.deduplication_key = dedup
    );
    payload := app_private.notification_email_club_news_payload(club.team_id, window_start, window_end);
    continue when coalesce((payload ->> 'total')::integer, 0) = 0;
    if app_private.notification_email_enqueue(
      'club_news_digest', 'news', club.team_id, dedup,
      jsonb_build_object(
        'date', today::text,
        'team', app_private.notification_email_team_json(club.team_id) || jsonb_build_object(
          'crest', (
            select jsonb_build_object('storagePath', asset.storage_path, 'sourceUrl', asset.source_url)
            from app.teams team
            join app.media_assets asset on asset.id = team.crest_asset_id
            where team.id = club.team_id
          )
        )
      ) || payload,
      p_now
    ) then
      planned := planned + 1;
    end if;
  end loop;
  return planned;
end;
$$;

revoke all on function app_private.notification_email_club_news_payload(uuid, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function app_private.notification_email_plan_club_news(timestamptz)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Pinned edits to the live pipeline
-- ---------------------------------------------------------------------------
-- Same technique as 20261019111217: read each function's current source,
-- replace exact anchors, re-create it. Each anchor must occur exactly once,
-- or the migration stops before changing anything.
create function pg_temp.club_news_patch(p_source text, p_old text, p_new text)
returns text
language plpgsql
as $$
declare
  occurrences integer;
begin
  occurrences := (length(p_source) - length(replace(p_source, p_old, ''))) / length(p_old);
  if occurrences <> 1 then
    raise exception 'club_news_email_anchor_count_%: %', occurrences, left(p_old, 80);
  end if;
  return replace(p_source, p_old, p_new);
end;
$$;

-- Staleness: a digest not sent within 4 hours (by 23:00 at the latest) is
-- cancelled, never sent at night or the next day.
do $rewrite$
declare source text;
begin
  source := pg_get_functiondef(
    'app_private.notification_email_event_is_stale(app_private.notification_events,timestamptz)'::regprocedure);
  source := pg_temp.club_news_patch(source,
    $old$ when 'pepites_weekly'then p_event.occurred_at<p_now-interval '36 hours'$old$,
    $new$ when 'pepites_weekly'then p_event.occurred_at<p_now-interval '36 hours'
 when 'club_news_digest'then p_event.occurred_at<p_now-interval '4 hours'$new$);
  execute source;
end $rewrite$;

-- Fan-out: the audience is the club's fans with News on; the in-app title
-- names the club in the reader's language.
do $rewrite$
declare source text;
begin
  source := pg_get_functiondef(
    'app_private.notification_email_fanout(timestamptz,text,uuid[],timestamptz,integer)'::regprocedure);
  source := pg_temp.club_news_patch(source,
    $old$'pepites_weekly', 'gameweek_opened'$old$,
    $new$'pepites_weekly', 'gameweek_opened', 'club_news_digest'$new$);
  source := pg_temp.club_news_patch(source,
    $old$when 'pepites_weekly' then preference.pepites_weekly_email and pepites_allowed$old$,
    $new$when 'club_news_digest' then preference.breaking_news
            and preference.favorite_team_id = target.source_entity_id
          when 'pepites_weekly' then preference.pepites_weekly_email and pepites_allowed$new$);
  source := pg_temp.club_news_patch(source,
    $old$when 'pepites_weekly' then jsonb_build_object('week', target.safe_payload ->> 'week')$old$,
    $new$when 'club_news_digest' then jsonb_build_object('club', coalesce(
            nullif(target.safe_payload -> 'team' -> 'shortName' ->> audience.language::text, ''),
            nullif(target.safe_payload -> 'team' -> 'name' ->> audience.language::text, ''),
            'BotolaGO'))
          when 'pepites_weekly' then jsonb_build_object('week', target.safe_payload ->> 'week')$new$);
  execute source;
end $rewrite$;

-- Claim: cancelled, never sent, when the reader switched News off or changed
-- favourite club since it was queued; sent after the time-critical mail and
-- before Pépites when the quota is short.
do $rewrite$
declare source text;
begin
  source := pg_get_functiondef('api.service_claim_email_deliveries(integer,integer)'::regprocedure);
  source := pg_temp.club_news_patch(source,
    $old$      or app_private.notification_email_event_is_stale(event, statement_timestamp())$old$,
    $new$      or (notification.notification_type = 'club_news_digest' and (not preference.breaking_news
        or preference.favorite_team_id is distinct from notification.source_entity_id))
      or app_private.notification_email_event_is_stale(event, statement_timestamp())$new$);
  source := pg_temp.club_news_patch(source,
    $old$        when 'pepites_weekly' then 8$old$,
    $new$        when 'club_news_digest' then 7
        when 'pepites_weekly' then 8$new$);
  execute source;
end $rewrite$;

-- Tick: plan the digests alongside the other moments.
do $rewrite$
declare source text;
begin
  source := pg_get_functiondef('app_private.notification_email_tick()'::regprocedure);
  source := pg_temp.club_news_patch(source,
    $old$jsonb_build_object('managerOpenings',app_private.notification_email_plan_openings(run_started))$old$,
    $new$jsonb_build_object('managerOpenings',app_private.notification_email_plan_openings(run_started))
      || jsonb_build_object('clubNews', app_private.notification_email_plan_club_news(run_started))$new$);
  execute source;
end $rewrite$;

drop function pg_temp.club_news_patch(text, text, text);
