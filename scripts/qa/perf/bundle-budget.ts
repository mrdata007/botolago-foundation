/**
 * First-view JavaScript budget.
 *
 * Reads the production build (`bun run build`) and totals the scripts the
 * server tells the browser to fetch for a route: the root route's entry script
 * and modulepreloads, plus the route's own preloads. Fails when the gzip total,
 * the file count or the stylesheet goes over the budget.
 *
 *   bun scripts/qa/perf/bundle-budget.ts            # route "/"
 *   bun scripts/qa/perf/bundle-budget.ts /matches/  # another route id
 *   bun scripts/qa/perf/bundle-budget.ts --json     # machine-readable output
 *   bun scripts/qa/perf/bundle-budget.ts --list     # the 40 heaviest files
 *
 * Budgets are about 10% above the figures measured on 2026-10-26, after the
 * second pass (docs/engineering/PERFORMANCE_2026_10_26.md). Lower them when a change makes
 * the first view lighter; raise them only with a reason in that document.
 * It is a manual check and is not wired into the Lovable build.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = process.cwd();
const SERVER_DIR = join(ROOT, ".output/server");
const PUBLIC_DIR = join(ROOT, ".output/public");

/** Per-route budgets. Routes without an entry are measured but not enforced. */
export const BUDGETS: Record<string, { gzipKb: number; files: number; cssGzipKb: number }> = {
  "/": { gzipKb: 475, files: 108, cssGzipKb: 39 },
};

type ManifestRoute = { preloads?: string[]; scripts?: { attrs?: { src?: string } }[] };

function loadManifest(): Record<string, ManifestRoute> {
  const file = readdirSync(SERVER_DIR).find((f) => /^_tanstack-start-manifest_v-.*\.mjs$/.test(f));
  if (!file) throw new Error("No client manifest in .output/server. Run `bun run build` first.");
  const source = readFileSync(join(SERVER_DIR, file), "utf8")
    .replace(/export\s*\{[^}]*\};?/g, "")
    .replace(/var tsrStartManifest\s*=/, "return");
  const manifest = new Function(source)() as () => { routes: Record<string, ManifestRoute> };
  return manifest().routes;
}

function sizes(path: string) {
  const file = join(PUBLIC_DIR, path.replace(/^\//, ""));
  if (!existsSync(file)) return { raw: 0, gzip: 0 };
  const bytes = readFileSync(file);
  return { raw: bytes.length, gzip: gzipSync(bytes).length };
}

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const route = args.find((a) => !a.startsWith("--")) ?? "/";
const routes = loadManifest();
const root = routes.__root__;
const leaf = routes[route];
if (!leaf) throw new Error(`Route ${route} is not in the manifest.`);

const scripts = new Set<string>();
for (const s of root.scripts ?? []) if (s.attrs?.src) scripts.add(s.attrs.src);
for (const p of root.preloads ?? []) scripts.add(p);
for (const p of leaf.preloads ?? []) scripts.add(p);
const entry = (root.scripts ?? []).find((s) => s.attrs?.src)?.attrs?.src ?? "";

let raw = 0;
let gzip = 0;
for (const s of scripts) {
  const z = sizes(s);
  raw += z.raw;
  gzip += z.gzip;
}
const css = readdirSync(join(PUBLIC_DIR, "assets")).filter((f) => /^styles-.*\.css$/.test(f));
const cssSizes = css.map((f) => sizes(`/assets/${f}`));
const cssRaw = cssSizes.reduce((n, z) => n + z.raw, 0);
const cssGzip = cssSizes.reduce((n, z) => n + z.gzip, 0);
const entrySizes = entry ? sizes(entry) : { raw: 0, gzip: 0 };
const kb = (n: number) => +(n / 1024).toFixed(1);

const result = {
  route,
  files: scripts.size,
  jsRawKb: kb(raw),
  jsGzipKb: kb(gzip),
  entryRawKb: kb(entrySizes.raw),
  entryGzipKb: kb(entrySizes.gzip),
  cssRawKb: kb(cssRaw),
  cssGzipKb: kb(cssGzip),
};

const budget = BUDGETS[route];
const failures: string[] = [];
if (budget && budget.gzipKb > 0) {
  if (result.jsGzipKb > budget.gzipKb)
    failures.push(`JS gzip ${result.jsGzipKb} KB > budget ${budget.gzipKb} KB`);
  if (result.files > budget.files) failures.push(`${result.files} files > budget ${budget.files}`);
  if (result.cssGzipKb > budget.cssGzipKb)
    failures.push(`CSS gzip ${result.cssGzipKb} KB > budget ${budget.cssGzipKb} KB`);
}

if (args.includes("--list")) {
  const rows = [...scripts]
    .map((s) => ({ s, ...sizes(s) }))
    .sort((a, b) => b.gzip - a.gzip)
    .slice(0, 40);
  for (const r of rows) console.log(`${r.s.padEnd(56)} ${r.raw}\t${r.gzip}`);
}

if (asJson) console.log(JSON.stringify({ ...result, budget, failures }, null, 2));
else {
  console.log(`First view of ${route}`);
  console.log(`  script files : ${result.files}`);
  console.log(`  JS           : ${result.jsRawKb} KB raw, ${result.jsGzipKb} KB gzip`);
  console.log(`  main entry   : ${result.entryRawKb} KB raw, ${result.entryGzipKb} KB gzip`);
  console.log(`  CSS          : ${result.cssRawKb} KB raw, ${result.cssGzipKb} KB gzip`);
  if (!budget) console.log("  (no budget set for this route)");
}
if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(1);
}
