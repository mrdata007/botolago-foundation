import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { earlySeoResponse, hasUnfilledRouteParam } from "./seo-routing";

describe("answers given before the router", () => {
  // Google crawled /clubs/$clubId, which the router answered with a 307 to itself.
  test("a path with an unfilled route parameter is a 404 kept out of the index", () => {
    for (const path of ["/clubs/$clubId", "/clubs/%24clubId", "/news/%24articleId", "/$x"]) {
      const response = earlySeoResponse(`https://botolago.com${path}`);
      expect(`${path}: ${response?.status}`).toBe(`${path}: 404`);
      expect(response?.headers.get("x-robots-tag")).toBe("noindex");
    }
    expect(hasUnfilledRouteParam("/clubs/0257feb3-4c16-431d-a58b-5faf060576ad")).toBe(false);
    expect(hasUnfilledRouteParam("/news/prix-5$")).toBe(false);
  });

  test("the table's common addresses are 301s to the page that holds it", () => {
    for (const path of ["/classement", "/classement/", "/Classement", "/standings"]) {
      const response = earlySeoResponse(`https://botolago.com${path}`);
      expect(`${path}: ${response?.status}`).toBe(`${path}: 301`);
      expect(response?.headers.get("location")).toBe("/matches/standings");
    }
    expect(
      earlySeoResponse("https://botolago.com/classement?season=abc")?.headers.get("location"),
    ).toBe("/matches/standings?season=abc");
  });

  test("every other page goes to the router", () => {
    for (const path of ["/", "/matches/standings", "/clubs", "/news", "/sitemap.xml"]) {
      expect(`${path}: ${earlySeoResponse(`https://botolago.com${path}`)}`).toBe(`${path}: null`);
    }
  });

  test("the server entry asks before the router", () => {
    const server = readFileSync(join(import.meta.dir, "../server.ts"), "utf8");
    expect(server).toContain("const early = earlySeoResponse(request.url);");
  });
});
