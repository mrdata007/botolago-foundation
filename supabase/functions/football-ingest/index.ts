import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import {
  handleSportsMonksCatalogRequest,
  type CatalogRpcClient,
} from "../_shared/sportsmonks-catalog.ts";
import {
  handleSportsMonksFixtureRequest,
  type FixtureRpcClient,
} from "../_shared/sportsmonks-fixtures.ts";

const environment = Deno.env.toObject();
const supabaseUrl = environment.SUPABASE_URL?.trim();
const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("FOOTBALL_INGESTION_DATABASE_CONFIGURATION_MISSING");
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

Deno.serve((request) => {
  if (request.headers.get("x-botolago-ingestion-job") === "fixtures") {
    return handleSportsMonksFixtureRequest(request, {
      environment,
      client: client as unknown as FixtureRpcClient,
    });
  }
  return handleSportsMonksCatalogRequest(request, {
    environment,
    client: client as unknown as CatalogRpcClient,
  });
});
