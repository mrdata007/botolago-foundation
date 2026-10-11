-- Owner-authorized editorial correction, Production V2 only.
-- Published FR/AR editions keep their URLs, publication dates and visibility.
-- The normal editorial revision/search/public-content validation triggers run.
-- Explicit owner attribution in revisions and append-only editorial audit.
-- Facts: SofaScore event 17256971, read-only probe 38161912262:
-- home/away current 2/5, period1 1/3. No invented incidents or penalty shootout.
-- Static paragraph HTML checked with the existing sanitizeEditorialHtml.
-- Rehearse rollback, independently read revisions/editions, then commit.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
select app_private.hold_scheduled_jobs();
lock table app.article_editions,app.article_revisions in share row exclusive mode;
do $correction$
declare
  owner_user constant uuid := 'd4eaa24d-ab24-45c6-9bdd-f8b8bac3b731';
  edition app.article_editions%rowtype;
  item record;
  changed integer := 0;
begin
  if exists(select 1 from cron.job where active)
    or exists(select 1 from app_private.ai_home_story_settings where enabled)
    or exists(select 1 from app_private.ai_content_settings where enabled)
    or exists(select 1 from app_private.ai_home_story_jobs where status='generating')
    or exists(select 1 from net.http_request_queue)
  then raise exception 'stop: pause and drain editorial workers first'; end if;
  if not exists(select 1 from app_private.staff_principals where auth_user_id=owner_user and status='active')
  then raise exception 'stop: owner is not active staff'; end if;
  if md5((select prosrc from pg_proc where oid='app_private.capture_article_revision()'::regprocedure))
    is distinct from 'ef3d6c1573f3cefa0e0f29bf9ca1f9d9'
    or not exists(select 1 from pg_trigger where tgrelid='app.article_editions'::regclass
      and tgname='article_editions_capture_revision_before_update' and tgenabled='O')
  then raise exception 'stop: editorial revision path changed'; end if;
  if not exists(select 1 from app.fixtures where id='e1edd1a5-f5cd-4423-82ac-6c19ec33a66d'
    and home_team_id='1ebd788b-9f71-4a78-bfa8-68359d7f3a3f' and away_team_id='d5d8c59b-f7ab-4b30-9dfb-1d17a36bd0fc'
    and status='finished' and home_score=2 and away_score=5 and source_version like 'sofascore:17256971:%')
  then raise exception 'stop: verified result changed'; end if;
  if (select count(*) from app.article_editions where story_id='5ee173e7-589d-475f-8861-fb26d2d4b58d')<>2
  then raise exception 'stop: localized edition baseline changed'; end if;
  for item in select * from (values
    ('fb26d146-635b-4760-8450-c62cef49aedd'::uuid,'fr','1b63d2e71886579f62f0f02ed6bcf641',
      'Difaâ El Jadida s’impose 5-2 à Tiznit',
      'En déplacement à Tiznit pour la 3e journée, Difaâ El Jadida a gagné 5-2 après avoir mené 3-1 à la pause.',
      '<p>Difaâ El Jadida a remporté son déplacement sur le terrain d’Amal Tiznit, samedi 10 octobre 2026, sur le score de 5-2. Cette rencontre de la 3e journée de Botola a produit sept buts.</p><p>Les visiteurs menaient déjà 3-1 à la mi-temps. Après la pause, Difaâ El Jadida a inscrit deux nouveaux buts et Amal Tiznit en a ajouté un, portant le résultat final à 5-2.</p><p>Amal Tiznit termine donc la rencontre avec deux buts, contre cinq pour Difaâ El Jadida, vainqueur à l’extérieur. Source des scores : SofaScore.</p>'),
    ('e6757c2d-19ab-4d13-8382-bcdd6828d9c1'::uuid,'ar','22557876a48a1f6dc58deec19dea3289',
      'الدفاع الحسني الجديدي يفوز على أمل تيزنيت بخمسة أهداف مقابل هدفين',
      'فاز الدفاع الحسني الجديدي خارج أرضه على أمل تيزنيت بخمسة أهداف مقابل هدفين في الجولة الثالثة، بعدما تقدم بثلاثة أهداف مقابل هدف واحد عند الاستراحة.',
      '<p>فاز الدفاع الحسني الجديدي على مضيفه أمل تيزنيت بخمسة أهداف مقابل هدفين، يوم السبت 10 أكتوبر 2026، ضمن الجولة الثالثة من البطولة. وشهدت المباراة تسجيل سبعة أهداف.</p><p>أنهى الفريق الضيف الشوط الأول متقدماً بثلاثة أهداف مقابل هدف واحد. وفي الشوط الثاني، أضاف الدفاع الحسني الجديدي هدفين، بينما سجل أمل تيزنيت هدفاً واحداً، لتصبح النتيجة النهائية خمسة أهداف مقابل هدفين.</p><p>واختتم أمل تيزنيت اللقاء برصيد هدفين، مقابل خمسة أهداف للدفاع الحسني الجديدي الذي عاد بالفوز خارج أرضه. مصدر النتائج: SofaScore.</p>')
  ) v(id,language,body_md5,title,summary,body)
  loop
    select * into strict edition from app.article_editions where id=item.id for update;
    if edition.story_id<>'5ee173e7-589d-475f-8861-fb26d2d4b58d' or edition.language<>item.language
      or edition.status<>'published' or edition.visibility<>'public'
      or edition.updated_at<>'2026-10-11T08:00:14.558654+00:00'::timestamptz
      or md5(edition.body_html)<>item.body_md5
      or exists(select 1 from app.article_revisions where article_edition_id=edition.id)
    then raise exception 'stop: reviewed article baseline changed (%)',item.language; end if;
    update app.article_editions set title=item.title,summary=item.summary,
      body_html=item.body,body_source=null,reading_time_minutes=1,
      sanitizer_version='sanitize-html@2.17.5',updated_by=owner_user where id=edition.id;
    -- Same editorial audit event as the editor, attributed explicitly to owner
    -- for this reviewed SQL operation; no fabricated signed-in/MFA session.
    insert into app_private.editorial_audit_events(event_type,actor_user_id,story_id,article_edition_id,metadata)
      values('article_content_updated',owner_user,edition.story_id,edition.id,
        jsonb_build_object('previousUpdatedAt',edition.updated_at,'reason','Verified halftime score; remove unsupported shootout text.',
          'sourceProvider','sofascore','sourceEvent','17256971','probeRun',38161912262));
    if (select count(*) from app.article_revisions where article_edition_id=edition.id
        and body_html=edition.body_html and title=edition.title and changed_by=owner_user)<>1
      or not exists(select 1 from app.article_editions where id=edition.id and status=edition.status
        and visibility=edition.visibility and slug=edition.slug and published_at=edition.published_at)
    then raise exception 'stop: editorial history/publication verification failed (%)',item.language; end if;
    changed:=changed+1;
  end loop;
  if changed<>2 then raise exception 'stop: must correct exactly FR and AR'; end if;
end;
$correction$;
rollback;
