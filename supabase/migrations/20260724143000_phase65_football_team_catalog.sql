-- BotolaGO Production V2
-- Phase 6.5: bounded public Football team catalog for onboarding and filters.

create or replace function api.football_team_catalog(
  p_language text default 'fr',
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform app_private.football_language(p_language);
  if p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'INVALID_LIMIT';
  end if;

  select coalesce(
    jsonb_agg(app_private.football_team_json(team.id, p_language)
      order by team.name, team.id),
    '[]'::jsonb
  )
  into result
  from (
    select candidate.id, candidate.name
    from app.teams candidate
    where candidate.active
    order by candidate.name, candidate.id
    limit p_limit
  ) team;

  return result;
end;
$$;

revoke all on function api.football_team_catalog(text, integer)
  from public, anon, authenticated, service_role;
grant execute on function api.football_team_catalog(text, integer)
  to anon, authenticated, service_role;

comment on function api.football_team_catalog(text, integer) is
  'Bounded provider-independent active-team catalog for public UI filters and identity onboarding.';
