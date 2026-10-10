import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { handleAiContentRequest } from "../_shared/ai-content.ts";
import type { EmailRpcClient } from "../_shared/notification-email-dispatch.ts";

// Woken by pg_cron through pg_net (app_private.ai_content_tick) with the
// scheduler token, not a JWT, so it is deployed with verify_jwt = false (see
// supabase/config.toml).
//
// Secrets (Supabase → Edge Functions → Secrets):
//   OPENAI_KEY       required
//   AI_CONTENT_MODEL optional, default gpt-4o (must support JSON mode)
//   RESEND_API_KEY   required for the owner email (shared with the other
//                    email functions; EMAIL_FROM / EMAIL_REPLY_TO optional)

const environment = Deno.env.toObject();
const supabaseUrl = environment.SUPABASE_URL?.trim();
const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("AI_CONTENT_DATABASE_CONFIGURATION_MISSING");
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

Deno.serve((request) =>
  handleAiContentRequest(request, {
    environment,
    client: client as unknown as EmailRpcClient,
  }),
);
