import { afterEach, describe, expect, test } from "bun:test";

import { footballService } from "@/services/football";
import { Route } from "./sitemaps.$file";

/**
 * The club and match sitemap files, run through the route's own handler with
 * the football service stubbed: the season's match pages are listed, and a
 * failed football read is a 503 the crawler retries, never an empty file
 * (an empty sitemap tells it every page it listed has gone).
 */
const original = {
  getClubDirectory: footballService.getClubDirectory,
  getSitemapMatches: footballService.getSitemapMatches,
};
afterEach(() => Object.assign(footballService, original));

const MATCH = "7b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

async function sitemapFile(file: string): Promise<Response> {
  const handlers = (
    Route.options as unknown as {
      server: { handlers: { GET: (context: unknown) => Promise<Response> } };
    }
  ).server.handlers;
  return handlers.GET({
    request: new Request(`https://botolago.com/sitemaps/${file}`),
    params: { file },
  });
}

describe("/sitemaps/matches.xml", () => {
  test("lists the season's matches at their canonical URLs", async () => {
    footballService.getSitemapMatches = async () => [
      { id: MATCH, kickoff: "2026-10-25T19:00:00Z" },
    ];
    const response = await sitemapFile("matches.xml");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(`<loc>https://botolago.com/matches/${MATCH}</loc>`);
  });

  test("a failed match read is a 503, not an empty sitemap", async () => {
    footballService.getSitemapMatches = async () => {
      throw new Error("statement timeout");
    };
    const response = await sitemapFile("matches.xml");
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("a failed club read fails the club file alone", async () => {
    footballService.getClubDirectory = async () => {
      throw new Error("statement timeout");
    };
    footballService.getSitemapMatches = async () => [
      { id: MATCH, kickoff: "2026-10-25T19:00:00Z" },
    ];
    expect((await sitemapFile("clubs.xml")).status).toBe(503);
    expect((await sitemapFile("matches.xml")).status).toBe(200);
  });
});
