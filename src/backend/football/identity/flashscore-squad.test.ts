import { describe, expect, test } from "bun:test";
import { normalizeFlashscoreSquad } from "./flashscore-squad";
import { flashPayload } from "./test-support";

describe("normalizeFlashscoreSquad", () => {
  test("maps PLAYER_TYPE_ID to a position signal and carries no date of birth", () => {
    const parsed = normalizeFlashscoreSquad(
      flashPayload([
        { id: "AAAA1111", type: "GOALKEEPER", jersey: 1 },
        { id: "BBBB2222", type: "FORWARD", jersey: null },
      ]),
      "TEAM0001",
    );
    expect(parsed.players.map((p) => p.positionSignal)).toEqual(["G", "F"]);
    expect(parsed.players[0]).toMatchObject({
      provider: "flashscore",
      requestedTeamId: "TEAM0001",
      dobSignalState: "not_provided",
      shirtNumber: 1,
    });
    expect(parsed.players[1]!.shirtNumber).toBeNull();
    expect(parsed.players[0]!.signalValues.birthDate).toBeNull();
  });

  test("coaches are excluded and counted, never candidates", () => {
    const parsed = normalizeFlashscoreSquad(
      flashPayload([
        { id: "AAAA1111", type: "COACH" },
        { id: "BBBB2222", type: "DEFENDER" },
      ]),
      "TEAM0001",
    );
    expect(parsed.players.map((p) => p.externalPlayerId)).toEqual(["BBBB2222"]);
    expect(parsed.diagnostics.excludedCoaches).toBe(1);
  });

  test("duplicates and malformed entries are reported", () => {
    const parsed = normalizeFlashscoreSquad(
      {
        DATA: [
          {
            ITEMS: [
              { PLAYER_ID: "AAAA1111", PLAYER_TYPE_ID: "DEFENDER" },
              { PLAYER_ID: "AAAA1111", PLAYER_TYPE_ID: "DEFENDER" },
              { PLAYER_ID: 5 },
            ],
          },
        ],
      },
      "TEAM0001",
    );
    expect(parsed.players).toHaveLength(1);
    expect(parsed.diagnostics.duplicateIds).toEqual(["AAAA1111"]);
    expect(parsed.diagnostics.malformedEntries).toBe(1);
  });

  test("a response that is not a squad is flagged", () => {
    expect(normalizeFlashscoreSquad({}, "TEAM0001").structureOk).toBe(false);
  });

  test("an unknown PLAYER_TYPE_ID is no signal", () => {
    const parsed = normalizeFlashscoreSquad(
      flashPayload([{ id: "AAAA1111", type: "WIZARD" }]),
      "TEAM0001",
    );
    expect(parsed.players[0]!.positionSignal).toBeNull();
    expect(parsed.diagnostics.unknownPositionLabels).toBe(1);
  });
});
