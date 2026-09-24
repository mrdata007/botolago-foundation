-- A private league's invite code could be seen exactly once.
--
-- api.create_fantasy_league (20260720141854_fantasy_api_security.sql) mints a
-- random 32-character code, stores only its SHA-256 digest plus the last four
-- characters as a hint, and returns the plaintext once in its response. That is
-- the right storage: a leaked table row cannot be replayed as an invite. But it
-- left an owner who navigated away from the create form with no way to invite
-- anyone ever again -- nothing in `api` can return the code a second time, and
-- nothing could replace it.
--
-- This adds the replacement, not a way to read the old code back. The owner
-- asks for a new code; the league's digest and hint are overwritten, so the old
-- code stops working at once and the new plaintext is returned once, under
-- exactly the rules create uses. Storing the code reversibly instead would have
-- undone the reason it is hashed.
--
-- WHO MAY DO IT
--
-- The same test api.archive_fantasy_league applies: the caller owns p_team_id,
-- owns the league, and that team holds the league's active `owner` membership.
-- On top of that the league must be active and private -- a public league has
-- no code, and an archived one takes no new members. Every refusal is the one
-- PT403 league_access_denied, as for archive, so the answer does not reveal
-- whether a league id exists.
--
-- WHAT THIS DOES NOT DO
--
-- It does not touch create, join, leave, archive or the league reader. Members
-- who already joined stay members; only the code that lets new people in
-- changes. The audit row records the league id and never the code, because
-- app_private.fantasy_mutation_audit excludes secrets by contract.
--
-- The signature is uuid/uuid, both pg_catalog types, so no caller needs USAGE
-- on schema `app` (the BG-0063 trap). It is not callable by anon at all.

create function api.reset_fantasy_league_invite_code(
  p_league_id uuid,
  p_team_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_code text;
  new_digest text;
begin
  perform app_private.fantasy_assert_owner(p_team_id);

  -- Minted and hashed exactly as api.create_fantasy_league does, so
  -- api.join_fantasy_league accepts the new code with no change of its own.
  new_code := upper(encode(extensions.gen_random_bytes(16), 'hex'));
  new_digest := encode(extensions.digest(convert_to(new_code, 'UTF8'), 'sha256'), 'hex');

  update app.fantasy_leagues league
  set invite_code_digest = new_digest,
    invite_code_hint = right(new_code, 4)
  where league.id = p_league_id
    and league.owner_user_id = current_user_id
    and league.visibility = 'private'
    and league.active
    and exists (
      select 1 from app.fantasy_league_memberships membership
      where membership.league_id = league.id
        and membership.fantasy_team_id = p_team_id
        and membership.user_id = current_user_id
        and membership.role = 'owner' and membership.status = 'active'
    );
  if not found then
    raise exception using errcode = 'PT403', message = 'league_access_denied';
  end if;

  insert into app_private.fantasy_mutation_audit (
    user_id, fantasy_team_id, operation, accepted, safe_metadata
  ) values (current_user_id, p_team_id, 'reset_league_invite_code', true,
    jsonb_build_object('leagueId', p_league_id));

  return jsonb_build_object('leagueId', p_league_id, 'inviteCode', new_code);
end;
$$;

revoke all on function api.reset_fantasy_league_invite_code(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function api.reset_fantasy_league_invite_code(uuid, uuid)
  to authenticated, service_role;
