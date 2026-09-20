import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TanStack Router matches a dot-separated child route (`profile.security.tsx`)
 * only as a descendant of its parent (`profile.tsx`). If that parent renders
 * its own UI without an <Outlet />, the child is matched but never painted:
 * the URL changes and the parent's screen stays put, with no error anywhere.
 *
 * This has now bitten admin.news, admin.staff and profile. This test derives
 * the parent/child pairs from the filenames themselves, so any future parent
 * route fails here the moment it gains a child.
 */
const routesDir = import.meta.dir;

const routeFiles = readdirSync(routesDir).filter(
  (file) => file.endsWith(".tsx") && file !== "__root.tsx",
);

const bases = new Set(routeFiles.map((file) => file.slice(0, -".tsx".length)));

function parentsWithChildren(): Map<string, string[]> {
  const parents = new Map<string, string[]>();
  for (const base of bases) {
    const parts = base.split(".");
    for (let i = 1; i < parts.length; i += 1) {
      const prefix = parts.slice(0, i).join(".");
      // A prefix without its own file is a virtual parent -- nothing to render.
      if (!bases.has(prefix)) continue;
      parents.set(prefix, [...(parents.get(prefix) ?? []), base]);
    }
  }
  return parents;
}

describe("nested file-routes", () => {
  const parents = parentsWithChildren();

  test("the route tree actually has parent/child pairs to check", () => {
    expect(parents.size).toBeGreaterThan(0);
  });

  for (const [parent, children] of [...parents].sort(([a], [b]) => a.localeCompare(b))) {
    test(`${parent}.tsx renders <Outlet /> so ${children.sort().join(", ")} can appear`, () => {
      const source = readFileSync(join(routesDir, `${parent}.tsx`), "utf8");
      expect(source).toContain("<Outlet");
    });
  }
});
