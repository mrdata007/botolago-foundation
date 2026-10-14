import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { readStored } from "./sofascore-fantasy-auto.ts";
import { parseSofascoreIncidents, parseSofascoreLineups } from "./sofascore-performance-parse.ts";

// RS Berkane - Renaissance Zemamra (17256978) gave up on 2026-10-13 with its
// parsed replies stored in app_private.sofascore_fantasy_attempts.match_data,
// where the own goal is `kind: "unknown"` (the parser did not know goal/ownGoal
// then). Reopened after the deploy, the match is retried from that stored copy,
// so the stored copy must read as an own goal now.
const reply = (part: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../../tests/fixtures/providers/sofascore/17256978.${part}.json`, import.meta.url),
      "utf8",
    ),
  );

describe("stored replies from before goal/ownGoal was known", () => {
  const incidents = parseSofascoreIncidents(reply("incidents"));
  // What the old parser stored: the own goal as unknown, its raw labels kept.
  const storedIncidents = incidents.map((i) =>
    i.kind === "own_goal" ? { ...i, kind: "unknown" as const } : i,
  );
  const stored = {
    version: 1,
    lineups: parseSofascoreLineups(reply("lineups")),
    incidents: storedIncidents,
    statistics: [],
  };

  test("the stored own goal reads as an own goal, on the side it counted for", () => {
    const parts = readStored(JSON.parse(JSON.stringify(stored)));
    expect(parts).not.toBeNull();
    const own = parts!.incidents.filter((i) => i.kind === "own_goal");
    expect(own.map((i) => [i.minute, i.side, i.player?.externalId])).toEqual([
      [5, "away", "970761"],
    ]);
    expect(parts!.incidents.some((i) => i.kind === "unknown")).toBe(false);
  });

  test("a label still not known stays unknown", () => {
    const odd = {
      ...storedIncidents[1]!,
      kind: "unknown" as const,
      rawType: "goal",
      rawClass: "scissorKick",
    };
    const parts = readStored({ ...stored, incidents: [...storedIncidents, odd] });
    expect(parts!.incidents.filter((i) => i.kind === "unknown").map((i) => i.rawClass)).toEqual([
      "scissorKick",
    ]);
  });
});
