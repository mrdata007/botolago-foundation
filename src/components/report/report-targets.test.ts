import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isOthersLeague, isOwnStanding, standingReportTargets } from "./report-targets";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("who may report a name", () => {
  test("the reader's own team never carries the action", () => {
    expect(isOwnStanding("me", null)).toBe(true);
    expect(isOwnStanding("team-1", "team-1")).toBe(true);
    expect(isOwnStanding("team-2", "team-1")).toBe(false);
    expect(isOwnStanding("team-2", null)).toBe(false);
    expect(isOwnStanding("team-2", undefined)).toBe(false);
  });

  test("only someone else's private league can be reported", () => {
    expect(isOthersLeague({ type: "private", role: "member" })).toBe(true);
    expect(isOthersLeague({ type: "private", role: "admin" })).toBe(true);
    expect(isOthersLeague({ type: "private", role: undefined })).toBe(true);
    expect(isOthersLeague({ type: "private", role: "owner" })).toBe(false);
    expect(isOthersLeague({ type: "private", role: "creator" })).toBe(false);
    // BotolaGO's own leagues: not a user's choice.
    expect(isOthersLeague({ type: "public", role: "member" })).toBe(false);
    expect(isOthersLeague({ type: "cup", role: undefined })).toBe(false);
  });

  test("a row offers its team, and its manager when the row shows one", () => {
    expect(
      standingReportTargets({ managerId: "t1", teamName: "Aigles", managerName: "Youssef A." }),
    ).toEqual([
      { kind: "team", name: "Aigles", id: "team:t1" },
      { kind: "user", name: "Youssef A.", id: "team:t1" },
    ]);
    expect(
      standingReportTargets({ managerId: "t1", teamName: "Aigles", managerName: "Aigles" }),
    ).toEqual([{ kind: "team", name: "Aigles", id: "team:t1" }]);
    expect(standingReportTargets({ managerId: "t1", teamName: "Aigles", managerName: "" })).toEqual(
      [{ kind: "team", name: "Aigles", id: "team:t1" }],
    );
  });
});

/**
 * Source-shape checks: every surface the brief lists offers the action, and
 * each one gates it on "not mine". A refactor that drops either is caught here
 * rather than by App Review.
 */
describe("the surfaces that show other users' names", () => {
  test.each([
    ["src/routes/fantasy.leagues.$leagueId.tsx", "isOwnStanding(row.managerId, ownTeamId)"],
    ["src/routes/fantasy.leagues.$leagueId.tsx", "isOthersLeague(leagueQ.data)"],
    ["src/routes/fantasy.rankings.tsx", "isMe || isOwnStanding(row.managerId, ownTeamId)"],
    ["src/components/predictions/leagues/LeaguePredictionsStandings.tsx", "!row.isMe && row.name"],
    ["src/components/predictions/leagues/LeaguePage.tsx", "!header.data.league.isOwner"],
    ["src/components/predictions/PredictionsLeaderboard.tsx", "!row.isMe && row.name"],
    ["src/components/prizes/PrizesPage.tsx", "!winner.isMe"],
  ])("%s gates the report on %s", (file, gate) => {
    const source = read(file);
    expect(source).toContain("<ReportNameMenu");
    expect(source).toContain(gate);
  });
});
