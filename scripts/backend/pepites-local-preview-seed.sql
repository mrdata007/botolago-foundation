-- Pépites local preview: a fictional 2026/27 Botola Pro season for a LOCAL
-- database only (docs/engineering/PEPITES_ARCHITECTURE.md; the preview and
-- browser tests in tests/e2e/pepites.*.e2e.ts).
--
-- NEVER RUN THIS ON A SHARED DATABASE. It refuses to run unless the football
-- catalog is empty, which no shared database is. It writes, so the
-- one-writer rule applies (AGENTS.md): nothing else may write while it runs.
--
--   psql postgresql://postgres:postgres@127.0.0.1:55322/postgres \
--     -v ON_ERROR_STOP=1 -f scripts/backend/pepites-local-preview-seed.sql
--
-- What it makes: the 16 clubs (real club names, with their Arabic names),
-- 18 FICTIONAL players each (a first name and an initial, "(fictif)" in the
-- full name), six finished rounds with deterministic line-ups, goals and
-- ratings, then the real ranking engine runs as of rounds 3 to 6. Weeks 4 to
-- 6 are published through the editions functions (the same path the tick and
-- the editor take), week 7 is left as a draft, and Pépites is opened in
-- `public` mode with automatic publication OFF, so nothing publishes on its
-- own while the preview runs.

begin;

do $$
begin
  if exists (select 1 from app.teams) or exists (select 1 from app.fixtures)
    or exists (select 1 from app.competitions)
  then
    raise exception using message =
      'pepites-local-preview-seed: the football catalog is not empty; this script only seeds an empty local database';
  end if;
end;
$$;

create function pg_temp.uid(p_prefix text, p_n integer)
returns uuid language sql immutable as $$
  select (p_prefix || lpad(p_n::text, 12, '0'))::uuid;
$$;

-- A deterministic number in [0, 1) from any text.
create function pg_temp.h(p_text text)
returns double precision language sql immutable as $$
  select ('x' || substr(md5(p_text), 1, 8))::bit(32)::bigint / 4294967296.0;
$$;

insert into app.competitions (id, slug, name, competition_type)
values ('7e000000-0000-4000-8000-000000000001', 'botola-pro', 'Botola Pro', 'league');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, is_current, status) values
  ('7e010000-0000-4000-8000-000000000001', '7e000000-0000-4000-8000-000000000001',
    '2026/2027', '2026-08-17', '2027-06-30', true, 'active'),
  ('7e010000-0000-4000-8000-000000000002', '7e000000-0000-4000-8000-000000000001',
    '2025/2026', '2025-08-18', '2026-06-30', false, 'completed');

create temporary table seed_clubs (n integer primary key, slug text, name text, short text, ar text, ar_short text)
on commit drop;
insert into seed_clubs values
  (1, 'wydad-ac', 'Wydad AC', 'Wydad', 'الوداد الرياضي', 'الوداد'),
  (2, 'raja-ca', 'Raja CA', 'Raja', 'الرجاء الرياضي', 'الرجاء'),
  (3, 'as-far', 'AS FAR', 'FAR', 'الجيش الملكي', 'الجيش'),
  (4, 'fus-rabat', 'FUS Rabat', 'FUS', 'الفتح الرياضي', 'الفتح'),
  (5, 'maghreb-fes', 'Maghreb Fès', 'MAS', 'نادي المغرب الرياضي الفاسي', 'المغرب الفاسي'),
  (6, 'moghreb-tetouan', 'Moghreb Tétouan', 'MAT', 'نادي المغرب أتلتيك تطوان', 'المغرب التطواني'),
  (7, 'rs-berkane', 'RS Berkane', 'Berkane', 'نهضة بركان', 'نهضة بركان'),
  (8, 'difaa-el-jadida', 'Difaâ El Jadida', 'DHJ', 'الدفاع الحسني الجديدي', 'الدفاع الجديدي'),
  (9, 'hassania-agadir', 'Hassania Agadir', 'HUSA', 'حسنية أكادير', 'حسنية أكادير'),
  (10, 'ittihad-tanger', 'Ittihad Tanger', 'IRT', 'اتحاد طنجة', 'اتحاد طنجة'),
  (11, 'kac-marrakech', 'KAC Marrakech', 'KACM', 'الكوكب المراكشي', 'الكوكب المراكشي'),
  (12, 'codm-meknes', 'CODM Meknès', 'CODM', 'النادي المكناسي', 'المكناسي'),
  (13, 'uts-rabat', 'UTS Rabat', 'UTS', 'اتحاد تواركة', 'اتحاد تواركة'),
  (14, 'amal-tiznit', 'Amal Tiznit', 'Tiznit', 'أمل تيزنيت', 'أمل تيزنيت'),
  (15, 'wydad-temara', 'Wydad Témara', 'Témara', 'نادي الوداد الرياضي لتمارة', 'وداد تمارة'),
  (16, 'rca-zemamra', 'RCA Zemamra', 'RCAZ', 'نادي النهضة أتلتيك الزمامرة', 'نهضة الزمامرة');

