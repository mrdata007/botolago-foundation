import { describe, expect, test } from "bun:test";
import { canonicalJson, deterministicUuid, sha256Hex } from "./canonical";
import { BULK_REASONS } from "./contract";
import { buildManifest, verifyManifest } from "./manifest";
import { buildWorld, oracleManifest } from "./test-world";

const small = () => oracleManifest(buildWorld({ tierA: 5, tierB: 3, flashscore: 0 }));
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe("canonical form and hashing", () => {
  test("key order never changes the canonical text or the hash", async () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(
      canonicalJson({ a: [{ c: 3, d: 2 }], b: 1 }),
    );
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  test("a deterministic UUID is stable, valid, and distinct per seed", async () => {
    const a = await deterministicUuid("seed-1");
    expect(a).toBe(await deterministicUuid("seed-1"));
    expect(a).not.toBe(await deterministicUuid("seed-2"));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("the manifest", () => {
  test("is deterministic: the same rows in any order give the same hash", async () => {
    const m = await small();
    const again = await buildManifest([...m.rows].reverse());
    expect(again.manifestSha256).toBe(m.manifestSha256);
    expect(m.population).toEqual({ total: 8, tierA: 5, tierB: 3 });
  });

  test("verifies, and carries the approved wording and no name or date", async () => {
    const verdict = await verifyManifest(await small());
    expect(verdict.ok).toBe(true);
    const text = JSON.stringify(await small());
    expect(text).not.toMatch(/displayName|full_name|birth|"name"/i);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  test("any edit, however small, is refused", async () => {
    const m = await small();
    const edits: [string, (x: ReturnType<typeof clone<typeof m>>) => void][] = [
      ["a changed target", (x) => void (x.rows[0]!.appPlayerId = x.rows[1]!.appPlayerId)],
      ["a changed revision", (x) => void (x.rows[0]!.evidenceRevision += 1)],
      ["a changed fingerprint", (x) => void (x.rows[0]!.expectedFingerprint = "0".repeat(64))],
      ["a removed row", (x) => void x.rows.pop()],
      ["a changed tier", (x) => void (x.rows[0]!.tier = x.rows[0]!.tier === "A" ? "B" : "A")],
      ["a changed reason", (x) => void (x.reasons.A = `${BULK_REASONS.A} extra`)],
      ["a name", (x) => void Object.assign(x.rows[0]!, { displayName: "Someone" })],
      [
        "a birth date",
        (x) => void Object.assign(x.rows[0]!.fingerprintInputs, { note: "1990-05-05" }),
      ],
    ];
    for (const [label, edit] of edits) {
      const copy = clone(m);
      edit(copy);
      const verdict = await verifyManifest(copy);
      expect(verdict.ok, label).toBe(false);
    }
  });

  test("a duplicate candidate, provider id or target never verifies, even when re-hashed", async () => {
    const m = await small();
    for (const field of ["candidateId", "externalId", "appPlayerId"] as const) {
      const rows = clone(m.rows);
      rows[1]![field] = rows[0]![field];
      if (field === "candidateId")
        rows[1]!.fingerprintInputs.sofascoreCandidateId = rows[0]!.candidateId;
      if (field === "externalId")
        rows[1]!.fingerprintInputs.sofascoreExternalId = rows[0]!.externalId;
      if (field === "appPlayerId") rows[1]!.fingerprintInputs.appPlayerId = rows[0]!.appPlayerId;
      const rehashed = await buildManifest(rows);
      const verdict = await verifyManifest(rehashed);
      expect(verdict.ok, field).toBe(false);
    }
  });
});
