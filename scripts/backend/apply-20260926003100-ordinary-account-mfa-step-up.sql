-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20260926003100_ordinary_account_mfa_step_up: an ordinary
-- account that turned MFA on must hold an aal2 session to read or change its
-- own data -- every api.* read and write of it, the four account views, the
-- saved mark on the public News card, its own choices in the public match
-- votes, and its avatar image in Storage (audit 2026-09-25 A03 / DB-07).
-- Refusal: SQLSTATE PT403, message 'mfa_required' (Storage: no object found,
-- upload refused; the match votes: their totals without its own choices).
--
-- WHEN
--   Any time after the pull request that adds this file is merged, but not
--   while a Fantasy season orchestrator run is going on (GitHub -> Actions: it
--   is scheduled at minute 12, and GitHub starts it late, at any minute), and
--   outside match hours if you can, since live scores pause for the few
--   minutes this takes (HOW TO RUN, step 2). It needs the match votes
--   (20260925234000, on production since 2026-09-25): it adds four functions
--   and 25 statement triggers, and replaces 55 functions (the 52 api.*
--   functions that read or write the caller's own account, the public match
--   votes api.match_votes, the e-mail unsubscribe link
--   api.unsubscribe_notification_email, and the News card
--   app_private.news_article_card), the four api.my_* account views and the
--   avatars bucket's four policies on storage.objects.
--
--   Adding a trigger holds writes to its table until the transaction ends,
--   so the script takes all 25 tables together first: account, notification,
--   Fantasy and Pronostics tables. The site keeps reading while it runs; a
--   visitor's save waits for its second or so. Replacing a view or a policy
--   locks it from then until the end, and the migration does that last: for
--   the final second or so, profile reads (api.my_profile and the other three
--   views) and every Storage request -- avatars, and the public news and club
--   images -- wait, then carry on. Three pg_cron jobs write to the 25 tables
--   -- the Fantasy lifecycle tick (app.fantasy_lineups), the email tick
--   (app.notifications) and Pronostics scoring (app.predictions) -- so
--   AGENTS.md ("Check the scheduled jobs too") has them paused first, with the
--   live score refresh, which AGENTS.md pauses together with email. The script
--   refuses to run while any of them is on. The other jobs (news publication,
--   the sitemap refresh, the ops alert tick and the nightly history prunes)
--   write none of these tables and stay on. If a write or a Storage request
--   is already under way, the script stops within 5 seconds and saves
--   nothing: run it again a minute later.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Make sure no other database work is running right now.
--   2. Pause the jobs, as AGENTS.md asks. First note how they stand, to put
--      them back exactly as they were (production on 2026-09-25 at 14:34 UTC:
--      tick on, email off, live scores on, Pronostics off with scoring on):
--        select f.lifecycle_tick_enabled as fantasy_tick, e.mode as email_mode,
--          e.football_live_refresh_enabled as live_scores,
--          p.mode as pronostics_mode, p.scoring_enabled as pronostics_scoring
--        from app_private.fantasy_automation_settings f,
--          app_private.notification_email_settings e, app_private.prediction_settings p;
--      Then:
--        a. the Fantasy lifecycle tick (fantasy automation):
--             select app_private.fantasy_automation_configure(false);
--        b. email and the live score refresh, the two email/results jobs:
--             select app_private.notification_email_configure('off', null, null, false);
--        c. Pronostics scoring, only if Pronostics is not off (while its mode
--           is off the job writes nothing, and the script accepts it):
--             select app_private.predictions_configure((select mode from app_private.prediction_settings), false);
--   3. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one
--      transaction, checked, and then ROLLED BACK. The result row should say
--      "Rehearsal passed".
--   4. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied".
--   5. Whatever the result, put back what step 2 noted:
--        a. if the tick was on:
--             select app_private.fantasy_automation_configure(true);
--        b. email and live scores as they were, here email_mode and
--           live_scores from step 2 (on 2026-09-25: 'off' and true):
--             select app_private.notification_email_configure('<email_mode>', null, null, <live_scores>);
--        c. if step 2c paused Pronostics scoring:
--             select app_private.predictions_configure((select mode from app_private.prediction_settings), true);
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, before 20260925234000 (match votes), while the
--     Fantasy tick, email, the live score refresh or Pronostics scoring is on,
--     on a database missing a table it guards or reads, where the step-up
--     already exists, or where anything it replaces is not the version
--     production held on 2026-09-25 (md5 read there: of pg_get_functiondef for
--     the three functions of the first version of this script, for the News
--     card and for the two match-vote functions, api.cast_match_vote and
--     api.match_votes, as 20260925234000 installed them; of
--     pg_get_functiondef without its blank and comment-only lines for the 49
--     other functions that gain the step-up, since production's copies of four
--     of them were applied without their comments; of pg_get_viewdef for the
--     views; of the policy expressions for the avatar policies);
--   * takes the 25 tables it adds triggers to (see WHEN);
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result without writing anything: the four helpers exist, the
--     two of the first version with no API role able to call them, the two
--     new ones callable by authenticated only; all 25 triggers exist, fire per
--     statement and are enabled; the replaced functions carry the step-up and
--     keep their grants; each of the 49 and api.cast_match_vote is its
--     checked version plus the step-up as the first statement of its body and
--     nothing else, api.match_votes its checked version plus the step-up on
--     the caller's own choices and nothing else, the News card, the views and
--     the avatar policies their checked version plus the step-up and nothing
--     else, the views still security_invoker and readable by authenticated
--     alone; no api function a browser can call reads the caller without the
--     step-up, apart from the staff RPCs, by name, and the three exceptions
--     the migration names, and every api view a signed-in session can read
--     carries it, with no other api relation readable but the public live
--     scores (the completeness checks of
--     ordinary_account_mfa_step_up_reads.test.sql, word for word, run on this
--     database's own catalog, so a reader this database has and the
--     repository does not stops the update); an account with no factor
--     passes; and, where an account has a verified factor, its aal1 session is
--     refused by the helper, a table trigger (an UPDATE that matches no row),
--     a read (api.get_my_notification_preferences), a view (api.my_profile)
--     and a match vote (api.cast_match_vote on a match that does not exist,
--     refused before it looks), and is not "satisfied" for Storage, while aal2
--     passes all of them but the vote, which it does not cast. That account's
--     id and data stay inside the script and are not printed.
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
  drifted text[] := '{}';
  object_name text;
  -- What this update replaces, as production held it on 2026-09-25 (read
  -- there). The 49 functions that gain the step-up: the md5 of
  -- pg_get_functiondef without its blank and comment-only lines (production's
  -- copies of api.fantasy_leagues, fantasy_league_standings,
  -- fantasy_overall_standings and get_my_fantasy_points were applied without
  -- their comments, which is all that differs from the repository). The News
  -- card: the md5 of pg_get_functiondef. The two match-vote functions: the
  -- md5 of pg_get_functiondef as 20260925234000 installed them (read on
  -- production after that migration, and the same after a local reset). The
  -- views: of pg_get_viewdef(v, true). The avatar policies: of their USING and
  -- WITH CHECK, joined by '|'.
  replaced constant jsonb := $replaced${
    "functions": {
      "api.activate_fantasy_chip(uuid,uuid,app.fantasy_chip_type,bigint,uuid)": "0e58bc5f6b90b88484f5ee2982ba01fa",
      "api.archive_fantasy_league(uuid,uuid)": "753870c6ef9457ab739a3e488f2a53d3",
      "api.cancel_fantasy_chip(uuid,uuid,bigint)": "701e6293eea05a5b39e3a5264817d763",
      "api.claim_guest_predictions(jsonb)": "4e0490681cc873963579354cb3149bd6",
      "api.complete_onboarding(text,text,text,app.language_code,uuid,text,boolean,boolean,boolean)": "6e6d269373219ab15bb97618fba697d6",
      "api.confirm_fantasy_transfers(uuid,uuid,jsonb,bigint,uuid,app.fantasy_chip_type)": "538b39cd5a3f614425b60e0d33f94f15",
      "api.create_fantasy_league(uuid,uuid,text,app.fantasy_league_visibility,uuid)": "d32f1d892816ce41d28816674d15eef7",
      "api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)": "346ac6c40722a43ea148c20290bb6796",
      "api.create_prediction_league(text)": "76b93ee31718c54253a4c0c6ad908062",
      "api.disable_my_notification_device(uuid)": "9998768ff572f271386336e818137ba4",
      "api.dismiss_my_notification(uuid,boolean)": "654d33f08102f94a42bd4bdfe7bbc078",
      "api.fantasy_hub(text)": "26993a1b6e38ad323f115f468ae41dd4",
      "api.fantasy_league_standings(uuid,uuid,bigint,uuid,integer)": "591d0d13db821f883df004ed2273e68b",
      "api.fantasy_leagues(uuid,text,integer)": "71408df65ce276750300e3139922c423",
      "api.fantasy_overall_standings(uuid,uuid,bigint,uuid,integer)": "720315a187b0049812e5668af0afc4ad",
      "api.follow_competition(uuid)": "a5b9ccdce8736ed8a84d2aa8243e24e6",
      "api.follow_team(uuid)": "dbe9dee3e39475ef5877bf341353ec43",
      "api.get_my_account_standing()": "a9ae1a76b32ccc47eb1c688eca5e12bb",
      "api.get_my_fantasy_history(uuid,integer,integer)": "16d92f6d2d691234f3a467974b5df139",
      "api.get_my_fantasy_points(uuid,uuid)": "2bb7aebfc73b3ac23d8f5372a5a23c31",
      "api.get_my_fantasy_team(uuid)": "ed30f5747267514242a7ca3358c8b8e5",
      "api.get_my_notification_preferences()": "34b11ba2d0a38fd6b7dd8d3d5f23b699",
      "api.join_fantasy_league(uuid,text,uuid)": "135f5fe9fa0db8d143d77ce6795fe621",
      "api.join_prediction_league(text)": "10a93d0622be7d6cfac808f4b7c172ca",
      "api.leave_fantasy_league(uuid,uuid)": "19365eefc2c7da797394542568df2351",
      "api.leave_prediction_league(uuid)": "9d7bc8744e5edd5c86996c2a122532fc",
      "api.list_my_notification_devices()": "395dd6eca5db441a0ba806c1deac4397",
      "api.list_my_notifications(app.notification_category,timestamp with time zone,uuid,integer)": "5c13de633c6108016a5de07100d72f5d",
      "api.mark_all_my_notifications_read(app.notification_category)": "aee5f2a2bf1cedebccd99014b15660c6",
      "api.mark_my_notification_read(uuid,boolean)": "7d2df6f94684f8ad7e5faf23d502c073",
      "api.my_notification_unread_count(app.notification_category)": "90202a869476dbab60e06d35884aab6f",
      "api.my_prediction_leagues()": "d9f275a614a7ccee14a375ef3f4ccd50",
      "api.my_predictions(integer,uuid)": "854ded689b46d32cf3fb00015ff164c3",
      "api.news_saved_articles(integer,timestamp with time zone,uuid)": "fc06843f883fde2400bcc9d40069a05d",
      "api.predictions_leaderboard(text,integer,integer,uuid,integer)": "1b1a0430454d66f8b356b4c662d9ab6f",
      "api.predictions_league_standings(uuid,integer)": "072563541a8bb99f3ed0bd328c308a48",
      "api.preview_fantasy_transfers(uuid,uuid,jsonb,bigint,app.fantasy_chip_type)": "fab4b84caa302c35847d9599f6bd9a62",
      "api.register_my_notification_device(text,app.notification_device_platform,app.notification_push_provider,text,app.language_code,text,text)": "fd9804d035ae4c12831b6efa7083d60e",
      "api.reset_prediction_league_invite_code(uuid)": "eb3b23b34191ef933e75d3180f3c7e79",
      "api.save_article(uuid)": "62d4dc238dcbf7cc087193e69a97deea",
      "api.save_fantasy_lineup(uuid,uuid,jsonb,bigint,uuid)": "97652e23dcd4d67d36b0733fa385df5e",
      "api.save_predictions(jsonb)": "d0006aca71d2ae1372437e42230ca30e",
      "api.set_my_notification_subscription(app.notification_subscription_kind,uuid,boolean)": "3a070410756b8631715ed4371fa55771",
      "api.unfollow_competition(uuid)": "dd1cbb27b74fc318114ca60b78d76a96",
      "api.unfollow_team(uuid)": "0223057c59f203e5738fe1b189634198",
      "api.unregister_my_notification_device(uuid)": "6088f0bd2ccd972e075337595df1b9b5",
      "api.unsave_article(uuid)": "5436d58560d7414c830c88a7eff165b9",
      "api.update_my_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,boolean,time without time zone,time without time zone,app.notification_digest_mode,integer)": "885dc78659d9126b6cdb0aba17de62c9",
      "api.update_my_preferences(boolean,boolean,boolean,app.language_code)": "6eff4c57fd35bc9db58cf769487291e0"
    },
    "news_card": "4c70fa9b175f5deae69a65d002003adc",
    "match_votes": {
      "api.cast_match_vote(uuid,text,text)": "7c92af729c8b2867049b72034270a053",
      "api.match_votes(uuid)": "0a809ec4cdec458fb0b2a584673098d7"
    },
    "views": {
      "api.my_account_deletion_requests": "830c2ddb2b2e2a89db30fc11874aec36",
      "api.my_followed_competitions": "c70d90a408f4110bef4ca648c13310f2",
      "api.my_followed_teams": "b8cff9cf1607d280f0f4c2f9d533e9e6",
      "api.my_profile": "cce05405859c2a092f00b158006ca8a4"
    },
    "policies": {
      "avatars_delete_own_authenticated": "8b5b1a132f0e6c0231074c9abe88552a",
      "avatars_insert_own_authenticated": "a9c542b9521253962f2ba321fc95577c",
      "avatars_select_own_authenticated": "8b5b1a132f0e6c0231074c9abe88552a",
      "avatars_update_own_authenticated": "fba1bd86f237424fa19f8fc5e395ed65"
    }
  }$replaced$;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20260926003100') then
    raise exception 'stop: migration 20260926003100 is already recorded as applied';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260925234000') then
    raise exception 'stop: migration 20260925234000 (match votes) is not applied -- this update replaces its two functions and guards its table, so apply scripts/backend/apply-20260925234000-match-votes.sql first';
  end if;
  if to_regprocedure('app_private.assert_mfa_step_up()') is not null
    or to_regprocedure('app_private.refuse_unverified_mfa_actor()') is not null
    or to_regprocedure('app_private.require_mfa_step_up()') is not null
    or to_regprocedure('app_private.mfa_step_up_satisfied()') is not null
    or exists (select 1 from pg_catalog.pg_trigger t
      where t.tgname like '%\_refuse\_unverified\_mfa\_actor' and not t.tgisinternal) then
    raise exception 'stop: the MFA step-up already exists, but the migration is not recorded -- find out why before going on';
  end if;

  foreach object_name in array array[
    'app.profiles', 'app.user_preferences', 'app.followed_teams', 'app.followed_competitions',
    'app.account_deletion_requests', 'app.saved_articles', 'app.notifications',
    'app.notification_subscriptions', 'app.device_registrations', 'app_private.push_destinations',
    'app.fantasy_teams', 'app.fantasy_squad_memberships', 'app.fantasy_lineups',
    'app.fantasy_lineup_players', 'app.fantasy_transfer_batches', 'app.fantasy_transfers',
    'app.fantasy_chip_uses', 'app.fantasy_free_hit_snapshots', 'app.fantasy_free_hit_snapshot_players',
    'app.fantasy_leagues', 'app.fantasy_league_memberships', 'app.predictions',
    'app.prediction_league_members', 'app_private.prediction_guest_claims', 'app.match_votes',
    'app_private.notification_email_unsubscribe_tokens', 'app.notification_deliveries',
    'auth.mfa_factors', 'auth.mfa_factors_user_id_idx',
    'app_private.fantasy_automation_settings', 'app_private.notification_email_settings',
    'app_private.prediction_settings', 'storage.objects'
  ] loop
    if to_regclass(object_name) is null then
      missing := missing || object_name;
    end if;
  end loop;
  if to_regprocedure('app_private.assert_security_rate_limit(uuid,app_private.security_audit_event,integer,interval)') is null
    or to_regprocedure('app_private.write_notification_audit(text,uuid,uuid,uuid,uuid,jsonb)') is null then
    missing := missing || 'app_private.assert_security_rate_limit / write_notification_audit'::text;
  end if;
  if to_regprocedure('storage.foldername(text)') is null then
    missing := missing || 'storage.foldername(text)'::text;
  end if;
  if cardinality(missing) > 0 then
    raise exception 'stop: the database is missing what this update builds on: %', missing;
  end if;

  -- AGENTS.md: a write that touches Fantasy runs with the Fantasy lifecycle
  -- tick paused, one that touches notifications with email (and with it the
  -- live score refresh) off, and one that touches Pronostics with its scoring
  -- paused. This one locks tables of all three and adds triggers to them.
  if exists (select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled) then
    raise exception 'stop: the Fantasy lifecycle tick is on -- pause it first with select app_private.fantasy_automation_configure(false); and switch it back on afterwards';
  end if;
  if exists (select 1 from app_private.notification_email_settings where mode <> 'off') then
    raise exception 'stop: email is not off -- pause it as AGENTS.md says, and restore it afterwards';
  end if;
  if exists (select 1 from app_private.notification_email_settings where football_live_refresh_enabled) then
    raise exception 'stop: the live score refresh is on -- pause it with email as AGENTS.md says, select app_private.notification_email_configure(''off'', null, null, false); and restore both afterwards';
  end if;
  if exists (select 1 from app_private.prediction_settings where mode <> 'off' and scoring_enabled) then
    raise exception 'stop: Pronostics scoring is on -- pause it first with select app_private.predictions_configure((select mode from app_private.prediction_settings), false); and pass true afterwards';
  end if;

  -- The three functions the first version of this script replaced, as
  -- production held them on 2026-09-25.
  if md5(pg_get_functiondef('api.request_account_deletion()'::regprocedure))
    <> '1a1f5fedb7256c03c28305d0cd0ce76a' then
    raise exception 'stop: api.request_account_deletion is not the version this update replaces (20260720075453)';
  end if;
  if md5(pg_get_functiondef('api.cancel_account_deletion()'::regprocedure))
    <> 'b118e6b4b14e793b18532b2abdbc71be' then
    raise exception 'stop: api.cancel_account_deletion is not the version this update replaces (20260720075453)';
  end if;
  if md5(pg_get_functiondef('api.unsubscribe_notification_email(text)'::regprocedure))
    <> '9c655d051942d266429196779a06b160' then
    raise exception 'stop: api.unsubscribe_notification_email is not the version this update replaces (20260924140100)';
  end if;

  -- Everything else it replaces (the list above).
  select coalesce(array_agg(fn.signature order by fn.signature), '{}') into drifted
  from jsonb_each_text(replaced -> 'functions') as fn(signature, normalized_md5)
  where to_regprocedure(fn.signature) is null
    or md5((select string_agg(t.line, E'\n' order by t.n)
      from regexp_split_to_table(pg_get_functiondef(to_regprocedure(fn.signature)), E'\n')
        with ordinality as t(line, n)
      where t.line !~ '^\s*$' and t.line !~ '^\s*--')) <> fn.normalized_md5;
  if to_regprocedure('app_private.news_article_card(app.article_editions,app.placement_type)') is null
    or md5(pg_get_functiondef('app_private.news_article_card(app.article_editions,app.placement_type)'::regprocedure))
      <> replaced ->> 'news_card' then
    drifted := drifted || 'app_private.news_article_card'::text;
  end if;
  select drifted || coalesce(array_agg(fn.signature order by fn.signature), '{}') into drifted
  from jsonb_each_text(replaced -> 'match_votes') as fn(signature, definition_md5)
  where to_regprocedure(fn.signature) is null
    or md5(pg_get_functiondef(to_regprocedure(fn.signature))) <> fn.definition_md5;
  select drifted || coalesce(array_agg(v.name order by v.name), '{}') into drifted
  from jsonb_each_text(replaced -> 'views') as v(name, definition_md5)
  where to_regclass(v.name) is null
    or md5(pg_get_viewdef(to_regclass(v.name), true)) <> v.definition_md5
    or not exists (select 1 from pg_catalog.pg_class c
      where c.oid = to_regclass(v.name) and 'security_invoker=true' = any(c.reloptions));
  select drifted || coalesce(array_agg(p.name order by p.name), '{}') into drifted
  from jsonb_each_text(replaced -> 'policies') as p(name, expression_md5)
  where not exists (select 1 from pg_catalog.pg_policies policy
    where policy.schemaname = 'storage' and policy.tablename = 'objects'
      and policy.policyname = p.name and policy.roles = '{authenticated}'
      and md5(coalesce(policy.qual, '') || '|' || coalesce(policy.with_check, '')) = p.expression_md5);
  if (select count(*) from pg_catalog.pg_policies policy
      where policy.schemaname = 'storage' and policy.tablename = 'objects'
        and coalesce(policy.qual, '') || coalesce(policy.with_check, '') like '%avatars%') <> 4 then
    drifted := drifted || 'storage.objects has another avatars policy than the four'::text;
  end if;
  if cardinality(drifted) > 0 then
    raise exception 'stop: not the version this update replaces (production on 2026-09-25): %', drifted;
  end if;

  -- For the postflight, which checks the result against the same list.
  perform set_config('bg_20260926003100.replaced', replaced::text, true);
end
$preflight$;

-- Every table that gets a trigger, together and in one order, before any
-- change. Reads go on; a write already under way makes this stop within
-- lock_timeout (5 s), and a write that starts now waits until the end.
lock table
  app.profiles, app.user_preferences, app.followed_teams, app.followed_competitions,
  app.account_deletion_requests, app.saved_articles, app.notifications,
  app.notification_subscriptions, app.device_registrations, app_private.push_destinations,
  app.fantasy_teams, app.fantasy_squad_memberships, app.fantasy_lineups,
  app.fantasy_lineup_players, app.fantasy_transfer_batches, app.fantasy_transfers,
  app.fantasy_chip_uses, app.fantasy_free_hit_snapshots, app.fantasy_free_hit_snapshot_players,
  app.fantasy_leagues, app.fantasy_league_memberships, app.predictions,
  app.prediction_league_members, app_private.prediction_guest_claims, app.match_votes
  in share row exclusive mode;

