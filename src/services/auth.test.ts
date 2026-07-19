// @ts-nocheck — bun test runtime types are provided by bun-types (not in deps).
// Run with: `bun test src/services/auth.test.ts`
import { describe, it, expect, beforeEach } from "bun:test";
import { __testing } from "./auth";
import type { AuthService } from "./auth-types";

// Explicitly instantiate mock mode; do not touch the module-level factory
// (which may resolve to the production Supabase service in this env).
let authService: AuthService;

beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    try {
      g.window.localStorage.clear?.();
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
});
