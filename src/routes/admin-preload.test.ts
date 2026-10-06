import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The app loads a page when a link is about to be followed (`defaultPreload:
 * "intent"`, `src/router.tsx`). Every Admin loader is a staff access check
 * on the server that logs a refusal, so no Admin route may be loaded ahead of
 * a click. A route-level `preload: false` only covers its own loader, which
 * is why each Admin route carries one, and why a new one must too.
 */
const routesDir = import.meta.dir;
const adminRoutes = readdirSync(routesDir).filter(
  (file) => /^admin(\..+)?\.tsx$/.test(file) && !file.includes(".test."),
);

describe("Admin routes and intent preloading", () => {
  test("the router preloads on intent", () => {
    const router = readFileSync(join(routesDir, "..", "router.tsx"), "utf8");
    expect(router).toMatch(/defaultPreload: "intent"/);
  });

  test("there are Admin routes to check", () => {
    expect(adminRoutes.length).toBeGreaterThan(10);
  });

  test.each(adminRoutes)("%s is never loaded ahead of a click", (file) => {
    const source = readFileSync(join(routesDir, file), "utf8");
    if (!/\n\s+loader:/.test(source)) return;
    expect(source).toMatch(/\n\s+preload: false,/);
  });
});