-- ---------------------------------------------------------------------------
-- Migration 20260926003100, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260926003100',
  'ordinary_account_mfa_step_up',
  array[$bg_20260926003100_file$-- BotolaGO Production V2
-- An ordinary account that turned MFA on must complete it before it reads or
-- changes anything of its own (audit 2026-09-25 A03 / DB-07, P2).
--
-- Background. Supabase Auth issues an aal1 session once the password is right
-- and raises it to aal2 only after the enrolled factor is verified. The web
-- app shows the MFA challenge as a page, and nothing on the server asked for
-- aal2 afterwards: api.request_account_deletion() (20260720075453) checks
-- auth.uid() and a rate limit, api.create_fantasy_team() (20260924200000)
-- writes under auth.uid() alone, api.get_my_notification_preferences()
-- (20260720121729) reads under it, and so does every other ordinary account
-- RPC. Someone holding only the password of an account that had turned MFA on
-- could leave the challenge page and read or act as the account. Staff were
-- never exposed: app_private.admin_assert_principal() and has_editorial_role()
-- (20260919150000) already require a verified factor and aal2. This migration
-- does not touch them.
--
-- The rule, which is the contract the web app codes against: an actor
-- (auth.uid() is not null) with at least one VERIFIED factor in
-- auth.mfa_factors, whose JWT aal is not 'aal2', is refused with
--
--   SQLSTATE PT403, message 'mfa_required'   (PostgREST: HTTP 403)
--
-- Everyone else passes: accounts with no factor or only an unverified
-- (abandoned) enrolment, aal2 sessions, and work with no actor at all -- the
-- service role, pg_cron, and Supabase Auth's own connection, which runs the
-- signup trigger (handle_new_auth_user -> ensure_identity) with no JWT. A
-- brand-new account cannot have a factor yet in any case. The admin RPCs also
-- use 'mfa_required', but for a staff principal with no factor at all; an
-- enrolled staff member at aal1 gets 'mfa_assurance_insufficient' from them.
-- So from an ordinary read or write, 'mfa_required' always means "complete
-- the challenge".
--
-- How:
--   1. app_private.assert_mfa_step_up() states the rule once. No actor and
--      aal2 return before any lookup. Only an aal1 actor costs one probe of
--      auth.mfa_factors by user_id (mfa_factors_user_id_idx, present locally
--      and on production).
--   2. app_private.refuse_unverified_mfa_actor() runs it from BEFORE INSERT
--      OR UPDATE OR DELETE triggers on every table an ordinary api.* function
--      writes for the caller's own account. The rule then holds whichever RPC
--      does the write, including RPCs written later. The triggers fire FOR
--      EACH STATEMENT, not per row like refuse_banned_actor(). This rule
--      depends only on who acts, never on the row. A row trigger would cost
--      the service's bulk writes about 7 us a row (1.1 s per 150,000 rows,
--      measured locally), only to learn each time that there is no actor.
--      A statement that matches no row is refused too; it is still the
--      actor's write.
--   3. api.request_account_deletion() and api.cancel_account_deletion() call
--      the helper first, before the rate limit answers and before
--      request_account_deletion hands back an existing request without a
--      write the table trigger would see. So they refuse the same way every
--      time, before any side effect.
--   4. api.unsubscribe_notification_email() is authorised by the emailed
--      token, not by the session. The token may name another account than
--      the one signed in, and the function only ever turns e-mail off. It
--      works signed out, so it must not be harder signed in. It marks its one
--      app.user_preferences write with a transaction-local setting, which the
--      trigger honours for that table only, and clears the setting right
--      after the write.
--   5. Reads have no statement a trigger could see, and some writes hand the
--      account's data back without one: an idempotent replay returns the
--      stored Fantasy team, a double tap returns the Pronostics league just
--      made with its invite code, "already a member" returns the league. So
--      every other api.* function that reads or writes the caller's own
--      account runs the helper as the first statement of its body, as point 3
--      does (50 functions, listed below). Each is its latest definition in
--      this tree, byte for byte, plus that one line; the triggers of point 2
--      stay as they are, for whatever writes next.
--   6. The account views (api.my_profile, my_followed_teams,
--      my_followed_competitions, my_account_deletion_requests) are
--      security_invoker views. Each gets `and app_private.require_mfa_step_up()`
--      in its WHERE: true, or the same refusal. The call names no column, so
--      it runs once, before any row is read, and a view with no row for the
--      account refuses too.
--   7. Two public reads carry one private part each, and show it only when
--      app_private.mfa_step_up_satisfied(). The News card
--      (app_private.news_article_card, in every feed, search and article)
--      says whether the reader saved each article. The match votes
--      (api.match_votes, 20260925234000, which visitors call too) give every
--      fan's totals and the caller's own choices ('mine'). At aal1 an
--      enrolled account reads both as a visitor does: the news without saved
--      marks, the totals without its own choices. Refusing either read whole
--      would only hide what the same person can read signed out.
--   8. The avatar image. The avatars bucket's four policies on storage.objects
--      (20260720075453) gain `and (select app_private.mfa_step_up_satisfied())`
--      and are otherwise unchanged. Storage then answers an enrolled account
--      at aal1 as it answers anyone else's session: no signed URL (the object
--      is not found), an upload refused, a replacement or removal that
--      touches nothing. This comes last: replacing a policy locks
--      storage.objects until the transaction ends, and every Storage read
--      waits for it, the public news and club images included.
--   The two new helpers are the rule in boolean form, and both call
--   assert_mfa_step_up(), so the rule is still stated once:
--   require_mfa_step_up() returns true or refuses, and mfa_step_up_satisfied()
--   turns the refusal into false. They are SECURITY DEFINER with EXECUTE for
--   authenticated only. PostgreSQL checks EXECUTE on a view's or a policy's
--   functions as the querying role, but not USAGE on their schema, which
--   authenticated does not have on app_private (as with
--   fantasy_is_active_league_member in 20260926003200).
--
-- Guarded tables (their writers in parentheses):
--   identity       app.profiles, app.user_preferences (complete_onboarding,
--                  update_my_preferences, update_my_notification_preferences),
--                  app.followed_teams, app.followed_competitions
--                  (follow_* / unfollow_*), app.account_deletion_requests
--   news           app.saved_articles (save_article, unsave_article)
--   notifications  app.notifications (mark_*_read, dismiss_my_notification),
--                  app.notification_subscriptions
--                  (set_my_notification_subscription), app.device_registrations
--                  and app_private.push_destinations
--                  (register/unregister/disable_my_notification_device)
--   Fantasy        teams, squad memberships, lineups, lineup players, transfer
--                  batches, transfers, chip uses, free-hit snapshots and their
--                  players, leagues, league memberships (create_fantasy_team,
--                  save_fantasy_lineup, confirm_fantasy_transfers,
--                  activate/cancel_fantasy_chip, create/join/leave/archive
--                  league, create_prediction_league,
--                  reset_prediction_league_invite_code)
--   Pronostics     app.predictions, app.prediction_league_members,
--                  app_private.prediction_guest_claims (save_predictions,
--                  claim_guest_predictions, join/leave_prediction_league),
--                  app.match_votes (cast_match_vote, 20260925234000)
--
-- Guarded functions (the helper first; points 3 and 5):
--   identity       get_my_account_standing, complete_onboarding,
--                  update_my_preferences, follow_team, unfollow_team,
--                  follow_competition, unfollow_competition,
--                  request_account_deletion, cancel_account_deletion
--   notifications  get_my_notification_preferences,
--                  update_my_notification_preferences, list_my_notifications,
--                  my_notification_unread_count, mark_my_notification_read,
--                  mark_all_my_notifications_read, dismiss_my_notification,
--                  set_my_notification_subscription,
--                  list_my_notification_devices,
--                  register/disable/unregister_my_notification_device
--   news           news_saved_articles, save_article, unsave_article
--   Fantasy        fantasy_hub (it carries the caller's team),
--                  get_my_fantasy_team, get_my_fantasy_history,
--                  get_my_fantasy_points, preview_fantasy_transfers,
--                  fantasy_leagues (the caller's private leagues, role and
--                  rank), fantasy_league_standings (private leagues are read
--                  through the caller's membership), fantasy_overall_standings
--                  (myRank), create_fantasy_team, save_fantasy_lineup,
--                  confirm_fantasy_transfers, activate/cancel_fantasy_chip,
--                  create/join/leave/archive_fantasy_league
--   Pronostics     my_predictions, predictions_leaderboard (the caller's own
--                  line), my_prediction_leagues, predictions_league_standings,
--                  save_predictions, claim_guest_predictions,
--                  create/join/leave_prediction_league,
--                  reset_prediction_league_invite_code, cast_match_vote (it
--                  answers with the caller's own choices)
-- supabase/tests/database/ordinary_account_mfa_step_up_reads.test.sql fails
-- when an api function that reads the caller neither runs the helper nor is
-- named below.
--
-- Not guarded, and why:
--   - app_private.security_audit_log and api.record_session_revocation. The
--     log holds sign-out's intent (record_session_revocation) and the
--     rate-limit counts. Sign-out must work mid-login: someone who abandons
--     the challenge must still be able to sign out.
--   - app_private.fantasy_idempotency_keys and fantasy_mutation_audit:
--     bookkeeping written in the same transaction as a guarded table, so it
--     rolls back with the refusal.
--   - app.notification_deliveries and
--     app_private.notification_email_unsubscribe_tokens: service tables. The
--     unsubscribe link writes them under the token's authority (point 4).
--   - app_private.client_error_counts: anonymous telemetry
--     (report_client_errors).
--   - api.get_my_staff_context(). The staff console is outside the web app's
--     challenge gate and reads it at aal1 to show its own step-up. An
--     ordinary account gets staff_access_denied from it, and staff stay
--     behind admin_assert_principal's stricter check.
--   - api.predictions_round(): the round and its matches, the same for
--     everyone. auth.uid() only decides whether a tester may see Pronostics
--     while it is open to testers alone; nothing of the caller's comes back.
--   - The public reads: football, the news feed, search and articles (their
--     one private part, the saved mark, is point 7), the match votes' totals
--     (their private part, the caller's own choices, is point 7 too), the
--     Fantasy catalogue, rules, fixtures, players and prizes,
--     username_availability. Nothing else in them is the caller's.
--   - Staff and editorial tables and RPCs. Their own checks are stricter and
--     stay as they are.
--   - auth.* belongs to Supabase. The factor list and the challenge are
--     Supabase Auth's own endpoints, which is all the web app reads before the
--     second factor: nothing through the api.
--
-- Deploy order: after 20260925234000 (match votes; on production since
-- 2026-09-25), whose two functions this replaces and whose table it guards.
-- No api signature or JSON shape changes. Web code already deployed shows an
-- unrecognised PT403 as its generic "could not be completed" error: the write
-- does not happen, the read shows its error state. The web change that sends
-- 'mfa_required' to the challenge from any refused read, and reads nothing of
-- an account whose session owes its code, can ship before or after this.

-- ---------------------------------------------------------------------------
-- The rule
-- ---------------------------------------------------------------------------

create function app_private.assert_mfa_step_up()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  -- No actor: the service role, pg_cron, Supabase Auth's signup trigger.
  -- aal2: the enrolled factor was verified in this session.
  if actor is null or coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2' then
    return;
  end if;

  -- An unverified factor is an enrolment the person never finished. It
  -- protects nothing yet, so it asks for nothing.
  if exists (
    select 1
    from auth.mfa_factors factor
    where factor.user_id = actor and factor.status::text = 'verified'
  ) then
    raise exception using errcode = 'PT403', message = 'mfa_required';
  end if;
end;
$$;
revoke all on function app_private.assert_mfa_step_up()
  from public, anon, authenticated, service_role;
comment on function app_private.assert_mfa_step_up() is
  'Refuses (PT403 mfa_required) an actor who has a verified MFA factor but whose '
  'session is not aal2. No actor (service, cron, signup), aal2, and accounts '
  'without a verified factor pass. Audit 2026-09-25 A03 / DB-07.';

create function app_private.refuse_unverified_mfa_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The one write the step-up does not govern: the e-mail unsubscribe link
  -- turning e-mail off under the token's authority
  -- (api.unsubscribe_notification_email). Honoured for app.user_preferences
  -- only, so the mark cannot waive a write to any other table.
  if tg_table_schema = 'app' and tg_table_name = 'user_preferences'
    and current_setting('app.mfa_step_up_waiver', true) = 'email_unsubscribe_token'
  then
    return null;
  end if;

  perform app_private.assert_mfa_step_up();
  return null;
end;
$$;
revoke all on function app_private.refuse_unverified_mfa_actor()
  from public, anon, authenticated, service_role;
comment on function app_private.refuse_unverified_mfa_actor() is
  'Statement trigger on every table ordinary api.* functions write for the '
  'caller''s own account: runs app_private.assert_mfa_step_up(). '
  'app.user_preferences honours app.mfa_step_up_waiver = email_unsubscribe_token, '
  'set only by api.unsubscribe_notification_email around its one write.';

-- ---------------------------------------------------------------------------
-- The tables
-- ---------------------------------------------------------------------------

-- Identity
create trigger profiles_refuse_unverified_mfa_actor
before insert or update or delete on app.profiles
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger user_preferences_refuse_unverified_mfa_actor
before insert or update or delete on app.user_preferences
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger followed_teams_refuse_unverified_mfa_actor
before insert or update or delete on app.followed_teams
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger followed_competitions_refuse_unverified_mfa_actor
before insert or update or delete on app.followed_competitions
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger account_deletion_requests_refuse_unverified_mfa_actor
before insert or update or delete on app.account_deletion_requests
for each statement execute function app_private.refuse_unverified_mfa_actor();

-- News
create trigger saved_articles_refuse_unverified_mfa_actor
before insert or update or delete on app.saved_articles
for each statement execute function app_private.refuse_unverified_mfa_actor();

-- Notifications
create trigger notifications_refuse_unverified_mfa_actor
before insert or update or delete on app.notifications
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger notification_subscriptions_refuse_unverified_mfa_actor
before insert or update or delete on app.notification_subscriptions
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger device_registrations_refuse_unverified_mfa_actor
before insert or update or delete on app.device_registrations
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger push_destinations_refuse_unverified_mfa_actor
before insert or update or delete on app_private.push_destinations
for each statement execute function app_private.refuse_unverified_mfa_actor();

-- Fantasy
create trigger fantasy_teams_refuse_unverified_mfa_actor
before insert or update or delete on app.fantasy_teams
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger fantasy_squad_memberships_refuse_unverified_mfa_actor
before insert or update or delete on app.fantasy_squad_memberships
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger fantasy_lineups_refuse_unverified_mfa_actor
before insert or update or delete on app.fantasy_lineups
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger fantasy_lineup_players_refuse_unverified_mfa_actor
before insert or update or delete on app.fantasy_lineup_players
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger fantasy_transfer_batches_refuse_unverified_mfa_actor
before insert or update or delete on app.fantasy_transfer_batches
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger fantasy_transfers_refuse_unverified_mfa_actor
before insert or update or delete on app.fantasy_transfers
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger fantasy_chip_uses_refuse_unverified_mfa_actor
before insert or update or delete on app.fantasy_chip_uses
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger fantasy_free_hit_snapshots_refuse_unverified_mfa_actor
before insert or update or delete on app.fantasy_free_hit_snapshots
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger fantasy_free_hit_snapshot_players_refuse_unverified_mfa_actor
before insert or update or delete on app.fantasy_free_hit_snapshot_players
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger fantasy_leagues_refuse_unverified_mfa_actor
before insert or update or delete on app.fantasy_leagues
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger fantasy_league_memberships_refuse_unverified_mfa_actor
before insert or update or delete on app.fantasy_league_memberships
for each statement execute function app_private.refuse_unverified_mfa_actor();

-- Pronostics
create trigger predictions_refuse_unverified_mfa_actor
before insert or update or delete on app.predictions
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger prediction_league_members_refuse_unverified_mfa_actor
before insert or update or delete on app.prediction_league_members
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger prediction_guest_claims_refuse_unverified_mfa_actor
before insert or update or delete on app_private.prediction_guest_claims
for each statement execute function app_private.refuse_unverified_mfa_actor();

create trigger match_votes_refuse_unverified_mfa_actor
before insert or update or delete on app.match_votes
for each statement execute function app_private.refuse_unverified_mfa_actor();

-- ---------------------------------------------------------------------------
-- Account deletion: refused up front
-- ---------------------------------------------------------------------------

-- Bodies as in 20260720075453 (the md5 of both matched production on
-- 2026-09-25), plus the step-up before anything else is decided.
create or replace function api.request_account_deletion()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  request_id uuid;
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'UNAUTHORIZED';
  end if;

  -- Before the rate limit, which would otherwise answer rate_limited, and
  -- before an existing request is handed back with no write for the table
  -- trigger to see.
  perform app_private.assert_mfa_step_up();

  perform app_private.assert_security_rate_limit(
    current_user_id,
    'account_deletion_requested',
    3,
    interval '24 hours'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text || ':account-deletion', 0)
  );

  select id into request_id
  from app.account_deletion_requests
  where user_id = current_user_id and status in ('requested', 'processing')
  order by requested_at desc
  limit 1;

  if request_id is not null then
    return request_id;
  end if;

  insert into app.account_deletion_requests (user_id)
  values (current_user_id)
  returning id into request_id;

  return request_id;
end;
$$;

create or replace function api.cancel_account_deletion()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'UNAUTHORIZED';
  end if;

  perform app_private.assert_mfa_step_up();

  update app.account_deletion_requests
  set status = 'cancelled'
  where user_id = current_user_id and status = 'requested';

  return true;
end;
$$;

revoke all on function api.request_account_deletion()
  from public, anon, authenticated, service_role;
revoke all on function api.cancel_account_deletion()
  from public, anon, authenticated, service_role;
grant execute on function api.request_account_deletion(), api.cancel_account_deletion()
  to authenticated;

comment on function api.request_account_deletion() is
  'Files (or returns) the caller''s pending account deletion request. An account '
  'with a verified MFA factor needs an aal2 session: PT403 mfa_required otherwise.';
comment on function api.cancel_account_deletion() is
  'Cancels the caller''s requested account deletion. An account with a verified '
  'MFA factor needs an aal2 session: PT403 mfa_required otherwise.';

-- ---------------------------------------------------------------------------
-- The e-mail unsubscribe link: the token authorises it, not the session
-- ---------------------------------------------------------------------------

-- Body as in 20260924140100 (md5 matched production on 2026-09-25). The only
-- change is the mark around the app.user_preferences update. The page opened
-- from an e-mail calls this with whatever session the browser holds, which
-- may be an enrolled account at aal1, or not the token's account at all.
create or replace function api.unsubscribe_notification_email(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target app_private.notification_email_unsubscribe_tokens%rowtype;
  currently_enabled boolean;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into target
  from app_private.notification_email_unsubscribe_tokens token
  where token.token_hash = extensions.digest(p_token, 'sha256')
    and token.expires_at > statement_timestamp();
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  select preference.email_notifications_enabled into currently_enabled
  from app.user_preferences preference
  where preference.user_id = target.user_id
  for update;
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  update app_private.notification_email_unsubscribe_tokens
  set used_at = coalesce(used_at, statement_timestamp())
  where token_hash = target.token_hash;

  if not currently_enabled then
    return jsonb_build_object('status', 'already_unsubscribed');
  end if;

  -- The token, not the session, authorises this one write, and it only turns
  -- e-mail off. The mark exempts it from the MFA step-up
  -- (app_private.refuse_unverified_mfa_actor) and is cleared straight after.
  perform pg_catalog.set_config('app.mfa_step_up_waiver', 'email_unsubscribe_token', true);
  update app.user_preferences set email_notifications_enabled = false
  where user_id = target.user_id;
  perform pg_catalog.set_config('app.mfa_step_up_waiver', '', true);

  update app.notification_deliveries delivery set
    status = 'cancelled', stable_error_code = 'email_unsubscribed', next_retry_at = null,
    claimed_at = null, claim_expires_at = null
  from app.notifications notification
  where delivery.notification_id = notification.id
    and notification.user_id = target.user_id
    and delivery.channel = 'email'
    and (delivery.status in ('pending', 'retry_scheduled')
      or (delivery.status = 'claimed' and delivery.claim_expires_at < statement_timestamp()));
  perform app_private.write_notification_audit(
    'notification_email_unsubscribed', target.user_id,
    p_metadata := jsonb_build_object('source', 'email_link')
  );
  return jsonb_build_object('status', 'unsubscribed');
end;
$$;

revoke all on function api.unsubscribe_notification_email(text)
  from public, anon, authenticated, service_role;
-- As in 20260924140100: the page opened from an email calls it signed out
-- (anon) or signed in (authenticated); the one-click endpoint mail providers
-- POST to (Edge Function notification-email-unsubscribe) calls it with the
-- service role.
grant execute on function api.unsubscribe_notification_email(text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The rule as a boolean, for a view, a policy and a card (How, after point 8)
-- ---------------------------------------------------------------------------

create function app_private.require_mfa_step_up()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.assert_mfa_step_up();
  return true;
end;
$$;
revoke all on function app_private.require_mfa_step_up()
  from public, anon, authenticated, service_role;
-- The account views are security_invoker: their WHERE runs as the reader.
grant execute on function app_private.require_mfa_step_up() to authenticated;
comment on function app_private.require_mfa_step_up() is
  'True, or PT403 mfa_required: app_private.assert_mfa_step_up() for a WHERE clause. '
  'In the WHERE of the api.my_* account views. Audit 2026-09-25 A03 / DB-07.';

create function app_private.mfa_step_up_satisfied()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.assert_mfa_step_up();
  return true;
exception when sqlstate 'PT403' then
  return false;
end;
$$;
revoke all on function app_private.mfa_step_up_satisfied()
  from public, anon, authenticated, service_role;
-- The avatar policies are for authenticated, and a policy's functions run as
-- the querying role.
grant execute on function app_private.mfa_step_up_satisfied() to authenticated;
comment on function app_private.mfa_step_up_satisfied() is
  'False where app_private.assert_mfa_step_up() would refuse, true otherwise. '
  'For the avatars bucket''s storage.objects policies, the saved mark on the '
  'public News card and the caller''s own choices in api.match_votes. '
  'Audit 2026-09-25 A03 / DB-07.';

-- ---------------------------------------------------------------------------
-- Every other api function that reads or writes the caller's own account:
-- refused up front (point 5)
-- ---------------------------------------------------------------------------

-- Identity

-- As in 20260924160000.
create or replace function api.get_my_account_standing()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  is_banned boolean;
  banned_until timestamptz;
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'unauthenticated';
  end if;

  select true, ban.ends_at
  into is_banned, banned_until
  from app_private.user_bans ban
  where ban.user_id = current_user_id
    and ban.lifted_at is null
    and ban.starts_at <= statement_timestamp()
    and (ban.ends_at is null or ban.ends_at > statement_timestamp())
  order by ban.starts_at desc, ban.id desc
  limit 1;

  return jsonb_build_object(
    'banned', coalesce(is_banned, false),
    'bannedUntil', banned_until
  );
end;
$$;

-- As in 20260720081817.
create or replace function api.complete_onboarding(
  display_name text,
  username text,
  avatar_path text,
  preferred_language app.language_code,
  favorite_team_id uuid default null,
  favorite_team_provisional_ref text default null,
  match_alerts boolean default true,
  breaking_news boolean default true,
  fantasy_deadline_reminders boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized text := app_private.normalize_username(username);
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'UNAUTHORIZED';
  end if;
  if display_name is null
    or btrim(display_name) <> display_name
    or char_length(display_name) not between 2 and 80
  then
    raise exception using errcode = 'PT400', message = 'INVALID_DISPLAY_NAME';
  end if;
  if normalized is null or normalized !~ '^[a-z0-9][a-z0-9_-]{2,19}$' then
    raise exception using errcode = 'PT400', message = 'INVALID_USERNAME';
  end if;
  if preferred_language is null
    or match_alerts is null
    or breaking_news is null
    or fantasy_deadline_reminders is null
  then
    raise exception using errcode = 'PT400', message = 'INVALID_PREFERENCES';
  end if;
  if exists (
    select 1 from app_private.reserved_usernames where reserved_usernames.username = normalized
  ) then
    raise exception using errcode = 'PT400', message = 'RESERVED_USERNAME';
  end if;
  if favorite_team_id is not null and favorite_team_provisional_ref is not null then
    raise exception using errcode = 'PT400', message = 'INVALID_FAVORITE_TEAM_REFERENCE';
  end if;
  if favorite_team_provisional_ref is not null
    and favorite_team_provisional_ref !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
  then
    raise exception using errcode = 'PT400', message = 'INVALID_FAVORITE_TEAM_REFERENCE';
  end if;
  if avatar_path is not null
    and avatar_path !~ ('^' || current_user_id::text || '/avatar[.](jpg|jpeg|png|webp)$')
  then
    raise exception using errcode = 'PT400', message = 'INVALID_AVATAR_PATH';
  end if;

  perform app_private.assert_security_rate_limit(
    current_user_id,
    'profile_updated',
    30,
    interval '5 minutes'
  );

  insert into app.profiles (id)
  values (current_user_id)
  on conflict (id) do nothing;

  if exists (
    select 1
    from app.profiles
    where id = current_user_id
      and profiles.username is distinct from normalized
  ) then
    perform app_private.assert_security_rate_limit(
      current_user_id,
      'username_changed',
      3,
      interval '24 hours'
    );
  end if;

  begin
    update app.profiles
    set
      username = normalized,
      display_name = complete_onboarding.display_name,
      avatar_path = complete_onboarding.avatar_path,
      preferred_language = complete_onboarding.preferred_language,
      onboarding_completed_at = coalesce(onboarding_completed_at, statement_timestamp())
    where id = current_user_id
      and deleted_at is null;
  exception
    when unique_violation then
      raise exception using errcode = 'PT409', message = 'USERNAME_TAKEN';
  end;

  if not found then
    raise exception using errcode = 'PT404', message = 'PROFILE_NOT_FOUND';
  end if;

  insert into app.user_preferences (
    user_id,
    favorite_team_id,
    favorite_team_provisional_ref,
    match_alerts,
    breaking_news,
    fantasy_deadline_reminders
  )
  values (
    current_user_id,
    complete_onboarding.favorite_team_id,
    complete_onboarding.favorite_team_provisional_ref,
    complete_onboarding.match_alerts,
    complete_onboarding.breaking_news,
    complete_onboarding.fantasy_deadline_reminders
  )
  on conflict (user_id) do update
  set
    favorite_team_id = excluded.favorite_team_id,
    favorite_team_provisional_ref = excluded.favorite_team_provisional_ref,
    match_alerts = excluded.match_alerts,
    breaking_news = excluded.breaking_news,
    fantasy_deadline_reminders = excluded.fantasy_deadline_reminders;
end;
$$;

-- As in 20260720081817.
create or replace function api.update_my_preferences(
  match_alerts boolean,
  breaking_news boolean,
  fantasy_deadline_reminders boolean,
  preferred_language app.language_code
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'UNAUTHORIZED';
  end if;
  if preferred_language is null
    or match_alerts is null
    or breaking_news is null
    or fantasy_deadline_reminders is null
  then
    raise exception using errcode = 'PT400', message = 'INVALID_PREFERENCES';
  end if;

  perform app_private.assert_security_rate_limit(
    current_user_id,
    'preferences_updated',
    30,
    interval '5 minutes'
  );

  update app.profiles
  set preferred_language = update_my_preferences.preferred_language
  where id = current_user_id and deleted_at is null;

  if not found then
    raise exception using errcode = 'PT404', message = 'PROFILE_NOT_FOUND';
  end if;

  insert into app.user_preferences (
    user_id,
    match_alerts,
    breaking_news,
    fantasy_deadline_reminders
  )
  values (
    current_user_id,
    update_my_preferences.match_alerts,
    update_my_preferences.breaking_news,
    update_my_preferences.fantasy_deadline_reminders
  )
  on conflict (user_id) do update
  set
    match_alerts = excluded.match_alerts,
    breaking_news = excluded.breaking_news,
    fantasy_deadline_reminders = excluded.fantasy_deadline_reminders;
end;
$$;

-- As in 20260720081817.
create or replace function api.follow_team(p_team_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'UNAUTHORIZED';
  end if;
  if p_team_id is null then
    raise exception using errcode = 'PT400', message = 'INVALID_TEAM_ID';
  end if;
  insert into app.followed_teams (user_id, team_id)
  values (current_user_id, p_team_id)
  on conflict (user_id, team_id) do nothing;
  return true;
end;
$$;

-- As in 20260720081817.
create or replace function api.unfollow_team(p_team_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'UNAUTHORIZED';
  end if;
  if p_team_id is null then
    raise exception using errcode = 'PT400', message = 'INVALID_TEAM_ID';
  end if;
  delete from app.followed_teams
  where user_id = current_user_id and followed_teams.team_id = p_team_id;
  return true;
end;
$$;

-- As in 20260720081817.
create or replace function api.follow_competition(p_competition_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'UNAUTHORIZED';
  end if;
  if p_competition_id is null then
    raise exception using errcode = 'PT400', message = 'INVALID_COMPETITION_ID';
  end if;
  insert into app.followed_competitions (user_id, competition_id)
  values (current_user_id, p_competition_id)
  on conflict (user_id, competition_id) do nothing;
  return true;
end;
$$;

-- As in 20260720081817.
create or replace function api.unfollow_competition(p_competition_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'UNAUTHORIZED';
  end if;
  if p_competition_id is null then
    raise exception using errcode = 'PT400', message = 'INVALID_COMPETITION_ID';
  end if;
  delete from app.followed_competitions
  where user_id = current_user_id
    and followed_competitions.competition_id = p_competition_id;
  return true;
end;
$$;

-- Notifications

-- As in 20260720121729.
create or replace function api.get_my_notification_preferences()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  result jsonb;
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  select jsonb_build_object(
    'notificationsEnabled', pref.notifications_enabled,
    'channels', jsonb_build_object(
      'inApp', pref.in_app_notifications_enabled,
      'push', pref.push_notifications_enabled,
      'email', pref.email_notifications_enabled
    ),
    'categories', jsonb_build_object(
      'matchAlerts', pref.match_alerts,
      'breakingNews', pref.breaking_news,
      'fantasyDeadlines', pref.fantasy_deadline_reminders
    ),
    'timezone', pref.notification_timezone,
    'quietHours', jsonb_build_object(
      'enabled', pref.quiet_hours_enabled,
      'start', case when pref.quiet_hours_start is null then null else to_char(pref.quiet_hours_start, 'HH24:MI') end,
      'end', case when pref.quiet_hours_end is null then null else to_char(pref.quiet_hours_end, 'HH24:MI') end
    ),
    'digestMode', pref.notification_digest_mode,
    'fantasyDeadlineOffsetMinutes', pref.fantasy_deadline_offset_minutes,
    'language', profile.preferred_language,
    'updatedAt', pref.updated_at
  ) into result
  from app.user_preferences pref
  join app.profiles profile on profile.id = pref.user_id
  where pref.user_id = current_user_id and profile.deleted_at is null;
  if result is null then
    raise exception using errcode = 'PT404', message = 'notification_not_found';
  end if;
  return result;
end;
$$;

-- As in 20260720121729.
create or replace function api.update_my_notification_preferences(
  p_notifications_enabled boolean,
  p_in_app_enabled boolean,
  p_push_enabled boolean,
  p_email_enabled boolean,
  p_match_alerts boolean,
  p_breaking_news boolean,
  p_fantasy_deadlines boolean,
  p_timezone text,
  p_quiet_hours_enabled boolean,
  p_quiet_hours_start time default null,
  p_quiet_hours_end time default null,
  p_digest_mode app.notification_digest_mode default 'immediate',
  p_fantasy_deadline_offset_minutes integer default 1440
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  if p_notifications_enabled is null or p_in_app_enabled is null or p_push_enabled is null
    or p_email_enabled is null or p_match_alerts is null or p_breaking_news is null
    or p_fantasy_deadlines is null or p_quiet_hours_enabled is null
    or p_digest_mode is null
  then
    raise exception using errcode = 'PT400', message = 'invalid_notification_preference';
  end if;
  perform app_private.assert_valid_timezone(p_timezone);
  if (p_quiet_hours_enabled and (p_quiet_hours_start is null or p_quiet_hours_end is null
      or p_quiet_hours_start = p_quiet_hours_end))
    or (not p_quiet_hours_enabled and (p_quiet_hours_start is not null or p_quiet_hours_end is not null))
    or p_fantasy_deadline_offset_minutes not between 15 and 10080
  then
    raise exception using errcode = 'PT400', message = 'quiet_hours_invalid';
  end if;
  perform app_private.assert_notification_user_rate_limit(
    current_user_id, 'notification_preferences_updated', 30, interval '5 minutes'
  );
  update app.user_preferences set
    notifications_enabled = p_notifications_enabled,
    in_app_notifications_enabled = p_in_app_enabled,
    push_notifications_enabled = p_push_enabled,
    email_notifications_enabled = p_email_enabled,
    match_alerts = p_match_alerts,
    breaking_news = p_breaking_news,
    fantasy_deadline_reminders = p_fantasy_deadlines,
    notification_timezone = p_timezone,
    quiet_hours_enabled = p_quiet_hours_enabled,
    quiet_hours_start = p_quiet_hours_start,
    quiet_hours_end = p_quiet_hours_end,
    notification_digest_mode = p_digest_mode,
    fantasy_deadline_offset_minutes = p_fantasy_deadline_offset_minutes
  where user_id = current_user_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'notification_not_found';
  end if;
  perform app_private.write_notification_audit(
    'notification_preferences_updated', current_user_id, p_metadata := jsonb_build_object(
      'pushEnabled', p_push_enabled,
      'emailEnabled', p_email_enabled,
      'quietHoursEnabled', p_quiet_hours_enabled
    )
  );
  return api.get_my_notification_preferences();
end;
$$;

-- As in 20260720121729.
create or replace function api.list_my_notifications(
  p_category app.notification_category default null,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  items jsonb;
  next_cursor jsonb;
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  if p_limit not between 1 and 50 or ((p_before_created_at is null) <> (p_before_id is null)) then
    raise exception using errcode = 'PT400', message = 'invalid_notification_preference';
  end if;

  with candidates as (
    select notification.*,
      row_number() over (order by notification.created_at desc, notification.id desc) as row_number
    from app.notifications notification
    where notification.user_id = current_user_id
      and notification.archived_at is null
      and notification.available_at <= statement_timestamp()
      and (notification.expires_at is null or notification.expires_at > statement_timestamp())
      and (p_category is null or notification.category = p_category)
      and (p_before_created_at is null or (notification.created_at, notification.id) < (p_before_created_at, p_before_id))
    order by notification.created_at desc, notification.id desc
    limit p_limit + 1
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'type', notification_type,
      'category', category,
      'priority', priority,
      'language', language,
      'direction', case when language = 'ar' then 'rtl' else 'ltr' end,
      'title', title,
      'body', body,
      'deepLink', jsonb_build_object('target', deep_link_target, 'entityId', deep_link_entity_id),
      'availableAt', available_at,
      'expiresAt', expires_at,
      'readAt', read_at,
      'dismissedAt', dismissed_at,
      'createdAt', created_at
    ) order by created_at desc, id desc) filter (where row_number <= p_limit), '[]'::jsonb),
    case when max(row_number) > p_limit then (
      select jsonb_build_object('createdAt', c.created_at, 'id', c.id)
      from candidates c where c.row_number = p_limit
    ) else null end
  into items, next_cursor
  from candidates;
  return jsonb_build_object('items', items, 'nextCursor', next_cursor);
end;
$$;

-- As in 20260720121729.
create or replace function api.my_notification_unread_count(
  p_category app.notification_category default null
)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid(); result bigint;
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  select count(*) into result from app.notifications notification
  where notification.user_id = current_user_id
    and notification.read_at is null and notification.dismissed_at is null
    and notification.archived_at is null
    and notification.available_at <= statement_timestamp()
    and (notification.expires_at is null or notification.expires_at > statement_timestamp())
    and (p_category is null or notification.category = p_category);
  return result;
end;
$$;

-- As in 20260720121729.
create or replace function api.mark_my_notification_read(
  p_notification_id uuid,
  p_read boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  perform app_private.assert_notification_user_rate_limit(
    current_user_id, 'notification_read_state_changed', 120, interval '5 minutes'
  );
  update app.notifications set read_at = case when p_read then statement_timestamp() else null end
  where id = p_notification_id and user_id = current_user_id and archived_at is null;
  if not found then
    raise exception using errcode = 'PT404', message = 'notification_not_found';
  end if;
  perform app_private.write_notification_audit(
    'notification_read_state_changed', current_user_id, p_notification_id
  );
  return true;
end;
$$;

-- As in 20260720121729.
create or replace function api.mark_all_my_notifications_read(
  p_category app.notification_category default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid(); affected integer;
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  perform app_private.assert_notification_user_rate_limit(
    current_user_id, 'notifications_marked_all_read', 20, interval '5 minutes'
  );
  update app.notifications set read_at = statement_timestamp()
  where user_id = current_user_id and read_at is null and archived_at is null
    and available_at <= statement_timestamp()
    and (p_category is null or category = p_category);
  get diagnostics affected = row_count;
  perform app_private.write_notification_audit(
    'notifications_marked_all_read', current_user_id,
    p_metadata := jsonb_build_object('count', affected)
  );
  return affected;
end;
$$;

-- As in 20260720121729.
create or replace function api.dismiss_my_notification(
  p_notification_id uuid,
  p_archive boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  update app.notifications set
    dismissed_at = coalesce(dismissed_at, statement_timestamp()),
    archived_at = case when p_archive then coalesce(archived_at, statement_timestamp()) else archived_at end
  where id = p_notification_id and user_id = current_user_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'notification_not_found';
  end if;
  perform app_private.write_notification_audit(
    'notification_dismissed', current_user_id, p_notification_id,
    p_metadata := jsonb_build_object('archived', p_archive)
  );
  return true;
end;
$$;

-- As in 20260720121729.
create or replace function api.set_my_notification_subscription(
  p_kind app.notification_subscription_kind,
  p_target_id uuid,
  p_enabled boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  if p_target_id is null or p_enabled is null then
    raise exception using errcode = 'PT400', message = 'invalid_notification_preference';
  end if;
  perform app_private.assert_notification_user_rate_limit(
    current_user_id, 'notification_subscription_changed', 60, interval '5 minutes'
  );
  insert into app.notification_subscriptions (
    user_id, kind, fixture_id, team_id, competition_id, news_topic_id, enabled
  ) values (
    current_user_id, p_kind,
    case when p_kind = 'match' then p_target_id end,
    case when p_kind = 'team' then p_target_id end,
    case when p_kind = 'competition' then p_target_id end,
    case when p_kind = 'news_topic' then p_target_id end,
    p_enabled
  )
  on conflict do nothing;
  if not found then
    update app.notification_subscriptions set enabled = p_enabled
    where user_id = current_user_id
      and ((p_kind = 'match' and fixture_id = p_target_id)
        or (p_kind = 'team' and team_id = p_target_id)
        or (p_kind = 'competition' and competition_id = p_target_id)
        or (p_kind = 'news_topic' and news_topic_id = p_target_id));
  end if;
  perform app_private.write_notification_audit(
    'notification_subscription_changed', current_user_id,
    p_metadata := jsonb_build_object('kind', p_kind, 'targetId', p_target_id, 'enabled', p_enabled)
  );
  return true;
end;
$$;

-- As in 20260720121729.
create or replace function api.list_my_notification_devices()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid(); result jsonb;
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'deviceId', device_id, 'platform', platform,
    'pushProvider', push_provider, 'appVersion', app_version,
    'locale', locale, 'timezone', timezone, 'enabled', enabled,
    'lastSeenAt', last_seen_at, 'invalidatedAt', invalidated_at,
    'createdAt', created_at
  ) order by last_seen_at desc, id), '[]'::jsonb)
  into result from app.device_registrations where user_id = current_user_id;
  return result;
end;
$$;

-- As in 20260720121729.
create or replace function api.register_my_notification_device(
  p_device_id text,
  p_platform app.notification_device_platform,
  p_push_provider app.notification_push_provider,
  p_destination text,
  p_locale app.language_code,
  p_timezone text,
  p_app_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_id uuid;
  token_digest bytea;
  conflicting_user uuid;
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  if p_device_id !~ '^[A-Za-z0-9._:-]{8,128}$' or char_length(p_destination) not between 16 and 4096 then
    raise exception using errcode = 'PT400', message = 'invalid_device';
  end if;
  perform app_private.assert_valid_timezone(p_timezone);
  perform app_private.assert_notification_user_rate_limit(
    current_user_id, 'notification_device_registered', 10, interval '10 minutes'
  );
  token_digest := extensions.digest(convert_to(p_destination, 'UTF8'), 'sha256');
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(encode(token_digest, 'hex'), 0));
  select registration.user_id into conflicting_user
  from app_private.push_destinations destination
  join app.device_registrations registration on registration.id = destination.device_registration_id
  where destination.destination_digest = token_digest
    and not (registration.user_id = current_user_id and registration.device_id = p_device_id);
  if conflicting_user is not null then
    raise exception using errcode = 'PT409', message = 'device_token_conflict';
  end if;

  insert into app.device_registrations (
    user_id, device_id, platform, push_provider, app_version, locale,
    timezone, enabled, last_seen_at, invalidated_at
  ) values (
    current_user_id, p_device_id, p_platform, p_push_provider, p_app_version,
    p_locale, p_timezone, true, statement_timestamp(), null
  ) on conflict (user_id, device_id) do update set
    platform = excluded.platform,
    push_provider = excluded.push_provider,
    app_version = excluded.app_version,
    locale = excluded.locale,
    timezone = excluded.timezone,
    enabled = true,
    last_seen_at = statement_timestamp(),
    invalidated_at = null
  returning id into target_id;

  insert into app_private.push_destinations (
    device_registration_id, destination_digest, destination_value, rotated_at
  ) values (target_id, token_digest, p_destination, statement_timestamp())
  on conflict (device_registration_id) do update set
    destination_digest = excluded.destination_digest,
    destination_value = excluded.destination_value,
    rotated_at = statement_timestamp(),
    expires_at = null;

  perform app_private.write_notification_audit(
    'notification_device_registered', current_user_id,
    p_device_registration_id := target_id,
    p_metadata := jsonb_build_object('platform', p_platform, 'provider', p_push_provider)
  );
  return jsonb_build_object(
    'id', target_id, 'deviceId', p_device_id, 'platform', p_platform,
    'pushProvider', p_push_provider, 'appVersion', p_app_version,
    'locale', p_locale, 'timezone', p_timezone, 'enabled', true
  );
exception when unique_violation then
  raise exception using errcode = 'PT409', message = 'device_token_conflict';
end;
$$;

-- As in 20260720121729.
create or replace function api.disable_my_notification_device(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  update app.device_registrations set enabled = false, invalidated_at = statement_timestamp()
  where id = p_device_id and user_id = current_user_id;
  if not found then raise exception using errcode = 'PT404', message = 'invalid_device'; end if;
  perform app_private.write_notification_audit(
    'notification_device_disabled', current_user_id,
    p_device_registration_id := p_device_id
  );
  return true;
end;
$$;

-- As in 20260720121729.
create or replace function api.unregister_my_notification_device(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  delete from app.device_registrations where id = p_device_id and user_id = current_user_id;
  if not found then raise exception using errcode = 'PT404', message = 'invalid_device'; end if;
  perform app_private.write_notification_audit(
    'notification_device_unregistered', current_user_id,
    p_metadata := jsonb_build_object('deviceRegistrationId', p_device_id)
  );
  return true;
end;
$$;

-- News: the reader's saved list

-- As in 20260720110107.
create or replace function api.news_saved_articles(
  p_limit integer default 20,
  p_after_created_at timestamptz default null,
  p_after_article_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  page_size integer := least(greatest(p_limit, 1), 50);
  result jsonb;
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'auth_unauthorized';
  end if;
  if (p_after_created_at is null) <> (p_after_article_id is null) then
    raise exception using errcode = '22023', message = 'news_invalid_cursor';
  end if;

  with selected as (
    select saved.created_at as saved_at, edition as article, edition.id
    from app.saved_articles saved join app.article_editions edition on edition.id = saved.article_edition_id
    where saved.user_id = current_user_id and app_private.news_is_public(edition)
      and (p_after_created_at is null or (saved.created_at, saved.article_edition_id) < (p_after_created_at, p_after_article_id))
    order by saved.created_at desc, saved.article_edition_id desc limit page_size + 1
  ), page as (
    select * from selected order by saved_at desc, id desc limit page_size
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(
      app_private.news_article_card(page.article, null) || jsonb_build_object('savedAt', page.saved_at)
      order by page.saved_at desc, page.id desc) from page), '[]'::jsonb),
    'nextCursor', case when (select count(*) from selected) > page_size then (
      select jsonb_build_object('createdAt', saved_at, 'articleId', id)
      from page order by saved_at, id limit 1
    ) else null end
  ) into result;
  return result;
end;
$$;

-- As in 20260720110107.
create or replace function api.save_article(p_article_edition_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  saved_at timestamptz;
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'auth_unauthorized';
  end if;
  if not exists (
    select 1 from app.article_editions
    where id = p_article_edition_id and app_private.news_is_public(article_editions)
  ) then
    raise exception using errcode = 'P0002', message = 'news_article_not_found';
  end if;
  insert into app.saved_articles (user_id, article_edition_id)
  values (current_user_id, p_article_edition_id)
  on conflict (user_id, article_edition_id) do nothing;
  select created_at into saved_at from app.saved_articles
  where user_id = current_user_id and article_edition_id = p_article_edition_id;
  return jsonb_build_object('articleId', p_article_edition_id, 'saved', true, 'savedAt', saved_at);
end;
$$;

-- As in 20260720110107.
create or replace function api.unsave_article(p_article_edition_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'auth_unauthorized';
  end if;
  delete from app.saved_articles
  where user_id = current_user_id and article_edition_id = p_article_edition_id;
  return jsonb_build_object('articleId', p_article_edition_id, 'saved', false);
end;
$$;

-- Fantasy

-- As in 20260924200000.
create or replace function api.fantasy_hub(p_language text default 'fr')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
declare result jsonb;
begin
  perform app_private.assert_mfa_step_up();
  if p_language not in ('fr', 'ar') then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select jsonb_build_object(
    'season', jsonb_build_object('id', season.id, 'name', season.name, 'status', season.status),
    'gameweek', case when gameweek.id is null then null else jsonb_build_object(
      'id', gameweek.id, 'sequence', gameweek.sequence_number, 'name', gameweek.name,
      'deadlineAt', gameweek.deadline_at, 'status', gameweek.status,
      'pointsState', gameweek.points_state
    ) end,
    'enrolmentGameweek', case when enrolment.id is null then null else jsonb_build_object(
      'id', enrolment.id, 'sequence', enrolment.sequence_number, 'name', enrolment.name,
      'deadlineAt', enrolment.deadline_at, 'status', enrolment.status
    ) end,
    'team', case when team.id is null then null else app_private.fantasy_team_dto(team.id) end,
    'rankingAvailable', exists (
      select 1 from app.fantasy_rankings ranking
      where ranking.fantasy_season_id = season.id and ranking.league_id is null
    )
  ) into result
  from app.fantasy_seasons season
  left join lateral (
    select * from app.fantasy_gameweeks target
    where target.fantasy_season_id = season.id
      and target.status in ('open','locked','live','provisional','finalizing','finalized','corrected')
    order by target.sequence_number desc limit 1
  ) gameweek on true
  left join lateral app_private.fantasy_enrolment_gameweek(season.id) enrolment on true
  left join app.fantasy_teams team on team.fantasy_season_id = season.id
    and team.user_id = current_user_id and team.status = 'active'
  where season.status in ('registration_open','active')
  order by season.starts_at desc limit 1;
  if result is null then raise exception using errcode = 'PT404', message = 'fantasy_season_closed'; end if;
  return result;
end;
$$;

-- As in 20260720141854.
create or replace function api.get_my_fantasy_team(p_season_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare target_id uuid;
begin
  perform app_private.assert_mfa_step_up();
  if auth.uid() is null then raise exception using errcode = 'PT401', message = 'fantasy_team_not_found'; end if;
  select id into target_id from app.fantasy_teams
  where user_id = (select auth.uid()) and fantasy_season_id = p_season_id and status = 'active';
  if target_id is null then raise exception using errcode = 'PT404', message = 'fantasy_team_not_found'; end if;
  return app_private.fantasy_team_dto(target_id);
end;
$$;

-- As in 20260720141854.
create or replace function api.get_my_fantasy_history(
  p_team_id uuid,
  p_before_gameweek_sequence integer default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare team app.fantasy_teams%rowtype;
declare result jsonb;
begin
  perform app_private.assert_mfa_step_up();
  team := app_private.fantasy_assert_owner(p_team_id);
  if p_limit not between 1 and 50 then raise exception using errcode = 'PT400', message = 'validation_failed'; end if;
  with page as (
    select result_row.*, gameweek.sequence_number, gameweek.name as gameweek_name
    from app.fantasy_team_gameweek_results result_row
    join app.fantasy_gameweeks gameweek on gameweek.id = result_row.gameweek_id
    where result_row.fantasy_team_id = team.id
      and (p_before_gameweek_sequence is null or gameweek.sequence_number < p_before_gameweek_sequence)
    order by gameweek.sequence_number desc limit p_limit
  )
  select jsonb_build_object('items', coalesce(jsonb_agg(jsonb_build_object(
    'gameweekId', gameweek_id, 'sequence', sequence_number, 'name', gameweek_name,
    'score', coalesce(final_score, provisional_score), 'state', state,
    'transferHit', transfer_hit, 'chipType', chip_type, 'rank', rank,
    'overallRank', overall_rank, 'teamValue', team.team_value, 'bank', team.bank
  ) order by sequence_number desc), '[]'::jsonb),
  'nextCursor', case when count(*) = p_limit then min(sequence_number) else null end)
  into result from page;
  return result;
end;
$$;

-- As in 20260921200000.
create or replace function api.get_my_fantasy_points(p_team_id uuid, p_gameweek_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare team app.fantasy_teams%rowtype;
declare result jsonb;
begin
  perform app_private.assert_mfa_step_up();
  team := app_private.fantasy_assert_owner(p_team_id);
  select jsonb_build_object(
    'teamId', team.id, 'gameweekId', gameweek.id, 'gameweekStatus', gameweek.status,
    'pointsState', gameweek.points_state,
    'result', case when result_row.id is null then null else jsonb_build_object(
      'startingPoints', result_row.starting_points, 'benchPoints', result_row.bench_points,
      'captainPoints', result_row.captain_points, 'transferHit', result_row.transfer_hit,
      'chipType', result_row.chip_type, 'provisionalScore', result_row.provisional_score,
      'finalScore', result_row.final_score, 'state', result_row.state,
      'rank', result_row.rank, 'overallRank', result_row.overall_rank,
      'calculationVersion', result_row.calculation_version,
      'finalizedAt', result_row.finalized_at
    ) end,
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'fantasyPlayerId', lineup_player.fantasy_player_id, 'slot', lineup_player.slot,
      'slotOrder', lineup_player.slot_order, 'captain', lineup_player.captain,
      'viceCaptain', lineup_player.vice_captain, 'multiplier', lineup_player.multiplier,
      'provisionalPoints', points.provisional_points, 'finalPoints', points.final_points,
      'didPlay', points.did_play, 'minutesPlayed', points.minutes_played,
      -- BG-0075: the per-category lines behind a player's total. Only live
      -- ledger rows; a correction supersedes its predecessor rather than
      -- deleting it, and showing both would double the visible total.
      'events', coalesce((select jsonb_agg(jsonb_build_object(
        'category', point_event.category,
        'points', point_event.points,
        'fixtureId', point_event.fixture_id
      ) order by point_event.fixture_id, point_event.category)
      from app.fantasy_player_point_events point_event
      where point_event.fantasy_player_id = lineup_player.fantasy_player_id
        and point_event.gameweek_id = gameweek.id
        and point_event.superseded_at is null), '[]'::jsonb)
    ) order by lineup_player.slot, lineup_player.slot_order)
    from app.fantasy_lineups lineup
    join app.fantasy_lineup_players lineup_player on lineup_player.lineup_id = lineup.id
    left join app.fantasy_player_gameweek_points points
      on points.fantasy_player_id = lineup_player.fantasy_player_id and points.gameweek_id = gameweek.id
    where lineup.fantasy_team_id = team.id and lineup.gameweek_id = gameweek.id), '[]'::jsonb),
    -- BG-0075: the substitutions finalization made for this team in this
    -- gameweek, in the order it made them. Empty until the gameweek finalizes.
    'autoSubstitutions', coalesce((select jsonb_agg(jsonb_build_object(
      'playerOutId', substitution.player_out_id,
      'playerInId', substitution.player_in_id,
      'sequence', substitution.sequence_number,
      'reason', substitution.reason
    ) order by substitution.sequence_number)
    from app.fantasy_lineups lineup
    join app.fantasy_auto_substitutions substitution on substitution.lineup_id = lineup.id
    where lineup.fantasy_team_id = team.id and lineup.gameweek_id = gameweek.id), '[]'::jsonb)
  ) into result
  from app.fantasy_gameweeks gameweek
  left join app.fantasy_team_gameweek_results result_row
    on result_row.fantasy_team_id = team.id and result_row.gameweek_id = gameweek.id
  where gameweek.id = p_gameweek_id and gameweek.fantasy_season_id = team.fantasy_season_id;
  if result is null then raise exception using errcode = 'PT404', message = 'data_unavailable'; end if;
  return result;
end;
$$;

-- As in 20260803173344.
create or replace function api.preview_fantasy_transfers(
  p_team_id uuid,
  p_gameweek_id uuid,
  p_transfers jsonb,
  p_expected_version bigint,
  p_chip_type app.fantasy_chip_type default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare team app.fantasy_teams%rowtype;
declare gameweek app.fantasy_gameweeks%rowtype;
declare season app.fantasy_seasons%rowtype;
declare rules app.fantasy_rulesets%rowtype;
declare transfer_count integer;
declare sale_total numeric(10,2);
declare purchase_total numeric(10,2);
declare resulting_bank numeric(10,2);
declare free_used integer;
declare point_hit integer;
declare resulting_count integer;
declare club_violations integer;
declare quota_violations integer;
begin
  perform app_private.assert_mfa_step_up();
  team := app_private.fantasy_assert_owner(p_team_id);
  gameweek := app_private.fantasy_assert_mutable_gameweek(p_gameweek_id);
  if gameweek.fantasy_season_id <> team.fantasy_season_id then
    raise exception using errcode = 'PT400', message = 'invalid_transfer';
  end if;
  if team.version <> p_expected_version then
    raise exception using errcode = 'PT409', message = 'version_conflict',
      detail = jsonb_build_object('latestVersion', team.version)::text;
  end if;
  if jsonb_typeof(p_transfers) <> 'array' then
    raise exception using errcode = 'PT400', message = 'invalid_transfer';
  end if;
  select * into season from app.fantasy_seasons where id = team.fantasy_season_id;
  select * into rules from app.fantasy_rulesets where id = season.ruleset_id;

  with requested as (
    select * from jsonb_to_recordset(p_transfers)
      as item(player_out_id uuid, player_in_id uuid)
  )
  select count(*), coalesce(sum(out_membership.current_sale_price), 0),
    coalesce(sum(player_in.price), 0)
  into transfer_count, sale_total, purchase_total
  from requested
  join app.fantasy_squad_memberships out_membership
    on out_membership.fantasy_team_id = team.id
    and out_membership.fantasy_player_id = requested.player_out_id
    and out_membership.sold_at is null
  join app.fantasy_players player_out on player_out.id = requested.player_out_id
  join app.fantasy_players player_in on player_in.id = requested.player_in_id
    and player_in.fantasy_season_id = team.fantasy_season_id
    and player_in.active and player_in.eligible
    and player_in.status not in ('ineligible', 'unavailable')
  where player_out.position_id = player_in.position_id;

  if transfer_count < 1 or transfer_count > rules.squad_size
    or transfer_count <> jsonb_array_length(p_transfers)
    or (select count(distinct item->>'player_out_id') from jsonb_array_elements(p_transfers) item) <> transfer_count
    or (select count(distinct item->>'player_in_id') from jsonb_array_elements(p_transfers) item) <> transfer_count
    or exists (
      select 1 from jsonb_to_recordset(p_transfers)
        as item(player_out_id uuid, player_in_id uuid)
      where item.player_out_id = item.player_in_id
        or exists (
          select 1 from app.fantasy_squad_memberships membership
          where membership.fantasy_team_id = team.id
            and membership.fantasy_player_id = item.player_in_id
            and membership.sold_at is null
        )
    )
  then
    raise exception using errcode = 'PT400', message = 'invalid_transfer';
  end if;

  with requested as (
    select * from jsonb_to_recordset(p_transfers)
      as item(player_out_id uuid, player_in_id uuid)
  ), resulting as (
    select membership.fantasy_player_id
    from app.fantasy_squad_memberships membership
    where membership.fantasy_team_id = team.id and membership.sold_at is null
      and not exists (
        select 1 from requested where requested.player_out_id = membership.fantasy_player_id
      )
    union all
    select requested.player_in_id from requested
  ), resolved as (
    select player.position_id, player.football_team_id
    from resulting join app.fantasy_players player on player.id = resulting.fantasy_player_id
  )
  select count(*),
    (select count(*) from (
      select football_team_id from resolved group by football_team_id
      having count(*) > rules.max_players_per_club
    ) clubs),
    (select count(*) from app.fantasy_position_rules position_rule
      left join (
        select position_id, count(*) as player_count from resolved group by position_id
      ) position_count on position_count.position_id = position_rule.position_id
      where position_rule.ruleset_id = rules.id
        and coalesce(position_count.player_count, 0) <> position_rule.squad_quota)
  into resulting_count, club_violations, quota_violations
  from resolved;

  if resulting_count <> rules.squad_size or club_violations > 0 or quota_violations > 0 then
    raise exception using errcode = 'PT400', message = case
      when club_violations > 0 then 'club_limit_exceeded' else 'invalid_squad' end;
  end if;

  if p_chip_type is not null and not exists (
    select 1 from app.fantasy_chip_uses chip
    where chip.fantasy_team_id = team.id and chip.gameweek_id = gameweek.id
      and chip.chip_type = p_chip_type and chip.cancelled_at is null
      and chip.finalized_at is null
  ) then
    raise exception using errcode = 'PT409', message = 'chip_unavailable';
  end if;

  resulting_bank := team.bank + sale_total - purchase_total;
  if resulting_bank < 0 then
    raise exception using errcode = 'PT400', message = 'budget_exceeded';
  end if;
  free_used := least(team.free_transfers, transfer_count);
  point_hit := case when p_chip_type in ('wildcard','free_hit') then 0
    else greatest(transfer_count - free_used, 0) * rules.transfer_hit_cost end;
  return jsonb_build_object(
    'transferCount', transfer_count, 'bankBefore', team.bank,
    'bankAfter', resulting_bank, 'freeTransfersBefore', team.free_transfers,
    'freeTransfersUsed', case when p_chip_type in ('wildcard','free_hit') then 0 else free_used end,
    'pointHit', point_hit, 'resultingVersion', team.version + 1,
    'deadlineAt', gameweek.deadline_at, 'chipType', p_chip_type
  );
end;
$$;

-- As in 20260921120000.
create or replace function api.fantasy_leagues(
  p_season_id uuid,
  p_visibility text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  result jsonb;
  v_visibility app.fantasy_league_visibility;
begin
  perform app_private.assert_mfa_step_up();
  if p_limit not between 1 and 100 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  -- Resolve the enum here, where `app` is in reach. An unknown value is a
  -- client error, not a 500: report it the same way the limit check does,
  -- rather than letting a raw cast failure surface as an invalid_text_-
  -- representation from inside the function.
  if p_visibility is not null then
    begin
      v_visibility := p_visibility::app.fantasy_league_visibility;
    exception when invalid_text_representation then
      raise exception using errcode = 'PT400', message = 'validation_failed';
    end;
  end if;

  with visible as (
    select league.id, league.name, league.visibility, league.member_count,
      league.invite_code_hint, membership.role,
      ranking.rank, ranking.previous_rank, ranking.total_points,
      leader.name as leader_name
    from app.fantasy_leagues league
    left join app.fantasy_league_memberships membership
      on membership.league_id = league.id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
    left join app.fantasy_teams member_team on member_team.id = membership.fantasy_team_id
    left join app.fantasy_rankings ranking
      on ranking.league_id = league.id and ranking.fantasy_team_id = member_team.id
      and ranking.gameweek_id is null
    left join lateral (
      select ranked_team.name
      from app.fantasy_rankings leader_rank
      join app.fantasy_teams ranked_team on ranked_team.id = leader_rank.fantasy_team_id
      where leader_rank.league_id = league.id and leader_rank.gameweek_id is null
      order by leader_rank.rank, leader_rank.fantasy_team_id limit 1
    ) leader on true
    where league.fantasy_season_id = p_season_id and league.active
      and (v_visibility is null or league.visibility = v_visibility)
      and (league.visibility = 'public' or membership.id is not null)
    order by league.member_count desc, league.id
    limit p_limit
  )
  select jsonb_build_object('items', coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'visibility', visibility,
    'memberCount', member_count, 'inviteCodeHint', invite_code_hint,
    'role', role, 'rank', rank, 'previousRank', previous_rank,
    'totalPoints', total_points, 'leaderName', leader_name
  ) order by member_count desc, id), '[]'::jsonb)) into result from visible;

  return result;
end;
$function$;

-- As in 20260921200000.
create or replace function api.fantasy_league_standings(
  p_league_id uuid,
  p_gameweek_id uuid default null,
  p_after_rank bigint default null,
  p_after_team_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare target app.fantasy_leagues%rowtype;
declare items jsonb;
declare caller uuid := (select auth.uid());
begin
  perform app_private.assert_mfa_step_up();
  if p_limit not between 1 and 100 or ((p_after_rank is null) <> (p_after_team_id is null)) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  select * into target
  from app.fantasy_leagues
  where id = p_league_id and active;

  if not found then
    raise exception using errcode = 'PT404', message = 'league_not_found';
  end if;

  if target.visibility = 'private' and not exists (
    select 1
    from app.fantasy_league_memberships membership
    where membership.league_id = target.id
      and membership.user_id = caller
      and membership.status = 'active'
  ) then
    raise exception using errcode = 'PT403', message = 'league_access_denied';
  end if;

  if p_gameweek_id is null and p_after_rank is null then
    with ranked_page as materialized (
      select ranking.fantasy_team_id, ranking.rank, ranking.previous_rank,
        ranking.total_points, ranking.gameweek_points, ranking.calculated_at
      from app.fantasy_rankings ranking
      where ranking.league_id = target.id
        and ranking.gameweek_id is null
      order by ranking.rank, ranking.fantasy_team_id
      limit p_limit
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'teamId', ranked_page.fantasy_team_id, 'teamName', team.name,
      'managerName', case
        when caller is null then team.name
        else coalesce(nullif(btrim(profile.display_name), ''), team.name)
      end,
      'rank', ranked_page.rank, 'previousRank', ranked_page.previous_rank,
      'totalPoints', ranked_page.total_points,
      'gameweekPoints', ranked_page.gameweek_points,
      'calculatedAt', ranked_page.calculated_at
    ) order by ranked_page.rank, ranked_page.fantasy_team_id), '[]'::jsonb)
    into items
    from ranked_page
    join app.fantasy_teams team on team.id = ranked_page.fantasy_team_id
    left join app.profiles profile
      on profile.id = team.user_id and profile.deleted_at is null;
  elsif p_gameweek_id is null then
    with ranked_page as materialized (
      select ranking.fantasy_team_id, ranking.rank, ranking.previous_rank,
        ranking.total_points, ranking.gameweek_points, ranking.calculated_at
      from app.fantasy_rankings ranking
      where ranking.league_id = target.id
        and ranking.gameweek_id is null
        and (ranking.rank, ranking.fantasy_team_id) > (p_after_rank, p_after_team_id)
      order by ranking.rank, ranking.fantasy_team_id
      limit p_limit
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'teamId', ranked_page.fantasy_team_id, 'teamName', team.name,
      'managerName', case
        when caller is null then team.name
        else coalesce(nullif(btrim(profile.display_name), ''), team.name)
      end,
      'rank', ranked_page.rank, 'previousRank', ranked_page.previous_rank,
      'totalPoints', ranked_page.total_points,
      'gameweekPoints', ranked_page.gameweek_points,
      'calculatedAt', ranked_page.calculated_at
    ) order by ranked_page.rank, ranked_page.fantasy_team_id), '[]'::jsonb)
    into items
    from ranked_page
    join app.fantasy_teams team on team.id = ranked_page.fantasy_team_id
    left join app.profiles profile
      on profile.id = team.user_id and profile.deleted_at is null;
  elsif p_after_rank is null then
    with ranked_page as materialized (
      select ranking.fantasy_team_id, ranking.rank, ranking.previous_rank,
        ranking.total_points, ranking.gameweek_points, ranking.calculated_at
      from app.fantasy_rankings ranking
      where ranking.league_id = target.id
        and ranking.gameweek_id = p_gameweek_id
      order by ranking.rank, ranking.fantasy_team_id
      limit p_limit
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'teamId', ranked_page.fantasy_team_id, 'teamName', team.name,
      'managerName', case
        when caller is null then team.name
        else coalesce(nullif(btrim(profile.display_name), ''), team.name)
      end,
      'rank', ranked_page.rank, 'previousRank', ranked_page.previous_rank,
      'totalPoints', ranked_page.total_points,
      'gameweekPoints', ranked_page.gameweek_points,
      'calculatedAt', ranked_page.calculated_at
    ) order by ranked_page.rank, ranked_page.fantasy_team_id), '[]'::jsonb)
    into items
    from ranked_page
    join app.fantasy_teams team on team.id = ranked_page.fantasy_team_id
    left join app.profiles profile
      on profile.id = team.user_id and profile.deleted_at is null;
  else
    with ranked_page as materialized (
      select ranking.fantasy_team_id, ranking.rank, ranking.previous_rank,
        ranking.total_points, ranking.gameweek_points, ranking.calculated_at
      from app.fantasy_rankings ranking
      where ranking.league_id = target.id
        and ranking.gameweek_id = p_gameweek_id
        and (ranking.rank, ranking.fantasy_team_id) > (p_after_rank, p_after_team_id)
      order by ranking.rank, ranking.fantasy_team_id
      limit p_limit
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'teamId', ranked_page.fantasy_team_id, 'teamName', team.name,
      'managerName', case
        when caller is null then team.name
        else coalesce(nullif(btrim(profile.display_name), ''), team.name)
      end,
      'rank', ranked_page.rank, 'previousRank', ranked_page.previous_rank,
      'totalPoints', ranked_page.total_points,
      'gameweekPoints', ranked_page.gameweek_points,
      'calculatedAt', ranked_page.calculated_at
    ) order by ranked_page.rank, ranked_page.fantasy_team_id), '[]'::jsonb)
    into items
    from ranked_page
    join app.fantasy_teams team on team.id = ranked_page.fantasy_team_id
    left join app.profiles profile
      on profile.id = team.user_id and profile.deleted_at is null;
  end if;

  return jsonb_build_object(
    'league', jsonb_build_object(
      'id', target.id,
      'name', target.name,
      'visibility', target.visibility,
      'memberCount', target.member_count
    ),
    'items', items
  );
end;
$$;

-- As in 20260921180000.
create or replace function api.fantasy_overall_standings(
  p_season_id uuid,
  p_gameweek_id uuid default null,
  p_after_rank bigint default null,
  p_after_team_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid());
declare target_gameweek uuid;
declare items jsonb;
declare total bigint;
declare next_cursor jsonb;
declare my_rank jsonb;
declare last_rank bigint;
declare last_team uuid;
begin
  perform app_private.assert_mfa_step_up();
  -- Same validation contract as api.fantasy_league_standings: a page size
  -- outside 1..100, or half a cursor, is a client bug and not a 500.
  if p_season_id is null
    or p_limit is null
    or p_limit not between 1 and 100
    or ((p_after_rank is null) <> (p_after_team_id is null)) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  if not exists (select 1 from app.fantasy_seasons season where season.id = p_season_id) then
    raise exception using errcode = 'PT404', message = 'fantasy_season_not_found';
  end if;

  if p_gameweek_id is not null then
    -- A gameweek from another season is a foreign id, not an empty page.
    if not exists (
      select 1 from app.fantasy_gameweeks gameweek
      where gameweek.id = p_gameweek_id and gameweek.fantasy_season_id = p_season_id
    ) then
      raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found';
    end if;
    target_gameweek := p_gameweek_id;
  else
    -- Default scope resolution. The season cumulative board (gameweek_id is
    -- null) is preferred: it is what "overall standings" means, it carries both
    -- total_points and the latest gameweek_points, and it is exactly what
    -- api.fantasy_league_standings returns for a null p_gameweek_id, so the two
    -- readers speak one dialect. If the lifecycle runner has written the
    -- per-gameweek overall rows but not yet the cumulative ones, fall back to
    -- the latest gameweek that actually has overall rows. If neither exists --
    -- which is production today -- target_gameweek stays null and the scope
    -- predicate below matches nothing, yielding an empty page, not an error.
    if exists (
      select 1 from app.fantasy_rankings ranking
      where ranking.fantasy_season_id = p_season_id
        and ranking.league_id is null
        and ranking.gameweek_id is null
    ) then
      target_gameweek := null;
    else
      select ranking.gameweek_id into target_gameweek
      from app.fantasy_rankings ranking
      join app.fantasy_gameweeks gameweek on gameweek.id = ranking.gameweek_id
      where ranking.fantasy_season_id = p_season_id
        and ranking.league_id is null
        and ranking.gameweek_id is not null
      order by gameweek.sequence_number desc, gameweek.id desc
      limit 1;
    end if;
  end if;

  select count(*) into total
  from app.fantasy_rankings ranking
  where ranking.fantasy_season_id = p_season_id
    and ranking.league_id is null
    and (case
      when target_gameweek is null then ranking.gameweek_id is null
      else ranking.gameweek_id = target_gameweek
    end);

  -- Bound the ranking rows on the covering keyset index before joining team
  -- and profile data, so a 50k-team board never sorts the whole season.
  with ranked_page as materialized (
    select ranking.fantasy_team_id, ranking.rank, ranking.previous_rank,
      ranking.total_points, ranking.gameweek_points, ranking.calculated_at
    from app.fantasy_rankings ranking
    where ranking.fantasy_season_id = p_season_id
      and ranking.league_id is null
      and (case
        when target_gameweek is null then ranking.gameweek_id is null
        else ranking.gameweek_id = target_gameweek
      end)
      and (
        p_after_rank is null
        or (ranking.rank, ranking.fantasy_team_id) > (p_after_rank, p_after_team_id)
      )
    order by ranking.rank, ranking.fantasy_team_id
    limit p_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'teamId', ranked_page.fantasy_team_id,
      'teamName', team.name,
      'managerName', case
        when caller is null then team.name
        else coalesce(nullif(btrim(profile.display_name), ''), team.name)
      end,
      'rank', ranked_page.rank,
      'previousRank', ranked_page.previous_rank,
      'totalPoints', ranked_page.total_points,
      'gameweekPoints', ranked_page.gameweek_points,
      'calculatedAt', ranked_page.calculated_at
    ) order by ranked_page.rank, ranked_page.fantasy_team_id), '[]'::jsonb),
    max(ranked_page.rank),
    (array_agg(ranked_page.fantasy_team_id
      order by ranked_page.rank desc, ranked_page.fantasy_team_id desc))[1]
  into items, last_rank, last_team
  from ranked_page
  join app.fantasy_teams team on team.id = ranked_page.fantasy_team_id
  left join app.profiles profile
    on profile.id = team.user_id and profile.deleted_at is null;

  -- Only advertise a cursor when a row genuinely follows this page, so a client
  -- that follows nextCursor never burns a round trip on an empty tail.
  if last_team is not null and exists (
    select 1
    from app.fantasy_rankings ranking
    where ranking.fantasy_season_id = p_season_id
      and ranking.league_id is null
      and (case
        when target_gameweek is null then ranking.gameweek_id is null
        else ranking.gameweek_id = target_gameweek
      end)
      and (ranking.rank, ranking.fantasy_team_id) > (last_rank, last_team)
  ) then
    next_cursor := jsonb_build_object('rank', last_rank, 'teamId', last_team);
  end if;

  -- myRank is page-independent: the signed-in manager's own standing, whether
  -- or not it falls on the page being read. auth.uid() is null for anonymous
  -- callers, so no row matches and myRank is JSON null -- never an error.
  select jsonb_build_object(
    'teamId', ranking.fantasy_team_id,
    'teamName', team.name,
    'managerName', coalesce(nullif(btrim(profile.display_name), ''), team.name),
    'rank', ranking.rank,
    'previousRank', ranking.previous_rank,
    'totalPoints', ranking.total_points,
    'gameweekPoints', ranking.gameweek_points,
    'calculatedAt', ranking.calculated_at
  ) into my_rank
  from app.fantasy_rankings ranking
  join app.fantasy_teams team on team.id = ranking.fantasy_team_id
  left join app.profiles profile
    on profile.id = team.user_id and profile.deleted_at is null
  where ranking.fantasy_season_id = p_season_id
    and ranking.league_id is null
    and (case
      when target_gameweek is null then ranking.gameweek_id is null
      else ranking.gameweek_id = target_gameweek
    end)
    and team.user_id = caller
    and team.status = 'active'
  order by ranking.rank, ranking.fantasy_team_id
  limit 1;

  return jsonb_build_object(
    'seasonId', p_season_id,
    'gameweekId', target_gameweek,
    'items', items,
    'nextCursor', next_cursor,
    'total', total,
    'myRank', my_rank
  );
end;
$$;

-- As in 20260925200000.
create or replace function api.create_fantasy_team(
  p_season_id uuid,
  p_gameweek_id uuid,
  p_team_name text,
  p_selection jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
declare season app.fantasy_seasons%rowtype;
declare gameweek app.fantasy_gameweeks%rowtype;
declare requested app.fantasy_gameweeks%rowtype;
declare rules app.fantasy_rulesets%rowtype;
declare request_hash text;
declare existing_hash text;
declare cached_response jsonb;
declare target_team_id uuid;
declare target_lineup_id uuid;
declare squad_cost numeric(10,2);
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then raise exception using errcode = 'PT401', message = 'fantasy_team_not_found'; end if;
  if p_idempotency_key is null or p_team_name is null
    or p_team_name <> btrim(p_team_name) or char_length(p_team_name) not between 3 and 40
    or p_team_name !~ '^[[:alnum:]][[:alnum:] _''.-]{1,38}[[:alnum:]]$'
  then raise exception using errcode = 'PT400', message = 'invalid_team_name'; end if;
  select * into season from app.fantasy_seasons where id = p_season_id and status in ('registration_open','active');
  if not found then raise exception using errcode = 'PT409', message = 'fantasy_season_closed'; end if;
  select * into requested from app.fantasy_gameweeks where id = p_gameweek_id;
  if not found then raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found'; end if;
  if requested.fantasy_season_id <> season.id then raise exception using errcode = 'PT400', message = 'invalid_squad'; end if;
  -- A new team joins the gameweek a squad can still enter. The client names
  -- the one it showed the manager; any other gameweek -- past its deadline,
  -- or no longer the next one -- is refused with the long-standing code.
  gameweek := app_private.fantasy_enrolment_gameweek(season.id);
  if gameweek.id is null or gameweek.id <> requested.id then
    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_locked';
  end if;
  select * into rules from app.fantasy_rulesets where id = season.ruleset_id;
  request_hash := app_private.fantasy_selection_hash(p_team_name, p_gameweek_id, p_selection);
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(current_user_id::text || ':fantasy:create:' || p_season_id::text, 0));
  -- 20260925200000: a new squad is checked against the clubs as they stand
  -- once any player list update has finished, and an update waits for it.
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'fantasy:squads:' || season.id::text, 0));
  select fantasy_idempotency.request_hash, fantasy_idempotency.response_body
  into existing_hash, cached_response
  from app_private.fantasy_idempotency_keys fantasy_idempotency
  where fantasy_idempotency.user_id = current_user_id
    and fantasy_idempotency.operation = 'create_team'
    and fantasy_idempotency.idempotency_key = p_idempotency_key;
  if found then
    if existing_hash <> request_hash then raise exception using errcode = 'PT409', message = 'idempotency_conflict'; end if;
    return cached_response;
  end if;
  if exists (select 1 from app.fantasy_teams where user_id = current_user_id and fantasy_season_id = season.id) then
    raise exception using errcode = 'PT409', message = 'fantasy_team_already_exists';
  end if;
  perform app_private.fantasy_validate_selection(season.id, season.ruleset_id, p_selection);
  select sum(player.price) into squad_cost
  from jsonb_to_recordset(p_selection) as item(fantasy_player_id uuid)
  join app.fantasy_players player on player.id = item.fantasy_player_id;
  if squad_cost > rules.initial_budget then raise exception using errcode = 'PT400', message = 'budget_exceeded'; end if;
  insert into app.fantasy_teams (
    user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value, free_transfers
  ) values (
    current_user_id, season.id, gameweek.id, p_team_name,
    rules.initial_budget - squad_cost, squad_cost, rules.initial_free_transfers
  ) returning id into target_team_id;
  insert into app.fantasy_squad_memberships (
    fantasy_team_id, fantasy_player_id, purchase_price, current_sale_price, acquired_gameweek_id
  ) select target_team_id, player.id, player.price, player.price, gameweek.id
  from jsonb_to_recordset(p_selection) as item(fantasy_player_id uuid)
  join app.fantasy_players player on player.id = item.fantasy_player_id;
  insert into app.fantasy_lineups (fantasy_team_id, gameweek_id, team_version)
  values (target_team_id, gameweek.id, 1) returning id into target_lineup_id;
  insert into app.fantasy_lineup_players (
    lineup_id, fantasy_player_id, slot, slot_order, captain, vice_captain, multiplier, snapshot_price
  ) select target_lineup_id, item.fantasy_player_id, item.slot, item.slot_order,
    item.captain, item.vice_captain,
    case when item.captain then rules.captain_multiplier else 1 end, player.price
  from jsonb_to_recordset(p_selection) as item(
    fantasy_player_id uuid, slot app.fantasy_lineup_slot, slot_order integer,
    captain boolean, vice_captain boolean
  ) join app.fantasy_players player on player.id = item.fantasy_player_id;
  cached_response := app_private.fantasy_team_dto(target_team_id);
  insert into app_private.fantasy_idempotency_keys (
    user_id, operation, idempotency_key, request_hash, response_body, expires_at
  ) values (current_user_id, 'create_team', p_idempotency_key, request_hash, cached_response, statement_timestamp() + interval '7 days');
  insert into app_private.fantasy_mutation_audit (
    user_id, fantasy_team_id, operation, accepted, resulting_version, idempotency_key,
    safe_metadata
  ) values (current_user_id, target_team_id, 'create_team', true, 1, p_idempotency_key,
    jsonb_build_object('seasonId', season.id, 'gameweekId', gameweek.id));
  return cached_response;
end;
$$;

-- As in 20260720141854.
create or replace function api.save_fantasy_lineup(
  p_team_id uuid,
  p_gameweek_id uuid,
  p_selection jsonb,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
declare team app.fantasy_teams%rowtype;
declare season app.fantasy_seasons%rowtype;
declare rules app.fantasy_rulesets%rowtype;
declare target_lineup_id uuid;
declare request_hash text;
declare existing_hash text;
declare cached_response jsonb;
begin
  perform app_private.assert_mfa_step_up();
  team := app_private.fantasy_assert_owner(p_team_id);
  perform app_private.fantasy_assert_mutable_gameweek(p_gameweek_id);
  if p_expected_version is null or p_idempotency_key is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select * into season from app.fantasy_seasons where id = team.fantasy_season_id;
  select * into rules from app.fantasy_rulesets where id = season.ruleset_id;
  request_hash := app_private.fantasy_selection_hash(team.name, p_gameweek_id, p_selection);
  select fantasy_idempotency.request_hash, fantasy_idempotency.response_body
  into existing_hash, cached_response
  from app_private.fantasy_idempotency_keys fantasy_idempotency
  where fantasy_idempotency.user_id = current_user_id
    and fantasy_idempotency.operation = 'save_lineup'
    and fantasy_idempotency.idempotency_key = p_idempotency_key;
  if found then
    if existing_hash <> request_hash then raise exception using errcode = 'PT409', message = 'idempotency_conflict'; end if;
    return cached_response;
  end if;
  select * into team from app.fantasy_teams
  where id = p_team_id and user_id = current_user_id for update;
  if team.version <> p_expected_version then
    raise exception using errcode = 'PT409', message = 'version_conflict',
      detail = jsonb_build_object('latestVersion', team.version)::text;
  end if;
  perform app_private.fantasy_validate_selection(season.id, season.ruleset_id, p_selection);
  if exists (
    select 1 from jsonb_to_recordset(p_selection) as item(fantasy_player_id uuid)
    where not exists (
      select 1 from app.fantasy_squad_memberships membership
      where membership.fantasy_team_id = team.id
        and membership.fantasy_player_id = item.fantasy_player_id and membership.sold_at is null
    )
  ) then raise exception using errcode = 'PT400', message = 'invalid_squad'; end if;
  insert into app.fantasy_lineups (fantasy_team_id, gameweek_id, team_version)
  values (team.id, p_gameweek_id, team.version + 1)
  on conflict (fantasy_team_id, gameweek_id) do update set team_version = excluded.team_version
  where app.fantasy_lineups.locked_at is null and app.fantasy_lineups.finalized_at is null
  returning id into target_lineup_id;
  if target_lineup_id is null then raise exception using errcode = 'PT409', message = 'fantasy_gameweek_locked'; end if;
  delete from app.fantasy_lineup_players where lineup_id = target_lineup_id;
  insert into app.fantasy_lineup_players (
    lineup_id, fantasy_player_id, slot, slot_order, captain, vice_captain, multiplier, snapshot_price
  ) select target_lineup_id, item.fantasy_player_id, item.slot, item.slot_order,
    item.captain, item.vice_captain,
    case when item.captain then rules.captain_multiplier else 1 end, player.price
  from jsonb_to_recordset(p_selection) as item(
    fantasy_player_id uuid, slot app.fantasy_lineup_slot, slot_order integer,
    captain boolean, vice_captain boolean
  ) join app.fantasy_players player on player.id = item.fantasy_player_id;
  update app.fantasy_teams set version = version + 1, current_gameweek_id = p_gameweek_id
  where id = team.id returning version into team.version;
  cached_response := app_private.fantasy_team_dto(team.id);
  insert into app_private.fantasy_idempotency_keys (
    user_id, operation, idempotency_key, request_hash, response_body, expires_at
  ) values (current_user_id, 'save_lineup', p_idempotency_key, request_hash, cached_response, statement_timestamp() + interval '7 days');
  insert into app_private.fantasy_mutation_audit (
    user_id, fantasy_team_id, operation, accepted, base_version, resulting_version,
    idempotency_key, safe_metadata
  ) values (current_user_id, team.id, 'save_lineup', true, p_expected_version,
    team.version, p_idempotency_key, jsonb_build_object('gameweekId', p_gameweek_id));
  return cached_response;
end;
$$;

-- As in 20260925200000.
create or replace function api.confirm_fantasy_transfers(
  p_team_id uuid,
  p_gameweek_id uuid,
  p_transfers jsonb,
  p_expected_version bigint,
  p_idempotency_key uuid,
  p_chip_type app.fantasy_chip_type default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
declare team app.fantasy_teams%rowtype;
declare preview jsonb;
declare request_hash text;
declare existing_hash text;
declare cached_response jsonb;
declare target_batch_id uuid;
declare target_lineup_id uuid;
declare updated_lineup_players integer;
declare resulting_team_value numeric(10,2);
begin
  perform app_private.assert_mfa_step_up();
  team := app_private.fantasy_assert_owner(p_team_id);
  -- 20260925200000: transfers are checked against the clubs as they stand
  -- once any player list update has finished, and an update waits for them.
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'fantasy:squads:' || team.fantasy_season_id::text, 0));
  if p_idempotency_key is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  request_hash := encode(extensions.digest(convert_to(
    team.id::text || ':' || p_gameweek_id::text || ':' || p_transfers::text || ':'
      || coalesce(p_chip_type::text, ''), 'UTF8'
  ), 'sha256'), 'hex');
  select idempotency.request_hash, idempotency.response_body
  into existing_hash, cached_response
  from app_private.fantasy_idempotency_keys idempotency
  where idempotency.user_id = current_user_id
    and idempotency.operation = 'confirm_transfers'
    and idempotency.idempotency_key = p_idempotency_key;
  if found then
    if existing_hash <> request_hash then
      raise exception using errcode = 'PT409', message = 'idempotency_conflict';
    end if;
    return cached_response;
  end if;

  select * into team from app.fantasy_teams
  where id = p_team_id and user_id = current_user_id for update;
  preview := api.preview_fantasy_transfers(
    p_team_id, p_gameweek_id, p_transfers, p_expected_version, p_chip_type
  );
  select lineup.id into target_lineup_id
  from app.fantasy_lineups lineup
  where lineup.fantasy_team_id = team.id and lineup.gameweek_id = p_gameweek_id
    and lineup.locked_at is null and lineup.finalized_at is null
  for update;
  if target_lineup_id is null then
    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_locked';
  end if;

  if p_chip_type = 'free_hit' then
    insert into app.fantasy_free_hit_snapshots (
      chip_use_id, fantasy_team_id, gameweek_id, bank, team_value,
      free_transfers, team_version
    ) select chip.id, team.id, p_gameweek_id, team.bank, team.team_value,
      team.free_transfers, team.version
    from app.fantasy_chip_uses chip
    where chip.fantasy_team_id = team.id and chip.gameweek_id = p_gameweek_id
      and chip.chip_type = 'free_hit' and chip.cancelled_at is null
    on conflict (chip_use_id) do nothing;
    insert into app.fantasy_free_hit_snapshot_players (
      snapshot_id, fantasy_player_id, purchase_price, sale_price,
      acquired_gameweek_id
    ) select snapshot.id, membership.fantasy_player_id,
      membership.purchase_price, membership.current_sale_price,
      membership.acquired_gameweek_id
    from app.fantasy_free_hit_snapshots snapshot
    join app.fantasy_squad_memberships membership
      on membership.fantasy_team_id = team.id and membership.sold_at is null
    where snapshot.fantasy_team_id = team.id and snapshot.gameweek_id = p_gameweek_id
    on conflict (snapshot_id, fantasy_player_id) do nothing;
  end if;

  insert into app.fantasy_transfer_batches (
    fantasy_team_id, gameweek_id, idempotency_key, base_team_version,
    resulting_team_version, transfers_count, free_transfers_before,
    free_transfers_used, point_hit, bank_before, bank_after, chip_type
  ) values (
    team.id, p_gameweek_id, p_idempotency_key, team.version, team.version + 1,
    (preview->>'transferCount')::integer, team.free_transfers,
    (preview->>'freeTransfersUsed')::integer, (preview->>'pointHit')::integer,
    team.bank, (preview->>'bankAfter')::numeric, p_chip_type
  ) returning id into target_batch_id;

  insert into app.fantasy_transfers (
    transfer_batch_id, sequence_number, player_out_id, player_in_id,
    sale_price, purchase_price
  ) select target_batch_id, item.ordinality::integer,
    (item.value->>'player_out_id')::uuid,
    (item.value->>'player_in_id')::uuid,
    membership.current_sale_price, player_in.price
  from jsonb_array_elements(p_transfers) with ordinality as item(value, ordinality)
  join app.fantasy_squad_memberships membership
    on membership.fantasy_team_id = team.id
    and membership.fantasy_player_id = (item.value->>'player_out_id')::uuid
    and membership.sold_at is null
  join app.fantasy_players player_in
    on player_in.id = (item.value->>'player_in_id')::uuid;

  update app.fantasy_lineup_players lineup_player set
    fantasy_player_id = requested.player_in_id,
    snapshot_price = player_in.price,
    updated_at = statement_timestamp()
  from jsonb_to_recordset(p_transfers)
    as requested(player_out_id uuid, player_in_id uuid)
  join app.fantasy_players player_in on player_in.id = requested.player_in_id
  where lineup_player.lineup_id = target_lineup_id
    and lineup_player.fantasy_player_id = requested.player_out_id;
  get diagnostics updated_lineup_players = row_count;
  if updated_lineup_players <> (preview->>'transferCount')::integer then
    raise exception using errcode = 'PT400', message = 'invalid_squad';
  end if;

  update app.fantasy_squad_memberships membership set
    sold_gameweek_id = p_gameweek_id, sold_at = statement_timestamp()
  where membership.fantasy_team_id = team.id and membership.sold_at is null
    and membership.fantasy_player_id in (
      select item.player_out_id from jsonb_to_recordset(p_transfers)
        as item(player_out_id uuid)
    );
  insert into app.fantasy_squad_memberships (
    fantasy_team_id, fantasy_player_id, purchase_price, current_sale_price,
    acquired_gameweek_id
  ) select team.id, player.id, player.price, player.price, p_gameweek_id
  from jsonb_to_recordset(p_transfers) as item(player_in_id uuid)
  join app.fantasy_players player on player.id = item.player_in_id;

  select sum(player.price) into resulting_team_value
  from app.fantasy_squad_memberships membership
  join app.fantasy_players player on player.id = membership.fantasy_player_id
  where membership.fantasy_team_id = team.id and membership.sold_at is null;
  update app.fantasy_teams set
    bank = (preview->>'bankAfter')::numeric,
    team_value = resulting_team_value,
    free_transfers = case when p_chip_type in ('wildcard','free_hit') then free_transfers
      else greatest(free_transfers - (preview->>'freeTransfersUsed')::integer, 0) end,
    version = version + 1
  where id = team.id returning version into team.version;
  update app.fantasy_lineups set team_version = team.version,
    updated_at = statement_timestamp() where id = target_lineup_id;

  cached_response := jsonb_build_object(
    'transferBatchId', target_batch_id, 'preview', preview,
    'team', app_private.fantasy_team_dto(team.id)
  );
  insert into app_private.fantasy_idempotency_keys (
    user_id, operation, idempotency_key, request_hash, response_body, expires_at
  ) values (
    current_user_id, 'confirm_transfers', p_idempotency_key, request_hash,
    cached_response, statement_timestamp() + interval '30 days'
  );
  insert into app_private.fantasy_mutation_audit (
    user_id, fantasy_team_id, operation, accepted, base_version,
    resulting_version, idempotency_key, safe_metadata
  ) values (
    current_user_id, team.id, 'confirm_transfers', true, p_expected_version,
    team.version, p_idempotency_key, preview
  );
  return cached_response;
end;
$$;

-- As in 20260720163222.
create or replace function api.activate_fantasy_chip(
  p_team_id uuid,
  p_gameweek_id uuid,
  p_chip_type app.fantasy_chip_type,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
declare team app.fantasy_teams%rowtype;
declare gameweek app.fantasy_gameweeks%rowtype;
declare season app.fantasy_seasons%rowtype;
declare chip_rule app.fantasy_chip_rules%rowtype;
declare target app.fantasy_chip_uses%rowtype;
begin
  perform app_private.assert_mfa_step_up();
  team := app_private.fantasy_assert_owner(p_team_id);
  gameweek := app_private.fantasy_assert_mutable_gameweek(p_gameweek_id);
  if team.fantasy_season_id <> gameweek.fantasy_season_id or p_idempotency_key is null then
    raise exception using errcode = 'PT400', message = 'chip_unavailable';
  end if;
  select * into season from app.fantasy_seasons where id = team.fantasy_season_id;
  select * into chip_rule from app.fantasy_chip_rules rule
  where rule.ruleset_id = season.ruleset_id and rule.chip_type = p_chip_type
    and gameweek.sequence_number >= case
      when rule.allocation_code = 'wildcard_2'
        then coalesce(season.wildcard_split_gameweek + 1, rule.starts_at_gameweek)
      else rule.starts_at_gameweek end
    and (case
      when rule.allocation_code = 'wildcard_1'
        then coalesce(season.wildcard_split_gameweek, rule.ends_at_gameweek)
      else rule.ends_at_gameweek end is null
      or gameweek.sequence_number <= case
        when rule.allocation_code = 'wildcard_1'
          then coalesce(season.wildcard_split_gameweek, rule.ends_at_gameweek)
        else rule.ends_at_gameweek end)
  order by rule.starts_at_gameweek desc limit 1;
  if not found then raise exception using errcode = 'PT409', message = 'chip_unavailable'; end if;
  select * into team from app.fantasy_teams
  where id = p_team_id and user_id = current_user_id for update;
  if team.version <> p_expected_version then
    raise exception using errcode = 'PT409', message = 'version_conflict',
      detail = jsonb_build_object('latestVersion', team.version)::text;
  end if;
  select * into target from app.fantasy_chip_uses
  where fantasy_team_id = team.id and activation_idempotency_key = p_idempotency_key;
  if found then
    if target.chip_type <> p_chip_type or target.gameweek_id <> p_gameweek_id then
      raise exception using errcode = 'PT409', message = 'idempotency_conflict';
    end if;
    return jsonb_build_object('chipUseId', target.id, 'chipType', target.chip_type,
      'allocationCode', chip_rule.allocation_code, 'gameweekId', target.gameweek_id,
      'activatedAt', target.activated_at, 'teamVersion', team.version);
  end if;
  if exists (select 1 from app.fantasy_chip_uses use
    where use.fantasy_team_id = team.id and use.chip_rule_id = chip_rule.id) then
    raise exception using errcode = 'PT409', message = 'chip_already_used';
  end if;
  if exists (select 1 from app.fantasy_chip_uses use
    where use.fantasy_team_id = team.id and use.gameweek_id = p_gameweek_id) then
    raise exception using errcode = 'PT409', message = 'chip_conflict';
  end if;
  insert into app.fantasy_chip_uses (
    fantasy_team_id, gameweek_id, chip_type, chip_rule_id, activation_idempotency_key
  ) values (team.id, p_gameweek_id, p_chip_type, chip_rule.id, p_idempotency_key)
  returning * into target;
  update app.fantasy_teams set version = version + 1
  where id = team.id returning version into team.version;
  insert into app_private.fantasy_mutation_audit (
    user_id, fantasy_team_id, operation, accepted, base_version, resulting_version,
    idempotency_key, safe_metadata
  ) values (current_user_id, team.id, 'activate_chip', true, p_expected_version,
    team.version, p_idempotency_key, jsonb_build_object(
      'chipType', p_chip_type, 'allocationCode', chip_rule.allocation_code,
      'gameweekId', p_gameweek_id
    ));
  return jsonb_build_object('chipUseId', target.id, 'chipType', target.chip_type,
    'allocationCode', chip_rule.allocation_code, 'gameweekId', target.gameweek_id,
    'activatedAt', target.activated_at, 'teamVersion', team.version);
end;
$$;

-- As in 20260720163222.
create or replace function api.cancel_fantasy_chip(
  p_team_id uuid,
  p_gameweek_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
declare team app.fantasy_teams%rowtype;
declare target app.fantasy_chip_uses%rowtype;
declare rule app.fantasy_chip_rules%rowtype;
begin
  perform app_private.assert_mfa_step_up();
  team := app_private.fantasy_assert_owner(p_team_id);
  perform app_private.fantasy_assert_mutable_gameweek(p_gameweek_id);
  select * into team from app.fantasy_teams
  where id = p_team_id and user_id = current_user_id for update;
  if team.version <> p_expected_version then
    raise exception using errcode = 'PT409', message = 'version_conflict';
  end if;
  select * into target from app.fantasy_chip_uses use
  where use.fantasy_team_id = team.id and use.gameweek_id = p_gameweek_id
    and use.cancelled_at is null and use.finalized_at is null;
  if not found then raise exception using errcode = 'PT409', message = 'chip_unavailable'; end if;
  if target.chip_rule_id is not null then
    select * into rule from app.fantasy_chip_rules where id = target.chip_rule_id;
    if not rule.activation_cancellable then
      raise exception using errcode = 'PT409', message = 'chip_unavailable';
    end if;
  end if;
  if exists (select 1 from app.fantasy_transfer_batches batch
    where batch.fantasy_team_id = team.id and batch.gameweek_id = p_gameweek_id
      and batch.chip_type in ('wildcard','free_hit')) then
    raise exception using errcode = 'PT409', message = 'chip_unavailable';
  end if;
  update app.fantasy_chip_uses set cancelled_at = statement_timestamp() where id = target.id;
  update app.fantasy_teams set version = version + 1
  where id = team.id returning version into team.version;
  insert into app_private.fantasy_mutation_audit (
    user_id, fantasy_team_id, operation, accepted, base_version, resulting_version, safe_metadata
  ) values (current_user_id, team.id, 'cancel_chip', true, p_expected_version,
    team.version, jsonb_build_object('gameweekId', p_gameweek_id));
  return jsonb_build_object('cancelled', true, 'teamVersion', team.version);
end;
$$;

-- As in 20260720141854.
create or replace function api.create_fantasy_league(
  p_season_id uuid,
  p_team_id uuid,
  p_name text,
  p_visibility app.fantasy_league_visibility,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
declare team app.fantasy_teams%rowtype;
declare league_id uuid;
declare invite_code text;
declare digest text;
begin
  perform app_private.assert_mfa_step_up();
  team := app_private.fantasy_assert_owner(p_team_id);
  if team.fantasy_season_id <> p_season_id or p_idempotency_key is null
    or p_name is null or p_name <> btrim(p_name) or char_length(p_name) not between 3 and 80
  then raise exception using errcode = 'PT400', message = 'validation_failed'; end if;
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(current_user_id::text || ':fantasy:league:' || p_idempotency_key::text, 0));
  select (response_body->>'leagueId')::uuid into league_id
  from app_private.fantasy_idempotency_keys
  where user_id = current_user_id and operation = 'create_league' and idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('leagueId', league_id, 'created', false); end if;
  if p_visibility = 'private' then
    invite_code := upper(encode(extensions.gen_random_bytes(16), 'hex'));
    digest := encode(extensions.digest(convert_to(invite_code, 'UTF8'), 'sha256'), 'hex');
  end if;
  insert into app.fantasy_leagues (
    fantasy_season_id, owner_user_id, name, visibility, invite_code_digest, invite_code_hint
  ) values (p_season_id, current_user_id, p_name, p_visibility, digest,
    case when invite_code is null then null else right(invite_code, 4) end)
  returning id into league_id;
  insert into app.fantasy_league_memberships (league_id, fantasy_team_id, user_id, role)
  values (league_id, team.id, current_user_id, 'owner');
  insert into app_private.fantasy_idempotency_keys (
    user_id, operation, idempotency_key, request_hash, response_body, expires_at
  ) values (current_user_id, 'create_league', p_idempotency_key,
    encode(extensions.digest(convert_to(p_name || ':' || p_visibility::text, 'UTF8'), 'sha256'), 'hex'),
    jsonb_build_object('leagueId', league_id), statement_timestamp() + interval '30 days');
  return jsonb_build_object('leagueId', league_id, 'name', p_name,
    'visibility', p_visibility, 'inviteCode', invite_code, 'created', true);
end;
$$;

-- As in 20260720141854.
create or replace function api.join_fantasy_league(
  p_team_id uuid,
  p_invite_code text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
declare team app.fantasy_teams%rowtype;
declare target app.fantasy_leagues%rowtype;
declare code_digest text;
begin
  perform app_private.assert_mfa_step_up();
  team := app_private.fantasy_assert_owner(p_team_id);
  if p_invite_code is null or p_idempotency_key is null then
    raise exception using errcode = 'PT400', message = 'invite_code_invalid';
  end if;
  code_digest := encode(extensions.digest(convert_to(upper(btrim(p_invite_code)), 'UTF8'), 'sha256'), 'hex');
  select * into target from app.fantasy_leagues
  where invite_code_digest = code_digest and visibility = 'private' and active for update;
  if not found or target.fantasy_season_id <> team.fantasy_season_id then
    raise exception using errcode = 'PT404', message = 'invite_code_invalid';
  end if;
  if exists (select 1 from app.fantasy_league_memberships
    where league_id = target.id and user_id = current_user_id and status = 'active') then
    return jsonb_build_object('leagueId', target.id, 'joined', false);
  end if;
  insert into app.fantasy_league_memberships (league_id, fantasy_team_id, user_id)
  values (target.id, team.id, current_user_id)
  on conflict (league_id, user_id) do update set status = 'active', left_at = null, fantasy_team_id = excluded.fantasy_team_id;
  update app.fantasy_leagues set member_count = member_count + 1 where id = target.id;
  return jsonb_build_object('leagueId', target.id, 'joined', true);
end;
$$;

-- As in 20260720141854.
create or replace function api.leave_fantasy_league(p_league_id uuid, p_team_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
begin
  perform app_private.assert_mfa_step_up();
  perform app_private.fantasy_assert_owner(p_team_id);
  update app.fantasy_league_memberships set status = 'left', left_at = statement_timestamp()
  where league_id = p_league_id and fantasy_team_id = p_team_id
    and user_id = current_user_id and role <> 'owner' and status = 'active';
  if not found then raise exception using errcode = 'PT403', message = 'league_access_denied'; end if;
  update app.fantasy_leagues set member_count = greatest(member_count - 1, 0) where id = p_league_id;
  return true;
end;
$$;

-- As in 20260720173500.
create or replace function api.archive_fantasy_league(
  p_league_id uuid,
  p_team_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
begin
  perform app_private.assert_mfa_step_up();
  perform app_private.fantasy_assert_owner(p_team_id);
  update app.fantasy_leagues league set active = false
  where league.id = p_league_id and league.owner_user_id = current_user_id
    and exists (
      select 1 from app.fantasy_league_memberships membership
      where membership.league_id = league.id
        and membership.fantasy_team_id = p_team_id
        and membership.user_id = current_user_id
        and membership.role = 'owner' and membership.status = 'active'
    );
  if not found then
    raise exception using errcode = 'PT403', message = 'league_access_denied';
  end if;
  insert into app_private.fantasy_mutation_audit (
    user_id, fantasy_team_id, operation, accepted, safe_metadata
  ) values (current_user_id, p_team_id, 'archive_league', true,
    jsonb_build_object('leagueId', p_league_id));
  return true;
end;
$$;

-- Pronostics

-- As in 20260925090200.
create or replace function api.my_predictions(
  p_round_number integer default null,
  p_fixture_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  now_ts timestamptz := statement_timestamp();
  v_season_id uuid;
  target_id uuid;
  items jsonb := '[]'::jsonb;
  total_fixtures integer := 0;
  round_row app.prediction_standings%rowtype;
  season_row app.prediction_standings%rowtype;
begin
  perform app_private.assert_mfa_step_up();
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  v_season_id := app_private.predictions_current_season();
  if v_season_id is null then
    return jsonb_build_object('serverTime', now_ts, 'items', '[]'::jsonb, 'summary', null);
  end if;

  if p_fixture_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
        'fixtureId', prediction.fixture_id,
        -- In the match's current orientation, as the scoring reads it: a
        -- provider home/away swap after the save still shows the pick
        -- against the teams the player chose.
        'home', case when (prediction.home_team_id, prediction.away_team_id)
            = (fixture.away_team_id, fixture.home_team_id)
          then prediction.away_goals else prediction.home_goals end,
        'away', case when (prediction.home_team_id, prediction.away_team_id)
            = (fixture.away_team_id, fixture.home_team_id)
          then prediction.home_goals else prediction.away_goals end,
        'submittedAt', prediction.submitted_at,
        'points', prediction.points,
        'resultKind', prediction.result_kind
      )), '[]'::jsonb)
    into items
    from app.predictions prediction
    join app.fixtures fixture on fixture.id = prediction.fixture_id
    where prediction.user_id = caller and prediction.fixture_id = p_fixture_id
      and fixture.season_id = v_season_id;
    return jsonb_build_object('serverTime', now_ts, 'items', items, 'summary', null);
  end if;

  target_id := app_private.predictions_resolve_round(v_season_id, p_round_number, now_ts);
  if target_id is null then
    return jsonb_build_object('serverTime', now_ts, 'items', '[]'::jsonb, 'summary', null);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'fixtureId', prediction.fixture_id,
      'home', case when (prediction.home_team_id, prediction.away_team_id)
          = (fixture.away_team_id, fixture.home_team_id)
        then prediction.away_goals else prediction.home_goals end,
      'away', case when (prediction.home_team_id, prediction.away_team_id)
          = (fixture.away_team_id, fixture.home_team_id)
        then prediction.home_goals else prediction.away_goals end,
      'submittedAt', prediction.submitted_at,
      'points', prediction.points,
      'resultKind', prediction.result_kind
    ) order by fixture.kickoff_at, fixture.id), '[]'::jsonb)
  into items
  from app.predictions prediction
  join app.fixtures fixture on fixture.id = prediction.fixture_id
  where prediction.user_id = caller and fixture.round_id = target_id;

  select count(*) into total_fixtures
  from app.fixtures fixture
  left join app_private.prediction_fixture_scoring scoring on scoring.fixture_id = fixture.id
  where fixture.round_id = target_id
    and fixture.status not in ('cancelled', 'abandoned')
    and scoring.override is distinct from 'void';

  select * into round_row from app.prediction_standings standing
  where standing.round_id = target_id and standing.user_id = caller;
  select * into season_row from app.prediction_standings standing
  where standing.season_id = v_season_id and standing.round_id is null and standing.user_id = caller;

  return jsonb_build_object(
    'serverTime', now_ts,
    'items', items,
    'summary', jsonb_build_object(
      'predicted', jsonb_array_length(items),
      'total', total_fixtures,
      'points', coalesce(round_row.points, 0),
      'exact', coalesce(round_row.exact_count, 0),
      'rank', round_row.rank,
      'seasonPoints', coalesce(season_row.points, 0),
      'seasonRank', season_row.rank,
      'roundsPlayed', coalesce(season_row.rounds_played, 0)
    )
  );
end;
$$;

-- As in 20260925090200.
create or replace function api.predictions_leaderboard(
  p_scope text default 'round',
  p_round_number integer default null,
  p_after_rank integer default null,
  p_after_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  now_ts timestamptz := statement_timestamp();
  settings app_private.prediction_settings%rowtype;
  v_season_id uuid;
  v_round_id uuid;
  v_round_number integer;
  page_ids uuid[];
  items jsonb := '[]'::jsonb;
  total integer;
  me jsonb;
  last_rank integer;
  last_id uuid;
  round_state text;
  matches_left integer;
  has_more boolean;
begin
  perform app_private.assert_mfa_step_up();
  if p_scope is null or p_scope not in ('round', 'season')
    or p_limit is null or p_limit not between 1 and 100
    or ((p_after_rank is null) <> (p_after_id is null))
  then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select * into settings from app_private.prediction_settings where id;
  if not app_private.predictions_access_allowed(caller) then
    return jsonb_build_object('allowed', false, 'mode', settings.mode);
  end if;
  v_season_id := app_private.predictions_current_season();
  if p_scope = 'round' then
    v_round_id := app_private.predictions_resolve_round(v_season_id, p_round_number, now_ts);
  end if;
  if v_season_id is null or (p_scope = 'round' and v_round_id is null) then
    return jsonb_build_object('allowed', true, 'scope', p_scope, 'items', '[]'::jsonb,
      'total', 0, 'nextCursor', null, 'me', null);
  end if;

  -- The page: one index range per scope (journée rows, or season rows).
  if p_scope = 'round' then
    select round_number into v_round_number from app.rounds where id = v_round_id;
    round_state := app_private.prediction_round_state(v_round_id, now_ts);
    select count(*) into matches_left
    from app.fixtures fixture
    left join app_private.prediction_fixture_scoring scoring on scoring.fixture_id = fixture.id
    where fixture.round_id = v_round_id
      and not (fixture.status = 'finished' and fixture.finalized_at is not null)
      and fixture.status not in ('cancelled', 'abandoned')
      and scoring.override is distinct from 'void';

    select array_agg(page.id order by page.rank, page.id) into page_ids
    from (
      select standing.id, standing.rank
      from app.prediction_standings standing
      join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
      where standing.round_id = v_round_id and standing.rank is not null
        and (p_after_rank is null or (standing.rank, standing.id) > (p_after_rank, p_after_id))
        and not exists (
          select 1 from app_private.user_bans ban
          where ban.user_id = standing.user_id and ban.lifted_at is null
            and ban.starts_at <= now_ts and (ban.ends_at is null or ban.ends_at > now_ts)
        )
      order by standing.rank, standing.id
      limit p_limit + 1
    ) page;
    if p_after_rank is null then
      select count(*) into total
      from app.prediction_standings standing
      join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
      where standing.round_id = v_round_id and standing.rank is not null
        and not exists (
          select 1 from app_private.user_bans ban
          where ban.user_id = standing.user_id and ban.lifted_at is null
            and ban.starts_at <= now_ts and (ban.ends_at is null or ban.ends_at > now_ts)
        );
    end if;
    if caller is not null then
      select jsonb_build_object('rank', standing.rank, 'points', standing.points,
        'exact', standing.exact_count)
      into me from app.prediction_standings standing
      where standing.round_id = v_round_id and standing.user_id = caller;
    end if;
  else
    select array_agg(page.id order by page.rank, page.id) into page_ids
    from (
      select standing.id, standing.rank
      from app.prediction_standings standing
      join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
      where standing.season_id = v_season_id and standing.round_id is null
        and standing.rank is not null
        and (p_after_rank is null or (standing.rank, standing.id) > (p_after_rank, p_after_id))
        and not exists (
          select 1 from app_private.user_bans ban
          where ban.user_id = standing.user_id and ban.lifted_at is null
            and ban.starts_at <= now_ts and (ban.ends_at is null or ban.ends_at > now_ts)
        )
      order by standing.rank, standing.id
      limit p_limit + 1
    ) page;
    if p_after_rank is null then
      select count(*) into total
      from app.prediction_standings standing
      join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
      where standing.season_id = v_season_id and standing.round_id is null
        and standing.rank is not null
        and not exists (
          select 1 from app_private.user_bans ban
          where ban.user_id = standing.user_id and ban.lifted_at is null
            and ban.starts_at <= now_ts and (ban.ends_at is null or ban.ends_at > now_ts)
        );
    end if;
    if caller is not null then
      select jsonb_build_object('rank', standing.rank, 'points', standing.points,
        'exact', standing.exact_count, 'roundsPlayed', standing.rounds_played)
      into me from app.prediction_standings standing
      where standing.season_id = v_season_id and standing.round_id is null
        and standing.user_id = caller;
    end if;
  end if;

  -- One row more than asked says whether another page follows.
  has_more := coalesce(cardinality(page_ids), 0) > p_limit;
  if has_more then
    page_ids := page_ids[1:p_limit];
  end if;

  -- The rows of the page (at most p_limit), with names and ties.
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', standing.id,
      'rank', standing.rank,
      -- Two probes so each one stays on its own partial rank index.
      'tied', case
        when standing.round_id is null then exists (
          select 1 from app.prediction_standings other
          where other.season_id = standing.season_id and other.round_id is null
            and other.rank = standing.rank and other.id <> standing.id)
        else exists (
          select 1 from app.prediction_standings other
          where other.round_id = standing.round_id
            and other.rank = standing.rank and other.id <> standing.id)
      end,
      'name', case
        when caller is null then app_private.fantasy_mask_username(profile.username)
        else coalesce(nullif(btrim(profile.display_name), ''),
          app_private.fantasy_mask_username(profile.username))
      end,
      'points', standing.points,
      'exact', standing.exact_count,
      'roundsPlayed', standing.rounds_played,
      'isMe', coalesce(standing.user_id = caller, false)
    ) order by standing.rank, standing.id), '[]'::jsonb),
    (array_agg(standing.rank order by standing.rank desc, standing.id desc))[1],
    (array_agg(standing.id order by standing.rank desc, standing.id desc))[1]
  into items, last_rank, last_id
  from app.prediction_standings standing
  left join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
  where standing.id = any(coalesce(page_ids, '{}'::uuid[]));

  return jsonb_build_object(
    'allowed', true,
    'scope', p_scope,
    'round', v_round_number,
    'provisional', case when p_scope = 'round' then round_state <> 'completed' end,
    'matchesLeft', matches_left,
    'total', total,
    'items', items,
    'nextCursor', case when has_more
      then jsonb_build_object('rank', last_rank, 'id', last_id) end,
    'me', me
  );
