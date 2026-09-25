-- BotolaGO Production V2
-- The direct-table policy for private Fantasy leagues tests the league it is
-- looking at, and no longer recurses (audit 2026-09-25 A14 / DB-06, P3).
--
-- Background. 20260720141854_fantasy_api_security created
--
--   create policy fantasy_leagues_visible_select on app.fantasy_leagues
--   for select to authenticated
--   using (visibility = 'public' or exists (select 1
--     from app.fantasy_league_memberships membership
--     where membership.league_id = id and membership.user_id = (select auth.uid())
--       and membership.status = 'active'));
--
-- The bare `id` was meant as the league's. Inside the subquery the nearest
-- table with an `id` column is the membership, so PostgreSQL stored
-- membership.league_id = membership.id (pg_policies shows it that way, locally
-- and on production). That is never true, so the private-league branch could
-- never admit anyone: it failed closed, and no row leaked.
--
-- There is a second fault under it. This policy reads
-- app.fantasy_league_memberships, and that table's policy
-- (fantasy_league_memberships_member_select, same migration) reads
-- app.fantasy_leagues back. PostgreSQL expands the policies of every table a
-- policy reads, so a direct read of either table by the authenticated role
-- stops with 42P17 "infinite recursion detected in policy". The rewriter does
-- this before the privilege check, so today it is the error even without a
-- SELECT grant. Qualifying the column alone would leave the policy unusable.
--
-- Nothing reaches these policies in production today. No browser role has
-- SELECT on either table; every league read goes through api.* functions that
-- are SECURITY DEFINER, owned by postgres (BYPASSRLS) and check membership
-- themselves; and none of the four security_invoker api views reads leagues.
-- This is defence in depth. The policies must say what they mean in case a
-- grant is ever added.
--
-- The fix:
--   1. app_private.fantasy_is_active_league_member(league_id) answers one
--      question: is the caller an active member of that league? It is
--      SECURITY DEFINER, so its read of the memberships table does not expand
--      that table's policy. That breaks the cycle. It reveals only the
--      caller's own membership.
--   2. The policy is recreated with the outer table named:
--        visibility = 'public'
--        or app_private.fantasy_is_active_league_member(fantasy_leagues.id)
--      Same name, same command, same role, same meaning as intended in
--      20260720141854.
--   3. PostgreSQL checks EXECUTE on a function in a policy as the querying
--      role, so authenticated gets EXECUTE on the helper. It still has no
--      USAGE on app_private, so it cannot call the helper by name, neither
--      from SQL nor through PostgREST (measured: "permission denied for schema
--      app_private"). Only the stored policy can call it. anon has no policy
--      on this table and gets nothing.
--
-- fantasy_league_memberships_member_select is correct as written
-- (league.id = fantasy_league_memberships.league_id) and is left as it is.
-- With this change it now evaluates without recursing.
--
-- No api.* function, grant or JSON shape changes.

create function app_private.fantasy_is_active_league_member(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.fantasy_league_memberships membership
    where membership.league_id = p_league_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  );
$$;

comment on function app_private.fantasy_is_active_league_member(uuid) is
  'True when the calling account (auth.uid()) holds an active membership of the league. '
  'Used by the policy fantasy_leagues_visible_select. It is SECURITY DEFINER so that its read '
  'of app.fantasy_league_memberships does not expand that table''s policy, which reads '
  'app.fantasy_leagues back (42P17 otherwise). It reveals only the caller''s own membership.';

revoke all on function app_private.fantasy_is_active_league_member(uuid)
  from public, anon, authenticated, service_role;
-- PostgreSQL checks EXECUTE on a policy's functions as the querying role. The
-- policy is for authenticated only. Without USAGE on app_private,
-- authenticated cannot call the helper by name.
grant execute on function app_private.fantasy_is_active_league_member(uuid) to authenticated;

drop policy fantasy_leagues_visible_select on app.fantasy_leagues;
create policy fantasy_leagues_visible_select on app.fantasy_leagues
for select to authenticated
using (
  visibility = 'public'
  or app_private.fantasy_is_active_league_member(fantasy_leagues.id)
);

comment on policy fantasy_leagues_visible_select on app.fantasy_leagues is
  'A signed-in account sees public leagues and the private leagues it is an active member of. '
  'Defence in depth only: browser roles have no SELECT on this table, and league reads go through '
  'api.* SECURITY DEFINER functions (20260925210200, audit A14 / DB-06).';
