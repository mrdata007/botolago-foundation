import { isCancelledError, queryOptions, type QueryClient } from "@tanstack/react-query";
import { fantasyService } from "@/services/fantasy-runtime";
import { FANTASY_POOL_STALE_MS } from "@/services/query-client";
import type { FantasyPlayer } from "@/types/fantasy";

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
 * The season's pool for a read that needs it (a player's page, Home's
 * trending players, the top players' rows):
 *
 * 1. the cached pool while it is fresh (five minutes, `@/services/query-client`);
 * 2. else the pool read already on its way for a screen, joined -- it keeps
 *    that screen's own retry, and a read cancelled under it (a screen
 *    refetching the pool) hands over to the new one;
 * 3. else a read of its own, as part of the read asking (whose one retry
 *    covers it), shared with every other read asking at the same moment
 *    (`readPoolOnce`) and stored in the cache for every screen.
 *
 * It never starts the pool's query itself. Starting it from inside another
 * read tangled the two reads' retries: a read that started the pool with no
 * retry left a screen joining it without one, and one that started it with
 * its retry read a failing pool four times. This way each read keeps its own
 * one retry: a failing pool costs two reads through this read alone; when a
 * screen reads the pool at the same time, each keeps its own retry, up to
 * four reads between them, as before these reads shared the pool.
 */
async function sharedPool(client: QueryClient): Promise<FantasyPlayer[]> {
  const key = fantasyPlayersQuery().queryKey;
  for (let joined = 0; ; joined += 1) {
    const pool = client.getQueryState<FantasyPlayer[]>(key);
    if (
      pool?.data &&
      !pool.isInvalidated &&
      Date.now() - pool.dataUpdatedAt < FANTASY_POOL_STALE_MS
    ) {
      return pool.data;
    }
    if (pool && pool.fetchStatus !== "idle" && joined < 2) {
      try {
        return await client.fetchQuery(fantasyPlayersQuery());
      } catch (error) {
        if (isCancelledError(error)) continue;
        throw error;
      }
    }
    return readPoolOnce(client);
  }
}

/** The pool read `sharedPool` started itself, per query client, while it is on its way. */
const ownReads = new WeakMap<QueryClient, Promise<FantasyPlayer[]>>();

/**
 * Step 3 of `sharedPool`: one read of the pool, shared by every read asking
 * while it is on its way -- several player pages loaded ahead at once (a
 * finger scrolling the list touches a row per swipe) read the pool once, not
 * once each. Per query client, so a server render's reads stay its own.
 *
 * Stored as of when it began, and not over a newer copy a screen's own read
 * brought in meanwhile; the reads then take that newer copy, so the page and
 * the list agree.
 */
function readPoolOnce(client: QueryClient): Promise<FantasyPlayer[]> {
  const onItsWay = ownReads.get(client);
  if (onItsWay) return onItsWay;
  const key = fantasyPlayersQuery().queryKey;
  const startedAt = Date.now();
  const read = fantasyService
    .getPlayers()
    .then((players) => {
      if ((client.getQueryState(key)?.dataUpdatedAt ?? 0) <= startedAt) {
        client.setQueryData(key, players, { updatedAt: startedAt });
        return players;
      }
      return client.getQueryData<FantasyPlayer[]>(key) ?? players;
    })
    .finally(() => {
      if (ownReads.get(client) === read) ownReads.delete(client);
    });
  ownReads.set(client, read);
  return read;
}

/**
 * One player, for the player page: read from the pool rather than on its own.
 *
 * `fantasyService.getPlayer(id)` is the whole pool with one player picked out
 * of it (`fantasy-runtime.ts`), so opening a player from the list, where the
 * pool is already in the cache, used to read all of it again -- nine reads in
 * a row, about two seconds -- before the page showed. Through the cache, a
 * pool that is still fresh is reused and the page opens at once; a stale or
 * missing one is read once (`sharedPool`: shared with any screen or read
 * asking for it at the same moment), which is what `getPlayer` did every time. Same player,
 * same fields: the page's data does not change, only how often it is read.
 */
export function fantasyPlayerQuery(playerId: string) {
  return queryOptions({
    queryKey: ["fantasy-player", playerId],
    queryFn: async ({ client }) =>
      (await sharedPool(client)).find((player) => player.id === playerId) ?? null,
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
    queryFn: ({ client }) => fantasyService.getTrendingPlayers(() => sharedPool(client)),
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
    queryFn: ({ client }) => fantasyService.getTopPlayersOfWeek(gameweek, () => sharedPool(client)),
  });
}
