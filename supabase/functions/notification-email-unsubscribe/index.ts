import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import {
  handleEmailUnsubscribeRequest,
  type UnsubscribeRpcClient,
} from "../_shared/notification-email-unsubscribe.ts";

// The List-Unsubscribe target of every notification email (RFC 8058 one-click).
// Mail providers call it without any credentials, so it is deployed with
// verify_jwt = false (see supabase/config.toml); the per-email token is the
// only authority, and it can only ever turn email OFF.

const environment = Deno.env.toObject();
const supabaseUrl = environment.SUPABASE_URL?.trim();
const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NOTIFICATION_EMAIL_UNSUBSCRIBE_CONFIGURATION_MISSING");
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

Deno.serve((request) =>
  handleEmailUnsubscribeRequest(request, {
    environment,
    client: client as unknown as UnsubscribeRpcClient,
  }),
);
