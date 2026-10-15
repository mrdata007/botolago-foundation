// The password-reset request must not tell an existing account from an unknown
// one. A mailer that fails server-side (auth-js throws AuthRetryableFetchError
// for a plain 500) used to fall through to "sent"; it must keep doing so, while
// a lost connection and a rate limit are still reported.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AuthRetryableFetchError, AuthApiError } from "@supabase/auth-js";

import { SupabaseAuthService } from "./auth-supabase";

// The request builds a redirect address from the page's origin; other test
// files leave a different `window` behind, so this one sets its own.
const scope = globalThis as { window?: unknown };
let savedWindow: unknown;
beforeAll(() => {
  savedWindow = scope.window;
  scope.window = { location: { origin: "https://app.example.test" } };
});
afterAll(() => {
  scope.window = savedWindow;
});

function serviceFailingWith(error: unknown) {
  return new SupabaseAuthService({
    auth: () => ({ resetPasswordForEmail: async () => ({ data: null, error }) }) as never,
  });
}

describe("requestPasswordReset keeps its anti-enumeration answer", () => {
  test("a mailer that failed with a retryable 500 still answers ok", async () => {
    const service = serviceFailingWith(
      new AuthRetryableFetchError("Error sending recovery email", 500),
    );
    expect(await service.requestPasswordReset("someone@example.test")).toEqual({ ok: true });
  });

  test("a request that never reached the server is reported", async () => {
    const service = serviceFailingWith(new AuthRetryableFetchError("Failed to fetch", 0));
    expect(await service.requestPasswordReset("someone@example.test")).toEqual({
      ok: false,
      errorCode: "network",
    });
  });

  test("a gateway answer (502) is reported as a connection problem", async () => {
    const service = serviceFailingWith(new AuthRetryableFetchError("Bad gateway", 502));
    expect(await service.requestPasswordReset("someone@example.test")).toEqual({
      ok: false,
      errorCode: "network",
    });
  });

  test("a rate limit is reported", async () => {
    const service = serviceFailingWith(
      new AuthApiError("email rate limit exceeded", 429, "over_email_send_rate_limit"),
    );
    expect(await service.requestPasswordReset("someone@example.test")).toEqual({
      ok: false,
      errorCode: "rate_limited",
    });
  });
});
