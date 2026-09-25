import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

// Bun runs every test file in one process, and `mock.module` replaces a module
// for the rest of that process, not only for the file that called it. A mock
// that exported `supabase` alone took `createSupabaseFetch` away from
// client.test.ts whenever that file happened to run later, so the full run
// passed or failed on file order (audit 2026-09-25, A15). A file that mocks a
// module therefore puts it back itself: inside an `afterAll`, it mocks the same
// id again with a name bound to that module's real import.
//
// This reads source text, so it checks that shape and nothing more: it cannot
// tell whether the `afterAll` runs, or whether the mock in between was partial.

const ROOT = join(import.meta.dir, "..");
const SCANNED = ["src", "scripts", "docs", "supabase", "tests"];

function testFiles(directory: string): string[] {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : testFiles(path);
    return /\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** The ids passed to `mock.module`, `null` for one that is not a plain string. */
function mockedModuleIds(code: string): Array<string | null> {
  return [...code.matchAll(/mock\.module\(\s*(?:(["'])([^"'`]+)\1|[^,)]*)/g)].map(
    (match) => match[2] ?? null,
  );
}

/** The argument text of every `afterAll(...)` call, found by matching brackets. */
function afterAllBodies(code: string): string[] {
  return [...code.matchAll(/\bafterAll\(/g)].map((match) => {
    const start = match.index + match[0].length;
    let depth = 1;
    let end = start;
    while (end < code.length && depth > 0) {
      if (code[end] === "(") depth += 1;
      else if (code[end] === ")") depth -= 1;
      end += 1;
    }
    return code.slice(start, end - 1);
  });
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether an `afterAll` mocks `id` back to a name bound to its real import. */
function restoresRealModule(code: string, id: string): boolean {
  const quoted = `(["'])${escapeRegExp(id)}\\1`;
  const restore = new RegExp(`mock\\.module\\(\\s*${quoted}\\s*,\\s*\\(\\)\\s*=>\\s*(\\w+)\\s*\\)`);
  return afterAllBodies(code).some((body) => {
    const name = body.match(restore)?.[2];
    if (!name) return false;
    const binding = new RegExp(
      `\\b(?:const|let)\\s+${name}\\s*=\\s*(?:\\{\\s*\\.\\.\\.\\s*\\(\\s*)?await\\s+import\\(\\s*${quoted}\\s*\\)`,
    );
    return binding.test(code);
  });
}

/** What a file's module mocks leave behind for the files that run after it. */
function unrestoredModuleMocks(source: string): string[] {
  const code = withoutComments(source);
  const ids = mockedModuleIds(code);
  if (ids.includes(null)) return ["a mock.module id that is not a string literal"];
  return [...new Set(ids as string[])].filter((id) => !restoresRealModule(code, id));
}

describe("module mocks are undone by the file that made them", () => {
  it("holds for every test file in the repository", () => {
    const offenders = SCANNED.flatMap((directory) => testFiles(join(ROOT, directory)))
      .filter((path) => path !== join(import.meta.dir, "test-isolation.test.ts"))
      .flatMap((path) =>
        unrestoredModuleMocks(readFileSync(path, "utf8")).map(
          (problem) => `${relative(ROOT, path)}: ${problem}`,
        ),
      );
    expect(offenders).toEqual([]);
  });

  it("flags a mock that is never put back", () => {
    const partial = `mock.module("./client", () => ({ supabase: {} }));`;
    expect(unrestoredModuleMocks(partial)).toEqual(["./client"]);
  });

  it("accepts a mock restored in afterAll", () => {
    const restored = `
      const real = { ...(await import("./client")) };
      mock.module("./client", () => ({ ...real, supabase: {} }));
      afterAll(() => {
        mock.module("./client", () => real);
      });`;
    expect(unrestoredModuleMocks(restored)).toEqual([]);
  });

  it("does not count a second mock outside afterAll as a restore", () => {
    // Two partial mocks of one id, plus an afterAll that restores nothing.
    const twice = `
      const real = { ...(await import("./client")) };
      mock.module("./client", () => ({ supabase: {} }));
      it("again", () => { mock.module("./client", () => real); });
      afterAll(() => { window = saved; });`;
    expect(unrestoredModuleMocks(twice)).toEqual(["./client"]);
  });

  it("does not count a restore to something other than the real module", () => {
    const stub = `
      const fake = { supabase: {} };
      mock.module("./client", () => fake);
      afterAll(() => {
        mock.module("./client", () => fake);
      });`;
    expect(unrestoredModuleMocks(stub)).toEqual(["./client"]);
    const otherModule = `
      const real = await import("./other");
      mock.module("./client", () => ({ supabase: {} }));
      afterAll(() => {
        mock.module("./client", () => real);
      });`;
    expect(unrestoredModuleMocks(otherModule)).toEqual(["./client"]);
  });

  it("does not count a commented-out restore", () => {
    const commented = `
      const real = { ...(await import("./client")) };
      mock.module("./client", () => ({ supabase: {} }));
      afterAll(() => {
        // mock.module("./client", () => real);
      });`;
    expect(unrestoredModuleMocks(commented)).toEqual(["./client"]);
  });

  it("refuses an id it cannot read", () => {
    expect(unrestoredModuleMocks(`mock.module(path, () => ({})); afterAll(() => {});`)).toEqual([
      "a mock.module id that is not a string literal",
    ]);
  });
});
