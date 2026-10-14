/**
 * The code of the primary sections, fetched ahead of the tap
 * (docs/engineering/SECTION_LOADING.md).
 *
 * Each page's code is a separate download, and the router keeps the old page
 * on screen until the new page's code is in: on the live site, a first tap on
 * Fantasy waited about 45 files and close to three seconds. Once the page the
 * reader is on has settled, this fetches the other sections' code, one after
 * another and only while the browser is idle, so a tap has nothing left to
 * download. Code only: no loader, no `beforeLoad`, no data, nothing written.
 */

/** The router as this module uses it: route matching, chunk loading, and whether it is busy. */
export type WarmupRouter = {
  getMatchedRoutes: (pathname: string) => readonly [ReadonlyArray<unknown>, ...unknown[]];
  loadRouteChunk: (route: never) => Promise<void> | undefined;
  state: { status: string };
};

/**
 * How long the page must have been settled before anything is fetched. A
 * reader who taps straight away gets the whole connection for that tap: in a
 * throttled run, a warm-up already under way when the tap came made the
 * tapped page arrive later (2.3 s against 1.5 s with no warm-up).
 */
export const WARMUP_DELAY_MS = 2000;

/** How long to wait before looking again while the router is busy with a navigation. */
const BUSY_RETRY_MS = 1000;

type Idle = (run: () => void) => void;

/** The paths to warm: the bar's destinations, other than where the reader is. */
export function sectionsToWarm(destinations: readonly string[], currentPath: string): string[] {
  return destinations.filter((path) => path !== currentPath);
}

/** Whether the reader asked the browser to save data, in which case nothing is fetched early. */
export function savesData(nav: unknown = typeof navigator === "undefined" ? undefined : navigator) {
  const connection = (nav as { connection?: { saveData?: boolean } } | undefined)?.connection;
  return connection?.saveData === true;
}

const defaultIdle: Idle = (run) => {
  if (typeof window === "undefined") return;
  if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 1500);
};

const defaultWait = (run: () => void, ms: number) => {
  setTimeout(run, ms);
};

/**
 * Fetch the code of each path's routes in turn, starting `WARMUP_DELAY_MS`
 * after the call, each one when the browser is next idle and the router is
 * not in the middle of a navigation (the tapped page has the connection to
 * itself). A failure (offline, a deploy that renamed the files) is dropped:
 * the tap then downloads the page as it always did.
 */
export function warmSections(
  router: WarmupRouter,
  paths: readonly string[],
  idle: Idle = defaultIdle,
  wait: (run: () => void, ms: number) => void = defaultWait,
): Promise<void> {
  return new Promise((done) => {
    const queue = [...paths];
    const next = () => {
      if (queue.length === 0) return done();
      idle(() => {
        if (router.state.status !== "idle") return wait(next, BUSY_RETRY_MS);
        const [routes] = router.getMatchedRoutes(queue.shift()!);
        Promise.all(
          routes.map((route) =>
            Promise.resolve(router.loadRouteChunk(route as never)).catch(() => undefined),
          ),
        ).then(next, next);
      });
    };
    wait(next, WARMUP_DELAY_MS);
  });
}
