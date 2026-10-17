import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

import { ui } from "./tokens";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * `ui.hitFloor` (state sweep 2026-10-16, D4): a transparent target of at least
 * the kit's 44px each way, never smaller than the control it sits on. The
 * browser measurement is tests/e2e/dialog-focus-and-taps.e2e.ts; this keeps
 * the token's shape and its three call sites from drifting.
 */
describe("ui.hitFloor", () => {
  it("is out of flow, centred, and max(100%, tap-min) on both axes", () => {
    expect(ui.hitFloor).toContain("relative");
    expect(ui.hitFloor).toContain("after:absolute");
    expect(ui.hitFloor).toContain("after:inset-0");
    expect(ui.hitFloor).toContain("after:m-auto");
    expect(ui.hitFloor).toContain("after:h-[max(100%,var(--ui-tap-min))]");
    expect(ui.hitFloor).toContain("after:w-[max(100%,var(--ui-tap-min))]");
  });

  it("is not the fixed 44px box of hitArea, which would shrink a wide control's target", () => {
    expect(ui.hitFloor).not.toBe(ui.hitArea);
    expect(ui.hitFloor).not.toContain("after:w-[var(--ui-tap-min)]");
  });

  it("is on the points link and on the two filter chips that shrink under 44px", () => {
    expect(read("src/routes/fantasy.points.tsx")).toMatch(/ui\.hitFloor,\s*ui\.text\.meta/);
    expect(read("src/routes/matches.index.tsx")).toContain(
      'cn("min-w-0 shrink max-[359px]:px-2", ui.hitFloor)',
    );
    expect(read("src/routes/matches.standings.tsx")).toContain(
      'cn("min-w-0 shrink max-[359px]:px-2", ui.hitFloor)',
    );
  });
});
