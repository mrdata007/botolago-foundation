import type { ManagerCardStatus } from "@/backend/manager-card/contracts";

import { managerCardService } from "./manager-card";
import { STATUS_OFF, isStatus } from "./manager-card-status";

/**
 * The server's database read of the Manager Card status (plan section 3.2), kept apart from
 * `manager-card-status.ts` so that the navigation never imports the data layer. Loaded by a
 * dynamic import, on the server only, when a page is rendered with the build switch on.
 */

/**
 * How long the server waits for the database. 800 ms was too tight: on a busy or freshly started
 * server the read often outlasted it, and visitors saw Pépites in Curva's slot.
 */
export const STATUS_TIMEOUT_MS = 2_000;
/**
 * A good answer is kept this long per server instance; a failure for much less. A failure keeps
 * serving the last good answer, if there is one, so a slow moment never flips the menu.
 */
export const STATUS_TTL_MS = 60_000;
export const STATUS_FAILURE_TTL_MS = 10_000;
/** How long the last good answer may stand in for failed reads before the section reads off. */
export const STATUS_GRACE_MS = 5 * 60_000;

interface StatusReaderDeps {
  /** The database read. It is aborted when it outlasts `timeoutMs`. */
  read: (signal: AbortSignal) => Promise<ManagerCardStatus>;
  now: () => number;
  timeoutMs: number;
}

/**
 * The server read, with its memo and single flight. A factory so a test can give it a clock and a
 * database; the app uses `readStatusFromDatabase` below. Never throws, never logs.
 */
export function createStatusReader(deps: StatusReaderDeps): () => Promise<ManagerCardStatus> {
  let memo: { at: number; ttl: number; value: ManagerCardStatus } | null = null;
  let inflight: Promise<ManagerCardStatus> | null = null;
  let lastGood: { at: number; value: ManagerCardStatus } | null = null;

  async function fetchOnce(): Promise<ManagerCardStatus> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const answer = await Promise.race([
        deps.read(controller.signal),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => {
            controller.abort();
            resolve(null);
          }, deps.timeoutMs);
        }),
      ]);
      if (answer !== null && isStatus(answer)) {
        memo = { at: deps.now(), ttl: STATUS_TTL_MS, value: answer };
        lastGood = { at: deps.now(), value: answer };
        return answer;
      }
    } catch {
      // Missing function, HTTP error, malformed answer: the section is off. Silently.
    } finally {
      clearTimeout(timer);
    }
    const fallback =
      lastGood && deps.now() - lastGood.at < STATUS_GRACE_MS ? lastGood.value : STATUS_OFF;
    memo = { at: deps.now(), ttl: STATUS_FAILURE_TTL_MS, value: fallback };
    return fallback;
  }

  return () => {
    if (memo && deps.now() - memo.at < memo.ttl) return Promise.resolve(memo.value);
    inflight ??= fetchOnce().finally(() => {
      inflight = null;
    });
    return inflight;
  };
}

const serverReader = createStatusReader({
  read: (signal) => managerCardService.status(signal),
  now: () => Date.now(),
  timeoutMs: STATUS_TIMEOUT_MS,
});

/** One read per 60 s per server instance, 2 s at most, never throws, never logs. */
export function readStatusFromDatabase(): Promise<ManagerCardStatus> {
  return serverReader();
}
