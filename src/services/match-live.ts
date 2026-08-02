import type {
  MatchStatisticComparisonDto,
  MatchTimelineItemDto,
} from "@/backend/football/contracts";
import type { Match } from "@/types/domain";

/**
 * Provider-independent presentation of canonical match-detail data.
 *
 * Events and statistics are never derived from the scoreline. An empty
 * backend response stays empty so production cannot present invented data.
 */
export interface MatchEvent extends MatchTimelineItemDto {
  readonly side: "home" | "away" | null;
  readonly clubId: string | null;
}

export interface MatchLiveDetail {
  readonly elapsed: number;
  readonly events: readonly MatchEvent[];
  readonly stats: readonly MatchStatisticComparisonDto[];
}

export function elapsedMinutes(match: Pick<Match, "status" | "minute">): number {
  if (match.status === "finished") return 90;
  if (match.status === "live") return Math.max(1, Math.min(match.minute ?? 45, 90));
  return 0;
}

export function presentMatchLiveDetail(
  match: Match,
  timeline: readonly MatchTimelineItemDto[],
  statistics: readonly MatchStatisticComparisonDto[],
): MatchLiveDetail {
  const events = timeline
    .map((event): MatchEvent => {
      const side =
        event.teamId === match.homeClubId
          ? "home"
          : event.teamId === match.awayClubId
            ? "away"
            : null;
      return {
        ...event,
        side,
        clubId: side === null ? null : event.teamId,
      };
    })
    .sort(
      (left, right) =>
        left.minute - right.minute ||
        left.addedTime - right.addedTime ||
        left.sequence - right.sequence,
    );

  return {
    elapsed: elapsedMinutes(match),
    events,
    stats: [...statistics],
  };
}
