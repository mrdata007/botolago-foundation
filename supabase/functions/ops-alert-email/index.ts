import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { handleOpsAlertEmailRequest } from "../_shared/ops-alert-email.ts";
import type { EmailRpcClient } from "../_shared/notification-email-dispatch.ts";

// Woken by pg_net from app_private.ops_alert_tick / ops_alert_test with the
// scheduler token, not a JWT, so it is deployed with verify_jwt = false (see
// supabase/config.toml). It mails only the address stored in the database.
//
// Secrets (Supabase → Edge Functions → Secrets), shared with
// notification-email-dispatch:
//   RESEND_API_KEY   required
//   EMAIL_FROM       optional, default "BotolaGO <notifications@botolago.com>"
//   EMAIL_REPLY_TO   optional, default support@botolago.com

const environment = Deno.env.toObject();
const supabaseUrl = environment.SUPABASE_URL?.trim();
const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("OPS_ALERT_EMAIL_DATABASE_CONFIGURATION_MISSING");
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

Deno.serve((request) =>
  handleOpsAlertEmailRequest(request, {
    environment,
    client: client as unknown as EmailRpcClient,
  }),
);
