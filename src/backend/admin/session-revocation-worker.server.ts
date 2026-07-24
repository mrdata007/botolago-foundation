import { z } from "zod";
import { AdminError } from "./errors";

type RpcError = {
  readonly code?: string;
  readonly message?: string;
  readonly details?: string;
};
type RpcResponse = {
  readonly data: unknown;
  readonly error: RpcError | null;
};
export interface WorkerApiClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcResponse>;
}

const workerRunStartSchema = z.object({
  runId: z.string().uuid(),
  correlationId: z.string().uuid(),
  status: z.literal("running"),
  startedAt: z.string().datetime({ offset: true }),
});
const claimSchema = z.object({
  requestId: z.string().uuid(),
  staffPrincipalId: z.string().uuid(),
  authUserId: z.string().uuid(),
  reason: z.string().min(8).max(500),
  attemptCount: z.number().int().positive(),
  maxAttempts: z.number().int().positive(),
  leaseToken: z.string().uuid(),
  leaseExpiresAt: z.string().datetime({ offset: true }),
  correlationId: z.string().uuid(),
  recoveredStaleLease: z.boolean(),
  activeAuthSessionCount: z.number().int().nonnegative(),
});
const malformedClaimLeaseSchema = z.object({
  requestId: z.string().uuid(),
  leaseToken: z.string().uuid(),
  attemptCount: z.number().int().positive(),
  maxAttempts: z.number().int().positive(),
});

export type SessionRevocationClaim = z.infer<typeof claimSchema>;

export interface AuthAdminInspector {
  inspectUser(authUserId: string, signal?: AbortSignal): Promise<"exists" | "missing">;
}

export interface AuthAdminClient {
  auth: {
    admin: {
      getUserById(authUserId: string): Promise<{
        data: { user: { id: string } | null };
        error: { status?: number; code?: string; message?: string } | null;
      }>;
    };
  };
}

export class RevocationProcessingError extends Error {
  constructor(
    readonly code: string,
    readonly summary: string,
    readonly retryable: boolean,
  ) {
    super(summary);
    this.name = "RevocationProcessingError";
  }
}

function classifyAuthAdminError(error: {
  status?: number;
  code?: string;
}): RevocationProcessingError {
  const status = error.status ?? 0;
  const providerCode = (error.code ?? "").toLowerCase();
  if (status === 404 || providerCode.includes("not_found")) {
    return new RevocationProcessingError(
      "auth_user_not_found",
      "The Auth user no longer exists.",
      false,
    );
  }
  if (status === 429) {
    return new RevocationProcessingError(
      "auth_admin_rate_limited",
      "Auth Admin temporarily rate limited the worker.",
      true,
    );
  }
  if (status >= 500 || status === 0) {
    return new RevocationProcessingError(
      "auth_admin_unavailable",
      "Auth Admin is temporarily unavailable.",
      true,
    );
  }
  return new RevocationProcessingError(
    "auth_admin_configuration_denied",
    "Auth Admin rejected the trusted worker configuration.",
    false,
  );
}

export class SupabaseAuthAdminInspector implements AuthAdminInspector {
  constructor(private readonly client: AuthAdminClient) {}

  async inspectUser(authUserId: string, signal?: AbortSignal): Promise<"exists" | "missing"> {
    if (signal?.aborted) {
      throw new RevocationProcessingError(
        "worker_cancelled",
        "The trusted worker invocation was cancelled.",
        true,
      );
    }
    let response: Awaited<ReturnType<AuthAdminClient["auth"]["admin"]["getUserById"]>>;
    try {
      response = await this.client.auth.admin.getUserById(authUserId);
    } catch {
      throw new RevocationProcessingError(
        "auth_admin_unavailable",
        "Auth Admin is temporarily unavailable.",
        true,
      );
    }
    if (response.error) {
      const classified = classifyAuthAdminError(response.error);
      if (classified.code === "auth_user_not_found") return "missing";
      throw classified;
    }
    if (!response.data.user) return "missing";
    if (response.data.user.id !== authUserId) {
      throw new RevocationProcessingError(
        "auth_admin_identity_mismatch",
        "Auth Admin returned an unexpected user identity.",
        false,
      );
    }
    return "exists";
  }
}

