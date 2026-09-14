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

  return {
    status: "ready",
    canCreate: hub.gameweek.status === "open" && new Date(hub.gameweek.deadlineAt).getTime() > now,
  };
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
