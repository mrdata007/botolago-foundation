-- Fantasy pending scoring items (docs/backend/FANTASY_PENDING_ITEMS.md, C2, C3, C4).
--
-- WHY. One local doubt (a goal and a substitution in the same minute, a minutes
-- disagreement, a card contradiction) held a whole match's points back. The
-- SofaScore builder now sends such a fact as UNKNOWN on the affected player's
-- row and everything else as fact. This migration lets the database take it:
--
--   1. the SofaScore wrapper accepts the new shapes (and nothing looser);
--   2. the recorder's simple_ready means the FIXTURE-level facts are established
--      (score, starters, memberships, goals add up, completeness flags, lineup
--      players resolved); unknown core fields no longer hold the fixture. A new
--      pending_items count is stored. full_ready is unchanged;
--   3. a gave_up SofaScore attempt keeps its stored replies;
--   4. the scoring snapshot lists, per player and fixture, the categories that
--      are PENDING (in the locked mode's scope, but not scorable) and the
--      row's pendingItems; a pending category emits no event;
--   5. the points save expects exactly the scorable categories;
--   6. finalization refuses while anything is pending;
--   7. the read RPCs show pending items and a points status.
--
-- CATEGORY RULE (identical in src/backend/fantasy/adaptive-scoring.ts, and kept
-- in step by the runner, which refuses a snapshot whose pendingCategories differ
-- from its own computation). "Scorable" is fantasy_field_scorable in simple mode
-- and fantasy_field_certified otherwise.
--   appearance      minutes scorable
--   clean_sheet     minutes scorable AND (cleanSheet scorable OR (minutes <
--                   ruleset full_appearance_minutes AND no appearance pendingItem))
--   goals_conceded  minutes scorable AND (goalsConceded scorable OR (same))
--   the others      their own field (goal: goals, assist: assists, saves, penalty_save:
--                   penaltiesSaved, penalty_miss: penaltiesMissed, yellow_card,
--                   red_card, second_yellow_dismissal, own_goal)
-- Under the full-appearance minutes neither a clean sheet nor goals conceded can
-- score, so their unknown facts cannot matter, unless the minutes themselves are
-- in doubt (the row carries an appearance pendingItem).
-- Simple mode does not count assist, saves, penalty_save and penalty_miss: they are
-- out of scope, not pending.
--
-- ALSO IN THIS MIGRATION (coordinator addition). The snapshot document marked a
-- player's participation pending for a fixture with legacy anonymous starter rows
-- and no app.player_fixture_performances row EVEN FOR AN ADAPTIVE DOCUMENT, which
-- overrode certified adaptive non-participation. That branch now applies to
-- legacy documents only.
--
-- DEPLOY ORDER: apply this migration BEFORE the Edge Function with the new
-- builder. The old function against this database is safe; the new builder against
-- a database without this migration is refused by the old wrapper
-- (sofascore_evidence_invalid / the row stays held).
--
-- The snapshot gains keys only on rows that have something pending, so a
-- document with nothing pending is byte for byte what it was and no existing
-- snapshot digest changes.
do $$
begin
  if to_regprocedure('api.service_record_fantasy_observation(uuid,jsonb,text)') is null
    or to_regprocedure('api.service_record_sofascore_fantasy_observation(uuid,jsonb,boolean)') is null
    or to_regprocedure('api.service_sofascore_fantasy_note(uuid,text,text,text,jsonb,jsonb,text,timestamptz)') is null
    or to_regprocedure('api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)') is null
    or to_regprocedure('api.get_my_fantasy_points_before_live(uuid,uuid)') is null
    or to_regprocedure('api.service_begin_fantasy_finalization(uuid,bigint,text)') is null
    or to_regprocedure('app_private.fantasy_scoring_input_document_before_live(uuid)') is null then
    raise exception 'fantasy_pending_items_prerequisite_missing: apply migrations up to 20261013180000 first';
  end if;
end $$;

-- ===========================================================================
-- 1. Storage
-- ===========================================================================
alter table app_private.fantasy_fixture_observations
  add column pending_items integer not null default 0 check (pending_items >= 0);
comment on column app_private.fantasy_fixture_observations.pending_items is
  'Core fields that are unknown over all rows, plus the rows'' pendingItems. 0 for every observation recorded before pending items existed.';

-- What the last persisted calculation left pending, per player: read by the
-- points RPCs instead of detoasting the snapshot on every request.
create table app_private.fantasy_player_gameweek_pending (
  gameweek_id uuid not null references app.fantasy_gameweeks(id),
  fantasy_player_id uuid not null references app.fantasy_players(id),
  calculation_version bigint not null,
  participation_pending boolean not null default false,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  primary key (gameweek_id, fantasy_player_id)
);
alter table app_private.fantasy_player_gameweek_pending enable row level security;
alter table app_private.fantasy_player_gameweek_pending force row level security;
revoke all on app_private.fantasy_player_gameweek_pending from public, anon, authenticated, service_role;

-- ===========================================================================
-- 2. The category rule
-- ===========================================================================
create function app_private.fantasy_category_fields(p_category text)
returns text[] language sql immutable set search_path = '' as $$
  select case p_category
    when 'appearance' then array['minutes']
    when 'goal' then array['goals']
    when 'assist' then array['assists']
    when 'clean_sheet' then array['minutes', 'cleanSheet']
    when 'goals_conceded' then array['minutes', 'goalsConceded']
    when 'saves' then array['saves']
    when 'penalty_save' then array['penaltiesSaved']
    when 'penalty_miss' then array['penaltiesMissed']
    when 'yellow_card' then array['yellowCards']
    when 'red_card' then array['redCards']
    when 'second_yellow_dismissal' then array['secondYellowDismissals']
    when 'own_goal' then array['ownGoals']
  end $$;
revoke all on function app_private.fantasy_category_fields(text) from public, anon, authenticated, service_role;

-- The categories in the row's scope: all twelve, less the four simple mode does not count.
create function app_private.fantasy_row_scoped_categories(p_row jsonb)
returns text[] language sql immutable set search_path = '' as $$
  select array_agg(c order by c collate "C") from unnest(array['appearance', 'goal', 'assist', 'clean_sheet',
    'goals_conceded', 'saves', 'penalty_save', 'penalty_miss', 'yellow_card', 'red_card',
    'second_yellow_dismissal', 'own_goal']) c
  where not (coalesce(p_row->>'scoringMode', '') = 'simple' and c in ('assist', 'saves', 'penalty_save', 'penalty_miss'))
$$;
revoke all on function app_private.fantasy_row_scoped_categories(jsonb) from public, anon, authenticated, service_role;

-- The categories of the row that can be scored, sorted. Each field is checked once.
create function app_private.fantasy_row_scorable_categories(p_row jsonb, p_full_minutes integer)
returns text[] language plpgsql stable set search_path = '' as $$
declare
  v_simple boolean := coalesce(p_row->>'scoringMode', '') = 'simple';
  v_ok jsonb := '{}'::jsonb; v_field text; v_min boolean; v_under boolean; v_appearance_pending boolean;
  v_result text[];
begin
  foreach v_field in array array['minutes', 'goals', 'assists', 'cleanSheet', 'goalsConceded', 'saves',
      'penaltiesSaved', 'penaltiesMissed', 'yellowCards', 'redCards', 'secondYellowDismissals', 'ownGoals'] loop
    v_ok := v_ok || jsonb_build_object(v_field, case when v_simple
      then app_private.fantasy_field_scorable(p_row, v_field)
      else app_private.fantasy_field_certified(p_row, v_field) end);
  end loop;
  v_min := (v_ok->>'minutes')::boolean;
  v_under := v_min and (p_row#>>'{stats,minutes}')::integer < p_full_minutes;
  v_appearance_pending := jsonb_typeof(p_row->'pendingItems') = 'array' and exists(
    select 1 from jsonb_array_elements(p_row->'pendingItems') i where i->>'category' = 'appearance');
  select coalesce(array_agg(c.category order by c.category collate "C"), array[]::text[]) into v_result
  from (values
    ('appearance', v_min),
    ('goal', (v_ok->>'goals')::boolean),
    ('assist', (v_ok->>'assists')::boolean and not v_simple),
    ('clean_sheet', v_min and ((v_ok->>'cleanSheet')::boolean or (v_under and not v_appearance_pending))),
    ('goals_conceded', v_min and ((v_ok->>'goalsConceded')::boolean or (v_under and not v_appearance_pending))),
    ('saves', (v_ok->>'saves')::boolean and not v_simple),
    ('penalty_save', (v_ok->>'penaltiesSaved')::boolean and not v_simple),
    ('penalty_miss', (v_ok->>'penaltiesMissed')::boolean and not v_simple),
    ('yellow_card', (v_ok->>'yellowCards')::boolean),
    ('red_card', (v_ok->>'redCards')::boolean),
    ('second_yellow_dismissal', (v_ok->>'secondYellowDismissals')::boolean),
    ('own_goal', (v_ok->>'ownGoals')::boolean)) c(category, ok)
  where c.ok;
  return v_result;
end $$;
revoke all on function app_private.fantasy_row_scorable_categories(jsonb, integer) from public, anon, authenticated, service_role;

-- In scope but not scorable, plus the categories the row's pendingItems name; sorted.
create function app_private.fantasy_row_pending_categories(p_row jsonb, p_full_minutes integer)
returns text[] language sql stable set search_path = '' as $$
  select coalesce(array_agg(distinct c collate "C" order by c collate "C"), array[]::text[]) from (
    select c from unnest(app_private.fantasy_row_scoped_categories(p_row)) c
    where c <> all (app_private.fantasy_row_scorable_categories(p_row, p_full_minutes))
    union
    select i->>'category' from jsonb_array_elements(
      case when jsonb_typeof(p_row->'pendingItems') = 'array' then p_row->'pendingItems' else '[]'::jsonb end) i
    where i->>'category' in ('appearance', 'goal', 'assist', 'clean_sheet', 'goals_conceded', 'saves',
      'penalty_save', 'penalty_miss', 'yellow_card', 'red_card', 'second_yellow_dismissal', 'own_goal')
  ) q(c) $$;
revoke all on function app_private.fantasy_row_pending_categories(jsonb, integer) from public, anon, authenticated, service_role;

-- [{fixtureId, category, reason}] for the read contract. The reason is the row's own
-- pendingItem reason, else the reason on the first unknown field the category depends on,
-- else data_pending.
create function app_private.fantasy_row_pending_items(p_row jsonb, p_full_minutes integer)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('fixtureId', p_row->>'fixtureId', 'category', c,
    'reason', coalesce(
      (select i->>'reason' from jsonb_array_elements(
         case when jsonb_typeof(p_row->'pendingItems') = 'array' then p_row->'pendingItems' else '[]'::jsonb end) i
        where i->>'category' = c limit 1),
      (select p_row#>>array['evidence', fld, 'reason'] from unnest(app_private.fantasy_category_fields(c)) with ordinality u(fld, o)
        where p_row#>>array['evidence', fld, 'state'] = 'unknown' and p_row#>>array['evidence', fld, 'reason'] is not null
        order by o limit 1),
      'data_pending')) order by c collate "C"), '[]'::jsonb)
  from unnest(app_private.fantasy_row_pending_categories(p_row, p_full_minutes)) c $$;
