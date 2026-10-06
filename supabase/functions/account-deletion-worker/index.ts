import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import {
  handleAccountDeletionRequest,
  type AvatarStore,
} from "../_shared/account-deletion-worker.ts";
import type { EmailRpcClient } from "../_shared/notification-email-dispatch.ts";

// Erases the accounts whose deletion has fallen due (migration
// 20261006143700_account_deletion_automatic; docs/backend/
// ACCOUNT_DELETION_RUNBOOK.md). Woken by pg_cron through pg_net with the
// scheduler token, not a JWT, so it is deployed with verify_jwt = false (see
// supabase/config.toml). It claims nothing while
// app_private.account_deletion_settings is off, which is how it ships.
//
// Secrets (Supabase → Edge Functions → Secrets), shared with
// notification-email-dispatch, for the confirmation e-mail only; without
// RESEND_API_KEY accounts are still erased, just not confirmed by e-mail:
//   RESEND_API_KEY   the Resend key
//   EMAIL_FROM       optional, default "BotolaGO <notifications@botolago.com>"
//   EMAIL_REPLY_TO   optional, default support@botolago.com

const environment = Deno.env.toObject();
const supabaseUrl = environment.SUPABASE_URL?.trim();
const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("ACCOUNT_DELETION_DATABASE_CONFIGURATION_MISSING");
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const bucket = () => client.storage.from("avatars");

const avatars: AvatarStore = {
  async list(folder) {
    const { data, error } = await bucket().list(folder, { limit: 100 });
    if (error) throw new Error("avatar_list_failed");
    return (data ?? []).map((entry) => entry.name);
  },
  async remove(paths) {
    const { error } = await bucket().remove(paths);
    if (error) throw new Error("avatar_remove_failed");
  },
};

Deno.serve((request) =>
  handleAccountDeletionRequest(request, {
    environment,
    client: client as unknown as EmailRpcClient,
    avatars,
  }),
);
