// Run with: `bun test src/services/auth.test.ts`
import { describe, it, expect, beforeEach } from "bun:test";
import { __testing } from "./auth";
import type { AuthService } from "./auth-types";

// Explicitly instantiate mock mode; do not touch the module-level factory
// (which may resolve to the production Supabase service in this env).
let authService: AuthService;

beforeEach(() => {
  const g = globalThis as any;
  if (typeof g.window === "undefined") {
    const store = new Map<string, string>();
    g.window = {
      localStorage: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
        clear: () => store.clear(),
      },
    };
  } else {
    // Some shared shims (e.g., leagues-store test) don't expose `clear`.
    // Nuke known auth keys explicitly to avoid cross-file bleed.
    try {
      const ls = g.window.localStorage;
      ls.clear?.();
      [
        "botolago.auth.session",
        "botolago.auth.users",
        "botolago.auth.pending",
        "botolago.auth.deletion-request",
      ].forEach((k) => ls.removeItem?.(k));
    } catch {
      /* ignore */
    }
  }
  authService = __testing.createMockService();
});

describe("authService (local mock)", () => {
  it("demo login succeeds with seeded credentials", async () => {
    const r = await authService.signInWithEmail(__testing.DEMO_EMAIL, __testing.DEMO_PASSWORD);
    expect(r.ok).toBe(true);
    expect(r.data?.email).toBe(__testing.DEMO_EMAIL);
    expect(authService.getSession().status).toBe("authenticated");
  });

  it("demo login fails with wrong password", async () => {
    const r = await authService.signInWithEmail(__testing.DEMO_EMAIL, "wrong-password");
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("credentials");
    expect(authService.getSession().status).toBe("anonymous");
  });

  it("registration never stores the raw password", async () => {
    const r = await authService.registerWithEmail({
      fullName: "Amine Test",
      username: "aminetest",
      email: "amine@example.com",
      password: "SuperSecret1!",
      language: "fr",
    });
    expect(r.ok).toBe(true);
    const raw = window.localStorage.getItem("botolago.auth.pending") ?? "";
    expect(raw.includes("SuperSecret1!")).toBe(false);
  });

  it("OTP 123456 verifies a pending registration", async () => {
    await authService.registerWithEmail({
      fullName: "Amine Test",
      username: "aminetest",
      email: "amine@example.com",
      password: "SuperSecret1!",
      language: "fr",
    });
    const bad = await authService.verifyCode("amine@example.com", "000000");
    expect(bad.ok).toBe(false);
    const good = await authService.verifyCode("amine@example.com", __testing.DEMO_CODE);
    expect(good.ok).toBe(true);
    expect(authService.getSession().status).toBe("authenticated");
  });

  it("continueAsGuest yields a guest session", async () => {
    await authService.continueAsGuest();
    expect(authService.getSession().status).toBe("guest");
    expect(authService.getSession().user).toBeNull();
  });

  it("signOut clears the session", async () => {
    await authService.signInWithEmail(__testing.DEMO_EMAIL, __testing.DEMO_PASSWORD);
    expect(authService.getSession().status).toBe("authenticated");
    await authService.signOut();
    expect(authService.getSession().status).toBe("anonymous");
  });

  it("refreshes an active session and rejects an expired session", async () => {
    await authService.signInWithEmail(__testing.DEMO_EMAIL, __testing.DEMO_PASSWORD);
    expect((await authService.refreshSession()).ok).toBe(true);
    await authService.signOut();
    const expired = await authService.refreshSession();
    expect(expired.ok).toBe(false);
    expect(expired.errorCode).toBe("session_expired");
  });

  it("creates and cancels an idempotent account deletion request", async () => {
    await authService.signInWithEmail(__testing.DEMO_EMAIL, __testing.DEMO_PASSWORD);
    const first = await authService.requestAccountDeletion();
    const second = await authService.requestAccountDeletion();
    expect(first.ok).toBe(true);
    expect(second.data?.requestId).toBe(first.data?.requestId);
    const pending = await authService.getAccountDeletionRequests();
    expect(pending.ok).toBe(true);
    expect(pending.data).toHaveLength(1);
    expect(pending.data?.[0]?.status).toBe("requested");
    expect(
      new Date(pending.data?.[0]?.executeAfter ?? 0).getTime() -
        new Date(pending.data?.[0]?.requestedAt ?? 0).getTime(),
    ).toBe(7 * 24 * 60 * 60 * 1000);
    expect((await authService.cancelAccountDeletion()).ok).toBe(true);
    const cancelled = await authService.getAccountDeletionRequests();
    expect(cancelled.data?.[0]?.status).toBe("cancelled");
  });

  it("rejects a reserved username during onboarding", async () => {
    await authService.signInWithEmail(__testing.DEMO_EMAIL, __testing.DEMO_PASSWORD);
    const result = await authService.completeProfile({ username: "admin" });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("reserved_username");
  });
});
