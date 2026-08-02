import { describe, expect, it } from "vitest";
import { cleanAuthCallbackUrl, sanitizeAuthCallbackNext } from "./auth-callback";

describe("auth callback URL safety", () => {
  it("removes query and hash credentials while preserving the callback path", () => {
    expect(
      cleanAuthCallbackUrl(
        "https://www.botolago.app/auth/callback?code=secret&next=%2Fprofile#access_token=jwt&refresh_token=refresh",
      ),
    ).toBe("https://www.botolago.app/auth/callback");
  });

  it("allows only same-origin relative destinations", () => {
    expect(sanitizeAuthCallbackNext("/auth/update-password")).toBe("/auth/update-password");
    expect(sanitizeAuthCallbackNext("https://attacker.invalid")).toBe("/");
    expect(sanitizeAuthCallbackNext("//attacker.invalid")).toBe("/");
    expect(sanitizeAuthCallbackNext(null)).toBe("/");
  });
});
