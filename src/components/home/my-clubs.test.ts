import { describe, expect, test } from "bun:test";

import type { Match } from "@/types/domain";
import { clubSpotlight, homeClubs } from "./my-clubs";

const CLUB = "club";

let sequence = 0;
function match(overrides: Partial<Match> & { day: number }): Match {
  sequence += 1;
  const { day, ...rest } = overrides;
  return {
    id: `m${String(sequence).padStart(3, "0")}`,
    gameweek: day,
    homeClubId: CLUB,
    awayClubId: "other",
    kickoff: new Date(Date.UTC(2026, 8, day, 18)).toISOString(),
    status: "scheduled",
    venue: { fr: "", ar: "" },
    ...rest,
  };
}

const finished = (day: number) => match({ day, status: "finished", homeScore: 1, awayScore: 0 });

describe("homeClubs", () => {
  const wac = { id: "wac" };
  const rca = { id: "rca" };
  const fus = { id: "fus" };

  test("nothing for a reader with neither a favourite nor a followed club", () => {
    expect(homeClubs(undefined, [])).toEqual([]);
  });

  test("a favourite on its own is a row: Home has nothing else saying when it plays", () => {
    expect(homeClubs(wac, [])).toEqual([{ club: wac, favorite: true }]);
    expect(homeClubs(wac, [wac])).toEqual([{ club: wac, favorite: true }]);
  });

  test("the favourite leads, then the followed clubs in the order given, the favourite never twice", () => {
    expect(homeClubs(wac, [rca, wac, fus])).toEqual([
      { club: wac, favorite: true },
      { club: rca, favorite: false },
      { club: fus, favorite: false },
    ]);
  });

  test("without a favourite, the followed clubs stand alone and none is marked", () => {
    expect(homeClubs(undefined, [fus, rca])).toEqual([
      { club: fus, favorite: false },
      { club: rca, favorite: false },
    ]);
  });
});

describe("clubSpotlight", () => {
  test("the next match is the earliest still to be played", () => {
    const later = match({ day: 20 });
    const sooner = match({ day: 12 });
    expect(clubSpotlight([finished(5), later, sooner], CLUB)).toEqual({
      kind: "next",
      match: sooner,
    });
  });

  test("a match being played is the one shown, ahead of a scheduled one", () => {
    const live = match({ day: 10, status: "live", homeScore: 0, awayScore: 0 });
    expect(clubSpotlight([match({ day: 3 }), live], CLUB)).toEqual({ kind: "next", match: live });
  });

  test("a postponed match is shown, to say its date is to be confirmed, when nothing is scheduled", () => {
    const postponed = match({ day: 8, status: "postponed", dateUnconfirmed: true });
    expect(clubSpotlight([finished(2), postponed], CLUB)).toEqual({
      kind: "postponed",
      match: postponed,
    });
  });

  test("a dated match beats a postponed one, as on the club page", () => {
    const dated = match({ day: 20 });
    const postponed = match({ day: 8, status: "postponed", dateUnconfirmed: true });
    expect(clubSpotlight([postponed, dated], CLUB)).toEqual({ kind: "next", match: dated });
  });

  test("a cancelled or abandoned match is never a date still to come", () => {
    const cancelled = match({ day: 8, status: "postponed", calledOff: true });
    const played = finished(2);
    expect(clubSpotlight([cancelled, played], CLUB)).toEqual({ kind: "result", match: played });
  });

  test("with nothing left to play, the latest result stands in", () => {
    const early = finished(2);
    const latest = finished(9);
    expect(clubSpotlight([early, latest], CLUB)).toEqual({ kind: "result", match: latest });
  });

  test("a club with no fixture and no result says so", () => {
    expect(clubSpotlight([], CLUB)).toEqual({ kind: "none" });
  });
});
