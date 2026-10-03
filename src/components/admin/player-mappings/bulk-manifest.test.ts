import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BULK_REASONS } from "@/backend/football/identity/bulk-mapping/contract";
import { verifyManifest } from "@/backend/football/identity/bulk-mapping/manifest";
import { BULK_MANIFEST } from "./bulk-manifest";

const root = join(import.meta.dir, "../../../..");
const dir = join(root, "docs/production/manifests");
const NAME = "player-mapping-bulk-2026-10-02";

describe("the committed production manifest", () => {
  test("verifies: schema, SHA-256, order, no duplicate candidate / provider id / target, no name or date", async () => {
    const verdict = await verifyManifest(BULK_MANIFEST);
    expect(verdict.ok).toBe(true);
  });

  test("is the approved population: 189 Sofascore rows, 108 Tier A and 81 Tier B", async () => {
    const verdict = await verifyManifest(BULK_MANIFEST);
    if (!verdict.ok) throw new Error("manifest invalid");
    const { manifest } = verdict;
    expect(manifest.population).toEqual({ total: 189, tierA: 108, tierB: 81 });
    expect(manifest.rows.every((r) => r.provider === "sofascore")).toBe(true);
    expect(
      manifest.rows.filter((r) => r.tier === "A").every((r) => r.signals.shirt === "match"),
    ).toBe(true);
    expect(
      manifest.rows.filter((r) => r.tier === "B").every((r) => r.signals.shirt === "no_signal"),
    ).toBe(true);
    expect(manifest.rows.every((r) => r.sportsMonksCorroboration)).toBe(true);
    expect(manifest.reasons).toMatchObject({ A: BULK_REASONS.A, B: BULK_REASONS.B });
  });

  test("the reviewed JSON, the SHA-256 file and the code the screen ships are the same manifest", async () => {
    const json = JSON.parse(readFileSync(join(dir, `${NAME}.manifest.json`), "utf8")) as {
      manifestSha256: string;
    };
    const sha = readFileSync(join(dir, `${NAME}.manifest.sha256`), "utf8").split(/\s+/)[0];
    expect(json).toEqual(JSON.parse(JSON.stringify(BULK_MANIFEST)));
    expect(sha).toBe(json.manifestSha256);
  });

  test("carries no name and no calendar date", () => {
    const text = readFileSync(join(dir, `${NAME}.manifest.json`), "utf8");
    expect(text).not.toMatch(
      /display|full_?name|first_?name|last_?name|slug|birth|\d{4}-\d{2}-\d{2}/i,
    );
  });
});
