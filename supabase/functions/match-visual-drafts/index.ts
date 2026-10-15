import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { handleDraftRequest, type DraftDependencies } from "../_shared/match-visual-drafts.ts";
import type { UserScopedClient } from "../_shared/news-media-upload.ts";
const environment = Deno.env.toObject();
const url = environment.SUPABASE_URL,
  key = environment.SUPABASE_SERVICE_ROLE_KEY,
  anon = environment.SUPABASE_ANON_KEY;
if (!url || !key || !anon) throw Error("DRAFT_DATABASE_CONFIGURATION_MISSING");
const options = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};
const service = createClient(url, key, options);
Deno.serve((request) =>
  handleDraftRequest(request, {
    environment,
    storage: service.storage as unknown as DraftDependencies["storage"],
    createUserClient: (token) =>
      createClient(url, anon, {
        ...options,
        global: { headers: { Authorization: `Bearer ${token}` } },
      }) as unknown as UserScopedClient,
    serviceRpc: async (name, args) => service.schema("api").rpc(name, args),
    waitUntil: (task) => EdgeRuntime.waitUntil(task),
  }),
);
