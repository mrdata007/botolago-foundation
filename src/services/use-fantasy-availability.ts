import { useQuery } from "@tanstack/react-query";
import { fantasyService } from "@/services/fantasy-runtime";
import type { FantasyAvailability } from "@/services/fantasy-availability";

/** Hard upper bound for the availability probe so a hung request can never leave a screen loading forever. */
export const FANTASY_AVAILABILITY_TIMEOUT_MS = 12_000;

export class FantasyAvailabilityTimeoutError extends Error {
  constructor() {
    super("fantasy_availability_timeout");
    this.name = "FantasyAvailabilityTimeoutError";
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new FantasyAvailabilityTimeoutError()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export type FantasyAvailabilityView =
  | { kind: "loading" }
  | { kind: "ready"; canCreate: boolean }
  | { kind: "season_closed" }
  | { kind: "awaiting_gameweek" }
  | { kind: "error"; error: unknown };

export function toAvailabilityView(input: {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data: FantasyAvailability | undefined;
}): FantasyAvailabilityView {
  if (input.data) {
    if (input.data.status === "ready") return { kind: "ready", canCreate: input.data.canCreate };
    return { kind: input.data.status };
  }
  if (input.isError) return { kind: "error", error: input.error };
  if (input.isPending) return { kind: "loading" };
  return { kind: "error", error: new Error("fantasy_availability_unknown") };
}

/**
 * Shared by the home widgets and every Fantasy route.
 *
 * Guarantees a finite outcome: the probe is bounded by a timeout, retried once
 * on failure, and never blocks child routes — every consumer decides how to
 * render loading / closed / error states for its own screen.
 */
export function useFantasyAvailability() {
  const query = useQuery({
    queryKey: ["fantasy", "availability"],
    queryFn: () => withTimeout(fantasyService.getAvailability(), FANTASY_AVAILABILITY_TIMEOUT_MS),
    // No polling (S10, 2026-10-27; it asked every 60 s on every Fantasy screen
    // and on Home). Whether a season is open and a team can be created changes
    // by the gameweek, not by the minute: held 5 minutes, read again when the
    // reader comes back to the tab after that.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
    retryDelay: 1_500,
  });
  const view = toAvailabilityView({
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    data: query.data,
  });
  return { ...query, view };
}
