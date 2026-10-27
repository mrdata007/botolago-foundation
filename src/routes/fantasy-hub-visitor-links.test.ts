import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U18 — a visitor with no team reaches the leaderboard and the leagues from the
 * Fantasy hub in one tap; the owner's hub keeps its own rows and does not get
 * the duplicates. Source pins, because the hub needs the whole auth and
 * Fantasy provider stack to render; the tiles themselves were checked in the
 * browser (docs/review/batch1-2026-10-27).
 */
const hub = readFileSync(join(import.meta.dir, "fantasy.index.tsx"), "utf8");

describe("Fantasy hub shortcuts for a visitor", () => {
  test("the shortcut tiles know whether the reader has a team", () => {
    expect(hub).toContain("<ShortcutTiles visitor={!hasTeam} />");
  });

  test("a visitor gets the ranking and the leagues", () => {
    expect(hub).toContain('to: "/fantasy/rankings"');
    expect(hub).toContain('to: "/fantasy/leagues"');
    expect(hub).toMatch(/\.\.\.\(visitor\s*\?\s*\[/);
  });
});
