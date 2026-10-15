-- BotolaGO+ Trophées, part 1: the tables, the switch, the catalogue.
--
-- A TROPHY is a milestone a manager earns by playing Fantasy: a first published rating, a first
-- passage into a tier, a journée at 80 points, ten journées played, a transfer that paid off, a
-- place on the podium of a private league, the founding cohort. Owner decisions, 2026-10-15:
--
--   * Trophées are earned by everyone, by playing. BotolaGO+ changes only how they are PRESENTED
--     (the lit cabinet, the frames drawn on the Manager Card, the 9:16 story card). Nothing is
--     sold, and nothing here changes a point, a rating, a tier or a rank.
--   * A trophy is NEVER taken back. Once earned it stays, whatever a later correction of a result
--     does to the figure that earned it. There is no "withdrawn" state: the table has no state
--     column at all, an update of an earned row is refused, and a direct delete is refused (only
--     the cascades of an erased account, a removed season or a removed catalogue entry pass).
--   * A trophy counts only once the result behind it is final, which for rating-based Fantasy
--     points means 5 to 16 days after the match. Each trophy carries the time that result was
--     published (source_published_at), and the screens say « Publié le … ».
--   * The word in French is « trophée », in Arabic « كأس / كؤوس ». The admin prize system
--     (app.fantasy_prizes) is a different thing and is not touched, read or imitated.
--   * The league podium and the league champion are placement awards: they are given only at the
--     END of the season, from the final standing of a private league of at least three managers,
--     once the season's last gameweek is final and published (20261015150100). Before that the
--     cabinet shows them as « en cours », never as earned.
--   * Trophies are evaluated for the current season only, going forward. Nothing is backfilled for
--     a past season.
--   * Visibility (2026-10-15): the trophies a manager has earned (never points, ratings or
--     tiers) are visible by default to the managers who share a private Fantasy league with them
--     this season. They are never visible to strangers, nor in public or overall leagues. A
--     manager can hide them with one switch (app.trophy_visibility, on by default).
--
-- SHIPS OFF. app_private.trophy_settings has one row, switched off. Until the owner switches the
-- evaluator on nothing is written; and while BotolaGO+ is off every read answers
-- {"available": false}. This migration adds tables, rows of configuration (the catalogue and the
-- frames) and one switch function. No existing table, function or row changes.
--
-- WHO WRITES WHAT
--   trophy_settings       app_private.trophy_configure (postgres only) and the evaluator's two
--                         bookkeeping columns (last_run_at, last_result)
--   trophy_catalog        the owner's script (rules are versioned; a new rule is a new code)
--   trophies_earned       app_private.trophy_grant only, called by the evaluator (20261015150100)
--   card_frames           the owner's script
--   card_frame_choices    api.choose_card_frame only (20261015150200)
--   trophy_visibility     api.set_trophies_visibility only (20261015150200)
--
-- Every table: row security enabled and forced, all rights revoked from public, anon,
-- authenticated and service_role, no policy, an index on every foreign-key column. Reads go
-- through api functions (20261015150200).
--
-- DELETION. Earned trophies and frame choices hang off app.profiles by cascade, so erasing an
-- account (app_private.account_deletion_erase) removes them with the rest of the account.

-- ---------------------------------------------------------------------------
-- The switch
-- ---------------------------------------------------------------------------
create table app_private.trophy_settings (
  id boolean primary key default true,
  enabled boolean not null default false,
  last_run_at timestamptz,
  last_result jsonb,
  updated_at timestamptz not null default statement_timestamp(),
  constraint trophy_settings_singleton check (id)
);
insert into app_private.trophy_settings (id) values (true);
alter table app_private.trophy_settings enable row level security;
alter table app_private.trophy_settings force row level security;
revoke all on app_private.trophy_settings from public, anon, authenticated, service_role;
comment on table app_private.trophy_settings is
  'The Trophées switch, one row, off by default. enabled lets trophies-tick grant trophies; last_run_at and last_result are the last pass''s bookkeeping. Changed only by app_private.trophy_configure.';

