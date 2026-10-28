import { describe, expect, it } from "bun:test";

import { matchDaySet, narrowRound, overlayDay, roundOfDay, summariseRound } from "./match-round";
import type { Match } from "@/types/domain";

/** A match; the hour is in UTC and Morocco is UTC+0 since 2026-09-20. */
function match(
  id: string,
  round: number,
  kickoff: string,
  status: Match["status"] = "scheduled",
  extra: Partial<Match> = {},
): Match {
  return {
    id,
    gameweek: round,
    homeClubId: `${id}-h`,
    awayClubId: `${id}-a`,
    kickoff,
    status,
    venue: { fr: "", ar: "" },
    ...extra,
  };
}

/** Journée 5 as it stood on Wednesday 28 October 2026 at 12:00. */
const round5 = [
  match("a", 5, "2026-10-24T15:00:00Z", "finished"),
  match("b", 5, "2026-10-24T17:00:00Z", "finished"),
  match("c", 5, "2026-10-25T15:00:00Z", "finished"),
  match("d", 5, "2026-10-28T18:00:00Z"),
  match("e", 5, "2026-10-28T20:00:00Z"),
  match("f", 5, "2026-10-29T17:00:00Z"),
];
const other = [
  match("x", 4, "2026-10-17T15:00:00Z", "finished"),
  match("y", 6, "2026-11-03T15:00:00Z"),
];
const NOW = Date.parse("2026-10-28T12:00:00Z");

