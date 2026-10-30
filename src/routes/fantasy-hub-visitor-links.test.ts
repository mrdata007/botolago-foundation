import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U18 — a visitor with no team reaches the leaderboard and the leagues from the
 * Fantasy hub; the owner's hub keeps its own rows. Since 2026-10-30 they lead
 * the hub's one plain shortcut list instead of a grid of tiles above the
 * proposition: the deadline and "Créer mon équipe" are the first screen. Source
 * pins, because the hub needs the whole auth and Fantasy provider stack to
 * render.
 */
const hub = readFileSync(join(import.meta.dir, "fantasy.index.tsx"), "utf8");

describe("Fantasy hub links for a visitor", () => {
  test("one shortcut list, told whether the reader is a visitor", () => {
    expect(hub).toContain("<ShortcutList visitor={!hasTeam} roundShown={roundShown} />");
    expect(hub.split("<ShortcutList ")).toHaveLength(2);
    expect(hub).not.toContain("TileGrid");
  });

  test("a visitor's list starts with the ranking and the leagues, labelled with what it does", () => {
    const list = hub.slice(hub.indexOf("function ShortcutList"));
    expect(list).toContain('to: "/fantasy/rankings"');
    expect(list).toContain('t("fantasy.hub.visitor_leagues")');
    expect(list.indexOf('"/fantasy/rankings"')).toBeLessThan(list.indexOf('to: "/matches"'));
  });

  test("« Difficulté des matchs » once: the list leaves it to the owner's round block", () => {
    const list = hub.slice(hub.indexOf("function ShortcutList"));
    expect(list).toContain('...(roundShown ? [] : [{ to: "/fantasy/fixtures"');
    expect(hub).toContain("{roundShown && team && gameweek ? (\n        <FantasyHubRound");
  });

  test("one rules link and one help link on the hub", () => {
    expect(hub.split('to: "/fantasy/rules"')).toHaveLength(2);
    expect(hub.split('to: "/fantasy/help"')).toHaveLength(2);
    expect(hub).not.toContain("fpl.help_rules");
  });
});
