import { describe, expect, test } from "bun:test";
import {
  dollarQuote,
  dryRunSql,
  ManagementQueryError,
  managementQuery,
  normalizeSnapshot,
  readDryRun,
  recordSql,
  snapshotSql,
} from "./reviewed-correction-db";

const FIXTURE = "00000000-0000-4000-8000-000000009000";

describe("reviewed correction database calls", () => {
  test("the snapshot reads only the named fixtures and refuses anything else", () => {
    const sql = snapshotSql(["19893370", "19893371"]);
    expect(sql).toContain("m.external_id in ('19893370','19893371')");
    expect(sql).toContain("provider_name = 'sofascore'");
    expect(sql).not.toMatch(/\b(insert|update|delete)\b/i);
    expect(() => snapshotSql(["1; drop table x"])).toThrow();
  });

  test("a payload cannot close its own quoting", () => {
    expect(dollarQuote('{"a":"$rc$"}')).toBe('$rcx${"a":"$rc$"}$rcx$');
    expect(recordSql(FIXTURE, { a: "$rc$ select" })).toContain('$rcx${"a":"$rc$ select"}$rcx$');
    expect(() => recordSql("x'; drop", {})).toThrow();
  });

  test("the dry run always ends in a raise, and the write runs as the service role", () => {
    expect(dryRunSql(FIXTURE, {})).toMatch(/raise exception 'REVIEWED_CORRECTION_DRY_RUN_OK %'/);
    expect(recordSql(FIXTURE, {})).toContain(`'reviewed-correction'`);
    expect(recordSql(FIXTURE, {})).toContain(
      `set_config('request.jwt.claims', '{"role":"service_role"}', true)`,
    );
  });

  test("reads the dry run's answer or the database's own code", () => {
    expect(
      readDryRun(
        new ManagementQueryError(
          400,
          'ERROR: REVIEWED_CORRECTION_DRY_RUN_OK {"digest": "ab", "simpleReady": true}',
        ),
      ),
    ).toEqual({ ok: true, result: { digest: "ab", simpleReady: true } });
    expect(
      readDryRun(new ManagementQueryError(400, "ERROR: adaptive_starters_incomplete")),
    ).toEqual({
      ok: false,
      code: "adaptive_starters_incomplete",
    });
    expect(readDryRun(new Error("network"))).toEqual({ ok: false, code: "database_refused" });
  });

  test("management query: rows on success, status and message on failure", async () => {
    const ok = await managementQuery("select 1", {
      token: "t",
      projectRef: "p",
      fetchImpl: (async () =>
        new Response(JSON.stringify([{ a: 1 }]), { status: 201 })) as unknown as typeof fetch,
    });
    expect(ok).toEqual([{ a: 1 }]);
    const failed = await managementQuery("select 1", {
      token: "t",
      projectRef: "p",
      fetchImpl: (async () =>
        new Response(JSON.stringify({ message: "ERROR: adaptive_payload_invalid" }), {
          status: 400,
        })) as unknown as typeof fetch,
    }).catch((error) => error);
    expect(failed).toBeInstanceOf(ManagementQueryError);
    expect(failed.databaseMessage).toContain("adaptive_payload_invalid");
  });

  test("a player listed twice in the snapshot is kept once", () => {
    const member = {
      playerId: "p1",
      teamId: "t",
      displayName: "x",
      position: "forward",
      shirtNumber: 9,
      sofascoreId: null,
    };
    const [fixture] = normalizeSnapshot([{ members: [member, { ...member, shirtNumber: 10 }] }]);
    expect(fixture!.members).toHaveLength(1);
  });
});