end;
$$;

-- As in 20260925090300.
create or replace function api.my_prediction_leagues()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  v_fantasy_season_id uuid;
  v_season_id uuid;
  items jsonb := '[]'::jsonb;
begin
  perform app_private.assert_mfa_step_up();
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  v_fantasy_season_id := app_private.predictions_current_fantasy_season();
  v_season_id := app_private.predictions_current_season();
  if v_fantasy_season_id is null then
    return jsonb_build_object('items', items);
  end if;

  with mine as (
    select membership.league_id, 'fantasy'::text as via
    from app.fantasy_league_memberships membership
    where membership.user_id = caller and membership.status = 'active'
    union all
    select member.league_id, 'predictions'::text
    from app.prediction_league_members member
    where member.user_id = caller and member.status = 'active'
  ),
  leagues as (
    select distinct on (mine.league_id) mine.league_id, mine.via
    from mine
    order by mine.league_id, (mine.via = 'fantasy') desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'leagueId', league.id,
      'name', league.name,
      'via', leagues.via,
      'role', case when league.owner_user_id = caller then 'owner' else 'member' end,
      'members', (
        select count(*) from (
          select membership.user_id from app.fantasy_league_memberships membership
          where membership.league_id = league.id and membership.status = 'active'
          union
          select member.user_id from app.prediction_league_members member
          where member.league_id = league.id and member.status = 'active'
        ) everyone
      ),
      'inviteCodeHint', case when league.owner_user_id = caller then league.invite_code_hint end,
      'seasonPoints', coalesce((
        select standing.points from app.prediction_standings standing
        where standing.user_id = caller and standing.season_id = v_season_id
          and standing.round_id is null
      ), 0)
    ) order by league.name, league.id), '[]'::jsonb)
  into items
  from leagues
  join app.fantasy_leagues league on league.id = leagues.league_id
  where league.active and league.fantasy_season_id = v_fantasy_season_id;

  return jsonb_build_object('items', items);
