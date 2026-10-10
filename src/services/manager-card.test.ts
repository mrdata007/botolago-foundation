import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { BackendError } from "@/backend/errors";
import { FIXTURE_STORAGE_KEY, currentFixtureId } from "@/backend/manager-card/fixture-selection";

import { getManagerCardRepository, selectManagerCardDataMode } from "./manager-card";

const ROOT = join(import.meta.dir, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
const sourceFiles = (): string[] =>
  readdirSync(join(ROOT, "src"), { recursive: true, encoding: "utf8" })
    .filter((entry) => /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry))
    .map((entry) => join("src", entry))
    .sort();

describe("selectManagerCardDataMode", () => {
  it("is mock in development unless told otherwise, supabase in production", () => {
    expect(selectManagerCardDataMode(undefined, false)).toBe("mock");
    expect(selectManagerCardDataMode("mock", false)).toBe("mock");
    expect(selectManagerCardDataMode("supabase", false)).toBe("supabase");
    expect(selectManagerCardDataMode(undefined, true)).toBe("supabase");
    expect(selectManagerCardDataMode("supabase", true)).toBe("supabase");
  });

  it("refuses to run production on anything but the database", () => {
    for (const configured of ["mock", "fixture", "", "SUPABASE"]) {
      expect(() => selectManagerCardDataMode(configured, true)).toThrow(BackendError);
    }
  });

  it("falls back to the default for a value it does not know, outside production", () => {
    expect(selectManagerCardDataMode("nonsense", false)).toBe("mock");
  });
});

describe("the fixtures are not in a production build", () => {
  it("the mock repository is reached through one dynamic import behind import.meta.env.DEV", () => {
    const source = read("src/services/manager-card.ts");
    const guard = source.indexOf("if (import.meta.env.DEV) {");
    const dynamicImport = source.indexOf('await import("@/backend/manager-card/mock-repository")');
    expect(guard).toBeGreaterThan(-1);
    expect(dynamicImport).toBeGreaterThan(guard);
    // The plain form only: `import.meta.env?.DEV` is not replaced statically.
    expect(source).not.toContain("import.meta.env?.");
  });

  it("no source file imports the mock repository or the fixtures statically", () => {
    // Only `src/` can reach the bundle. Test files, scripts and the backend plan's contract test
    // under `scripts/backend/` import the fixtures freely; the production-build fixture gate
    // (scripts/qa/manager-card-fixture-gate.ts) is the real guarantee, and this catches the
    // mistake before a build does.
    const target = (specifier: string, from: string): string | null => {
      const path = specifier.startsWith("@/")
        ? join("src", specifier.slice(2))
        : specifier.startsWith(".")
          ? join(from, "..", specifier)
          : null;
      return path && /^src\/backend\/manager-card\/(mock-repository|fixtures)$/.test(path)
        ? path
        : null;
    };
    const importers = sourceFiles().flatMap((file) =>
      [
        ...stripComments(readFileSync(join(ROOT, file), "utf8")).matchAll(
          /["']((?:@\/|\.)[^"']*)["']/g,
        ),
      ]
        .map((match) => target(match[1]!, file))
        .filter((path): path is string => path !== null)
        .map((path) => `${file} -> ${path}`),
    );
    expect(importers.sort()).toEqual([
      // The pair import each other; nothing else names either of them but the one dynamic
      // import, behind `import.meta.env.DEV`.
      "src/backend/manager-card/mock-repository.ts -> src/backend/manager-card/fixtures",
      "src/services/manager-card.ts -> src/backend/manager-card/mock-repository",
    ]);
    expect(stripComments(read("src/services/manager-card.ts"))).not.toMatch(
      /^import[^;]*mock-repository/m,
    );
  });

  it("the modules a production build keeps do not name a fixture", () => {
    for (const file of [
      "src/services/manager-card-status.ts",
      "src/services/manager-card-mode.ts",
      "src/services/use-manager-card.ts",
      "src/components/manager-card/to-profile.ts",
      "src/backend/manager-card/supabase-repository.ts",
      "src/backend/manager-card/contracts.ts",
    ]) {
      expect(read(file)).not.toContain("mc-fixture-sentinel");
      expect(stripComments(read(file))).not.toMatch(/from "[^"]*\/fixtures"|from "\.\/fixtures"/);
    }
  });
});

describe("getManagerCardRepository", () => {
  it("under test (no development flag) never hands out the fixtures", async () => {
    await expect(getManagerCardRepository()).rejects.toMatchObject({ code: "data_unavailable" });
  });
});

describe("currentFixtureId", () => {
  const globals = globalThis as { window?: unknown };
  const previous = globals.window;
  afterEach(() => {
    if (previous === undefined) delete globals.window;
    else globals.window = previous;
  });

  function fakeWindow(search: string, stored: Record<string, string> = {}, blocked = false) {
    const store = new Map(Object.entries(stored));
    globals.window = {
      location: { search },
      sessionStorage: {
        getItem: (key: string) => {
          if (blocked) throw new Error("blocked");
          return store.get(key) ?? null;
        },
        setItem: (key: string, value: string) => {
          if (blocked) throw new Error("blocked");
          store.set(key, value);
        },
      },
    };
    return store;
  }

  it("takes ?mc= from the address and keeps it for the session", () => {
    const store = fakeWindow("?mc=founder");
    expect(currentFixtureId()).toBe("founder");
    expect(store.get(FIXTURE_STORAGE_KEY)).toBe("founder");
  });

  it("keeps the fixture when a client navigation drops the query string", () => {
    fakeWindow("", { [FIXTURE_STORAGE_KEY]: "tierUp" });
    expect(currentFixtureId()).toBe("tierUp");
  });

  it("is null with neither, on the server, and with storage blocked", () => {
    fakeWindow("");
    expect(currentFixtureId()).toBeNull();
    fakeWindow("?mc=legend", {}, true);
    expect(currentFixtureId()).toBe("legend");
    fakeWindow("", {}, true);
    expect(currentFixtureId()).toBeNull();
    delete globals.window;
    expect(currentFixtureId()).toBeNull();
  });
});
