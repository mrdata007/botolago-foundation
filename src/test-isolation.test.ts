import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

// Bun runs every test file in one process, and `mock.module` replaces a module
// for the rest of that process, not only for the file that called it. A mock
// that exported `supabase` alone took `createSupabaseFetch` away from
// client.test.ts whenever that file happened to run later, so the full run
// passed or failed on file order (audit 2026-09-25, A15). A file that mocks a
// module therefore puts it back itself: inside an `afterAll`, it mocks the same
// id again with a copy of the real module, taken before the first mock:
//
//   const real = { ...(await import("./client")) };   // first
//   mock.module("./client", () => ({ ...real, supabase: stub }));
//   afterAll(() => { mock.module("./client", () => real); });
//
// Both halves of the copy matter. Imported after the mock, the module IS the
// mock, and the "restore" puts the mock back. And `mock.module` overwrites the
// exports of a module already loaded, so a namespace kept without spreading it
// (`const real = await import(...)`) reads the mock's values by the time the
// restore hands it back. Either way every later file gets the mock (both
// checked against Bun 1.3).
//
// The same function is `vi.mock` and `jest.mock` in bun:test, so those count
// too, under their own names or an alias a file imports them as.
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

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A pattern for the calls that replace a module: `mock.module`, `vi.mock` or
 * `jest.mock`, and the same through an alias imported from bun:test. A
 * namespace import (`bunTest.mock.module`) matches; `xmock.module` does not.
 */
function moduleMockCallee(code: string): string {
  const method: Record<string, string> = { mock: "module", vi: "mock", jest: "mock" };
  const callees = Object.entries(method).map(([object, name]) => `${object}\\.${name}`);
  for (const [, specifiers] of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']bun:test["']/g)) {
    for (const [, imported, local] of specifiers!.matchAll(/\b(mock|vi|jest)\s+as\s+([\w$]+)/g)) {
      callees.push(`${escapeRegExp(local!)}\\.${method[imported!]}`);
    }
  }
  return `(?<![\\w$])(?:${callees.join("|")})`;
}

/** The ids passed to a module mock, `null` for one that is not a plain string. */
function mockedModuleIds(code: string, callee: string): Array<string | null> {
  const call = new RegExp(`${callee}\\(\\s*(?:(["'])([^"'\`]+)\\1|[^,)]*)`, "g");
  return [...code.matchAll(call)].map((match) => match[2] ?? null);
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

/**
 * Whether an `afterAll` mocks `id` back to a `const` copy of its real import
 * (`{ ...(await import(id)) }`), every such copy made before `id` is first
 * mocked.
 */
function restoresRealModule(code: string, id: string, callee: string): boolean {
  const quoted = `(?:"${escapeRegExp(id)}"|'${escapeRegExp(id)}')`;
  const firstMock = code.search(new RegExp(`${callee}\\(\\s*${quoted}`));
  const restore = new RegExp(`${callee}\\(\\s*${quoted}\\s*,\\s*\\(\\)\\s*=>\\s*([\\w$]+)\\s*\\)`);
  return afterAllBodies(code).some((body) => {
    const name = body.match(restore)?.[1];
    if (!name) return false;
    const copy = new RegExp(
      `\\bconst\\s+${escapeRegExp(name)}\\s*=\\s*\\{\\s*\\.\\.\\.\\s*\\(?\\s*await\\s+import\\(\\s*${quoted}\\s*\\)\\s*\\)?\\s*,?\\s*\\}`,
      "g",
    );
    const copies = [...code.matchAll(copy)];
    return copies.length > 0 && copies.every((match) => match.index < firstMock);
  });
}

/** What a file's module mocks leave behind for the files that run after it. */
function unrestoredModuleMocks(source: string): string[] {
  const code = withoutComments(source);
  const callee = moduleMockCallee(code);
  // Passed around rather than called, it could mock anything unseen.
  if (new RegExp(`${callee}\\b(?!\\s*\\()`).test(code)) {
    return ["a module mock that is not called directly"];
  }
  const ids = mockedModuleIds(code, callee);
  if (ids.includes(null)) return ["a mock.module id that is not a string literal"];
  return [...new Set(ids as string[])].filter((id) => !restoresRealModule(code, id, callee));
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

  it("does not count a copy of the module taken after it was mocked", () => {
    // By then the import answers with the mock, so the restore re-installs it.
    const mockedFirst = `
      mock.module("./dep", () => ({ value: "mocked" }));
      const real = { ...(await import("./dep")) };
      afterAll(() => { mock.module("./dep", () => real); });`;
    expect(unrestoredModuleMocks(mockedFirst)).toEqual(["./dep"]);
    // One copy before the mock does not excuse another after it.
    const twice = `
      const real = { ...(await import("./dep")) };
      mock.module("./dep", () => ({ value: "mocked" }));
      it("again", async () => { const real = { ...(await import("./dep")) }; });
      afterAll(() => { mock.module("./dep", () => real); });`;
    expect(unrestoredModuleMocks(twice)).toEqual(["./dep"]);
  });

  it("does not count the module's namespace kept without copying it", () => {
    // `mock.module` overwrites a loaded module's exports, and the namespace
    // with them: restored from it, the module stays mocked.
    const live = `
      const real = await import("./dep");
      mock.module("./dep", () => ({ value: "mocked" }));
      afterAll(() => { mock.module("./dep", () => real); });`;
    expect(unrestoredModuleMocks(live)).toEqual(["./dep"]);
    // A copy that can be reassigned, or that overrides what it copied, is
    // not the real module either.
    const reassignable = `
      let real = { ...(await import("./dep")) };
      mock.module("./dep", () => ({ value: "mocked" }));
      afterAll(() => { mock.module("./dep", () => real); });`;
    expect(unrestoredModuleMocks(reassignable)).toEqual(["./dep"]);
    const overridden = `
      const real = { ...(await import("./dep")), value: "mocked" };
      mock.module("./dep", () => real);
      afterAll(() => { mock.module("./dep", () => real); });`;
    expect(unrestoredModuleMocks(overridden)).toEqual(["./dep"]);
  });

  it("follows vi.mock, jest.mock and an imported alias of mock", () => {
    for (const call of ["vi.mock", "jest.mock", "bunTest.mock.module"]) {
      expect(unrestoredModuleMocks(`${call}("./dep", () => ({}));`)).toEqual(["./dep"]);
    }
    const aliased = `
      import { afterAll, mock as replace } from "bun:test";
      replace.module("./dep", () => ({ value: "mocked" }));`;
    expect(unrestoredModuleMocks(aliased)).toEqual(["./dep"]);
    const restored = `
      import { afterAll, mock as replace } from "bun:test";
      const real = { ...(await import("./dep")) };
      replace.module("./dep", () => ({ ...real, value: "mocked" }));
      afterAll(() => { replace.module("./dep", () => real); });`;
    expect(unrestoredModuleMocks(restored)).toEqual([]);
    expect(unrestoredModuleMocks(`const swap = mock.module; swap("./dep", () => ({}));`)).toEqual([
      "a module mock that is not called directly",
    ]);
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
