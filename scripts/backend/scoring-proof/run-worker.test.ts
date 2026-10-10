import { describe, expect, test } from "bun:test";
import { callSql, NeedsCall, replayGateway, type RecordedCall } from "./run-worker";

describe("callSql", () => {
  test("one service claim, then the named RPC with typed literals", () => {
    expect(
      callSql("service_get_fantasy_scoring_snapshot", {
        p_gameweek_id: "fb5c0000-0000-4000-8000-c00000000007",
        p_calculation_version: 8,
        p_after_team_id: null,
        p_flag: true,
        p_items: [{ a: "it's" }],
      }),
    ).toBe(
      `select set_config('request.jwt.claims', '{"role":"service_role"}', true);\n` +
        `select api.service_get_fantasy_scoring_snapshot(p_gameweek_id => 'fb5c0000-0000-4000-8000-c00000000007', ` +
        `p_calculation_version => 8, p_after_team_id => null, p_flag => true, p_items => '[{"a":"it''s"}]'::jsonb)::text as answer;`,
    );
  });
  test("only service RPCs and plain argument names", () => {
    expect(() => callSql("admin_football_mapping_execute", {})).toThrow("not_service");
    expect(() => callSql("service_x", { "p_x); drop": 1 })).toThrow("arg_invalid");
    expect(() => callSql("service_x", { p_x: 1.5 })).toThrow("number_invalid");
  });
});

describe("replayGateway", () => {
  test("replays recorded answers in order and asks for the first missing call", async () => {
    const recorded: RecordedCall[] = [
      { name: "service_a", args: { p_x: 1 }, answer: { ok: true } },
    ];
    const gateway = replayGateway(recorded);
    expect(await gateway.rpc("service_a", { p_x: 1 })).toEqual({ ok: true });
    await expect(gateway.rpc("service_b", { p_y: 2 })).rejects.toBeInstanceOf(NeedsCall);
    expect(recorded).toHaveLength(2);
    expect(recorded[1]).toEqual({ name: "service_b", args: { p_y: 2 } });
  });
  test("a worker that asks for a different call than was executed stops", async () => {
    const gateway = replayGateway([{ name: "service_a", args: { p_x: 1 }, answer: {} }]);
    await expect(gateway.rpc("service_a", { p_x: 2 })).rejects.toThrow("diverged");
  });
  test("a recorded error is raised again as the same code", async () => {
    const gateway = replayGateway([{ name: "service_a", args: {}, error: "stale_update" }]);
    await expect(gateway.rpc("service_a", {})).rejects.toThrow("stale_update");
  });
});
