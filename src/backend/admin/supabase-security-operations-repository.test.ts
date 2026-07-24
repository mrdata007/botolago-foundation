import { describe, expect, it } from "bun:test";
import type { RepositoryContext } from "@/backend/contracts/repository";
import { AdminError } from "./errors";
import { SupabaseAdminSecurityOperationsRepository } from "./supabase-security-operations-repository";

function request<T>(value: T): PromiseLike<T> & {
  abortSignal(signal: AbortSignal): PromiseLike<T>;
} {
  return {
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
    abortSignal: () => Promise.resolve(value),
  };
}

const context: RepositoryContext = {
  actorId: "11111111-1111-4111-8111-111111111111",
  requestId: "22222222-2222-4222-8222-222222222222",
};

describe("Supabase Admin security-operations repository", () => {
  it("uses only the exact identity resolution RPC", async () => {
    const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
    const repository = new SupabaseAdminSecurityOperationsRepository({
      rpc: (name: string, args?: Record<string, unknown>) => {
        calls.push({ name, args });
        return request({
          data: {
            found: true,
            authUserId: "33333333-3333-4333-8333-333333333333",
            maskedEmail: "s***@e***.test",
            emailVerified: true,
            mfaVerified: true,
            staffPrincipal: null,
            assignments: [],
          },
          error: null,
        });
      },
    } as never);

    await repository.resolveStaffUserExact(" staff@example.test ", context);
    expect(calls).toEqual([
      {
        name: "admin_resolve_staff_user_exact",
        args: { p_email: "staff@example.test" },
      },
    ]);
  });

  it("maps audited not-found DTOs to stable errors", async () => {
    const repository = new SupabaseAdminSecurityOperationsRepository({
      rpc: () =>
        request({
          data: { found: false, errorCode: "staff_user_not_found" },
          error: null,
        }),
    } as never);
    expect(repository.resolveStaffUserExact("missing@example.test", context)).rejects.toMatchObject(
      { code: "staff_user_not_found" },
    );
  });

  it("never accepts platform_admin through the standard-role contract", async () => {
    const repository = new SupabaseAdminSecurityOperationsRepository({
      rpc: () => {
        throw new Error("must not execute");
      },
    } as never);
    expect(
      repository.assignStandardRole(
        {
          targetAuthUserId: "33333333-3333-4333-8333-333333333333",
          role: "platform_admin",
          expiresAt: null,
          reason: "Unsafe direct platform assignment.",
          idempotencyKey: "44444444-4444-4444-8444-444444444444",
        } as never,
        { ...context, actorId: null },
      ),
    ).rejects.toBeInstanceOf(AdminError);
  });
});