end;
$$;

-- As in 20260925090300.
create or replace function api.predictions_league_standings(
  p_league_id uuid,
  p_round_number integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  now_ts timestamptz := statement_timestamp();
  target app.fantasy_leagues%rowtype;
  v_season_id uuid;
  v_round_id uuid;
  items jsonb := '[]'::jsonb;
  member_total integer := 0;
  ranked_total integer := 0;
begin
  perform app_private.assert_mfa_step_up();
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  select * into target from app.fantasy_leagues league
  where league.id = p_league_id and league.active;
  if target.id is null or not app_private.prediction_league_is_member(target.id, caller) then
    raise exception using errcode = 'PT403', message = 'league_access_denied';
  end if;
  v_season_id := app_private.predictions_current_season();
  if p_round_number is not null then
    v_round_id := app_private.predictions_resolve_round(v_season_id, p_round_number, now_ts);
  end if;

  with members as (
    select membership.user_id from app.fantasy_league_memberships membership
    where membership.league_id = target.id and membership.status = 'active'
    union
    select member.user_id from app.prediction_league_members member
    where member.league_id = target.id and member.status = 'active'
  ),
  scored as (
    select standing.user_id, standing.points, standing.exact_count, standing.rounds_played
    from members
    join app.prediction_standings standing on standing.user_id = members.user_id
    join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
    where standing.scored_count > 0
      and (
        (v_round_id is not null and standing.round_id = v_round_id)
        or (v_round_id is null and standing.season_id = v_season_id and standing.round_id is null)
      )
      and not exists (
        select 1 from app_private.user_bans ban
        where ban.user_id = standing.user_id and ban.lifted_at is null
          and ban.starts_at <= now_ts and (ban.ends_at is null or ban.ends_at > now_ts)
      )
  ),
  ranked as (
    select scored.*,
      rank() over (order by scored.points desc, scored.exact_count desc) as position,
      count(*) over (partition by scored.points, scored.exact_count) > 1 as tied
    from scored
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'rank', ranked.position,
      'tied', ranked.tied,
      'name', coalesce(nullif(btrim(profile.display_name), ''),
        app_private.fantasy_mask_username(profile.username)),
      'points', ranked.points,
      'exact', ranked.exact_count,
      'roundsPlayed', ranked.rounds_played,
      'isMe', ranked.user_id = caller
    ) order by ranked.position, ranked.user_id), '[]'::jsonb),
    count(*)
  into items, ranked_total
  from ranked
  join app.profiles profile on profile.id = ranked.user_id;

  select count(*) into member_total from (
    select membership.user_id from app.fantasy_league_memberships membership
    where membership.league_id = target.id and membership.status = 'active'
    union
    select member.user_id from app.prediction_league_members member
    where member.league_id = target.id and member.status = 'active'
  ) everyone;

  return jsonb_build_object(
    'league', jsonb_build_object('id', target.id, 'name', target.name,
      'isOwner', target.owner_user_id = caller,
      'inviteCodeHint', case when target.owner_user_id = caller then target.invite_code_hint end),
    'scope', case when v_round_id is null then 'season' else 'round' end,
    'round', p_round_number,
    'items', items,
    'members', member_total,
    'notPlayed', greatest(member_total - ranked_total, 0)
  );
