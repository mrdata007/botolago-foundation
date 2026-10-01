import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { droppedFields, FLASHSCORE_SPEC, SOFASCORE_SPEC } from "./provider-fixtures";

/**
 * The repository is public and the provider payloads are third-party data. This
 * test is the guard on what is committed under tests/fixtures/providers: every
 * file must already be in its trimmed form (a field outside the keep-list fails),
 * and none may be large enough to be a full payload.
 */
const root = resolve(import.meta.dir, "../../tests/fixtures/providers");
const MAX_BYTES = 80_000;

const SPECS: Record<string, Record<string, unknown>> = {
  sofascore: SOFASCORE_SPEC,
  flashscore: FLASHSCORE_SPEC,
};

function files(provider: string): string[] {
  const dir = resolve(root, provider);
  return existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".json")) : [];
}

describe("committed provider fixtures are trimmed", () => {
  for (const provider of Object.keys(SPECS)) {
    for (const name of files(provider)) {
      test(`${provider}/${name}`, () => {
        const path = resolve(root, provider, name);
        expect(statSync(path).size).toBeLessThan(MAX_BYTES);
        const kind = name.split(".")[1] ?? "";
        const value: unknown = JSON.parse(readFileSync(path, "utf8"));
        if (provider === "sofascore" && kind === "statistics") {
          // Trimmed by key list, not by a field spec: only these four fields per line.
          expect(JSON.stringify(value)).not.toContain('"compareCode"');
          return;
        }
        const spec = SPECS[provider]?.[kind];
        expect(spec).toBeDefined();
        expect(droppedFields(value, spec as never)).toEqual([]);
      });
    }
  }

  test("the match plan holds ids and labels only", () => {
    const plan = JSON.parse(readFileSync(resolve(root, "matches.json"), "utf8")) as {
      matches: Record<string, unknown>[];
    };
    for (const match of plan.matches) {
      expect(Object.keys(match).sort()).toEqual(["flashscoreId", "key", "label", "sofascoreId"]);
    }
  });
});
