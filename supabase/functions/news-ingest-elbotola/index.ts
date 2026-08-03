import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { handleElbotolaRequest, type ElbotolaRpcClient } from "../_shared/elbotola.ts";

const environment = Deno.env.toObject();
const supabaseUrl = environment.SUPABASE_URL?.trim();
const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("ELBOTOLA_INGESTION_DATABASE_CONFIGURATION_MISSING");
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

Deno.serve((request) =>
  handleElbotolaRequest(request, {
    environment,
    client: client as unknown as ElbotolaRpcClient,
  }),
);
