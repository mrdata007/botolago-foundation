import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * S10 — the availability probe does not poll. Whether a season is open and a
 * team can be created changes by the gameweek; asking every 60 s from every
 * Fantasy screen and Home cost a database round trip per reader per minute.
 */
const source = readFileSync(join(import.meta.dir, "use-fantasy-availability.ts"), "utf8").replace(
  /\/\/.*$/gm,
  "",
);

describe("useFantasyAvailability", () => {
  test("has no refetchInterval", () => {
    expect(source).not.toContain("refetchInterval");
  });

  test("is held five minutes and read again when the reader returns to the tab", () => {
    expect(source).toContain("staleTime: 5 * 60_000");
    expect(source).toContain("refetchOnWindowFocus: true");
  });
});
