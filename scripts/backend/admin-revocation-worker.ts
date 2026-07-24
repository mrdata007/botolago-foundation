import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../src/backend/generated/database.types";
import { revocationWorkerHealthSchema } from "../../src/backend/admin/control-plane-contracts";
import {
  SessionRevocationWorker,
  SupabaseAuthAdminInspector,
  SupabaseSessionRevocationQueue,
  type AuthAdminClient,
  type WorkerApiClient,
} from "../../src/backend/admin/session-revocation-worker.server";
import {
  AdminRuntimeError,
  createServerSupabaseFetch,
  isDirectAdminCommand,
  requireServerOnlyKey,
  resolveAdminRuntimeGuard,
  sanitizeOperatorReason,
  type AdminRuntimeGuard,
} from "./admin-runtime";

const replayResultSchema = z.object({
  requestId: z.string().uuid(),
  status: z.literal("pending"),
  correlationId: z.string().uuid(),
});

type RuntimeValues = Readonly<Record<string, string | undefined>>;

export type RevocationWorkerCommand =
  | { readonly mode: "once" }
  | { readonly mode: "status" }
  | { readonly mode: "replay"; readonly requestId: string };

export interface TrustedWorkerApiClient extends WorkerApiClient {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { code?: string; message?: string; details?: string } | null;
  }>;
}

export interface AdminRevocationWorkerDependencies {
  createClients(runtime: RevocationWorkerRuntime): {
    readonly api: TrustedWorkerApiClient;
    readonly authAdmin: AuthAdminClient;
  };
}

export interface RevocationWorkerRuntime {
  readonly guard: AdminRuntimeGuard;
  readonly serviceKey: string;
  readonly workerId: string;
  readonly batchSize: number;
  readonly maxBatches: number;
  readonly leaseSeconds: number;
  readonly syntheticTest: boolean;
}

function integerSetting(
  values: RuntimeValues,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = values[name]?.trim();
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new AdminRuntimeError(`invalid_${name.toLowerCase()}`);
  }
  return parsed;
}

export function parseRevocationWorkerArguments(
  argumentsList: readonly string[],
): RevocationWorkerCommand {
  if (argumentsList.length !== 1) {
    throw new AdminRuntimeError("invalid_revocation_worker_command");
  }
  const argument = argumentsList[0]!;
  if (argument === "--once") return { mode: "once" };
  if (argument === "--status") return { mode: "status" };
  if (argument.startsWith("--replay=")) {
    const requestId = argument.slice("--replay=".length);
    if (!z.string().uuid().safeParse(requestId).success) {
      throw new AdminRuntimeError("invalid_revocation_request_id");
    }
    return { mode: "replay", requestId };
  }
  throw new AdminRuntimeError("invalid_revocation_worker_command");
}

