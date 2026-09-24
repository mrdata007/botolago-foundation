import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import {
  handleFootballLiveRefreshRequest,
  type LiveRefreshRpcClient,
} from "../_shared/football-live-refresh.ts";

// Woken by pg_cron through pg_net (app_private.football_live_refresh_tick)
// while a match is on. Authenticated with the scheduler token, not a JWT, so
// it is deployed with verify_jwt = false (see supabase/config.toml).
//
// Secrets: SPORTSMONKS_API_TOKEN (already used by football-ingest);
// optional FOOTBALL_LIVE_LEAGUE_ID / FOOTBALL_LIVE_SEASON_ID.

const environment = Deno.env.toObject();
const supabaseUrl = environment.SUPABASE_URL?.trim();
const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("FOOTBALL_LIVE_REFRESH_DATABASE_CONFIGURATION_MISSING");
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

Deno.serve((request) =>
  handleFootballLiveRefreshRequest(request, {
    environment,
    client: client as unknown as LiveRefreshRpcClient,
  }),
);
