import { describe, expect, it } from "bun:test";
import type { AuthAdminClient } from "../../src/backend/admin/session-revocation-worker.server";
import {
  parseRevocationWorkerArguments,
  resolveRevocationReplayReason,
  resolveRevocationWorkerRuntime,
  runAdminRevocationWorker,
  type AdminRevocationWorkerDependencies,
  type TrustedWorkerApiClient,
} from "./admin-revocation-worker";

const PROJECT_REF = "srdrflfrfpwixsllveid";
const BASE_ENV = {
  BOTOLAGO_ADMIN_ENVIRONMENT: "staging",
  BOTOLAGO_ADMIN_EXPECTED_PROJECT_REF: PROJECT_REF,
  SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_runtime_only",
  BOTOLAGO_ADMIN_WORKER_ID: "phase7d.manual-worker",
};

function dependencies(rpc: TrustedWorkerApiClient["rpc"]): AdminRevocationWorkerDependencies {
  return {
    createClients: () => ({
      api: { rpc },
      authAdmin: {
        auth: {
          admin: {
            getUserById: async () => ({ data: { user: null }, error: null }),
          },
        },
      } as AuthAdminClient,
    }),
  };
}

describe("Admin revocation worker command", () => {
  it("accepts only status, one bounded run, or one UUID replay", () => {
    expect(parseRevocationWorkerArguments(["--status"])).toEqual({ mode: "status" });
    expect(parseRevocationWorkerArguments(["--once"])).toEqual({ mode: "once" });
    expect(
      parseRevocationWorkerArguments(["--replay=b1000000-0000-4000-8000-000000000001"]),
    ).toEqual({
      mode: "replay",
      requestId: "b1000000-0000-4000-8000-000000000001",
    });
    expect(() => parseRevocationWorkerArguments([])).toThrow("invalid_revocation_worker_command");
    expect(() => parseRevocationWorkerArguments(["--replay=not-a-uuid"])).toThrow(
      "invalid_revocation_request_id",
    );
  });

  it("enforces bounded worker settings and rejects the wrong environment", () => {
    expect(resolveRevocationWorkerRuntime(BASE_ENV)).toMatchObject({
      workerId: "phase7d.manual-worker",
      batchSize: 25,
      maxBatches: 4,
      leaseSeconds: 120,
      syntheticTest: false,
    });
    expect(() =>
      resolveRevocationWorkerRuntime({
        ...BASE_ENV,
        BOTOLAGO_ADMIN_REVOCATION_BATCH_SIZE: "51",
      }),
    ).toThrow("invalid_botolago_admin_revocation_batch_size");
    expect(() =>
      resolveRevocationWorkerRuntime({
        ...BASE_ENV,
        BOTOLAGO_ADMIN_EXPECTED_PROJECT_REF: "differentproject0001",
      }),
    ).toThrow("admin_project_ref_mismatch");
  });

  it("returns only bounded sanitized status data", async () => {
    const result = await runAdminRevocationWorker(
      ["--status"],
      BASE_ENV,
      dependencies(async (name) => {
        expect(name).toBe("admin_get_revocation_worker_runtime_status");
        return {
          data: {
            queue: { pending: 1, processing: 0, retrying: 0, deadLetter: 0 },
            runs: [],
          },
          error: null,
        };
      }),
    );
    expect(result).toMatchObject({
      event: "admin_revocation_worker_status",
      projectRef: PROJECT_REF,
      queue: { pending: 1 },
    });
    expect(JSON.stringify(result)).not.toMatch(/sb_secret_|password|access.?token|refresh.?token/i);
  });

  it("requires explicit one-record replay confirmation and a safe reason", async () => {
    expect(() => resolveRevocationReplayReason(BASE_ENV)).toThrow(
      "revocation_replay_not_confirmed",
    );
    const replayEnv = {
      ...BASE_ENV,
      BOTOLAGO_ADMIN_REPLAY_CONFIRMATION: "REPLAY_ONE_ADMIN_REVOCATION",
      BOTOLAGO_ADMIN_REPLAY_REASON: "Replay after reviewed provider recovery.",
    };
    expect(resolveRevocationReplayReason(replayEnv)).toBe(
      "Replay after reviewed provider recovery.",
    );
    const result = await runAdminRevocationWorker(
      ["--replay=b1000000-0000-4000-8000-000000000001"],
      replayEnv,
      dependencies(async (name, args) => {
        expect(name).toBe("admin_replay_session_revocation_dead_letter");
        expect(args).toEqual({
          p_request_id: "b1000000-0000-4000-8000-000000000001",
          p_reason: "Replay after reviewed provider recovery.",
        });
        return {
          data: {
            requestId: "b1000000-0000-4000-8000-000000000001",
            status: "pending",
            correlationId: "b2000000-0000-4000-8000-000000000001",
          },
          error: null,
        };
      }),
    );
    expect(result.event).toBe("admin_revocation_replay_queued");
  });

  it("keeps production fail-closed without its exact confirmation", () => {
    expect(() =>
      resolveRevocationWorkerRuntime({
        ...BASE_ENV,
        BOTOLAGO_ADMIN_ENVIRONMENT: "production",
      }),
    ).toThrow("production_not_authorized");
  });
});
