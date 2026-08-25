import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import {
  handleFantasyScoringRequest,
  type FantasyScoringRpcClient,
} from "../_shared/fantasy-scoring-worker.ts";

const environment = Deno.env.toObject();
const supabaseUrl = environment.SUPABASE_URL?.trim() ?? "";
const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
const expectedTriggerSecret = environment.FANTASY_SCORING_WORKER_KEY?.trim() ?? "";

function maxPages(): number {
  const source = environment.FANTASY_SCORING_MAX_PAGES_PER_PHASE?.trim() || "50";
  if (!/^\d+$/.test(source)) throw new Error("FANTASY_SCORING_PAGE_CONFIGURATION_INVALID");
  const parsed = Number(source);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
    throw new Error("FANTASY_SCORING_PAGE_CONFIGURATION_INVALID");
  }
  return parsed;
}

if (!supabaseUrl || serviceRoleKey.length < 32 || expectedTriggerSecret.length < 32) {
  throw new Error("FANTASY_SCORING_DATABASE_CONFIGURATION_MISSING");
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

Deno.serve((request) =>
  handleFantasyScoringRequest(request, {
    client: client as unknown as FantasyScoringRpcClient,
    expectedTriggerSecret,
    maxPagesPerPhase: maxPages(),
  }),
);
