import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { canonicalJson, sha256Hex } from "./canonical";
import { FLASHSCORE_BULK_MANIFEST } from "@/components/admin/player-mappings/flashscore-manifest";
import { verifyFlashscoreManifest, type FlashscoreManifest } from "./flashscore-manifest";

const root = resolve(import.meta.dir, "../../../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const MANIFEST = "docs/production/manifests/gw1-flashscore-executable.manifest";

describe("the committed Flashscore manifest", () => {
  const file = JSON.parse(read(`${MANIFEST}.json`)) as FlashscoreManifest;

  test("the file, its recorded hash and the module the screen imports are the same manifest", () => {
    expect(file.manifestSha256).toBe(read(`${MANIFEST}.sha256`).trim());
    expect(FLASHSCORE_BULK_MANIFEST).toEqual(file);
  });

  test("it verifies: shape, hash, order, no collision, class rules, and every fingerprint recomputed from its inputs", async () => {
    const verdict = await verifyFlashscoreManifest(file);
    expect(verdict.ok).toBe(true);
    expect(file.population).toEqual({ total: 42, f1: 24, f2: 18, reviewSet: 53, heldBack: 11 });
  });

  test("the historical review manifests it is cut from are preserved unchanged", async () => {
    const original = "docs/production/manifests/gw1-identity-evidence-2026-10-03.manifest";
    const corrected =
      "docs/production/manifests/gw1-identity-evidence-2026-10-03.corrected.manifest";
    const canonicalHash = async (path: string) => sha256Hex(canonicalJson(JSON.parse(read(path))));
    expect(read(`${original}.sha256`).trim()).toBe(
      "4c3d2294e9122b1cd4793854714db6f10bbaf0d083b6b53391b8813f11cb0576",
    );
    expect(await canonicalHash(`${original}.json`)).toBe(file.sources.originalManifestSha256);
    expect(await canonicalHash(`${corrected}.json`)).toBe(file.sources.correctedManifestSha256);
    expect(file.sources.originalManifestSha256).not.toBe(file.sources.correctedManifestSha256);
  });

  test("every supporting Sofascore mapping is an active, reviewed mapping of the SAME canonical player", () => {
    const snapshot = JSON.parse(
      read("tests/fixtures/identity/reviewed-player-mappings-2026-10-03.json"),
    ) as {
      rows: {
        mappingId: string;
        provider: string;
        externalId: string;
        appPlayerId: string;
        active: boolean;
        reviewed: boolean;
        version: string;
      }[];
    };
    const byMapping = new Map(snapshot.rows.map((r) => [r.mappingId, r]));
    for (const row of file.rows) {
      const m = byMapping.get(row.supporting.mappingId);
      expect(m).toBeDefined();
      expect(m!.provider).toBe("sofascore");
      expect(m!.externalId).toBe(row.supporting.externalId);
      expect(m!.active && m!.reviewed).toBe(true);
      expect(m!.appPlayerId).toBe(row.appPlayerId);
      expect(m!.version).toBe(row.supporting.version);
    }
    // Nothing is mapped for Flashscore yet, so no id or target is already claimed there.
    expect(snapshot.rows.filter((r) => r.provider === "flashscore")).toHaveLength(0);
  });

  test("the rows are the review set's Flashscore candidates, unmapped, at the revision the manifest froze", () => {
    const candidates = JSON.parse(
      read("tests/fixtures/identity/gw1-flashscore-candidates-2026-10-03.json"),
    ) as {
      rows: { candidateId: string; externalId: string; status: string; rev: number }[];
    };
    const byId = new Map(candidates.rows.map((c) => [c.candidateId, c]));
    for (const row of file.rows) {
      const c = byId.get(row.candidateId);
      expect(c?.externalId).toBe(row.externalId);
      expect(c?.status).toBe("unmapped");
      expect(c?.rev).toBe(row.evidenceRevision);
    }
  });

  test("a held-back row is never executable, and each says why", () => {
    const executable = new Set(file.rows.map((r) => r.candidateId));
    expect(file.heldBack).toHaveLength(11);
    for (const held of file.heldBack) {
      expect(executable.has(held.candidateId)).toBe(false);
      expect(held.codes.length).toBeGreaterThan(0);
    }
    const codes = file.heldBack.flatMap((h) => h.codes);
    expect(codes.filter((c) => c === "POSITION_DISAGREEMENT")).toHaveLength(6);
    expect(codes.filter((c) => c === "CLUB_CONTEXT_MISMATCH")).toHaveLength(1);
    expect(codes.filter((c) => c === "SHIRT_DIFFERENCE")).toHaveLength(5);
  });

  test("no row is the additional Sofascore identity, and no name or birth date is in the file", () => {
    expect(file.rows.every((r) => r.provider === "flashscore")).toBe(true);
    const text = read(`${MANIFEST}.json`);
    expect(text).not.toMatch(/"[a-zA-Z]*(name|birth)[a-zA-Z]*"\s*:/i);
    expect(text).not.toMatch(/\b\d{4}-\d{2}-\d{2}(?!T)\b/);
  });
});
