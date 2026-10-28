import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createRouteKeyScanner,
  layoutFilesAbove,
  routeFiles,
  routePath,
} from "../../scripts/qa/i18n-route-keys";
import { frCore } from "./dictionary-fr-core";
import { fr } from "./dictionary-fr";
import { frFantasy } from "./fr-sections/fantasy";
import { frPepites } from "./fr-sections/pepites";
import { frPlus } from "./fr-sections/plus";
import { frPredictions } from "./fr-sections/predictions";
import { frPrizes } from "./fr-sections/prizes";
import {
  frSectionsForPath,
  frText,
  loadFrSection,
  loadFrSectionsForPath,
  SECTIONS_BY_PATH,
  type FrSectionName,
} from "./fr-sections";

/**
 * The French dictionary is split into a core part and five sections that a page
 * loads before it renders (`fr-sections.ts`). These tests hold the split to
 * three promises:
 *
 *   1. nothing was lost or doubled: core and sections are disjoint, and
 *      together they are the whole dictionary (`dictionary-fr.ts`);
 *   2. a page never lacks a key: every key a route's modules can render is in
 *      the core or in a section its address loads;
 *   3. the first load stays small: the app never pulls the whole dictionary
 *      or a section in statically.
 */

const ROOT = process.cwd();

const SECTIONS: Record<FrSectionName, Readonly<Record<string, string>>> = {
  fantasy: frFantasy,
  plus: frPlus,
  pepites: frPepites,
  prizes: frPrizes,
  predictions: frPredictions,
};

/** What a section may hold: the keys of these namespaces and no others. */
const SECTION_NAMESPACES: Record<FrSectionName, string[]> = {
  fantasy: ["fantasy", "fpl"],
  plus: ["plus"],
  pepites: ["pepites"],
  prizes: ["prizes"],
  predictions: ["predictions"],
};

const namespace = (key: string) => key.split(".")[0];

describe("the split dictionary is the whole dictionary", () => {
  const parts: [string, Readonly<Record<string, string>>][] = [
    ["core", frCore],
    ...Object.entries(SECTIONS),
  ];

  test("no key is in two parts", () => {
    const owner = new Map<string, string>();
    const doubled: string[] = [];
    for (const [name, part] of parts) {
      for (const key of Object.keys(part)) {
        const earlier = owner.get(key);
        if (earlier) doubled.push(`${key}: ${earlier} and ${name}`);
        owner.set(key, name);
      }
    }
    expect(doubled).toEqual([]);
  });

  test("the parts together are exactly the dictionary the tests and the gate read", () => {
    const merged: Record<string, string> = {};
    for (const [, part] of parts) Object.assign(merged, part);
    expect(Object.keys(fr).length).toBe(
      parts.reduce((sum, [, part]) => sum + Object.keys(part).length, 0),
    );
    expect(merged).toEqual({ ...fr });
  });

  test("a section holds only the namespaces it is named for", () => {
    for (const [name, namespaces] of Object.entries(SECTION_NAMESPACES)) {
      const stray = Object.keys(SECTIONS[name as FrSectionName]).filter(
        (key) => !namespaces.includes(namespace(key)),
      );
      expect({ section: name, stray }).toEqual({ section: name, stray: [] });
    }
  });

  test("every part is French copy, none is empty", () => {
    for (const [name, part] of parts) {
      expect(Object.keys(part).length).toBeGreaterThan(0);
      const empty = Object.entries(part).filter(([, value]) => value.trim() === "");
      expect({ part: name, empty }).toEqual({ part: name, empty: [] });
    }
  });
});

describe("which sections an address loads", () => {
  test("the shell, Home, News, Matches and Clubs load none", () => {
    for (const path of ["/", "/news", "/news/x", "/matches", "/clubs", "/clubs/x", "/privacy"]) {
      expect({ path, sections: frSectionsForPath(path) }).toEqual({ path, sections: [] });
    }
  });

  test("an address is matched by whole segments", () => {
    expect(frSectionsForPath("/fantasy")).toContain("fantasy");
    expect(frSectionsForPath("/fantasy/")).toContain("fantasy");
    expect(frSectionsForPath("/fantasy/rules")).toContain("fantasy");
    expect(frSectionsForPath("/fantasyland")).toEqual([]);
    expect(frSectionsForPath("/plus")).toEqual(["plus"]);
    expect(frSectionsForPath("/plusieurs")).toEqual([]);
  });

  test("every prefix in the table names a real route", () => {
    const paths = routeFiles(ROOT).map(routePath);
    for (const [prefix] of SECTIONS_BY_PATH) {
      expect(paths.some((path) => path === prefix || path.startsWith(`${prefix}/`))).toBe(true);
    }
  });

  test("loading a section makes its strings readable, and only then", async () => {
    // Fantasy copy that no page outside the section renders.
    const key = "fantasy.scoring.full";
    expect(key in frCore).toBe(false);
    await loadFrSection("fantasy");
    expect(frText(key)).toBe(frFantasy[key as keyof typeof frFantasy]);
    expect(await loadFrSectionsForPath("/")).toBeUndefined();
    await loadFrSectionsForPath("/pepites");
    const [pepitesKey] = Object.keys(frPepites);
    expect(frText(pepitesKey)).toBe(frPepites[pepitesKey as keyof typeof frPepites]);
  });

  test("a key in neither part reads as undefined, so the caller shows the key", () => {
    expect(frText("no.such.key")).toBeUndefined();
  });
});