export class SupabaseSessionRevocationQueue {
  constructor(private readonly api: WorkerApiClient) {}

  async start(workerId: string, syntheticTest: boolean) {
    const { data, error } = await this.api.rpc("admin_start_session_revocation_worker", {
      p_worker_id: workerId,
      p_synthetic_test: syntheticTest,
    });
    if (error) throw mapWorkerRpcError(error);
    return workerRunStartSchema.parse(data);
  }

  async claim(runId: string, workerId: string, limit: number, leaseSeconds: number) {
    const { data, error } = await this.api.rpc("admin_claim_session_revocations_v2", {
      p_worker_run_id: runId,
      p_worker_id: workerId,
      p_limit: limit,
      p_lease_seconds: leaseSeconds,
    });
    if (error) throw mapWorkerRpcError(error);
    if (!Array.isArray(data)) {
      throw new RevocationProcessingError(
        "malformed_outbox_batch",
        "The revocation outbox returned a malformed batch.",
        false,
      );
    }
    return data;
  }

  async complete(
    claim: SessionRevocationClaim,
    resultCode: "privileged_access_revoked" | "already_invalidated" | "user_not_found",
  ) {
    const { error } = await this.api.rpc("admin_complete_session_revocation_v2", {
      p_request_id: claim.requestId,
      p_lease_token: claim.leaseToken,
      p_result_code: resultCode,
    });
    if (error) throw mapWorkerRpcError(error);
  }

  async fail(claim: SessionRevocationClaim, failure: RevocationProcessingError) {
    const { error } = await this.api.rpc("admin_fail_session_revocation", {
      p_request_id: claim.requestId,
      p_lease_token: claim.leaseToken,
      p_error_code: failure.code,
      p_error_summary: failure.summary,
      p_retryable: failure.retryable,
    });
    if (error) throw mapWorkerRpcError(error);
  }

  async failMalformed(
    rawClaim: unknown,
    failure: RevocationProcessingError,
  ): Promise<"failed" | "unaddressable"> {
    const lease = malformedClaimLeaseSchema.safeParse(rawClaim);
    if (!lease.success) return "unaddressable";
    const { error } = await this.api.rpc("admin_fail_session_revocation", {
      p_request_id: lease.data.requestId,
      p_lease_token: lease.data.leaseToken,
      p_error_code: failure.code,
      p_error_summary: failure.summary,
      p_retryable: false,
    });
    if (error) throw mapWorkerRpcError(error);
    return "failed";
  }

  async finish(
    runId: string,
    status: "succeeded" | "partial_failure" | "failed",
    errorCode: string | null,
  ) {
    const { error } = await this.api.rpc("admin_finish_session_revocation_worker", {
      p_worker_run_id: runId,
      p_status: status,
      p_error_code: errorCode ?? undefined,
    });
    if (error) throw mapWorkerRpcError(error);
  }
}

function mapWorkerRpcError(error: RpcError): RevocationProcessingError {
  const normalized = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  const permanent =
    normalized.includes("worker_unavailable") ||
    normalized.includes("revocation_permanent_failure") ||
    normalized.includes("42501") ||
    normalized.includes("pt403");
  return new RevocationProcessingError(
    permanent ? "worker_configuration_denied" : "worker_database_unavailable",
    permanent
      ? "The trusted worker database contract rejected this invocation."
      : "The trusted worker database contract is temporarily unavailable.",
    !permanent,
  );
}

function normalizeFailure(error: unknown): RevocationProcessingError {
  if (error instanceof RevocationProcessingError) return error;
  if (error instanceof z.ZodError) {
    return new RevocationProcessingError(
      "malformed_outbox_record",
      "The revocation outbox record is malformed.",
      false,
    );
  }
  return new RevocationProcessingError(
    "auth_admin_unavailable",
    "Auth Admin is temporarily unavailable.",
    true,
  );
}

