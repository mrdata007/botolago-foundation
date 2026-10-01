import { describe, expect, test } from "bun:test";
import { CLUB_PROVIDER_TEAMS } from "./club-registry";
import { collectSquads, type CollectedSquad, type FetchJson } from "./collector";
import { assertNoPersonalData, buildEvidence, dobAggregate } from "./evidence";
import { measurePositionAgreement } from "./position-agreement";
import {
  flashPayload,
  flashSquadEntries,
  NOW,
  seconds,
  sofaEntry,
  sofaPayload,
} from "./test-support";

const clubs = CLUB_PROVIDER_TEAMS.slice(0, 2);

/** Sofascore dates: valid, valid (shared), 1 Jan, missing, future, too young, too old, unparseable, and a repeat. */
const dobCases = [
  sofaEntry({
    id: 1,
    dateOfBirthTimestamp: seconds("1995-03-03"),
    dateOfBirth: "1995-03-03T00:00:00+00:00",
  }),
  sofaEntry({
    id: 2,
    dateOfBirthTimestamp: seconds("1995-03-03"),
    dateOfBirth: "1995-03-03T00:00:00+00:00",
  }),
  sofaEntry({
    id: 3,
    dateOfBirthTimestamp: seconds("1999-01-01"),
    dateOfBirth: "1999-01-01T00:00:00+00:00",
  }),
  sofaEntry({ id: 4 }),
  sofaEntry({
    id: 5,
    dateOfBirthTimestamp: seconds("2031-01-02"),
    dateOfBirth: "2031-01-02T00:00:00+00:00",
  }),
  sofaEntry({
    id: 6,
    dateOfBirthTimestamp: seconds("2020-06-01"),
    dateOfBirth: "2020-06-01T00:00:00+00:00",
  }),
  sofaEntry({
    id: 7,
    dateOfBirthTimestamp: seconds("1900-06-01"),
    dateOfBirth: "1900-06-01T00:00:00+00:00",
  }),
  sofaEntry({ id: 8, dateOfBirth: "garbage" }),
  sofaEntry({
    id: 9,
    dateOfBirthTimestamp: seconds("1992-08-08"),
    dateOfBirth: "1992-08-08T00:00:00+00:00",
  }),
];

const collect = (name: (id: number) => string = (id) => `Synthetic Person ${id}`) => {
  const fetchJson: FetchJson = async (provider) => ({
    status: 200,
    body:
      provider === "sofascore"
        ? sofaPayload(
            dobCases.map((entry) => ({ player: { ...entry.player, name: name(entry.player.id) } })),
          )
        : flashPayload(flashSquadEntries(28, "q")),
  });
  return collectSquads({ fetchJson, now: NOW, clubs: clubs.slice(0, 1) });
};

describe("provider DOB aggregate", () => {
  test("counts every state, January 1 and duplicates, with no value", async () => {
    const result = await collect();
    const sofa = result.squads.find((s) => s.provider === "sofascore") as CollectedSquad;
    expect(dobAggregate(sofa)).toEqual({
      players: 9,
      present: 8,
      missing: 1,
      notProvided: 0,
      unparseable: 1,
      future: 1,
      ageBelowMinimum: 1,
      ageAboveMaximum: 1,
      january1: 1,
      valid: 4,
      playersSharingDob: 2,
      duplicateDobValues: 1,
    });
  });

  test("Flashscore carries no date, and says so rather than counting it missing", async () => {
    const result = await collect();
    const flash = result.squads.find((s) => s.provider === "flashscore") as CollectedSquad;
    expect(dobAggregate(flash)).toMatchObject({
      players: 28,
      notProvided: 28,
      missing: 0,
      present: 0,
      valid: 0,
    });
  });
});

describe("sanitized evidence", () => {
  test("has no names, no dates and no player ids when nothing is anomalous", async () => {
    const result = await collect();
    const evidence = buildEvidence(result, measurePositionAgreement([], result.squads));
    const text = JSON.stringify(evidence);
    expect(() => assertNoPersonalData(evidence, result)).not.toThrow();
    expect(text).not.toMatch(/Synthetic Person|Test Player/);
    expect(text.replace(evidence.collectedAt, "")).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(text).not.toContain("1995-03-03");
    expect(evidence.totals.sofascore.dob.valid).toBe(4);
    expect(evidence.idChecks.conclusion).toBe("NO_CURRENT_SNAPSHOT_COLLISION_OBSERVED");
  });

  test("the guard throws if a name or a date of birth reaches the artifact", async () => {
    const result = await collect();
    const evidence = buildEvidence(result, measurePositionAgreement([], result.squads));
    expect(() =>
      assertNoPersonalData({ ...evidence, note: "Synthetic Person 1 was here" }, result),
    ).toThrow(/name/);
    expect(() => assertNoPersonalData({ ...evidence, note: "born 1995-03-03" }, result)).toThrow(
      /date of birth/,
    );
  });

  test("changing names changes nothing in the evidence", async () => {
    const a = await collect((id) => `Alpha Name ${id}`);
    const b = await collect((id) => `Omega Label ${id}`);
    const strip = (r: Awaited<ReturnType<typeof collect>>) =>
      buildEvidence(r, measurePositionAgreement([], r.squads));
    expect(JSON.stringify(strip(a))).toBe(JSON.stringify(strip(b)));
  });

  test("an incomplete squad is listed with its reasons", async () => {
    const fetchJson: FetchJson = async (provider) => ({
      status: 200,
      body:
        provider === "sofascore" ? sofaPayload(dobCases) : flashPayload(flashSquadEntries(16, "q")),
    });
    const result = await collectSquads({ fetchJson, now: NOW, clubs: clubs.slice(0, 1) });
    const evidence = buildEvidence(result, measurePositionAgreement([], result.squads));
    expect(evidence.incompleteSquads.map((s) => s.provider)).toContain("flashscore");
    expect(evidence.totals.flashscore.incompleteSquads).toBe(1);
  });
});
