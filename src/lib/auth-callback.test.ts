import { describe, expect, it } from "vitest";
import { authNextSearch, cleanAuthCallbackUrl, sanitizeAuthCallbackNext } from "./auth-callback";

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

  // Every string below starts with exactly one "/" and so passed the previous
  // prefix-only check, yet the WHATWG URL parser -- which is what the browser
  // uses when it resolves the destination -- rewrites each one into an
  // off-origin URL. The assertion that proves the bug is the `new URL(...)`
  // one: it fails on the old implementation's return value.
  const offOriginDisguises = [
    "/\\attacker.invalid",
    "/\\/attacker.invalid",
    "/\\\\attacker.invalid",
    "/\\@attacker.invalid",
    "/\t/attacker.invalid",
    "/\n/attacker.invalid",
    "/\r/attacker.invalid",
    "/\u0000//attacker.invalid",
  ];

  it.each(offOriginDisguises)("refuses the off-origin disguise %j", (candidate) => {
    const sanitized = sanitizeAuthCallbackNext(candidate);
    expect(sanitized).toBe("/");
    expect(new URL(sanitized, "https://botolago.com/auth/callback").origin).toBe(
      "https://botolago.com",
    );
  });

  it("keeps ordinary same-origin destinations, including query and hash", () => {
    expect(sanitizeAuthCallbackNext("/fantasy/team")).toBe("/fantasy/team");
    expect(sanitizeAuthCallbackNext("/news?tab=all")).toBe("/news?tab=all");
    expect(sanitizeAuthCallbackNext("/profile#security")).toBe("/profile#security");
    expect(sanitizeAuthCallbackNext("/")).toBe("/");
  });

  it("refuses absolute URLs whatever their scheme", () => {
    expect(sanitizeAuthCallbackNext("javascript:alert(1)")).toBe("/");
    expect(sanitizeAuthCallbackNext("data:text/html,<script>alert(1)</script>")).toBe("/");
    expect(sanitizeAuthCallbackNext("http://attacker.invalid/")).toBe("/");
  });

  it("a route's validated next always carries the key, so the raw query cannot leak through", () => {
    expect(authNextSearch("https://attacker.invalid")).toEqual({ next: undefined });
    expect("next" in authNextSearch("/\\attacker.invalid")).toBe(true);
    expect(authNextSearch(undefined)).toEqual({ next: undefined });
    expect(authNextSearch("/")).toEqual({ next: undefined });
    expect(authNextSearch("/fantasy/team")).toEqual({ next: "/fantasy/team" });
  });
});
