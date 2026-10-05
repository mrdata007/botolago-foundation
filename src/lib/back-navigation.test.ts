import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { backDestination } from "./back-navigation";

describe("backDestination", () => {
  it("uses history when there is an in-app entry behind this one", () => {
    expect(backDestination(true, "/news")).toEqual({ kind: "history" });
  });

  it("routes to the fallback when there is not", () => {
    // The whole point: in a fresh tab -- a shared link, a search result, a push
    // notification -- history.back() steps off the site and the tab goes blank.
    expect(backDestination(false, "/news")).toEqual({ kind: "route", to: "/news" });
    expect(backDestination(false, "/matches")).toEqual({ kind: "route", to: "/matches" });
  });
});

describe("backDestination with a fallback that carries a search", () => {
  it("steps back through history, whatever the fallback is", () => {
    // From inside the app Retour returns to the page as it was left: the
    // calendar's day and chip, the club's tab, are in that entry's URL.
    expect(backDestination(true, { to: "/matches", search: { date: "2026-09-27" } })).toEqual({
      kind: "history",
    });
  });

  it("sends a cold arrival to the fallback with its search", () => {
    expect(
      backDestination(false, { to: "/matches", search: { season: "s1", date: "2026-09-27" } }),
    ).toEqual({ kind: "route", to: "/matches", search: { season: "s1", date: "2026-09-27" } });
  });
});

describe("the back controls all use it", () => {
  // Three separate surfaces each called router.history.back() directly, and
  // each one stranded a reader who arrived by link. A fourth would too, so the
  // rule is checked rather than remembered.
  const root = join(import.meta.dir, "..", "..");
  const SURFACES = [
    "src/components/auth/AuthShell.tsx",
    "src/routes/news.$articleId.tsx",
    "src/routes/matches.$matchId.tsx",
    // Reached from the header search, a squad, a list or a shared link: a
    // fixed `backTo` link sent every one of them to the players list.
    "src/routes/fantasy.players.$playerId.tsx",
    "src/routes/clubs.$clubId.tsx",
  ];

  it("leaves no bare history.back() on a page that can be opened cold", () => {
    for (const file of SURFACES) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source).toContain("useBackTo");
      expect(source).not.toContain("history.back()");
    }
  });

  it("only falls back to paths the router actually has", () => {
    // The fallback is a plain string, so a typo would not fail the typecheck --
    // it would strand the reader exactly as before, only on a 404 instead of a
    // blank tab. Check each one against the generated route tree.
    const tree = readFileSync(join(root, "src/routeTree.gen.ts"), "utf8");
    const fallbacks = SURFACES.flatMap((file) => {
      const source = readFileSync(join(root, file), "utf8");
      return [...source.matchAll(/useBackTo\(\s*(?:\{\s*to: )?"([^"]+)"/g)].map(
        (match) => match[1],
      );
    });
    expect(fallbacks.length).toBe(SURFACES.length);
    for (const path of fallbacks) {
      // A group's listing is generated with a trailing slash ("/matches/"),
      // which the router resolves from the bare path.
      const known =
        tree.includes(`'${path}': typeof`) ||
        tree.includes(`'${path.replace(/\/$/, "")}/': typeof`);
      expect(known).toBe(true);
    }
  });
});