insert into app.teams (id, slug, name, short_name)
select pg_temp.uid('7e020000-0000-4000-8000-', n), slug, name, short from seed_clubs;
insert into app.team_translations (team_id, language, name, short_name)
select pg_temp.uid('7e020000-0000-4000-8000-', n), 'ar', ar, ar_short from seed_clubs;

-- 18 fictional players a club: shirt 1 GK, 2-6 DEF, 7-11 MID, 12-15 FWD,
-- 16 GK, 17 DEF, 18 MID.
create temporary table seed_players (id uuid primary key, club integer, shirt integer, position app.football_position)
on commit drop;
insert into seed_players
select pg_temp.uid('7e030000-0000-4000-8000-', (c - 1) * 18 + k), c, k,
  case when k in (1, 16) then 'goalkeeper' when k between 2 and 6 or k = 17 then 'defender'
    when k between 7 and 11 or k = 18 then 'midfielder' else 'forward' end::app.football_position
from generate_series(1, 16) c cross join generate_series(1, 18) k;

insert into app.players (id, slug, full_name, display_name, position)
select player.id, 'fictif-' || ((player.club - 1) * 18 + player.shirt),
  first_names.name || ' ' || initials.letter || '. (fictif)',
  first_names.name || ' ' || initials.letter || '.',
  player.position
from seed_players player
cross join lateral (
  select (array['Yassine', 'Anas', 'Ayoub', 'Hamza', 'Ilyas', 'Adam', 'Zakaria', 'Othmane',
    'Mehdi', 'Amine', 'Soufiane', 'Achraf', 'Bilal', 'Reda', 'Walid', 'Nabil', 'Saad', 'Karim',
    'Taha', 'Ismail', 'Younes', 'Marouane', 'Hakim', 'Oussama'])[1 + ((player.club * 7 + player.shirt * 5) % 24)]
    as name
) first_names
cross join lateral (
  select chr(65 + ((player.club * 3 + player.shirt * 11) % 26)) as letter
) initials;

insert into app.team_memberships (player_id, team_id, season_id, shirt_number, valid_from, active)
select id, pg_temp.uid('7e020000-0000-4000-8000-', club), '7e010000-0000-4000-8000-000000000001', shirt,
  '2026-07-01', true
from seed_players;

-- Dates of birth, feet, heights and detailed positions through the attribute
-- resolver, as providers would send them. About two players in three are
-- under 23; a few have no date of birth (the data desk lists them), and feet
-- and heights are known for most, not all.
do $$
declare
  v_player record;
  v_under boolean;
begin
  for v_player in select * from seed_players loop
    v_under := pg_temp.h('age' || v_player.id) < 0.62 or v_player.shirt in (13, 14, 18);
    if pg_temp.h('dob-missing' || v_player.id) >= 0.03 then
      perform app_private.record_player_attribute_observation(v_player.id, 'date_of_birth',
        case when v_under
          then (date '2004-01-01' + (pg_temp.h('dob' || v_player.id) * 1460)::integer)::text
          else (date '1994-01-01' + (pg_temp.h('dob' || v_player.id) * 3285)::integer)::text end,
        null, 'provider', 'sportsmonks', 'preview-dob-' || v_player.id, '2026-08-01T00:00:00Z');
    end if;
    if pg_temp.h('foot' || v_player.id) < 0.8 then
      perform app_private.record_player_attribute_observation(v_player.id, 'preferred_foot',
        case when pg_temp.h('side' || v_player.id) < 0.72 then 'right'
          when pg_temp.h('side' || v_player.id) < 0.95 then 'left' else 'both' end,
        null, 'provider', 'bsd', 'preview-foot-' || v_player.id, '2026-08-01T00:00:00Z');
    end if;
    if pg_temp.h('height' || v_player.id) < 0.7 then
      perform app_private.record_player_attribute_observation(v_player.id, 'height_cm', null,
        168 + (pg_temp.h('cm' || v_player.id) * 24)::integer
          + case when v_player.position = 'goalkeeper' then 6 else 0 end,
        'provider', 'bsd', 'preview-height-' || v_player.id, '2026-08-01T00:00:00Z');
    end if;
    perform app_private.record_player_attribute_observation(v_player.id, 'detailed_position',
      case v_player.position
        when 'goalkeeper' then 'gk'
        when 'defender' then (array['cb', 'cb', 'lb', 'rb'])[1 + (v_player.shirt % 4)]
        when 'midfielder' then (array['dm', 'cm', 'am'])[1 + (v_player.shirt % 3)]
        else (array['lw', 'rw', 'cf', 'cf'])[1 + (v_player.shirt % 4)] end,
      null, 'provider', 'bsd', 'preview-position-' || v_player.id, '2026-08-01T00:00:00Z');
  end loop;
  perform app_private.resolve_player_attributes(array(select id from seed_players));
