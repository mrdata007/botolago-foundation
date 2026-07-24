import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : entry.isFile() && /\.(ts|tsx)$/.test(entry.name)
        ? [path]
        : [];
  });
}

describe("production route authority", () => {
  it("does not import the legacy all-mock Botola service from a route", () => {
    const offenders = sourceFiles(join(process.cwd(), "src/routes")).filter((path) =>
      readFileSync(path, "utf8").includes('from "@/services/mock"'),
    );
    expect(offenders).toEqual([]);
  });
});
