// What /auth/callback makes of an error a provider's redirect carries back (sweep case A8).
// Run with: `bun test src/lib/auth-return-error.test.ts`
import { describe, expect, test } from "bun:test";

import { authReturnError } from "./auth-callback";

const none = new URLSearchParams();

describe("authReturnError", () => {
  test("no error in the address is no error", () => {
    expect(authReturnError(new URLSearchParams("code=abc&next=%2F"), none)).toBeNull();
    expect(authReturnError(none, new URLSearchParams("access_token=a&refresh_token=b"))).toBeNull();
  });

  test("a provider that is switched off is told apart, in the query or in the hash", () => {
    const off =
      "error=invalid_request&error_code=provider_disabled&error_description=Unsupported+provider%3A+provider+is+not+enabled";
    expect(authReturnError(new URLSearchParams(off), none)).toBe("provider_unavailable");
    expect(authReturnError(none, new URLSearchParams(off))).toBe("provider_unavailable");
    expect(
      authReturnError(
        new URLSearchParams(
          "error_code=validation_failed&error_description=Unsupported+provider%3A+provider+is+not+enabled",
        ),
        none,
      ),
    ).toBe("provider_unavailable");
    // The code alone, with no description, is enough.
    expect(authReturnError(new URLSearchParams("error_code=provider_disabled"), none)).toBe(
      "provider_unavailable",
    );
  });

  test("any other error keeps the link-invalid-or-expired page", () => {
    expect(
      authReturnError(
        new URLSearchParams(
          "error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
        ),
        none,
      ),
    ).toBe("callback_error");
    expect(
      authReturnError(new URLSearchParams("error_description=The+user+denied+access"), none),
    ).toBe("callback_error");
  });
});