describe("no page lacks a key it renders", () => {
  const scanner = createRouteKeyScanner(ROOT, Object.keys(fr));
  const coreKeys = new Set(Object.keys(frCore));
  const sectionOf = new Map<string, FrSectionName>();
  for (const [name, part] of Object.entries(SECTIONS)) {
    for (const key of Object.keys(part)) sectionOf.set(key, name as FrSectionName);
  }

  /** Keys `keys` needs that neither the core nor `loads` has, with the section each is in. */
  function missingFor(keys: Set<string>, loads: FrSectionName[]) {
    const missing: string[] = [];
    for (const key of keys) {
      if (coreKeys.has(key)) continue;
      const section = sectionOf.get(key);
      if (section && loads.includes(section)) continue;
      missing.push(`${key} (in ${section ?? "no part"})`);
    }
    return missing.sort();
  }

  const fix =
    "Add the section to SECTIONS_BY_PATH in src/i18n/fr-sections.ts for this address, or move the key to src/i18n/dictionary-fr-core.ts.";

  test("every route file has the keys of its modules in the core or in a section its address loads", () => {
    const failures: Record<string, string[]> = {};
    for (const file of routeFiles(ROOT)) {
      const missing = missingFor(scanner.keysFor(file), frSectionsForPath(routePath(file)));
      if (missing.length > 0) failures[file.slice(ROOT.length + 1)] = missing;
    }
    expect({ fix, failures }).toEqual({ fix, failures: {} });
  });

  test("the root route and the router need nothing but the core", () => {
    for (const entry of [
      "src/routes/__root.tsx",
      "src/router.tsx",
      "src/start.ts",
      "src/server.ts",
    ]) {
      const missing = missingFor(scanner.keysFor(join(ROOT, entry)), []);
      expect({ entry, missing }).toEqual({ entry, missing: [] });
    }
  });

  test("a section is only worth its request when a page needs it: none is loaded for nothing", () => {
    const needed = new Set<FrSectionName>();
    for (const file of routeFiles(ROOT)) {
      for (const key of scanner.keysFor(file)) {
        const section = sectionOf.get(key);
        if (section) needed.add(section);
      }
    }
    expect([...needed].sort()).toEqual(Object.keys(SECTIONS).sort());
  });

  test("the scanner sees a Fantasy key in a Home component, so the guard would fail", () => {
    // The guard above is only as good as the scanner: Home's modules reach the
    // `fantasy.availability.*` keys, which is why those are in the core.
    const home = scanner.keysFor(join(ROOT, "src/routes/index.tsx"));
    const fantasyKeys = [...home].filter((key) => namespace(key) === "fantasy");
    expect(fantasyKeys.length).toBeGreaterThan(0);
    expect(missingFor(new Set(["fantasy.scoring.full"]), [])).toEqual([
      "fantasy.scoring.full (in fantasy)",
    ]);
    expect(missingFor(new Set(["fantasy.scoring.full"]), ["fantasy"])).toEqual([]);
    for (const key of fantasyKeys) expect(coreKeys.has(key)).toBe(true);
  });

  test("a Fantasy key added to a Home component is caught", () => {
    // A throwaway tree shaped like the app: a Home route, a component it imports.
    const tree = mkdtempSync(join(tmpdir(), "fr-sections-"));
    try {
      mkdirSync(join(tree, "src", "routes"), { recursive: true });
      mkdirSync(join(tree, "src", "components"), { recursive: true });
      writeFileSync(
        join(tree, "src", "routes", "index.tsx"),
        'import { Hero } from "@/components/Hero";\nexport const Route = { component: Hero };\n',
      );
      writeFileSync(
        join(tree, "src", "components", "Hero.tsx"),
        'import { useI18n } from "@/i18n/provider";\nexport const Hero = () => useI18n().t("fantasy.scoring.full");\n',
      );
      const used = createRouteKeyScanner(tree, Object.keys(fr)).keysFor(
        join(tree, "src", "routes", "index.tsx"),
      );
      expect([...used]).toEqual(["fantasy.scoring.full"]);
      expect(missingFor(used, frSectionsForPath("/"))).toEqual([
        "fantasy.scoring.full (in fantasy)",
      ]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  test("every route under a section's address loads it from a layout or from itself", () => {
    const hook = "loadFrSectionsForPath";
    const unhooked: string[] = [];
    for (const file of routeFiles(ROOT)) {
      if (frSectionsForPath(routePath(file)).length === 0) continue;
      const hooked = [file, ...layoutFilesAbove(file)].some((candidate) =>
        readFileSync(candidate, "utf8").includes(hook),
      );
      if (!hooked) unhooked.push(file.slice(ROOT.length + 1));
    }
    expect(unhooked).toEqual([]);
  });

  test("the layout of each section's pages carries the section, so the HTML preloads it", () => {
    // `provideFrSection` + a static import in the layout's module puts the
    // section in the layout's chunk (`fr-sections.ts`). The admin screens are
    // drawn in the browser only: there is no HTML to preload for.
    const missing: string[] = [];
    for (const file of routeFiles(ROOT)) {
      const path = routePath(file);
      if (path === "/admin" || path.startsWith("/admin/")) continue;
      const wanted = frSectionsForPath(path);
      if (wanted.length === 0) continue;
      const carried = new Set<string>();
      for (const candidate of [file, ...layoutFilesAbove(file)]) {
        const source = readFileSync(candidate, "utf8");
        for (const match of source.matchAll(/provideFrSection\("(\w+)"/g)) carried.add(match[1]);
      }
      for (const name of wanted) {
        if (!carried.has(name)) missing.push(`${file.slice(ROOT.length + 1)}: ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  test("the browser waits for the sections of its address before it hydrates", () => {
    const router = readFileSync(join(ROOT, "src/router.tsx"), "utf8");
    expect(router).toContain("loadFrSectionsForPath(window.location.pathname)");
  });
});

describe("the first load stays small", () => {
  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) sourceFiles(path, out);
      else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(path);
    }
    return out;
  }
  const appFiles = sourceFiles(join(ROOT, "src")).filter(
    (file) => !file.startsWith(join(ROOT, "src", "i18n") + "/dictionar"),
  );

  test("no app file imports the whole French dictionary", () => {
    const value = /^import\s+(?!type\b)[^;]*?\sfrom\s+["']([^"']+)["']/gm;
    const offenders = appFiles
      .filter((file) =>
        [...readFileSync(file, "utf8").matchAll(value)].some((match) =>
          /(?:^|\/)(?:dictionary-fr|dictionaries)$/.test(match[1]),
        ),
      )
      .map((file) => file.slice(ROOT.length + 1));
    expect(offenders).toEqual([]);
  });

  test("only a section's own pages import it statically; the shell and the first load never do", () => {
    const importsSection = /(?:from|import)\s*\(?\s*["'][^"']*fr-sections\/[^"']*["']/;
    const offenders = appFiles
      .filter((file) => !file.endsWith("src/i18n/fr-sections.ts"))
      .filter((file) => !file.startsWith(join(ROOT, "src", "routes") + "/"))
      .filter((file) => importsSection.test(readFileSync(file, "utf8")))
      .map((file) => file.slice(ROOT.length + 1));
    expect(offenders).toEqual([]);

    // And nothing the first load runs reaches a route file that does.
    const scanner = createRouteKeyScanner(ROOT, []);
    const reached: string[] = [];
    for (const entry of [
      "src/routes/__root.tsx",
      "src/router.tsx",
      "src/start.ts",
      "src/server.ts",
    ]) {
      for (const file of scanner.importClosure(join(ROOT, entry))) {
        if (
          importsSection.test(readFileSync(file, "utf8")) &&
          !file.endsWith("src/i18n/fr-sections.ts")
        ) {
          reached.push(`${entry} -> ${file.slice(ROOT.length + 1)}`);
        }
      }
    }
    expect(reached).toEqual([]);
  });

  test("the core part is under its budget", () => {
    // 2026-10-28: 1496 keys, 94 KB of copy. A page's strings that only its
    // own section needs belong in the section; this budget makes growth a
    // decision rather than an accident. Raise it deliberately, with a reason.
    const bytes = Object.entries(frCore).reduce(
      (sum, [key, value]) => sum + key.length + value.length,
      0,
    );
    expect(bytes).toBeLessThan(105_000);
  });
});
