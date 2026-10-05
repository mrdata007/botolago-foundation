import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import {
  handlePushDispatchRequest,
  type PushRpcClient,
} from "../_shared/notification-push-dispatch.ts";

// Sends the push notifications the database has queued (Android through
// Google's FCM, iPhone through Apple's APNs). Woken by pg_cron through pg_net,
// authenticated with the scheduler token, not a JWT, so this function is
// deployed with verify_jwt = false (see supabase/config.toml).
//
// Secrets (Supabase → Edge Functions → Secrets). A provider without its
// secrets is simply not used: its pushes wait, and the response names it.
//   FCM_SERVICE_ACCOUNT_JSON  Google service-account key (JSON) for FCM
//   APNS_KEY_P8               Apple push key (.p8 file contents)
//   APNS_KEY_ID               its 10-character key id
//   APNS_TEAM_ID              the Apple developer team id
//   APNS_BUNDLE_ID            the app's bundle id (the apns-topic)
//   APNS_ENVIRONMENT          optional: "production" (default) or "sandbox"
//   PUSH_BATCH_SIZE / PUSH_BUDGET_MS / PUSH_CONCURRENCY   optional tuning

const environment = Deno.env.toObject();
const supabaseUrl = environment.SUPABASE_URL?.trim();
const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NOTIFICATION_PUSH_DATABASE_CONFIGURATION_MISSING");
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

Deno.serve((request) =>
  handlePushDispatchRequest(request, {
    environment,
    client: client as unknown as PushRpcClient,
  }),
);
