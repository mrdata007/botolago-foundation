
-- ============================================================================
-- Pass 1: Fantasy cloud cutover — additive RPCs + access grants
-- ============================================================================

-- 1. Grant table access to authenticated / service_role. RLS still applies.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fantasy_teams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fantasy_squad_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fantasy_transfers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fantasy_chip_uses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fantasy_gameweek_results TO authenticated;
GRANT ALL ON public.fantasy_teams TO service_role;
GRANT ALL ON public.fantasy_squad_members TO service_role;
GRANT ALL ON public.fantasy_transfers TO service_role;
GRANT ALL ON public.fantasy_chip_uses TO service_role;
GRANT ALL ON public.fantasy_gameweek_results TO service_role;

-- ============================================================================
-- Shared internal helper: validate & replace the 15-row squad for a team.
-- Assumes the caller already locked and authorized public.fantasy_teams row.
-- ============================================================================
CREATE OR REPLACE FUNCTION public._replace_fantasy_squad(_team_id uuid, _squad jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _n int;
  _captains int;
  _vices int;
  _both int;
  _distinct_players int;
  _distinct_slots int;
BEGIN
  IF _squad IS NULL OR jsonb_typeof(_squad) <> 'array' THEN
    RAISE EXCEPTION 'Squad payload must be a JSON array' USING ERRCODE = '22023';
  END IF;
  SELECT jsonb_array_length(_squad) INTO _n;
  IF _n <> 15 THEN
    RAISE EXCEPTION 'Squad must have exactly 15 players (got %)', _n USING ERRCODE = '22023';
  END IF;

  SELECT
    count(*) FILTER (WHERE (x->>'is_captain')::boolean),
    count(*) FILTER (WHERE (x->>'is_vice')::boolean),
    count(*) FILTER (WHERE (x->>'is_captain')::boolean AND (x->>'is_vice')::boolean),
    count(DISTINCT (x->>'player_id')::uuid),
    count(DISTINCT (x->>'slot')::int)
  INTO _captains, _vices, _both, _distinct_players, _distinct_slots
  FROM jsonb_array_elements(_squad) x;

  IF _captains <> 1 THEN RAISE EXCEPTION 'Exactly one captain required (got %)', _captains USING ERRCODE = '22023'; END IF;
  IF _vices <> 1 THEN RAISE EXCEPTION 'Exactly one vice-captain required (got %)', _vices USING ERRCODE = '22023'; END IF;
  IF _both <> 0 THEN RAISE EXCEPTION 'Captain and vice must differ' USING ERRCODE = '22023'; END IF;
  IF _distinct_players <> 15 THEN RAISE EXCEPTION 'Duplicate player in squad' USING ERRCODE = '22023'; END IF;
  IF _distinct_slots <> 15 THEN RAISE EXCEPTION 'Duplicate slot in squad' USING ERRCODE = '22023'; END IF;

  DELETE FROM public.fantasy_squad_members WHERE team_id = _team_id;
  INSERT INTO public.fantasy_squad_members (team_id, player_id, slot, is_captain, is_vice, purchase_price)
  SELECT
    _team_id,
    (x->>'player_id')::uuid,
    (x->>'slot')::int,
    COALESCE((x->>'is_captain')::boolean, false),
    COALESCE((x->>'is_vice')::boolean, false),
    (x->>'purchase_price')::numeric
  FROM jsonb_array_elements(_squad) x;
END;
$fn$;

REVOKE ALL ON FUNCTION public._replace_fantasy_squad(uuid, jsonb) FROM PUBLIC;

-- ============================================================================
-- save_fantasy_team_v2 : version-safe atomic team save
-- ============================================================================
CREATE OR REPLACE FUNCTION public.save_fantasy_team_v2(
  _team_id uuid,
  _expected_version integer,
  _team_name text,
  _manager_name text,
  _formation text,
  _bank numeric,
  _free_transfers integer,
  _pending_transfers integer,
  _current_gameweek_id uuid,
  _lifecycle jsonb,
  _squad jsonb
)
RETURNS TABLE (id uuid, version integer, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _cur_version integer;
  _cur_user uuid;
  _team_uuid uuid := _team_id;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;

  IF _team_uuid IS NULL THEN
    -- First save for this user: create the row (idempotent on user_id unique).
    INSERT INTO public.fantasy_teams (
      user_id, team_name, manager_name, formation, bank,
      free_transfers, pending_transfers, current_gameweek_id, lifecycle_state
    ) VALUES (
      _uid, _team_name, _manager_name, COALESCE(_formation, '4-4-2'), COALESCE(_bank, 0),
      COALESCE(_free_transfers, 1), COALESCE(_pending_transfers, 0),
      _current_gameweek_id, COALESCE(_lifecycle, '{}'::jsonb)
    )
    ON CONFLICT (user_id) DO NOTHING
    RETURNING fantasy_teams.id INTO _team_uuid;

    IF _team_uuid IS NULL THEN
      SELECT t.id INTO _team_uuid FROM public.fantasy_teams t WHERE t.user_id = _uid;
    END IF;
  END IF;

  SELECT t.version, t.user_id INTO _cur_version, _cur_user
    FROM public.fantasy_teams t
   WHERE t.id = _team_uuid
   FOR UPDATE;

  IF _cur_version IS NULL THEN
    RAISE EXCEPTION 'Fantasy team not found' USING ERRCODE = 'P0002';
  END IF;
  IF _cur_user <> _uid THEN
    RAISE EXCEPTION 'Not authorized for this team' USING ERRCODE = '42501';
  END IF;
  IF _expected_version IS NOT NULL AND _cur_version <> _expected_version THEN
    RAISE EXCEPTION 'Version conflict: expected %, got %', _expected_version, _cur_version
      USING ERRCODE = '40001';
  END IF;

  PERFORM public._replace_fantasy_squad(_team_uuid, _squad);

  UPDATE public.fantasy_teams t
     SET team_name = COALESCE(_team_name, t.team_name),
         manager_name = COALESCE(_manager_name, t.manager_name),
         formation = COALESCE(_formation, t.formation),
         bank = COALESCE(_bank, t.bank),
         free_transfers = COALESCE(_free_transfers, t.free_transfers),
         pending_transfers = COALESCE(_pending_transfers, t.pending_transfers),
         current_gameweek_id = COALESCE(_current_gameweek_id, t.current_gameweek_id),
         lifecycle_state = COALESCE(_lifecycle, t.lifecycle_state),
         version = t.version + 1,
         updated_at = now()
   WHERE t.id = _team_uuid
   RETURNING t.id, t.version, t.updated_at
     INTO id, version, updated_at;

  RETURN NEXT;
END;
$fn$;

REVOKE ALL ON FUNCTION public.save_fantasy_team_v2(uuid, integer, text, text, text, numeric, integer, integer, uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_fantasy_team_v2(uuid, integer, text, text, text, numeric, integer, integer, uuid, jsonb, jsonb) TO authenticated;

-- ============================================================================
-- confirm_fantasy_transfers : atomic transfer commit
-- _transfers: JSON array of { player_out_id, player_in_id, price_out, price_in, cost, hit, chip }
-- ============================================================================
CREATE OR REPLACE FUNCTION public.confirm_fantasy_transfers(
  _team_id uuid,
  _expected_version integer,
  _formation text,
  _bank numeric,
  _free_transfers integer,
  _pending_transfers integer,
  _current_gameweek_id uuid,
  _lifecycle jsonb,
  _squad jsonb,
  _transfers jsonb
)
RETURNS TABLE (id uuid, version integer, updated_at timestamptz, transfer_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _cur_version integer;
  _cur_user uuid;
  _tx_ids uuid[] := ARRAY[]::uuid[];
  _new_id uuid;
  _r jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF _team_id IS NULL THEN RAISE EXCEPTION 'Team id required' USING ERRCODE = '22023'; END IF;
  IF _current_gameweek_id IS NULL THEN RAISE EXCEPTION 'Current gameweek required' USING ERRCODE = '22023'; END IF;
  IF _transfers IS NULL OR jsonb_typeof(_transfers) <> 'array' OR jsonb_array_length(_transfers) = 0 THEN
    RAISE EXCEPTION 'At least one transfer required' USING ERRCODE = '22023';
  END IF;

  SELECT t.version, t.user_id INTO _cur_version, _cur_user
    FROM public.fantasy_teams t
   WHERE t.id = _team_id
   FOR UPDATE;

  IF _cur_version IS NULL THEN RAISE EXCEPTION 'Fantasy team not found' USING ERRCODE = 'P0002'; END IF;
  IF _cur_user <> _uid THEN RAISE EXCEPTION 'Not authorized for this team' USING ERRCODE = '42501'; END IF;
  IF _expected_version IS NOT NULL AND _cur_version <> _expected_version THEN
    RAISE EXCEPTION 'Version conflict: expected %, got %', _expected_version, _cur_version
      USING ERRCODE = '40001';
  END IF;

  PERFORM public._replace_fantasy_squad(_team_id, _squad);

  FOR _r IN SELECT * FROM jsonb_array_elements(_transfers) LOOP
    INSERT INTO public.fantasy_transfers (
      team_id, user_id, gameweek_id, player_out_id, player_in_id,
      price_out, price_in, cost, hit, chip, status, confirmed_at
    ) VALUES (
      _team_id, _uid, _current_gameweek_id,
      (_r->>'player_out_id')::uuid,
      (_r->>'player_in_id')::uuid,
      (_r->>'price_out')::numeric,
      (_r->>'price_in')::numeric,
      COALESCE((_r->>'cost')::int, 0),
      COALESCE((_r->>'hit')::int, 0),
      NULLIF(_r->>'chip', ''),
      'confirmed',
      now()
    )
    RETURNING fantasy_transfers.id INTO _new_id;
    _tx_ids := _tx_ids || _new_id;
  END LOOP;

  UPDATE public.fantasy_teams t
     SET formation = COALESCE(_formation, t.formation),
         bank = COALESCE(_bank, t.bank),
         free_transfers = COALESCE(_free_transfers, t.free_transfers),
         pending_transfers = COALESCE(_pending_transfers, t.pending_transfers),
         current_gameweek_id = COALESCE(_current_gameweek_id, t.current_gameweek_id),
         lifecycle_state = COALESCE(_lifecycle, t.lifecycle_state),
         version = t.version + 1,
         updated_at = now()
   WHERE t.id = _team_id
   RETURNING t.id, t.version, t.updated_at
     INTO id, version, updated_at;

  transfer_ids := _tx_ids;
  RETURN NEXT;
END;
$fn$;

REVOKE ALL ON FUNCTION public.confirm_fantasy_transfers(uuid, integer, text, numeric, integer, integer, uuid, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_fantasy_transfers(uuid, integer, text, numeric, integer, integer, uuid, jsonb, jsonb, jsonb) TO authenticated;

-- ============================================================================
-- finalize_fantasy_gameweek_v2 : idempotent gameweek finalization
-- _result: jsonb per fantasy_gameweek_results columns
-- _post_team: { formation, bank, free_transfers, pending_transfers,
--              current_gameweek_id, lifecycle_state, squad?: [...] }
-- _chip_finalize: text|null — which chip to mark 'used' for this gameweek
-- _season: text
-- ============================================================================
CREATE OR REPLACE FUNCTION public.finalize_fantasy_gameweek_v2(
  _team_id uuid,
  _gameweek_id uuid,
  _expected_version integer,
  _result jsonb,
  _post_team jsonb,
  _chip_finalize text,
  _season text
)
RETURNS TABLE (
  team_id uuid,
  gameweek_id uuid,
  result_id uuid,
  version integer,
  already_finalized boolean,
  final_points integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _cur_version integer;
  _cur_user uuid;
  _existing_id uuid;
  _existing_points integer;
  _existing_finalized boolean;
  _new_result_id uuid;
  _post_squad jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF _team_id IS NULL OR _gameweek_id IS NULL THEN
    RAISE EXCEPTION 'Team and gameweek required' USING ERRCODE = '22023';
  END IF;

  SELECT t.version, t.user_id INTO _cur_version, _cur_user
    FROM public.fantasy_teams t
   WHERE t.id = _team_id
   FOR UPDATE;

  IF _cur_version IS NULL THEN RAISE EXCEPTION 'Fantasy team not found' USING ERRCODE = 'P0002'; END IF;
  IF _cur_user <> _uid THEN RAISE EXCEPTION 'Not authorized for this team' USING ERRCODE = '42501'; END IF;

  -- Idempotency: if a finalized row already exists, return it as-is.
  SELECT r.id, r.final_points, r.is_finalized
    INTO _existing_id, _existing_points, _existing_finalized
    FROM public.fantasy_gameweek_results r
   WHERE r.team_id = _team_id AND r.gameweek_id = _gameweek_id
   FOR UPDATE;

  IF _existing_finalized THEN
    team_id := _team_id; gameweek_id := _gameweek_id;
    result_id := _existing_id; version := _cur_version;
    already_finalized := true; final_points := _existing_points;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Enforce expected version only for the first finalization.
  IF _expected_version IS NOT NULL AND _cur_version <> _expected_version THEN
    RAISE EXCEPTION 'Version conflict: expected %, got %', _expected_version, _cur_version
      USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.fantasy_gameweek_results (
    team_id, gameweek_id, final_points, raw_points, captain_points, bench_points,
    bench_boost_points, triple_captain_points, transfer_hit, effective_captain_id,
    captain_multiplier, auto_subs, chip, is_finalized, finalized_at
  ) VALUES (
    _team_id, _gameweek_id,
    COALESCE((_result->>'final_points')::int, 0),
    COALESCE((_result->>'raw_points')::int, 0),
    COALESCE((_result->>'captain_points')::int, 0),
    COALESCE((_result->>'bench_points')::int, 0),
    COALESCE((_result->>'bench_boost_points')::int, 0),
    COALESCE((_result->>'triple_captain_points')::int, 0),
    COALESCE((_result->>'transfer_hit')::int, 0),
    NULLIF(_result->>'effective_captain_id','')::uuid,
    COALESCE((_result->>'captain_multiplier')::int, 2),
    COALESCE(_result->'auto_subs', '[]'::jsonb),
    NULLIF(_result->>'chip',''),
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
  RETURNING id, final_points INTO _new_result_id, _existing_points;

  -- Optional post-finalization squad rewrite (Free Hit restore / Wildcard retain).
  IF _post_team IS NOT NULL AND _post_team ? 'squad'
     AND jsonb_typeof(_post_team->'squad') = 'array' THEN
    _post_squad := _post_team->'squad';
    PERFORM public._replace_fantasy_squad(_team_id, _post_squad);
  END IF;

  -- Persist chip 'used' state idempotently (per-season unique index).
  IF _chip_finalize IS NOT NULL AND _chip_finalize <> '' THEN
    INSERT INTO public.fantasy_chip_uses (team_id, gameweek_id, chip, state, season, finalized_at)
    VALUES (_team_id, _gameweek_id, _chip_finalize, 'used', COALESCE(_season, ''), now())
    ON CONFLICT (team_id, chip, season) WHERE state = 'used' DO NOTHING;
  END IF;

  -- Team lifecycle / advancement / free-transfer rollover — all supplied by engine.
  UPDATE public.fantasy_teams t
     SET formation = COALESCE(_post_team->>'formation', t.formation),
         bank = COALESCE((_post_team->>'bank')::numeric, t.bank),
         free_transfers = COALESCE((_post_team->>'free_transfers')::int, t.free_transfers),
         pending_transfers = COALESCE((_post_team->>'pending_transfers')::int, t.pending_transfers),
         current_gameweek_id = COALESCE(NULLIF(_post_team->>'current_gameweek_id','')::uuid, t.current_gameweek_id),
         lifecycle_state = COALESCE(_post_team->'lifecycle_state', t.lifecycle_state),
         version = t.version + 1,
         updated_at = now()
   WHERE t.id = _team_id
   RETURNING t.version INTO _cur_version;

  team_id := _team_id;
  gameweek_id := _gameweek_id;
  result_id := _new_result_id;
  version := _cur_version;
  already_finalized := false;
  final_points := _existing_points;
  RETURN NEXT;
END;
$fn$;

REVOKE ALL ON FUNCTION public.finalize_fantasy_gameweek_v2(uuid, uuid, integer, jsonb, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_fantasy_gameweek_v2(uuid, uuid, integer, jsonb, jsonb, text, text) TO authenticated;
