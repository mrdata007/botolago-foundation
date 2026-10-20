import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  parseSofascoreDetail,
  parseSofascoreIncidents,
  parseSofascoreLineups,
} from "../../src/backend/football/provider/sofascore-adapter";
import {
  buildProposal,
  findSofascoreMatch,
  observationPayload,
  reviewMarkdown,
  type FixtureSnapshot,
  type SofascoreMatchCapture,
  type SquadMember,
} from "./reviewed-correction";

const read = (name: string) =>
  JSON.parse(
    readFileSync(`tests/fixtures/providers/sofascore/16354496.${name}.json`, "utf8"),
  ) as unknown;
const summary = parseSofascoreDetail(read("detail"));
const lineups = parseSofascoreLineups(read("lineups"));
const incidents = parseSofascoreIncidents(read("incidents"));
const CAPTURED = "2026-10-10T16:00:00.000Z";
const match: SofascoreMatchCapture = {
  matchId: "16354496",
  kickoffAt: summary.kickoffAt,
  homeName: summary.homeName,
  awayName: summary.awayName,
  homeScore: summary.homeScore,
  awayScore: summary.awayScore,
  players: lineups.players,
  incidents,
  capturedAt: CAPTURED,
};
const HOME = "00000000-0000-4000-8000-0000000000a1";
const AWAY = "00000000-0000-4000-8000-0000000000a2";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const letter = { G: "goalkeeper", D: "defender", M: "midfielder", F: "forward" } as const;

/** Every Sofascore player has a reviewed mapping to one of ours. */
function members(options: { unlink?: string[] } = {}): SquadMember[] {
  return lineups.players.map((player, index) => ({
    playerId: uuid(index + 1),
    teamId: player.side === "home" ? HOME : AWAY,
    displayName: `Player ${index + 1}`,
    position: letter[player.position ?? "M"],
    shirtNumber: player.shirtNumber,
    sofascoreId: options.unlink?.includes(player.externalId) ? null : player.externalId,
  }));
}

function snapshot(overrides: Partial<FixtureSnapshot> = {}): FixtureSnapshot {
  const squad = overrides.members ?? members();
  return {
    fixtureId: uuid(9000),
    fixtureExternalId: "19893370",
    kickoffAt: summary.kickoffAt,
    status: "finished",
    finalized: true,
    homeTeamId: HOME,
    awayTeamId: AWAY,
    homeTeamName: "Home FC",
    awayTeamName: "Away FC",
    homeScore: 1,
    awayScore: 0,
    gameweek: 3,
    gameweekStatus: "live",
    adaptiveEnabled: true,
    latestDigest: null,
    latestSource: null,
    members: squad,
    fantasyPlayerIds: squad.map((member) => member.playerId),
    ...overrides,
  };
}

