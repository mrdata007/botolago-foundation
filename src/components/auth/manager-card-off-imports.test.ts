import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * "Off means identical" at the level of the files a visitor downloads (plan 3.7, and
 * `scripts/qa/manager-card-off-bundle-gate.ts` on the built output): a static import of any
 * Gradins or Manager Card module from these pages makes every visit download the section's code,
 * switch or no switch. So they import only the status hook statically, and load every card
 * component with `lazy`, inside the live branch.
 */

const ROOT = join(import.meta.dir, "..", "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const stripComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const FILES = [
  "src/routes/auth.register.tsx",
  "src/routes/auth.profile-setup.tsx",
  "src/routes/profile.tsx",
  "src/components/pepites/PepitesShell.tsx",
  "src/components/pepites/PepitesHome.tsx",
  "src/components/pepites/PepitesParts.tsx",
];

/** Every `import … from "x"` and bare `import "x"`, not `import("x")`. */
function staticImports(source: string): { clause: string; from: string }[] {
  return [...source.matchAll(/^import\s+(?:([\s\S]*?)\s+from\s+)?["']([^"']+)["'];?$/gm)].map(
    (match) => ({ clause: (match[1] ?? "").replace(/\s+/g, " ").trim(), from: match[2]! }),
  );
}

describe("the pages WP6 touches keep the section's code out of their own chunks", () => {
  it.each(FILES)("%s imports no card or Gradins module statically", (file) => {
    const imports = staticImports(stripComments(read(file)));
    const strays = imports.filter(({ from }) =>
      /(^@\/components\/(manager-card|gradins)\b)|(^@\/backend\/manager-card\b)|(^@\/services\/(use-manager-card|manager-card)$)|(CardSetupRow|CardDeletionLine)$/.test(
        from,
      ),
    );
    expect(strays).toEqual([]);
  });

  it.each(FILES)("%s takes only useManagerCardLive from the status module, if anything", (file) => {
    const fromStatus = staticImports(stripComments(read(file))).filter(
      ({ from }) => from === "@/services/manager-card-status",
    );
    for (const { clause } of fromStatus) expect(clause).toBe("{ useManagerCardLive }");
  });

  it("loads the two card components on demand, only from a live branch", () => {
    const setup = stripComments(read("src/routes/auth.profile-setup.tsx"));
    expect(setup).toContain('import("@/components/auth/CardSetupRow")');
    expect(setup).toMatch(/cardPath && step <= 2 \? \(\s*[^]*?<Suspense[^]*?<CardSetupSlot/);
    expect(setup.match(/<CardSetupSlot/g)).toHaveLength(1);

    const profile = stripComments(read("src/routes/profile.tsx"));
    expect(profile).toContain('import("@/components/auth/CardDeletionLine")');
    const uses = [...profile.matchAll(/<CardDeletionLine/g)];
    expect(uses).toHaveLength(2);
    for (const use of uses) {
      expect(profile.slice(Math.max(0, use.index! - 80), use.index!)).toMatch(
        /live \? \(\s*<Suspense/,
      );
    }
  });

  it("reads the create-flow path without importing the row or any runtime code", () => {
    expect(staticImports(read("src/components/auth/fantasy-create-path.ts"))).toEqual([]);
  });

  it("keeps the resolution check to a type import, and only the card row imports it", () => {
    expect(staticImports(read("src/components/auth/server-resolves-club.ts"))).toEqual([
      { clause: "type { MyCardDto }", from: "@/backend/manager-card/contracts" },
    ]);
    const importers = FILES.filter((file) => read(file).includes("server-resolves-club"));
    expect(importers).toEqual([]);
  });

  it("reads no copy accessor of the section while off: the two hints are plain dictionary reads", () => {
    for (const file of ["src/routes/auth.register.tsx", "src/routes/auth.profile-setup.tsx"]) {
      expect(stripComments(read(file))).not.toMatch(/useMomentCopy|useGradinsCopy|useCardCopy/);
    }
    expect(read("src/routes/auth.register.tsx")).toContain('t("card.onboarding.m1.register.hint")');
    expect(read("src/routes/auth.profile-setup.tsx")).toContain(
      't("card.onboarding.m1.setup.name_hint")',
    );
  });
});
