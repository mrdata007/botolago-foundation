/**
 * Config integrity guard (BG-0020, RC-2).
 *
 * Closes the detection gap of the 2026-09-18 obfuscated `eslint.config.js`
 * loader incident: every file CI executes as configuration is scanned for the
 * lexical shape of an injected payload BEFORE anything evaluates it.
 *
 * Dependency-free ESM, node builtins only, so it can run before
 * `bun install`. The scanned set is a closed list of executed configuration
 * files; it is deliberately NOT widened to scripts/** or docs/**, which
 * legitimately contain the very patterns this guard rejects.
 *
 * Usage:
 *   bun scripts/backend/check-config-integrity.mjs              # scan the set
 *   bun scripts/backend/check-config-integrity.mjs --file <p>   # scan one file
 *
 * Exit codes: 0 clean, 1 violations found, 2 usage error / unreadable file /
 * empty target set.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HEX_ONLY = /^[0-9a-fA-F]+$/;
const MAX_LINE_LENGTH = 500;
const MAX_ECHO = 80;

/** Executed configuration files, relative to the repository root. */
export const CONFIG_FILES = [
  "eslint.config.js",
  "vite.config.ts",
  "playwright.config.ts",
  "bunfig.toml",
  "package.json",
];

export const WORKFLOW_DIRECTORY = ".github/workflows";

function firstMatch(pattern) {
  return (line) => {
    const found = line.match(pattern);
    return found ? { text: found[0] } : null;
  };
}

/**
 * Every rule inspects a single line and returns `{ text, detail? }` for the
 * offending fragment, or `null`. There is no allowlist and no suppression
 * comment: a hit is always a build failure.
 */
export const RULES = [
  {
    id: "R1",
    name: "long-line",
    description: `line longer than ${MAX_LINE_LENGTH} characters`,
    match: (line) =>
      line.length > MAX_LINE_LENGTH ? { text: line, detail: `${line.length} chars` } : null,
  },
  {
    id: "R2",
    name: "padding-run",
    description: "run of 40+ spaces or tabs after code (payload padding)",
    match: firstMatch(/\S[ \t]{40,}/),
  },
  {
    id: "R3",
    name: "hex-identifier",
    description: "obfuscator-style _0x identifier",
    match: firstMatch(/_0x[0-9a-fA-F]{4,}/),
  },
  {
    id: "R4",
    name: "require-shim",
    description: "createRequire shim or CommonJS require() call",
    match: firstMatch(/createRequire|\brequire\s*\(/),
  },
  {
    id: "R5",
    name: "dynamic-eval",
    description: "eval identifier or Function constructor",
    match: firstMatch(/(?:^|[^.\w$])eval\b|\bnew\s+Function\s*\(|(?:^|[^.\w$])Function\s*\(/),
  },
  {
    id: "R6",
    name: "base64-blob",
    description: "base64-shaped run of 120+ characters",
    match: (line) => {
      for (const found of line.matchAll(/[A-Za-z0-9+/]{120,}={0,2}/g)) {
        if (!HEX_ONLY.test(found[0])) return { text: found[0] };
      }
      return null;
    },
  },
];

/** Scan one file's text. Returns a (possibly empty) list of violations. */
export function scanText(filePath, text) {
  const violations = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const rule of RULES) {
      const hit = rule.match(line);
      if (!hit) continue;
      violations.push({
        file: filePath,
        line: index + 1,
        rule: rule.id,
        name: rule.name,
        detail: hit.detail,
        text: hit.text,
      });
    }
  }
  return violations;
}

/** Resolve the closed scanned set under `root`. Absent files are skipped. */
export function resolveTargets(root) {
  const targets = [];
  for (const relativePath of CONFIG_FILES) {
    const absolute = resolve(root, relativePath);
    try {
      if (statSync(absolute).isFile()) targets.push(absolute);
    } catch {
      // A configuration file that does not exist cannot be executed.
    }
  }

  const workflows = resolve(root, WORKFLOW_DIRECTORY);
  let entries = [];
  try {
    entries = readdirSync(workflows);
  } catch {
    entries = [];
  }
  for (const entry of entries.sort()) {
    if (!/\.ya?ml$/.test(entry)) continue;
    const absolute = resolve(workflows, entry);
    try {
      if (statSync(absolute).isFile()) targets.push(absolute);
    } catch {
      // Ignore entries that disappear between listing and stat.
    }
  }

  return targets;
}

export function formatViolation(violation, root) {
  const relativePath = root ? relative(root, violation.file) : "";
  const label = relativePath && !relativePath.startsWith("..") ? relativePath : violation.file;
  const detail = violation.detail ? ` (${violation.detail})` : "";
  // Collapse whitespace first so a padding run does not consume the excerpt,
  // then echo at most MAX_ECHO characters of the offending text.
  const collapsed = violation.text.replace(/\s+/g, " ").trim();
  const echoed = collapsed.slice(0, MAX_ECHO);
  const truncated = collapsed.length > MAX_ECHO ? "…" : "";
  return `- ${label}:${violation.line} ${violation.rule} ${violation.name}${detail}: ${echoed}${truncated}`;
}

function usage(message) {
  process.stderr.write(
    `${message}\nUsage: bun scripts/backend/check-config-integrity.mjs [--file <path>]\n`,
  );
  process.exit(2);
}

function main(argv) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  let targets;

  if (argv.length === 0) {
    targets = resolveTargets(root);
    if (targets.length === 0) usage("No configuration files found to scan.");
  } else if (argv[0] === "--file") {
    if (argv.length !== 2 || !argv[1]) usage("--file requires exactly one path.");
    targets = [resolve(argv[1])];
  } else {
    usage(`Unknown argument: ${argv[0]}`);
    return;
  }

  const violations = [];
  for (const target of targets) {
    let text;
    try {
      text = readFileSync(target, "utf8");
    } catch {
      usage(`Cannot read file: ${target}`);
      return;
    }
    violations.push(...scanText(target, text));
  }

  if (violations.length > 0) {
    const lines = violations.map((violation) => formatViolation(violation, root));
    process.stderr.write(
      `Config integrity guard failed: ${violations.length} violation(s).\n${lines.join("\n")}\n`,
    );
    process.exit(1);
  }

  process.stdout.write(
    `Config integrity guard: no violations in ${targets.length} executed configuration file(s).\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
