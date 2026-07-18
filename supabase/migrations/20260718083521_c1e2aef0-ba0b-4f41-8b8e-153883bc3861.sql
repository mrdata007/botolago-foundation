
REVOKE EXECUTE ON FUNCTION public.save_fantasy_team_v2(uuid, integer, text, text, text, numeric, integer, integer, uuid, jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.confirm_fantasy_transfers(uuid, integer, text, numeric, integer, integer, uuid, jsonb, jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finalize_fantasy_gameweek_v2(uuid, uuid, integer, jsonb, jsonb, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public._replace_fantasy_squad(uuid, jsonb) FROM anon, authenticated;
