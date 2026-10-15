import { describe, expect, test } from "bun:test";

import { dictionaries } from "@/i18n/dictionaries";
import type { AuthErrorCode } from "@/services/auth-types";

import { resendFailureKey, singleFlight, verifyFailureKey } from "./auth-verify-feedback";

const ALL_CODES: AuthErrorCode[] = [
  "credentials",
  "email_taken",
  "username_taken",
  "invalid_username",
  "reserved_username",
  "otp_invalid",
  "otp_expired",
  "email_unconfirmed",
  "unauthorized",
  "session_expired",
  "invalid_reset_token",
  "rate_limited",
  "network",
  "provider_unavailable",
  "weak_password",
  "account_closed",
  "mfa_required",
  "generic",
];

describe("code verification names the real cause (QA-04)", () => {
  const table: Array<[AuthErrorCode, string]> = [
    ["network", "auth.error.network"],
    ["rate_limited", "auth.error.rate_limited"],
    ["otp_expired", "auth.error.otp_expired"],
    ["otp_invalid", "auth.error.otp_invalid"],
    // Not the reader's code: a session that could not be built, or any unknown failure.
    ["session_expired", "auth.error.generic"],
    ["generic", "auth.error.generic"],
    ["provider_unavailable", "auth.error.generic"],
    ["unauthorized", "auth.error.generic"],
  ];
  for (const [code, key] of table) {
    test(`${code} -> ${key}`, () => {
      expect(verifyFailureKey(code)).toBe(key);
    });
  }
  test("a missing code is never blamed on the entered code", () => {
    expect(verifyFailureKey(undefined)).toBe("auth.error.generic");
  });
  test("only a wrong or expired code says the code is at fault", () => {
    const blamed = ALL_CODES.filter((c) =>
      ["auth.error.otp_invalid", "auth.error.otp_expired"].includes(verifyFailureKey(c)),
    );
    expect([...blamed].sort()).toEqual(["otp_expired", "otp_invalid"]);
  });
});

describe("resend failures are shown, not swallowed (QA-03)", () => {
  test("rate limit and network have their own messages, the rest is generic", () => {
    expect(resendFailureKey("rate_limited")).toBe("auth.error.rate_limited");
    expect(resendFailureKey("network")).toBe("auth.error.network");
    expect(resendFailureKey("generic")).toBe("auth.error.generic");
    expect(resendFailureKey(undefined)).toBe("auth.error.generic");
    // A resend is never about the code the reader typed.
    expect(resendFailureKey("otp_invalid")).toBe("auth.error.generic");
  });
});

describe("every key these helpers return exists in French and Arabic", () => {
  for (const code of [...ALL_CODES, undefined]) {
    for (const key of [verifyFailureKey(code), resendFailureKey(code)]) {
      test(`${key} (${code})`, () => {
        expect(dictionaries.fr[key]).toBeTruthy();
        expect(dictionaries.ar[key]).toBeTruthy();
      });
    }
  }
});

describe("a pending resend blocks a second request (QA-03)", () => {
  test("two clicks before the answer send one request", async () => {
    let sent = 0;
    let release: (value: string) => void = () => undefined;
    const resend = singleFlight(
      () =>
        new Promise<string>((resolve) => {
          sent += 1;
          release = resolve;
        }),
    );
    const first = resend();
    const second = resend();
    expect(sent).toBe(1);
    release("ok");
    expect(await first).toEqual({ ran: true, value: "ok" });
    expect(await second).toEqual({ ran: false });
  });

  test("once the first call settles (even by failing) a new one may go", async () => {
    let sent = 0;
    const resend = singleFlight(async () => {
      sent += 1;
      if (sent === 1) throw new Error("offline");
      return "ok";
    });
    await expect(resend()).rejects.toThrow("offline");
    expect(await resend()).toEqual({ ran: true, value: "ok" });
    expect(sent).toBe(2);
  });
});
