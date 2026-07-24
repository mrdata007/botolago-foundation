import { describe, expect, it } from "bun:test";
import {
  RevocationProcessingError,
  SessionRevocationWorker,
  SupabaseAuthAdminInspector,
  SupabaseSessionRevocationQueue,
  type AuthAdminClient,
  type AuthAdminInspector,
  type WorkerApiClient,
} from "./session-revocation-worker.server";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const PRINCIPAL_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "44444444-4444-4444-8444-444444444444";
const LEASE_ID = "55555555-5555-4555-8555-555555555555";
const CORRELATION_ID = "66666666-6666-4666-8666-666666666666";

function claim(overrides: Record<string, unknown> = {}) {
  return {
    requestId: REQUEST_ID,
    staffPrincipalId: PRINCIPAL_ID,
    authUserId: USER_ID,
    reason: "Invalidate privileged access after a sensitive staff change.",
    attemptCount: 1,
    maxAttempts: 5,
    leaseToken: LEASE_ID,
    leaseExpiresAt: "2026-07-24T18:00:00.000Z",
    correlationId: CORRELATION_ID,
    recoveredStaleLease: false,
    activeAuthSessionCount: 1,
    ...overrides,
  };
}

class FakeRpcClient implements WorkerApiClient {
  readonly calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  claims: unknown[] = [claim()];

  async rpc(name: string, args?: Record<string, unknown>) {
    this.calls.push({ name, args });
    if (name === "admin_start_session_revocation_worker") {
      return {
        data: {
          runId: RUN_ID,
          correlationId: CORRELATION_ID,
          status: "running",
          startedAt: "2026-07-24T17:00:00.000Z",
        },
        error: null,
      };
    }
    if (name === "admin_claim_session_revocations_v2") {
      const current = this.claims;
      this.claims = [];
      return { data: current, error: null };
    }
    return { data: {}, error: null };
  }
}

function options() {
  return {
    workerId: "phase7b.test-worker",
    batchSize: 25,
    maxBatches: 2,
    leaseSeconds: 120,
    syntheticTest: true,
  };
}

describe("Admin session-revocation worker", () => {
  it("completes a claimed live-user request exactly once", async () => {
    const rpc = new FakeRpcClient();
    const auth: AuthAdminInspector = { inspectUser: async () => "exists" };
    const result = await new SessionRevocationWorker(
      new SupabaseSessionRevocationQueue(rpc),
      auth,
    ).run(options());
    expect(result.claimed).toBe(1);
    expect(result.completed).toBe(1);
    const completes = rpc.calls.filter(
      (call) => call.name === "admin_complete_session_revocation_v2",
    );
    expect(completes).toHaveLength(1);
    expect(completes[0]?.args?.p_result_code).toBe("privileged_access_revoked");
  });

  it("distinguishes missing users and already-invalidated sessions", async () => {
    const missingRpc = new FakeRpcClient();
    const missing = await new SessionRevocationWorker(
      new SupabaseSessionRevocationQueue(missingRpc),
      { inspectUser: async () => "missing" },
    ).run(options());
    expect(missing.missingUsers).toBe(1);
    expect(
      missingRpc.calls.find((call) => call.name.includes("complete"))?.args?.p_result_code,
    ).toBe("user_not_found");

    const invalidatedRpc = new FakeRpcClient();
    invalidatedRpc.claims = [claim({ activeAuthSessionCount: 0 })];
    const invalidated = await new SessionRevocationWorker(
      new SupabaseSessionRevocationQueue(invalidatedRpc),
      { inspectUser: async () => "exists" },
    ).run(options());
    expect(invalidated.alreadyInvalidated).toBe(1);
  });

  it("schedules temporary failures and dead-letters permanent failures", async () => {
    const retryRpc = new FakeRpcClient();
    const retry = await new SessionRevocationWorker(new SupabaseSessionRevocationQueue(retryRpc), {
      inspectUser: async () => {
        throw new RevocationProcessingError(
          "auth_admin_rate_limited",
          "Auth Admin temporarily rate limited the worker.",
          true,
        );
      },
    }).run(options());
    expect(retry.retried).toBe(1);
    expect(
      retryRpc.calls.find((call) => call.name === "admin_fail_session_revocation")?.args
        ?.p_retryable,
    ).toBe(true);

    const permanentRpc = new FakeRpcClient();
    const permanent = await new SessionRevocationWorker(
      new SupabaseSessionRevocationQueue(permanentRpc),
      {
        inspectUser: async () => {
          throw new RevocationProcessingError(
            "auth_admin_configuration_denied",
            "Auth Admin rejected the trusted worker configuration.",
            false,
          );
        },
      },
    ).run(options());
    expect(permanent.deadLettered).toBe(1);
  });

  it("dead-letters an addressable malformed outbox record without tokens", async () => {
    const rpc = new FakeRpcClient();
    rpc.claims = [
      {
        requestId: REQUEST_ID,
        leaseToken: LEASE_ID,
        attemptCount: 1,
        maxAttempts: 5,
        unexpected: "shape",
      },
    ];
    const result = await new SessionRevocationWorker(new SupabaseSessionRevocationQueue(rpc), {
      inspectUser: async () => "exists",
    }).run(options());
    expect(result.deadLettered).toBe(1);
    const serialized = JSON.stringify(rpc.calls);
    expect(serialized).not.toContain("accessToken");
    expect(serialized).not.toContain("refreshToken");
  });

  it("classifies supported Auth Admin responses without exposing raw errors", async () => {
    const client: AuthAdminClient = {
      auth: {
        admin: {
          getUserById: async () => ({
            data: { user: null },
            error: { status: 429, code: "rate_limit", message: "raw provider detail" },
          }),
        },
      },
    };
    try {
      await new SupabaseAuthAdminInspector(client).inspectUser(USER_ID);
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(RevocationProcessingError);
      expect((error as Error).message).not.toContain("raw provider detail");
    }
  });
});
