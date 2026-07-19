// Tests for the auth service selector and Supabase error mapping.
// Run with: `bun test src/services/auth-selector.test.ts`
import { describe, it, expect } from "bun:test";
import { __testing, IS_MOCK_AUTH } from "./auth";
import { __mapAuthErrorForTests as mapError } from "./auth-supabase";

describe("auth mode selector", () => {
  it("exposes a stable IS_MOCK_AUTH flag", () => {
    expect(typeof IS_MOCK_AUTH).toBe("boolean");
  });
  it("createMockService returns a fresh mock instance each time", () => {
    const a = __testing.createMockService();
    const b = __testing.createMockService();
    expect(a).not.toBe(b);
    expect(typeof a.signInWithEmail).toBe("function");
  });
});

describe("Supabase error mapping", () => {
  const cases: Array<[string, number | undefined, string]> = [
    ["Invalid login credentials", 400, "credentials"],
    ["Email not confirmed", 400, "email_unconfirmed"],
    ["User already registered", 422, "email_taken"],
    ["Token has expired or is invalid", 400, "otp_expired"],
    ["Password should be at least 8 characters", 422, "weak_password"],
    ["Provider is not enabled", 400, "provider_unavailable"],
    ["Failed to fetch", undefined, "network"],
    ["Some other issue", 500, "generic"],
  ];
  for (const [msg, status, expected] of cases) {
    it(`maps "${msg}" → ${expected}`, () => {
      const err = { message: msg, status } as unknown as { message: string; status?: number };

      expect(mapError(err as any)).toBe(expected);
    });
  }
  it("returns 'rate_limited' for HTTP 429", () => {
    expect(mapError({ message: "too many", status: 429 } as any)).toBe("rate_limited");
  });
});
