import { describe, expect, test } from "bun:test";

import { savesData, sectionsToWarm, warmSections, type WarmupRouter } from "./section-warmup";

describe("section warm-up", () => {
  test("warms every bar destination except the page the reader is on", () => {
    expect(sectionsToWarm(["/", "/news", "/fantasy", "/matches"], "/news")).toEqual([
      "/",
      "/fantasy",
      "/matches",
    ]);
  });

  test("respects the data saver", () => {
    expect(savesData({ connection: { saveData: true } })).toBe(true);
    expect(savesData({ connection: { saveData: false } })).toBe(false);
    expect(savesData({})).toBe(false);
    expect(savesData({ connection: { effectiveType: "slow-2g" } })).toBe(true);
    expect(savesData({ connection: { effectiveType: "2g" } })).toBe(true);
    expect(savesData({ connection: { effectiveType: "4g" } })).toBe(false);
  });

  test("loads each path's routes in turn and carries on past a failure", async () => {
    const loaded: string[] = [];
    const router: WarmupRouter = {
      state: { status: "idle" },
      getMatchedRoutes: (path) => [[`root`, path]],
      loadRouteChunk: (route) => {
        loaded.push(route as string);
        return route === "/fantasy" ? Promise.reject(new Error("offline")) : Promise.resolve();
      },
    };
    await warmSections(
      router,
      ["/fantasy", "/matches"],
      (run) => run(),
      (run) => run(),
    );
    expect(loaded).toEqual(["root", "/fantasy", "root", "/matches"]);
  });

  test("waits, without fetching, while the router is in the middle of a navigation", async () => {
    const loaded: string[] = [];
    const waits: number[] = [];
    const router: WarmupRouter = {
      state: { status: "pending" },
      getMatchedRoutes: (path) => [[path]],
      loadRouteChunk: (route) => {
        loaded.push(route as string);
        return Promise.resolve();
      },
    };
    await warmSections(
      router,
      ["/fantasy"],
      (run) => run(),
      (run, ms) => {
        waits.push(ms);
        // The navigation finishes while the warm-up waits for its second look.
        if (waits.length === 2) router.state.status = "idle";
        run();
      },
    );
    expect(waits).toEqual([2000, 1000]);
    expect(loaded).toEqual(["/fantasy"]);
  });
});
