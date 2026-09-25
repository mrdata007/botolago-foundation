import { describe, expect, test } from "bun:test";

import { withSiteHeaders } from "./response-headers";

describe("site response headers", () => {
  test("every response names the commit that served it", async () => {
    const response = withSiteHeaders(
      new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }),
      "https://botolago.com/",
      "6a12a6b0c0ffee",
    );
    expect(response.headers.get("x-botolago-release")).toBe("6a12a6b0c0ffee");
    expect(response.headers.get("content-type")).toBe("text/html");
    expect(await response.text()).toBe("<html></html>");
  });

  test("on botolago.com no other site may frame a page", () => {
    for (const url of ["https://botolago.com/auth/login", "https://www.botolago.com/admin"]) {
      const headers = withSiteHeaders(new Response(""), url, "6a12a6b").headers;
      expect(headers.get("content-security-policy")).toBe("frame-ancestors 'self'");
      expect(headers.get("x-frame-options")).toBe("SAMEORIGIN");
    }
  });

  test("auth and private routes cannot be cached, including redirects", () => {
    for (const path of [
      "/auth/login",
      "/auth/callback",
      "/admin",
      "/profile",
      "/fantasy/team",
      "/notifications",
    ]) {
      const response = withSiteHeaders(
        new Response(null, { status: 302, headers: { "Cache-Control": "public, max-age=600" } }),
        `https://botolago.com${path}`,
        "6a12a6b",
      );
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    const publicResponse = withSiteHeaders(
      new Response("", { headers: { "Cache-Control": "public, max-age=60" } }),
      "https://botolago.com/news",
      "6a12a6b",
    );
    expect(publicResponse.headers.get("cache-control")).toBe("public, max-age=60");
  });

  test("Lovable's editor preview keeps working: other hosts are not restricted", () => {
    const headers = withSiteHeaders(
      new Response(""),
      "https://id-preview--9f9face2-4733-42fd-aa13-174fbe9f6c87.lovable.app/",
      "6a12a6b",
    ).headers;
    expect(headers.get("x-frame-options")).toBeNull();
    expect(headers.get("content-security-policy")).toBeNull();
    expect(headers.get("x-botolago-release")).toBe("6a12a6b");
  });

  test("a response whose headers cannot change is copied with status and body", async () => {
    const response = withSiteHeaders(
      Response.redirect("https://botolago.com/fantasy", 302),
      "https://botolago.com/fantasy/team",
      "6a12a6b",
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://botolago.com/fantasy");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  test("a build that does not know its commit says so", () => {
    expect(
      withSiteHeaders(new Response(""), "https://botolago.com/").headers.get("x-botolago-release"),
    ).toMatch(/^([0-9a-f]{7,40}|unknown)$/);
  });
});
