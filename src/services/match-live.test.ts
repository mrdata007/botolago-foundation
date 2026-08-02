import { describe, expect, it } from "vitest";
import type {
  MatchStatisticComparisonDto,
  MatchTimelineItemDto,
} from "@/backend/football/contracts";
import { elapsedMinutes, presentMatchLiveDetail } from "./match-live";
import type { Match } from "@/types/domain";

const base: Match = {
  id: "00000000-0000-4000-8000-000000000001",
  gameweek: 12,
  homeClubId: "00000000-0000-4000-8000-000000000002",
  awayClubId: "00000000-0000-4000-8000-000000000003",
  kickoff: "2026-07-27T18:00:00.000Z",
  status: "live",
  minute: 67,
  homeScore: 2,
  awayScore: 1,
  venue: { fr: "Stade", ar: "ملعب" },
};

const timeline: MatchTimelineItemDto[] = [
  {
    id: "00000000-0000-4000-8000-000000000011",
    type: "yellow_card",
    detail: "Carton confirmé",
    teamId: base.awayClubId,
    playerId: null,
    relatedPlayerId: null,
    minute: 31,
    addedTime: 0,
    sequence: 2,
    period: "first_half",
  },
  {
    id: "00000000-0000-4000-8000-000000000012",
    type: "goal",
    detail: "But confirmé",
    teamId: base.homeClubId,
    playerId: null,
    relatedPlayerId: null,
    minute: 12,
    addedTime: 0,
    sequence: 1,
    period: "first_half",
  },
  {
    id: "00000000-0000-4000-8000-000000000013",
    type: "period_end",
    detail: null,
    teamId: null,
    playerId: null,
    relatedPlayerId: null,
    minute: 45,
    addedTime: 2,
    sequence: 3,
    period: "first_half",
  },
];

const statistics: MatchStatisticComparisonDto[] = [
  {
    code: "possession",
    label: "Possession",
    valueType: "percentage",
    unit: "%",
    homeValue: 54,
    homeDisplayValue: "54%",
    awayValue: 46,
    awayDisplayValue: "46%",
  },
];

describe("match-live presentation", () => {
  it("never fabricates events or statistics from a non-zero scoreline", () => {
    const detail = presentMatchLiveDetail(base, [], []);

    expect(detail.events).toEqual([]);
    expect(detail.stats).toEqual([]);
    expect(detail.elapsed).toBe(67);
  });

  it("preserves canonical events, orders them, and maps known team sides", () => {
    const detail = presentMatchLiveDetail(base, timeline, statistics);

    expect(detail.events.map((event) => event.id)).toEqual([
      timeline[1]!.id,
      timeline[0]!.id,
      timeline[2]!.id,
    ]);
    expect(detail.events[0]).toMatchObject({
      detail: "But confirmé",
      side: "home",
      clubId: base.homeClubId,
    });
    expect(detail.events[1]).toMatchObject({ side: "away", clubId: base.awayClubId });
    expect(detail.events[2]).toMatchObject({ side: null, clubId: null, addedTime: 2 });
  });

  it("returns canonical statistics without deriving new values", () => {
    expect(presentMatchLiveDetail(base, [], statistics).stats).toEqual(statistics);
  });

  it("treats finished matches as full time and clamps live minutes", () => {
    expect(elapsedMinutes({ status: "finished", minute: undefined })).toBe(90);
    expect(elapsedMinutes({ status: "live", minute: 120 })).toBe(90);
    expect(elapsedMinutes({ status: "scheduled", minute: undefined })).toBe(0);
  });
});
