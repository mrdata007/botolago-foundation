import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const script = readFileSync(join(root, "scripts/backend/gw3-uts-rsb-did-not-play.sql"), "utf8");
const code = script
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");
const at = (needle: string) => {
  const index = code.indexOf(needle);
  expect(index).toBeGreaterThan(-1);
  return index;
};

describe("GW3 UTS Rabat - RSB Berkane owner-confirmed did-not-play script", () => {
  test("is a rehearsal: one transaction that ends in rollback, and nothing commits earlier", () => {
    expect(code.trimEnd().endsWith("rollback;")).toBe(true);
    expect(code.match(/^\s*commit\s*;/gim)).toBeNull();
    expect(code.match(/^begin;/gm)?.length).toBe(1);
  });

  test("names exactly the owner-confirmed fixture, gameweek, season and players", () => {
    expect(code).toContain("'ac95346b-200c-4c5d-bd1b-c64ceb9fee2d'");
    expect(code).toContain("'0b455d0b-7289-4c93-b237-8f16ce4b159e'");
    expect(code).toContain("'d03223b0-8f4a-4309-93e1-2a708d7c3584'");
    for (const name of ["Haytam Manaout", "Mamadou Lamine Camara", "Takha Majni"])
      expect(code).toContain(`'${name}'`);
    expect(code).toContain("'1095727'");
  });

  test("checks the owner and the paused writers before it reads or writes anything else", () => {
    const owner = at("PASTE-OWNER-EMAIL");
    const staff = at("app_private.staff_principals");
    const writers = at("production writers must be paused and drained");
    expect(owner).toBeLessThan(staff);
    expect(staff).toBeLessThan(writers);
    expect(writers).toBeLessThan(at("api.service_record_fantasy_observation("));
    for (const needle of [
      "cron.job where active",
      "football_live_refresh_enabled",
      "lifecycle_tick_enabled",
    ])
      expect(code).toContain(needle);
  });

  test("keeps every guard that makes the claim honest", () => {
    for (const needle of [
      "GW3 is not provisional",
      "the scoring mode of the fixture is",
      "SofaScore id % appears in the observation",
      "is in the observation rows: SofaScore says he appeared",
      "does not cover the kickoff date",
      "are already listed as non-participants",
      "the pending lists are not exactly the three players",
      "a sealed scoring snapshot exists for GW3",
      "must be at one club of the fixture and Majni at the other",
    ])
      expect(code).toContain(needle);
    // Every guard is evaluated before the one write.
    const write = at("api.service_record_fantasy_observation(");
    for (const needle of [
      "GW3 is not provisional",
      "SofaScore id % appears in the observation",
      "the pending lists are not exactly the three players",
    ])
      expect(at(needle)).toBeLessThan(write);
  });

  test("uses the reviewed-correction path, built on the latest digest, and no direct table write", () => {
    expect(code).toContain("'reviewed-correction'");
    expect(code).toContain("'expectedDigest', o.digest");
    expect(code).toContain("'verifiedNonParticipants', v_list");
    expect(code).not.toMatch(/^\s*(insert\s+into|update|delete\s+from)\s+(app|app_private)\./gim);
    expect(code).not.toMatch(
      /\balter\s+table\b|\bdrop\s+(table|function)\b|\bcreate\s+or\s+replace\b/i,
    );
  });

  test("proves in the same transaction that GW3 would finalize, before saying anything", () => {
    const write = at("api.service_record_fantasy_observation(");
    const proof = at("d1 := app_private.fantasy_scoring_input_document(c_gameweek);");
    const empty = at("GW3 would still not finalize");
    const validate = at("app_private.fantasy_validate_scoring_document(d1)");
    const result = at("insert into gw3_dnp_result");
    expect(write).toBeLessThan(proof);
    expect(proof).toBeLessThan(empty);
    expect(empty).toBeLessThan(validate);
    expect(validate).toBeLessThan(result);
    expect(code).toContain("jsonb_array_length(d1 -> 'pendingPlayerIds') <> 0");
    expect(code).toContain("jsonb_array_length(d1 -> 'pendingFixtures') <> 0");
    expect(code).toContain("the write touched more than one new observation row");
    expect(code).toContain("select jsonb_pretty(summary) as gw3_did_not_play_result");
  });

  test("records participation only: no statistic is written by the script", () => {
    for (const field of ["goals", "assists", "yellowCards", "saves", "minutes"])
      expect(code.match(new RegExp(`'${field}'\\s*,\\s*\\d`, "g"))).toBeNull();
  });
});
