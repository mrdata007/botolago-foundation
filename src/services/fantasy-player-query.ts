import {
  isCancelledError,
  queryOptions,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { fantasyService } from "@/services/fantasy-runtime";
import { MAX_QUERY_RETRIES } from "@/services/query-client";

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

/**
 * How recent a failed pool read must be for a retrying read to take its
 * answer rather than read the pool again (see `cachedPool`): longer than a
 * retry's wait (one to two seconds), far shorter than anyone waits to try
 * again by hand.
 */
const POOL_FAILURE_REUSE_MS = 10_000;

/**
 * The pool as a read that needs it takes it: the cached copy while it is
 * fresh (five minutes, `@/services/query-client`), else one read, shared with
 * any screen asking for it at the same moment.
 *
 * The read is the pool's own query, with the pool's own retry, whoever starts
 * it: a screen that joins a read started here (the Fantasy tab opened while
 * Home's trending players load the pool) keeps its one retry, and so does the
 * read that asked for it here.
 *
 * `reader` is the query asking. When it is on its own retry (it failed once)
 * and the pool's last read failed moments ago after using its retry, the
 * reader takes that failure instead of reading the pool again: two pool
 * reads in all, as the one-retry rule wants, not four. A pool read still on
 * its way is joined; one that failed without its retry (cancelled when its
 * last screen closed) is read again.
 *
 * A pool read cancelled under a waiting reader (a screen refetching the pool)
 * hands the reader to the new read.
 */
function cachedPool(client: QueryClient, reader: QueryKey) {
  const retrying = (client.getQueryState(reader)?.fetchFailureCount ?? 0) > 0;
  const pool = client.getQueryState(fantasyPlayersQuery().queryKey);
  if (
    retrying &&
    pool?.status === "error" &&
    pool.fetchStatus === "idle" &&
    pool.fetchFailureCount > MAX_QUERY_RETRIES &&
    Date.now() - pool.errorUpdatedAt < POOL_FAILURE_REUSE_MS
  ) {
    return Promise.reject(pool.error);
  }
  const read = () => client.fetchQuery(fantasyPlayersQuery());
  return read().catch((error: unknown) => {
    if (!isCancelledError(error)) throw error;
    // A pool read cancelled under this one is a screen refetching the pool:
    // take the new read instead. Passed on as is, the cancellation would
    // fail this read for nothing, or leave it waiting for good once its own
    // retry is spent (React Query records a silent cancellation as no error).
    return read().catch((again: unknown) => {
      throw isCancelledError(again) ? new Error("fantasy_pool_read_cancelled") : again;
    });
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
export function fantasyPlayerQuery(playerId: string) {
  return queryOptions({
    queryKey: ["fantasy-player", playerId],
    queryFn: async ({ client, queryKey }) =>
      (await cachedPool(client, queryKey)).find((player) => player.id === playerId) ?? null,
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
    queryFn: ({ client, queryKey }) =>
      fantasyService.getTrendingPlayers(() => cachedPool(client, queryKey)),
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
    queryFn: ({ client, queryKey }) =>
      fantasyService.getTopPlayersOfWeek(gameweek, () => cachedPool(client, queryKey)),
  });
}
