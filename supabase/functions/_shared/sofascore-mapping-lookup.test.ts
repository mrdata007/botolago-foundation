import { describe, expect, test } from "bun:test";
import { buildSofascoreMappingLookup } from "./sofascore-mapping-lookup.ts";

const row = (
  entity_type: string,
  external_id: string,
  internal_entity_id: string,
  extra: Record<string, unknown> = {},
) => ({
  provider_name: "sofascore",
  entity_type,
  external_id,
  internal_entity_id,
  active: true,
  ...extra,
});

describe("buildSofascoreMappingLookup", () => {
  test("resolves active sofascore rows and counts them by type", () => {
    const { lookup, counts, conflicts, ignoredRows } = buildSofascoreMappingLookup([
      row("competition", "937", "c1"),
      row("season", "102220", "s1"),
      row("round", "102220:3", "r3"),
      row("team", "42", "t42"),
      row("fixture", "17256979", "f1"),
    ] as never);
    expect(lookup.resolve("round", "102220:3")).toBe("r3");
    expect(lookup.resolve("fixture", "17256979")).toBe("f1");
    expect(lookup.resolve("team", "43")).toBeNull();
    expect(counts).toEqual({ competition: 1, season: 1, round: 1, team: 1, fixture: 1 });
    expect(conflicts).toEqual([]);
    expect(ignoredRows).toBe(0);
  });

  test("ignores other providers, inactive rows and unused entity types", () => {
    const { lookup, ignoredRows } = buildSofascoreMappingLookup([
      row("team", "1", "t1", { provider_name: "sportsmonks" }),
      row("team", "2", "t2", { active: false }),
      row("player", "3", "p3"),
      row("team", "", "t4"),
    ] as never);
    expect(lookup.resolve("team", "1")).toBeNull();
    expect(lookup.resolve("team", "2")).toBeNull();
    expect(ignoredRows).toBe(4);
  });

  test("an identical duplicate is harmless, a conflicting one resolves to nothing", () => {
    const result = buildSofascoreMappingLookup([
      row("team", "1", "t1"),
      row("team", "1", "t1"),
      row("team", "2", "ta"),
      row("team", "2", "tb"),
    ] as never);
    expect(result.lookup.resolve("team", "1")).toBe("t1");
    expect(result.lookup.resolve("team", "2")).toBeNull();
    expect(result.conflicts).toEqual(["team:2"]);
    expect(result.counts.team).toBe(1);
  });
});
