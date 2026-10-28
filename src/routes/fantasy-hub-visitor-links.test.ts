import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U18 — a visitor with no team reaches the leaderboard and the leagues from the
 * Fantasy hub, high on the page (under the deadline card, not after the guest
 * proposition); the owner's hub keeps its own rows. Source pins, because the hub
 * needs the whole auth and Fantasy provider stack to render; the position was
 * measured in the browser (docs/review/batch1-2026-10-27).
 */
const hub = readFileSync(join(import.meta.dir, "fantasy.index.tsx"), "utf8");

describe("Fantasy hub tiles for a visitor", () => {
  test("a visitor with no team gets the board tiles right after the deadline card", () => {
    expect(hub).toContain("{!hasTeam ? <VisitorBoardTiles /> : null}");
    expect(hub.indexOf("<VisitorBoardTiles />")).toBeLessThan(hub.indexOf("<FantasyHubTeamArea"));
  });

  test("they are the ranking and the leagues, the latter labelled with what it does", () => {
    expect(hub).toContain('to: "/fantasy/rankings"');
    expect(hub).toContain('t("fantasy.hub.visitor_leagues")');
  });
});
