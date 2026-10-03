import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = join(import.meta.dir, "replay-provider-fixtures.ts");
const raw = [
  {
    id: "m1",
    provider_name: "sofascore",
    external_id: "1",
    internal_entity_id: "00000000-0000-4000-8000-000000000001",
    source_version: null,
    active: true,
    manually_corrected: true,
    updated_at: "2026-10-03T00:00:00Z",
  },
];

describe("replay script snapshot provenance", () => {
  test("a raw SQL array without --captured-at is refused: no false capture time", () => {
    const file = join(mkdtempSync(join(tmpdir(), "replay-")), "rows.json");
    writeFileSync(file, JSON.stringify(raw));
    const run = spawnSync("bun", [script, "--mappings", file], { encoding: "utf8" });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("--captured-at");
  });

  test("with --captured-at it runs and states that time, not the payload capture time", () => {
    const file = join(mkdtempSync(join(tmpdir(), "replay-")), "rows.json");
    writeFileSync(file, JSON.stringify(raw));
    const run = spawnSync(
      "bun",
      [script, "--mappings", file, "--captured-at", "2026-10-03T08:00:00.000Z"],
      { encoding: "utf8" },
    );
    expect(run.status).toBe(0);
    const out = JSON.parse(run.stdout) as { snapshot: { capturedAt: string; entries: number } };
    expect(out.snapshot).toMatchObject({ capturedAt: "2026-10-03T08:00:00.000Z", entries: 1 });
  });
});
