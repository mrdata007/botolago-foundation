import { describe, expect, test } from "bun:test";
import { normalizeSofascoreSquad } from "./sofascore-squad";
import { NOW, seconds, sofaEntry, sofaPayload } from "./test-support";

describe("normalizeSofascoreSquad", () => {
  test("reads provider id, shirt, position, height, nationality and a valid DOB", () => {
    const parsed = normalizeSofascoreSquad(
      sofaPayload([
        sofaEntry({
          id: 11,
          position: "F",
          shirtNumber: 9,
          height: 181,
          dateOfBirthTimestamp: seconds("1998-05-14"),
          dateOfBirth: "1998-05-14T00:00:00+00:00",
          country: "ma",
          teamId: 100,
        }),
      ]),
      100,
      NOW,
    );
    expect(parsed.structureOk).toBe(true);
    expect(parsed.players[0]).toMatchObject({
      provider: "sofascore",
      externalPlayerId: "11",
      requestedTeamId: "100",
      shirtNumber: 9,
      positionSignal: "F",
      heightSignal: 181,
      nationalitySignal: "alpha2:MA",
      dobSignalState: "valid",
      registeredTeamDisagreement: false,
    });
  });

  test("a missing DOB is missing, not a date", () => {
    const parsed = normalizeSofascoreSquad(sofaPayload([sofaEntry({ id: 12 })]), 100, NOW);
    expect(parsed.players[0]).toMatchObject({ dobSignalState: "missing" });
    expect(parsed.players[0]!.signalValues.birthDate).toBeNull();
  });

  test("a player registered to another team stays in the squad and is only flagged", () => {
    const parsed = normalizeSofascoreSquad(
      sofaPayload([sofaEntry({ id: 21, teamId: 100 }), sofaEntry({ id: 22, teamId: 555 })]),
      100,
      NOW,
    );
    expect(parsed.players.map((p) => p.externalPlayerId)).toEqual(["21", "22"]);
    expect(parsed.players[1]).toMatchObject({
      registeredTeamId: "555",
      registeredTeamDisagreement: true,
      requestedTeamId: "100",
    });
    expect(parsed.players[0]!.registeredTeamDisagreement).toBe(false);
  });

  test("no registered team is no disagreement", () => {
    const parsed = normalizeSofascoreSquad(
      sofaPayload([sofaEntry({ id: 31, teamId: null })]),
      100,
      NOW,
    );
    expect(parsed.players[0]).toMatchObject({
      registeredTeamId: null,
      registeredTeamDisagreement: false,
    });
  });

  test("duplicate ids inside one squad are reported and the first entry is kept", () => {
    const parsed = normalizeSofascoreSquad(
      sofaPayload([
        sofaEntry({ id: 41, shirtNumber: 1 }),
        sofaEntry({ id: 41, shirtNumber: 2 }),
        sofaEntry({ id: 42 }),
      ]),
      100,
      NOW,
    );
    expect(parsed.players).toHaveLength(2);
    expect(parsed.diagnostics.duplicateIds).toEqual(["41"]);
    expect(parsed.players[0]!.shirtNumber).toBe(1);
  });

  test("an unknown position label is no signal; malformed entries are counted", () => {
    const parsed = normalizeSofascoreSquad(
      { players: [sofaEntry({ id: 51, position: "X" }), { player: { name: "no id" } }, null] },
      100,
      NOW,
    );
    expect(parsed.players[0]!.positionSignal).toBeNull();
    expect(parsed.diagnostics.unknownPositionLabels).toBe(1);
    expect(parsed.diagnostics.malformedEntries).toBe(2);
  });

  test("a response that is not a squad is flagged, not guessed at", () => {
    expect(normalizeSofascoreSquad({ error: "x" }, 100, NOW).structureOk).toBe(false);
    expect(normalizeSofascoreSquad(null, 100, NOW).structureOk).toBe(false);
  });

  test("an implausible height is no signal", () => {
    expect(
      normalizeSofascoreSquad(sofaPayload([sofaEntry({ id: 61, height: 20 })]), 100, NOW)
        .players[0]!.heightSignal,
    ).toBeNull();
  });
});
