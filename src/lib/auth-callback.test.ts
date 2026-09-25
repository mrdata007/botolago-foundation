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

  // Resolving removes dot segments, and that can build the "//" the prefix
  // check had just refused. Each of these came back as "//attacker.invalid"
  // (the one with two dot segments as "///x"), a protocol-relative URL, until
  // the resolved path was checked again (2026-09-25). As above, the
  // `new URL(...)` assertion is the one the old return value fails.
  const dotSegmentDisguises = [
    "/.//attacker.invalid",
    "/..//attacker.invalid",
    "/a/..//attacker.invalid",
    "/a/../..//attacker.invalid",
    "/.//attacker.invalid?next=%2F#top",
    "/..//attacker.invalid/..//x",
    // The dot segment percent-encoded: the parser decodes `%2e` there too.
    "/%2e//attacker.invalid",
    "/%2E%2E//attacker.invalid",
    "/a/%2e%2e//attacker.invalid",
    "/.%2e//attacker.invalid",
    // A backslash for either slash is refused before anything is resolved.
    "/./\\attacker.invalid",
    "/..\\/attacker.invalid",
    "/%2e/\\attacker.invalid",
    "/.//\\attacker.invalid",
  ];

  it.each(dotSegmentDisguises)(
    "refuses %j, whose dot segments resolve to a protocol-relative URL",
    (candidate) => {
      const sanitized = sanitizeAuthCallbackNext(candidate);
      expect(sanitized).toBe("/");
      expect(new URL(sanitized, "https://botolago.com/auth/callback").origin).toBe(
        "https://botolago.com",
      );
    },
  );

  // Percent-encoded, a slash or backslash is not a separator: the browser asks
  // this site for that path, so these may stay.
  const encodedSeparators = [
    "/%2F/attacker.invalid",
    "/%2f%2fattacker.invalid",
    "/.%2F/attacker.invalid",
    "/%5C/attacker.invalid",
    "/%5c%5cattacker.invalid",
    "/.%5C/attacker.invalid",
  ];

  it.each(encodedSeparators)("keeps %j on this site", (candidate) => {
    const sanitized = sanitizeAuthCallbackNext(candidate);
    expect(sanitized.startsWith("//")).toBe(false);
    expect(new URL(sanitized, "https://botolago.com/auth/callback").origin).toBe(
      "https://botolago.com",
    );
  });

  it("is idempotent: a second pass returns the first pass's answer, whatever the input", () => {
    // `challengeSearch` sanitises once and the pages sanitise again: the two
    // must agree.
    for (const candidate of [
      ...offOriginDisguises,
      ...dotSegmentDisguises,
      ...encodedSeparators,
      "/news/../fantasy",
      "/a/./b",
      "/fantasy/team?x=%2F%2F",
      "/?//attacker.invalid",
      "/#//attacker.invalid",
      "/profile#security",
    ]) {
      const once = sanitizeAuthCallbackNext(candidate);
      expect({ candidate, twice: sanitizeAuthCallbackNext(once) }).toEqual({
        candidate,
        twice: once,
      });
    }
  });

  it("resolves harmless dot segments rather than refusing them", () => {
    expect(sanitizeAuthCallbackNext("/news/../fantasy")).toBe("/fantasy");
    expect(sanitizeAuthCallbackNext("/a/./b")).toBe("/a/b");
    // A second "//" after the path is only the query or the hash.
    expect(sanitizeAuthCallbackNext("/?//attacker.invalid")).toBe("/?//attacker.invalid");
    expect(sanitizeAuthCallbackNext("/#//attacker.invalid")).toBe("/#//attacker.invalid");
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
