-- Give background jobs (service role) 60 seconds per database call instead of the API default.
-- Production: BotolaGO Production V2 (tkewgajrljbwgwedqsxn). Owner-run in the SQL Editor.
--
-- Why (2026-10-12): the Fantasy orchestrator's GW3 scoring save,
-- api.service_persist_fantasy_scoring_results, was cancelled by the statement timeout
-- (SQLSTATE 57014, PostgREST, 13:49:05 UTC) while inserting app.fantasy_player_point_events.
-- The function matches every player result to its snapshot row by scanning the whole
-- results array once per row, so its cost grows with the square of the players scored; GW3,
-- with more matches recorded, crossed the limit. GW1 and GW2 did not.
-- The orchestrator already stops waiting for a call after 60 s (AbortSignal.timeout(60000) in
-- scripts/backend/fantasy-season-orchestrator.ts), so 60 s here matches it.
--
-- Only the service role changes. Visitors (anon) and signed-in users (authenticated) keep their
-- limits. PostgREST applies a role's statement_timeout when it switches to that role, after the
-- reload at the end.
--
-- Step 1, read only: what is set today (rolconfig empty for service_role = it inherits the
-- authenticator's limit).
select rolname, rolconfig from pg_roles
where rolname in ('authenticator', 'service_role', 'authenticated', 'anon')
order by rolname;

-- Step 2: set it and tell PostgREST to reload.
alter role service_role set statement_timeout = '60s';
notify pgrst, 'reload config';

-- Step 3, read back: service_role's rolconfig now shows statement_timeout=60s.
select rolname, rolconfig from pg_roles where rolname = 'service_role';

-- To undo:
--   alter role service_role reset statement_timeout;
--   notify pgrst, 'reload config';
