/**
 * The static import graph of two production builds, chunk by chunk (hashes stripped): what a page
 * downloads that it did not before. Uses the off-bundle gate's own import reader.
 *
 *   bun docs/product/manager-card-section/wp6/chunk-graph-diff.ts <base>/.output/public/assets <branch>/.output/public/assets
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { staticImports } from "../../../../scripts/qa/manager-card-off-bundle-gate";

const [baseDir, afterDir] = process.argv.slice(2);
if (!baseDir || !afterDir)
  throw new Error("usage: chunk-graph-diff.ts <base assets> <after assets>");

const stripHash = (name: string) => name.replace(/-[A-Za-z0-9_-]{8}\.js$/, ".js");
function graph(dir: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".js"))) {
    const text = readFileSync(join(dir, file), "utf8");
    out.set(stripHash(file), staticImports({ name: file, text }).map(stripHash).sort());
  }
  return out;
}

const before = graph(baseDir);
const after = graph(afterDir);
let changed = 0;
for (const [name, imports] of after) {
  const was = before.get(name);
  if (!was) {
    console.log(`NEW chunk ${name}: imports ${imports.join(", ")}`);
    continue;
  }
  const added = imports.filter((item) => !was.includes(item));
  const dropped = was.filter((item) => !imports.includes(item));
  if (added.length || dropped.length) {
    changed += 1;
    console.log(
      `CHANGED ${name}: now also ${JSON.stringify(added)}, no longer ${JSON.stringify(dropped)}`,
    );
  }
}
for (const name of before.keys()) if (!after.has(name)) console.log(`GONE chunk ${name}`);
console.log(
  `${[...after.keys()].filter((name) => before.has(name)).length} chunks in both, ${changed} with different static imports`,
);
