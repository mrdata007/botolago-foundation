-- Pépites admin: the two lists the staff screens need that the earlier
-- migrations did not give them (docs/engineering/PEPITES_ARCHITECTURE.md
-- §3.3, §3.7).
--
--   api.admin_player_photo_releases(p_status)  the photo releases, pending
--     first, with the rights problems the approval would find today, so staff
--     see why an approval would be refused before trying it.
--   api.admin_pepites_player_search(p_query)   players by name, with the
--     attributes the data desk corrects, to start a correction or a photo
--     from a player the desk has no issue for.
--
-- Both are staff reads: the step-up first, then the permission. Nothing here
-- is readable by a fan, and nothing writes.

create function api.admin_player_photo_releases(p_status text default 'pending')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
begin
  perform app_private.assert_mfa_step_up();
  v_actor := app_private.admin_assert_permission('football.correct', false);
  if p_status is null or p_status not in (
    'pending', 'approved', 'published', 'rejected', 'revoked', 'expired', 'replaced', 'all'
  ) then
    raise exception using errcode = '22023', message = 'PHOTO_RELEASE_FILTER_INVALID';
  end if;
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', release.id,
        'playerId', release.player_id,
        'playerName', player.display_name,
        'status', release.status,
        'scope', release.scope,
        'signerRole', release.signer_role,
        'licenceCode', release.licence_code,
        'credit', release.credit,
        'copyrightOwner', release.copyright_owner,
        'capturedOn', release.captured_on,
        'signedOn', release.signed_on,
        'expiresOn', release.expires_on,
        'submittedAt', release.submitted_at,
        'submittedByMe', release.submitted_by = v_actor,
        'approvedAt', release.approved_at,
        'publishedAt', release.published_at,
        'endedAt', release.ended_at,
        'endReason', release.end_reason,
        'problems', to_jsonb(app_private.player_photo_release_problems(release, current_date)))
      order by release.status <> 'pending', release.submitted_at desc)
    from (
      select * from app_private.player_photo_releases candidate
      where p_status = 'all' or candidate.status = p_status
      order by candidate.submitted_at desc
      limit 100
    ) release
    join app.players player on player.id = release.player_id
  ), '[]'::jsonb);
end;
$$;

comment on function api.admin_player_photo_releases(text) is
  'Staff (football.correct, after the step-up): player photo releases by status, with the rights problems an approval would find today.';

create function api.admin_pepites_player_search(p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_pattern text;
begin
  perform app_private.assert_mfa_step_up();
  perform app_private.admin_assert_permission('football.read_operations', false);
  if char_length(v_query) not between 2 and 60 then
    raise exception using errcode = '22023', message = 'PLAYER_SEARCH_QUERY_INVALID';
  end if;
  -- A literal match: the reader's % and _ are text, not wildcards.
  v_pattern := '%' || replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', found.id,
        'name', found.display_name,
        'fullName', found.full_name,
        'dateOfBirth', found.date_of_birth,
        'nationality', (select country.iso_alpha2 from app.countries country
          where country.id = found.nationality_country_id),
        'preferredFoot', nullif(found.preferred_foot::text, 'unknown'),
        'heightCm', found.height_cm,
        'detailedPosition', found.detailed_position,
        'hasPhoto', found.photo_asset_id is not null,
        'team', (select team.short_name from app.team_memberships member
            join app.teams team on team.id = member.team_id
          where member.player_id = found.id and member.active
          order by member.valid_from desc, member.id limit 1))
      order by found.display_name, found.id)
    from (
      select * from app.players player
      where player.display_name ilike v_pattern or player.full_name ilike v_pattern
      order by player.display_name, player.id
      limit 20
    ) found
  ), '[]'::jsonb);
end;
$$;

comment on function api.admin_pepites_player_search(text) is
  'Staff (football.read_operations, after the step-up): up to 20 players whose name contains the query, with the attributes the data desk corrects.';

-- Grants (the review list for this migration): staff screens only, the
-- permission checked inside.
revoke all on function api.admin_player_photo_releases(text) from public, anon, authenticated, service_role;
revoke all on function api.admin_pepites_player_search(text) from public, anon, authenticated, service_role;
grant execute on function api.admin_player_photo_releases(text) to authenticated;
grant execute on function api.admin_pepites_player_search(text) to authenticated;
