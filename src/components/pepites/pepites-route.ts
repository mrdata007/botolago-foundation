import type { QueryClient } from "@tanstack/react-query";

import {
  RANKING_SORTS,
  type HomeResponse,
  type PositionGroup,
  type RankingSort,
  type VersionResponse,
} from "@/backend/pepites/contracts";
import { PEPITES_PROMOTED } from "@/lib/feature-flags";
import { isUnavailable, unavailableHeaders } from "@/lib/page-availability";
import { isServerRender, prefetchForSsr, ssrAvailability } from "@/lib/ssr-prefetch";

import { homeQueryOptions, pepitesKeys, versionQueryOptions } from "./use-pepites";

/**
 * What a Pépites page's server render tells its response (architecture §7):
 *
 * - `current`: the page shows the current version to everyone: a shared
 *   cache may keep it 10 seconds (the pointer's own lifetime);
 * - `edition`: a week's published edition, which never changes while it is
 *   public: 5 minutes;
 * - `private`: anything else — Pépites off or staff-only, nothing found —
 *   never enters a shared cache.
 *
 * The server always renders as an anonymous reader, so a staff preview is
 * never in a cached page: staff see it once their own session reads it.
 */
export type PepitesPageCache = "current" | "edition" | "private";

export interface PepitesPageLoad {
  readonly cache: PepitesPageCache;
}

export const PEPITES_CACHE_CONTROL: Record<PepitesPageCache, string> = {
  current: "public, max-age=0, s-maxage=10",
  edition: "public, max-age=0, s-maxage=300",
  private: "private, no-store",
};

export function pepitesPageHeaders(loaderData: unknown): Record<string, string> {
  const unavailable = unavailableHeaders(loaderData);
  if (unavailable) return unavailable;
  const cache = (loaderData as PepitesPageLoad | null | undefined)?.cache ?? "private";
  return { "Cache-Control": PEPITES_CACHE_CONTROL[cache] };
}

/** Indexed only once Pépites is promoted and the page is public. */
export function pepitesRobots(loaderData: unknown): "index,follow" | "noindex" {
  if (!PEPITES_PROMOTED || isUnavailable(loaderData)) return "noindex";
  const cache = (loaderData as PepitesPageLoad | null | undefined)?.cache;
  return cache === "current" || cache === "edition" ? "index,follow" : "noindex";
}

/** True when the anonymous reader sees Pépites open, not a staff preview. */
export function isPublicAnswer(value: unknown): boolean {
  const answer = value as { available?: boolean; preview?: boolean } | undefined;
  return answer?.available === true && answer.preview === false;
}

/**
 * The server's first step on every "current" page: the version pointer, as
 * an anonymous reader. Returns it, or undefined when the read failed.
 */
export async function prefetchPointer(
  queryClient: QueryClient,
): Promise<VersionResponse | undefined> {
  const options = versionQueryOptions("anon");
  await prefetchForSsr(queryClient, [{ queryKey: options.queryKey, queryFn: options.queryFn }]);
  return queryClient.getQueryData<VersionResponse>(pepitesKeys.version("anon"));
}

export function pointerCache(pointer: VersionResponse | undefined): PepitesPageCache {
  return isPublicAnswer(pointer) ? "current" : "private";
}

/** The loader of `/pepites`: pointer, then the Top 10 of its version. */
export async function loadPepitesHome(
  queryClient: QueryClient,
): Promise<PepitesPageLoad | ReturnType<typeof ssrAvailability> | null> {
  if (!isServerRender()) return null;
  const pointer = await prefetchPointer(queryClient);
  if (pointer?.available && pointer.version) {
    const options = homeQueryOptions("anon", pointer.version);
    await prefetchForSsr(queryClient, [{ queryKey: options.queryKey, queryFn: options.queryFn }]);
    const home = queryClient.getQueryData<HomeResponse>(options.queryKey);
    if (home && !isPublicAnswer(home)) return ssrAvailability(queryClient) ?? { cache: "private" };
  }
  return ssrAvailability(queryClient) ?? { cache: pointerCache(pointer) };
}

/* ------------------------------------------------------------------ search */

export interface RankingSearch {
  poste?: "gk" | "def" | "mid" | "fwd";
  age?: 19 | 21;
  tri?: Exclude<RankingSort, "score">;
}

const POSTES = { gk: "GK", def: "DEF", mid: "MID", fwd: "FWD" } as const;

export function validateRankingSearch(search: Record<string, unknown>): RankingSearch {
  const poste = typeof search.poste === "string" ? search.poste.toLowerCase() : "";
  const age = Number(search.age);
  const tri = typeof search.tri === "string" ? search.tri : "";
  return {
    ...(poste in POSTES ? { poste: poste as RankingSearch["poste"] } : {}),
    ...(age === 19 || age === 21 ? { age } : {}),
    ...(tri !== "score" && (RANKING_SORTS as readonly string[]).includes(tri)
      ? { tri: tri as RankingSearch["tri"] }
      : {}),
  };
}

export function rankingFiltersFromSearch(search: RankingSearch): {
  position: PositionGroup | null;
  maxAge: number | null;
  sort: RankingSort;
} {
  return {
    position: search.poste ? POSTES[search.poste] : null,
    maxAge: search.age ?? null,
    sort: search.tri ?? "score",
  };
}

export function rankingSearchFromFilters(filters: {
  position: PositionGroup | null;
  maxAge: number | null;
  sort: RankingSort;
}): RankingSearch {
  const poste = filters.position
    ? (Object.keys(POSTES) as Array<keyof typeof POSTES>).find(
        (key) => POSTES[key] === filters.position,
      )
    : undefined;
  return {
    ...(poste ? { poste } : {}),
    ...(filters.maxAge === 19 || filters.maxAge === 21 ? { age: filters.maxAge } : {}),
    ...(filters.sort !== "score" ? { tri: filters.sort } : {}),
  };
}

export interface PlayerSearch {
  onglet?: "matchs";
}

export function validatePlayerSearch(search: Record<string, unknown>): PlayerSearch {
  return search.onglet === "matchs" ? { onglet: "matchs" } : {};
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPlayerId(value: string): boolean {
  return UUID.test(value);
}

/** A week number from the address, or null when it is not one. */
export function parseWeek(value: string): number | null {
  if (!/^\d{1,2}$/.test(value)) return null;
  const week = Number(value);
  return week >= 1 && week <= 60 ? week : null;
}
