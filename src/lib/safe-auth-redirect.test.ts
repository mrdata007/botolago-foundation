import { describe, expect, it } from "bun:test";
import { safeAuthRedirect } from "./safe-auth-redirect";

describe("safeAuthRedirect", () => {
  it("accepts same-origin paths including search and hash state", () => {
    expect(safeAuthRedirect("/profile")).toBe("/profile");
    expect(safeAuthRedirect("/matches/m1?tab=stats#timeline")).toBe(
      "/matches/m1?tab=stats#timeline",
    );
  });

  it("rejects external, backslash, auth-loop, empty, and non-string targets", () => {
    for (const value of [
      "https://evil.example",
      "javascript:alert(1)",
      "//evil.example/path",
      "/\\evil.example/path",
      "/auth/login?next=/profile",
      "/auth/callback?next=/profile",
      "",
      null,
      42,
    ]) {
      expect(safeAuthRedirect(value)).toBeUndefined();
    }
  });
});
