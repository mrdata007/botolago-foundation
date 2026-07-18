-- =========================================================================
-- Phase 3A: BotolaGO production database foundation
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_moderator(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','moderator'));
$$;

CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Admins view all roles" ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ---------- Clubs ----------
CREATE TABLE IF NOT EXISTS public.clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name_fr text NOT NULL,
  name_ar text NOT NULL,
  short_name_fr text NOT NULL,
  short_name_ar text NOT NULL,
  city_fr text,
  city_ar text,
  crest_url text,
  primary_color text,
  secondary_color text,
  venue text,
  provider_id text UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.clubs TO anon, authenticated;
GRANT ALL ON public.clubs TO service_role;
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active clubs public" ON public.clubs FOR SELECT USING (is_active);
CREATE POLICY "Admins manage clubs" ON public.clubs FOR ALL TO authenticated
  USING (public.is_admin_or_moderator(auth.uid())) WITH CHECK (public.is_admin_or_moderator(auth.uid()));
CREATE TRIGGER trg_clubs_updated BEFORE UPDATE ON public.clubs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Profiles ----------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username citext UNIQUE,
  display_name text,
  avatar_url text,
  favorite_club_id uuid REFERENCES public.clubs(id) ON DELETE SET NULL,
  preferred_language text NOT NULL DEFAULT 'fr' CHECK (preferred_language IN ('fr','ar')),
  bio text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles public read" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins update any profile" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Preferences ----------
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  match_alerts boolean NOT NULL DEFAULT true,
  breaking_news boolean NOT NULL DEFAULT true,
  fantasy_deadline_reminders boolean NOT NULL DEFAULT true,
  chat_notifications boolean NOT NULL DEFAULT true,
  social_notifications boolean NOT NULL DEFAULT true,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'Africa/Casablanca',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.user_preferences TO authenticated;
GRANT ALL ON public.user_preferences TO service_role;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own prefs" ON public.user_preferences FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_prefs_updated BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- New user trigger ----------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, preferred_language)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(COALESCE(NEW.email,''), '@', 1)),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'preferred_language',''), 'fr')
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_preferences (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------- Players ----------
CREATE TABLE IF NOT EXISTS public.players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES public.clubs(id) ON DELETE SET NULL,
  provider_id text UNIQUE,
  name_fr text NOT NULL,
  name_ar text NOT NULL,
  position text NOT NULL CHECK (position IN ('GK','DEF','MID','FWD')),
  shirt_number int CHECK (shirt_number BETWEEN 1 AND 99),
  price_millions numeric(4,1) NOT NULL DEFAULT 4.5 CHECK (price_millions >= 0),
  form numeric(3,1) NOT NULL DEFAULT 0,
  ownership_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (ownership_percent BETWEEN 0 AND 100),
  total_points int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','doubtful','injured','suspended','unavailable')),
  photo_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_players_club ON public.players(club_id);
CREATE INDEX IF NOT EXISTS idx_players_position ON public.players(position);
GRANT SELECT ON public.players TO anon, authenticated;
GRANT ALL ON public.players TO service_role;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active players public" ON public.players FOR SELECT USING (is_active);
CREATE POLICY "Admins manage players" ON public.players FOR ALL TO authenticated
  USING (public.is_admin_or_moderator(auth.uid())) WITH CHECK (public.is_admin_or_moderator(auth.uid()));
CREATE TRIGGER trg_players_updated BEFORE UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Gameweeks ----------
CREATE TABLE IF NOT EXISTS public.gameweeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season text NOT NULL,
  number int NOT NULL CHECK (number > 0),
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','live','finalized')),
  deadline timestamptz NOT NULL,
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season, number)
);
GRANT SELECT ON public.gameweeks TO anon, authenticated;
GRANT ALL ON public.gameweeks TO service_role;
ALTER TABLE public.gameweeks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gameweeks public" ON public.gameweeks FOR SELECT USING (true);
CREATE POLICY "Admins manage gameweeks" ON public.gameweeks FOR ALL TO authenticated
  USING (public.is_admin_or_moderator(auth.uid())) WITH CHECK (public.is_admin_or_moderator(auth.uid()));
