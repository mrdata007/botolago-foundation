import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The 404 and error screens draw their buttons on plain elements (the router
 * may be what failed), so the kit's own round shape does not reach them by
 * itself. Every pressed control is fully round (DESIGN.md, Shapes); these too.
 */
const root = readFileSync(join(import.meta.dir, "__root.tsx"), "utf8");

describe("the 404 and error buttons", () => {
  it("are fully round, not the 6px control corner", () => {
    const shape = root.slice(
      root.indexOf("const stateActionClass"),
      root.indexOf("function NotFoundBody"),
    );
    expect(shape).toContain("ui.radius.full");
    expect(shape).not.toContain("ui.radius.control");
  });
});