create function app_private.trophy_configure(p_enabled boolean default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  result app_private.trophy_settings%rowtype;
begin
  -- A null leaves the switch as it is.
  update app_private.trophy_settings set
    enabled = coalesce(p_enabled, enabled),
    updated_at = statement_timestamp()
  where id
  returning * into result;
  return jsonb_build_object('enabled', result.enabled);
end;
$$;
revoke all on function app_private.trophy_configure(boolean)
  from public, anon, authenticated, service_role;
grant execute on function app_private.trophy_configure(boolean) to postgres;
comment on function app_private.trophy_configure(boolean) is
  'Owner-run switch for the Trophées evaluator: true lets trophies-tick grant trophies, false stops it; null leaves it as it is. Pausing does not undo a trophy. Executable by postgres only.';

-- ---------------------------------------------------------------------------
-- The catalogue
-- ---------------------------------------------------------------------------
create table app.trophy_catalog (
  code text primary key,
  family text not null,
  -- season: earned once per Fantasy season; card: earned once, ever (the founding cohort).
  scope text not null default 'season',
  rules_version integer not null default 1,
  -- The threshold of the rule when it has one: a score, a number of journées, a gain in points,
  -- a league rank. The evaluator reads it from here so the screens and the rule cannot drift.
  need integer,
  label_fr text not null,
  label_ar text not null,
  sort_order smallint not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint trophy_catalog_code_check check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint trophy_catalog_family_check check (family in ('paliers', 'journees', 'decisions', 'ligue', 'carte')),
  constraint trophy_catalog_scope_check check (scope in ('season', 'card')),
  constraint trophy_catalog_rules_version_check check (rules_version >= 1),
  constraint trophy_catalog_need_check check (need is null or need >= 1),
  constraint trophy_catalog_status_check check (status in ('active', 'retired')),
  constraint trophy_catalog_labels_check check (
    char_length(btrim(label_fr)) between 1 and 48 and char_length(btrim(label_ar)) between 1 and 48
  )
);
create trigger trophy_catalog_set_updated_at
before update on app.trophy_catalog
for each row execute function app_private.set_updated_at();
alter table app.trophy_catalog enable row level security;
alter table app.trophy_catalog force row level security;
revoke all on app.trophy_catalog from public, anon, authenticated, service_role;
comment on table app.trophy_catalog is
  'The Trophées a manager can earn (rules version 1), by family: paliers, journees, decisions, ligue, carte. need is the rule''s threshold. Labels in French and Arabic. Changed by the owner''s script; read through api.get_my_trophies. Display only: no ranking, league, Fantasy or Manager Card function reads it.';

insert into app.trophy_catalog (code, family, scope, need, label_fr, label_ar, sort_order)
values
  ('first_rating', 'paliers', 'season', null, 'Première note', 'أول تقييم', 10),
  ('first_stade', 'paliers', 'season', null, 'Premier passage STADE', 'أول مرة في مستوى ملعب', 11),
  ('first_pro', 'paliers', 'season', null, 'Premier passage PRO', 'أول مرة في مستوى محترف', 12),
  ('first_champion', 'paliers', 'season', null, 'Premier passage CHAMPION', 'أول مرة في مستوى بطل', 13),
  ('first_legend', 'paliers', 'season', null, 'Premier passage LEGEND', 'أول مرة في مستوى أسطورة', 14),
  ('gw_80', 'journees', 'season', 80, 'Journée à 80 pts', 'جولة بـ 80 نقطة', 20),
  ('ten_gameweeks', 'journees', 'season', 10, '10 journées jouées', '10 جولات لُعبت', 21),
  ('thirty_gameweeks', 'journees', 'season', 30, '30 journées jouées', '30 جولة لُعبت', 22),
  ('winning_transfer', 'decisions', 'season', 10, 'Transfert gagnant', 'انتقال رابح', 30),
  -- league_podium and league_leader are awarded at the end of the season only (20261015150100)
  ('league_podium', 'ligue', 'season', 3, 'Podium de la ligue', 'منصة الدوري', 40),
  ('league_leader', 'ligue', 'season', 1, 'Champion de votre ligue', 'بطل دوريك', 41),
  ('founder_2026', 'carte', 'card', null, 'Fondateur 2026', 'مؤسس 2026', 50);

-- ---------------------------------------------------------------------------
-- The earned trophies
-- ---------------------------------------------------------------------------
create table app.trophies_earned (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.profiles(id) on delete cascade,
  trophy_code text not null references app.trophy_catalog(code) on delete cascade,
  -- null for a card-scope trophy
  fantasy_season_id uuid references app.fantasy_seasons(id) on delete cascade,
  gameweek_seq integer,
  -- The figure that earned it, as it was when it was earned (a score, a rating, names of
  -- players, a rank). Kept as it was: a later correction does not rewrite it.
  facts jsonb not null default '{}'::jsonb,
  rules_version integer not null,
  -- When the result that earned it was published (the gameweek's finalized_at).
  source_published_at timestamptz not null,
  earned_at timestamptz not null default statement_timestamp(),
  constraint trophies_earned_gameweek_check check (gameweek_seq is null or gameweek_seq >= 1),
  constraint trophies_earned_facts_check check (jsonb_typeof(facts) = 'object')
);
-- One row per manager, trophy and season (and one per card-scope trophy).
create unique index trophies_earned_season_key
  on app.trophies_earned (user_id, trophy_code, fantasy_season_id)
  where fantasy_season_id is not null;
create unique index trophies_earned_card_key
  on app.trophies_earned (user_id, trophy_code)
  where fantasy_season_id is null;
create index trophies_earned_trophy_code_idx on app.trophies_earned (trophy_code);
create index trophies_earned_season_idx on app.trophies_earned (fantasy_season_id);
-- the cascade from an erased account scans by user; the two unique indexes above are partial
create index trophies_earned_user_idx on app.trophies_earned (user_id);

-- NEVER TAKEN BACK. An earned row is never changed and never removed by a statement. The
-- cascades (an erased account, a removed season, a removed catalogue entry) run one trigger
-- level deeper than the statement, so they pass; a direct delete does not.
create function app_private.trophies_earned_keep()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception using errcode = 'P0001', message = 'trophy_is_never_changed';
  end if;
  if pg_trigger_depth() <= 1 then
    raise exception using errcode = 'P0001', message = 'trophy_is_never_taken_back';
  end if;
  return old;
end;
$$;
revoke all on function app_private.trophies_earned_keep()
  from public, anon, authenticated, service_role;
comment on function app_private.trophies_earned_keep() is
  'Refuses to change an earned trophy and refuses a direct delete: a trophy is never taken back after a corrected result. Cascades from an erased account, season or catalogue entry pass. No grant.';
create trigger trophies_earned_keep_update
before update on app.trophies_earned
for each row execute function app_private.trophies_earned_keep();
create trigger trophies_earned_keep_delete
before delete on app.trophies_earned
for each row execute function app_private.trophies_earned_keep();

alter table app.trophies_earned enable row level security;
alter table app.trophies_earned force row level security;
revoke all on app.trophies_earned from public, anon, authenticated, service_role;
comment on table app.trophies_earned is
  'The trophies a manager has earned, one row per trophy and season. Written only by app_private.trophy_grant (the evaluator). Never updated, never deleted by a statement: a trophy is not taken back after a corrected result. source_published_at is when the result behind it was published. Row security forced, no policy, no grant: only definer functions read it. Cascades from the profile.';

-- ---------------------------------------------------------------------------
-- The frames
-- ---------------------------------------------------------------------------
-- A FRAME is how the Manager Card is bordered. standard is free and always allowed; every other
-- frame is the reward of one trophy and is shown only to a member who has earned that trophy.
create table app.card_frames (
  code text primary key,
  trophy_code text unique references app.trophy_catalog(code) on delete restrict,
  status text not null default 'active',
  label_fr text not null,
  label_ar text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint card_frames_code_check check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint card_frames_status_check check (status in ('active', 'retired')),
  -- standard has no trophy; every other frame carries the code of its trophy
  constraint card_frames_trophy_check check (
    (code = 'standard' and trophy_code is null) or (code <> 'standard' and trophy_code = code)
  ),
  constraint card_frames_standard_check check (code <> 'standard' or status = 'active'),
  constraint card_frames_labels_check check (
    char_length(btrim(label_fr)) between 1 and 48 and char_length(btrim(label_ar)) between 1 and 48
  )
);
create trigger card_frames_set_updated_at
before update on app.card_frames
for each row execute function app_private.set_updated_at();
alter table app.card_frames enable row level security;
alter table app.card_frames force row level security;
revoke all on app.card_frames from public, anon, authenticated, service_role;
comment on table app.card_frames is
  'The Manager Card frames. standard is free; every other frame is the reward of the trophy with the same code and is shown to a member who has earned it. Cosmetic: nothing computes from it. Changed by the owner''s script; read through api functions.';

insert into app.card_frames (code, trophy_code, label_fr, label_ar, sort_order)
values
  ('standard', null, 'Standard', 'عادي', 0),
  ('founder_2026', 'founder_2026', 'Fondateur 2026', 'مؤسس 2026', 1),
  ('first_stade', 'first_stade', 'STADE', 'ملعب', 2),
  ('first_pro', 'first_pro', 'PRO', 'محترف', 3),
  ('first_champion', 'first_champion', 'CHAMPION', 'بطل', 4),
  ('first_legend', 'first_legend', 'LEGEND', 'أسطورة', 5),
  ('winning_transfer', 'winning_transfer', 'Transfert gagnant', 'انتقال رابح', 6),
  ('ten_gameweeks', 'ten_gameweeks', '10 journées', '10 جولات', 7),
  ('thirty_gameweeks', 'thirty_gameweeks', '30 journées', '30 جولة', 8);

create table app.card_frame_choices (
  user_id uuid primary key references app.profiles(id) on delete cascade,
  frame_code text not null references app.card_frames(code) on delete restrict,
  chosen_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);
create index card_frame_choices_frame_idx on app.card_frame_choices (frame_code);
create trigger card_frame_choices_set_updated_at
before update on app.card_frame_choices
for each row execute function app_private.set_updated_at();
create trigger card_frame_choices_refuse_unverified_mfa_actor
before insert or update or delete on app.card_frame_choices
for each statement execute function app_private.refuse_unverified_mfa_actor();
alter table app.card_frame_choices enable row level security;
alter table app.card_frame_choices force row level security;
revoke all on app.card_frame_choices from public, anon, authenticated, service_role;
comment on table app.card_frame_choices is
  'The frame a manager chose for their card (display only). Written only by api.choose_card_frame, which checks the trophy and the membership. Kept when membership lapses (the card shows standard until it is renewed). Row security forced, no policy, no grant. Cascades from the profile.';

-- ---------------------------------------------------------------------------
-- Who may see a manager's trophies
-- ---------------------------------------------------------------------------
-- One row per manager who has touched the switch; no row means the default, which is ON: the
-- managers who share a private Fantasy league with the manager this season see the trophies they
-- earned (the codes and the count, nothing else). Strangers never do, and public or overall
-- leagues never show them. Written only by api.set_trophies_visibility (20261015150200), which
-- carries the same second-factor step-up as the frame choice.
create table app.trophy_visibility (
  user_id uuid primary key references app.profiles(id) on delete cascade,
  show_to_league_mates boolean not null default true,
  updated_at timestamptz not null default statement_timestamp()
);
create trigger trophy_visibility_set_updated_at
before update on app.trophy_visibility
for each row execute function app_private.set_updated_at();
create trigger trophy_visibility_refuse_unverified_mfa_actor
before insert or update or delete on app.trophy_visibility
for each statement execute function app_private.refuse_unverified_mfa_actor();
alter table app.trophy_visibility enable row level security;
alter table app.trophy_visibility force row level security;
revoke all on app.trophy_visibility from public, anon, authenticated, service_role;
comment on table app.trophy_visibility is
  'Whether a manager shows the trophies they earned to the managers who share a private Fantasy league with them (default on when there is no row). Written only by api.set_trophies_visibility. Row security forced, no policy, no grant. Cascades from the profile.';

notify pgrst, 'reload schema';
