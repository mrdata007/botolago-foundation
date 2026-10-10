-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Manager Card (BG-0158): the FOUNDER GRANT. Granted once, by the owner.
--
-- WHAT IT DOES
--   Marks the early 2026/27 managers as FOUNDERS on their Manager Cards: every
--   Fantasy team of the season created BEFORE the cut-off that has at least one
--   finished gameweek, for accounts that are not deleted, not staff
--   (app_private.staff_principals), not @botolago.com, and not in the owner's
--   list of extra exclusions. Each founder also gets the permanent card number
--   (BOT #xxxxxx) as the mark is given. A card that already has a founder mark
--   is never changed. The mark is display only: no prize, ranking or Fantasy
--   rule reads it.
--
-- WHEN
--   On or after 1 November 2026. The founder offer is open until the end of
--   31 October 2026 (Moroccan time); the grant must run once, AFTER the offer
--   closes, and never later again. The script refuses to run before the
--   cut-off has passed. Run it after rules v1 is installed
--   (scripts/backend/apply-manager-card-rules-v1.sql); the order is in
--   docs/backend/MANAGER_CARD_OPERATIONS_RUNBOOK.md.
--
-- THE INPUTS (the three lines marked INPUT, in both parts below, kept equal)
--   INPUT 1  season label   '2026/27'
--   INPUT 2  cut-off        '2026-11-01 00:00:00 Africa/Casablanca'
--                           Teams created before this moment qualify, so this
--                           is midnight starting 1 November, Moroccan time. The
--                           zone name is resolved by the database's own
--                           time-zone data; the rehearsal prints the instant it
--                           resolved to in UTC (expected 2026-10-31 23:00:00
--                           UTC while Morocco is on UTC+1). If that is not the
--                           instant you mean, stop and say so.
--   INPUT 3  cohort         2026
--   INPUT 4  excluded users optional list of extra user ids to leave out
--                           (test accounts, friends of the house), default none
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query.
--   2. REHEARSAL (as shipped). Paste this WHOLE file and press Run. It ENDS
--      WITH AN ERROR ON PURPOSE:
--        founder dry run: N managers would be founders (excluded staff and
--        @botolago.com accounts)
--      The error is the result; nothing is saved. Check that N is plausible
--      against the number of qualifying teams, and that
--        select count(*) from app.manager_cards where founder_cohort is not null;
--      still answers 0.
--      If the error starts with "stop:", a safety check fired and nothing was
--      calculated. Do not edit a check to make it pass.
--   3. REAL RUN, only after the rehearsal, in the same session of work: in the
--      file, delete PART 2 (the rehearsal) and remove the leading "-- " from
--      every line of PART 3. Type N from the rehearsal into the line marked
--      "EXPECTED". Press Run. If the grant would mark a different number than
--      you typed, it stops and saves nothing. It saves only at the final commit.
--      Run it ONCE. It is the owner's call; an agent never runs it on its own.
--
-- BEFORE YOU RUN (AGENTS.md, "Before writing")
--   Nothing else may be writing to the card or to Fantasy at that moment. The
--   grant takes the card's advisory lock, so it refuses (manager_card_busy)
--   while the card tick is running; wait for the tick to finish and run again.
--   If compute is already on, that is fine: the grant writes only the card
--   rows and their numbers.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PART 1 + PART 2: guards and REHEARSAL (active). One DO block = one
-- transaction, ended by a deliberate error, so nothing is saved.
-- ---------------------------------------------------------------------------
do $founder_dry_run$
declare
  season_label constant text := '2026/27';                                              -- INPUT 1
  cutoff constant timestamptz := '2026-11-01 00:00:00 Africa/Casablanca'::timestamptz;  -- INPUT 2
  cohort constant smallint := 2026;                                                     -- INPUT 3
  excluded constant uuid[] := '{}'::uuid[];                                             -- INPUT 4
  season_ids uuid[];
  season_id uuid;
  granted integer;
  candidates integer;
begin
  perform set_config('statement_timeout', '5min', true);
  perform set_config('lock_timeout', '10s', true);

  -- Guards
  if to_regprocedure('app_private.manager_card_grant_founder(uuid,timestamptz,smallint,uuid[])') is null
    or to_regclass('app.manager_cards') is null then
    raise exception 'stop: the Manager Card backend is not applied on this database';
  end if;
  if now() < cutoff then
    raise exception 'stop: the founder offer is still open until % (Moroccan time) -- run this on or after that moment',
      to_char(cutoff at time zone 'Africa/Casablanca', 'YYYY-MM-DD HH24:MI');
  end if;
  if cohort is null or cohort < 1 then
    raise exception 'stop: the cohort must be a whole number from 1';
  end if;
  if exists (select 1 from app.manager_cards where founder_cohort = cohort) then
    raise exception 'stop: founders already exist for cohort % -- the grant is run once', cohort;
  end if;
  select array_agg(fs.id) into season_ids
  from app.fantasy_seasons fs
  join app.seasons sn on sn.id = fs.football_season_id
  where sn.label = season_label and fs.status <> 'cancelled';
  if season_ids is null or cardinality(season_ids) <> 1 then
    raise exception 'stop: expected exactly one non-cancelled Fantasy season labelled %, found %',
      season_label, coalesce(cardinality(season_ids), 0);
  end if;
  season_id := season_ids[1];

  select count(distinct team.user_id) into candidates
  from app.fantasy_teams team
  join app.profiles profile on profile.id = team.user_id and profile.deleted_at is null
  where team.fantasy_season_id = season_id and team.created_at < cutoff
    and exists (select 1 from app.fantasy_team_gameweek_results result
      where result.fantasy_team_id = team.id and result.state = 'final');

  -- The real call; the error below rolls it back.
  granted := app_private.manager_card_grant_founder(season_id, cutoff, cohort, excluded);

  raise exception 'founder dry run: % managers would be founders (excluded staff and @botolago.com accounts) -- before those exclusions % managers qualified; cut-off resolved to % UTC; season %; cohort %; nothing was saved',
    granted, candidates, to_char(cutoff at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS'), season_label, cohort;
end
$founder_dry_run$;

-- ---------------------------------------------------------------------------
-- PART 3: the REAL RUN. Commented out on purpose. Use it only after the
-- rehearsal gave a plausible N: delete PART 2 above, remove the leading "-- "
-- from the lines below, type N into the line marked EXPECTED, and run once.
-- The inputs must be the same as in PART 2.
-- ---------------------------------------------------------------------------
-- begin;
--
-- do $founder_real$
-- declare
--   season_label constant text := '2026/27';                                              -- INPUT 1
--   cutoff constant timestamptz := '2026-11-01 00:00:00 Africa/Casablanca'::timestamptz;  -- INPUT 2
--   cohort constant smallint := 2026;                                                     -- INPUT 3
--   excluded constant uuid[] := '{}'::uuid[];                                             -- INPUT 4
--   expected constant integer := NULL;     -- EXPECTED: replace NULL with N from the rehearsal
--   season_ids uuid[];
--   granted integer;
--   marked integer;
--   numbered integer;
-- begin
--   perform set_config('statement_timeout', '5min', true);
--   perform set_config('lock_timeout', '10s', true);
--   if expected is null then
--     raise exception 'stop: type the number from the rehearsal into the line marked EXPECTED';
--   end if;
--   if now() < cutoff then
--     raise exception 'stop: the founder offer is still open until % (Moroccan time) -- run this on or after that moment',
--       to_char(cutoff at time zone 'Africa/Casablanca', 'YYYY-MM-DD HH24:MI');
--   end if;
--   if cohort is null or cohort < 1 then
--     raise exception 'stop: the cohort must be a whole number from 1';
--   end if;
--   if exists (select 1 from app.manager_cards where founder_cohort = cohort) then
--     raise exception 'stop: founders already exist for cohort % -- the grant is run once', cohort;
--   end if;
--   select array_agg(fs.id) into season_ids
--   from app.fantasy_seasons fs
--   join app.seasons sn on sn.id = fs.football_season_id
--   where sn.label = season_label and fs.status <> 'cancelled';
--   if season_ids is null or cardinality(season_ids) <> 1 then
--     raise exception 'stop: expected exactly one non-cancelled Fantasy season labelled %, found %',
--       season_label, coalesce(cardinality(season_ids), 0);
--   end if;
--
--   granted := app_private.manager_card_grant_founder(season_ids[1], cutoff, cohort, excluded);
--   if granted <> expected then
--     raise exception 'stop: the grant would mark % managers, the rehearsal said % -- nothing was saved', granted, expected;
--   end if;
--
--   -- Checks: every founder has a number, the cohort is complete, nobody else changed.
--   select count(*), count(serial) into marked, numbered
--   from app.manager_cards where founder_cohort = cohort;
--   if marked <> granted or numbered <> granted then
--     raise exception 'stop: % founders marked and % numbered, expected % of each -- nothing was saved', marked, numbered, granted;
--   end if;
--   if exists (select 1 from app.manager_cards where founder_cohort is not null and founder_cohort <> cohort) then
--     raise exception 'stop: a card carries a founder cohort other than %', cohort;
--   end if;
--   raise notice 'founder grant: % managers marked as founders of cohort %, each with a number', granted, cohort;
-- end
-- $founder_real$;
--
-- -- Read the notice, then save. To abandon instead, run: rollback;
-- commit;
--
-- select count(*) as founders, count(serial) as with_number
-- from app.manager_cards where founder_cohort is not null;
