-- BotolaGO+ (membership), part 2: the card editions and the card reads.
--
-- An EDITION is how a manager's Curva card is drawn: standard (free, the metal
-- of the earned tier) or one of the four paid editions, Holo, Électrique,
-- Pixels and Chrome. Owner decisions, 2026-10-13: a member's chosen edition is
-- PUBLIC wherever their card is drawn (the rankings, the leagues, their
-- profile, the share picture); the ranking order is points only and never
-- depends on membership; when membership ends the card goes back to standard
-- everywhere, and the choice is remembered for a renewal.
--
-- COSMETIC ONLY. The edition is a layer chosen at draw time. Nothing here is
-- read by the Manager Card calculation (app_private.manager_card_tick and its
-- helpers), a ranking, a league or any Fantasy rule, and nothing here changes
-- what those compute: the only change to an existing function is ONE added
-- key, `edition`, on the two card reads below. A pgTAP test lists every
-- function that names the membership or edition tables.
--
-- WHAT CHANGES
--   app.card_editions         catalogue: standard + holo, electric, pixel, chrome
--   app.card_edition_choices  one row per member who chose (written only by
--                             api.choose_card_design)
--   api.choose_card_design    members only; standard is always allowed
--   api.get_my_manager_card   the 20261012200100 answer plus card.edition
--   api.get_manager_cards     the 20261010120200 answer plus card.edition on
--                             every card
--
-- WHICH EDITION A CARD SHOWS (app_private.card_edition_effective)
--   the chosen edition when it is in the catalogue and live (status active,
--   inside starts_at / ends_at) AND, for a paid edition, the member holds
--   BotolaGO+ right now (app_private.has_premium); otherwise 'standard'. While
--   BotolaGO+ is in preview, a paid edition is shown only to its owner (the
--   viewer is the card's own manager); once mode is on, to every signed-in
--   reader. While off, every card says 'standard'.

-- ---------------------------------------------------------------------------
-- The catalogue
-- ---------------------------------------------------------------------------
create table app.card_editions (
  code text primary key,
  premium boolean not null,
  finish text not null,
  status text not null default 'active',
  starts_at timestamptz,
  ends_at timestamptz,
  label_fr text not null,
  label_ar text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint card_editions_code_check check (code ~ '^[a-z][a-z0-9_]{1,31}$'),
  constraint card_editions_finish_check check (finish in ('tier_metal', 'holo', 'electric', 'pixel', 'chrome')),
  constraint card_editions_status_check check (status in ('active', 'retired')),
  constraint card_editions_window_check check (starts_at is null or ends_at is null or ends_at > starts_at),
  constraint card_editions_labels_check check (
    char_length(btrim(label_fr)) between 1 and 40 and char_length(btrim(label_ar)) between 1 and 40
  ),
  -- The free edition is always free and always the tier's own metal.
  constraint card_editions_standard_check check (
    code <> 'standard' or (not premium and finish = 'tier_metal' and status = 'active'
      and starts_at is null and ends_at is null)
  ),
  constraint card_editions_paid_check check (premium or code = 'standard')
);
create trigger card_editions_set_updated_at
before update on app.card_editions
for each row execute function app_private.set_updated_at();
alter table app.card_editions enable row level security;
alter table app.card_editions force row level security;
revoke all on app.card_editions from public, anon, authenticated, service_role;
comment on table app.card_editions is
  'The Curva card editions. standard is free and uses the earned tier''s metal; every other edition is a paid BotolaGO+ edition. Labels in French and Arabic. Changed by the owner''s script; read through api functions (premium_status, get_my_premium). Row security forced, no policy.';

insert into app.card_editions (code, premium, finish, label_fr, label_ar, sort_order)
values
  ('standard', false, 'tier_metal', 'Standard', 'عادية', 0),
  ('holo', true, 'holo', 'Holo', 'هولو', 1),
  ('electric', true, 'electric', 'Électrique', 'كهربائية', 2),
  ('pixel', true, 'pixel', 'Pixels', 'بكسل', 3),
  ('chrome', true, 'chrome', 'Chrome', 'كروم', 4);

-- ---------------------------------------------------------------------------
-- The choices
-- ---------------------------------------------------------------------------
create table app.card_edition_choices (
  user_id uuid primary key references app.profiles(id) on delete cascade,
  edition_code text not null references app.card_editions(code) on delete restrict,
  chosen_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);
create index card_edition_choices_edition_idx on app.card_edition_choices (edition_code);
create trigger card_edition_choices_set_updated_at
before update on app.card_edition_choices
for each row execute function app_private.set_updated_at();
create trigger card_edition_choices_refuse_unverified_mfa_actor
before insert or update or delete on app.card_edition_choices
for each statement execute function app_private.refuse_unverified_mfa_actor();
alter table app.card_edition_choices enable row level security;
alter table app.card_edition_choices force row level security;
revoke all on app.card_edition_choices from public, anon, authenticated, service_role;
comment on table app.card_edition_choices is
  'The edition a manager chose for their card (display only). Written only by api.choose_card_design, which checks membership. Kept when membership lapses (the card shows standard until it is renewed). Row security forced, no policy. Cascades from the profile.';

-- ---------------------------------------------------------------------------
-- Which edition a card shows
-- ---------------------------------------------------------------------------
create function app_private.card_edition_effective(p_user uuid, p_viewer uuid default null)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select e.code
    from app.card_edition_choices c
    join app.card_editions e on e.code = c.edition_code
    where c.user_id = p_user
      and e.status = 'active'
      and (e.starts_at is null or e.starts_at <= statement_timestamp())
      and (e.ends_at is null or e.ends_at > statement_timestamp())
      and (
        not e.premium
        or (
          app_private.has_premium(p_user)
          and (
            (select s.mode from app_private.premium_settings s where s.id) = 'on'
            or p_user is not distinct from p_viewer)))
  ), 'standard');
