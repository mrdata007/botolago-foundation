-- BotolaGO Production V2
-- BG-0012: close an MFA/AAL2 bypass in the editorial Admin-role bridge.
--
-- Found by the independent security verifier reviewing the BG-0012
-- News/CMS checkpoint: has_editorial_role() (20260919130000) resolves
-- editorial authority via a bare app_private.admin_has_permission() lookup,
-- which checks only role/permission assignment rows. It never routes
-- through app_private.admin_assert_principal()/admin_assert_permission()
-- the way every other Admin-permission-gated RPC in this codebase does, so
-- it silently skips the MFA-factor and AAL2-assurance checks those
-- functions enforce -- even though every editorial.* row in
-- app_private.admin_permissions is seeded requires_mfa = true (the column's
-- own not-null default). A staff principal with a normal aal1 session and
-- no verified MFA factor could still draft/publish/delete News content.
--
-- This bridges has_editorial_role onto the same MFA/AAL2 check
-- admin_assert_principal performs, without changing its signature or its
-- boolean return contract (existing callers all do
-- `if not has_editorial_role(...) then raise 'news_editorial_forbidden' end if`
-- and must keep working, and keep surfacing that same generic error code,
-- unmodified).

create or replace function app_private.has_editorial_role(required_role app_private.editorial_role)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  principal app_private.staff_principals%rowtype;
  has_verified_factor boolean;
begin
  select *
  into principal
  from app_private.staff_principals
  where auth_user_id = auth.uid() and status = 'active';

  if not found then
    return false;
  end if;

  -- Mirror admin_assert_principal's MFA/AAL2 assurance check. Every
  -- editorial.* permission is seeded requires_mfa = true, so this is
  -- unconditional here (admin_assert_principal itself would also enforce
  -- it unconditionally per-principal via principal.mfa_required, which
  -- defaults true).
  select exists (
    select 1
    from auth.mfa_factors factor
    where factor.user_id = auth.uid() and factor.status::text = 'verified'
  )
  into has_verified_factor;

  if not has_verified_factor or coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    return false;
  end if;

  return coalesce(
    case required_role
      when 'editor' then
        app_private.admin_has_permission(principal.id, 'editorial.write')
        or app_private.admin_has_permission(principal.id, 'editorial.publish')
      when 'publisher' then
        app_private.admin_has_permission(principal.id, 'editorial.publish')
      when 'admin' then
        app_private.admin_has_permission(principal.id, 'editorial.manage_placements')
    end,
    false
  );
end;
$$;

comment on function app_private.has_editorial_role(app_private.editorial_role) is
  'Resolves editorial authority from the Admin staff role/permission model, '
  'requiring a verified MFA factor and an aal2 session assertion -- mirroring '
  'admin_assert_principal''s MFA/AAL2 check -- since every editorial.* '
  'permission is seeded requires_mfa = true.';
