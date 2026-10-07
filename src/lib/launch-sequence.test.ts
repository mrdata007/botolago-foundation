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
 * Landing page (2026-10-03): the home welcome dialog is gone. A first visit
 * without an account gets the landing page in Home's place — a page, not an
 * arrival dialog — so it waits for the splash and for hydration but not for
 * the language chooser, which opens over it (z-50) as it opens over any page.
 *
 * 2026-10-07 (owner decision): `/` is Home for everyone. Nothing replaces it
 * after the splash any more, so Home opens nothing on arrival and does not
 * wait for the launch sequence; the chooser opens over Home itself.
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

  test("Home opens nothing on arrival: no dialog, and no page swapped in after the splash", () => {
    const source = code("src/routes/index.tsx");
    // Nothing on Home waits for the splash or the chooser, because nothing
    // arrives over it or in its place.
    expect(source).not.toContain('from "@/lib/launch-sequence"');
    expect(source).not.toContain("useSplashDone");
    expect(source).not.toContain("showLanding");
    expect(source).not.toContain("components/landing/LandingPage");
    expect(source).not.toContain('role="dialog"');
  });
});
