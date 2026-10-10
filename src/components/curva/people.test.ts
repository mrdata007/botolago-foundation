import { describe, expect, it } from "bun:test";

import { FIXTURES } from "@/backend/manager-card/fixtures";
import type { League } from "@/types/fantasy";

import {
  buildRows,
  CARD_BATCH_LIMIT,
  cardLine,
  cardTeamIds,
  chooseLeague,
  neighbours,
  newlyRated,
  rowReportTargets,
  sameClub,
} from "./people";

const fixture = FIXTURES.rated;
const league = fixture.league!;
const own = fixture.card!;
const members = league.members;

const rows = buildRows(league.standings, members, own.teamId);

const leagueOf = (id: string): League => ({
  id,
  name: id,
  type: "private",
  members: 3,
  rank: 1,
  previousRank: 1,
  score: 0,
});

describe("buildRows: the league's own order, never the rating's", () => {
  it("keeps the standings order, whatever the notes say", () => {
    expect(rows.map((row) => row.standing.rank)).toEqual([1, 2, 3, 4, 5, 6]);
    const ratings = rows.map((row) => row.card?.ovr ?? null);
    // YASMINE (92) is fourth in points and stays fourth: nothing ranks by rating.
    expect(ratings).toEqual([88, 84, 78, 92, 63, null]);
    expect([...ratings].sort()).not.toEqual(ratings);
  });

  it("marks the reader's own row, once", () => {
    expect(rows.filter((row) => row.own).map((row) => row.name)).toEqual(["Ali"]);
  });

  it("names a row by its card, else by its manager, else by its team", () => {
    const standing = league.standings[0]!;
    expect(buildRows([standing], [], null)[0]!.name).toBe(standing.managerName);
    expect(buildRows([{ ...standing, managerName: " " }], [], null)[0]!.name).toBe(
      standing.teamName,
    );
    expect(buildRows([standing], [members[3]!], null)[0]!.name).toBe(members[3]!.name);
  });

  it("recognises the mock's « me » row as the reader's own", () => {
    const row = buildRows([{ ...league.standings[0]!, managerId: "me" }], [], null)[0]!;
    expect(row.own).toBe(true);
  });
});

describe("the batch of cards", () => {
  it("asks for every row up to 100, and always for the reader's own", () => {
    const many = Array.from({ length: 150 }, (_, i) => ({
      ...league.standings[0]!,
      managerId: `t${i}`,
      rank: i + 1,
    }));
    const ids = cardTeamIds(many, "t140");
    expect(ids).toHaveLength(CARD_BATCH_LIMIT);
    expect(ids).toContain("t140");
    expect(cardTeamIds(league.standings, own.teamId)).toHaveLength(6);
  });
});

describe("chooseLeague", () => {
  const uuid = (n: number) => `3c000005-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const leagues = [leagueOf(uuid(1)), leagueOf(uuid(2)), leagueOf(uuid(3))];
  it("prefers the address, then what the phone remembered, then the first", () => {
    expect(chooseLeague(leagues, uuid(2), uuid(3))?.id).toBe(uuid(2));
    expect(chooseLeague(leagues, null, uuid(3))?.id).toBe(uuid(3));
    expect(chooseLeague(leagues)?.id).toBe(uuid(1));
  });
  it("ignores a league that is not one of the manager's", () => {
    expect(chooseLeague(leagues, uuid(9), uuid(8))?.id).toBe(uuid(1));
    expect(chooseLeague([], uuid(1))).toBeNull();
  });
});

describe("G1's excerpt", () => {
  it("shows the row above you, you and the row below", () => {
    expect(neighbours(rows).map((row) => row.name)).toEqual(["OTHMANE", "Ali", "KARIM"]);
  });
  it("shows fewer when you lead or trail", () => {
    expect(neighbours(rows.slice(1)).map((row) => row.own)).toEqual([true, false]);
    expect(neighbours(rows.slice(0, 2)).map((row) => row.own)).toEqual([false, true]);
  });
  it("shows the first rows when the reader is not in the league", () => {
    expect(neighbours(rows.filter((row) => !row.own))).toHaveLength(3);
  });
});

describe("what a row's card says", () => {
  it("is a number and a tier, a count, or nothing", () => {
    expect(cardLine(members[0]!)).toEqual({
      kind: "rated",
      ovr: 78,
      tier: "stade",
      provisional: false,
    });
    expect(cardLine(members[1]!)).toEqual({ kind: "forming", counted: 2, min: 3 });
    expect(cardLine(null)).toEqual({ kind: "none" });
  });
});

describe("M5a's band and the club filter", () => {
  it("names the people first rated in the latest evaluated journée, not the reader", () => {
    const names = newlyRated(rows, 7).map((row) => row.name);
    expect(names).toEqual(["OTHMANE", "KARIM", "YASMINE", "HAMZA"]);
    expect(newlyRated(rows, null)).toEqual([]);
    expect(newlyRated(rows, 9)).toEqual([]);
  });
  it("finds the people who support the reader's club", () => {
    expect(sameClub(rows, own.club!.id).map((row) => row.name)).toEqual(["SALMA"]);
    expect(sameClub(rows, null)).toEqual([]);
  });
});

describe("reporting a name another person chose", () => {
  it("reports the name as shown, and the team's when it differs", () => {
    const targets = rowReportTargets(rows[0]!);
    expect(targets[0]).toMatchObject({ kind: "user", name: "OTHMANE" });
    expect(targets[1]).toMatchObject({ kind: "team", name: "Derb United" });
    expect(targets[0]!.id).toBe(`team:${rows[0]!.standing.managerId}`);
  });
});
