import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useAuth } from "@/auth/AuthProvider";
import type {
  RankingQuery,
  RankingResponse,
  RankingRow,
  VersionResponse,
} from "@/backend/pepites/contracts";
import { pepitesService } from "@/services/pepites";

import { nextPollDelay, REVEAL_POLL } from "./reveal";

/**
 * Who a Pépites answer was read for: "anon" (a guest, a signed-out reader,
 * the server's render), or the account id. In staff mode a staff account
 * reads data nobody else may see, so every key names its reader, and
 * `forgetAccount` (src/auth/account-queries.ts) removes that account's
 * entries when it leaves the phone.
 */
export type PepitesViewer = "anon" | (string & {});

export const pepitesKeys = {
  all: ["pepites"] as const,
  version: (viewer: PepitesViewer) => ["pepites", viewer, "version"] as const,
  home: (viewer: PepitesViewer, version: string | null) =>
    ["pepites", viewer, "home", version ?? "current"] as const,
  ranking: (viewer: PepitesViewer, query: RankingQuery) =>
    ["pepites", viewer, "ranking", query] as const,
  player: (viewer: PepitesViewer, version: string | null, playerId: string) =>
    ["pepites", viewer, "player", version ?? "current", playerId] as const,
  matches: (viewer: PepitesViewer, playerId: string) =>
    ["pepites", viewer, "matches", playerId] as const,
  edition: (viewer: PepitesViewer, seasonId: string | null, week: number) =>
    ["pepites", viewer, "edition", seasonId ?? "current", week] as const,
  methodology: (viewer: PepitesViewer) => ["pepites", viewer, "methodology"] as const,
  weeklyEmail: (uid: string) => ["pepites", uid, "weekly-email"] as const,
};

/** The reader the current session reads as; "anon" until the session is known. */
export function usePepitesViewer(): PepitesViewer {
  const { user, status } = useAuth();
  return status === "authenticated" && user?.id ? user.id : "anon";
}

/**
 * An anonymous key never holds a staff preview: if the session turned out to
 * be a staff account while the read was in flight, the answer is dropped
 * and the account's own key reads it again.
 */
export function forViewer<T extends { available: boolean; preview?: boolean }>(
  viewer: PepitesViewer,
  response: T,
): T | { available: false } {
  return viewer === "anon" && response.available && response.preview === true
    ? { available: false }
    : response;
}

export function versionQueryOptions(viewer: PepitesViewer) {
  return {
    queryKey: pepitesKeys.version(viewer),
    queryFn: async ({ signal }: { signal?: AbortSignal }) =>
      forViewer(viewer, await pepitesService.version(signal)) as VersionResponse,
    staleTime: 5_000,
    // A page rendered or cached a few seconds ago may hold an older pointer:
    // the browser reads it again as the page opens, and on every return.
    refetchOnMount: "always" as const,
    refetchOnWindowFocus: true,
  };
}

export function homeQueryOptions(viewer: PepitesViewer, version: string | null) {
  return {
    queryKey: pepitesKeys.home(viewer, version),
    queryFn: async ({ signal }: { signal?: AbortSignal }) =>
      forViewer(viewer, await pepitesService.home(version, signal)),
    // A version's content never changes while it is public (§7).
    staleTime: 5 * 60_000,
  };
}

/**
 * The ranking, twenty rows a page, for one set of filters. The key holds the
 * query without its offset: the pages are one list.
 */
export function rankingPagesOptions(viewer: PepitesViewer, base: Omit<RankingQuery, "offset">) {
  return {
    queryKey: pepitesKeys.ranking(viewer, { ...base, offset: 0 }),
    queryFn: async ({ pageParam, signal }: { pageParam: number; signal: AbortSignal }) =>
      forViewer(
        viewer,
        await pepitesService.ranking({ ...base, offset: pageParam }, signal),
      ) as RankingResponse,
    initialPageParam: 0,
    getNextPageParam: (last: RankingResponse, all: readonly RankingResponse[] = [last]) => {
      if (!last.available || !last.found) return undefined;
      const loaded = all.reduce(
        (sum, page) => sum + (page.available && page.rows ? page.rows.length : 0),
        0,
      );
      return loaded < (last.total ?? 0) ? loaded : undefined;
    },
    staleTime: 5 * 60_000,
  };
}