describe("summariseRound", () => {
  const summary = summariseRound([...other, ...round5], 5, "2026-10-28", NOW);

  it("counts only the round, and the counts add up to its total", () => {
    expect(summary.total).toBe(6);
    expect(summary.played).toBe(3);
    expect(summary.live).toBe(0);
    expect(summary.upcoming).toBe(3);
    expect(summary.calledOff).toBe(0);
    expect(summary.played + summary.live + summary.upcoming + summary.calledOff).toBe(
      summary.total,
    );
  });

  it("counts the matches on the day asked about, as many as that day lists", () => {
    expect(summary.onDay).toBe(2);
    expect(summariseRound(round5, 5, "2026-10-24", NOW).onDay).toBe(2);
    expect(summariseRound(round5, 5, "2026-10-26", NOW).onDay).toBe(0);
  });

  it("names the earliest match still to kick off as the next one", () => {
    expect(summary.next?.id).toBe("d");
    // Once that one has started, the next is the one after it.
    const later = summariseRound(round5, 5, "2026-10-28", Date.parse("2026-10-28T19:00:00Z"));
    expect(later.next?.id).toBe("e");
  });

  it("offers no next match when none is left, nor for one the feed has not started", () => {
    const done = round5.map((m) => ({ ...m, status: "finished" as const }));
    expect(summariseRound(done, 5, "2026-10-28", NOW).next).toBeNull();
    const lagging = [match("z", 5, "2026-10-28T10:00:00Z")];
    expect(summariseRound(lagging, 5, "2026-10-28", NOW).next).toBeNull();
    expect(summariseRound(lagging, 5, "2026-10-28", NOW).upcoming).toBe(1);
  });

  it("groups the dated matches by day, ascending, earliest first", () => {
    expect(summary.days.map((day) => day.key)).toEqual([
      "2026-10-24",
      "2026-10-25",
      "2026-10-28",
      "2026-10-29",
    ]);
    expect(summary.days[0]!.matches.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("counts live matches on their own and a match called off apart from those to come", () => {
    const mixed = [
      match("l", 5, "2026-10-28T10:00:00Z", "live"),
      match("c", 5, "2026-10-28T11:00:00Z", "postponed", { calledOff: true }),
      match("u", 5, "2026-10-29T11:00:00Z"),
    ];
    const s = summariseRound(mixed, 5, "2026-10-28", NOW);
    expect([s.live, s.calledOff, s.upcoming, s.total]).toEqual([1, 1, 1, 3]);
  });

  it("keeps a match with no confirmed date out of every day, still counted as to come", () => {
    const postponed = match("p", 5, "2026-10-26T00:00:00Z", "postponed", { dateUnconfirmed: true });
    const s = summariseRound([...round5, postponed], 5, "2026-10-26", NOW);
    expect(s.upcoming).toBe(4);
    expect(s.total).toBe(7);
    expect(s.onDay).toBe(0);
    expect(s.undated.map((m) => m.id)).toEqual(["p"]);
    expect(s.days.flatMap((day) => day.matches).some((m) => m.id === "p")).toBe(false);
    expect(s.next?.id).toBe("d");
  });
});

describe("overlayDay", () => {
  it("puts the day's reading over the season's copy, and adds a match the season lacks", () => {
    const live = { ...round5[3]!, status: "live" as const, homeScore: 1, awayScore: 0 };
    const fresh = match("n", 5, "2026-10-28T21:00:00Z");
    const merged = overlayDay(round5, [live, fresh]);
    expect(merged.find((m) => m.id === "d")?.status).toBe("live");
    expect(merged.some((m) => m.id === "n")).toBe(true);
    expect(merged).toHaveLength(round5.length + 1);
    // The figures follow the rows: the match that went live is no longer to come.
    expect(summariseRound(merged, 5, "2026-10-28", NOW).live).toBe(1);
  });

  it("returns the season's list as it is when the day has nothing", () => {
    expect(overlayDay(round5, [])).toBe(round5);
  });
});

describe("matchDaySet", () => {
  it("holds each day with a dated match once, and no day for an undated one", () => {
    const days = matchDaySet([
      ...round5,
      match("p", 5, "2026-10-27T00:00:00Z", "postponed", { dateUnconfirmed: true }),
    ]);
    expect([...days].sort()).toEqual(["2026-10-24", "2026-10-25", "2026-10-28", "2026-10-29"]);
  });

  it("files a late kick-off under the competition's day, not the viewer's", () => {
    // 23:30 UTC is 00:30 on the 29th only in a zone ahead of Morocco's.
    expect(matchDaySet([match("m", 5, "2026-10-28T23:30:00Z")]).has("2026-10-28")).toBe(true);
  });
});

describe("roundOfDay", () => {
  it("is the day's only round, none for an empty day or a match with no round", () => {
    expect(roundOfDay([{ gameweek: 5 }, { gameweek: 5 }])).toBe(5);
    expect(roundOfDay([])).toBeUndefined();
    expect(roundOfDay([{ gameweek: 0 }])).toBeUndefined();
  });

  it("takes the round with most matches on a mixed day, the later one on a tie", () => {
    expect(roundOfDay([{ gameweek: 4 }, { gameweek: 6 }, { gameweek: 6 }])).toBe(6);
    expect(roundOfDay([{ gameweek: 4 }, { gameweek: 4 }, { gameweek: 6 }])).toBe(4);
    expect(roundOfDay([{ gameweek: 4 }, { gameweek: 6 }])).toBe(6);
  });
});

describe("narrowRound", () => {
  const summary = summariseRound(round5, 5, "2026-10-28", NOW);
  const finished = (m: Match) => m.status === "finished";

  it("lists the round's results by day, newest day first and newest match first", () => {
    const narrowed = narrowRound(summary, finished, "desc");
    expect(narrowed.count).toBe(3);
    expect(narrowed.days.map((day) => day.key)).toEqual(["2026-10-25", "2026-10-24"]);
    expect(narrowed.days[1]!.matches.map((m) => m.id)).toEqual(["b", "a"]);
  });

  it("lists what is still to come in calendar order, dropping days left empty", () => {
    const narrowed = narrowRound(summary, (m) => m.status === "scheduled", "asc");
    expect(narrowed.days.map((day) => day.key)).toEqual(["2026-10-28", "2026-10-29"]);
    expect(narrowed.count).toBe(3);
  });

  it("is empty when the round has none, which is when the empty state is true", () => {
    const none = narrowRound(summary, (m) => m.status === "live", "asc");
    expect(none.count).toBe(0);
    expect(none.days).toEqual([]);
  });
});
