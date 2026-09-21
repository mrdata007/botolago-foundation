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

describe("the back controls all use it", () => {
  // Three separate surfaces each called router.history.back() directly, and
  // each one stranded a reader who arrived by link. A fourth would too, so the
  // rule is checked rather than remembered.
  const root = join(import.meta.dir, "..", "..");
  const SURFACES = [
    "src/components/auth/AuthShell.tsx",
    "src/routes/news.$articleId.tsx",
    "src/routes/matches.$matchId.tsx",
  ];

  it("leaves no bare history.back() on a page that can be opened cold", () => {
    for (const file of SURFACES) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source).toContain("useBackTo");
      expect(source).not.toContain("history.back()");
    }
  });
});
