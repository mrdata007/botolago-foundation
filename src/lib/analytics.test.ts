import { afterEach, describe, expect, test } from "bun:test";

import {
  ANALYTICS_ACTIVE,
  SELINE_MASK_PATTERNS,
  SELINE_QUEUE_SCRIPT,
  pageviewPath,
  track,
  trackPageview,
} from "./analytics";

const ORIGIN = "https://botolago.com";

describe("pageviewPath: what a page view may say about the address", () => {
  test("keeps the page and the share links' campaign tags", () => {
    expect(
      pageviewPath(
        `${ORIGIN}/pronostics?journee=14&utm_source=share&utm_medium=whatsapp&utm_campaign=pronostics`,
      ),
    ).toBe("/pronostics?utm_source=share&utm_medium=whatsapp&utm_campaign=pronostics");
    expect(pageviewPath(`${ORIGIN}/matches`)).toBe("/matches");
  });

  test("never sends what follows '#': an invite code, a sign-in's tokens", () => {
    const path = pageviewPath(
      `${ORIGIN}/pronostics/ligues/rejoindre#code=A1B2C3D4E5F60718293A4B5C6D7E8F90`,
    );
    expect(path).toBe("/pronostics/ligues/rejoindre");
    expect(pageviewPath(`${ORIGIN}/auth/callback#access_token=secret&type=signup`)).not.toContain(
      "secret",
    );
  });

  test("drops every other query value: codes and unsubscribe tokens", () => {
    expect(pageviewPath(`${ORIGIN}/auth/callback?code=abc123&next=%2F`)).toBe("/auth/callback");
    expect(pageviewPath(`${ORIGIN}/unsubscribe?token=abc.def.ghi`)).toBe("/unsubscribe");
  });

  test("counts a private league's page without its id", () => {
    const id = "00000080-0000-4000-8000-000000000001";
    expect(pageviewPath(`${ORIGIN}/pronostics/ligues/${id}`)).toBe("/pronostics/ligues/*");
    expect(pageviewPath(`${ORIGIN}/fantasy/leagues/${id.toUpperCase()}`)).toBe(
      "/fantasy/leagues/*",
    );
    // Named pages are not ids.
    expect(pageviewPath(`${ORIGIN}/fantasy/leagues/join`)).toBe("/fantasy/leagues/join");
  });

  test("does not count the staff pages at all", () => {
    expect(pageviewPath(`${ORIGIN}/admin`)).toBeNull();
    expect(pageviewPath(`${ORIGIN}/admin/users/00000001-0000-4000-8000-000000000001`)).toBeNull();
    expect(pageviewPath(`${ORIGIN}/administration`)).toBe("/administration");
  });

  test("gives up on what is not an address", () => {
    expect(pageviewPath("not a url")).toBeNull();
  });
});

/**
 * The same rule as Seline's script (cdn.seline.com/seline.js): each pattern
 * is anchored, `*` is one path segment, and the first match is reported in
 * the path's place. An event is masked on the path alone, without the query.
 */
function masked(path: string): string {
  const patterns = SELINE_MASK_PATTERNS.replace(/^\[|\]$/g, "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const hit = patterns.find((p) => new RegExp(`^${p.replace(/\*/g, "[^/]+")}$`).test(path));
  return hit ?? path;
}

describe("the script's masks: what an event may say about the address", () => {
  test("a league page is reported without its id", () => {
    expect(masked("/pronostics/ligues/00000080-0000-4000-8000-000000000001")).toBe(
      "/pronostics/ligues/*",
    );
    expect(masked("/fantasy/leagues/00000080-0000-4000-8000-000000000001")).toBe(
      "/fantasy/leagues/*",
    );
  });

  test("the named pages beside them keep their names", () => {
    expect(masked("/pronostics/ligues/rejoindre")).toBe("/pronostics/ligues/rejoindre");
    expect(masked("/fantasy/leagues/join")).toBe("/fantasy/leagues/join");
    expect(masked("/pronostics/ligues")).toBe("/pronostics/ligues");
    expect(masked("/pronostics")).toBe("/pronostics");
  });

  test("a page view, already cleaned, lands on the same name", () => {
    const id = "00000080-0000-4000-8000-000000000001";
    const path = pageviewPath(`${ORIGIN}/pronostics/ligues/${id}`);
    expect(path).not.toBeNull();
    expect(masked(path ?? "")).toBe("/pronostics/ligues/*");
  });
});

describe("the queue stub", () => {
  test("keeps each call in the shape the script replays on load", () => {
    const sandbox: { window: { seline?: { queue: unknown[] } } } = { window: {} };
    new Function("window", SELINE_QUEUE_SCRIPT)(sandbox.window);
    const stub = sandbox.window.seline as unknown as {
      queue: unknown[];
      track: (...args: unknown[]) => void;
      page: (...args: unknown[]) => void;
    };
    stub.page("/pronostics");
    stub.track("pronostics_share");
    // seline.js: `if (!window.seline || "queue" in window.seline)`, then
    // `d[u.method](...u.args)` for each queued call.
    expect(stub.queue).toEqual([
      { method: "page", args: ["/pronostics"] },
      { method: "track", args: ["pronostics_share"] },
    ]);
  });

  test("leaves the script alone once it has taken the name", () => {
    const loaded = { track: () => {}, page: () => {} };
    const sandbox = { window: { seline: loaded } };
    new Function("window", SELINE_QUEUE_SCRIPT)(sandbox.window);
    expect(sandbox.window.seline).toBe(loaded);
  });
});

describe("track: silent unless measuring", () => {
  const globals = globalThis as { window?: unknown };
  const previous = globals.window;
  afterEach(() => {
    globals.window = previous;
  });

  test("sends nothing outside a production build, whatever the switch says", () => {
    const calls: unknown[][] = [];
    globals.window = {
      seline: {
        track: (...args: unknown[]) => calls.push(["track", ...args]),
        page: (...args: unknown[]) => calls.push(["page", ...args]),
      },
      location: { href: `${ORIGIN}/pronostics`, hostname: "botolago.com" },
    };
    track("pronostics_share");
    trackPageview();
    // The unit tests are not a production build.
    expect(ANALYTICS_ACTIVE).toBe(false);
    expect(calls).toEqual([]);
  });

  test("never throws, even with no window", () => {
    globals.window = undefined;
    expect(() => track("pronostics_signup_click")).not.toThrow();
    expect(() => trackPageview()).not.toThrow();
  });
});
