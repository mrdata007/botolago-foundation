import { describe, expect, it } from "bun:test";

import { bandGameweek } from "@/lib/band-gameweek";
import type { Club, Match, MatchStatus } from "@/types/domain";
import { bandClubName, bandMatches, voteMayOpen } from "./band-matches";

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
  it("shows the round's matches still to come, by kick-off", () => {
    const payload = [match("c", "09T18:00"), match("a", "08T16:00"), match("b", "08T18:00")];
    expect(ids(bandMatches(payload))).toEqual(["a", "b", "c"]);
  });

  it("puts every live match first, whatever its round, then the round to come", () => {
    const payload = [
      match("next", "08T18:00"),
      match("live-old-round", "08T15:00", "live", 1),
      match("live", "08T16:00", "live"),
    ];
    expect(ids(bandMatches(payload))).toEqual(["live-old-round", "live", "next"]);
  });

  it("follows the round of the next match and leaves out the next round", () => {
    const payload = [
      match("j3", "08T16:00"),
      match("j4", "15T16:00", "scheduled", 4),
      match("unknown-round", "09T16:00", "scheduled", 0),
    ];
    expect(ids(bandMatches(payload))).toEqual(["j3", "unknown-round"]);
  });

  it("keeps a match of unknown round first and takes the round from the next known one", () => {
    const payload = [
      match("unknown-round", "07T16:00", "scheduled", 0),
      match("j3", "08T16:00"),
      match("j4", "15T16:00", "scheduled", 4),
    ];
    expect(ids(bandMatches(payload))).toEqual(["unknown-round", "j3"]);
  });

  it("keeps every match when no round is known", () => {
    const payload = [
      match("b", "15T16:00", "scheduled", 0),
      match("a", "08T16:00", "scheduled", 0),
    ];
    expect(ids(bandMatches(payload))).toEqual(["a", "b"]);
  });

  it("shows a live match with the next round to come once its own round has nothing left", () => {
    const payload = [
      match("live-last-of-j3", "08T16:00", "live"),
      match("j4b", "16T16:00", "scheduled", 4),
      match("j4a", "15T16:00", "scheduled", 4),
    ];
    expect(ids(bandMatches(payload))).toEqual(["live-last-of-j3", "j4a", "j4b"]);
  });

  it("never shows a finished or postponed match", () => {
    const payload = [
      match("done", "07T16:00", "finished", 2),
      match("off", "08T16:00", "postponed", 2),
      match("next", "08T18:00"),
    ];
    expect(ids(bandMatches(payload))).toEqual(["next"]);
  });

  it("is empty with no match to come", () => {
    expect(bandMatches([])).toEqual([]);
    expect(bandMatches([match("done", "07T16:00", "finished")])).toEqual([]);
  });

  /**
   * Review of 2026-10-06: the cards once followed the band's title, which
   * takes Fantasy's open gameweek once it loads in the browser. A rescheduled
   * match of an earlier round, then the next round with Fantasy's gameweek
   * open, rendered one card on the server and eight others after load.
   */
  describe("with a rescheduled match of an earlier round before the next round", () => {
    const now = Date.parse("2026-10-20T12:00:00Z");
    const journee4 = Array.from({ length: 8 }, (_, i) =>
      match(`j4-${i + 1}`, `${24 + Math.floor(i / 3)}T1${4 + (i % 3)}:00`, "scheduled", 4),
    );
    const fantasyOpen = { number: 4, deadline: "2026-10-24T12:00:00Z", isCurrent: true };

    it("shows the next match to be played, whichever gameweek the title names", () => {
      const payload = [match("j2-leftover", "21T19:00", "scheduled", 2), ...journee4];
      // The title changes once Fantasy's gameweek loads in the browser...
      expect([bandGameweek(undefined, 2, now), bandGameweek(fantasyOpen, 2, now)]).toEqual([2, 4]);
      // ...the cards cannot: they are read from the payload alone.
      expect(ids(bandMatches(payload))).toEqual(["j2-leftover"]);
    });

    it("keeps it, live, ahead of the round to come", () => {
      const payload = [match("j2-leftover", "21T19:00", "live", 2), ...journee4];
      expect(ids(bandMatches(payload))).toEqual(["j2-leftover", ...ids(journee4)]);
    });
  });
});

describe("voteMayOpen", () => {
  const at = Date.parse("2026-10-08T12:00:00.000Z");

  it("expects a vote on a match of a known journée still to kick off", () => {
    expect(voteMayOpen(match("next", "08T16:00"), at)).toBe(true);
  });

  it("expects none once the kick-off has passed, though the status still says scheduled", () => {
    expect(voteMayOpen(match("late", "08T11:00"), at)).toBe(false);
  });

  it("expects none on a match with no journée, which the vote does not cover", () => {
    expect(voteMayOpen(match("no-round", "08T16:00", "scheduled", 0), at)).toBe(false);
  });

  it("expects none on a match being played", () => {
    expect(voteMayOpen(match("live", "08T16:00", "live"), at)).toBe(false);
  });
});

describe("bandClubName", () => {
  const club = (name: string, shortName: string): Club => ({
    id: name,
    name: { fr: name, ar: name },
    shortName: { fr: shortName, ar: shortName },
    city: { fr: "", ar: "" },
    primaryColor: "var(--ui-ink)",
    crestPlaceholder: "X",
  });
  const tr = (text: { fr: string }) => text.fr;

  it("names a club by its short name, or its full name when the short one is a code", () => {
    expect(bandClubName(club("Renaissance Club Athletic Zemamra", "RCA Zemamra"), tr)).toBe(
      "RCA Zemamra",
    );
    expect(bandClubName(club("AS FAR", "FAR"), tr)).toBe("AS FAR");
  });
});
