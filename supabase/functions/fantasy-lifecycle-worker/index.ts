import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import {
  handleFantasyWorkerRequest,
  type FantasyWorkerRpcClient,
} from "../_shared/fantasy-lifecycle-handler.ts";

// Woken every 10 minutes by pg_cron through pg_net
// (app_private.fantasy_worker_tick) while a gameweek has work, and only while
// the owner has switched it on. Authenticated with the scheduler token, not a
// JWT, so it is deployed with verify_jwt = false (see supabase/config.toml).
// docs/backend/FANTASY_WORKER_SCHEDULE.md
//
// Secrets: BOTOLAGO_SCHEDULER_TOKEN (shared with the other scheduled functions);
// optional FANTASY_WORKER_BUDGET_MS / _MAX_GAMEWEEKS / _MAX_CALLS.

const environment = Deno.env.toObject();
const supabaseUrl = environment.SUPABASE_URL?.trim();
const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("FANTASY_LIFECYCLE_WORKER_DATABASE_CONFIGURATION_MISSING");
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

Deno.serve((request) =>
  handleFantasyWorkerRequest(request, {
    environment,
    client: client as unknown as FantasyWorkerRpcClient,
  }),
);
