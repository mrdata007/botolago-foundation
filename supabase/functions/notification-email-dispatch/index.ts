import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import {
  handleEmailDispatchRequest,
  type EmailRpcClient,
} from "../_shared/notification-email-dispatch.ts";
import { renderNotificationEmail, unsubscribeUrl } from "../_shared/notification-email-render.ts";

// Woken by pg_cron through pg_net (app_private.notification_email_tick). The
// caller is authenticated with the scheduler token, not a JWT, so this
// function is deployed with verify_jwt = false (see supabase/config.toml).
//
// Secrets (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY   required; without it the function refuses to claim mail
//   EMAIL_FROM       optional, default "BotolaGO <notifications@botolago.com>"
//   EMAIL_REPLY_TO   optional, default support@botolago.com
//   APP_URL          optional, default https://botolago.com

const environment = Deno.env.toObject();
const supabaseUrl = environment.SUPABASE_URL?.trim();
const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NOTIFICATION_EMAIL_DATABASE_CONFIGURATION_MISSING");
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

Deno.serve((request) =>
  handleEmailDispatchRequest(request, {
    environment,
    client: client as unknown as EmailRpcClient,
    render: renderNotificationEmail,
    unsubscribeUrl,
  }),
);
