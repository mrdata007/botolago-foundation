import { describe, expect, it } from "bun:test";
import { dirname, join } from "node:path";

/**
 * The Arabic dictionary is a chunk of its own, fetched only for a reader who
 * wants Arabic (audit 2026-09-24, P1-11). One static import of it anywhere in
 * the app puts it back in every page: the three Pronostics routes read their
 * French `<title>` through `dictionaries`, which imports both languages, and
 * the build of 2026-09-25 listed `dictionary-ar` among the root route's
 * preloads. That also made the failed-download path (A10) unreachable in
 * production. So: nothing but the provider's dynamic import may reach it.
 *
 * Specifiers are resolved, not pattern-matched, so `../../i18n/dictionaries`
 * and a re-export (`export { dictionaries } from …`) count as much as
 * `@/i18n/dictionaries` does.
 */

const SRC = join(import.meta.dir, "..");
const DICTIONARIES = join(SRC, "i18n", "dictionaries");
const ARABIC = join(SRC, "i18n", "dictionary-ar");

/** Every static `import`/`export … from` in `source` that brings a value. */
function valueSpecifiers(source: string): string[] {
  const statement = /^\s*(?:import|export)\s+(?!type\b)(?:[^;]*?\sfrom\s+)?["']([^"']+)["']/gm;
  return [...source.matchAll(statement)].map((match) => match[1]);
}

/** Every `import("…")` with a written specifier. */
function dynamicSpecifiers(source: string): string[] {
  return [...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1]);
}

/** The module a specifier written in `file` names, without extension; null for a package. */
function resolve(specifier: string, file: string): string | null {
  const path = specifier.startsWith("@/")
    ? join(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? join(dirname(file), specifier)
      : null;
  return path?.replace(/\.(?:tsx?|jsx?)$/, "") ?? null;
}

async function appSources() {
  const files: { path: string; file: string; source: string }[] = [];
  for await (const relative of new Bun.Glob("**/*.{ts,tsx}").scan({ cwd: SRC })) {
    if (/\.test\.tsx?$/.test(relative) || relative.includes("__fixtures__")) continue;
    const file = join(SRC, relative);
    // Without comments, which quote imports to explain them.
    const source = (await Bun.file(file).text())
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    files.push({ path: `src/${relative}`, file, source });
  }
  return files;
}

/** What `source`, written in `file`, statically brings in of the two dictionaries. */
function staticOffences(source: string, file: string): string[] {
  return valueSpecifiers(source).filter((specifier) => {
    const target = resolve(specifier, file);
    return target === DICTIONARIES || target === ARABIC;
  });
}

describe("the Arabic dictionary stays out of the page bundle", () => {
  it("is imported statically only by `dictionaries.ts`, which the app does not import", async () => {
    const offenders: string[] = [];
    for (const { path, file, source } of await appSources()) {
      if (path === "src/i18n/dictionaries.ts") continue;
      for (const specifier of staticOffences(source, file)) offenders.push(`${path}: ${specifier}`);
    }
    expect(offenders).toEqual([]);
  });

  it("is imported dynamically only by the language provider", async () => {
    const importers = (await appSources())
      .filter(({ file, source }) =>
        dynamicSpecifiers(source).some((specifier) => resolve(specifier, file) === ARABIC),
      )
      .map(({ path }) => path);
    expect(importers).toEqual(["src/i18n/provider.tsx"]);
  });

  describe("catches the shapes it is looking for", () => {
    const inRoutes = join(SRC, "routes", "some-route.tsx");
    const deep = join(SRC, "components", "shell", "Some.tsx");
    const inI18n = join(SRC, "i18n", "some-module.ts");
    const caught = (source: string, file: string) => staticOffences(source, file).length > 0;

    it("through the alias, across lines", () => {
      expect(caught('import { dictionaries } from "@/i18n/dictionaries";', inRoutes)).toBe(true);
      expect(caught('import {\n  dictionaries,\n} from "@/i18n/dictionaries";', inRoutes)).toBe(
        true,
      );
      expect(caught('import { ar } from "@/i18n/dictionary-ar.ts";', inRoutes)).toBe(true);
    });

    it("through any relative path", () => {
      expect(caught('import { ar } from "./dictionary-ar";', inI18n)).toBe(true);
      expect(caught('import { dictionaries } from "../../i18n/dictionaries";', deep)).toBe(true);
      expect(caught("import { dictionaries } from '../i18n/dictionaries';", inRoutes)).toBe(true);
    });

    it("through a re-export", () => {
      expect(caught('export { dictionaries } from "@/i18n/dictionaries";', inRoutes)).toBe(true);
      expect(caught('export * from "./dictionary-ar";', inI18n)).toBe(true);
    });

    it("but not types, nor a module of the same name elsewhere", () => {
      expect(caught('import type { TranslationKey } from "@/i18n/dictionaries";', inRoutes)).toBe(
        false,
      );
      expect(caught('export type { TranslationKey } from "./dictionaries";', inI18n)).toBe(false);
      expect(caught('import { dictionaries } from "./dictionaries";', deep)).toBe(false);
    });
  });
});