CREATE TRIGGER trg_gw_updated BEFORE UPDATE ON public.gameweeks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Fixtures ----------
CREATE TABLE IF NOT EXISTS public.fixtures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gameweek_id uuid NOT NULL REFERENCES public.gameweeks(id) ON DELETE CASCADE,
  home_club_id uuid NOT NULL REFERENCES public.clubs(id),
  away_club_id uuid NOT NULL REFERENCES public.clubs(id),
  kickoff timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','finished','postponed','cancelled')),
  home_score int,
  away_score int,
  venue text,
  provider_id text UNIQUE,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (home_club_id <> away_club_id)
);
CREATE INDEX IF NOT EXISTS idx_fixtures_gw ON public.fixtures(gameweek_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_kickoff ON public.fixtures(kickoff);
GRANT SELECT ON public.fixtures TO anon, authenticated;
GRANT ALL ON public.fixtures TO service_role;
ALTER TABLE public.fixtures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Fixtures public" ON public.fixtures FOR SELECT USING (true);
CREATE POLICY "Admins manage fixtures" ON public.fixtures FOR ALL TO authenticated
  USING (public.is_admin_or_moderator(auth.uid())) WITH CHECK (public.is_admin_or_moderator(auth.uid()));
CREATE TRIGGER trg_fixtures_updated BEFORE UPDATE ON public.fixtures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Standings ----------
CREATE TABLE IF NOT EXISTS public.standings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season text NOT NULL,
  gameweek_id uuid REFERENCES public.gameweeks(id) ON DELETE SET NULL,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  rank int NOT NULL,
  played int NOT NULL DEFAULT 0,
  won int NOT NULL DEFAULT 0,
  drawn int NOT NULL DEFAULT 0,
  lost int NOT NULL DEFAULT 0,
  goals_for int NOT NULL DEFAULT 0,
  goals_against int NOT NULL DEFAULT 0,
  goal_diff int NOT NULL DEFAULT 0,
  points int NOT NULL DEFAULT 0,
  form text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season, gameweek_id, club_id)
);
CREATE INDEX IF NOT EXISTS idx_standings_season ON public.standings(season);
GRANT SELECT ON public.standings TO anon, authenticated;
GRANT ALL ON public.standings TO service_role;
ALTER TABLE public.standings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Standings public" ON public.standings FOR SELECT USING (true);
CREATE POLICY "Admins manage standings" ON public.standings FOR ALL TO authenticated
  USING (public.is_admin_or_moderator(auth.uid())) WITH CHECK (public.is_admin_or_moderator(auth.uid()));
CREATE TRIGGER trg_standings_updated BEFORE UPDATE ON public.standings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Injuries ----------
CREATE TABLE IF NOT EXISTS public.injuries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('doubtful','injured','suspended')),
  detail_fr text,
  detail_ar text,
  expected_return date,
  source text,
  provider_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_injuries_player ON public.injuries(player_id);
GRANT SELECT ON public.injuries TO anon, authenticated;
GRANT ALL ON public.injuries TO service_role;
ALTER TABLE public.injuries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Injuries public" ON public.injuries FOR SELECT USING (true);
CREATE POLICY "Admins manage injuries" ON public.injuries FOR ALL TO authenticated
  USING (public.is_admin_or_moderator(auth.uid())) WITH CHECK (public.is_admin_or_moderator(auth.uid()));
