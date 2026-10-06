import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

/**
 * With `viewport-fit=cover` an iPhone draws the page under the status bar and
 * the home indicator, so everything pinned to those edges has to pad by
 * `env(safe-area-inset-*)`. Source-shape, because env() is 0 in every test
 * browser; the measured check (Chromium's safe-area override) is in
 * docs/engineering/briefs/store-readiness-in-app.md.
 */
describe("safe areas", () => {
  test("the viewport covers the whole screen", () => {
    expect(read("src/routes/__root.tsx")).toContain(
      'content: "width=device-width, initial-scale=1, viewport-fit=cover"',
    );
  });

  test.each([
    // The shell's own bars, which already padded before this change.
    ["src/components/shell/TopBar.tsx", "ui.safe.top"],
    ["src/components/shell/BottomNav.tsx", "ui.safe.bottom"],
    ["src/components/ui-kit/primitives.tsx", "ui.safe.top"],
    // What this change added.
    ["src/components/ui/sonner.tsx", "calc(env(safe-area-inset-top, 0px) + 16px)"],
    ["src/components/common/ReadingProgress.tsx", "top-[env(safe-area-inset-top,0px)]"],
    ["src/routes/fantasy.players.$playerId.tsx", "pb-[max(env(safe-area-inset-bottom),0.75rem)]"],
    ["src/components/pepites/PepitesReveal.tsx", "pb-[max(env(safe-area-inset-bottom),1.5rem)]"],
    [
      "src/components/fpl/SquadBuilderScreen.tsx",
      "md:pb-[max(env(safe-area-inset-bottom),0.75rem)]",
    ],
    [
      "src/components/fpl/TransferConfirmScreen.tsx",
      "md:pb-[max(env(safe-area-inset-bottom),0.75rem)]",
    ],
    [
      "src/components/predictions/PredictionsStickyBar.tsx",
      "md:pb-[max(env(safe-area-inset-bottom),1rem)]",
    ],
    ["src/routes/fantasy.team.tsx", "md:pb-[max(env(safe-area-inset-bottom),1rem)]"],
    ["src/routes/fantasy.fixtures.tsx", "md:bottom-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]"],
  ])("%s pads by %s", (file, token) => {
    expect(read(file)).toContain(token);
  });

  test("sonner gets the inset on phones too, where it reads mobileOffset", () => {
    const sonner = read("src/components/ui/sonner.tsx");
    expect(sonner).toContain("offset={TOAST_OFFSET}");
    expect(sonner).toContain("mobileOffset={TOAST_OFFSET}");
  });
});
