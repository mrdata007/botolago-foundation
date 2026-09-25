import type { FantasyHubDto } from "@/backend/fantasy/contracts";
import { mapFantasyError } from "@/backend/fantasy/errors";

export type FantasyUnavailableReason =
  | "season_closed"
  | "awaiting_gameweek"
  | "registration_closed";

export type FantasyAvailability =
  | { status: "ready"; canCreate: boolean }
  | { status: "season_closed" | "awaiting_gameweek" };

/** Only the explicit season-closed response is an expected empty state. */
export async function readFantasyAvailability(
  loadHub: () => Promise<FantasyHubDto>,
  now = Date.now(),
): Promise<FantasyAvailability> {
  let hub: FantasyHubDto;
  try {
    hub = await loadHub();
  } catch (error) {
    if (mapFantasyError(error).code === "fantasy_season_closed") {
      return { status: "season_closed" };
    }
    throw error;
  }

  if (!["registration_open", "active"].includes(hub.season.status)) {
    return { status: "season_closed" };
  }
  if (!hub.gameweek) return { status: "awaiting_gameweek" };

  return { status: "ready", canCreate: enrolmentGameweekOf(hub, now) !== null };
}

export type EnrolmentGameweek = { id: string; sequence: number; deadlineAt: string };

/**
 * The gameweek a new team joins at `now`. A database with migration
 * 20260924200000 names it (`enrolmentGameweek`, possibly the staged next
 * gameweek once the current deadline has passed); an older one does not, and
 * then only the current gameweek qualifies, while it is open and before its
 * deadline. Either way a deadline already behind the clock never qualifies.
 */
export function enrolmentGameweekOf(
  hub: FantasyHubDto,
  now = Date.now(),
): EnrolmentGameweek | null {
  const candidate =
    hub.enrolmentGameweek !== undefined
      ? hub.enrolmentGameweek
      : hub.gameweek?.status === "open"
        ? hub.gameweek
        : null;
  if (!candidate || new Date(candidate.deadlineAt).getTime() <= now) return null;
  return { id: candidate.id, sequence: candidate.sequence, deadlineAt: candidate.deadlineAt };
}

export function fantasyRouteUnavailableReason(
  availability: FantasyAvailability,
  pathname: string,
): FantasyUnavailableReason | null {
  if (availability.status !== "ready") return availability.status;
  if (pathname.replace(/\/+$/, "") === "/fantasy/create" && !availability.canCreate) {
    return "registration_closed";
  }
  return null;
}