end;
$$;

-- As in 20260925090200.
create or replace function api.save_predictions(p_items jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  now_ts timestamptz := statement_timestamp();
  settings app_private.prediction_settings%rowtype;
  v_season_id uuid;
  results jsonb;
begin
  perform app_private.assert_mfa_step_up();
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  select * into settings from app_private.prediction_settings where id;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  perform app_private.predictions_assert_items(p_items, settings.max_items_per_save);
  v_season_id := app_private.predictions_current_season();

  with input as (
    select (item.value ->> 'fixtureId')::uuid as fixture_id,
      (item.value ->> 'home')::smallint as home_goals,
      (item.value ->> 'away')::smallint as away_goals,
      item.ordinality as position
    from jsonb_array_elements(p_items) with ordinality as item
  ),
  candidate as (
    select input.*, fixture.home_team_id, fixture.away_team_id,
      coalesce(fixture.id is not null and fixture.season_id = v_season_id
        and fixture.round_id is not null, false) as eligible,
      coalesce(fixture.id is not null and fixture.season_id = v_season_id
        and fixture.round_id is not null
        and app_private.prediction_fixture_open(fixture.status, fixture.kickoff_at, now_ts), false)
        as is_open
    from input
    left join app.fixtures fixture on fixture.id = input.fixture_id
  ),
  written as (
    insert into app.predictions as prediction (
      user_id, fixture_id, home_goals, away_goals, home_team_id, away_team_id, origin, submitted_at
    )
    select caller, candidate.fixture_id, candidate.home_goals, candidate.away_goals,
      candidate.home_team_id, candidate.away_team_id, 'direct', now_ts
    from candidate
    where candidate.is_open
    on conflict (fixture_id, user_id) do update set
      home_goals = excluded.home_goals,
      away_goals = excluded.away_goals,
      home_team_id = excluded.home_team_id,
      away_team_id = excluded.away_team_id,
      submitted_at = excluded.submitted_at
    where (prediction.home_goals, prediction.away_goals, prediction.home_team_id, prediction.away_team_id)
      is distinct from (excluded.home_goals, excluded.away_goals, excluded.home_team_id, excluded.away_team_id)
    returning prediction.fixture_id, prediction.home_goals, prediction.away_goals, prediction.submitted_at
  )
  select jsonb_agg(jsonb_build_object(
      'fixtureId', candidate.fixture_id,
      'status', case
        when written.fixture_id is not null then 'saved'
        when candidate.is_open then 'unchanged'
        when candidate.eligible then 'locked'
        else 'not_eligible'
      end,
      'home', coalesce(written.home_goals, existing.home_goals),
      'away', coalesce(written.away_goals, existing.away_goals),
      'submittedAt', coalesce(written.submitted_at, existing.submitted_at)
    ) order by candidate.position)
  into results
  from candidate
  left join written on written.fixture_id = candidate.fixture_id
  left join app.predictions existing
    on existing.fixture_id = candidate.fixture_id and existing.user_id = caller;

  return jsonb_build_object('serverTime', now_ts, 'results', results);
end;
$$;

-- As in 20260925090200.
create or replace function api.claim_guest_predictions(p_items jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  now_ts timestamptz := statement_timestamp();
  settings app_private.prediction_settings%rowtype;
  v_season_id uuid;
  results jsonb;
  imported_count integer;
  kept_count integer;
  started_count integer;
  invalid_count integer;
begin
  perform app_private.assert_mfa_step_up();
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  select * into settings from app_private.prediction_settings where id;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  perform app_private.predictions_assert_items(p_items, settings.max_claim_items);
  v_season_id := app_private.predictions_current_season();

  -- One statement: every CTE reads the same snapshot, so had_prediction is the
  -- account's state before this call; a concurrent save for the same match is
  -- absorbed by "on conflict do nothing" and reported as kept.
  with input as (
    select (item.value ->> 'fixtureId')::uuid as fixture_id,
      (item.value ->> 'home')::smallint as home_goals,
      (item.value ->> 'away')::smallint as away_goals,
      (item.value ->> 'homeTeamId')::uuid as claimed_home,
      (item.value ->> 'awayTeamId')::uuid as claimed_away,
      item.ordinality as position
    from jsonb_array_elements(p_items) with ordinality as item
  ),
  claim as (
    select input.fixture_id, input.position,
      fixture.home_team_id, fixture.away_team_id,
      -- swapped: the guest saw the teams the other way round (provider swap)
      (input.claimed_home is not null and input.claimed_away is not null
        and (input.claimed_home, input.claimed_away)
          = (fixture.away_team_id, fixture.home_team_id)) as swapped,
      input.home_goals, input.away_goals,
      coalesce(fixture.id is not null and fixture.season_id = v_season_id
        and fixture.round_id is not null
        and (input.claimed_home is null or input.claimed_away is null
          or (input.claimed_home, input.claimed_away)
            in ((fixture.home_team_id, fixture.away_team_id),
                (fixture.away_team_id, fixture.home_team_id))), false) as valid,
      coalesce(app_private.prediction_fixture_open(fixture.status, fixture.kickoff_at, now_ts), false)
        as is_open,
      exists (
        select 1 from app.predictions existing
        where existing.fixture_id = input.fixture_id and existing.user_id = caller
      ) as had_prediction
    from input
    left join app.fixtures fixture on fixture.id = input.fixture_id
  ),
  inserted as (
    insert into app.predictions (
      user_id, fixture_id, home_goals, away_goals, home_team_id, away_team_id, origin, submitted_at
    )
    select caller, claim.fixture_id,
      case when claim.swapped then claim.away_goals else claim.home_goals end,
      case when claim.swapped then claim.home_goals else claim.away_goals end,
      claim.home_team_id, claim.away_team_id, 'guest_claim', now_ts
    from claim
    where claim.valid and claim.is_open and not claim.had_prediction
    on conflict (fixture_id, user_id) do nothing
    returning fixture_id
  ),
  classified as (
    select claim.fixture_id, claim.position,
      case
        when not claim.valid then 'invalid'
        when inserted.fixture_id is not null then 'imported'
        when claim.had_prediction or claim.is_open then 'kept'
        else 'started'
      end as status
    from claim
    left join inserted on inserted.fixture_id = claim.fixture_id
  )
  select
    jsonb_agg(jsonb_build_object('fixtureId', classified.fixture_id, 'status', classified.status)
      order by classified.position),
    count(*) filter (where classified.status = 'imported'),
    count(*) filter (where classified.status = 'kept'),
    count(*) filter (where classified.status = 'started'),
    count(*) filter (where classified.status = 'invalid')
  into results, imported_count, kept_count, started_count, invalid_count
  from classified;

  insert into app_private.prediction_guest_claims (
    user_id, submitted, imported, kept_existing, rejected_started, rejected_invalid
  ) values (
    caller, jsonb_array_length(p_items), imported_count, kept_count, started_count, invalid_count
  );

  return jsonb_build_object(
    'serverTime', now_ts,
    'imported', imported_count,
    'keptExisting', kept_count,
    'started', started_count,
    'invalid', invalid_count,
    'results', results
  );
end;
$$;

-- As in 20260925090300.
create or replace function api.create_prediction_league(p_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  v_fantasy_season_id uuid;
  existing_id uuid;
  new_id uuid;
  invite_code text;
begin
  perform app_private.assert_mfa_step_up();
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  if p_name is null or p_name <> btrim(p_name) or char_length(p_name) not between 3 and 80 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  v_fantasy_season_id := app_private.predictions_current_fantasy_season();
  if v_fantasy_season_id is null then
    raise exception using errcode = 'PT409', message = 'predictions_leagues_unavailable';
  end if;

  perform pg_advisory_xact_lock(
    pg_catalog.hashtextextended(caller::text || ':predictions:create_league', 0)
  );
  -- A double tap within a minute returns the league already created. Its code
  -- is not repeated (only the digest is stored); the owner can reset it.
  select league.id into existing_id
  from app.fantasy_leagues league
  where league.owner_user_id = caller and league.fantasy_season_id = v_fantasy_season_id
    and league.name = p_name and league.active
    and league.created_at > statement_timestamp() - interval '60 seconds'
  order by league.created_at desc
  limit 1;
  if existing_id is not null then
    return jsonb_build_object('leagueId', existing_id, 'name', p_name,
      'inviteCode', null, 'created', false);
  end if;

  if (
    select count(*) from app.fantasy_leagues league
    where league.owner_user_id = caller and league.fantasy_season_id = v_fantasy_season_id
      and league.active
  ) >= 5 then
    raise exception using errcode = 'PT409', message = 'league_create_limit_reached';
  end if;
  if app_private.prediction_league_count_for(caller) >= 50 then
    raise exception using errcode = 'PT409', message = 'league_limit_reached';
  end if;

  invite_code := upper(encode(extensions.gen_random_bytes(16), 'hex'));
  insert into app.fantasy_leagues (
    fantasy_season_id, owner_user_id, name, visibility, invite_code_digest, invite_code_hint,
    member_count
  ) values (
    v_fantasy_season_id, caller, p_name, 'private',
    encode(extensions.digest(convert_to(invite_code, 'UTF8'), 'sha256'), 'hex'),
    right(invite_code, 4), 0
  )
  returning id into new_id;

  insert into app.prediction_league_members (league_id, user_id, role)
  values (new_id, caller, 'owner');

  return jsonb_build_object('leagueId', new_id, 'name', p_name,
    'inviteCode', invite_code, 'created', true);
end;
$$;

-- As in 20260925090300.
create or replace function api.join_prediction_league(p_invite_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  code_digest text;
  target app.fantasy_leagues%rowtype;
begin
  perform app_private.assert_mfa_step_up();
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  if p_invite_code is null then
    raise exception using errcode = 'PT400', message = 'invite_code_invalid';
  end if;

  code_digest := app_private.prediction_invite_code_digest(p_invite_code);
  if code_digest is not null then
    select * into target from app.fantasy_leagues league
    where league.invite_code_digest = code_digest
      and league.visibility = 'private'
      and league.active
      and league.fantasy_season_id = app_private.predictions_current_fantasy_season();
  end if;
  -- The same answer for a malformed code, an unknown one, an archived league
  -- and another season's league.
  if target.id is null then
    raise exception using errcode = 'PT404', message = 'invite_code_invalid';
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended('predictions:league:' || target.id::text, 0));

  if exists (
    select 1 from app.fantasy_league_memberships membership
    where membership.league_id = target.id and membership.user_id = caller
      and membership.status = 'active'
  ) then
    return jsonb_build_object('leagueId', target.id, 'name', target.name,
      'joined', false, 'via', 'fantasy');
  end if;
  if exists (
    select 1 from app.prediction_league_members member
    where member.league_id = target.id and member.user_id = caller and member.status = 'active'
  ) then
    return jsonb_build_object('leagueId', target.id, 'name', target.name,
      'joined', false, 'via', 'predictions');
  end if;

  if app_private.prediction_league_count_for(caller) >= 50 then
    raise exception using errcode = 'PT409', message = 'league_limit_reached';
  end if;
  if (
    select count(*) from app.prediction_league_members member
    where member.league_id = target.id and member.status = 'active'
  ) >= 500 then
    raise exception using errcode = 'PT409', message = 'league_full';
  end if;

  insert into app.prediction_league_members as member (league_id, user_id)
  values (target.id, caller)
  on conflict (league_id, user_id) do update set
    status = 'active', left_at = null, joined_at = statement_timestamp()
  where member.status = 'left';

  return jsonb_build_object('leagueId', target.id, 'name', target.name,
    'joined', true, 'via', 'predictions');
end;
$$;

-- As in 20260925090300.
create or replace function api.leave_prediction_league(p_league_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  membership app.prediction_league_members%rowtype;
begin
  perform app_private.assert_mfa_step_up();
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  select * into membership from app.prediction_league_members member
  where member.league_id = p_league_id and member.user_id = caller and member.status = 'active'
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'league_membership_not_found';
  end if;
  if membership.role = 'owner' then
    raise exception using errcode = 'PT409', message = 'league_owner_cannot_leave';
  end if;
  update app.prediction_league_members
  set status = 'left', left_at = statement_timestamp()
  where id = membership.id;
  return jsonb_build_object('leagueId', p_league_id, 'left', true);
end;
$$;

-- As in 20260925090300.
create or replace function api.reset_prediction_league_invite_code(p_league_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target app.fantasy_leagues%rowtype;
  invite_code text;
begin
  perform app_private.assert_mfa_step_up();
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  select * into target from app.fantasy_leagues league
  where league.id = p_league_id and league.owner_user_id = caller
    and league.visibility = 'private' and league.active
  for update;
  if target.id is null then
    raise exception using errcode = 'PT403', message = 'league_access_denied';
  end if;
  invite_code := upper(encode(extensions.gen_random_bytes(16), 'hex'));
  update app.fantasy_leagues set
    invite_code_digest = encode(extensions.digest(convert_to(invite_code, 'UTF8'), 'sha256'), 'hex'),
    invite_code_hint = right(invite_code, 4)
  where id = target.id;
  return jsonb_build_object('leagueId', target.id, 'inviteCode', invite_code);
end;
$$;

-- As in 20260925234000. Its answer is api.match_votes, the caller's own
-- choices included.
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
  perform app_private.assert_mfa_step_up();
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

-- ---------------------------------------------------------------------------
-- The public News card: the reader's saved mark past the step-up (point 7)
-- ---------------------------------------------------------------------------

-- As in 20260924100000, plus the step-up in the saved mark's EXISTS.
create or replace function app_private.news_article_card(
  edition app.article_editions,
  placement app.placement_type default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', edition.id,
    'storyId', edition.story_id,
    'language', edition.language,
    'slug', edition.slug,
    'title', edition.title,
    'subtitle', edition.subtitle,
    'summary', edition.summary,
    'publishedAt', edition.published_at,
    'updatedAt', edition.updated_at,
    'readingTimeMinutes', edition.reading_time_minutes,
    'hero', app_private.news_media_dto(edition.hero_asset_id),
    'author', case when author.id is null then null else jsonb_build_object(
      'id', author.id, 'slug', author.slug, 'name', author.display_name
    ) end,
    'publisher', case when publisher.id is null then null else jsonb_build_object(
      'id', publisher.id, 'slug', publisher.slug, 'name', publisher.name
    ) end,
    -- Attribution for licensed content only; an unlicensed source gets none.
    'source', case when publisher.syndication_licensed_at is null then null else jsonb_build_object(
      'name', case when edition.language = 'ar' then coalesce(publisher.name_ar, publisher.name)
        else publisher.name end,
      -- The original article, or nothing: a homepage is not "the original".
      'url', story.canonical_url
    ) end,
    'primaryCategory', category.value,
    'tags', coalesce(tags.value, '[]'::jsonb),
    'teamIds', coalesce(teams.value, '[]'::jsonb),
    'competitionIds', coalesce(competitions.value, '[]'::jsonb),
    'placement', placement,
    'isSaved', exists (
      select 1 from app.saved_articles saved
      where saved.user_id = auth.uid() and saved.article_edition_id = edition.id
        and app_private.mfa_step_up_satisfied()
    )
  )
  from app.stories story
  left join app.authors author on author.id = story.author_id
  left join app.publishers publisher on publisher.id = story.publisher_id
  left join lateral (
    select jsonb_build_object(
      'id', taxonomy.id, 'slug', taxonomy.slug,
      'name', coalesce(translation.display_name, taxonomy.slug)
    ) as value
    from app.story_taxonomies relation
    join app.taxonomies taxonomy on taxonomy.id = relation.taxonomy_id
    left join app.taxonomy_translations translation
      on translation.taxonomy_id = taxonomy.id and translation.language = edition.language
    where relation.story_id = edition.story_id
      and taxonomy.taxonomy_type = 'category'
    order by relation.is_primary desc, taxonomy.display_order, taxonomy.id
    limit 1
  ) category on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', taxonomy.id, 'slug', taxonomy.slug,
      'name', coalesce(translation.display_name, taxonomy.slug)
    ) order by taxonomy.display_order, taxonomy.slug) as value
    from app.story_taxonomies relation
    join app.taxonomies taxonomy on taxonomy.id = relation.taxonomy_id
    left join app.taxonomy_translations translation
      on translation.taxonomy_id = taxonomy.id and translation.language = edition.language
    where relation.story_id = edition.story_id and taxonomy.taxonomy_type = 'tag'
  ) tags on true
  left join lateral (
    select jsonb_agg(relation.team_id order by relation.team_id) as value
    from app.story_teams relation where relation.story_id = edition.story_id
  ) teams on true
  left join lateral (
    select jsonb_agg(relation.competition_id order by relation.competition_id) as value
    from app.story_competitions relation where relation.story_id = edition.story_id
  ) competitions on true
  where story.id = edition.story_id
$$;

-- ---------------------------------------------------------------------------
-- The public match votes: the caller's own choices past the step-up (point 7)
-- ---------------------------------------------------------------------------

-- As in 20260925234000, plus the step-up in the caller's own choices ('mine').
-- The totals stay public: a visitor reads them, and so does an enrolled
-- account at aal1, as a visitor does.
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
          and app_private.mfa_step_up_satisfied()
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
  'Public: the fan votes on a match as totals per answer (banned and deleted '
  'accounts left out), the caller''s own choices (null for visitors, and for an '
  'account with a verified MFA factor whose session is not aal2), whether the '
  'match is covered (current Pronostics season, has a journée) and still open '
  '(before kick-off). allowed=false while Pronostics is off for the caller.';

-- ---------------------------------------------------------------------------
-- The account views (point 6)
-- ---------------------------------------------------------------------------

-- As in 20260720075453, plus the step-up at the end of each WHERE. The views
-- stay security_invoker, and CREATE OR REPLACE keeps their one grant (SELECT
-- to authenticated).
create or replace view api.my_profile
with (security_invoker = true)
as
select
  profile.id,
  profile.username,
  profile.normalized_username,
  profile.display_name,
  profile.avatar_path as avatar_url,
  profile.preferred_language,
  profile.onboarding_completed_at,
  profile.created_at,
  profile.updated_at,
  preference.favorite_team_id,
  preference.favorite_team_provisional_ref,
  coalesce(
    preference.favorite_team_id::text,
    preference.favorite_team_provisional_ref
  ) as favorite_club_id,
  preference.match_alerts,
  preference.breaking_news,
  preference.fantasy_deadline_reminders
from app.profiles as profile
join app.user_preferences as preference on preference.user_id = profile.id
where profile.id = (select auth.uid())
  and profile.deleted_at is null
  and app_private.require_mfa_step_up();

create or replace view api.my_followed_teams
with (security_invoker = true)
as
select user_id, team_id, created_at
from app.followed_teams
where user_id = (select auth.uid())
  and app_private.require_mfa_step_up();

create or replace view api.my_followed_competitions
with (security_invoker = true)
as
select user_id, competition_id, created_at
from app.followed_competitions
where user_id = (select auth.uid())
  and app_private.require_mfa_step_up();

create or replace view api.my_account_deletion_requests
with (security_invoker = true)
as
select id, user_id, status, requested_at, updated_at, processed_at
from app.account_deletion_requests
where user_id = (select auth.uid())
  and app_private.require_mfa_step_up();

-- ---------------------------------------------------------------------------
-- The avatar image in Storage (point 8). Last: see the header.
-- ---------------------------------------------------------------------------

-- As in 20260720075453, plus the step-up as the last condition of each.
drop policy avatars_select_own_authenticated on storage.objects;
create policy avatars_select_own_authenticated
on storage.objects for select to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text || '/avatar[.](jpg|jpeg|png|webp)$')
  and (select app_private.mfa_step_up_satisfied())
);

