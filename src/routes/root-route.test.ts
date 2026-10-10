import { describe, expect, it } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import { MANAGER_CARD_BUILD } from "@/lib/feature-flags";
import { managerCardStatusKey, rootBeforeLoad } from "@/services/manager-card-status";
import { Route } from "./__root";

/**
 * Curva' only change to the root route (plan 3.2, rule 4): a `beforeLoad` that reads the
 * database's status during the server render. With the build switch off the route object must be
 * what it was before, so there is no `beforeLoad` at all. The build switch is on since the owner's
 * launch (2026-10-10), so the route now carries it.
 */
describe("the root route and the Manager Card status", () => {
  it("has the status beforeLoad, and nothing else new, while the build switch is on", () => {
    expect(MANAGER_CARD_BUILD).toBe(true);
    expect(Route.options.beforeLoad).toBe(rootBeforeLoad);
    expect(Object.keys(Route.options).sort()).toEqual(
      [
        "beforeLoad",
        "component",
        "errorComponent",
        "head",
        "notFoundComponent",
        "shellComponent",
      ].sort(),
    );
  });

  it("registers it only behind the build switch, as a conditional spread", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("./__root.tsx", import.meta.url), "utf8");
    expect(source).toContain("...(MANAGER_CARD_BUILD ? { beforeLoad: rootBeforeLoad } : {}),");
  });

  it("fills the status on the server and does nothing in the browser", async () => {
    // Test files share one process and some leave a `window` behind: set the world up, restore it.
    const globals = globalThis as { window?: unknown };
    const previous = globals.window;
    try {
      delete globals.window;
      const server = new QueryClient();
      await rootBeforeLoad({ context: { queryClient: server }, location: { searchStr: "" } });
      expect(server.getQueryState(managerCardStatusKey)?.status).toBe("success");

      globals.window = {};
      const browser = new QueryClient();
      await rootBeforeLoad({ context: { queryClient: browser }, location: { searchStr: "" } });
      expect(browser.getQueryState(managerCardStatusKey)).toBeUndefined();
    } finally {
      if (previous === undefined) delete globals.window;
      else globals.window = previous;
    }
  });
});
