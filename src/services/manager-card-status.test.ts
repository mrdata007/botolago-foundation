import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import type { ManagerCardStatus } from "@/backend/manager-card/contracts";
import {
  STATUS_OFF,
  ensureManagerCardStatus,
  managerCardStatusFrom,
  managerCardStatusKey,
  managerCardStatusQuery,
  markManagerCardOff,
  readManagerCardStatusOnServer,
  shouldRedirectFromCurva,
} from "./manager-card-status";
import {
  STATUS_FAILURE_TTL_MS,
  STATUS_TIMEOUT_MS,
  STATUS_TTL_MS,
  createStatusReader,
} from "./manager-card-status-server";

const ON: ManagerCardStatus = { enabled: true, minRated: 3, minConfirmed: 5 };

/** A clock and a database the test drives by hand. */
function harness(read: (signal: AbortSignal) => Promise<ManagerCardStatus>, timeoutMs = 25) {
  let now = 1_000_000;
  const calls: number[] = [];
  const reader = createStatusReader({
    read: (signal) => {
      calls.push(now);
      return read(signal);
    },
    now: () => now,
    timeoutMs,
  });
  return {
    reader,
    calls,
    advance(ms: number) {
      now += ms;
    },
  };
}

/** Runs `run` with no `window` (a server render), then puts back whatever was there. */
async function asServer<T>(run: () => Promise<T>): Promise<T> {
  const globals = globalThis as { window?: unknown };
  const previous = globals.window;
  delete globals.window;
  try {
    return await run();
  } finally {
    if (previous !== undefined) globals.window = previous;
  }
}

let consoleSpies: Array<ReturnType<typeof spyOn>> = [];
beforeEach(() => {
  consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
    spyOn(console, method).mockImplementation(() => {}),
  );
});
afterEach(() => {
  const calls = consoleSpies.reduce((total, spy) => total + spy.mock.calls.length, 0);
  for (const spy of consoleSpies) spy.mockRestore();
  expect(calls).toBe(0);
});

describe("the server status read", () => {
  it("answers what the database says and keeps it for 60 seconds", async () => {
    const { reader, calls, advance } = harness(async () => ON);
    expect(await reader()).toEqual(ON);
    advance(STATUS_TTL_MS - 1);
    expect(await reader()).toEqual(ON);
    expect(calls).toHaveLength(1);
    advance(2);
    await reader();
    expect(calls).toHaveLength(2);
  });

  it("reads concurrent requests as one call", async () => {
    let release!: (value: ManagerCardStatus) => void;
    const { reader, calls } = harness(
      () => new Promise<ManagerCardStatus>((resolve) => (release = resolve)),
      500,
    );
    const first = reader();
    const second = reader();
    release(ON);
    expect(await Promise.all([first, second])).toEqual([ON, ON]);
    expect(calls).toHaveLength(1);
  });

  it("reads off, silently, when the database is slower than 800 ms", async () => {
    expect(STATUS_TIMEOUT_MS).toBe(800);
    let aborted = false;
    const { reader } = harness(
      (signal) =>
        new Promise<ManagerCardStatus>(() => {
          signal.addEventListener("abort", () => (aborted = true));
        }),
      15,
    );
    expect(await reader()).toEqual(STATUS_OFF);
    expect(aborted).toBe(true);
  });

  it.each([
    ["a missing function (PGRST202)", () => Promise.reject({ code: "PGRST202", message: "no" })],
    ["an HTTP error", () => Promise.reject(new Error("HTTP 503"))],
    ["a thrown string", () => Promise.reject("boom")],
    ["a malformed answer", () => Promise.resolve({ enabled: "yes" } as never)],
    ["no answer at all", () => Promise.resolve(null as never)],
  ])("reads off with no console call on %s", async (_name, read) => {
    const { reader } = harness(read);
    expect(await reader()).toEqual(STATUS_OFF);
  });

  it("keeps a failure for 10 seconds only, so a hiccup does not hammer the function", async () => {
    let healthy = false;
    const { reader, calls, advance } = harness(async () => {
      if (!healthy) throw new Error("down");
      return ON;
    });
    expect(await reader()).toEqual(STATUS_OFF);
    advance(STATUS_FAILURE_TTL_MS - 1);
    expect(await reader()).toEqual(STATUS_OFF);
    expect(calls).toHaveLength(1);
    healthy = true;
    advance(2);
    expect(await reader()).toEqual(ON);
    expect(calls).toHaveLength(2);
  });

  it("the app's own reader is off when no database answers, and says nothing", async () => {
    // Under `bun test` there is no development fixture branch and no database to read.
    expect(await asServer(() => readManagerCardStatusOnServer())).toEqual(STATUS_OFF);
  });
});

