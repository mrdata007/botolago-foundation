import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { handleImageStoryRequest } from "../_shared/home-story-generate.ts";
import type { EmailRpcClient } from "../_shared/notification-email-dispatch.ts";
import type { StorageClient } from "../_shared/news-media-upload.ts";

const environment = Deno.env.toObject();
if (!environment.SUPABASE_URL || !environment.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("IMAGE_STORY_DATABASE_CONFIGURATION_MISSING");
const client = createClient(environment.SUPABASE_URL, environment.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
// Custom scheduler-token authentication is verified against the database BEFORE
// claiming a job or spending provider credits. The response acknowledges quickly;
// waitUntil owns the bounded generation work beyond pg_net's request timeout.
Deno.serve((request) =>
  handleImageStoryRequest(request, {
    environment,
    client: client as unknown as EmailRpcClient,
    storage: client.storage as unknown as StorageClient,
    waitUntil: (task) => EdgeRuntime.waitUntil(task),
  }),
);
