/**
 * Which dictionary keys can a page render?
 *
 * The French dictionary is split into a core part and sections that a page
 * loads before it renders (`src/i18n/fr-sections.ts`). Whether a page has every
 * key it needs is decided here, from the source: a route file, and every module
 * it imports (static or dynamic, transitively), can render the keys those
 * modules name.
 *
 * "Name" is deliberately wide, so that the answer errs towards needing a key
 * rather than missing one:
 *   - any quoted string that is exactly a dictionary key counts (a key in a
 *     lookup table, a `labelKey` prop, a `t("…")` call: all the same);
 *   - a template literal `` `player.pos.${p}` `` counts as every key that starts
 *     with its literal prefix.
 * What it cannot see is a key assembled from pieces with no literal prefix; the
 * i18n gate (`i18n-gate.ts`, W4) keeps the count of such `t()` calls at its
 * committed baseline, and `fr-sections.test.ts` pins the ones that matter.
 *
 * Used by `src/i18n/fr-sections.test.ts`. Reads files only.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface RouteKeys {
  /** Absolute path of the route file. */
  file: string;
  /** Its address, with a stand-in for each parameter (`/fantasy/leagues/x`). */
  path: string;
  /** Every key its modules can render. */
  keys: Set<string>;
}

interface Parsed {
  imports: string[];
  literals: Set<string>;
  prefixes: Set<string>;
}

/** Modules whose strings are the dictionaries (or the lists about them), not pages. */
const NOT_PAGE_CODE =
  /[\\/]routeTree\.gen\.|[\\/]i18n[\\/](dictionary-(fr|fr-core|ar)|dictionaries|i18n-allowlist|fr-sections[\\/])/;
const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

export function createRouteKeyScanner(root: string, allKeys: Iterable<string>) {
  const keys = new Set(allKeys);
  const keyList = [...keys];
  const cache = new Map<string, Parsed>();

  function resolveImport(from: string, specifier: string): string | null {
    let base: string;
    if (specifier.startsWith("@/")) base = join(root, "src", specifier.slice(2));
    else if (specifier.startsWith(".")) base = resolve(dirname(from), specifier);
    else return null;
    for (const extension of EXTENSIONS) {
      const candidate = base + extension;
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
    return null;
  }

  function parse(file: string): Parsed {
    const cached = cache.get(file);
    if (cached) return cached;
    const source = readFileSync(file, "utf8");
    const imports: string[] = [];
    for (const match of source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
      const target = resolveImport(file, match[1]);
      if (target && /\.tsx?$/.test(target) && !NOT_PAGE_CODE.test(target)) imports.push(target);
    }
    const literals = new Set<string>();
    for (const match of source.matchAll(/["'`]([A-Za-z0-9_.-]+)["'`]/g)) {
      if (keys.has(match[1])) literals.add(match[1]);
    }
    const prefixes = new Set<string>();
    for (const match of source.matchAll(/`([A-Za-z0-9_.-]+)\$\{/g)) {
      if (match[1].includes(".")) prefixes.add(match[1]);
    }
    const parsed = { imports, literals, prefixes };
    cache.set(file, parsed);
    return parsed;
  }

  /** The modules `entry` can load, itself included. */
  function importClosure(entry: string): Set<string> {
    const seen = new Set<string>();
    const pending = [entry];
    while (pending.length > 0) {
      const file = pending.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      pending.push(...parse(file).imports);
    }
    return seen;
  }

  /** Every key the modules of `entry`'s closure can render. */
  function keysFor(entry: string): Set<string> {
    const used = new Set<string>();
    for (const file of importClosure(entry)) {
      const parsed = parse(file);
      parsed.literals.forEach((key) => used.add(key));
      for (const prefix of parsed.prefixes) {
        for (const key of keyList) if (key.startsWith(prefix)) used.add(key);
      }
    }
    return used;
  }

  return { importClosure, keysFor };
}

/** Route files (not tests), whose address a reader can visit. */
export function routeFiles(root: string): string[] {
  const dir = join(root, "src", "routes");
  return readdirSync(dir)
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\./.test(name))
    .filter((name) => !name.startsWith("[") && name !== "mcp.ts" && !/^sitemap/.test(name))
    .map((name) => join(dir, name));
}

/**
 * The address of a route file, `$param` segments standing for a value:
 * `fantasy.leagues.$leagueId.tsx` is `/fantasy/leagues/x`. A pathless layout
 * (a segment starting with `_`) adds nothing; `index` is the layout's own address.
 */
export function routePath(file: string): string {
  const name = file.slice(file.lastIndexOf("/") + 1).replace(/\.tsx?$/, "");
  const segments = name
    .split(".")
    .filter((segment) => segment !== "index" && !segment.startsWith("_"))
    .map((segment) => (segment.startsWith("$") ? "x" : segment));
  return `/${segments.join("/")}`;
}

/** `fantasy.leagues.$leagueId.tsx` then `fantasy.leagues.tsx` then `fantasy.tsx`: the layouts above a route. */
export function layoutFilesAbove(file: string): string[] {
  const dir = dirname(file);
  const name = file.slice(file.lastIndexOf("/") + 1).replace(/\.tsx?$/, "");
  const parts = name.split(".");
  const found: string[] = [];
  for (let length = parts.length; length >= 1; length -= 1) {
    for (const extension of [".tsx", ".ts"]) {
      const candidate = join(dir, `${parts.slice(0, length).join(".")}${extension}`);
      if (existsSync(candidate)) found.push(candidate);
    }
  }
  return found;
}