describe("the status query", () => {
  it("is marked for the page's handover and never retried or refetched", () => {
    const query = managerCardStatusQuery();
    expect(query.queryKey).toEqual(["manager-card", "status"]);
    expect(query.queryKey).toEqual(managerCardStatusKey);
    expect(query.staleTime).toBe(Infinity);
    expect(query.gcTime).toBe(Infinity);
    expect(query.retry).toBe(false);
    expect(query.meta).toEqual({ ssr: true });
  });

  it("in the browser answers off with no network call", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.reject(new Error("no network expected")),
    );
    const globals = globalThis as { window?: unknown };
    const previous = globals.window;
    globals.window = {};
    try {
      expect(await managerCardStatusQuery().queryFn()).toEqual(STATUS_OFF);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete globals.window;
      else globals.window = previous;
      fetchSpy.mockRestore();
    }
  });

  it("is filled on the server by the root's beforeLoad, never throwing", async () => {
    const queryClient = new QueryClient();
    expect(managerCardStatusFrom(queryClient)).toEqual(STATUS_OFF);
    await asServer(() => ensureManagerCardStatus(queryClient, "?mc=featureOff"));
    expect(queryClient.getQueryData(managerCardStatusKey)).toEqual(STATUS_OFF);
    expect(queryClient.getQueryState(managerCardStatusKey)?.status).toBe("success");
  });

  it("is not registered for the server-render availability check", async () => {
    // A timed-out status read must not turn a healthy page into a 503 (plan 3.2, rule 1).
    const { ssrAvailability } = await import("@/lib/ssr-prefetch");
    const queryClient = new QueryClient();
    await asServer(() => ensureManagerCardStatus(queryClient, ""));
    expect(ssrAvailability(queryClient)).toBeUndefined();
  });
});

describe("what route guards and components read", () => {
  it("reads what the cache holds, else off", () => {
    const queryClient = new QueryClient();
    expect(managerCardStatusFrom(queryClient)).toEqual(STATUS_OFF);
    queryClient.setQueryData(managerCardStatusKey, ON);
    expect(managerCardStatusFrom(queryClient)).toEqual(ON);
    queryClient.setQueryData(managerCardStatusKey, { enabled: "yes" });
    expect(managerCardStatusFrom(queryClient)).toEqual(STATUS_OFF);
  });

  it("a card read that answers 'switched off' flips the cached status off", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(managerCardStatusKey, ON);
    markManagerCardOff(queryClient);
    expect(managerCardStatusFrom(queryClient)).toEqual(STATUS_OFF);
  });

  it("/curva redirects unless the build AND the database both say yes", () => {
    const on = new QueryClient();
    on.setQueryData(managerCardStatusKey, ON);
    const off = new QueryClient();
    off.setQueryData(managerCardStatusKey, STATUS_OFF);
    const empty = new QueryClient();
    expect(shouldRedirectFromCurva(on, true)).toBe(false);
    expect(shouldRedirectFromCurva(on, false)).toBe(true);
    expect(shouldRedirectFromCurva(off, true)).toBe(true);
    expect(shouldRedirectFromCurva(empty, true)).toBe(true);
    // The default is the build constant, which is on since the owner's launch (2026-10-10).
    expect(shouldRedirectFromCurva(on)).toBe(false);
  });
});
