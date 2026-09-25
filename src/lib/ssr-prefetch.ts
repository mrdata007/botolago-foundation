import { UNAVAILABLE } from "./page-availability";
import type { DehydrateOptions, QueryClient, QueryFunction, QueryKey } from "@tanstack/react-query";

/**
 * Warm a public page's queries while the server renders it, so its HTML
 * carries the content (matches, table, clubs, articles) instead of loading
 * skeletons. Until 2026-09-24 only article bodies reached the HTML: a crawler
 * that does not run the app saw 330 characters on the home page, 118 and no
 * article link on /news, no table on /matches/standings (audit P1-2).
 *
 * Server only. In the browser the page's own queries load as before, so a
 * navigation is not held up waiting for data. The queries are marked for the
 * router's dehydrate step (`src/router.tsx`), which hands their data to the
 * browser: its first render is then the same page, not a skeleton, and
 * nothing is fetched twice. A failed read leaves the page to its usual
 * loading and error states; `prefetchQuery` never throws.
 */
export const SSR_QUERY_META = { ssr: true } as const;

/**
 * How long a server render waits for its data, all of it: a page that loads
 * in two steps (the season, then its table) shares one deadline. A read still
 * loading at the deadline is cancelled -- no retry, and a read that takes the
 * query's abort signal is aborted -- and left to the browser, like a failed
 * one: the page goes out with its loading state instead of waiting on the
 * database. On 2026-09-25 a crawl of the news articles overloaded production's
 * database and every read timed out; a production build of these pages then
 * took 21 s to answer, retrying reads that kept failing, for data it did not
 * get.
 */
export const SSR_PREFETCH_BUDGET_MS = 3_000;

/** Each render's deadline. The server makes a query client per request (`src/router.tsx`). */
const renderDeadlines = new WeakMap<QueryClient, number>();
const renderQueries = new WeakMap<QueryClient, QueryKey[]>();

/** Failed or timed-out public reads are temporary failures, never empty 200 pages. */
export function ssrAvailability(queryClient: QueryClient) {
  if (!isServerRender()) return undefined;
  const keys = renderQueries.get(queryClient) ?? [];
  return keys.some((key) => queryClient.getQueryState(key)?.status !== "success")
    ? UNAVAILABLE
    : undefined;
}

/**
 * Runs one step of a render's prefetching within what is left of its budget
 * (set by its first step). A step that starts after the deadline starts
 * nothing; one that runs past it has its unfinished queries cancelled.
 */
async function prefetchStep(
  queryClient: QueryClient,
  queryKeys: readonly QueryKey[],
  start: () => Promise<unknown>,
  budgetMs: number,
): Promise<void> {
  renderQueries.set(queryClient, [...(renderQueries.get(queryClient) ?? []), ...queryKeys]);
  const now = Date.now();
  let deadline = renderDeadlines.get(queryClient);
  if (deadline === undefined) {
    deadline = now + budgetMs;
    renderDeadlines.set(queryClient, deadline);
  }
  if (deadline <= now) return;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = await Promise.race([
    start().then(() => false),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(true), deadline - now);
    }),
  ]);
  clearTimeout(timer);
  if (expired) {
    await Promise.all(
      queryKeys.map((queryKey) => queryClient.cancelQueries({ queryKey, exact: true })),
    );
  }
}

/** What the router hands from the server to the browser: marked, loaded queries only. */
export const SSR_DEHYDRATE_OPTIONS: DehydrateOptions = {
  shouldDehydrateQuery: (query) => query.state.status === "success" && query.meta?.ssr === true,
};

export interface SsrQuery {
  readonly queryKey: QueryKey;
  readonly queryFn: QueryFunction;
}

export function isServerRender(): boolean {
  return typeof window === "undefined";
}

export async function prefetchForSsr(
  queryClient: QueryClient,
  queries: readonly SsrQuery[],
  budgetMs: number = SSR_PREFETCH_BUDGET_MS,
): Promise<void> {
  if (!isServerRender()) return;
  await prefetchStep(
    queryClient,
    queries.map((query) => query.queryKey),
    () =>
      Promise.all(
        queries.map((query) =>
          queryClient.prefetchQuery({
            queryKey: query.queryKey,
            queryFn: query.queryFn,
            meta: SSR_QUERY_META,
            retry: false,
          }),
        ),
      ),
    budgetMs,
  );
}

/** The first page of an infinite list (the news feed), for the same handover. */
export async function prefetchFirstPageForSsr<TPage, TParam>(
  queryClient: QueryClient,
  query: {
    readonly queryKey: QueryKey;
    readonly queryFn: (context: { pageParam: TParam; signal: AbortSignal }) => Promise<TPage>;
    readonly initialPageParam: TParam;
    readonly getNextPageParam: (lastPage: TPage) => TParam | undefined | null;
  },
  budgetMs: number = SSR_PREFETCH_BUDGET_MS,
): Promise<void> {
  if (!isServerRender()) return;
  await prefetchStep(
    queryClient,
    [query.queryKey],
    () =>
      queryClient.prefetchInfiniteQuery({
        queryKey: query.queryKey,
        queryFn: ({ pageParam, signal }) =>
          query.queryFn({ pageParam: pageParam as TParam, signal }),
        initialPageParam: query.initialPageParam,
        getNextPageParam: query.getNextPageParam,
        meta: SSR_QUERY_META,
        retry: false,
      }),
    budgetMs,
  );
}
