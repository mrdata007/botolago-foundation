import { describe, expect, it } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import { MANAGER_CARD_BUILD } from "@/lib/feature-flags";
import { managerCardStatusKey, rootBeforeLoad } from "@/services/manager-card-status";
import { Route } from "./__root";

/**
 * Curva' only change to the root route (plan 3.2, rule 4): a `beforeLoad` that reads the
 * database's status during the server render, only while the build switch is on (the switch is on
 * since the owner's launch, 2026-10-10). The root's `beforeLoad` also waits, in the browser, for
 * the rest of the French dictionary before a page other than the home page renders
 * (docs/engineering/PERFORMANCE_2026_10_26.md), so the route always has one and the status read
 * sits behind the switch inside it. Section loading (2026-10-14) adds an empty
 * `pendingComponent`, so the router's loading screen stays out of the root.
 */
describe("the root route and the Manager Card status", () => {
  it("has the beforeLoad, and nothing else new, while the build switch is on", () => {
    expect(MANAGER_CARD_BUILD).toBe(true);
    expect(typeof Route.options.beforeLoad).toBe("function");
    expect(Object.keys(Route.options).sort()).toEqual(
      [
        "beforeLoad",
        "component",
        "errorComponent",
        "head",
        "notFoundComponent",
        // Shows nothing while the root is pending: the router's loading screen
        // is for the pages inside it (docs/engineering/SECTION_LOADING.md).
        "pendingComponent",
        "shellComponent",
      ].sort(),
    );
  });

  it("reads the status only behind the build switch", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("./__root.tsx", import.meta.url), "utf8");
    expect(source).toContain("if (MANAGER_CARD_BUILD) await rootBeforeLoad(ctx);");
    expect(source).toContain("await frenchReadyFor(ctx.location.pathname);");
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