end;
$$;

-- Six rounds, one a week on Fridays, 8 matches each (circle method).
insert into app.rounds (id, season_id, round_number, name)
select pg_temp.uid('7e040000-0000-4000-8000-', r), '7e010000-0000-4000-8000-000000000001', r, 'Journée ' || r
from generate_series(1, 6) r;

do $$
declare
  v_round integer;
  v_i integer;
  v_order integer[];
  v_home integer;
  v_away integer;
  v_kickoff timestamptz;
begin
  for v_round in 1..6 loop
    v_order := array[1] || (
      select array_agg(((x - 2 + v_round - 1) % 15) + 2 order by x) from generate_series(2, 16) x);
    for v_i in 1..8 loop
      v_home := v_order[v_i];
      v_away := v_order[17 - v_i];
      v_kickoff := timestamptz '2026-08-21 18:00:00+00' + ((v_round - 1) * 7 || ' days')::interval
        + ((v_i % 3) || ' hours')::interval;
      insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
        kickoff_at, provider_updated_at, status, home_score, away_score, finalized_at)
      values (
        pg_temp.uid('7e050000-0000-4000-8000-', v_round * 10 + v_i),
        '7e000000-0000-4000-8000-000000000001', '7e010000-0000-4000-8000-000000000001',
        pg_temp.uid('7e040000-0000-4000-8000-', v_round),
        pg_temp.uid('7e020000-0000-4000-8000-', v_home), pg_temp.uid('7e020000-0000-4000-8000-', v_away),
        v_kickoff, v_kickoff + interval '3 hours', 'finished',
        floor(pg_temp.h('hs' || v_round || v_i) * 3.4)::integer,
        floor(pg_temp.h('as' || v_round || v_i) * 2.6)::integer,
        v_kickoff + interval '2 hours'
      );
    end loop;
  end loop;
end;
$$;

-- Line-ups and numbers. Shirts 1-11 start most weeks; 12-15 rotate in
-- (young forwards get more minutes as the season goes on); goals go to
-- attackers first, assists to midfielders.
do $$
declare
  v_fixture record;
  v_side record;
  v_player record;
  v_goals integer;
  v_scorers uuid[];
  v_assisters uuid[];
  v_g integer;
  v_minutes integer;
  v_started boolean;
  v_pick double precision;
  v_candidates uuid[];
