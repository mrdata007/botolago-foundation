import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import {
  AccountDeletionStepError,
  handleAccountDeletionWorkerRequest,
  MAX_AVATAR_OBJECTS_PER_USER,
  type AccountDeletionClaim,
  type AccountDeletionFailureCode,
  type AccountDeletionGateway,
  type AccountDeletionPreview,
} from "../_shared/account-deletion-worker.ts";

const environment = Deno.env.toObject();
const supabaseUrl = environment.SUPABASE_URL?.trim();
const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
const workerSecret = environment.ACCOUNT_DELETION_WORKER_KEY?.trim();

if (
  !supabaseUrl ||
  !serviceRoleKey ||
  serviceRoleKey.length < 32 ||
  !workerSecret ||
  workerSecret.length < 32
) {
  throw new Error("ACCOUNT_DELETION_WORKER_CONFIGURATION_MISSING");
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: { headers: { "x-client-info": "botolago-account-deletion-worker/1" } },
});
const api = client.schema("api");

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AccountDeletionStepError("unexpected_worker_failure");
  }
  return value as Record<string, unknown>;
}

const gateway: AccountDeletionGateway = {
  async preview(limit): Promise<AccountDeletionPreview> {
    const { data, error } = await api.rpc("account_deletion_worker_preview", { p_limit: limit });
    if (error) throw new AccountDeletionStepError("unexpected_worker_failure");
    const result = objectValue(data);
    if (
      typeof result.due !== "number" ||
      typeof result.ready !== "number" ||
      typeof result.blocked !== "number" ||
      typeof result.reconcile !== "number" ||
      !Number.isSafeInteger(result.due) ||
      !Number.isSafeInteger(result.ready) ||
      !Number.isSafeInteger(result.blocked) ||
      !Number.isSafeInteger(result.reconcile)
    ) {
      throw new AccountDeletionStepError("unexpected_worker_failure");
    }
    return {
      due: result.due as number,
      ready: result.ready as number,
      blocked: result.blocked as number,
      reconcile: result.reconcile as number,
    };
  },

  async claim(workerId, leaseSeconds): Promise<AccountDeletionClaim> {
    const { data, error } = await api.rpc("account_deletion_worker_claim", {
      p_worker_id: workerId,
      p_lease_seconds: leaseSeconds,
    });
    if (error) throw new AccountDeletionStepError("unexpected_worker_failure");
    const result = objectValue(data);
    if (result.action === "none" || result.action === "blocked") {
      return { action: result.action };
    }
    if (
      (result.action === "delete" || result.action === "finalize") &&
      typeof result.requestId === "string" &&
      typeof result.userId === "string" &&
      typeof result.claimToken === "string"
    ) {
      return {
        action: result.action,
        requestId: result.requestId,
        userId: result.userId,
        claimToken: result.claimToken,
      };
    }
    throw new AccountDeletionStepError("unexpected_worker_failure");
  },

  async listAvatarPaths(userId) {
    const { data, error } = await client.storage.from("avatars").list(userId, {
      limit: MAX_AVATAR_OBJECTS_PER_USER + 1,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new AccountDeletionStepError("avatar_list_failed");
    if (data.length > MAX_AVATAR_OBJECTS_PER_USER) {
      throw new AccountDeletionStepError("avatar_limit_exceeded");
    }
    if (data.some((entry) => !entry.id || !entry.name || entry.name.includes("/"))) {
      throw new AccountDeletionStepError("avatar_shape_unexpected");
    }
    return data.map((entry) => `${userId}/${entry.name}`);
  },

  async deleteAvatarPaths(paths) {
    const { error } = await client.storage.from("avatars").remove([...paths]);
    if (error) throw new AccountDeletionStepError("avatar_delete_failed");
  },

  async deleteAuthUser(userId) {
    const { error } = await client.auth.admin.deleteUser(userId, false);
    if (error) throw new AccountDeletionStepError("auth_delete_failed");
  },

  async finalize(requestId, claimToken) {
    const { data, error } = await api.rpc("account_deletion_worker_finalize", {
      p_request_id: requestId,
      p_claim_token: claimToken,
    });
    if (error || data !== true) {
      throw new AccountDeletionStepError("unexpected_worker_failure");
    }
  },

  async fail(requestId, claimToken, code: AccountDeletionFailureCode) {
    const { data, error } = await api.rpc("account_deletion_worker_fail", {
      p_request_id: requestId,
      p_claim_token: claimToken,
      p_error_code: code,
    });
    if (error) throw new AccountDeletionStepError("failure_record_unavailable");
    const result = objectValue(data);
    if (typeof result.completed !== "boolean") {
      throw new AccountDeletionStepError("failure_record_unavailable");
    }
    return { completed: result.completed };
  },
};

Deno.serve((request) =>
  handleAccountDeletionWorkerRequest(request, {
    workerSecret,
    gateway,
  }),
);
