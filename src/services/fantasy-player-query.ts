import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { fantasyService } from "@/services/fantasy-runtime";

/**
 * The Fantasy player pool: every player of the season with price and season
 * totals (`fantasyService.getPlayers`, nine reads one after another in cloud
 * mode). The players list, the top players, the header search, the landing
 * page and the team screens all read it under this key.
 */
export function fantasyPlayersQuery() {
  return queryOptions({
    queryKey: ["fantasy-players"],
    queryFn: () => fantasyService.getPlayers(),
  });
}

/**
 * One player, for the player page: read from the pool rather than on its own.
 *
 * `fantasyService.getPlayer(id)` is the whole pool with one player picked out
 * of it (`fantasy-runtime.ts`), so opening a player from the list, where the
 * pool is already in the cache, used to read all of it again -- nine reads in
 * a row, about two seconds -- before the page showed. Through the cache, a
 * pool that is still fresh is reused and the page opens at once; a stale or
 * missing one is read once (and shared with any other screen asking for it at
 * the same moment), which is what `getPlayer` did every time. Same player,
 * same fields: the page's data does not change, only how often it is read.
 */
export function fantasyPlayerQuery(queryClient: QueryClient, playerId: string) {
  return queryOptions({
    queryKey: ["fantasy-player", playerId],
    queryFn: async () =>
      (await queryClient.fetchQuery(fantasyPlayersQuery())).find(
        (player) => player.id === playerId,
      ) ?? null,
  });
}
