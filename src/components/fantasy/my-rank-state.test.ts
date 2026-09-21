import { describe, expect, test } from "bun:test";

import { selectMyRankState, selectTeamPresence, type TeamPresence } from "./my-rank-state";
import type { LeagueStanding } from "@/types/fantasy";

const standing: LeagueStanding = {
  managerId: "me",
  managerName: "Youssef B.",
  teamName: "Aigles de Casa",
  rank: 42,
  previousRank: 51,
  gameweekScore: 61,
  totalScore: 1204,
};

const present: TeamPresence = { status: "present", teamName: "Aigles de Casa" };

describe("selectTeamPresence", () => {
  test("a loaded squad is a team, whatever the board says", () => {
    expect(
      selectTeamPresence({
        source: "cloud",
        squadSize: 15,
        teamName: "Aigles de Casa",
        isLoading: false,
      }),
    ).toEqual({ status: "present", teamName: "Aigles de Casa" });
  });

  test("an empty cloud snapshot is an absent team", () => {
    expect(selectTeamPresence({ source: "cloud", squadSize: 0, isLoading: false })).toEqual({
      status: "absent",
    });
  });

  test("a snapshot still loading is unresolved, not a missing team", () => {
    expect(selectTeamPresence({ source: "cloud", squadSize: 0, isLoading: true })).toEqual({
      status: "unresolved",
    });
  });

  test("a failed snapshot is unresolved — a load error is not evidence of no team", () => {
    expect(
      selectTeamPresence({ source: "cloud", squadSize: 0, isLoading: false, errored: true }),
    ).toEqual({ status: "unresolved" });
  });

  test("a signed-out visitor definitively has no team, even while loading", () => {
    expect(selectTeamPresence({ source: "guest", squadSize: 0, isLoading: true })).toEqual({
      status: "absent",
    });
  });

  test("local mode resolves its mock squad like any other team", () => {
    expect(
      selectTeamPresence({ source: "local", squadSize: 15, teamName: "Lions de Rabat" }),
    ).toEqual({ status: "present", teamName: "Lions de Rabat" });
  });

  test("a blank team name is reported as unknown rather than an empty line", () => {
    expect(selectTeamPresence({ source: "cloud", squadSize: 15, teamName: "   " })).toEqual({
      status: "present",
      teamName: null,
    });
  });
});

describe("selectMyRankState", () => {
  test("a standing is shown as a rank", () => {
    expect(selectMyRankState({ standing, presence: present })).toEqual({
      kind: "ranked",
      standing,
    });
  });

  test("a manager with a team and no standing is unranked, never teamless", () => {
    const state = selectMyRankState({ standing: undefined, presence: present });
    expect(state).toEqual({ kind: "unranked", teamName: "Aigles de Casa" });
  });

  test("a manager with no team still gets the create-team state", () => {
    expect(selectMyRankState({ standing: undefined, presence: { status: "absent" } })).toEqual({
      kind: "no_team",
    });
  });

  test("unknown ownership says nothing instead of guessing", () => {
    expect(selectMyRankState({ standing: undefined, presence: { status: "unresolved" } })).toEqual({
      kind: "pending",
    });
  });

  test("a standing wins over an unresolved snapshot — it is proof of a team", () => {
    expect(selectMyRankState({ standing, presence: { status: "unresolved" } })).toEqual({
      kind: "ranked",
      standing,
    });
  });

  test("the pre-gameweek-1 state never reaches the create-team call to action", () => {
    // Every manager is here until the first scores land: a team exists, the
    // board has ranked nobody. This is the regression the card used to have.
    const preLaunch = selectTeamPresence({
      source: "cloud",
      squadSize: 15,
      teamName: "Aigles de Casa",
      isLoading: false,
    });
    expect(selectMyRankState({ standing: undefined, presence: preLaunch }).kind).toBe("unranked");
  });
});
