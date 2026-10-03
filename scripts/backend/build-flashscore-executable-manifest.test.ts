import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  buildFromRead,
  evidenceFacts,
  holdCodes,
  readSql,
  type ProductionRead,
} from "./build-flashscore-executable-manifest";

const root = resolve(import.meta.dir, "../..");
const text = (path: string) => readFileSync(resolve(root, path), "utf8");
const READ = JSON.parse(
  text("tests/fixtures/identity/gw1-flashscore-production-read-2026-10-03.json"),
) as ProductionRead;
const committed = JSON.parse(
  text("docs/production/manifests/gw1-flashscore-executable.manifest.json"),
) as { manifestSha256: string };

const row = (
  patch: Partial<ProductionRead["rows"][number]["signals"]> = {},
  positionDisagreement = false,
) => ({
  ...READ.rows[1]!,
  positionDisagreement,
  signals: { ...READ.rows[1]!.signals, ...patch },
});

describe("the executable Flashscore manifest builder", () => {
  test("the production read is ONE read-only statement", async () => {
    const sql = await readSql();
    expect(sql).toMatch(/^-- READ ONLY/);
    expect(sql).not.toMatch(
      /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|call)\b\s/i,
    );
    // 53 rows go in, in candidate order, with no name.
    expect((sql.match(/::uuid,2,'/g) ?? []).length).toBe(53);
    expect(sql).not.toMatch(/display_?name|full_?name/i);
  });

  test("rebuilding from the saved read gives exactly the committed manifest", async () => {
    const built = await buildFromRead(READ);
    expect(built.manifest.manifestSha256).toBe(committed.manifestSha256);
    expect(built.dropped).toEqual([]);
    expect(built.summaryHolds).toEqual([]);
    expect(built.manifest.population).toEqual({
      total: 42,
      f1: 24,
      f2: 18,
      reviewSet: 53,
      heldBack: 11,
    });
  });

  test("no row is added: every executable row and every held-back row is one of the 53 read", async () => {
    const built = await buildFromRead(READ);
    const read = new Set(READ.rows.map((r) => r.candidateId));
    const ids = [
      ...built.manifest.rows.map((r) => r.candidateId),
      ...built.manifest.heldBack.map((h) => h.candidateId),
    ];
    expect(new Set(ids).size).toBe(53);
    expect(ids.every((id) => read.has(id))).toBe(true);
  });

  test("a row leaves the executable set on any conflict the database reports, never silently", () => {
    expect(holdCodes(row())).toEqual([]);
    expect(
      holdCodes(row({ position: "conflict", flags: ["POSITION_DISAGREEMENT"] }, true)),
    ).toEqual(["POSITION_DISAGREEMENT"]);
    expect(holdCodes(row({ club: "mismatch", flags: ["CLUB_CONTEXT_MISMATCH"] }))).toEqual([
      "CLUB_CONTEXT_MISMATCH",
    ]);
    expect(holdCodes(row({ shirt: "conflict", flags: ["SHIRT_DIFFERENCE"] }))).toEqual([
      "SHIRT_DIFFERENCE",
    ]);
    expect(holdCodes(row({ position: "no_signal" }))).toEqual(["POSITION_NOT_CONFIRMED"]);
    expect(holdCodes(row({ flags: ["SOMETHING_NEW"] }))).toEqual(["FLAG_SOMETHING_NEW"]);
    expect(holdCodes(row({ registeredTeamDisagreement: true }))).toEqual([
      "REGISTERED_TEAM_DISAGREEMENT",
    ]);
  });

  test("a changed evidence revision drops the row with a reason; it is never replaced", async () => {
    const edited: ProductionRead = {
      ...READ,
      rows: READ.rows.map((r, i) => (i === 1 ? { ...r, evidenceRevision: 3 } : r)),
    };
    const built = await buildFromRead(edited);
    expect(built.dropped).toEqual([
      { candidateId: READ.rows[1]!.candidateId, why: "evidence_revision_changed" },
    ]);
    expect(built.manifest.rows).toHaveLength(41);
  });

  test("any claim, open proposal or changed supporting mapping in the read makes the whole run refuse", async () => {
    for (const key of [
      "claimed_for_flashscore",
      "open_proposal",
      "supporting_inactive",
      "supporting_retargeted",
      "supporting_version_changed",
      "has_mapping",
    ]) {
      const built = await buildFromRead({ ...READ, summary: { ...READ.summary, [key]: 1 } });
      expect(built.summaryHolds).toEqual([key]);
    }
  });

  test("the class facts come from structured evidence only", async () => {
    const { readyFlashscoreRows } = await import("./build-flashscore-executable-manifest");
    const { rows } = await readyFlashscoreRows();
    const f1 = rows.find((r) => r.evidenceClass.startsWith("F1"))!;
    const f2 = rows.find((r) => r.evidenceClass.startsWith("F2"))!;
    expect(evidenceFacts(f1).alignedEventCount).toBeGreaterThan(0);
    expect(evidenceFacts(f2)).toEqual({
      shirt: "agree",
      alignedEventCount: 0,
      alignedEventKinds: [],
      dateCorroboration: "AGREE",
    });
  });
});