describe("reviewed corrections from Sofascore", () => {
  test("finds the match by kickoff and score, and only then", () => {
    expect(findSofascoreMatch(snapshot(), [match])?.matchId).toBe("16354496");
    expect(findSofascoreMatch(snapshot({ homeScore: 2 }), [match])).toBeNull();
    expect(
      findSofascoreMatch(
        snapshot({
          kickoffAt: new Date(Date.parse(summary.kickoffAt) + 4 * 3_600_000).toISOString(),
        }),
        [match],
      ),
    ).toBeNull();
  });

  test("builds a recordable proposal from a real Botola match", () => {
    const proposal = buildProposal(snapshot(), match);
    expect(proposal.blockers).toEqual([]);
    const starters = proposal.rows.filter((row) => row.started);
    expect(starters).toHaveLength(22);
    for (const row of proposal.rows) {
      expect(row.identity).toBe("linked");
      expect(row.stats.minutes as number).toBeGreaterThanOrEqual(1);
      expect(row.stats.minutes as number).toBeLessThanOrEqual(90);
      expect(row.stats.cleanSheet).toBe(
        (row.stats.minutes as number) >= 60 && row.stats.goalsConceded === 0,
      );
    }
    // The only goal: Tachtach, home, 90+2'.
    const scorer = proposal.rows.find((row) => row.sofascoreId === "1013197")!;
    expect(scorer.stats.goals).toBe(1);
    const totals = (teamId: string) =>
      proposal.rows
        .filter((row) => row.teamId === teamId)
        .reduce((sum, row) => sum + (row.stats.goals as number), 0);
    expect([totals(HOME), totals(AWAY)]).toEqual([1, 0]);
    // A substitute's minutes come from the provider or the substitution time.
    const sub = proposal.rows.find((row) => row.sofascoreId === "2162075")!;
    expect(sub.started).toBe(false);
    expect(sub.stats.minutes as number).toBeLessThanOrEqual(20);
    // Unused substitutes are not rows; they are recorded as not playing.
    const unused = lineups.players.filter(
      (player) =>
        !player.starter && !proposal.rows.some((row) => row.sofascoreId === player.externalId),
    );
    expect(unused.length).toBeGreaterThan(0);
    expect(proposal.verifiedNonParticipants.length).toBe(unused.length);
  });

  test("the payload carries certified evidence for the eight simple fields", () => {
    const payload = observationPayload(
      buildProposal(snapshot(), match),
      "Ali",
      "SportsMonks sent no data",
    );
    const players = payload.players as Array<{ evidence: Record<string, unknown> }>;
    expect(players.length).toBe(buildProposal(snapshot(), match).rows.length);
    expect(Object.keys(players[0]!.evidence).sort()).toEqual([
      "cleanSheet",
      "goals",
      "goalsConceded",
      "minutes",
      "ownGoals",
      "redCards",
      "secondYellowDismissals",
      "yellowCards",
    ]);
    expect(players[0]!.evidence.minutes).toMatchObject({ state: "verified", observedAt: CAPTURED });
    expect(payload).toMatchObject({
      homeScore: 1,
      awayScore: 0,
      disciplineComplete: true,
      participationComplete: true,
    });
    expect(payload.anonymousStarters).toBeUndefined();
  });

  test("an unlinked player is suggested by club and shirt, never by name", () => {
    const keeper = lineups.players.find(
      (player) => player.side === "home" && player.position === "G" && player.starter,
    )!;
    const proposal = buildProposal(
      snapshot({ members: members({ unlink: [keeper.externalId] }) }),
      match,
    );
    const row = proposal.rows.find((r) => r.sofascoreId === keeper.externalId)!;
    expect(row.identity).toBe("suggested");
    expect(proposal.notes.join(" ")).toContain("SUGGESTED");
    expect(reviewMarkdown(proposal)).toContain("**SUGGESTED**");
  });

  test("an unidentified substitute or scorer blocks the proposal", () => {
    const squad = members().filter(
      (member) => member.sofascoreId !== "2162075" && member.sofascoreId !== "1013197",
    );
    const proposal = buildProposal(
      snapshot({ members: squad, fantasyPlayerIds: squad.map((m) => m.playerId) }),
      match,
    );
    expect(proposal.blockers.join(" ")).toContain("Substitute");
    expect(proposal.blockers.join(" ")).toContain("scored or was booked");
    expect(() => observationPayload(proposal, "Ali", "reason text")).toThrow("proposal_blocked");
    // Both clubs have an unidentified player, so neither claims anyone as absent.
    expect(proposal.verifiedNonParticipants).toEqual([]);
  });

  test("a score that does not add up, or a finalized gameweek, blocks", () => {
    expect(buildProposal(snapshot({ homeScore: 2 }), match).blockers.join(" ")).toContain("add up");
    expect(
      buildProposal(snapshot({ gameweekStatus: "finalized" }), match).blockers.join(" "),
    ).toContain("finalized");
    expect(
      buildProposal(snapshot({ adaptiveEnabled: false }), match).blockers.length,
    ).toBeGreaterThan(0);
  });
});