begin
  for v_fixture in
    select fixture.*, round.round_number
    from app.fixtures fixture join app.rounds round on round.id = fixture.round_id
  loop
    for v_side in
      select v_fixture.home_team_id as team_id, v_fixture.home_score as scored, v_fixture.away_score as conceded
      union all
      select v_fixture.away_team_id, v_fixture.away_score, v_fixture.home_score
    loop
      v_scorers := '{}';
      v_assisters := '{}';
      for v_g in 1..coalesce(v_side.scored, 0) loop
        v_pick := pg_temp.h('goal' || v_fixture.id || v_side.team_id || v_g);
        select array_agg(player.id order by player.shirt) into v_candidates
        from seed_players player
        where pg_temp.uid('7e020000-0000-4000-8000-', player.club) = v_side.team_id
          and case when v_pick < 0.62 then player.shirt between 12 and 15
            when v_pick < 0.9 then player.shirt between 7 and 11 else player.shirt between 2 and 6 end;
        v_scorers := v_scorers || v_candidates[1 + floor(pg_temp.h('who' || v_fixture.id || v_side.team_id || v_g)
          * array_length(v_candidates, 1))::integer];
        if pg_temp.h('assist' || v_fixture.id || v_side.team_id || v_g) < 0.72 then
          select array_agg(player.id order by player.shirt) into v_candidates
          from seed_players player
          where pg_temp.uid('7e020000-0000-4000-8000-', player.club) = v_side.team_id
            and player.shirt between 2 and 15 and player.id <> v_scorers[v_g];
          v_assisters := v_assisters || v_candidates[1 + floor(pg_temp.h('by' || v_fixture.id || v_side.team_id || v_g)
            * array_length(v_candidates, 1))::integer];
        end if;
      end loop;

      for v_player in
        select player.* from seed_players player
        where pg_temp.uid('7e020000-0000-4000-8000-', player.club) = v_side.team_id
      loop
        v_started := v_player.shirt <= 11
          and not (v_player.shirt = 11 and v_fixture.round_number >= 4 and v_player.club % 2 = 0)
          or (v_player.shirt = 14 and v_fixture.round_number >= 4 and v_player.club % 2 = 0)
          or (v_player.shirt = 13 and v_fixture.round_number % 2 = 1);
        v_minutes := case
          when v_started then 90 - case when v_player.shirt >= 9
            then floor(pg_temp.h('off' || v_fixture.id || v_player.id) * 30)::integer else 0 end
          when v_player.shirt between 12 and 15 or v_player.shirt = 18
            then case when pg_temp.h('sub' || v_fixture.id || v_player.id) < 0.65
              then 10 + floor(pg_temp.h('subm' || v_fixture.id || v_player.id) * 25)::integer else 0 end
          else 0 end;
        continue when v_minutes = 0 and v_player.id <> all (v_scorers) and v_player.id <> all (v_assisters);
        if v_minutes = 0 then v_minutes := 15; end if;
        insert into app.player_fixture_performances (
          football_season_id, fixture_id, player_id, team_id, position, source_provider, source_version,
          started, appeared, minutes, goals, assists, clean_sheets, goals_conceded, saves,
          penalties_saved, penalties_missed, yellow_cards, red_cards, second_yellow_dismissals,
          own_goals, provider_rating, provider_observed_at
        ) values (
          '7e010000-0000-4000-8000-000000000001', v_fixture.id, v_player.id, v_side.team_id,
          v_player.position, 'sportsmonks',
          'sportsmonks:' || encode(extensions.digest(v_fixture.id::text || v_player.id::text, 'sha256'), 'hex'),
          v_started, true, v_minutes,
          (select count(*) from unnest(v_scorers) scorer where scorer = v_player.id),
          (select count(*) from unnest(v_assisters) assister where assister = v_player.id),
          case when v_minutes >= 60 and coalesce(v_side.conceded, 0) = 0
            and v_player.position in ('goalkeeper', 'defender') then 1 else 0 end,
          case when v_player.position = 'goalkeeper' then coalesce(v_side.conceded, 0) else 0 end,
          case when v_player.position = 'goalkeeper'
            then floor(pg_temp.h('saves' || v_fixture.id || v_player.id) * 6)::integer else 0 end,
          0, 0,
          case when pg_temp.h('yc' || v_fixture.id || v_player.id) < 0.12 then 1 else 0 end,
          0, 0, 0,
          case when v_minutes >= 20 then round((5.9 + pg_temp.h('rating' || v_fixture.id || v_player.id) * 2.1
            + 0.35 * (select count(*) from unnest(v_scorers) scorer where scorer = v_player.id)
            + 0.2 * (select count(*) from unnest(v_assisters) assister where assister = v_player.id)
            + case when v_player.shirt in (12, 13, 14, 15) then 0.15 else 0 end)::numeric, 1) end,
          v_fixture.finalized_at
        );
      end loop;
    end loop;
  end loop;
end;
$$;

-- Pépites: open to everyone locally, automatic publication off.
select app_private.pepites_configure('public', false, '7e000000-0000-4000-8000-000000000001');

-- Weekly runs as of rounds 3 to 6, each computed the Monday after its round.
create temporary table seed_runs (round integer primary key, id uuid) on commit drop;
insert into seed_runs
select r, app_private.pepites_start_run('7e010000-0000-4000-8000-000000000001', 'weekly', r,
  timestamptz '2026-08-24 11:00:00+00' + ((r - 1) * 7 || ' days')::interval)
