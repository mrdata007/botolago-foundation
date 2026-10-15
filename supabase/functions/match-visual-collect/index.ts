import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { handleVisualCollect } from "../_shared/match-visual-collect.ts";
import type { StorageClient } from "../_shared/news-media-upload.ts";
const environment = Deno.env.toObject();
if (!environment.SUPABASE_URL || !environment.SUPABASE_SERVICE_ROLE_KEY)
  throw Error("COLLECTOR_DATABASE_CONFIGURATION_MISSING");
const client = createClient(environment.SUPABASE_URL, environment.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
Deno.serve((request) =>
  handleVisualCollect(request, {
    environment,
    storage: client.storage as unknown as StorageClient,
    serviceRpc: async (name, args) => client.schema("api").rpc(name, args),
    waitUntil: (task) => EdgeRuntime.waitUntil(task),
  }),
);
