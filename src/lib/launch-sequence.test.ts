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
 *
 * Landing page (2026-10-03, revised 2026-10-26): the home welcome dialog is
 * gone. A first visit without an account used to get the landing page in
 * Home's place; it now keeps Home and finds a dismissible invitation to
 * `/jouer` inside it. There is no language chooser any more either.
 */
const repoRoot = join(import.meta.dir, "..", "..");
const code = (relative: string) =>
  readFileSync(join(repoRoot, relative), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");

describe("arrival dialogs wait for the launch sequence", () => {
  test.each([["src/components/prizes/PrizeWelcome.tsx", "splashDone && isHydrated && hasChosen"]])(
    "%s opens only once the splash and the language chooser are done",
    (file, gate) => {
      const source = code(file);
      expect(source).toContain('from "@/lib/launch-sequence"');
      expect(source).toContain(gate);
    },
  );

  test("Home itself no longer swaps in the landing page: it is a page at /jouer only", () => {
    const source = code("src/routes/index.tsx");
    expect(source).not.toContain("LandingPage");
    expect(source).not.toContain("useSplashDone");
    expect(source).not.toContain('role="dialog"');
  });
});
