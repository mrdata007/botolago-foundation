// Tests for the auth service selector and Supabase error mapping.
// Run with: `bun test src/services/auth-selector.test.ts`
import { describe, it, expect } from "bun:test";
import { __testing, IS_MOCK_AUTH, selectAuthMode } from "./auth";
import { __mapAuthErrorForTests as mapError } from "./auth-supabase";

describe("auth mode selector", () => {
  it("fails closed unless production explicitly selects Supabase", () => {
    expect(() => selectAuthMode(undefined, false, true)).toThrow("VITE_AUTH_MODE=supabase");
    expect(() => selectAuthMode("mock", true, true)).toThrow("VITE_AUTH_MODE=supabase");
    expect(selectAuthMode("supabase", true, true)).toBe("supabase");
  });

  it("keeps deterministic mock selection available outside production", () => {
    expect(selectAuthMode("mock", false, false)).toBe("mock");
    expect(selectAuthMode(undefined, false, false)).toBe("mock");
    expect(selectAuthMode(undefined, true, false)).toBe("supabase");
  });

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
    // Safari's own wording for a request that never reached the server.
    ["Load failed", undefined, "network"],
    ["User is banned", 400, "account_closed"],
    ["Some other issue", 500, "generic"],
  ];
  for (const [msg, status, expected] of cases) {
    it(`maps "${msg}" → ${expected}`, () => {
      const err = { message: msg, status } as unknown as { message: string; status?: number };

      expect(mapError(err as any)).toBe(expected);
    });
  }
  it("returns 'network' for the client's retryable-fetch error only when the request really did not get through (QA-04)", () => {
    // auth-js also throws this error for a plain 500/501 (a mailer that failed,
    // for one): that is the server answering, not the network.
    for (const status of [0, 502, 503, 504, 520, 524, 530]) {
      expect(
        mapError({ name: "AuthRetryableFetchError", message: "Unexpected end", status } as any),
      ).toBe("network");
    }
    for (const status of [500, 501]) {
      expect(
        mapError({
          name: "AuthRetryableFetchError",
          message: "Error sending recovery email",
          status,
        } as any),
      ).toBe("generic");
    }
  });
  it("does not read 'upload failed' as a lost connection", () => {
    expect(mapError({ message: "Upload failed", status: 400 } as any)).toBe("generic");
    expect(mapError({ message: "Load failed", status: undefined } as any)).toBe("network");
  });
  it("returns 'rate_limited' for HTTP 429", () => {
    expect(mapError({ message: "too many", status: 429 } as any)).toBe("rate_limited");
  });
});
