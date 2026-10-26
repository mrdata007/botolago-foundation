/**
 * The French dictionary is shipped in two parts (src/i18n/dictionary-fr-core.ts
 * and dictionary-fr-rest.ts) so the first view of the home page does not
 * download every string of the app. This module decides which keys belong
 * to the first part: every key the home page's code can ask for.
 *
 * "Home code" is the import closure (static and dynamic) of the root route and
 * the home route, leaving out every other route file. A key is core when
 *   - it appears as a whole string literal in that code, or
 *   - it starts with a prefix that code builds keys from (`"player.pos." + x`,
 *     `` `player.pos.${x}` ``), or
 *   - a route file reads it as `fr["key"]` (page titles and descriptions are
 *     read by `head()`, which lives in the entry chunk).
 *
 * `bun scripts/qa/i18n-split.ts`           print the sizes
 * `bun scripts/qa/i18n-split.ts --check`   fail when the committed split is stale
 *   (a core key sits in the rest part) -- also run by src/i18n/dictionary-split.test.ts
 * `bun scripts/qa/i18n-split.ts --write`   move keys between the two part files so core is exact
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import ts from "typescript";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");
const SRC = join(ROOT, "src");

const ENTRIES = ["src/routes/__root.tsx", "src/routes/index.tsx"];

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  base = base.replace(/\?.*$/, "");
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile() && /\.(ts|tsx)$/.test(candidate))
      return candidate;
  }
  return null;
}

const IMPORT_RE =
  /(?:import|export)\s[^'"`;]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|import\(\s*(?:\/\*[^*]*\*\/\s*)?["']([^"']+)["']\s*\)/g;

export function homeCodeFiles(): string[] {
  const seen = new Set<string>();
  const queue = ENTRIES.map((e) => join(ROOT, e));
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2] ?? m[3];
      const target = resolveImport(file, spec);
      if (!target) continue;
      if (/\.test\.tsx?$/.test(target)) continue;
      if (target.includes("/src/i18n/dictionary-")) continue;
      // Other routes are loaded when visited; their `head()` keys are handled below.
      if (target.startsWith(join(SRC, "routes")) && !ENTRIES.some((e) => join(ROOT, e) === target))
        continue;
      queue.push(target);
    }
  }
  return [...seen];
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

export function keysOf(source: string): string[] {
  return [...source.matchAll(/^ {2}"([^"]+)":/gm)].map((m) => m[1]);
}

const STRING_RE = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;

export function coreKeysOf(allKeys: string[], extraFiles: string[] = []): Set<string> {
  const keys = new Set(allKeys);
  const core = new Set<string>();
  const prefixes = new Set<string>();
  const files = new Set([...homeCodeFiles(), ...extraFiles]);
  // Code outside the home page's closure that reads the first part directly
  // (`head()` of the other routes, the Fantasy page heads, the admin menu):
  // it runs in the entry chunk, before any other part can arrive.
  for (const file of walk(SRC)) {
    if (files.has(file) || file.startsWith(join(SRC, "i18n"))) continue;
    const text = readFileSync(file, "utf8");
    if (!/from "(?:@\/i18n|\.)\/dictionary-fr-core"/.test(text)) continue;
    if (file.startsWith(join(SRC, "routes"))) {
      // A route's component is its own chunk; only its `head()` is in the entry.
      for (const m of text.matchAll(/\bfr\[\s*["']([^"']+)["']\s*\]/g))
        if (keys.has(m[1])) core.add(m[1]);
    } else files.add(file);
  }
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(STRING_RE)) {
      const body = m[1] ?? m[2] ?? m[3] ?? "";
      if (m[3] !== undefined && body.includes("${")) {
        const prefix = body.slice(0, body.indexOf("${"));
        if (prefix.includes(".") || prefix.includes("_")) prefixes.add(prefix);
        continue;
      }
      if (keys.has(body)) core.add(body);
      else if (/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*[._]$/.test(body)) prefixes.add(body);
    }
  }
  for (const key of allKeys) for (const p of prefixes) if (key.startsWith(p)) core.add(key);
  return core;
}

const CORE_FILE = join(SRC, "i18n/dictionary-fr-core.ts");
const REST_FILE = join(SRC, "i18n/dictionary-fr-rest.ts");

interface Entry {
  key: string;
  text: string;
}

/** Every property of the dictionary object in a part file, with the comments above it. */
function entriesOf(file: string): Entry[] {
  const source = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const out: Entry[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node) && node.parent && ts.isAsExpression(node.parent)) {
      for (const prop of node.properties) {
        if (!ts.isPropertyAssignment(prop) || !ts.isStringLiteral(prop.name))
          throw new Error(`Unexpected property in ${file}`);
        out.push({ key: prop.name.text, text: source.slice(prop.getFullStart(), prop.end) });
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const HEADERS = {
  core: `// The French dictionary, first part: the strings the home page and the app shell can ask
// for. It ships with the app (every page is first rendered in French). The rest of the
// French strings are in dictionary-fr-rest.ts and arrive with the first page other than
// the home page. dictionary-fr.ts puts the two together. Which key belongs here is
// decided by scripts/qa/i18n-split.ts (bun scripts/qa/i18n-split.ts --write moves keys);
// src/i18n/dictionary-split.test.ts fails when a key the home page needs sits in the
// other file.
export const frCore = {`,
  rest: `// The French dictionary, second part: strings no code of the home page asks for. Loaded
// on demand (src/i18n/dictionary-fr-loader.ts) before the first page other than the home
// page is shown; the server has it from the start. See dictionary-fr-core.ts.
export const frRest = {`,
};

export function splitPlan() {
  const core = entriesOf(CORE_FILE);
  const rest = entriesOf(REST_FILE);
  const all = [...core, ...rest];
  const wanted = coreKeysOf(all.map((e) => e.key));
  return {
    all,
    wanted,
    coreEntries: all.filter((e) => wanted.has(e.key)),
    restEntries: all.filter((e) => !wanted.has(e.key)),
    misplaced: rest.filter((e) => wanted.has(e.key)).map((e) => e.key),
  };
}

function render(kind: "core" | "rest", entries: Entry[]): string {
  return `${HEADERS[kind]}${entries.map((e) => `${e.text},`).join("")}\n} as const satisfies Record<string, string>;\n`;
}

if (import.meta.main) {
  const plan = splitPlan();
  if (process.argv.includes("--write")) {
    writeFileSync(CORE_FILE, render("core", plan.coreEntries));
    writeFileSync(REST_FILE, render("rest", plan.restEntries));
    console.log(`wrote core ${plan.coreEntries.length}, rest ${plan.restEntries.length}`);
  } else {
    console.log(
      `keys ${plan.all.length}, core ${plan.wanted.size}, misplaced ${plan.misplaced.length}`,
    );
    if (process.argv.includes("--check") && plan.misplaced.length) {
      console.error(
        `In dictionary-fr-rest.ts but needed by the home page: ${plan.misplaced.join(", ")}`,
      );
      process.exit(1);
    }
  }
}
