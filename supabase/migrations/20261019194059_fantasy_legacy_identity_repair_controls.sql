-- A one-time legacy ID repair must not silently make a stale club/position
-- listing purchasable. Owned selections remain readable through the existing
-- owner exception; locked lineups, price and transfer allowance do not change.
do $$begin
 if md5((select prosrc from pg_proc where oid='app_private.fantasy_native_player_selectable(uuid)'::regprocedure))<>'6f82af5254519bd098126c3f17939d22'then raise exception 'legacy_identity_selectability_baseline_changed';end if;
end $$;
create table app_private.fantasy_legacy_identity_repairs(
 fantasy_player_id uuid primary key references app.fantasy_players(id),
 football_player_id uuid not null unique references app.players(id),
 api_player_id text not null unique check(api_player_id~'^[0-9]{1,12}$'),
 reviewed_at timestamptz not null default statement_timestamp(),
 owner_approval text not null check(char_length(owner_approval)between 20 and 1000),
 identity_evidence jsonb not null check(jsonb_typeof(identity_evidence)='object'and identity_evidence<>'{}'::jsonb),
 catalog_before jsonb not null check(jsonb_typeof(catalog_before)='object'),
 hold_reason text not null check(char_length(hold_reason)between 20 and 1000),
 released_at timestamptz,
 release_reason text,
 check((released_at is null and release_reason is null)or(released_at>=reviewed_at and char_length(release_reason)between 20 and 1000))
);
alter table app_private.fantasy_legacy_identity_repairs enable row level security;
alter table app_private.fantasy_legacy_identity_repairs force row level security;
revoke all on app_private.fantasy_legacy_identity_repairs from public,anon,authenticated,service_role;

create function app_private.fantasy_legacy_identity_evidence_immutable()
returns trigger language plpgsql set search_path=''as $$
begin
 if tg_op='INSERT'then
  if not exists(select 1 from app.fantasy_players fp join app_private.football_provider_mappings m
   on m.internal_entity_id=fp.football_player_id and m.provider_name='sofascore'and m.entity_type='player'and m.active
   where fp.id=new.fantasy_player_id and fp.football_player_id=new.football_player_id and m.external_id=new.api_player_id)
  then raise exception 'legacy_identity_mapping_mismatch';end if;
  return new;
 end if;
 if tg_op='DELETE'then raise exception 'legacy_identity_evidence_immutable';end if;
 if(to_jsonb(new)-'released_at'-'release_reason')is distinct from(to_jsonb(old)-'released_at'-'release_reason')
 or old.released_at is not null or new.released_at is null then raise exception 'legacy_identity_evidence_immutable';end if;
 return new;
end $$;
revoke all on function app_private.fantasy_legacy_identity_evidence_immutable()from public,anon,authenticated,service_role;
create trigger fantasy_legacy_identity_evidence_immutable before insert or update or delete on app_private.fantasy_legacy_identity_repairs
for each row execute function app_private.fantasy_legacy_identity_evidence_immutable();

create or replace function app_private.fantasy_native_player_selectable(p_player_id uuid)
returns boolean language sql stable security definer set search_path=''as $$
 select not exists(select 1 from app_private.fantasy_legacy_identity_repairs repair
 where repair.fantasy_player_id=p_player_id and repair.released_at is null)
 and(not exists(select 1 from app.fantasy_players fp join app_private.fantasy_api_rating_seasons s on s.season_id=fp.fantasy_season_id where fp.id=p_player_id)
 or exists(select 1 from app.fantasy_players fp join app_private.football_provider_mappings m on m.internal_entity_id=fp.football_player_id
 and m.provider_name='sofascore'and m.entity_type='player'and m.active and m.external_id~'^[0-9]{1,12}$'where fp.id=p_player_id));
$$;
revoke all on function app_private.fantasy_native_player_selectable(uuid)from public,anon,authenticated,service_role;

-- No production identity, registration, selection, price or hold is inserted
-- by this migration. A separately guarded evidence manifest performs repairs.