CREATE TRIGGER trg_injuries_updated BEFORE UPDATE ON public.injuries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Articles ----------
CREATE TABLE IF NOT EXISTS public.articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title_fr text NOT NULL,
  title_ar text NOT NULL,
  excerpt_fr text,
  excerpt_ar text,
  body_fr text,
  body_ar text,
  category text NOT NULL DEFAULT 'news' CHECK (category IN ('news','analysis','transfer','fantasy','match_report','interview')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  hero_image_url text,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  byline text,
  published_at timestamptz,
  source_url text,
  provider_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_articles_status_pub ON public.articles(status, published_at DESC);
GRANT SELECT ON public.articles TO anon, authenticated;
GRANT ALL ON public.articles TO service_role;
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published articles public" ON public.articles FOR SELECT USING (status = 'published');
CREATE POLICY "Authors read own drafts" ON public.articles FOR SELECT TO authenticated
  USING (auth.uid() = author_id);
CREATE POLICY "Admins manage articles" ON public.articles FOR ALL TO authenticated
  USING (public.is_admin_or_moderator(auth.uid())) WITH CHECK (public.is_admin_or_moderator(auth.uid()));
CREATE TRIGGER trg_articles_updated BEFORE UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.article_clubs (
  article_id uuid NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, club_id)
);
GRANT SELECT ON public.article_clubs TO anon, authenticated;
GRANT ALL ON public.article_clubs TO service_role;
ALTER TABLE public.article_clubs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Article-club links public" ON public.article_clubs FOR SELECT USING (true);
CREATE POLICY "Admins manage article clubs" ON public.article_clubs FOR ALL TO authenticated
  USING (public.is_admin_or_moderator(auth.uid())) WITH CHECK (public.is_admin_or_moderator(auth.uid()));

-- ---------- Fantasy ----------
CREATE TABLE IF NOT EXISTS public.fantasy_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  team_name text NOT NULL,
  manager_name text,
  formation text NOT NULL DEFAULT '4-4-2',
  bank numeric(5,1) NOT NULL DEFAULT 0,
  free_transfers int NOT NULL DEFAULT 1 CHECK (free_transfers >= 0),
  pending_transfers int NOT NULL DEFAULT 0,
  current_gameweek_id uuid REFERENCES public.gameweeks(id) ON DELETE SET NULL,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fantasy_teams TO authenticated;
