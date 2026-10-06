import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { fantasyService } from "@/services/fantasy-runtime";
import { shouldRetryQuery } from "@/services/query-client";

/**
 * The Fantasy player pool: every player of the season with price and season
 * totals (`fantasyService.getPlayers`, nine reads one after another in cloud
 * mode). The players list, the top players, the header search, the landing
 * page and the team screens all read it under this key; a player's page,
 * Home's trending players and the top players' rows read it through the cache
 * (below) rather than on their own.
 */
export function fantasyPlayersQuery() {
  return queryOptions({
    queryKey: ["fantasy-players"],
    queryFn: () => fantasyService.getPlayers(),
  });
}

/** The failures `cachedPool` passed on: the pool's own query already retried them. */
const poolFailures = new WeakSet<object>();

/**
 * The pool as a read that needs it takes it: the cached copy while it is
 * fresh (five minutes, `@/services/query-client`), else one read, shared with
 * any screen asking for it at the same moment.
 *
 * The read is the pool's own query, with the pool's own retry rule, whoever
 * starts it: a screen that joins a read started here (the Fantasy tab opened
 * while Home's trending players load the pool) keeps its one retry. The
 * reads that take the pool do not retry a failure that came from it
 * (`retryUnlessPoolFailed`): the pool already had its retry, and a retry of
 * the outer read as well would read a failing pool four times instead of
 * twice -- the load the one-retry rule exists to avoid.
 *
 * Nothing should `refetch()` the pool with `cancelRefetch` while a read waits
 * on it here: the cancelled fetch would fail the waiting read too. The only
 * refetches today are error-state retries, which join the fetch instead.
 */
async function cachedPool(client: QueryClient) {
  try {
    return await client.fetchQuery(fantasyPlayersQuery());
  } catch (error) {
    if (typeof error === "object" && error !== null) poolFailures.add(error);
    throw error;
  }
}

/** The app's retry rule, less a failure of the pool (see `cachedPool`). */
export function retryUnlessPoolFailed(failureCount: number, error: unknown): boolean {
  if (typeof error === "object" && error !== null && poolFailures.has(error)) return false;
  return shouldRetryQuery(failureCount, error);
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
export function fantasyPlayerQuery(playerId: string) {
  return queryOptions({
    queryKey: ["fantasy-player", playerId],
    queryFn: async ({ client }) =>
      (await cachedPool(client)).find((player) => player.id === playerId) ?? null,
    retry: retryUnlessPoolFailed,
  });
}

/**
 * Home's trending players: the gameweek's top five, joined with the pool.
 * The pool used to be read again inside this read, the whole of it, even when
 * the list had just loaded it; it now comes through the cache. Same rows, same
 * order, same fields (the points from the top-five read).
 */
export function trendingPlayersQuery() {
  return queryOptions({
    queryKey: ["all-players-for-alerts"],
    queryFn: ({ client }) => fantasyService.getTrendingPlayers(() => cachedPool(client)),
    retry: retryUnlessPoolFailed,
  });
}

/**
 * One gameweek's top five with their price, ownership and form, as the top
 * players page shows them. As above: the pool through the cache, the points
 * and minutes from the gameweek's own read. A pool a few minutes old can lag
 * a freshly scored gameweek's form, as the players list and a player's page
 * already do; the points never lag.
 */
export function topPlayersOfWeekQuery(gameweek: number) {
  return queryOptions({
    queryKey: ["top-players", gameweek],
    queryFn: ({ client }) => fantasyService.getTopPlayersOfWeek(gameweek, () => cachedPool(client)),
    retry: retryUnlessPoolFailed,
  });
}
