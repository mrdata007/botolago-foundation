import { describe, expect, it } from "bun:test";
import type { RepositoryContext } from "@/backend/contracts/repository";
import { AdminError } from "./errors";
import { SupabaseAdminControlPlaneRepository } from "./supabase-control-plane-repository";

function request<T>(
  value: T,
  onAbort?: (signal: AbortSignal) => void,
): PromiseLike<T> & { abortSignal(signal: AbortSignal): PromiseLike<T> } {
  return {
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
    abortSignal(signal) {
      onAbort?.(signal);
      return Promise.resolve(value);
    },
  };
}

function actor(signal?: AbortSignal): RepositoryContext {
  return {
    actorId: "11111111-1111-4111-8111-111111111111",
    requestId: "22222222-2222-4222-8222-222222222222",
    signal,
  };
}

describe("Supabase Admin control-plane repository", () => {
  it("fails closed before making a request without an actor", async () => {
    const repository = new SupabaseAdminControlPlaneRepository({
      rpc: () => {
        throw new Error("must not execute");
      },
    } as never);
    expect(
      repository.listRoleCatalog({
        actorId: null,
        requestId: "22222222-2222-4222-8222-222222222222",
      }),
    ).rejects.toBeInstanceOf(AdminError);
  });

  it("forwards bounded assignment filters and an abort signal", async () => {
    const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
    let observedSignal: AbortSignal | undefined;
    const repository = new SupabaseAdminControlPlaneRepository({
      rpc: (name: string, args?: Record<string, unknown>) => {
        calls.push({ name, args });
        return request(
          {
            data: { items: [], nextCursor: null },
            error: null,
          },
          (signal) => {
            observedSignal = signal;
          },
        );
      },
    } as never);
    const controller = new AbortController();
    const result = await repository.listAssignments(
      {
        role: "security_admin",
        principalStatus: "active",
        assignmentStatus: "active",
      },
      null,
      1_000,
      actor(controller.signal),
    );
    expect(result.items).toHaveLength(0);
    expect(calls[0]?.name).toBe("admin_list_staff_assignments");
    expect(calls[0]?.args?.p_limit).toBe(100);
    expect(observedSignal).toBe(controller.signal);
  });

  it("maps raw PostgREST errors into stable Admin errors", async () => {
    const repository = new SupabaseAdminControlPlaneRepository({
      rpc: () =>
        request({
          data: null,
          error: {
            code: "PT403",
            message: "permission_missing",
            details: "private database detail",
          },
        }),
    } as never);
    try {
      await repository.listRoleCatalog(actor());
      throw new Error("expected error");
    } catch (error) {
      expect(error).toBeInstanceOf(AdminError);
      expect((error as AdminError).code).toBe("permission_missing");
      expect((error as Error).message).not.toContain("private database detail");
    }
  });
});
