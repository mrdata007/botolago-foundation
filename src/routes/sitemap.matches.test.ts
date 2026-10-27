import { afterEach, describe, expect, test } from "bun:test";

import { footballService } from "@/services/football";
import { Route } from "./sitemap[.]xml";

/**
 * /sitemap.xml's football reads, run through the route's own handler with the
 * football service stubbed: the season's match pages are listed, and a failed
 * football read leaves them out without failing the sitemap.
 */
const original = {
  getClubDirectory: footballService.getClubDirectory,
  getSeasonMatchIds: footballService.getSeasonMatchIds,
};
afterEach(() => Object.assign(footballService, original));

const MATCH = "7b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const CLUB = "0257feb3-4c16-431d-a58b-5faf060576ad";

async function sitemap(): Promise<Response> {
  const handlers = (
    Route.options as unknown as {
      server: { handlers: { GET: (context: unknown) => Promise<Response> } };
    }
  ).server.handlers;
  return handlers.GET({ request: new Request("https://botolago.com/sitemap.xml") });
}

describe("/sitemap.xml match pages", () => {
  test("lists the season's matches beside the clubs", async () => {
    footballService.getClubDirectory = async () =>
      ({ season: null, clubs: [{ id: CLUB }] }) as never;
    footballService.getSeasonMatchIds = async () => [MATCH];
    const response = await sitemap();
    expect(response.status).toBe(200);
    const xml = await response.text();
    expect(xml).toContain(`<loc>https://botolago.com/matches/${MATCH}</loc>`);
    expect(xml).toContain(`<loc>https://botolago.com/clubs/${CLUB}</loc>`);
  });

  test("a failed match read leaves the matches out, not the sitemap or the clubs", async () => {
    footballService.getClubDirectory = async () =>
      ({ season: null, clubs: [{ id: CLUB }] }) as never;
    footballService.getSeasonMatchIds = async () => {
      throw new Error("statement timeout");
    };
    const response = await sitemap();
    expect(response.status).toBe(200);
    const xml = await response.text();
    expect(xml).not.toContain(`/matches/${MATCH}`);
    expect(xml).toContain(`<loc>https://botolago.com/clubs/${CLUB}</loc>`);
    expect(xml).toContain("<loc>https://botolago.com/matches</loc>");
  });

  test("a failed club read leaves the clubs out, and the matches stay", async () => {
    footballService.getClubDirectory = async () => {
      throw new Error("statement timeout");
    };
    footballService.getSeasonMatchIds = async () => [MATCH];
    const xml = await (await sitemap()).text();
    expect(xml).toContain(`/matches/${MATCH}`);
    expect(xml).not.toContain(`/clubs/${CLUB}`);
  });
});
