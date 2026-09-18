import { describe, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { RULES, resolveTargets, scanText } from "./check-config-integrity.mjs";

const script = join(import.meta.dir, "check-config-integrity.mjs");
const repositoryRoot = resolve(import.meta.dir, "../..");

type Violation = { file: string; line: number; rule: string; name: string; text: string };

function rulesFor(text: string): string[] {
  return (scanText("fixture", text) as Violation[]).map((violation) => violation.rule);
}

function run(args: string[] = []) {
  return Bun.spawnSync(["bun", script, ...args], {
    cwd: repositoryRoot,
    stderr: "pipe",
    stdout: "pipe",
  });
}

describe("rule catalogue", () => {
  test("exposes the six documented rules in order", () => {
    expect(RULES.map((rule: { id: string }) => rule.id)).toEqual([
      "R1",
      "R2",
      "R3",
      "R4",
      "R5",
      "R6",
    ]);
  });
});

describe("scanText — positives", () => {
  test("R1 flags a 600-character line", () => {
    expect(rulesFor(`const padding = "${"a".repeat(600)}";`)).toContain("R1");
  });

  test("R2 flags a padding run after code", () => {
    expect(rulesFor(`);${" ".repeat(60)}global.i = 1;`)).toContain("R2");
  });

  test("R3 flags an obfuscator hex identifier", () => {
    expect(rulesFor("const _0x32ebc7 = _0x5ce2;")).toContain("R3");
  });

  test("R4 flags a createRequire shim and a bare require call", () => {
    expect(rulesFor("import { createRequire } from 'module';")).toContain("R4");
    expect(rulesFor("const http = require('node:http');")).toContain("R4");
  });

  test("R5 flags eval passed as an argument, not only eval(...)", () => {
    expect(rulesFor("f(eval, x)")).toContain("R5");
    expect(rulesFor("const run = eval;")).toContain("R5");
    expect(rulesFor("const fn = new Function('return 1');")).toContain("R5");
    expect(rulesFor("const fn = Function('return 1');")).toContain("R5");
  });

  test("R6 flags an oversized base64-shaped blob", () => {
    const blob = `${"QUJDZGVmR0hJSktsbW5vUFFSU3R1dnd4eXowMTIzNDU2Nzg5Ky8".repeat(4)}=`;
    expect(rulesFor(`const payload = "${blob}";`)).toContain("R6");
  });

  test("the historical payload shape trips R1, R2, R3 and R5 on one line", () => {
    const line = `);${" ".repeat(500)}global.i = 'A10-*41560'; const _0x32ebc7 = _0x5ce2; f(eval, _0x32ebc7);${"x".repeat(600)}`;
    const hits = rulesFor(line);
    expect(hits).toContain("R1");
    expect(hits).toContain("R2");
    expect(hits).toContain("R3");
    expect(hits).toContain("R5");
  });
});

describe("scanText — negatives", () => {
  test("R1 tolerates the longest legitimate workflow line (376 characters)", () => {
    expect(rulesFor(`          run: ${"a".repeat(376 - 15)}`)).toEqual([]);
  });

  test("R6 tolerates a 64-character SHA-256 digest", () => {
    const digest = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    expect(rulesFor(`        uses: actions/upload-artifact@${digest} # v4.6.2`)).toEqual([]);
    expect(rulesFor(`        digest: ${digest}${digest}${digest}`)).toEqual([]);
  });

  test("R2 tolerates deeply indented YAML", () => {
    expect(rulesFor(`${" ".repeat(60)}retention-days: 7`)).toEqual([]);
  });

  test("R5 tolerates member expressions", () => {
    expect(rulesFor("const value = context.eval;")).toEqual([]);
    expect(rulesFor("const value = schema.Function(input);")).toEqual([]);
  });
});

describe("resolveTargets", () => {
  const targets = resolveTargets(repositoryRoot) as string[];

  test("covers the five executed configuration files and the workflow directory", () => {
    expect(targets.length).toBeGreaterThan(0);
    for (const relativePath of [
      "eslint.config.js",
      "vite.config.ts",
      "playwright.config.ts",
      "bunfig.toml",
      "package.json",
      ".github/workflows/backend-quality.yml",
      ".github/workflows/fantasy-authenticated-e2e.yml",
    ]) {
      expect(targets).toContain(resolve(repositoryRoot, relativePath));
    }
  });

  test("never widens the scanned set to scripts/ or docs/", () => {
    for (const target of targets) {
      expect(target.includes("/scripts/")).toBe(false);
      expect(target.includes("/docs/")).toBe(false);
    }
  });

  test("returns an empty set for a root without configuration files", () => {
    const empty = mkdtempSync(join(tmpdir(), "botolago-config-integrity-empty-"));
    try {
      expect(resolveTargets(empty)).toEqual([]);
    } finally {
      rmSync(empty, { force: true, recursive: true });
    }
  });

  test("the current tree is clean under every rule", () => {
    const violations: Violation[] = [];
    for (const target of targets) {
      violations.push(...(scanText(target, readFileSync(target, "utf8")) as Violation[]));
    }
    expect(violations).toEqual([]);
  });
});

describe("backend-quality.yml step ordering", () => {
  const workflow = readFileSync(
    resolve(repositoryRoot, ".github/workflows/backend-quality.yml"),
    "utf8",
  );
  const lines = workflow.split("\n");

  function jobBlock(job: string) {
    const start = lines.findIndex((line) => line.startsWith(`  ${job}:`));
    expect(start).toBeGreaterThan(-1);
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((line) => /^ {2}\S/.test(line));
    return end === -1 ? rest : rest.slice(0, end);
  }

  for (const job of ["application-quality", "database-quality"]) {
    test(`${job} runs the guard before bun install`, () => {
      const block = jobBlock(job);
      const guard = block.findIndex((line) => line.includes("name: Config integrity guard"));
      const install = block.findIndex((line) => line.includes("bun install --frozen-lockfile"));
      expect(guard).toBeGreaterThan(-1);
      expect(install).toBeGreaterThan(-1);
      expect(guard).toBeLessThan(install);
    });
  }

  test("application-quality runs the guard before bun run lint", () => {
    const block = jobBlock("application-quality");
    const guard = block.findIndex((line) => line.includes("name: Config integrity guard"));
    const lint = block.findIndex((line) => line.includes("bun run lint"));
    expect(lint).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(lint);
  });
});

describe("command line interface", () => {
  test("exits 0 on the current tree", () => {
    const result = run();
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("no violations");
  });

  test("exits 1 and reports each violation for an injected payload", () => {
    const directory = mkdtempSync(join(tmpdir(), "botolago-config-integrity-"));
    try {
      const fixture = join(directory, "payload.js");
      writeFileSync(
        fixture,
        [
          "import { createRequire } from 'module';",
          `);${" ".repeat(500)}const _0x32ebc7 = _0x5ce2; f(eval, _0x32ebc7);${"x".repeat(600)}`,
          "",
        ].join("\n"),
      );
      const result = run(["--file", fixture]);
      expect(result.exitCode).toBe(1);
      const stderr = result.stderr.toString();
      for (const rule of ["R1", "R2", "R3", "R4", "R5"]) expect(stderr).toContain(rule);
      for (const reported of stderr.split("\n").filter((line) => line.startsWith("- "))) {
        expect(reported.length).toBeLessThan(200);
      }
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  test("exits 2 for an unreadable path", () => {
    expect(run(["--file", join(tmpdir(), "botolago-config-integrity-missing.js")]).exitCode).toBe(
      2,
    );
  });

  test("exits 2 for an unknown flag", () => {
    expect(run(["--everything"]).exitCode).toBe(2);
  });

  test("exits 2 when the resolved target set is empty", () => {
    const directory = mkdtempSync(join(tmpdir(), "botolago-config-integrity-root-"));
    try {
      const nested = join(directory, "scripts", "backend");
      mkdirSync(nested, { recursive: true });
      const copy = join(nested, "check-config-integrity.mjs");
      copyFileSync(script, copy);
      const result = Bun.spawnSync(["bun", copy], {
        cwd: directory,
        stderr: "pipe",
        stdout: "pipe",
      });
      expect(result.exitCode).toBe(2);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