$$;
revoke all on function app_private.card_edition_effective(uuid, uuid)
  from public, anon, authenticated, service_role;
comment on function app_private.card_edition_effective(uuid, uuid) is
  'The edition code a manager''s card shows to a viewer: the chosen edition when live in the catalogue and, for a paid edition, the manager is a member now (in preview, only to the manager); else standard. Cosmetic: nothing computes from it. No grant.';

-- ---------------------------------------------------------------------------
-- api.choose_card_design
-- ---------------------------------------------------------------------------
create function api.choose_card_design(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid;
  edition app.card_editions%rowtype;
  mode text;
begin
  if p_code is null or p_code !~ '^[a-z][a-z0-9_]{1,31}$' then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select s.mode into mode from app_private.premium_settings s where s.id;
  if mode is distinct from 'on' and mode is distinct from 'preview' then
    return jsonb_build_object('available', false);
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  if not exists (
    select 1 from app.profiles profile where profile.id = actor and profile.deleted_at is null
  ) then
    raise exception using errcode = 'PT404', message = 'profile_not_found';
  end if;

  select * into edition from app.card_editions e
  where e.code = p_code and e.status = 'active'
    and (e.starts_at is null or e.starts_at <= statement_timestamp())
    and (e.ends_at is null or e.ends_at > statement_timestamp());
  if not found then
    raise exception using errcode = 'PT404', message = 'card_edition_not_found';
  end if;
  -- The free edition is always allowed, so a lapsed member can go back to it;
  -- a paid edition needs BotolaGO+ now (in preview: a live grant or a valid entitlement).
  if edition.premium and not app_private.has_premium(actor) then
    raise exception using errcode = 'PT403', message = 'premium_required';
  end if;

  insert into app.card_edition_choices (user_id, edition_code)
  values (actor, edition.code)
  on conflict (user_id) do update set
    edition_code = excluded.edition_code,
    chosen_at = statement_timestamp();

  return jsonb_build_object(
    'available', true,
    'chosenEdition', edition.code,
    'edition', app_private.card_edition_effective(actor, actor)
  );
end;
$$;
revoke all on function api.choose_card_design(text) from public, anon, authenticated, service_role;
grant execute on function api.choose_card_design(text) to authenticated, service_role;
comment on function api.choose_card_design(text) is
  'Chooses the caller''s card edition: {available, chosenEdition, edition}. standard is always allowed; a paid edition needs BotolaGO+ (PT403 premium_required). {available:false} while BotolaGO+ is off. Signed-in, step-up. Cosmetic only.';

-- ---------------------------------------------------------------------------
-- api.get_my_manager_card: the body of 20261012200100 plus card.edition
-- ---------------------------------------------------------------------------
create or replace function api.get_my_manager_card()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid;
  card jsonb;
begin
  if not app_private.manager_card_read_ready() then
    return jsonb_build_object('available', false);
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  card := app_private.manager_card_my_card(actor);
  -- Additive: the pending rating change (zero or one), which the card animates
  -- once and then acknowledges.
  if card is not null then
    card := card || jsonb_build_object('ovrChanges', coalesce((
      select jsonb_agg(m.moment order by m.occurred_at, m.moment_key)
      from app_private.manager_card_ovr_moments(actor) m
      where m.pending), '[]'::jsonb));
    -- Additive (BotolaGO+): the edition the card is drawn in. Cosmetic.
    card := card || jsonb_build_object('edition', app_private.card_edition_effective(actor, actor));
  end if;
  return jsonb_build_object('available', true, 'card', card);
end;
$$;
comment on function api.get_my_manager_card() is
  'The caller''s Manager Card for the current Fantasy season: {available:true, card} (card null without a team this season), or {available:false} while off. card.ovrChanges lists the pending rating change (zero or one); card.edition is the edition code the card is drawn in (standard unless the caller is a member who chose another). Signed-in, step-up. Display only.';

-- ---------------------------------------------------------------------------
-- api.get_manager_cards: the body of 20261010120200 plus card.edition
-- ---------------------------------------------------------------------------
create or replace function api.get_manager_cards(p_team_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid;
  result jsonb;
begin
  if p_team_ids is null or cardinality(p_team_ids) > 1000
    or (select count(distinct asked.id) from unnest(p_team_ids) as asked(id)) > 100 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if not app_private.manager_card_read_ready() then
    return jsonb_build_object('available', false);
  end if;
  perform app_private.assert_mfa_step_up();
  actor := (select auth.uid());
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  -- The order each team was first asked for; unknown teams and hidden
  -- profiles are left out. Each card gains its edition (BotolaGO+, cosmetic).
  select coalesce(jsonb_agg(
      found.card || jsonb_build_object('edition', found.edition) order by found.position
    ), '[]'::jsonb)
  into result
  from (
    select asked.position, built.card,
      app_private.card_edition_effective(team.user_id, actor) as edition
    from (
      select t.id, min(t.position) as position
      from unnest(p_team_ids) with ordinality as t(id, position)
      where t.id is not null
      group by t.id
    ) asked
    join app_private.manager_card_member_card(p_team_ids) built on built.team_id = asked.id
    join app.fantasy_teams team on team.id = built.team_id
  ) found;
  return jsonb_build_object('available', true, 'cards', result);
end;
$$;
comment on function api.get_manager_cards(uuid[]) is
  'Up to 100 managers'' cards by Fantasy team, in the order asked: {available, cards}; each card has the keys of memberCardSchema plus edition (the edition it is drawn in: public, standard unless the manager is a member who chose another). Unknown teams and hidden profiles are left out. Signed-in, step-up. Display only.';

notify pgrst, 'reload schema';
