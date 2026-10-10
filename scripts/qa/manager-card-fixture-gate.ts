/**
 * Production-build gate for the Manager Card's development fixtures (plan section 7.7).
 *
 * The fixtures (`src/backend/manager-card/fixtures.ts`) are sample managers with made-up names.
 * They are reachable only through an `import.meta.env.DEV` branch, which Vite replaces with
 * `false` in a production build, so none of it should be in `.output/`. A source test checks the
 * import is guarded; this checks the result: it scans every file of the build for the sentinel
 * string, the sample names and the fixture URLs, and exits 1 if any appears.
 *
 *   bun run build && bun scripts/qa/manager-card-fixture-gate.ts [dir]
 *
 * `dir` is `.output` unless given. Exit 0: nothing found. Exit 1: something found, or no build.
 * A scan of a build that carries the fixtures (the `--self-check` flag builds nothing; it runs
 * the scanner on a made-up file that does) proves the gate can fail.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import {
  FIXTURES,
  FIXTURE_IDS,
  MANAGER_CARD_FIXTURE_SENTINEL,
} from "../../src/backend/manager-card/fixtures";

export interface ScannedFile {
  path: string;
  text: string;
}

export interface GateFinding {
  path: string;
  needle: string;
}

/** What a production build must not contain: the sentinel, the sample names and the fixture URLs. */
export function fixtureNeedles(): string[] {
  const needles = new Set<string>([MANAGER_CARD_FIXTURE_SENTINEL]);
  for (const id of FIXTURE_IDS) {
    needles.add(`mc=${id}`);
    needles.add(FIXTURES[id].label);
  }
  for (const fixture of Object.values(FIXTURES)) {
    if (fixture.card) needles.add(fixture.card.name);
    for (const member of fixture.league?.members ?? []) needles.add(member.name);
    if (fixture.league) needles.add(fixture.league.name);
  }
  // `Ali` is a real name; the others are specific enough to mean the fixtures.
  needles.delete("Ali");
  return [...needles].filter((needle) => needle.length >= 4);
}

export function scanFiles(
  files: readonly ScannedFile[],
  needles: readonly string[],
): GateFinding[] {
  const found: GateFinding[] = [];
  for (const file of files) {
    for (const needle of needles) {
      if (file.text.includes(needle)) found.push({ path: file.path, needle });
    }
  }
  return found;
}

const TEXT_FILE = /\.(m?js|cjs|json|html|css|txt|map|webmanifest|xml)$/;

function collect(directory: string): ScannedFile[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collect(path);
    if (!TEXT_FILE.test(entry.name) || statSync(path).size > 64 * 1024 * 1024) return [];
    return [{ path, text: readFileSync(path, "utf8") }];
  });
}

export function runGate(directory: string): { code: number; message: string } {
  if (!existsSync(directory)) {
    return { code: 1, message: `No build in ${directory}. Run \`bun run build\` first.` };
  }
  const files = collect(directory);
  if (files.length === 0) return { code: 1, message: `${directory} holds no files to scan.` };
  const findings = scanFiles(files, fixtureNeedles());
  if (findings.length === 0) {
    return {
      code: 0,
      message: `Manager Card fixture gate: ${files.length} files in ${directory}, no fixture found.`,
    };
  }
  const lines = findings
    .slice(0, 20)
    .map(
      (finding) => `  ${relative(process.cwd(), finding.path)}: ${JSON.stringify(finding.needle)}`,
    );
  return {
    code: 1,
    message: `Manager Card fixture gate FAILED: a production build must not contain fixtures.\n${lines.join("\n")}`,
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.includes("--self-check")) {
    const hit = scanFiles(
      [{ path: "made-up.js", text: `const x = "${MANAGER_CARD_FIXTURE_SENTINEL}"; // KARIM` }],
      fixtureNeedles(),
    );
    console.log(hit.length >= 2 ? "self-check ok: the gate finds a fixture" : "self-check FAILED");
    process.exit(hit.length >= 2 ? 0 : 1);
  }
  const result = runGate(args.find((arg) => !arg.startsWith("--")) ?? ".output");
  console.log(result.message);
  process.exit(result.code);
}
