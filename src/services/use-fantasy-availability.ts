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
 * A season opening or a gameweek becoming playable is noticed within this
 * long on a screen left open. It used to be asked every minute on every open
 * tab, one hub read each time.
 */
export const FANTASY_AVAILABILITY_REFRESH_MS = 5 * 60_000;

/**
 * Shared by the home widgets and every Fantasy route.
 *
 * Guarantees a finite outcome: the probe is bounded by a timeout, retried
 * under the app's policy (once, jittered, never for a refusal a retry cannot
 * change), and never blocks child routes — every consumer decides how to
 * render loading / closed / error states for its own screen.
 */
export function useFantasyAvailability() {
  const query = useQuery({
    queryKey: ["fantasy", "availability"],
    queryFn: () => withTimeout(fantasyService.getAvailability(), FANTASY_AVAILABILITY_TIMEOUT_MS),
    staleTime: 30_000,
    refetchInterval: FANTASY_AVAILABILITY_REFRESH_MS,
  });
  const view = toAvailabilityView({
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    data: query.data,
  });
  return { ...query, view };
}