drop policy avatars_insert_own_authenticated on storage.objects;
create policy avatars_insert_own_authenticated
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text || '/avatar[.](jpg|jpeg|png|webp)$')
  and (select app_private.mfa_step_up_satisfied())
);

drop policy avatars_update_own_authenticated on storage.objects;
create policy avatars_update_own_authenticated
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text || '/avatar[.](jpg|jpeg|png|webp)$')
  and (select app_private.mfa_step_up_satisfied())
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text || '/avatar[.](jpg|jpeg|png|webp)$')
  and (select app_private.mfa_step_up_satisfied())
);

drop policy avatars_delete_own_authenticated on storage.objects;
create policy avatars_delete_own_authenticated
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text || '/avatar[.](jpg|jpeg|png|webp)$')
  and (select app_private.mfa_step_up_satisfied())
);
$bg_20260926003100_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20260926003100 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20260926003100'
  );
begin
  if encode(sha256(convert_to(part_20260926003100, 'UTF8')), 'hex')
    is distinct from '9a6185c59f96a97e5641bc911705723cdbab83df6dbdd8165043288c23e9fd18' then
    raise exception 'stop: 20260926003100 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20260926003100;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (reads only)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  replaced constant jsonb := current_setting('bg_20260926003100.replaced')::jsonb;
  api_role text;
  signature text;
  unguarded text[];
  enrolled uuid;
  refused_by_helper boolean;
  refused_by_table boolean;
  refused_by_read boolean;
  refused_by_view boolean;
  refused_vote boolean;
