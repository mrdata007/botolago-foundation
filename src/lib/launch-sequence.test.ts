import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Arrival dialogs wait for the launch sequence (splash, then the first-launch
 * language chooser): see `launch-sequence.ts`. Source-shape assertions, like
 * `feature-flags.test.ts`, because this codebase has no component-test
 * harness and the browser test only catches a missing gate when the timing
 * lines up.
 *
 * PR #199: the home welcome became a dialog over the page (so crawlers get the
 * page) but opened as soon as the page mounted, under the splash, and the
 * first-visit browser test found it instead of the language chooser.
 */
const repoRoot = join(import.meta.dir, "..", "..");
const code = (relative: string) =>
  readFileSync(join(repoRoot, relative), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");

describe("arrival dialogs wait for the launch sequence", () => {
  test.each([
    ["src/components/prizes/PrizeWelcome.tsx", "splashDone && isHydrated && hasChosen"],
    ["src/routes/index.tsx", "useSplashDone() && isHydrated && hasChosen"],
  ])("%s opens only once the splash and the language chooser are done", (file, gate) => {
    const source = code(file);
    expect(source).toContain('from "@/lib/launch-sequence"');
    expect(source).toContain(gate);
  });

  test("the home welcome is shown only through that gate", () => {
    const source = code("src/routes/index.tsx");
    expect(source).toContain(
      'const showWelcome = mounted && launchDone && status === "anonymous" && !hasWelcomed();',
    );
  });
});
