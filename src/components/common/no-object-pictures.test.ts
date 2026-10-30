import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The generated object pictures in `src/assets/illustrations/` (a ball and a
 * router, headphones, an hourglass, a podium…) read as filler and made the app
 * look machine-made (owner, 2026-10-30). Empty states, the 404, the Fantasy
 * intro, help, rules and prizes are led by type instead. The files stay in the
 * repository for now; nothing in the product may use them.
 */
const SRC = join(import.meta.dir, "../..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return path.endsWith("assets") ? [] : sources(path);
    return /\.(ts|tsx|css)$/.test(name) && !name.includes(".test.") ? [path] : [];
  });
}

describe("no generated object pictures", () => {
  it("nothing in src imports src/assets/illustrations", () => {
    const users = sources(SRC).filter((file) =>
      readFileSync(file, "utf8").includes("assets/illustrations/"),
    );
    expect(users).toEqual([]);
  });

  it("the shared state panels no longer take a picture", () => {
    expect(readFileSync(join(SRC, "components/common/States.tsx"), "utf8")).not.toContain("<img");
    const kit = readFileSync(join(SRC, "components/ui-kit/primitives.tsx"), "utf8");
    const panel = kit.slice(kit.indexOf("export function UiStatePanel"), kit.indexOf("/* Alerts"));
    expect(panel).not.toContain("<img");
  });
});
