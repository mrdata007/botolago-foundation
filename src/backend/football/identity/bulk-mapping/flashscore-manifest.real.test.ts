import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { canonicalJson, sha256Hex } from "./canonical";
import { FLASHSCORE_BULK_MANIFEST } from "@/components/admin/player-mappings/flashscore-manifest";
import { verifyFlashscoreManifest, type FlashscoreManifest } from "./flashscore-manifest";

const root = resolve(import.meta.dir, "../../../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
/** Version 2: the one the screen offers. Version 1 is historical and checked below, unchanged. */
const MANIFEST = "docs/production/manifests/gw1-flashscore-executable.v2.manifest";
const V1 = "docs/production/manifests/gw1-flashscore-executable.manifest";
const V1_HASH = "524290909f25e4f145f84b4ab670162a859c859e17b410d1cb623a027681a5e8";

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

  test("version 1 is preserved exactly as it was, and version 2 changes the SAME 42 pairs only in fingerprint and schema", async () => {
    const v1 = JSON.parse(read(`${V1}.json`)) as {
      manifestSha256: string;
      schemaVersion: number;
      rows: {
        candidateId: string;
        externalId: string;
        appPlayerId: string;
        evidenceClass: string;
        evidence: unknown;
        fixtures: unknown;
        catalogueSignals: unknown;
        supporting: { mappingId: string; externalId: string; version: string };
        expectedFingerprint: string;
      }[];
      heldBack: { candidateId: string; codes: string[] }[];
    };
    // Untouched: the recorded hash, the file's own hash, the schema it was cut under.
    expect(read(`${V1}.sha256`).trim()).toBe(V1_HASH);
    expect(v1.manifestSha256).toBe(V1_HASH);
    expect(v1.schemaVersion).toBe(1);
    const { manifestSha256: _h, ...unhashed } = v1;
    expect(await sha256Hex(canonicalJson(unhashed))).toBe(V1_HASH);
    // The identity set is the same: every Flashscore id, target, supporting mapping and class.
    expect(
      file.rows.map((r) => [r.candidateId, r.externalId, r.appPlayerId, r.evidenceClass]),
    ).toEqual(v1.rows.map((r) => [r.candidateId, r.externalId, r.appPlayerId, r.evidenceClass]));
    expect(file.rows.map((r) => [r.supporting.mappingId, r.supporting.externalId])).toEqual(
      v1.rows.map((r) => [r.supporting.mappingId, r.supporting.externalId]),
    );
    expect(file.heldBack.map((h) => [h.candidateId, h.codes])).toEqual(
      v1.heldBack.map((h) => [h.candidateId, h.codes]),
    );
    // Target/evidence facts are identical; what differs is the fingerprint, which now includes the
    // supporting mapping's state and the evidence-reference digest, and the supporting binding's shape.
    for (const row of file.rows) {
      const old = v1.rows.find((r) => r.candidateId === row.candidateId)!;
      expect(row.evidence).toEqual(old.evidence);
      expect(row.fixtures).toEqual(old.fixtures);
      expect(row.catalogueSignals).toEqual(old.catalogueSignals);
      expect(row.expectedFingerprint).not.toBe(old.expectedFingerprint);
      // The proposal the old version stamp named is the one the database now reports as the provenance.
      expect(`football_player_mapping:${row.supporting.provenanceProposalId}`).toBe(
        old.supporting.version,
      );
    }
    expect(file.manifestSha256).not.toBe(V1_HASH);
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
      expect(m!.version).toBe(`football_player_mapping:${row.supporting.provenanceProposalId}`);
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