export interface SessionRevocationWorkerOptions {
  readonly workerId: string;
  readonly batchSize: number;
  readonly maxBatches: number;
  readonly leaseSeconds: number;
  readonly syntheticTest: boolean;
}

export interface SessionRevocationWorkerResult {
  readonly runId: string;
  readonly claimed: number;
  readonly completed: number;
  readonly retried: number;
  readonly deadLettered: number;
  readonly missingUsers: number;
  readonly alreadyInvalidated: number;
}

export class SessionRevocationWorker {
  constructor(
    private readonly queue: SupabaseSessionRevocationQueue,
    private readonly authAdmin: AuthAdminInspector,
  ) {}

  async run(
    options: SessionRevocationWorkerOptions,
    signal?: AbortSignal,
  ): Promise<SessionRevocationWorkerResult> {
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/.test(options.workerId) ||
      options.batchSize < 1 ||
      options.batchSize > 50 ||
      options.maxBatches < 1 ||
      options.maxBatches > 20 ||
      options.leaseSeconds < 30 ||
      options.leaseSeconds > 600
    ) {
      throw new AdminError("worker_unavailable", "The worker configuration is invalid.");
    }

    const run = await this.queue.start(options.workerId, options.syntheticTest);
    const totals = {
      claimed: 0,
      completed: 0,
      retried: 0,
      deadLettered: 0,
      missingUsers: 0,
      alreadyInvalidated: 0,
    };
    let runFailureCode: string | null = null;

    try {
      for (let batch = 0; batch < options.maxBatches; batch += 1) {
        if (signal?.aborted) {
          runFailureCode = "worker_cancelled";
          break;
        }
        const rawClaims = await this.queue.claim(
          run.runId,
          options.workerId,
          options.batchSize,
          options.leaseSeconds,
        );
        if (rawClaims.length === 0) break;

        for (const rawClaim of rawClaims) {
          totals.claimed += 1;
          const parsed = claimSchema.safeParse(rawClaim);
          if (!parsed.success) {
            runFailureCode = "malformed_outbox_record";
            const outcome = await this.queue.failMalformed(
              rawClaim,
              new RevocationProcessingError(
                "malformed_outbox_record",
                "The revocation outbox record is malformed.",
                false,
              ),
            );
            if (outcome === "failed") totals.deadLettered += 1;
            continue;
          }
          const claim = parsed.data;
          try {
            const userState = await this.authAdmin.inspectUser(claim.authUserId, signal);
            if (userState === "missing") {
              await this.queue.complete(claim, "user_not_found");
              totals.missingUsers += 1;
            } else if (claim.activeAuthSessionCount === 0) {
              await this.queue.complete(claim, "already_invalidated");
              totals.alreadyInvalidated += 1;
            } else {
              // Canonical Admin authority was synchronously revoked before this
              // outbox record was created. Supported Auth Admin currently has
              // no user-ID global sign-out operation, so this result records
              // completion of privileged-session invalidation without
              // pretending the consumer Auth session was deleted.
              await this.queue.complete(claim, "privileged_access_revoked");
            }
            totals.completed += 1;
          } catch (error) {
            const failure = normalizeFailure(error);
            await this.queue.fail(claim, failure);
            if (failure.retryable && claim.attemptCount < claim.maxAttempts) {
              totals.retried += 1;
            } else {
              totals.deadLettered += 1;
            }
            runFailureCode ??= failure.code;
          }
        }

        if (rawClaims.length < options.batchSize) break;
      }

      const status =
        runFailureCode === null ? "succeeded" : totals.completed > 0 ? "partial_failure" : "failed";
      await this.queue.finish(run.runId, status, runFailureCode);
      return { runId: run.runId, ...totals };
    } catch (error) {
      const failure = normalizeFailure(error);
      await this.queue.finish(run.runId, "failed", failure.code).catch(() => undefined);
      throw failure;
    }
  }
}
