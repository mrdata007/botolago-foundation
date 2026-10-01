import { describe, expect, test } from "bun:test";
import type { ProviderSquad } from "./contracts";
import {
  independentPairs,
  MIN_PAIRS_FOR_POSITION_AGREEMENT,
  measurePositionAgreement,
  type IndependentPair,
} from "./position-agreement";
import { providerPlayer } from "./test-support";

const diagnostics = {
  listedEntries: 0,
  malformedEntries: 0,
  excludedCoaches: 0,
  unknownPositionLabels: 0,
  duplicateIds: [],
  otherLists: { foreign: null, national: null },
};
const build = (n: number, flashPositionFor: (i: number) => "G" | "D" | "M" | "F" | null) => {
  const sofaPlayers = Array.from({ length: n }, (_, i) =>
    providerPlayer({ externalPlayerId: `s${i}`, positionSignal: "M" }),
  );
  const flashPlayers = Array.from({ length: n }, (_, i) =>
    providerPlayer({
      provider: "flashscore",
      externalPlayerId: `f${i}`,
      positionSignal: flashPositionFor(i),
    }),
  );
  const squads: ProviderSquad[] = [
    {
      provider: "sofascore",
      clubKey: "a",
      requestedTeamId: "1",
      status: "ok",
      errorCode: null,
      players: sofaPlayers,
      diagnostics,
      completeness: { state: "COMPLETE", reasons: [] },
    },
    {
      provider: "flashscore",
      clubKey: "a",
      requestedTeamId: "2",
      status: "ok",
      errorCode: null,
      players: flashPlayers,
      diagnostics,
      completeness: { state: "COMPLETE", reasons: [] },
    },
  ];
  const pairs: IndependentPair[] = Array.from({ length: n }, (_, i) => ({
    sofascoreId: `s${i}`,
    flashscoreId: `f${i}`,
  }));
  return { squads, pairs };
};

describe("measurePositionAgreement", () => {
  test("not established without enough independently paired players", () => {
    const { squads, pairs } = build(MIN_PAIRS_FOR_POSITION_AGREEMENT - 1, () => "M");
    expect(measurePositionAgreement(pairs, squads).status).toBe(
      "POSITION_AGREEMENT_NOT_ESTABLISHED",
    );
    expect(measurePositionAgreement([], squads).status).toBe("POSITION_AGREEMENT_NOT_ESTABLISHED");
  });

  test("players whose position is unknown on either side are not counted", () => {
    const { squads, pairs } = build(40, (i) => (i < 20 ? null : "M"));
    const result = measurePositionAgreement(pairs, squads);
    expect(result.bothPositionsKnown).toBe(20);
    expect(result.status).toBe("POSITION_AGREEMENT_NOT_ESTABLISHED");
  });

  test("measured agreement is a count and a matrix, and stays a signal only", () => {
    const { squads, pairs } = build(40, (i) => (i < 30 ? "M" : "D"));
    const result = measurePositionAgreement(pairs, squads);
    expect(result).toMatchObject({
      status: "MEASURED_SIGNAL_ONLY",
      bothPositionsKnown: 40,
      agree: 30,
      disagree: 10,
    });
    if (result.status === "MEASURED_SIGNAL_ONLY")
      expect(result.matrix).toEqual({ M: { M: 30, D: 10 } });
  });
});

describe("independentPairs", () => {
  test("keeps only incident-based pairings with both ids, once each", () => {
    const pairs = independentPairs([
      { identity: "incident", sofascoreId: "1", flashscoreId: "a" },
      { identity: "incident", sofascoreId: "1", flashscoreId: "a" },
      { identity: "shirt", sofascoreId: "2", flashscoreId: "b" },
      { identity: "single_source", sofascoreId: "3", flashscoreId: null },
      { identity: "incident", sofascoreId: null, flashscoreId: "c" },
    ]);
    expect(pairs).toEqual([{ sofascoreId: "1", flashscoreId: "a" }]);
  });
});