GRANT ALL ON public.fantasy_teams TO service_role;
ALTER TABLE public.fantasy_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own fantasy team" ON public.fantasy_teams FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_fantasy_teams_updated BEFORE UPDATE ON public.fantasy_teams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.fantasy_squad_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.fantasy_teams(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id),
  slot int NOT NULL CHECK (slot BETWEEN 1 AND 15),
  is_captain boolean NOT NULL DEFAULT false,
  is_vice boolean NOT NULL DEFAULT false,
  purchase_price numeric(4,1) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, slot),
  UNIQUE (team_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_squad_team ON public.fantasy_squad_members(team_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fantasy_squad_members TO authenticated;
GRANT ALL ON public.fantasy_squad_members TO service_role;
ALTER TABLE public.fantasy_squad_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own squad" ON public.fantasy_squad_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fantasy_teams t WHERE t.id = team_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.fantasy_teams t WHERE t.id = team_id AND t.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.fantasy_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.fantasy_teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gameweek_id uuid NOT NULL REFERENCES public.gameweeks(id),
  player_out_id uuid NOT NULL REFERENCES public.players(id),
  player_in_id uuid NOT NULL REFERENCES public.players(id),
  price_out numeric(4,1) NOT NULL,
  price_in numeric(4,1) NOT NULL,
  cost int NOT NULL DEFAULT 0,
  hit int NOT NULL DEFAULT 0,
  chip text CHECK (chip IN ('wildcard','free_hit','bench_boost','triple_captain')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled')),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transfers_team_gw ON public.fantasy_transfers(team_id, gameweek_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fantasy_transfers TO authenticated;
GRANT ALL ON public.fantasy_transfers TO service_role;
ALTER TABLE public.fantasy_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own transfers" ON public.fantasy_transfers FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.fantasy_chip_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.fantasy_teams(id) ON DELETE CASCADE,
  gameweek_id uuid NOT NULL REFERENCES public.gameweeks(id),
  chip text NOT NULL CHECK (chip IN ('wildcard','free_hit','bench_boost','triple_captain')),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','used','cancelled')),
  season text NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_chip_used_once
  ON public.fantasy_chip_uses (team_id, chip, season) WHERE state = 'used';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fantasy_chip_uses TO authenticated;
GRANT ALL ON public.fantasy_chip_uses TO service_role;
ALTER TABLE public.fantasy_chip_uses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own chips" ON public.fantasy_chip_uses FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fantasy_teams t WHERE t.id = team_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.fantasy_teams t WHERE t.id = team_id AND t.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.fantasy_gameweek_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.fantasy_teams(id) ON DELETE CASCADE,
  gameweek_id uuid NOT NULL REFERENCES public.gameweeks(id) ON DELETE CASCADE,
  final_points int NOT NULL DEFAULT 0,
  raw_points int NOT NULL DEFAULT 0,
  captain_points int NOT NULL DEFAULT 0,
  bench_points int NOT NULL DEFAULT 0,
  bench_boost_points int NOT NULL DEFAULT 0,
  triple_captain_points int NOT NULL DEFAULT 0,
  transfer_hit int NOT NULL DEFAULT 0,
  effective_captain_id uuid REFERENCES public.players(id),
  captain_multiplier int NOT NULL DEFAULT 2,
  auto_subs jsonb NOT NULL DEFAULT '[]'::jsonb,
  chip text CHECK (chip IN ('wildcard','free_hit','bench_boost','triple_captain')),
  is_finalized boolean NOT NULL DEFAULT false,
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, gameweek_id)
);
GRANT SELECT, INSERT, UPDATE ON public.fantasy_gameweek_results TO authenticated;
GRANT ALL ON public.fantasy_gameweek_results TO service_role;
ALTER TABLE public.fantasy_gameweek_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own results" ON public.fantasy_gameweek_results FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fantasy_teams t WHERE t.id = team_id AND t.user_id = auth.uid()));
CREATE POLICY "Users insert own results" ON public.fantasy_gameweek_results FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.fantasy_teams t WHERE t.id = team_id AND t.user_id = auth.uid()));
CREATE POLICY "Users update own results" ON public.fantasy_gameweek_results FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fantasy_teams t WHERE t.id = team_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.fantasy_teams t WHERE t.id = team_id AND t.user_id = auth.uid()));
CREATE TRIGGER trg_fgr_updated BEFORE UPDATE ON public.fantasy_gameweek_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.save_fantasy_team(
  _team_name text, _manager_name text, _formation text,
  _bank numeric, _current_gameweek_id uuid, _squad jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid(); _team_id uuid;
  _count int; _captains int; _vices int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT jsonb_array_length(_squad) INTO _count;
  IF _count <> 15 THEN RAISE EXCEPTION 'Squad must have exactly 15 players (got %)', _count; END IF;
  SELECT count(*) INTO _captains FROM jsonb_array_elements(_squad) x WHERE (x->>'is_captain')::boolean;
  SELECT count(*) INTO _vices FROM jsonb_array_elements(_squad) x WHERE (x->>'is_vice')::boolean;
  IF _captains <> 1 THEN RAISE EXCEPTION 'Exactly one captain required'; END IF;
  IF _vices <> 1 THEN RAISE EXCEPTION 'Exactly one vice-captain required'; END IF;

  INSERT INTO public.fantasy_teams (user_id, team_name, manager_name, formation, bank, current_gameweek_id)
  VALUES (_uid, _team_name, _manager_name, _formation, _bank, _current_gameweek_id)
  ON CONFLICT (user_id) DO UPDATE SET
    team_name = EXCLUDED.team_name,
    manager_name = EXCLUDED.manager_name,
    formation = EXCLUDED.formation,
    bank = EXCLUDED.bank,
    current_gameweek_id = EXCLUDED.current_gameweek_id,
    version = public.fantasy_teams.version + 1
  RETURNING id INTO _team_id;

  DELETE FROM public.fantasy_squad_members WHERE team_id = _team_id;
  INSERT INTO public.fantasy_squad_members (team_id, player_id, slot, is_captain, is_vice, purchase_price)
  SELECT _team_id,
         (x->>'player_id')::uuid,
         (x->>'slot')::int,
         COALESCE((x->>'is_captain')::boolean, false),
         COALESCE((x->>'is_vice')::boolean, false),
         (x->>'purchase_price')::numeric
  FROM jsonb_array_elements(_squad) x;
  RETURN _team_id;
END; $$;
REVOKE ALL ON FUNCTION public.save_fantasy_team(text,text,text,numeric,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_fantasy_team(text,text,text,numeric,uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.finalize_gameweek_result(
  _team_id uuid, _gameweek_id uuid, _payload jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _rid uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fantasy_teams WHERE id = _team_id AND user_id = _uid) THEN
    RAISE EXCEPTION 'Not owner of team';
  END IF;
  INSERT INTO public.fantasy_gameweek_results (
    team_id, gameweek_id, final_points, raw_points, captain_points, bench_points,
    bench_boost_points, triple_captain_points, transfer_hit, effective_captain_id,
    captain_multiplier, auto_subs, chip, is_finalized, finalized_at
  ) VALUES (
    _team_id, _gameweek_id,
    COALESCE((_payload->>'final_points')::int, 0),
    COALESCE((_payload->>'raw_points')::int, 0),
    COALESCE((_payload->>'captain_points')::int, 0),
    COALESCE((_payload->>'bench_points')::int, 0),
    COALESCE((_payload->>'bench_boost_points')::int, 0),
    COALESCE((_payload->>'triple_captain_points')::int, 0),
    COALESCE((_payload->>'transfer_hit')::int, 0),
    NULLIF(_payload->>'effective_captain_id','')::uuid,
    COALESCE((_payload->>'captain_multiplier')::int, 2),
    COALESCE(_payload->'auto_subs', '[]'::jsonb),
    NULLIF(_payload->>'chip',''),
    true, now()
  )
  ON CONFLICT (team_id, gameweek_id) DO UPDATE SET
    final_points = EXCLUDED.final_points,
    raw_points = EXCLUDED.raw_points,
    captain_points = EXCLUDED.captain_points,
    bench_points = EXCLUDED.bench_points,
    bench_boost_points = EXCLUDED.bench_boost_points,
    triple_captain_points = EXCLUDED.triple_captain_points,
    transfer_hit = EXCLUDED.transfer_hit,
    effective_captain_id = EXCLUDED.effective_captain_id,
    captain_multiplier = EXCLUDED.captain_multiplier,
    auto_subs = EXCLUDED.auto_subs,
    chip = EXCLUDED.chip,
    is_finalized = true,
    finalized_at = COALESCE(public.fantasy_gameweek_results.finalized_at, now())
  RETURNING id INTO _rid;
  RETURN _rid;
END; $$;
REVOKE ALL ON FUNCTION public.finalize_gameweek_result(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_gameweek_result(uuid,uuid,jsonb) TO authenticated;

-- ---------- Leagues ----------
CREATE TABLE IF NOT EXISTS public.leagues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  invite_code text NOT NULL UNIQUE,
  type text NOT NULL DEFAULT 'private' CHECK (type IN ('public','private')),
  creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description text,
  scoring_mode text NOT NULL DEFAULT 'classic' CHECK (scoring_mode IN ('classic','head_to_head')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leagues TO authenticated;
GRANT ALL ON public.leagues TO service_role;
ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_leagues_updated BEFORE UPDATE ON public.leagues
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.league_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','removed')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_lm_user ON public.league_members(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.league_members TO authenticated;
GRANT ALL ON public.league_members TO service_role;
ALTER TABLE public.league_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_league_member(_league_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.league_members
    WHERE league_id = _league_id AND user_id = _user_id AND status = 'active');
$$;

CREATE OR REPLACE FUNCTION public.is_league_admin(_league_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.league_members
    WHERE league_id = _league_id AND user_id = _user_id AND status = 'active' AND role = 'admin')
  OR EXISTS (SELECT 1 FROM public.leagues WHERE id = _league_id AND creator_id = _user_id);
$$;

CREATE POLICY "Leagues visibility" ON public.leagues FOR SELECT
  USING (
    (type = 'public' AND is_active)
    OR (auth.uid() IS NOT NULL AND (creator_id = auth.uid() OR public.is_league_member(id, auth.uid())))
  );
CREATE POLICY "Users create own leagues" ON public.leagues FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth.uid());
CREATE POLICY "Admins update leagues" ON public.leagues FOR UPDATE TO authenticated
  USING (public.is_league_admin(id, auth.uid())) WITH CHECK (public.is_league_admin(id, auth.uid()));
CREATE POLICY "Creator deletes league" ON public.leagues FOR DELETE TO authenticated
  USING (creator_id = auth.uid());

CREATE POLICY "Members read membership" ON public.league_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_league_member(league_id, auth.uid()) OR public.is_league_admin(league_id, auth.uid()));
CREATE POLICY "Self-join public leagues" ON public.league_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.leagues WHERE id = league_id AND type = 'public' AND is_active)
  );
CREATE POLICY "Users leave / admin remove" ON public.league_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_league_admin(league_id, auth.uid()));
CREATE POLICY "Admins update membership" ON public.league_members FOR UPDATE TO authenticated
  USING (public.is_league_admin(league_id, auth.uid()))
  WITH CHECK (public.is_league_admin(league_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.create_private_league(_name text, _description text, _scoring_mode text DEFAULT 'classic')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _id uuid; _code text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF length(COALESCE(_name,'')) < 3 THEN RAISE EXCEPTION 'Name too short'; END IF;
  LOOP
    _code := upper(substr(encode(gen_random_bytes(6),'hex'),1,8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.leagues WHERE invite_code = _code);
  END LOOP;
  INSERT INTO public.leagues (name, invite_code, type, creator_id, description, scoring_mode)
  VALUES (_name, _code, 'private', _uid, _description, COALESCE(_scoring_mode,'classic'))
  RETURNING id INTO _id;
  INSERT INTO public.league_members (league_id, user_id, role, status) VALUES (_id, _uid, 'admin', 'active');
  RETURN _id;
END; $$;
REVOKE ALL ON FUNCTION public.create_private_league(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_private_league(text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.join_league_by_code(_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _lid uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id INTO _lid FROM public.leagues WHERE invite_code = upper(_code) AND is_active;
  IF _lid IS NULL THEN RAISE EXCEPTION 'Invalid invite code'; END IF;
  INSERT INTO public.league_members (league_id, user_id, role, status)
  VALUES (_lid, _uid, 'member', 'active')
  ON CONFLICT (league_id, user_id) DO UPDATE SET status = 'active';
  RETURN _lid;
END; $$;
REVOKE ALL ON FUNCTION public.join_league_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_league_by_code(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.leave_league(_league_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM public.league_members WHERE league_id = _league_id AND user_id = _uid;
END; $$;
REVOKE ALL ON FUNCTION public.leave_league(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_league(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_league(_league_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.leagues WHERE id = _league_id AND creator_id = _uid) THEN
    RAISE EXCEPTION 'Only the creator may delete this league';
  END IF;
  DELETE FROM public.leagues WHERE id = _league_id;
END; $$;
REVOKE ALL ON FUNCTION public.delete_league(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_league(uuid) TO authenticated;

-- ---------- Saves & Follows ----------
CREATE TABLE IF NOT EXISTS public.saved_articles (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, article_id)
);
GRANT SELECT, INSERT, DELETE ON public.saved_articles TO authenticated;
GRANT ALL ON public.saved_articles TO service_role;
ALTER TABLE public.saved_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage saves" ON public.saved_articles FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.club_follows (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, club_id)
);
GRANT SELECT, INSERT, DELETE ON public.club_follows TO authenticated;
GRANT ALL ON public.club_follows TO service_role;
ALTER TABLE public.club_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage club follows" ON public.club_follows FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.player_follows (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, player_id)
);
GRANT SELECT, INSERT, DELETE ON public.player_follows TO authenticated;
GRANT ALL ON public.player_follows TO service_role;
ALTER TABLE public.player_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage player follows" ON public.player_follows FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------- Storage policies for `avatars` bucket ----------
DROP POLICY IF EXISTS "Avatars read authenticated" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;

CREATE POLICY "Avatars read authenticated" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');
CREATE POLICY "Users upload own avatar" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users update own avatar" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own avatar" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);