revoke all on function app_private.fantasy_row_pending_items(jsonb, integer) from public, anon, authenticated, service_role;

-- ===========================================================================
-- 3. Recorder: simple_ready is about the fixture, not about every row
-- ===========================================================================
-- Same function as 20261003180000 except:
--   * a core field whose evidence is explicitly 'unknown' is a pending item, not a
--     reason to hold the fixture. A field that is neither scorable nor unknown (bad
--     evidence, a bad value) still holds it, as before;
--   * goals unknown: the goals cannot be added up, so simple_ready stays false;
--   * ownGoals unknown: the club's goals must not exceed the score (a lower bound),
--     equality is required only when no own goal is unknown;
--   * a row may carry pendingItems (checked for shape here, strictly by the SofaScore
--     wrapper); full_ready is false when any exists;
--   * consistency checks run on a row only over fields that are all known;
--   * pending_items is stored.
create or replace function api.service_record_fantasy_observation(p_fixture_id uuid,p_payload jsonb,p_source text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f app.fixtures%rowtype; r jsonb; field text; rows jsonb:=p_payload->'players';
 core boolean:=true; full_stats boolean:=true; row_core boolean; position text; d text; existing bigint;
 home_goals integer; away_goals integer; anon_count integer; team uuid; n integer;
 core_fields constant text[]:=array['minutes','goals','cleanSheet','goalsConceded','yellowCards','redCards','secondYellowDismissals','ownGoals'];
 k boolean[]; i integer; pending_n integer:=0; goals_unknown boolean:=false;
 home_og_unknown integer; away_og_unknown integer;
begin
 if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
 if p_source is null or p_source not in ('sportsmonks','reviewed-correction','provider-reconciled')
 or (p_source='provider-reconciled' and coalesce(current_setting('botolago.reconciled_ingestion',true),'')<>'on')
 or jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>2097152
 or jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) not between 18 and 100
 or jsonb_typeof(p_payload->'references') is distinct from 'array' or jsonb_array_length(p_payload->'references')=0 then
 raise exception using errcode='PT400',message='adaptive_payload_invalid'; end if;
 perform g.id from app.fantasy_gameweeks g join app.fantasy_fixture_assignments a on a.gameweek_id=g.id
 where a.fixture_id=p_fixture_id and a.superseded_at is null order by g.id for update of g;
 select * into f from app.fixtures where id=p_fixture_id for update;
 if not found or f.status<>'finished' or f.finalized_at is null then
 raise exception using errcode='PT409',message='adaptive_fixture_not_finished'; end if;
 if not exists(select 1 from app.fantasy_fixture_assignments a where a.fixture_id=f.id and a.superseded_at is null
 and app_private.fantasy_adaptive_enabled(a.gameweek_id)) then
 raise exception using errcode='PT409',message='adaptive_policy_not_enabled'; end if;
 if exists(select 1 from app.fantasy_fixture_assignments a join app.fantasy_gameweeks g on g.id=a.gameweek_id
 where a.fixture_id=f.id and a.superseded_at is null and g.status in ('finalizing','finalized','corrected')) then
 raise exception using errcode='PT409',message='adaptive_reviewed_correction_required'; end if;
 if exists(select 1 from app_private.fantasy_scoring_snapshots s join app.fantasy_fixture_assignments a on a.gameweek_id=s.gameweek_id
 where a.fixture_id=f.id and a.superseded_at is null and s.sealed_at is not null) then
 raise exception using errcode='PT409',message='fantasy_scoring_sealed'; end if;

 if app_private.fantasy_observation_estimated(p_payload) then
 if p_source<>'reviewed-correction' or p_payload#>>'{estimateAcceptance,policy}' is distinct from 'best-available-v1'
 or p_payload#>'{estimateAcceptance,finalForRankings}' is distinct from 'true'::jsonb
 or jsonb_typeof(p_payload#>'{estimateAcceptance,assumptions}') is distinct from 'array'
 or jsonb_array_length(p_payload#>'{estimateAcceptance,assumptions}')=0
 or exists(select 1 from jsonb_array_elements(p_payload#>'{estimateAcceptance,assumptions}') a where jsonb_typeof(a)<>'string' or length(btrim(a#>>'{}'))<3)
 then raise exception using errcode='PT400',message='adaptive_estimate_acceptance_required'; end if;
 if exists(select 1 from app.fantasy_fixture_assignments a join app.fantasy_gameweeks g on g.id=a.gameweek_id
 left join app_private.fantasy_adaptive_policy policy on policy.season_id=g.fantasy_season_id
 where a.fixture_id=f.id and a.superseded_at is null and a.counts_points
 and (policy.ruleset_id is distinct from 'f6200000-0000-4000-8000-000000000201'::uuid or g.sequence_number<policy.from_gameweek)) then
 raise exception using errcode='PT409',message='adaptive_estimates_policy_required'; end if;
 if exists(select 1 from app_private.fantasy_fixture_scoring_modes where fixture_id=f.id and mode='full') then
 raise exception using errcode='PT409',message='adaptive_estimates_simple_only'; end if;
 if exists(select 1 from jsonb_array_elements(rows) player,lateral jsonb_each(coalesce(player->'evidence','{}')) e
 where e.value->>'state'='estimated' and not app_private.fantasy_field_scorable(player,e.key)) then
 raise exception using errcode='PT400',message='adaptive_estimate_evidence_invalid'; end if;
 end if;
 if jsonb_typeof(coalesce(p_payload->'estimatedNonParticipants','[]')) is distinct from 'array'
 or jsonb_typeof(coalesce(p_payload->'verifiedNonParticipants','[]')) is distinct from 'array' then
 raise exception using errcode='PT400',message='adaptive_payload_invalid'; end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_payload->'estimatedNonParticipants','[]')||coalesce(p_payload->'verifiedNonParticipants','[]')) absent
 where jsonb_typeof(absent)<>'string' or exists(select 1 from jsonb_array_elements(rows) player where player->>'playerId'=absent#>>'{}')
 or not exists(select 1 from app.team_memberships membership where membership.player_id=(absent#>>'{}')::uuid
 and membership.team_id in(f.home_team_id,f.away_team_id) and membership.season_id=f.season_id
 and membership.valid_from<=f.kickoff_at::date and (membership.valid_to is null or membership.valid_to>=f.kickoff_at::date)))
 or (select count(*)<>count(distinct absent) from jsonb_array_elements(coalesce(p_payload->'estimatedNonParticipants','[]')||coalesce(p_payload->'verifiedNonParticipants','[]')) absent) then
 raise exception using errcode='PT400',message='adaptive_conflicting_participation'; end if;
 if p_source in ('sportsmonks','provider-reconciled') then
 select id into existing from app_private.fantasy_fixture_observations where fixture_id=f.id and source='reviewed-correction' order by observed_at desc,id desc limit 1;
 if existing is not null then return (select jsonb_build_object('observationId',id,'digest',digest,'fullReady',full_ready,'simpleReady',simple_ready,'reviewedOverride',true) from app_private.fantasy_fixture_observations where id=existing); end if;
 end if;
 if (p_payload->>'homeScore')::integer is distinct from f.home_score or
 (p_payload->>'awayScore')::integer is distinct from f.away_score then
 raise exception using errcode='PT409',message='adaptive_final_score_mismatch'; end if;
 anon_count:=coalesce((p_payload->>'anonymousStarters')::integer,0);
 if anon_count not between 0 and 4 or (select count(distinct v->>'playerId') from jsonb_array_elements(rows) v)<>jsonb_array_length(rows) then
 raise exception using errcode='PT400',message='adaptive_lineup_invalid'; end if;
 foreach team in array array[f.home_team_id,f.away_team_id] loop
 select count(*) into n from jsonb_array_elements(rows) v where (v->>'teamId')::uuid=team and (v->>'started')::boolean;
 if n+coalesce((p_payload#>>array['anonymousByTeam',team::text])::integer,0)<>11 then
 raise exception using errcode='PT400',message='adaptive_starters_incomplete'; end if;
 end loop;
 if (select count(*) from jsonb_array_elements(rows) v where (v->>'started')::boolean)+anon_count<>22 then
 raise exception using errcode='PT400',message='adaptive_starters_incomplete'; end if;
 for r in select value from jsonb_array_elements(rows) loop
 if not exists(select 1 from app.team_memberships m where m.player_id=(r->>'playerId')::uuid
 and m.team_id=(r->>'teamId')::uuid and m.season_id=f.season_id and m.team_id in(f.home_team_id,f.away_team_id)
 and m.valid_from<=f.kickoff_at::date and (m.valid_to is null or m.valid_to>=f.kickoff_at::date)) then
 raise exception using errcode='PT409',message='adaptive_player_membership_missing'; end if;
 select p.position::text into position from app.players p where p.id=(r->>'playerId')::uuid;
 -- pendingItems: shape only here; the SofaScore wrapper holds the strict contract.
 if r ? 'pendingItems' then
 if jsonb_typeof(r->'pendingItems') is distinct from 'array' or jsonb_array_length(r->'pendingItems')>12
 or exists(select 1 from jsonb_array_elements(r->'pendingItems') item
   where jsonb_typeof(item) is distinct from 'object' or item->>'category' is null
   or item->>'category' not in ('appearance','goal','assist','clean_sheet','goals_conceded','saves','penalty_save','penalty_miss','yellow_card','red_card','second_yellow_dismissal','own_goal')
   or jsonb_typeof(item->'reason') is distinct from 'string' or length(item->>'reason') not between 1 and 60) then
 raise exception using errcode='PT400',message='adaptive_payload_invalid'; end if;
 pending_n:=pending_n+jsonb_array_length(r->'pendingItems');
 end if;
 row_core:=true;
 k:=array[]::boolean[];
 foreach field in array core_fields loop k:=k||app_private.fantasy_field_scorable(r,field); end loop;
 for i in 1..8 loop
 if not k[i] then
 -- Explicitly unknown is a pending item; anything else is bad evidence and holds the fixture.
 if r#>>array['evidence',core_fields[i],'state']='unknown' then pending_n:=pending_n+1;
 else row_core:=false; end if;
 end if;
 end loop;
 -- k: 1 minutes, 2 goals, 3 cleanSheet, 4 goalsConceded, 5 yellow, 6 red, 7 secondYellow, 8 ownGoals.
 if not k[2] then goals_unknown:=true; end if;
 if row_core then
 if (k[1] and (r#>>'{stats,minutes}')::integer>90)
 or (k[1] and k[3] and k[4] and (r#>>'{stats,cleanSheet}')::boolean is distinct from ((r#>>'{stats,minutes}')::integer>=60 and (r#>>'{stats,goalsConceded}')::integer=0))
 or (k[1] and k[3] and (r#>>'{stats,cleanSheet}')::boolean and (r#>>'{stats,minutes}')::integer<60)
 or (k[1] and (r->>'started')::boolean and (r#>>'{stats,minutes}')::integer=0)
 or (k[4] and (r#>>'{stats,goalsConceded}')::integer>case when (r->>'teamId')::uuid=f.home_team_id then f.away_score else f.home_score end) then
 raise exception using errcode='PT400',message='adaptive_statistics_inconsistent'; end if;
 if k[1] and (r#>>'{stats,minutes}')::integer=0 and ((k[2] and (r#>>'{stats,goals}')::integer>0) or (k[8] and (r#>>'{stats,ownGoals}')::integer>0)) then
 raise exception using errcode='PT400',message='adaptive_statistics_inconsistent'; end if;
 if k[7] and (r#>>'{stats,secondYellowDismissals}')::integer>0
 and ((k[5] and (r#>>'{stats,yellowCards}')::integer>0) or (k[6] and (r#>>'{stats,redCards}')::integer>0)) then
 raise exception using errcode='PT409',message='adaptive_disciplinary_overlap_review_required'; end if;
 end if;
 core:=core and row_core;
 full_stats:=full_stats and row_core and not coalesce(jsonb_typeof(r->'pendingItems')='array' and jsonb_array_length(r->'pendingItems')>0,false)
   and not exists(select 1 from unnest(array['minutes','goals','goalsConceded','yellowCards','redCards','secondYellowDismissals','ownGoals']) required_field where r#>>array['evidence',required_field,'state'] is distinct from 'verified');
 foreach field in array array['assists','penaltiesMissed','saves','penaltiesSaved'] loop
 if position='goalkeeper' or exists(select 1 from app.fantasy_players fp join app.fantasy_positions pos on pos.id=fp.position_id where fp.football_player_id=(r->>'playerId')::uuid and pos.code='GK') or field not in('saves','penaltiesSaved') then
 full_stats:=full_stats and app_private.fantasy_field_certified(r,field) and r#>>array['evidence',field,'state']='verified';
 end if;
 end loop;
 end loop;
 core:=core and not goals_unknown and coalesce((p_payload->>'disciplineComplete')::boolean,false)
 and coalesce((p_payload->>'participationComplete')::boolean,false);
 -- Unidentified rows cannot certify nonappearance for an unmatched fantasy player.
 if exists(select 1 from app.fantasy_players fp join app.fantasy_lineup_players lp on lp.fantasy_player_id=fp.id
 join app.fantasy_lineups l on l.id=lp.lineup_id join app.fantasy_fixture_assignments a on a.gameweek_id=l.gameweek_id
 where a.fixture_id=f.id and a.superseded_at is null and fp.football_team_id in(f.home_team_id,f.away_team_id)
 and not exists(select 1 from jsonb_array_elements(rows) entry where entry->>'playerId'=fp.football_player_id::text)
 and not coalesce((coalesce(p_payload->'verifiedNonParticipants','[]')||coalesce(p_payload->'estimatedNonParticipants','[]')) ? fp.football_player_id::text,false)) then core:=false; end if;
 -- Each club's goals in the rows: its players' goals plus the other club's own goals. An
 -- unknown own goal makes the sum a lower bound for the club it would count for.
 select coalesce(sum(case when (entry->>'teamId')::uuid=f.home_team_id then coalesce((entry#>>'{stats,goals}')::integer,0) else coalesce((entry#>>'{stats,ownGoals}')::integer,0) end),0),
 coalesce(sum(case when (entry->>'teamId')::uuid=f.away_team_id then coalesce((entry#>>'{stats,goals}')::integer,0) else coalesce((entry#>>'{stats,ownGoals}')::integer,0) end),0),
 count(*) filter (where (entry->>'teamId')::uuid=f.home_team_id and entry#>'{stats,ownGoals}' is null),
 count(*) filter (where (entry->>'teamId')::uuid=f.away_team_id and entry#>'{stats,ownGoals}' is null)
 into home_goals,away_goals,home_og_unknown,away_og_unknown from jsonb_array_elements(rows) entry;
 core:=core and (case when away_og_unknown=0 then home_goals=f.home_score else home_goals<=f.home_score end)
 and (case when home_og_unknown=0 then away_goals=f.away_score else away_goals<=f.away_score end);
 full_stats:=coalesce(full_stats and core and pending_n=0 and not app_private.fantasy_observation_estimated(p_payload),false); core:=coalesce(core,false);
 d:=encode(extensions.digest((p_payload||jsonb_build_object('players',(select jsonb_agg(entry||jsonb_build_object('evidence',(select coalesce(jsonb_object_agg(key,value-'observedAt'),'{}') from jsonb_each(entry->'evidence'))) order by entry->>'playerId') from jsonb_array_elements(rows) entry)))::text,'sha256'),'hex');
 select id into existing from app_private.fantasy_fixture_observations where fixture_id=f.id and digest=d;
 if existing is null then
 if p_source='reviewed-correction' and ((p_payload->>'expectedDigest') is distinct from
 (select digest from app_private.fantasy_fixture_observations where fixture_id=f.id order by observed_at desc,id desc limit 1)
 or length(coalesce(p_payload->>'reason','')) not between 8 and 500
 or length(coalesce(p_payload->>'reviewer','')) not between 3 and 200) then
 raise exception using errcode='PT409',message='adaptive_correction_review_conflict'; end if;
 insert into app_private.fantasy_fixture_observations(fixture_id,source,digest,payload,full_ready,simple_ready,pending_items)
 values(f.id,p_source,d,p_payload,full_stats,core,pending_n) returning id into existing;
 end if;
 return jsonb_build_object('observationId',existing,'digest',d,'fullReady',full_stats,'simpleReady',core,'pendingItems',pending_n);
exception when invalid_text_representation or numeric_value_out_of_range then
 raise exception using errcode='PT400',message='adaptive_payload_invalid';
end $$;

-- ===========================================================================
-- 4. SofaScore wrapper: accept the new shapes, nothing looser
-- ===========================================================================
-- Patched in place from the 20261012120000 text; every replacement is counted and the
-- migration stops if the text is not the one this was written against.
do $patch$
declare
  definition text; old_text text; new_text text;
begin
  definition := pg_get_functiondef('api.service_record_sofascore_fantasy_observation(uuid,jsonb,boolean)'::regprocedure);

  -- (a) evidence.reason only on unknown evidence, from the list; pendingItems only the
  --     appearance/minutes_conflict straddle, on a verified minutes value under 60.
  old_text := $o$                   or ev.value->>'state' not in ('verified', 'unknown')) then
      raise exception using errcode='PT400', message='sofascore_evidence_invalid'; end if;$o$;
  new_text := $o$                   or ev.value->>'state' not in ('verified', 'unknown')
                   or (ev.value ? 'reason' and (ev.value->>'state' is distinct from 'unknown'
                       or jsonb_typeof(ev.value->'reason') is distinct from 'string'
                       or ev.value->>'reason' not in ('timeline_same_moment', 'minutes_conflict', 'card_conflict',
                            'own_goal_conflict', 'participation_unexplained', 'provider_absent')))) then
      raise exception using errcode='PT400', message='sofascore_evidence_invalid'; end if;
    if e.player_row ? 'pendingItems' and (
        jsonb_typeof(e.player_row->'pendingItems') is distinct from 'array'
        or jsonb_array_length(e.player_row->'pendingItems') <> 1
        or e.player_row->'pendingItems'->0 is distinct from '{"category":"appearance","reason":"minutes_conflict"}'::jsonb
        or e.player_row#>>'{evidence,minutes,state}' is distinct from 'verified'
        or jsonb_typeof(e.player_row#>'{stats,minutes}') is distinct from 'number'
        or (e.player_row#>>'{stats,minutes}') !~ '^[0-9]{1,2}$'
        or (e.player_row#>>'{stats,minutes}')::integer not between 1 and 59) then
      raise exception using errcode='PT400', message='sofascore_pending_items_invalid'; end if;$o$;
  if (length(definition) - length(replace(definition, old_text, ''))) / length(old_text) <> 1 then
    raise exception 'pending items: the SofaScore wrapper is not the 20261012120000 version (evidence check)'; end if;
  definition := replace(definition, old_text, new_text);

  -- (b) The exclusion goal check: an unknown own goal makes a club's sum a lower bound.
  old_text := $o$    if v_home_goals is distinct from f.home_score or v_away_goals is distinct from f.away_score then$o$;
  new_text := $o$    if (case when exists(select 1 from jsonb_array_elements(payload->'players') r
                            where (r->>'teamId')::uuid = f.away_team_id and r#>'{stats,ownGoals}' is null)
             then v_home_goals > f.home_score else v_home_goals is distinct from f.home_score end)
      or (case when exists(select 1 from jsonb_array_elements(payload->'players') r
                            where (r->>'teamId')::uuid = f.home_team_id and r#>'{stats,ownGoals}' is null)
             then v_away_goals > f.away_score else v_away_goals is distinct from f.away_score end) then$o$;
  if (length(definition) - length(replace(definition, old_text, ''))) / length(old_text) <> 1 then
    raise exception 'pending items: the SofaScore wrapper is not the 20261012120000 version (goal check)'; end if;
  definition := replace(definition, old_text, new_text);
  execute definition;
end
$patch$;

-- ===========================================================================
-- 5. A given-up attempt keeps its stored replies
-- ===========================================================================
-- Retry selection ("due") still reads held attempts only; a reopened attempt
-- becomes held again and finds its replies, so no SofaScore request is needed.
do $patch$
declare
  definition text; old_text text; new_text text;
begin
  definition := pg_get_functiondef('api.service_sofascore_fantasy_note(uuid,text,text,text,jsonb,jsonb,text,timestamptz)'::regprocedure);
  old_text := $o$    case when p_status = 'held' then p_match_data end,$o$;
  new_text := $o$    case when p_status in ('held', 'gave_up') then p_match_data end,$o$;
  if (length(definition) - length(replace(definition, old_text, ''))) / length(old_text) <> 1 then
    raise exception 'pending items: the note function is not the 20261011140000 version (insert)'; end if;
  definition := replace(definition, old_text, new_text);
  old_text := $o$    match_data = case when excluded.status = 'held' then coalesce(excluded.match_data, t.match_data) end,$o$;
  new_text := $o$    match_data = case when excluded.status in ('held', 'gave_up') then coalesce(excluded.match_data, t.match_data) end,$o$;
  if (length(definition) - length(replace(definition, old_text, ''))) / length(old_text) <> 1 then
    raise exception 'pending items: the note function is not the 20261011140000 version (update)'; end if;
  execute replace(definition, old_text, new_text);
end
$patch$;

-- ===========================================================================
-- 6. The scoring snapshot document
-- ===========================================================================
-- Adds pendingItems / pendingCategories to the playerFixtures of an adaptive document, only on
-- rows that have something pending. Carries the row's pendingItems from the observation.
create function app_private.fantasy_scoring_document_pending(p_document jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare maps jsonb := '{}'::jsonb; f jsonb; full_minutes integer; rows jsonb;
begin
  if not coalesce((p_document->>'adaptive')::boolean, false) then return p_document; end if;
  full_minutes := (p_document#>>'{ruleset,full_appearance_minutes}')::integer;
  if full_minutes is null or jsonb_typeof(p_document->'playerFixtures') is distinct from 'array' then return p_document; end if;
  for f in select value from jsonb_array_elements(p_document->'fixtures') loop
    if f->>'observationId' is null then continue; end if;
    maps := maps || jsonb_build_object(f->>'fixtureId', coalesce((
      select jsonb_object_agg(r->>'playerId', r->'pendingItems')
      from app_private.fantasy_fixture_observations o
      cross join lateral jsonb_array_elements(o.payload->'players') r
      where o.id = (f->>'observationId')::bigint and jsonb_typeof(r->'pendingItems') = 'array'), '{}'::jsonb));
  end loop;
  select coalesce(jsonb_agg(
    case when cardinality(b.cats) = 0 and a.items is null then x.p
      else x.p || jsonb_strip_nulls(jsonb_build_object('pendingItems', a.items,
        'pendingCategories', case when cardinality(b.cats) > 0 then to_jsonb(b.cats) end)) end
    order by x.ord), '[]'::jsonb) into rows
  from jsonb_array_elements(p_document->'playerFixtures') with ordinality x(p, ord)
  cross join lateral (select maps->(x.p->>'fixtureId')->(x.p->>'playerId') as items) a
  cross join lateral (select app_private.fantasy_row_pending_categories(
      case when a.items is not null then x.p || jsonb_build_object('pendingItems', a.items) else x.p end,
      full_minutes) as cats) b;
  return p_document || jsonb_build_object('playerFixtures', rows);
end $$;
revoke all on function app_private.fantasy_scoring_document_pending(jsonb) from public, anon, authenticated, service_role;

-- Same function as 20260927145230 with two changes: the legacy anonymous-starter /
-- performance-row branch of pendingPlayerIds applies to legacy documents only (it
-- overrode certified adaptive non-participation), and the adaptive document goes
-- through fantasy_scoring_document_pending.
create or replace function app_private.fantasy_scoring_input_document(p_gameweek_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d jsonb; f jsonb; one_fixture jsonb; ready jsonb:='[]'; pending jsonb:='[]';
 eligible_ids jsonb:='[]'; pending_players jsonb; performances jsonb; reason text;
begin
 d:=app_private.fantasy_scoring_input_document_before_live(p_gameweek_id);
 if not app_private.fantasy_live_scoring_enabled(p_gameweek_id) then
   return app_private.fantasy_scoring_document_pending(d); end if;
 for f in select value from jsonb_array_elements(d->'fixtures')
 where (value#>>'{assignment,counts_points}')::boolean is true loop
   reason:=null;
   one_fixture:=d||jsonb_build_object('fixtures',jsonb_build_array(f),'playerFixtures',
     (select coalesce(jsonb_agg(p),'[]') from jsonb_array_elements(d->'playerFixtures') p
       where p->>'fixtureId'=f->>'fixtureId'));
   if f->>'status' is distinct from 'finished' or f->>'finalizedAt' is null then
     reason:='fixture_not_finished';
   elsif coalesce((d->>'adaptive')::boolean,false) and
     ((f->>'adaptiveReady')::boolean is distinct from true or f->>'scoringMode' is null) then
     reason:='fixture_data_pending';
   else
     begin
       perform app_private.fantasy_validate_scoring_document(one_fixture);
     exception when sqlstate 'PT409' then
       get stacked diagnostics reason=message_text;
       if reason not in ('fantasy_scoring_input_incomplete','fantasy_scoring_coverage_incomplete',
         'fantasy_goal_totals_mismatch','adaptive_scoring_pending') then raise; end if;
     end;
   end if;
   if reason is null then
     ready:=ready||jsonb_build_array(f);
     eligible_ids:=eligible_ids||jsonb_build_array(f->>'fixtureId');
   else pending:=pending||jsonb_build_array(f||jsonb_build_object('pendingReason',reason)); end if;
 end loop;
 select coalesce(jsonb_agg(p),'[]') into performances
 from jsonb_array_elements(d->'playerFixtures') p where eligible_ids ? (p->>'fixtureId');
 -- Unknown participation never triggers a substitution or vice-captain promotion.
 -- An adaptive document takes participation from the effective observation alone
 -- (participationKnown); the legacy anonymous-starter / performance-row rule is for
 -- legacy documents.
 select coalesce(jsonb_agg(distinct p->>'fantasyPlayerId'),'[]') into pending_players
 from jsonb_array_elements(d->'playerFixtures') p
 where (not (eligible_ids ? (p->>'fixtureId'))
   or (coalesce((d->>'adaptive')::boolean,false) and (p->>'participationKnown')::boolean is distinct from true)
   or (not coalesce((d->>'adaptive')::boolean,false) and exists(select 1 from jsonb_array_elements(ready) ready_fixture
     where ready_fixture->>'fixtureId'=p->>'fixtureId' and coalesce((ready_fixture#>>'{coverage,anonymous_starter_rows}')::int,0)>0
       and not exists(select 1 from app.player_fixture_performances perf
          where perf.fixture_id=(p->>'fixtureId')::uuid and perf.player_id=(p->>'playerId')::uuid and perf.active))))
   and exists(select 1 from app.fantasy_lineup_players lp
     join app.fantasy_lineups l on l.id=lp.lineup_id
     where l.gameweek_id=p_gameweek_id and l.locked_at is not null
       and lp.fantasy_player_id::text=p->>'fantasyPlayerId');
 return app_private.fantasy_scoring_document_pending(d||jsonb_build_object('incremental',true,'fixtures',ready,'pendingFixtures',pending,
   'pendingPlayerIds',pending_players,'playerFixtures',performances));
end $$;
revoke all on function app_private.fantasy_scoring_input_document(uuid) from public,anon,authenticated,service_role;

-- ===========================================================================
-- 7. The points save: expected categories follow the rule; pending recorded
-- ===========================================================================
-- Same function as 20261013180000 (set-based) except the expected category set of a
-- row (app_private.fantasy_row_scorable_categories) and the pending write at the end of
-- the player block. Validations, error codes, rows and the return value are otherwise
-- unchanged.
create or replace function api.service_persist_fantasy_scoring_results(
  p_gameweek_id uuid,p_calculation_version bigint,p_input_digest text,
  p_player_results jsonb,p_team_results jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare gw app.fantasy_gameweeks%rowtype; snapshot app_private.fantasy_scoring_snapshots%rowtype;
  team_result jsonb; substitution jsonb;
  player_count integer:=0; team_count integer:=0; lineup app.fantasy_lineups%rowtype;
  chip app.fantasy_chip_type; actual_hit integer; starting_points integer; bench_points integer;
  captain_points integer; actual_score integer; effective_captain uuid; captain_multiplier numeric;
  all_categories constant text[]:=array['appearance','goal','assist','clean_sheet','goals_conceded','saves','penalty_save','penalty_miss','yellow_card','red_card','second_yellow_dismissal','own_goal'];
  snapshot_player_fixtures jsonb; snapshot_players jsonb; snapshot_position_rules jsonb;
  snapshot_pending_players jsonb; snapshot_squad_size text; snapshot_captain_multiplier text;
  snapshot_triple_multiplier text; snapshot_scoring_version text; snapshot_adaptive boolean:=false;
  snapshot_full_minutes integer;
  results_digest text; player_error text;
begin
  if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
  if p_gameweek_id is null or p_calculation_version is null or p_calculation_version<1
    or p_input_digest is null or p_input_digest!~'^[0-9a-f]{64}$'
    or jsonb_typeof(p_player_results) is distinct from 'array'
    or jsonb_typeof(p_team_results) is distinct from 'array'
    or jsonb_array_length(p_player_results)>10000 or jsonb_array_length(p_team_results)>100
    or pg_column_size(p_player_results)>16777216 or pg_column_size(p_team_results)>1048576 then
    raise exception using errcode='PT400',message='validation_failed'; end if;
  select * into gw from app.fantasy_gameweeks where id=p_gameweek_id for update;
  if not found then raise exception using errcode='PT404',message='fantasy_gameweek_not_found'; end if;
  if gw.status<>'provisional' and not (gw.status='live' and (app_private.fantasy_adaptive_enabled(gw.id) or app_private.fantasy_live_scoring_enabled(gw.id))) then raise exception using errcode='PT409',message='gameweek_not_scorable'; end if;
  snapshot:=app_private.fantasy_assert_scoring_snapshot(gw.id,p_calculation_version,p_input_digest);
  if snapshot.sealed_at is not null then raise exception using errcode='PT409',message='fantasy_scoring_sealed'; end if;

  snapshot_player_fixtures:=snapshot.payload->'playerFixtures';
  snapshot_players:=snapshot.payload->'players';
  snapshot_position_rules:=snapshot.payload->'positionRules';
  snapshot_pending_players:=coalesce(snapshot.payload->'pendingPlayerIds','[]'::jsonb);
  snapshot_squad_size:=snapshot.payload#>>'{ruleset,squad_size}';
  snapshot_captain_multiplier:=snapshot.payload#>>'{ruleset,captain_multiplier}';
  snapshot_triple_multiplier:=snapshot.payload#>>'{ruleset,triple_captain_multiplier}';
  snapshot_scoring_version:=snapshot.payload->>'scoringVersion';
  snapshot_full_minutes:=(snapshot.payload#>>'{ruleset,full_appearance_minutes}')::integer;

  if jsonb_array_length(p_player_results)=0 and jsonb_array_length(snapshot_player_fixtures)>0 then
    if not snapshot.players_persisted then raise exception using errcode='PT409',message='fantasy_player_results_missing'; end if;
  else
    results_digest:=encode(extensions.digest(p_player_results::text,'sha256'),'hex');
    if snapshot.players_persisted and snapshot.player_results_digest is distinct from results_digest then
      raise exception using errcode='PT409',message='fantasy_scoring_replay_conflict'; end if;
    if jsonb_array_length(p_player_results)<>jsonb_array_length(snapshot_player_fixtures)
      or (select count(distinct (v->>'fantasyPlayerId',v->>'fixtureId')) from jsonb_array_elements(p_player_results) v)<>jsonb_array_length(p_player_results) then
      raise exception using errcode='PT400',message='fantasy_player_result_scope_invalid'; end if;

    if jsonb_array_length(snapshot_player_fixtures)>0 then
      snapshot_adaptive:=coalesce((snapshot.payload->>'adaptive')::boolean,false);
    end if;
    with submitted as materialized (
      select s.value->>'fantasyPlayerId' as player_key,s.value->>'fixtureId' as fixture_key,s.value as document
      from jsonb_array_elements(p_player_results) s
    ), matched as materialized (
      select i.ordinality as ord,i.value as input_row,r.document,
        -- Categories this row must carry: those of its scope that can be scored
        -- (fantasy_row_scorable_categories); a pending category carries no event.
        case when snapshot_adaptive then app_private.fantasy_row_scorable_categories(i.value,snapshot_full_minutes)
          else all_categories end as categories
      from jsonb_array_elements(snapshot_player_fixtures) with ordinality as i(value,ordinality)
      left join submitted r on r.player_key=i.value->>'fantasyPlayerId' and r.fixture_key=i.value->>'fixtureId'
    ), scope_checked as materialized (
      select m.*,
        case when m.document is null or jsonb_typeof(m.document->'events') is distinct from 'array' then true
          when jsonb_array_length(m.document->'events')<>cardinality(m.categories) then true
          else (select count(distinct v->>'category') from jsonb_array_elements(m.document->'events') v)<>cardinality(m.categories)
        end as scope_invalid
      from matched m
    ), event_checked as (
      select s.ord,e.ordinality as event_ord,
        case when e.value->>'category' is null or not (e.value->>'category'=any(s.categories))
            or e.value->>'sourceKey' is distinct from ('fixture-stats:'||(s.input_row->>'fixtureId')||':'||(s.input_row->>'playerId')||':'||(e.value->>'category'))
            or jsonb_typeof(e.value->'points') is distinct from 'number'
            or (e.value->>'points')!~'^-?[0-9]+$' then 'fantasy_point_event_invalid'
          when (e.value->>'points')::numeric not between -2147483648 and 2147483647 then 'validation_failed'
          when (e.value->>'points')::numeric not between -100 and 100 then 'fantasy_point_event_invalid'
        end as message
      from scope_checked s
      cross join lateral jsonb_array_elements(case when s.scope_invalid then '[]'::jsonb else s.document->'events' end)
        with ordinality as e(value,ordinality)
    )
    select q.message into player_error from (
      select ord,0 as phase,0::bigint as event_ord,'fantasy_player_result_scope_invalid' as message
        from scope_checked where scope_invalid
      union all
      select ord,1,event_ord,message from event_checked where message is not null
    ) q order by q.ord,q.phase,q.event_ord limit 1;
    if player_error is not null then
      raise exception using errcode='PT400',message=player_error; end if;

    update app.fantasy_player_point_events set superseded_at=statement_timestamp()
      where gameweek_id=gw.id and source_key like 'fixture-stats:%' and superseded_at is null;
    with submitted as materialized (
      select s.value->>'fantasyPlayerId' as player_key,s.value->>'fixtureId' as fixture_key,s.value as document
      from jsonb_array_elements(p_player_results) s
    ), snapshot_rows as (
      select distinct on (i.value->>'fantasyPlayerId',i.value->>'fixtureId') i.value as input_row
      from jsonb_array_elements(snapshot_player_fixtures) with ordinality as i(value,ordinality)
      order by i.value->>'fantasyPlayerId',i.value->>'fixtureId',i.ordinality desc
    )
    insert into app.fantasy_player_point_events(
      fantasy_player_id,gameweek_id,fixture_id,category,points,state,
      scoring_version,source_sequence,source_key)
    select (i.input_row->>'fantasyPlayerId')::uuid,gw.id,(i.input_row->>'fixtureId')::uuid,
      e.value->>'category',(e.value->>'points')::integer,'provisional',
      snapshot_scoring_version::integer,(i.input_row->>'sourceSequence')::bigint,e.value->>'sourceKey'
    from snapshot_rows i
    join submitted r on r.player_key=i.input_row->>'fantasyPlayerId' and r.fixture_key=i.input_row->>'fixtureId'
    cross join lateral jsonb_array_elements(r.document->'events') e
    where true
    on conflict(fantasy_player_id,fixture_id,source_key,scoring_version) do update set
      points=excluded.points,state='provisional',
      source_sequence=excluded.source_sequence,superseded_at=null;

    with players as materialized (
      select value->>'fantasyPlayerId' as player_key from jsonb_array_elements(snapshot_players)
    ), fixture_totals as materialized (
      select f.value->>'fantasyPlayerId' as player_key,
        sum((f.value#>>'{stats,minutes}')::integer) as minutes,
        bool_or((f.value#>>'{stats,minutes}')::integer>0) as played,
        max((f.value->>'sourceSequence')::bigint) as source_sequence
      from jsonb_array_elements(snapshot_player_fixtures) f
      where f.value->>'fantasyPlayerId' in (select player_key from players)
      group by f.value->>'fantasyPlayerId'
    ), event_totals as materialized (
      select e.fantasy_player_id,sum(e.points) as points
      from app.fantasy_player_point_events e
      where e.gameweek_id=gw.id and e.superseded_at is null
      group by e.fantasy_player_id
    )
    insert into app.fantasy_player_gameweek_points(fantasy_player_id,gameweek_id,provisional_points,minutes_played,did_play,calculation_version,football_input_version,final_points,finalized_at)
    select p.player_key::uuid,gw.id,coalesce(e.points,0),coalesce(f.minutes,0),coalesce(f.played,false),
      p_calculation_version,coalesce(f.source_sequence,0),null,null
    from players p
    left join fixture_totals f on f.player_key=p.player_key
    left join event_totals e on e.fantasy_player_id=p.player_key::uuid
    where true
    on conflict(fantasy_player_id,gameweek_id) do update set provisional_points=excluded.provisional_points,
      minutes_played=excluded.minutes_played,did_play=excluded.did_play,calculation_version=excluded.calculation_version,
      football_input_version=excluded.football_input_version,final_points=null,finalized_at=null;
    get diagnostics player_count=row_count;

    -- What this calculation left pending, per player, for the read RPCs: the items of
    -- every row with a pending category, and the players whose participation or fixture
    -- is pending (pendingPlayerIds). Replaced as a whole, so a resolved item disappears.
    delete from app_private.fantasy_player_gameweek_pending where gameweek_id=gw.id;
    insert into app_private.fantasy_player_gameweek_pending(gameweek_id,fantasy_player_id,calculation_version,participation_pending,items)
    select gw.id,q.player_id,p_calculation_version,q.participation_pending,q.items
    from (
      select coalesce(a.player_key,b.player_key)::uuid as player_id,
        b.player_key is not null as participation_pending,coalesce(a.items,'[]'::jsonb) as items
      from (
        select i.value->>'fantasyPlayerId' as player_key,
          jsonb_agg(item.value order by item.value->>'fixtureId',item.value->>'category') as items
        from jsonb_array_elements(case when snapshot_adaptive then snapshot_player_fixtures else '[]'::jsonb end) i
        cross join lateral jsonb_array_elements(app_private.fantasy_row_pending_items(i.value,snapshot_full_minutes)) item
        group by i.value->>'fantasyPlayerId'
      ) a
      full join (select value #>> '{}' as player_key from jsonb_array_elements(snapshot_pending_players)) b on b.player_key=a.player_key
    ) q
    where q.player_id in (select (value->>'fantasyPlayerId')::uuid from jsonb_array_elements(snapshot_players));

    update app_private.fantasy_scoring_snapshots set players_persisted=true,player_results_digest=results_digest where gameweek_id=gw.id and calculation_version=p_calculation_version;
  end if;

  if (select count(distinct v->>'teamId') from jsonb_array_elements(p_team_results) v)<>jsonb_array_length(p_team_results) then
    raise exception using errcode='PT400',message='fantasy_team_result_scope_invalid'; end if;
  for team_result in select value from jsonb_array_elements(p_team_results) loop
    select * into lineup from app.fantasy_lineups l where l.id=(team_result->>'lineupId')::uuid
      and l.fantasy_team_id=(team_result->>'teamId')::uuid and l.gameweek_id=gw.id and l.locked_at is not null for update;
    if not found or jsonb_typeof(team_result->'players') is distinct from 'array'
      or jsonb_typeof(team_result->'substitutions') is distinct from 'array'
      or jsonb_array_length(team_result->'players')<>snapshot_squad_size::integer
      or jsonb_array_length(team_result->'substitutions')>4
      or (select count(distinct v->>'fantasyPlayerId') from jsonb_array_elements(team_result->'players') v)<>jsonb_array_length(team_result->'players')
      or exists(select 1 from app.fantasy_lineup_players lp where lp.lineup_id=lineup.id and not exists(select 1 from jsonb_array_elements(team_result->'players') v where v->>'fantasyPlayerId'=lp.fantasy_player_id::text)) then
      raise exception using errcode='PT400',message='fantasy_team_result_scope_invalid'; end if;
    if exists(select 1 from app.fantasy_lineup_players lp left join app.fantasy_player_gameweek_points pp on pp.gameweek_id=gw.id and pp.fantasy_player_id=lp.fantasy_player_id
      where lp.lineup_id=lineup.id and pp.calculation_version is distinct from p_calculation_version) then
      raise exception using errcode='PT409',message='fantasy_player_results_missing'; end if;
    select c.chip_type into chip from app.fantasy_chip_uses c where c.fantasy_team_id=lineup.fantasy_team_id and c.gameweek_id=gw.id and c.cancelled_at is null;
    select coalesce(sum(b.point_hit),0) into actual_hit from app.fantasy_transfer_batches b where b.fantasy_team_id=lineup.fantasy_team_id and b.gameweek_id=gw.id and b.status='confirmed';
    select lp.fantasy_player_id into effective_captain from app.fantasy_lineup_players lp join app.fantasy_player_gameweek_points pp on pp.fantasy_player_id=lp.fantasy_player_id and pp.gameweek_id=gw.id
      where lp.lineup_id=lineup.id and (lp.captain or lp.vice_captain) and pp.did_play order by lp.captain desc limit 1;
    if exists(select 1 from app.fantasy_lineup_players lp where lp.lineup_id=lineup.id
       and snapshot_pending_players ? lp.fantasy_player_id::text) then
      select lp.fantasy_player_id into effective_captain from app.fantasy_lineup_players lp
      join app.fantasy_player_gameweek_points pp on pp.fantasy_player_id=lp.fantasy_player_id and pp.gameweek_id=gw.id
      where lp.lineup_id=lineup.id and lp.captain and pp.did_play;
      if jsonb_array_length(team_result->'substitutions')<>0 then
        raise exception using errcode='PT409',message='fantasy_participation_pending'; end if;
    end if;
    if team_result->>'effectiveCaptainId' is distinct from effective_captain::text then
      raise exception using errcode='PT400',message='fantasy_captain_result_invalid'; end if;
    captain_multiplier:=case when chip='triple_captain' then snapshot_triple_multiplier::numeric else snapshot_captain_multiplier::numeric end;
    if (chip='bench_boost' and jsonb_array_length(team_result->'substitutions')<>0)
      or (select count(distinct v->>'playerOutId') from jsonb_array_elements(team_result->'substitutions') v)<>jsonb_array_length(team_result->'substitutions')
      or (select count(distinct v->>'playerInId') from jsonb_array_elements(team_result->'substitutions') v)<>jsonb_array_length(team_result->'substitutions') then
      raise exception using errcode='PT400',message='fantasy_substitution_invalid'; end if;
    for substitution in select value from jsonb_array_elements(team_result->'substitutions') loop
      if not exists(select 1 from app.fantasy_lineup_players outgoing
        join app.fantasy_player_gameweek_points po on po.fantasy_player_id=outgoing.fantasy_player_id and po.gameweek_id=gw.id
        join app.fantasy_players fo on fo.id=outgoing.fantasy_player_id join app.fantasy_positions opo on opo.id=fo.position_id
        cross join app.fantasy_lineup_players incoming
        join app.fantasy_player_gameweek_points pi on pi.fantasy_player_id=incoming.fantasy_player_id and pi.gameweek_id=gw.id
        join app.fantasy_players fi on fi.id=incoming.fantasy_player_id join app.fantasy_positions ip on ip.id=fi.position_id
        where outgoing.lineup_id=lineup.id and incoming.lineup_id=lineup.id
          and outgoing.fantasy_player_id::text=substitution->>'playerOutId' and incoming.fantasy_player_id::text=substitution->>'playerInId'
          and outgoing.slot='starter' and incoming.slot='bench' and not po.did_play and pi.did_play
          and ((opo.code='GK')=(ip.code='GK'))
          and substitution->>'reason'=case when opo.code='GK' then 'goalkeeper_did_not_play' else 'outfield_did_not_play' end) then
        raise exception using errcode='PT400',message='fantasy_substitution_invalid'; end if;
    end loop;
    if chip is distinct from 'bench_boost' and exists(
      select 1 from jsonb_array_elements(snapshot_position_rules) rule
      cross join lateral (select count(*) as n from app.fantasy_lineup_players lp
        join app.fantasy_players fp on fp.id=lp.fantasy_player_id
        join app.fantasy_positions pos on pos.id=fp.position_id
        where lp.lineup_id=lineup.id and pos.code=rule->>'code' and (
          (lp.slot='starter' and not exists(select 1 from jsonb_array_elements(team_result->'substitutions') s where s->>'playerOutId'=lp.fantasy_player_id::text))
          or exists(select 1 from jsonb_array_elements(team_result->'substitutions') s where s->>'playerInId'=lp.fantasy_player_id::text))) formation
      where formation.n<(rule->>'starting_minimum')::integer or formation.n>(rule->>'starting_maximum')::integer) then
      raise exception using errcode='PT400',message='fantasy_substitution_formation_invalid'; end if;
    if exists(select 1 from jsonb_array_elements(team_result->'players') v
      left join app.fantasy_lineup_players lp on lp.lineup_id=lineup.id and lp.fantasy_player_id::text=v->>'fantasyPlayerId'
      where lp.fantasy_player_id is null or jsonb_typeof(v->'multiplier') is distinct from 'number'
        or (v->>'multiplier')::numeric is distinct from case
          when chip='bench_boost' or (lp.slot='starter' and not exists(select 1 from jsonb_array_elements(team_result->'substitutions') s where s->>'playerOutId'=lp.fantasy_player_id::text))
            or exists(select 1 from jsonb_array_elements(team_result->'substitutions') s where s->>'playerInId'=lp.fantasy_player_id::text)
          then case when lp.fantasy_player_id=effective_captain then captain_multiplier else 1 end else 0 end) then
      raise exception using errcode='PT400',message='fantasy_multiplier_invalid'; end if;
    select coalesce(sum(pp.provisional_points) filter(where
      (lp.slot='starter' and not exists(select 1 from jsonb_array_elements(team_result->'substitutions') s where s->>'playerOutId'=lp.fantasy_player_id::text))
      or exists(select 1 from jsonb_array_elements(team_result->'substitutions') s where s->>'playerInId'=lp.fantasy_player_id::text)),0),
      coalesce(sum(pp.provisional_points) filter(where lp.slot='bench' and not exists(select 1 from jsonb_array_elements(team_result->'substitutions') s where s->>'playerInId'=lp.fantasy_player_id::text)),0),
      coalesce(sum(pp.provisional_points*(captain_multiplier-1)) filter(where lp.fantasy_player_id=effective_captain),0)
      into starting_points,bench_points,captain_points
      from app.fantasy_lineup_players lp join app.fantasy_player_gameweek_points pp on pp.fantasy_player_id=lp.fantasy_player_id and pp.gameweek_id=gw.id where lp.lineup_id=lineup.id;
    actual_score:=starting_points+case when chip='bench_boost' then bench_points else 0 end+captain_points-actual_hit;
    if (team_result->>'startingPoints')::integer is distinct from starting_points
      or (team_result->>'benchPoints')::integer is distinct from bench_points
      or (team_result->>'captainPoints')::integer is distinct from captain_points
      or (team_result->>'transferHit')::integer is distinct from actual_hit
      or (team_result->>'provisionalScore')::integer is distinct from actual_score then
      raise exception using errcode='PT400',message='fantasy_team_total_invalid'; end if;
    delete from app.fantasy_auto_substitutions where lineup_id=lineup.id;
    insert into app.fantasy_auto_substitutions(lineup_id,player_out_id,player_in_id,sequence_number,reason,calculation_version)
      select lineup.id,(s->>'playerOutId')::uuid,(s->>'playerInId')::uuid,ordinality::integer,s->>'reason',p_calculation_version
      from jsonb_array_elements(team_result->'substitutions') with ordinality as substitutions(s,ordinality);
    insert into app.fantasy_team_gameweek_results(fantasy_team_id,gameweek_id,starting_points,bench_points,captain_points,transfer_hit,chip_type,provisional_score,calculation_version,scoring_details)
      values(lineup.fantasy_team_id,gw.id,starting_points,bench_points,captain_points,actual_hit,chip,actual_score,p_calculation_version,team_result)
      on conflict(fantasy_team_id,gameweek_id) do update set starting_points=excluded.starting_points,bench_points=excluded.bench_points,
        captain_points=excluded.captain_points,transfer_hit=excluded.transfer_hit,chip_type=excluded.chip_type,
        provisional_score=excluded.provisional_score,calculation_version=excluded.calculation_version,scoring_details=excluded.scoring_details
      where app.fantasy_team_gameweek_results.state='provisional';
    if not found then raise exception using errcode='PT409',message='fantasy_scoring_sealed'; end if;
    team_count:=team_count+1;
  end loop;
  return jsonb_build_object('playersPersisted',player_count,'teamsPersisted',team_count,'inputDigest',snapshot.input_digest,'calculationVersion',p_calculation_version);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode='PT400',message='validation_failed';
end;
$$;
revoke all on function api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb) to service_role;

-- ===========================================================================
-- 8. Finalization waits for pending items
-- ===========================================================================
alter function api.service_begin_fantasy_finalization(uuid,bigint,text) rename to service_begin_fantasy_finalization_before_pending;
revoke all on function api.service_begin_fantasy_finalization_before_pending(uuid,bigint,text) from public,anon,authenticated,service_role;
create function api.service_begin_fantasy_finalization(p_gameweek_id uuid,p_calculation_version bigint,p_input_digest text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d jsonb;
begin
 if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
 -- The document is what the next snapshot would hold: a counted fixture's player
 -- with a pending category keeps the gameweek from finalizing.
 -- Fixtures that are not ready at all keep their own refusals (adaptive_scoring_pending,
 -- fantasy_live_scoring_pending) from the wrapped function.
 if app_private.fantasy_adaptive_enabled(p_gameweek_id) then
   d:=app_private.fantasy_scoring_input_document(p_gameweek_id);
   if exists(select 1 from jsonb_array_elements(d->'playerFixtures') p
     where jsonb_array_length(coalesce(p->'pendingCategories','[]'::jsonb))>0
       and exists(select 1 from jsonb_array_elements(d->'fixtures') f
         where f->>'fixtureId'=p->>'fixtureId' and (f->>'adaptiveReady')::boolean is true and f->>'scoringMode' is not null)) then
     raise exception using errcode='PT409',message='fantasy_pending_items_unresolved'; end if;
 end if;
 return api.service_begin_fantasy_finalization_before_pending(p_gameweek_id,p_calculation_version,p_input_digest);
end $$;
revoke all on function api.service_begin_fantasy_finalization(uuid,bigint,text) from public,anon,authenticated;
grant execute on function api.service_begin_fantasy_finalization(uuid,bigint,text) to service_role;

-- ===========================================================================
-- 9. Read contract (C4)
-- ===========================================================================
alter function api.get_my_fantasy_points(uuid,uuid) rename to get_my_fantasy_points_before_pending;
revoke all on function api.get_my_fantasy_points_before_pending(uuid,uuid) from public,anon,authenticated,service_role;
create function api.get_my_fantasy_points(p_team_id uuid,p_gameweek_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d jsonb; is_final boolean; players jsonb; item_count integer;
begin
 perform app_private.assert_mfa_step_up();
 -- Ownership, MFA and the live/mode additions stay in the wrapped RPC.
 d:=api.get_my_fantasy_points_before_pending(p_team_id,p_gameweek_id);
 is_final:=d->>'pointsState'='final';
 select coalesce(jsonb_agg(x.player||jsonb_build_object(
     'pendingItems',coalesce(pp.items,'[]'::jsonb),
     'pointsStatus',case
       when x.player->>'provisionalPoints' is null
         or (coalesce(pp.participation_pending,false) and not exists(
           select 1 from jsonb_array_elements(coalesce(x.player->'events','[]'::jsonb)) ev where ev->>'category'='appearance')) then 'pending'
       when not is_final or jsonb_array_length(coalesce(pp.items,'[]'::jsonb))>0 then 'provisional'
       else 'final' end) order by x.ord),'[]'::jsonb),
   coalesce(sum(jsonb_array_length(coalesce(pp.items,'[]'::jsonb))),0)
 into players,item_count
 from jsonb_array_elements(d->'players') with ordinality x(player,ord)
 left join app_private.fantasy_player_gameweek_pending pp
   on pp.gameweek_id=p_gameweek_id and pp.fantasy_player_id=(x.player->>'fantasyPlayerId')::uuid;
 d:=d||jsonb_build_object('players',players);
 if jsonb_typeof(d->'result')='object' then
   d:=d||jsonb_build_object('result',(d->'result')||jsonb_build_object('pendingItemCount',item_count));
 end if;
 return d;
end $$;
revoke all on function api.get_my_fantasy_points(uuid,uuid) from public,anon;
grant execute on function api.get_my_fantasy_points(uuid,uuid) to authenticated,service_role;

alter function api.fantasy_player_gameweek_history(uuid) rename to fantasy_player_gameweek_history_before_pending;
revoke all on function api.fantasy_player_gameweek_history_before_pending(uuid) from public,anon,authenticated,service_role;
create function api.fantasy_player_gameweek_history(p_fantasy_player_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(v||jsonb_build_object('pendingItems',coalesce((
   select pp.items from app_private.fantasy_player_gameweek_pending pp
   where pp.fantasy_player_id=p_fantasy_player_id and pp.gameweek_id=(v->>'gameweekId')::uuid),'[]'::jsonb)) order by ord),'[]'::jsonb)
 from jsonb_array_elements(api.fantasy_player_gameweek_history_before_pending(p_fantasy_player_id)) with ordinality x(v,ord);
$$;
revoke all on function api.fantasy_player_gameweek_history(uuid) from public;
grant execute on function api.fantasy_player_gameweek_history(uuid) to anon,authenticated,service_role;