from generate_series(3, 6) r;

-- A fan and a staff member for the preview's sign-in journeys, with local,
-- well-known passwords (this file never reaches a shared database). The staff
-- member is the platform administrator, with a TOTP factor on a known secret
-- (base32 JBSWY3DPEHPK3PXP) so the browser tests can pass the second step.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token,
  recovery_token, email_change_token_new, email_change)
values
  ('7e090000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated',
    'authenticated', 'fan@pepites.local', now(), extensions.crypt('pepites-preview', extensions.gen_salt('bf')),
    '{"provider":"email","providers":["email"]}', '{"username":"fan_pepites"}', now(), now(), '', '', '', ''),
  ('7e090000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated',
    'authenticated', 'staff@pepites.local', now(), extensions.crypt('pepites-preview', extensions.gen_salt('bf')),
    '{"provider":"email","providers":["email"]}', '{"username":"staff_pepites"}', now(), now(), '', '', '', '');
insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
select id, id, id::text, 'email',
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), now(), now(), now()
from auth.users where id in ('7e090000-0000-4000-8000-000000000001', '7e090000-0000-4000-8000-000000000002');
-- Profiles already set up, so sign-in goes straight to the page asked for.
update app.profiles
set display_name = case id when '7e090000-0000-4000-8000-000000000001' then 'Fan Pépites' else 'Staff Pépites' end,
  onboarding_completed_at = clock_timestamp()
where id in ('7e090000-0000-4000-8000-000000000001', '7e090000-0000-4000-8000-000000000002');
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values ('7e0a0000-0000-4000-8000-000000000001', '7e090000-0000-4000-8000-000000000002',
  'Pépites preview', 'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXP');
select api.admin_bootstrap_first_platform_admin('7e090000-0000-4000-8000-000000000002',
  'Local Pépites preview administrator (seed script).', true);

create temporary table seed_actor on commit drop as
select id from app_private.staff_principals where auth_user_id = '7e090000-0000-4000-8000-000000000002';

-- Weeks 4, 5 and 6: drafts from the computed Top 10, a line from the editor
-- for each player of the latest, then scheduled and published through the
-- same functions the tick uses. Week 7 (round 6) stays a draft.
do $$
declare
  v_round integer;
  v_edition uuid;
  v_entries jsonb;
begin
  for v_round in 3..6 loop
    v_edition := app_private.pepites_create_draft((select id from seed_runs where round = v_round),
      date '2026-08-24' + (v_round - 1) * 7, (select id from seed_actor));
    if v_round = 5 then
      select jsonb_agg(jsonb_build_object('rank', entry.editorial_rank, 'playerId', entry.player_id,
          'reasonFr', case score.goals + score.assists
            when 0 then format('Régulier et solide : %s minutes jouées cette saison.', score.minutes)
            when 1 then format('Décisif une fois en %s minutes, avec une note en hausse.', score.minutes)
            else format('Décisif %s fois (buts et passes) en %s minutes.', score.goals + score.assists,
              score.minutes) end,
          'reasonAr', case score.goals + score.assists
            when 0 then format('منتظم وصلب: %s دقيقة لعب هذا الموسم.', score.minutes)
            when 1 then format('حاسم مرة واحدة في %s دقيقة، مع تقييم في تحسن.', score.minutes)
            else format('حاسم %s مرات (أهداف وتمريرات) في %s دقيقة.', score.goals + score.assists,
              score.minutes) end)
        order by entry.editorial_rank)
      into v_entries
      from app.pepites_edition_entries entry
      join app.pepites_editions edition on edition.id = entry.edition_id
      join app.pepites_player_scores score on score.run_id = edition.run_id and score.player_id = entry.player_id
      where entry.edition_id = v_edition;
      perform app_private.pepites_set_entries(v_edition, v_entries, (select id from seed_actor));
    end if;
    if v_round < 6 then
      perform app_private.pepites_schedule(v_edition, statement_timestamp() - interval '1 minute',
        (select id from seed_actor));
      perform app_private.pepites_publish_edition(v_edition, (select id from seed_actor));
    end if;
  end loop;
end;
$$;

commit;

-- What the preview shows, for the record.
select kind, as_of_round_number as round, status, eligible_count, ranked_count
from app.pepites_runs order by as_of_round_number;
select week_number as week, round_number as round, status from app.pepites_editions order by week_number;
