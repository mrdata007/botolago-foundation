/**
 * Production-build gate for "off means identical" (plan 3.7), at the level of the files a visitor
 * downloads. With the build switch off no page may ask for a file it did not ask for before, and
 * the Manager Card's code (its RPC names, its card markup, its device keys) must not be among the
 * files the ordinary pages load.
 *
 * A bundler puts code shared by several pages in a shared chunk, and a page imports every chunk it
 * shares code with. So one stray static import of a Gradins module from the shell, or from a
 * Fantasy or Pépites screen, makes every visit to that page fetch the Manager Card's code, switch
 * or no switch. This reads the built client chunks, follows the STATIC imports of each (dynamic
 * `import()` is a deliberate lazy edge and is not followed), and fails when a chunk that is not
 * part of Gradins reaches a chunk holding the Manager Card's RPC names.
 *
 *   bun run build && bun scripts/qa/manager-card-off-bundle-gate.ts [assetsDir]
 *
 * `assetsDir` is `.output/public/assets` unless given. Exit 0: the ordinary pages are clean.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

export interface Chunk {
  name: string;
  text: string;
}

/**
 * What only the Manager Card's own code carries: the repository's RPC names, the card's element
 * classes (`ManagerCard`, `CardToken`) and the device keys of `storage.ts`. A chunk holding any of
 * them is the section's code, and ordinary pages must not import it statically.
 */
export const DATA_LAYER_MARKERS = [
  "manager_card_status",
  "get_my_manager_card",
  "get_manager_cards",
  "ack_manager_card_moments",
  "mc-card",
  "mc-token",
  "botolago.card.",
] as const;

/**
 * Chunks allowed to hold or reach the section's code: Gradins' own pages (`gradins.*`), and the
 * server's status read, which the status module loads by a dynamic import on the server only.
 */
export const ALLOWED_CHUNK = /^(gradins[.-]|manager-card-status-server-)/;

const STATIC_IMPORT =
  /(?<![\w.$])(?:import|export)(?:\s*(?:\{[^}]*\}|\*\s*as\s+[\w$]+|[\w$]+(?:\s*,\s*\{[^}]*\})?))?\s*(?:from\s*)?["']\.\/([^"']+\.js)["']/g;

/** The chunks a chunk imports statically. */
export function staticImports(chunk: Chunk): string[] {
  return [...new Set([...chunk.text.matchAll(STATIC_IMPORT)].map((match) => match[1]!))];
}

export function findViolations(
  chunks: readonly Chunk[],
  markers: readonly string[] = DATA_LAYER_MARKERS,
): string[] {
  const byName = new Map(chunks.map((chunk) => [chunk.name, chunk]));
  const holders = new Set(
    chunks
      .filter((chunk) => markers.some((marker) => chunk.text.includes(marker)))
      .map((c) => c.name),
  );
  const reaches = (start: string): string | null => {
    const seen = new Set<string>();
    const queue = [start];
    while (queue.length > 0) {
      const name = queue.shift()!;
      for (const next of staticImports(byName.get(name)!)) {
        if (!byName.has(next) || seen.has(next)) continue;
        if (holders.has(next)) return next;
        seen.add(next);
        queue.push(next);
      }
    }
    return null;
  };
  const violations: string[] = [];
  for (const chunk of chunks) {
    if (ALLOWED_CHUNK.test(chunk.name) || holders.has(chunk.name)) continue;
    const hit = reaches(chunk.name);
    if (hit) violations.push(`${chunk.name} imports ${hit}, which holds the Manager Card's code`);
  }
  return violations;
}

export function runGate(directory: string): { code: number; message: string } {
  if (!existsSync(directory)) {
    return { code: 1, message: `No build in ${directory}. Run \`bun run build\` first.` };
  }
  const chunks = readdirSync(directory)
    .filter((file) => file.endsWith(".js"))
    .map((file) => ({ name: basename(file), text: readFileSync(join(directory, file), "utf8") }));
  if (chunks.length === 0) return { code: 1, message: `${directory} holds no chunks to read.` };
  const holders = chunks.filter((chunk) => DATA_LAYER_MARKERS.some((m) => chunk.text.includes(m)));
  if (holders.length === 0) {
    return {
      code: 1,
      message: "No chunk holds the Manager Card's code: the markers are stale.",
    };
  }
  const violations = findViolations(chunks);
  if (violations.length === 0) {
    return {
      code: 0,
      message:
        `Manager Card off-bundle gate: ${chunks.length} chunks; the section's code is in ` +
        `${holders.map((chunk) => chunk.name).join(", ")} and no ordinary page imports it.`,
    };
  }
  return {
    code: 1,
    message: `Manager Card off-bundle gate FAILED:\n${violations.map((line) => `  ${line}`).join("\n")}`,
  };
}

if (import.meta.main) {
  const result = runGate(process.argv[2] ?? ".output/public/assets");
  console.log(result.message);
  process.exit(result.code);
}
