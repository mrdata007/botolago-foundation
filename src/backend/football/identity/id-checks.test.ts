import { describe, expect, test } from "bun:test";
import type { ProviderSquad } from "./contracts";
import { checkProviderIds } from "./id-checks";
import { providerPlayer } from "./test-support";

const squad = (
  clubKey: string,
  ids: string[],
  overrides: Partial<ProviderSquad> = {},
  playerOverrides = {},
): ProviderSquad => ({
  provider: "sofascore",
  clubKey,
  requestedTeamId: "100",
  status: "ok",
  errorCode: null,
  players: ids.map((id) => providerPlayer({ externalPlayerId: id, ...playerOverrides })),
  diagnostics: {
    listedEntries: ids.length,
    malformedEntries: 0,
    excludedCoaches: 0,
    unknownPositionLabels: 0,
    duplicateIds: [],
    otherLists: { foreign: null, national: null },
  },
  completeness: { state: "COMPLETE", reasons: [] },
  ...overrides,
});

describe("provider id checks", () => {
  test("distinct ids everywhere: no collision observed", () => {
    const result = checkProviderIds([squad("a", ["1", "2"]), squad("b", ["3", "4"])]);
    expect(result.conclusion).toBe("NO_CURRENT_SNAPSHOT_COLLISION_OBSERVED");
    expect(result.byProvider.sofascore.idsChecked).toBe(4);
  });

  test("a duplicate id within one squad is detected", () => {
    const withDuplicate = squad("a", ["1", "2"], {
      diagnostics: {
        listedEntries: 3,
        malformedEntries: 0,
        excludedCoaches: 0,
        unknownPositionLabels: 0,
        duplicateIds: ["2"],
        otherLists: { foreign: null, national: null },
      },
    });
    const result = checkProviderIds([withDuplicate, squad("b", ["3"])]);
    expect(result.conclusion).toBe("PROVIDER_ID_COLLISION_NEEDS_REVIEW");
    expect(result.byProvider.sofascore.duplicateWithinSquad).toEqual([
      { clubKey: "a", externalPlayerId: "2" },
    ]);
  });

  test("the same id in two clubs is detected, with identical attributes", () => {
    const result = checkProviderIds([squad("a", ["1", "2"]), squad("b", ["2", "3"])]);
    expect(result.conclusion).toBe("PROVIDER_ID_COLLISION_NEEDS_REVIEW");
    expect(result.byProvider.sofascore.idsInMultipleClubs).toEqual([
      { externalPlayerId: "2", clubKeys: ["a", "b"] },
    ]);
    expect(result.byProvider.sofascore.conflictingAttributes).toEqual([]);
  });

  test("the same id with conflicting attributes in two clubs is reported separately", () => {
    const a = squad("a", ["2"]);
    const b = squad(
      "b",
      ["2"],
      {},
      { positionSignal: "G", signalValues: { birthDate: "1990-02-02" } },
    );
    const result = checkProviderIds([a, b]);
    expect(result.byProvider.sofascore.conflictingAttributes).toEqual(["2"]);
    expect(result.conclusion).toBe("PROVIDER_ID_COLLISION_NEEDS_REVIEW");
  });

  test("names are not compared: a different name alone is not a conflicting attribute", () => {
    const a = squad("a", ["2"]);
    const b = squad("b", ["2"], {}, { private: { displayName: "Another Name" } });
    expect(checkProviderIds([a, b]).byProvider.sofascore.conflictingAttributes).toEqual([]);
  });

  test("ids of different providers never collide with each other", () => {
    const flash = squad("a", ["1"], { provider: "flashscore" }, { provider: "flashscore" });
    const result = checkProviderIds([squad("a", ["1"]), flash]);
    expect(result.conclusion).toBe("NO_CURRENT_SNAPSHOT_COLLISION_OBSERVED");
  });

  test("the conclusion makes no claim about other seasons", () => {
    const result = checkProviderIds([squad("a", ["1"])]);
    expect([
      "NO_CURRENT_SNAPSHOT_COLLISION_OBSERVED",
      "PROVIDER_ID_COLLISION_NEEDS_REVIEW",
    ]).toContain(result.conclusion);
  });
});
