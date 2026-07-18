-- Tighten helper function grants
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_admin_or_moderator(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_or_moderator(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_league_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_league_member(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_league_admin(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_league_admin(uuid, uuid) TO authenticated;