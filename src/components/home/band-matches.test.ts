import { describe, expect, it } from "bun:test";

import type { Match, MatchStatus } from "@/types/domain";
import { bandMatches } from "./band-matches";

const match = (
  id: string,
  kickoff: string,
  status: MatchStatus = "scheduled",
  gameweek = 3,
): Match => ({
  id,
  gameweek,
  homeClubId: "home",
  awayClubId: "away",
  kickoff: `2026-10-${kickoff}:00.000Z`,
  status,
  venue: { fr: "", ar: "" },
});

const ids = (matches: readonly Match[]) => matches.map((m) => m.id);

describe("bandMatches", () => {
  it("shows the journée's matches still to come, by kick-off", () => {
    const payload = [match("c", "09T18:00"), match("a", "08T16:00"), match("b", "08T18:00")];
    expect(ids(bandMatches(payload, 3))).toEqual(["a", "b", "c"]);
  });

  it("puts every live match first, whatever its round, then the journée to come", () => {
    const payload = [
      match("next", "08T18:00"),
      match("live-old-round", "08T15:00", "live", 1),
      match("live", "08T16:00", "live"),
    ];
    expect(ids(bandMatches(payload, 3))).toEqual(["live-old-round", "live", "next"]);
  });

  it("leaves out another round's matches still to come", () => {
    const payload = [
      match("j3", "08T16:00"),
      match("j4", "15T16:00", "scheduled", 4),
      match("unknown-round", "09T16:00", "scheduled", 0),
    ];
    expect(ids(bandMatches(payload, 3))).toEqual(["j3", "unknown-round"]);
  });

  it("keeps every match when the band names no journée", () => {
    const payload = [match("j4", "15T16:00", "scheduled", 4), match("j3", "08T16:00")];
    expect(ids(bandMatches(payload, undefined))).toEqual(["j3", "j4"]);
  });

  it("falls back to the next match, as before, when the journée has nothing left", () => {
    const payload = [
      match("j4b", "16T16:00", "scheduled", 4),
      match("j4a", "15T16:00", "scheduled", 4),
    ];
    expect(ids(bandMatches(payload, 3))).toEqual(["j4a"]);
  });

  it("shows only the live matches when nothing of the journée is left to play", () => {
    const payload = [match("live", "08T16:00", "live"), match("j4", "15T16:00", "scheduled", 4)];
    expect(ids(bandMatches(payload, 3))).toEqual(["live"]);
  });

  it("never shows a finished or postponed match", () => {
    const payload = [
      match("done", "07T16:00", "finished"),
      match("off", "08T16:00", "postponed"),
      match("next", "08T18:00"),
    ];
    expect(ids(bandMatches(payload, 3))).toEqual(["next"]);
  });

  it("is empty with no match to come", () => {
    expect(bandMatches([], 3)).toEqual([]);
    expect(bandMatches([match("done", "07T16:00", "finished")], 3)).toEqual([]);
  });
});
