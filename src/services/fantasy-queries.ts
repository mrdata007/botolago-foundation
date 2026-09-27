import { queryOptions, type QueryClient } from "@tanstack/react-query";

import { fantasyService, type FantasyRuntimeService } from "@/services/fantasy-runtime";
import type { FantasyPlayer } from "@/types/fantasy";

/**
 * The player pool changes with prices and injuries, a few times a day. Every
 * read of it downloads up to 20 pages, so it is kept for five minutes and
 * read through one cache entry by every screen that needs it.
 */
export const FANTASY_POOL_STALE_MS = 5 * 60_000;

/** The whole player pool, one cache entry for every screen. */
export function fantasyPlayersQuery(service: FantasyRuntimeService = fantasyService) {
  return queryOptions({
    queryKey: ["fantasy-players"],
    queryFn: () => service.getPlayers(),
    staleTime: FANTASY_POOL_STALE_MS,
  });
}

/**
 * Fixture difficulty for the next gameweeks. Pick Team, the fixtures board
 * and the player page used to hold it under two keys, so it was read twice.
 */
export function fantasyFixtureDifficultyQuery(service: FantasyRuntimeService = fantasyService) {
  return queryOptions({
    queryKey: ["fantasy-fixture-difficulty"],
    queryFn: () => service.getFixtureDifficulty(),
    staleTime: FANTASY_POOL_STALE_MS,
  });
}

/** The pool from the cache, read only when no screen has it yet. */
export function loadFantasyPlayers(
  qc: QueryClient,
  service: FantasyRuntimeService = fantasyService,
): Promise<FantasyPlayer[]> {
  return qc.ensureQueryData(fantasyPlayersQuery(service));
}

/** One player, found in the shared pool rather than by downloading it again. */
export async function loadFantasyPlayer(
  qc: QueryClient,
  id: string,
  service: FantasyRuntimeService = fantasyService,
): Promise<FantasyPlayer | undefined> {
  return (await loadFantasyPlayers(qc, service)).find((player) => player.id === id);
}