/**
 * The first fifty rows of the current version's ranking, for the figures an
 * edition does not carry (minutes, goals, assists, rating): the Top 10's
 * rows and the leader's strip read them by player.
 */
export function rankingStatsQueryOptions(viewer: PepitesViewer, version: string | null) {
  const query: RankingQuery = {
    version,
    position: null,
    maxAge: null,
    teamId: null,
    sort: "score",
    limit: 50,
    offset: 0,
  };
  return {
    queryKey: pepitesKeys.ranking(viewer, query),
    queryFn: async ({ signal }: { signal?: AbortSignal }) =>
      forViewer(viewer, await pepitesService.ranking(query, signal)) as RankingResponse,
    staleTime: 5 * 60_000,
  };
}

/** Ranking rows by player id. */
export function statsByPlayer(response: RankingResponse | undefined): Map<string, RankingRow> {
  const rows = response?.available && response.rows ? response.rows : [];
  return new Map(rows.map((row) => [row.id, row]));
}

export function playerQueryOptions(
  viewer: PepitesViewer,
  version: string | null,
  playerId: string,
) {
  return {
    queryKey: pepitesKeys.player(viewer, version, playerId),
    queryFn: async ({ signal }: { signal?: AbortSignal }) =>
      forViewer(viewer, await pepitesService.player(version, playerId, signal)),
    staleTime: 5 * 60_000,
  };
}

export function playerMatchesQueryOptions(viewer: PepitesViewer, playerId: string) {
  return {
    queryKey: pepitesKeys.matches(viewer, playerId),
    queryFn: async ({ signal }: { signal?: AbortSignal }) =>
      forViewer(viewer, await pepitesService.playerMatches(playerId, 10, signal)),
    staleTime: 5 * 60_000,
  };
}

export function editionQueryOptions(viewer: PepitesViewer, seasonId: string | null, week: number) {
  return {
    queryKey: pepitesKeys.edition(viewer, seasonId, week),
    queryFn: async ({ signal }: { signal?: AbortSignal }) =>
      forViewer(viewer, await pepitesService.edition(seasonId, week, signal)),
    staleTime: 5 * 60_000,
  };
}

export function methodologyQueryOptions(viewer: PepitesViewer) {
  return {
    queryKey: pepitesKeys.methodology(viewer),
    queryFn: async ({ signal }: { signal?: AbortSignal }) =>
      forViewer(viewer, await pepitesService.methodology(signal)),
    staleTime: 10 * 60_000,
  };
}

/**
 * The version pointer, kept fresh for the reveal: on a timer while a
 * publication is due or late, and whenever the page regains focus. When the
 * version changes, the pages keyed on it load the new edition without a
 * reload.
 *
 * Development builds let the browser tests shorten the timers through
 * `globalThis.__pepitesPoll`; production always uses §7's values.
 */
export function useVersionPointer(viewer: PepitesViewer) {
  const queryClient = useQueryClient();
  const query = useQuery(versionQueryOptions(viewer));
  const pointer = query.data;
  useEffect(() => {
    const intervals = import.meta.env?.PROD
      ? REVEAL_POLL
      : ((globalThis as { __pepitesPoll?: typeof REVEAL_POLL }).__pepitesPoll ?? REVEAL_POLL);
    const delay = nextPollDelay(pointer, Date.now(), Math.random, intervals);
    if (delay === null) return;
    const timer = setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: pepitesKeys.version(viewer), exact: true });
    }, delay);
    return () => clearTimeout(timer);
  }, [pointer, queryClient, query.dataUpdatedAt, viewer]);
  return query;
}

/** The version a page reads its data under, once the pointer is known. */
export function pointerVersion(pointer: VersionResponse | undefined): string | null {
  return pointer?.available ? pointer.version : null;
}
