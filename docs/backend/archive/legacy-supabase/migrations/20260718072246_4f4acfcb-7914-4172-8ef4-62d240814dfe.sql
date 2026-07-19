
-- 1. Additive column for chip/lifecycle/Free-Hit snapshot JSON
ALTER TABLE public.fantasy_teams
  ADD COLUMN IF NOT EXISTS lifecycle_state jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Version-safe lifecycle upsert. Uses row-level RLS via auth.uid() check.
CREATE OR REPLACE FUNCTION public.save_fantasy_lifecycle(
  _team_id uuid,
  _expected_version integer,
  _lifecycle jsonb,
  _current_gameweek_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, version integer, lifecycle_state jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _cur_version integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;

  SELECT ft.version INTO _cur_version
    FROM public.fantasy_teams ft
   WHERE ft.id = _team_id AND ft.user_id = _uid
   FOR UPDATE;

  IF _cur_version IS NULL THEN
    RAISE EXCEPTION 'Fantasy team not found for current user' USING ERRCODE = 'P0002';
  END IF;

  IF _cur_version <> _expected_version THEN
    RAISE EXCEPTION 'Version conflict: expected %, got %', _expected_version, _cur_version
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.fantasy_teams ft
     SET lifecycle_state = COALESCE(_lifecycle, '{}'::jsonb),
         current_gameweek_id = COALESCE(_current_gameweek_id, ft.current_gameweek_id),
         version = ft.version + 1,
         updated_at = now()
   WHERE ft.id = _team_id AND ft.user_id = _uid
   RETURNING ft.id, ft.version, ft.lifecycle_state
     INTO id, version, lifecycle_state;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.save_fantasy_lifecycle(uuid, integer, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_fantasy_lifecycle(uuid, integer, jsonb, uuid) TO authenticated;

-- 3. Ensures we can list transfers per team/gameweek quickly
CREATE INDEX IF NOT EXISTS idx_fantasy_transfers_team_gw
  ON public.fantasy_transfers (team_id, gameweek_id);