export function resolveRevocationWorkerRuntime(
  values: RuntimeValues = process.env,
): RevocationWorkerRuntime {
  const guard = resolveAdminRuntimeGuard(values, {
    confirmationVariable: "BOTOLAGO_ADMIN_PRODUCTION_CONFIRMATION",
    requiredConfirmation: "RUN_BOTOLAGO_ADMIN_REVOCATION_WORKER_PRODUCTION",
  });
  const serviceKey = requireServerOnlyKey(values, "SUPABASE_SERVICE_ROLE_KEY", guard.environment);
  const workerId =
    values.BOTOLAGO_ADMIN_WORKER_ID?.trim() ?? `manual-${guard.environment}-${crypto.randomUUID()}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/.test(workerId)) {
    throw new AdminRuntimeError("invalid_admin_worker_id");
  }
  return {
    guard,
    serviceKey,
    workerId,
    batchSize: integerSetting(values, "BOTOLAGO_ADMIN_REVOCATION_BATCH_SIZE", 25, 1, 50),
    maxBatches: integerSetting(values, "BOTOLAGO_ADMIN_REVOCATION_MAX_BATCHES", 4, 1, 20),
    leaseSeconds: integerSetting(values, "BOTOLAGO_ADMIN_REVOCATION_LEASE_SECONDS", 120, 30, 600),
    syntheticTest: values.BOTOLAGO_ADMIN_SYNTHETIC_TEST === "true",
  };
}

function createTrustedClient(runtime: RevocationWorkerRuntime) {
  return createClient<Database>(runtime.guard.url, runtime.serviceKey, {
    global: {
      fetch: createServerSupabaseFetch(runtime.serviceKey),
      headers: { "X-Client-Info": "botolago-admin-revocation-worker/2" },
    },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const defaultDependencies: AdminRevocationWorkerDependencies = {
  createClients(runtime) {
    const client = createTrustedClient(runtime);
    return {
      api: client.schema("api") as unknown as TrustedWorkerApiClient,
      authAdmin: client as unknown as AuthAdminClient,
    };
  },
};

export function resolveRevocationReplayReason(values: RuntimeValues = process.env): string {
  if (values.BOTOLAGO_ADMIN_REPLAY_CONFIRMATION !== "REPLAY_ONE_ADMIN_REVOCATION") {
    throw new AdminRuntimeError("revocation_replay_not_confirmed");
  }
  return sanitizeOperatorReason(values.BOTOLAGO_ADMIN_REPLAY_REASON);
}

export async function runAdminRevocationWorker(
  argumentsList: readonly string[] = Bun.argv.slice(2),
  values: RuntimeValues = process.env,
  dependencies: AdminRevocationWorkerDependencies = defaultDependencies,
): Promise<Record<string, unknown>> {
  const command = parseRevocationWorkerArguments(argumentsList);
  const runtime = resolveRevocationWorkerRuntime(values);
  const { api, authAdmin } = dependencies.createClients(runtime);

  if (command.mode === "status") {
    const { data, error } = await api.rpc("admin_get_revocation_worker_runtime_status");
    if (error) throw new AdminRuntimeError("worker_status_unavailable");
    const health = revocationWorkerHealthSchema.parse(data);
    return {
      event: "admin_revocation_worker_status",
      environment: runtime.guard.environment,
      projectRef: runtime.guard.projectRef,
      ...health,
    };
  }

  if (command.mode === "replay") {
    const reason = resolveRevocationReplayReason(values);
    const { data, error } = await api.rpc("admin_replay_session_revocation_dead_letter", {
      p_request_id: command.requestId,
      p_reason: reason,
    });
    if (error) throw new AdminRuntimeError("revocation_replay_rejected");
    const result = replayResultSchema.parse(data);
    return {
      event: "admin_revocation_replay_queued",
      environment: runtime.guard.environment,
      projectRef: runtime.guard.projectRef,
      ...result,
    };
  }

  const worker = new SessionRevocationWorker(
    new SupabaseSessionRevocationQueue(api),
    new SupabaseAuthAdminInspector(authAdmin),
  );
  const result = await worker.run({
    workerId: runtime.workerId,
    batchSize: runtime.batchSize,
    maxBatches: runtime.maxBatches,
    leaseSeconds: runtime.leaseSeconds,
    syntheticTest: runtime.syntheticTest,
  });
  return {
    event: "admin_session_revocation_worker_completed",
    environment: runtime.guard.environment,
    projectRef: runtime.guard.projectRef,
    ...result,
  };
}

if (isDirectAdminCommand(import.meta.url)) {
  runAdminRevocationWorker()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    })
    .catch((error: unknown) => {
      const code =
        error instanceof AdminRuntimeError
          ? error.code
          : error instanceof z.ZodError
            ? "worker_invalid_response"
            : error instanceof Error && "code" in error && typeof error.code === "string"
              ? error.code
              : "worker_unavailable";
      process.stderr.write(
        `${JSON.stringify({ event: "admin_revocation_worker_failed", code })}\n`,
      );
      process.exitCode = code.startsWith("invalid_") ? 2 : 1;
    });
}
