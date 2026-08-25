import { describe, expect, test } from "bun:test";
import { safeMfaReturnPath, selectVerifiedTotpFactor } from "./mfa-flow";

describe("MFA flow helpers", () => {
  test("selects a verified TOTP factor and ignores unverified factors", () => {
    expect(
      selectVerifiedTotpFactor([
        { id: "pending", factor_type: "totp", status: "unverified" },
        { id: "verified", factor_type: "totp", status: "verified" },
      ]),
    ).toEqual({ id: "verified" });
  });

  test("does not select a different factor type", () => {
    expect(
      selectVerifiedTotpFactor([{ id: "phone", factor_type: "phone", status: "verified" }]),
    ).toBeNull();
  });

  test("keeps same-origin paths and rejects protocol-relative redirects", () => {
    expect(safeMfaReturnPath("/admin/security")).toBe("/admin/security");
    expect(safeMfaReturnPath("//evil.example/path")).toBe("/");
    expect(safeMfaReturnPath("https://evil.example/path")).toBe("/");
  });
});

