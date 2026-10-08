import { useQuery, type QueryClient } from "@tanstack/react-query";

import type { ManagerCardStatus } from "@/backend/manager-card/contracts";
import { fixtureIdFromSearch } from "@/backend/manager-card/fixture-selection";
import { MANAGER_CARD_BUILD } from "@/lib/feature-flags";

export type { ManagerCardStatus };

/**
 * `typeof window === "undefined"`, the same test as `isServerRender` in `@/lib/ssr-prefetch`,
 * written out here so this module imports nothing the entry chunk does not already hold.
 */
const isServerRender = (): boolean => typeof window === "undefined";

/**
 * Whether Gradins is live (plan section 3.2). Two layers decide: the build constant
 * (`MANAGER_CARD_BUILD`) and the database's own answer, `api.manager_card_status()`, read here on
 * the server only, during the server render, and handed to the browser with the page. The browser
 * never calls the function: a call to one that does not exist yet answers HTTP 404, which every
 * Chromium logs as a console error. Off, missing, failing or slow all read as off, silently.
 *
 * This module is imported by the navigation and by every inline surface, so it is kept SMALL and
 * free of the data layer: the database read lives in `manager-card-status-server.ts`, reached by a
 * dynamic import on the server only. The root route imports this module for every page, which puts
 * it in the entry chunk, so with the build switch off no page asks for a file it did not ask for
 * before (`scripts/qa/manager-card-off-bundle-gate.ts` checks that on the built output). With the
 * switch off nothing in it runs: `useManagerCardLive` is the constant-off hook and
 * `rootBeforeLoad` is not registered.
 */
export const STATUS_OFF: ManagerCardStatus = { enabled: false, minRated: null, minConfirmed: null };
export const managerCardStatusKey = ["manager-card", "status"] as const;

/** What a development server answers when the fixture is anything but `featureOff`. */
const DEV_STATUS_ON: ManagerCardStatus = { enabled: true, minRated: 3, minConfirmed: 5 };

export function isStatus(value: unknown): value is ManagerCardStatus {
  const candidate = value as Partial<ManagerCardStatus> | null;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.enabled === "boolean" &&
    (candidate.minRated === null || typeof candidate.minRated === "number") &&
    (candidate.minConfirmed === null || typeof candidate.minConfirmed === "number")
  );
}

/**
 * Server: one read per 60 s per server instance, 800 ms at most, never throws, never logs. In a
 * development server with mock data it answers from the request's `?mc=` fixture and skips the
 * memo, so switching fixtures between page loads is never masked. The database read itself is
 * `manager-card-status-server.ts`, loaded here on first use.
 */
export async function readManagerCardStatusOnServer(fixture?: string): Promise<ManagerCardStatus> {
  // Development default is mock data, as `selectManagerCardDataMode` says; only `supabase` reads the database.
  if (import.meta.env.DEV && import.meta.env.VITE_MANAGER_CARD_DATA_MODE !== "supabase") {
    return fixture === "featureOff" ? STATUS_OFF : DEV_STATUS_ON;
  }
  try {
    const { readStatusFromDatabase } = await import("./manager-card-status-server");
    return await readStatusFromDatabase();
  } catch {
    return STATUS_OFF;
  }
}

/**
 * The query the root's beforeLoad fills on the server. In the browser its queryFn returns
 * STATUS_OFF with no network call: the browser only ever reads what the server sent. Marked
 * `ssr` so it is dehydrated with the page, and deliberately NOT registered through
 * `prefetchForSsr`, whose keys decide `ssrAvailability`: a timed-out status read must not turn a
 * healthy page into a 503.
 */
export function managerCardStatusQuery(fixture?: string) {
  return {
    queryKey: managerCardStatusKey,
    queryFn: (): Promise<ManagerCardStatus> =>
      isServerRender() ? readManagerCardStatusOnServer(fixture) : Promise.resolve(STATUS_OFF),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false as const,
    meta: { ssr: true } as const,
  };
}

/**
 * Root beforeLoad, server only: fill the status query for this render. beforeLoad (not a loader)
 * because the `/gradins` guard in a child's beforeLoad must see the answer. `search` is the
 * request's raw search string, for the development fixture. Never throws.
 */
export async function ensureManagerCardStatus(
  queryClient: QueryClient,
  search: string,
): Promise<void> {
  if (!isServerRender()) return;
  try {
    const fixture = import.meta.env.DEV ? fixtureIdFromSearch(search) : null;
    await queryClient.fetchQuery(managerCardStatusQuery(fixture ?? undefined));
  } catch {
    // The status never fails a page.
  }
}

/** The root route's `beforeLoad`, registered only when the build switch lets Gradins exist. */
export async function rootBeforeLoad({
  context,
  location,
}: {
  context: { queryClient: QueryClient };
  location: { searchStr?: string };
}): Promise<void> {
  if (!isServerRender()) return;
  await ensureManagerCardStatus(context.queryClient, location.searchStr ?? "");
}

/**
 * Whether `/gradins` and everything under it sends the visitor to Fantasy: the build switch is
 * off, or the status the server read says off, missing or failed. Two layers, both must say yes.
 */
export function shouldRedirectFromGradins(
  queryClient: QueryClient,
  build: boolean = MANAGER_CARD_BUILD,
): boolean {
  return !build || !managerCardStatusFrom(queryClient).enabled;
}

/** Synchronous read for route guards: what the cache holds, else STATUS_OFF. */
export function managerCardStatusFrom(queryClient: QueryClient): ManagerCardStatus {
  const cached = queryClient.getQueryData<ManagerCardStatus>(managerCardStatusKey);
  return isStatus(cached) ? cached : STATUS_OFF;
}

/** A card read that answers "switched off" mid-session flips the cached status off. */
export function markManagerCardOff(queryClient: QueryClient): void {
  queryClient.setQueryData(managerCardStatusKey, STATUS_OFF);
}

function useStatusFromCache(): ManagerCardStatus {
  const query = useQuery(managerCardStatusQuery());
  return isStatus(query.data) ? query.data : STATUS_OFF;
}
function useLiveFromStatus(): boolean {
  return useStatusFromCache().enabled;
}
const useStatusOff = (): ManagerCardStatus => STATUS_OFF;
const useAlwaysOff = (): boolean => false;

/**
 * For components. With the build switch off these are the constant-off hooks (no query at all);
 * the choice is made once, at module level, so no hook is ever called conditionally.
 */
export const useManagerCardLive: () => boolean = MANAGER_CARD_BUILD
  ? useLiveFromStatus
  : useAlwaysOff;
export const useManagerCardStatus: () => ManagerCardStatus = MANAGER_CARD_BUILD
  ? useStatusFromCache
  : useStatusOff;
