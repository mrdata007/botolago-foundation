import { describe, expect, test } from "bun:test";

import {
  SITE_OPENER_POLICY,
  contentSecurityPolicyReportOnly,
  withSiteHeaders,
} from "./response-headers";
import { SITEMAP_CACHE_CONTROL } from "./sitemap";

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

  test("on botolago.com pages carry the opener policy and a report-only CSP, never an enforcing one", () => {
    const page = () =>
      new Response("<html></html>", { headers: { "content-type": "text/html; charset=utf-8" } });
    for (const url of ["https://botolago.com/", "https://www.botolago.com/news"]) {
      const headers = withSiteHeaders(page(), url, "6a12a6b").headers;
      expect(headers.get("cross-origin-opener-policy")).toBe("same-origin-allow-popups");
      expect(SITE_OPENER_POLICY).toBe("same-origin-allow-popups");
      expect(headers.get("content-security-policy-report-only")).toBe(
        contentSecurityPolicyReportOnly(),
      );
      // The one enforced policy stays the frame rule alone.
      expect(headers.get("content-security-policy")).toBe("frame-ancestors 'self'");
    }
  });

  test("non-pages and other hosts get neither the opener policy nor the report-only CSP", () => {
    const json = withSiteHeaders(
      new Response("{}", { headers: { "content-type": "application/json" } }),
      "https://botolago.com/api/x",
      "6a12a6b",
    ).headers;
    expect(json.get("cross-origin-opener-policy")).toBeNull();
    expect(json.get("content-security-policy-report-only")).toBeNull();
    const preview = withSiteHeaders(
      new Response("", { headers: { "content-type": "text/html" } }),
      "https://id-preview--9f9face2-4733-42fd-aa13-174fbe9f6c87.lovable.app/",
      "6a12a6b",
    ).headers;
    expect(preview.get("cross-origin-opener-policy")).toBeNull();
    expect(preview.get("content-security-policy-report-only")).toBeNull();
  });

  test("the report-only policy names the project's own origins and what the pages load", () => {
    const policy = contentSecurityPolicyReportOnly("https://abc.supabase.co");
    const directives = new Map(
      policy.split("; ").map((part) => {
        const [name, ...sources] = part.split(" ");
        return [name, sources] as const;
      }),
    );
    expect(directives.get("default-src")).toEqual(["'self'"]);
    expect(directives.get("connect-src")).toEqual([
      "'self'",
      "https://abc.supabase.co",
      "wss://abc.supabase.co",
      "https://api.seline.com",
    ]);
    expect(directives.get("script-src")).toContain("https://cdn.seline.com");
    expect(directives.get("script-src")).toContain("'unsafe-eval'");
    expect(directives.get("img-src")).toEqual(expect.arrayContaining(["data:", "blob:", "https:"]));
    expect(directives.get("object-src")).toEqual(["'none'"]);
    // Frame rules are the enforced header's job, not this one's.
    expect(directives.has("frame-ancestors")).toBe(false);
    // Without a project origin it falls back to the host family, never to "*".
    expect(contentSecurityPolicyReportOnly(undefined)).toContain("https://*.supabase.co");
    expect(policy).not.toMatch(/[ ]\*[ ;]|[ ]\*$/);
  });

  test("auth and private routes cannot be cached, including redirects", () => {
    for (const path of [
      "/auth/login",
      "/auth/callback",
      "/admin",
      "/profile",
      "/fantasy",
      "/fantasy/",
      "/fantasy/team",
      "/pronostics/ligues/abc",
      "/notifications",
    ]) {
      const response = withSiteHeaders(
        new Response(null, { status: 302, headers: { "Cache-Control": "public, max-age=600" } }),
        `https://botolago.com${path}`,
        "6a12a6b",
      );
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    for (const path of ["/news", "/fantasy/rules", "/fantasyland", "/pronostics"]) {
      const publicResponse = withSiteHeaders(
        new Response("", { headers: { "Cache-Control": "public, max-age=60" } }),
        `https://botolago.com${path}`,
        "6a12a6b",
      );
      expect(publicResponse.headers.get("cache-control")).toBe("public, max-age=60");
    }
  });

  // The second-factor screen, the account's security page and the league
  // pages read the reader's own session; the sitemap's freshness rests on a
  // shared cache keeping it for minutes (`SITEMAP_CACHE_CONTROL`), and past
  // that serving its last good copy while the origin fails.
  test("the second-factor screen stays private; the sitemap keeps its shared caching", () => {
    for (const path of [
      "/auth/mfa-challenge?next=%2Ffantasy%2Fteam",
      "/profile/security",
      "/profile/saved",
      "/fantasy/leagues/abc",
      "/pronostics/ligues/rejoindre",
    ]) {
      const response = withSiteHeaders(
        new Response("", { headers: { "Cache-Control": "public, max-age=60" } }),
        `https://botolago.com${path}`,
        "6a12a6b",
      );
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    const sitemap = withSiteHeaders(
      new Response("<urlset/>", { headers: { "Cache-Control": SITEMAP_CACHE_CONTROL } }),
      "https://botolago.com/sitemap.xml",
      "6a12a6b",
    );
    expect(sitemap.headers.get("cache-control")).toBe(SITEMAP_CACHE_CONTROL);
    expect(SITEMAP_CACHE_CONTROL).toMatch(/^public, .*\bs-maxage=\d+.*\bstale-if-error=\d+$/);
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
