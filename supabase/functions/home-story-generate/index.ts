import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { handleImageStoryRequest } from "../_shared/home-story-generate.ts";
import type { EmailRpcClient } from "../_shared/notification-email-dispatch.ts";
import type { StorageClient } from "../_shared/news-media-upload.ts";
import { MatchVisualError, MAX_VISUAL_BYTES } from "../_shared/precise-match-visual.ts";

const environment = Deno.env.toObject();
if (!environment.SUPABASE_URL || !environment.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("IMAGE_STORY_DATABASE_CONFIGURATION_MISSING");
const client = createClient(environment.SUPABASE_URL, environment.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
// The scheduler token is checked in-process (BOTOLAGO_SCHEDULER_TOKEN) BEFORE
// claiming a job or spending provider credits. The response acknowledges quickly;
// waitUntil owns the bounded generation work beyond pg_net's request timeout.
Deno.serve((request) =>
  handleImageStoryRequest(request, {
    environment,
    client: client as unknown as EmailRpcClient,
    storage: client.storage as unknown as StorageClient,
    waitUntil: (task) => EdgeRuntime.waitUntil(task),
    readVisualAsset: async (path) => {
      // Storage-only approved paths; no fetching arbitrary Instagram URLs or
      // forwarding credentials to a third-party image host.
      const { data, error } = await client.storage.from("news-media").download(path);
      if (error || !data) throw new MatchVisualError("visual_asset_unavailable");
      if (data.size > MAX_VISUAL_BYTES) throw new MatchVisualError("visual_too_large");
      return new Uint8Array(await data.arrayBuffer());
    },
  }),
);
