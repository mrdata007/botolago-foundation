import { describe, expect, it } from "bun:test";
import { compareFantasyRank, type FantasyRankingFacts } from "./ranking";

const base: FantasyRankingFacts = {
  teamId: "00000000-0000-4000-8000-000000000002",
  totalPoints: 100,
  transferHitPoints: 4,
  confirmedTransfers: 3,
  latestFinalizedGameweekScore: 50,
  teamCreatedAt: "2030-01-01T00:00:00Z",
};

describe("Fantasy ranking tie-breaks v1.0", () => {
  it("applies every approved tie-break in order", () => {
    const candidates = [
      { ...base, teamId: "00000000-0000-4000-8000-000000000006", totalPoints: 99 },
      { ...base, teamId: "00000000-0000-4000-8000-000000000005", transferHitPoints: 8 },
      { ...base, teamId: "00000000-0000-4000-8000-000000000004", confirmedTransfers: 4 },
      {
        ...base,
        teamId: "00000000-0000-4000-8000-000000000003",
        latestFinalizedGameweekScore: 40,
      },
      { ...base, teamId: "00000000-0000-4000-8000-000000000002" },
      { ...base, teamId: "00000000-0000-4000-8000-000000000001" },
    ];
    expect(candidates.sort(compareFantasyRank).map((candidate) => candidate.teamId)).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000004",
      "00000000-0000-4000-8000-000000000005",
      "00000000-0000-4000-8000-000000000006",
    ]);
  });
  it("ranks a real zero score ahead of a missing score", () => {
    const scored = { ...base, latestFinalizedGameweekScore: 0 };
    const missing = {
      ...base,
      teamId: "00000000-0000-4000-8000-000000000003",
      latestFinalizedGameweekScore: null,
    };

    expect([missing, scored].sort(compareFantasyRank).map((candidate) => candidate.teamId)).toEqual(
      [scored.teamId, missing.teamId],
    );
  });
});
