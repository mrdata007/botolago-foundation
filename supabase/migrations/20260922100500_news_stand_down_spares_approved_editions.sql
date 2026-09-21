-- News engine: keep the operator stand-down sweep off editor-approved articles.
--
-- PR #154 (BG-0073) adds app_private.news_stand_down_machine_editions(), a
-- re-runnable sweep that unpublishes every published edition with
-- `created_by is null`. That predicate was written for the legacy provider
-- link-stubs, which are the only machine editions that existed at the time.
--
-- The news engine writes editions the same way: app.article_editions.created_by
-- is a foreign key to auth.users, and no real person creates an engine article,
-- so the engine leaves it null. An engine article therefore matches the sweep
-- exactly — including after a human editor has read it and clicked publish.
-- Re-running the sweep once would silently unpublish the whole newsroom.
--
-- The distinction that matters is not who created the row but whether a person
-- has acted on it. api.editorial_transition_article stamps
-- `updated_by = auth.uid()` on every transition, so an edition an editor
-- approved carries their id and a never-reviewed machine stub does not. Adding
-- `and updated_by is null` narrows the sweep to exactly that, which is what its
-- own comment already promises: "never touches human-authored editions".
--
-- This is not a behaviour change for the rows the sweep was built for. On
-- production all 108 published editions with `created_by is null` also have
-- `updated_by is null`, so the sweep still catches every one of them.
--
-- The patch is guarded because the function it amends arrives with PR #154,
-- which merges before this branch. Applied on its own the guard is a no-op, so
-- this migration never conjures a function that does not otherwise exist.

do $do$
begin
  if to_regprocedure('app_private.news_stand_down_machine_editions()') is null then
    raise notice
      'news engine: stand-down sweep not present, nothing to narrow (expected before PR #154 merges)';
    return;
  end if;

  execute $fn$
    create or replace function app_private.news_stand_down_machine_editions()
    returns integer
    language plpgsql
    security definer
    set search_path = ''
    as $body$
    declare
      stood_down integer := 0;
      edition record;
    begin
      for edition in
        with moved as (
          update app.article_editions
          set status = 'unpublished',
              visibility = 'private',
              unpublished_at = statement_timestamp()
          where status = 'published'
            and created_by is null
            and updated_by is null
          returning id, story_id
        )
        select moved.id, moved.story_id from moved
      loop
        perform app_private.write_editorial_audit(
          'article_status_changed',
          edition.story_id,
          edition.id,
          jsonb_build_object(
            'from', 'published',
            'to', 'unpublished',
            'reason', 'news_stand_down',
            'change', 'bg_0073_news_stand_down',
            'initiated_by', 'operator',
            'actor', 'system'
          )
        );
        stood_down := stood_down + 1;
      end loop;
      return stood_down;
    end;
    $body$;
  $fn$;

  execute $rev$
    revoke all on function app_private.news_stand_down_machine_editions()
      from public, anon, authenticated, service_role
  $rev$;

  execute $cmt$
    comment on function app_private.news_stand_down_machine_editions() is
      'BG-0073 operator stand-down: moves never-reviewed machine editions (created_by and updated_by both null) from published to unpublished/private and writes one editorial audit row each. Idempotent, never touches human-authored or editor-approved editions, deletes nothing.'
  $cmt$;
end;
$do$;
