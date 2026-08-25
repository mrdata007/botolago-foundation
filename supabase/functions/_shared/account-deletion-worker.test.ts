import { describe, expect, it } from "bun:test";
import {
  AccountDeletionStepError,
  executeAccountDeletionBatch,
  handleAccountDeletionWorkerRequest,
  type AccountDeletionClaim,
  type AccountDeletionGateway,
} from "./account-deletion-worker";

const USER_ID = "a1000000-0000-4000-8000-000000000001";
const REQUEST_ID = "a2000000-0000-4000-8000-000000000001";
const CLAIM_TOKEN = "a3000000-0000-4000-8000-000000000001";
const WORKER_ID = "a4000000-0000-4000-8000-000000000001";
const SECRET = "a".repeat(48);

function gateway(overrides: Partial<AccountDeletionGateway> = {}) {
  const calls: string[] = [];
  const claims: AccountDeletionClaim[] = [
    {
      action: "delete",
      requestId: REQUEST_ID,
      userId: USER_ID,
      claimToken: CLAIM_TOKEN,
    },
    { action: "none" },
  ];
  const value: AccountDeletionGateway = {
    async preview() {
      calls.push("preview");
      return { due: 2, ready: 1, blocked: 1, reconcile: 0 };
    },
    async claim() {
      calls.push("claim");
      return claims.shift() ?? { action: "none" };
    },
    async listAvatarPaths(userId) {
      calls.push("list");
      return [`${userId}/avatar.webp`];
    },
    async deleteAvatarPaths() {
      calls.push("remove");
    },
    async deleteAuthUser() {
      calls.push("delete-auth");
    },
    async finalize() {
      calls.push("finalize");
    },
    async fail() {
      calls.push("fail");
      return { completed: false };
    },
    ...overrides,
  };
  return { value, calls, claims };
}

describe("account deletion batch", () => {
  it("removes known avatars, hard-deletes Auth, then verifies through finalize", async () => {
    const fixture = gateway();
    const result = await executeAccountDeletionBatch(fixture.value, {
      limit: 5,
      leaseSeconds: 120,
      workerId: WORKER_ID,
    });
    expect(fixture.calls).toEqual(["claim", "list", "remove", "delete-auth", "finalize", "claim"]);
    expect(result).toMatchObject({
      completed: 1,
      failed: 0,
      remainingMayExist: false,
    });
  });

  it("fails closed before Auth deletion for an unexpected Storage object", async () => {
    const fixture = gateway({
      async listAvatarPaths(userId) {
        fixture.calls.push("list");
        return [`${userId}/unexpected.txt`];
      },
    });
    const result = await executeAccountDeletionBatch(fixture.value, {
      limit: 1,
      leaseSeconds: 120,
      workerId: WORKER_ID,
    });
    expect(fixture.calls).toEqual(["claim", "list", "fail"]);
    expect(result).toMatchObject({ completed: 0, failed: 1 });
  });

  it("records provider failure and never claims completion from the Auth call alone", async () => {
    const fixture = gateway({
      async deleteAuthUser() {
        fixture.calls.push("delete-auth");
        throw new AccountDeletionStepError("auth_delete_failed");
      },
    });
    const result = await executeAccountDeletionBatch(fixture.value, {
      limit: 1,
      leaseSeconds: 120,
      workerId: WORKER_ID,
    });
    expect(fixture.calls).toEqual(["claim", "list", "remove", "delete-auth", "fail"]);
    expect(result.failed).toBe(1);
  });

  it("reconciles a lost response when the failure RPC verifies Auth is already absent", async () => {
    const fixture = gateway({
      async deleteAuthUser() {
        fixture.calls.push("delete-auth");
        throw new AccountDeletionStepError("auth_delete_failed");
      },
      async fail() {
        fixture.calls.push("fail");
        return { completed: true };
      },
    });
    const result = await executeAccountDeletionBatch(fixture.value, {
      limit: 1,
      leaseSeconds: 120,
      workerId: WORKER_ID,
    });
    expect(result).toMatchObject({ completed: 1, reconciled: 1, failed: 0 });
  });

  it("finalizes an orphaned claimed job without repeating destructive operations", async () => {
    const fixture = gateway();
    fixture.claims.splice(
      0,
      fixture.claims.length,
      {
        action: "finalize",
        requestId: REQUEST_ID,
        userId: USER_ID,
        claimToken: CLAIM_TOKEN,
      },
      { action: "none" },
    );
    const result = await executeAccountDeletionBatch(fixture.value, {
      limit: 2,
      leaseSeconds: 120,
      workerId: WORKER_ID,
    });
    expect(fixture.calls).toEqual(["claim", "finalize", "claim"]);
    expect(result).toMatchObject({ completed: 1, reconciled: 1 });
  });
});

describe("account deletion HTTP boundary", () => {
  it("rejects callers without the dedicated high-entropy worker secret", async () => {
    const fixture = gateway();
    const response = await handleAccountDeletionWorkerRequest(
      new Request("https://example.test", {
        method: "POST",
        body: '{"mode":"dry-run"}',
      }),
      { workerSecret: SECRET, gateway: fixture.value },
    );
    expect(response.status).toBe(401);
    expect(fixture.calls).toEqual([]);
  });

  it("keeps dry-run read-only", async () => {
    const fixture = gateway();
    const response = await handleAccountDeletionWorkerRequest(
      new Request("https://example.test", {
        method: "POST",
        headers: { "x-botolago-account-deletion-key": SECRET },
        body: '{"mode":"dry-run","limit":10}',
      }),
      { workerSecret: SECRET, gateway: fixture.value },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      mode: "dry-run",
      due: 2,
      ready: 1,
      reconcile: 0,
    });
    expect(fixture.calls).toEqual(["preview"]);
  });

  it("requires the exact destructive confirmation", async () => {
    const fixture = gateway();
    const response = await handleAccountDeletionWorkerRequest(
      new Request("https://example.test", {
        method: "POST",
        headers: { "x-botolago-account-deletion-key": SECRET },
        body: '{"mode":"execute"}',
      }),
      { workerSecret: SECRET, gateway: fixture.value },
    );
    expect(response.status).toBe(400);
    expect(fixture.calls).toEqual([]);
  });
});