begin
  foreach signature in array array[
    'app_private.assert_mfa_step_up()', 'app_private.refuse_unverified_mfa_actor()'
  ] loop
    if to_regprocedure(signature) is null then
      problems := problems || ('missing ' || signature);
    else
      foreach api_role in array array['anon', 'authenticated', 'service_role'] loop
        if has_function_privilege(api_role, signature, 'execute') then
          problems := problems || (api_role || ' can run ' || signature);
        end if;
      end loop;
    end if;
  end loop;
  -- The account views and the avatar policies run these as the reader.
  foreach signature in array array[
    'app_private.require_mfa_step_up()', 'app_private.mfa_step_up_satisfied()'
  ] loop
    if to_regprocedure(signature) is null then
      problems := problems || ('missing ' || signature);
    elsif not has_function_privilege('authenticated', signature, 'execute')
      or has_function_privilege('anon', signature, 'execute')
      or has_function_privilege('service_role', signature, 'execute') then
      problems := problems || (signature || ' is not callable by authenticated alone');
    end if;
  end loop;

  -- tgtype 30 = BEFORE | INSERT | DELETE | UPDATE, per statement.
  if (
    select count(*) from pg_catalog.pg_trigger t
    where t.tgfoid = to_regprocedure('app_private.refuse_unverified_mfa_actor()')
      and t.tgtype = 30 and t.tgenabled = 'O'
  ) <> 25 or (
    select count(*) from pg_catalog.pg_trigger t
    where t.tgname like '%\_refuse\_unverified\_mfa\_actor' and not t.tgisinternal
  ) <> 25 then
    problems := problems || 'expected 25 enabled per-statement step-up triggers'::text;
  end if;

  if pg_get_functiondef('api.request_account_deletion()'::regprocedure) not like '%app_private.assert_mfa_step_up()%'
    or pg_get_functiondef('api.cancel_account_deletion()'::regprocedure) not like '%app_private.assert_mfa_step_up()%'
    or pg_get_functiondef('api.unsubscribe_notification_email(text)'::regprocedure)
      not like '%app.mfa_step_up_waiver%' then
    problems := problems || 'a replaced function is not the new version'::text;
  end if;
  if not has_function_privilege('authenticated', 'api.request_account_deletion()', 'execute')
    or not has_function_privilege('authenticated', 'api.cancel_account_deletion()', 'execute')
    or has_function_privilege('anon', 'api.request_account_deletion()', 'execute')
    or has_function_privilege('anon', 'api.cancel_account_deletion()', 'execute')
    or not has_function_privilege('anon', 'api.unsubscribe_notification_email(text)', 'execute')
    or not has_function_privilege('authenticated', 'api.unsubscribe_notification_email(text)', 'execute')
    or not has_function_privilege('service_role', 'api.unsubscribe_notification_email(text)', 'execute') then
    problems := problems || 'the replaced functions lost or gained a grant'::text;
  end if;

  -- Each of the 49: its checked version, plus the step-up as the first
  -- statement of its body, and nothing else; still callable by authenticated.
  select problems || coalesce(array_agg(
      'not its checked version plus the step-up: ' || fn.signature order by fn.signature), '{}')
  into problems
  from jsonb_each_text(replaced -> 'functions') as fn(signature, normalized_md5)
  where pg_get_functiondef(to_regprocedure(fn.signature))
      !~ E'\nbegin\n  perform app_private\\.assert_mfa_step_up\\(\\);\n'
    or md5((select string_agg(t.line, E'\n' order by t.n)
      from regexp_split_to_table(pg_get_functiondef(to_regprocedure(fn.signature)), E'\n')
        with ordinality as t(line, n)
      where t.line !~ '^\s*$' and t.line !~ '^\s*--'
        and t.line <> '  perform app_private.assert_mfa_step_up();')) <> fn.normalized_md5
    or not has_function_privilege('authenticated', to_regprocedure(fn.signature), 'execute');

  -- The two match-vote functions: their checked version plus the step-up and
  -- nothing else, with the grants 20260925234000 gave them. Casting a vote
  -- runs it first; the public read shows the caller's own choices only past
  -- it, and stays open to visitors.
  if pg_get_functiondef('api.cast_match_vote(uuid,text,text)'::regprocedure)
      !~ E'\nbegin\n  perform app_private\\.assert_mfa_step_up\\(\\);\n'
    or md5(replace(pg_get_functiondef('api.cast_match_vote(uuid,text,text)'::regprocedure),
      E'\n  perform app_private.assert_mfa_step_up();', ''))
      <> replaced -> 'match_votes' ->> 'api.cast_match_vote(uuid,text,text)'
    or not has_function_privilege('authenticated', 'api.cast_match_vote(uuid,text,text)', 'execute')
    or not has_function_privilege('service_role', 'api.cast_match_vote(uuid,text,text)', 'execute')
    or has_function_privilege('anon', 'api.cast_match_vote(uuid,text,text)', 'execute') then
    problems := problems || 'api.cast_match_vote is not its checked version plus the step-up'::text;
  end if;
  if pg_get_functiondef('api.match_votes(uuid)'::regprocedure)
      not like E'%\n          and caller is not null and vote.user_id = caller\n          and app_private.mfa_step_up_satisfied()\n%'
    or md5(replace(pg_get_functiondef('api.match_votes(uuid)'::regprocedure),
      E'\n          and app_private.mfa_step_up_satisfied()', ''))
      <> replaced -> 'match_votes' ->> 'api.match_votes(uuid)'
    or not has_function_privilege('anon', 'api.match_votes(uuid)', 'execute')
    or not has_function_privilege('authenticated', 'api.match_votes(uuid)', 'execute')
    or not has_function_privilege('service_role', 'api.match_votes(uuid)', 'execute') then
    problems := problems || 'api.match_votes is not its checked version plus the step-up'::text;
  end if;

  -- The News card, the views and the avatar policies: their checked version
  -- plus the step-up and nothing else.
  if md5(replace(pg_get_functiondef('app_private.news_article_card(app.article_editions,app.placement_type)'::regprocedure),
      E'\n        and app_private.mfa_step_up_satisfied()', '')) <> replaced ->> 'news_card'
    or pg_get_functiondef('app_private.news_article_card(app.article_editions,app.placement_type)'::regprocedure)
      not like '%and app_private.mfa_step_up_satisfied()%' then
    problems := problems || 'app_private.news_article_card is not its checked version plus the step-up'::text;
  end if;
  select problems || coalesce(array_agg(
      'not its checked version plus the step-up: ' || v.name order by v.name), '{}')
  into problems
  from jsonb_each_text(replaced -> 'views') as v(name, definition_md5)
  where md5(replace(pg_get_viewdef(to_regclass(v.name), true), ' AND app_private.require_mfa_step_up()', ''))
      <> v.definition_md5
    or pg_get_viewdef(to_regclass(v.name), true) not like '% AND app_private.require_mfa_step_up();'
    or not exists (select 1 from pg_catalog.pg_class c
      where c.oid = to_regclass(v.name) and 'security_invoker=true' = any(c.reloptions))
    or not has_table_privilege('authenticated', to_regclass(v.name), 'select')
    or has_table_privilege('anon', to_regclass(v.name), 'select')
    or has_table_privilege('service_role', to_regclass(v.name), 'select');
  select problems || coalesce(array_agg(
      'not its checked version plus the step-up: ' || p.name order by p.name), '{}')
  into problems
  from jsonb_each_text(replaced -> 'policies') as p(name, expression_md5)
  where not exists (select 1 from pg_catalog.pg_policies policy
    where policy.schemaname = 'storage' and policy.tablename = 'objects'
      and policy.policyname = p.name and policy.roles = '{authenticated}'
      and (policy.qual is null
        or policy.qual like '% AND ( SELECT app_private.mfa_step_up_satisfied() AS mfa_step_up_satisfied))')
      and (policy.with_check is null
        or policy.with_check like '% AND ( SELECT app_private.mfa_step_up_satisfied() AS mfa_step_up_satisfied))')
      and md5(replace(coalesce(policy.qual, ''),
          ' AND ( SELECT app_private.mfa_step_up_satisfied() AS mfa_step_up_satisfied)', '')
        || '|' || replace(coalesce(policy.with_check, ''),
          ' AND ( SELECT app_private.mfa_step_up_satisfied() AS mfa_step_up_satisfied)', ''))
        = p.expression_md5);

  -- No api function, view or table a browser can call or read reaches the
  -- caller without the step-up: the completeness checks of
  -- supabase/tests/database/ordinary_account_mfa_step_up_reads.test.sql
  -- (pg_temp.unguarded_api_functions and pg_temp.unguarded_api_relations),
  -- word for word, on this database's own catalog. A function reads the
  -- caller when auth.uid(), auth.jwt(), auth.email() or the request.jwt
  -- settings are in its code (pg_get_functiondef without its comments, so a
  -- BEGIN ATOMIC body counts and a comment does not), or in an api or
  -- app_private function it calls, at any depth, or when it is SECURITY
  -- INVOKER; a helper that applies the step-up itself (the News card) does
  -- not count, and applying it means calling it, not naming it in a string.
  -- The staff RPCs are excused by name, each only while it calls its staff
  -- check, and the migration names three exceptions ("Not guarded"). Every api view a signed-in session can read must carry the
  -- step-up, and no other api relation may be readable but the public live
  -- scores. A reader this database has and the repository does not stops the
  -- update here.
  unguarded := (
    with recursive source as (
       select p.oid, n.nspname, p.proname, p.prosecdef,
         regexp_replace(pg_get_functiondef(p.oid),
           $re$('(?:[^']|'')*')|--[^\n]*|/\*(?:[^*]|\*+[^*/])*\*+/$re$, '\1', 'g') as code
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('api', 'app_private') and p.prokind in ('f', 'p')
     ),
     fn as (
       select source.*, regexp_replace(code, $re$'(?:[^']|'')*'$re$, '''''', 'g') as statements
       from source
     ),
     applies_step_up as (
       select oid from fn
       where statements ~ 'app_private\.(assert_mfa_step_up|require_mfa_step_up|mfa_step_up_satisfied)\('
     ),
     calls as (
       select distinct f.oid as caller, g.oid as callee
       from fn f
       cross join lateral regexp_matches(f.code, '(api|app_private)\.([a-z_0-9]+)\s*\(', 'g') as m(name)
       join fn g on g.nspname = m.name[1] and g.proname = m.name[2] and g.oid <> f.oid
     ),
     reads_caller(oid) as (
       select f.oid from fn f
       where f.code ~ 'auth\.(uid|jwt|email)\(\)|request\.jwt' and f.oid not in (select oid from applies_step_up)
       union
       select c.caller from calls c join reads_caller r on r.oid = c.callee
       where c.caller not in (select oid from applies_step_up)
     )
     select coalesce(array_agg(f.proname::text order by f.proname), '{}')
     from fn f
     where f.nspname = 'api'
       and has_function_privilege('authenticated', f.oid, 'execute')
       and (f.oid in (select oid from reads_caller)
         or (not f.prosecdef and f.oid not in (select oid from applies_step_up)))
       -- The staff console's and the newsroom's RPCs, by name: each calls the
       -- staff check that already demands a verified factor and aal2
       -- (20260926003100, "Not guarded"). One that stops calling it is caught.
       and not (f.statements ~ 'app_private\.(admin_assert_permission|admin_assert_principal|has_editorial_role)\('
         and f.proname = any (array[
           'admin_add_fantasy_prize_winner_note', 'admin_approve_request', 'admin_assign_role',
           'admin_ban_user', 'admin_cancel_request', 'admin_create_staff_principal',
           'admin_emergency_revoke_staff', 'admin_execute_approved_platform_admin',
           'admin_get_analytics_overview', 'admin_get_approval', 'admin_get_fantasy_prize_settings',
           'admin_get_revocation_worker_health', 'admin_get_session_revocation_status',
           'admin_get_staff_principal', 'admin_get_user', 'admin_list_active_assignments',
           'admin_list_approval_queue', 'admin_list_assignment_history', 'admin_list_audit_events',
           'admin_list_audit_events_v2', 'admin_list_fantasy_prize_flags',
           'admin_list_fantasy_prize_winners', 'admin_list_fantasy_prizes',
           'admin_list_role_catalog', 'admin_list_staff_assignments', 'admin_list_users',
           'admin_override_fantasy_prize_winner', 'admin_reject_request', 'admin_renew_role',
           'admin_request_approval', 'admin_resolve_staff_user_exact', 'admin_restore_staff',
           'admin_revoke_role', 'admin_save_fantasy_prize', 'admin_save_fantasy_prize_settings',
           'admin_set_fantasy_prize_flag', 'admin_set_fantasy_prize_winner_status',
           'admin_shorten_role_expiry', 'admin_suspend_staff', 'admin_unban_user',
           'editorial_convert_imported_story', 'editorial_create_draft', 'editorial_get_article',
           'editorial_list_revisions', 'editorial_list_stories', 'editorial_register_media',
           'editorial_schedule_health', 'editorial_set_placement', 'editorial_soft_delete_story',
           'editorial_transition_article', 'editorial_update_article'
         ]))
       and f.proname not in (
         -- The staff console reads it at aal1 to show its own step-up; an
         -- ordinary account gets staff_access_denied (20260926003100, "Not guarded").
         'get_my_staff_context',
         -- The round and its matches, the same for everyone: auth.uid() only
         -- decides whether a tester may see Pronostics while it is testers-only.
         'predictions_round',
         -- Sign-out: someone who abandons the challenge must still be able to leave.
         'record_session_revocation')
  );
  if cardinality(unguarded) > 0 then
    problems := problems
      || ('an api function reads the caller without the step-up: ' || array_to_string(unguarded, ', '));
  end if;
  unguarded := (
    select coalesce(array_agg(n.nspname || '.' || c.relname order by c.relname), '{}')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'api' and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_any_column_privilege('authenticated', c.oid, 'select')
      and (c.relkind not in ('v', 'm') or pg_get_viewdef(c.oid) !~ 'app_private\.require_mfa_step_up\(\)')
      -- Live scores: a Realtime table, not a view. Every reader, visitors
      -- included, gets the same rows; nothing in it is the caller's.
      and c.relname not in ('live_fixture_updates')
  );
  if cardinality(unguarded) > 0 then
    problems := problems
      || ('an api view or table a signed-in session reads lacks the step-up: ' || array_to_string(unguarded, ', '));
  end if;

  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260926003100') then
    problems := problems || 'history row missing'::text;
  end if;

  -- Behaviour, without writing anything. An account with no factor passes.
  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin
    perform app_private.assert_mfa_step_up();
    if not app_private.require_mfa_step_up() or not app_private.mfa_step_up_satisfied() then
      problems := problems || 'an account with no factor was not let through'::text;
    end if;
  exception when others then
    problems := problems || ('an account with no factor was refused: ' || sqlerrm);
  end;

  -- An enrolled account at aal1 is refused, by the helper, a table trigger, a
  -- read and a view, and Storage's helper says no. The UPDATE matches no row,
  -- so even a miss writes nothing.
  select factor.user_id into enrolled
  from auth.mfa_factors factor
  where factor.status::text = 'verified'
  limit 1;
  if enrolled is null then
    raise notice 'no account has a verified factor yet: the refusal was not exercised here (pgTAP covers it)';
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', enrolled, 'role', 'authenticated', 'aal', 'aal1')::text, true);
    refused_by_helper := false;
    begin
      perform app_private.assert_mfa_step_up();
    exception when sqlstate 'PT403' then
      refused_by_helper := sqlerrm = 'mfa_required';
    end;
    refused_by_table := false;
    begin
      update app.profiles set display_name = display_name where false;
    exception when sqlstate 'PT403' then
      refused_by_table := sqlerrm = 'mfa_required';
    end;
    refused_by_read := false;
    begin
      perform api.get_my_notification_preferences();
    exception when others then
      refused_by_read := sqlstate = 'PT403' and sqlerrm = 'mfa_required';
    end;
    refused_by_view := false;
    begin
      perform count(*) from api.my_profile;
    exception when others then
      refused_by_view := sqlstate = 'PT403' and sqlerrm = 'mfa_required';
    end;
    -- A vote on a match that does not exist: the step-up refuses it first.
    -- Without the step-up it would still write nothing (Pronostics off, or no
    -- such match), but answer something other than mfa_required.
    refused_vote := false;
    begin
      perform api.cast_match_vote(gen_random_uuid(), 'winner', 'home');
    exception when others then
      refused_vote := sqlstate = 'PT403' and sqlerrm = 'mfa_required';
    end;
    if not refused_by_helper or not refused_by_table then
      problems := problems || 'an enrolled account at aal1 was not refused with mfa_required'::text;
    end if;
    if not refused_by_read or not refused_by_view then
      problems := problems || 'an enrolled account at aal1 could read its own data'::text;
    end if;
    if not refused_vote then
      problems := problems || 'an enrolled account at aal1 could cast a match vote'::text;
    end if;
    if app_private.mfa_step_up_satisfied() then
      problems := problems || 'Storage would serve an enrolled account at aal1'::text;
    end if;

    perform set_config('request.jwt.claims',
      json_build_object('sub', enrolled, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    begin
      perform app_private.assert_mfa_step_up();
      update app.profiles set display_name = display_name where false;
      perform count(*) from api.my_profile;
      if not app_private.mfa_step_up_satisfied() then
        problems := problems || 'Storage would refuse an enrolled account at aal2'::text;
      end if;
    exception when others then
      problems := problems || ('an enrolled account at aal2 was refused: ' || sqlerrm);
    end;
    -- The read may answer anything but the step-up's refusal (an account
    -- without preferences gets its own not-found).
    begin
      perform api.get_my_notification_preferences();
    exception when others then
      if sqlstate = 'PT403' and sqlerrm = 'mfa_required' then
        problems := problems || 'an enrolled account at aal2 could not read its own data'::text;
      end if;
    end;
  end if;
  perform set_config('request.jwt.claims', '', true);

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
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20260926003100')
    then 'Applied. Accounts that turned MFA on now need the code before they read or change their own data, their avatar image included.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
