import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const read = (path: string) => readFileSync(path, "utf8");
const runner = read("scripts/backend/production-player-dob-import-rehearsal.py");
const workflow = read(".github/workflows/production-player-dob-import-rehearsal.yml");
const scriptBytes = readFileSync("scripts/backend/data-player-dob-manual-observations.sql");
const script = scriptBytes.toString("utf8");
const sha = (buffer: Buffer | string) => createHash("sha256").update(buffer).digest("hex");

describe("player date-of-birth import: the reviewed script", () => {
  it("is a rehearsal as shipped: exactly one rollback; and no commit;", () => {
    const lines = script.split("\n");
    expect(lines.filter((line) => line.trim() === "rollback;")).toHaveLength(1);
    expect(lines.filter((line) => /^\s*commit\s*;\s*$/.test(line))).toHaveLength(0);
  });

  it("lists exactly the three confirmed players and nobody else", () => {
    const ids = [
      "f3e4ac15-2770-48c6-a89f-5d8158404e8b",
      "96837dad-5250-4fd9-b0ee-8bb0dbd16d17",
      "721d92d0-1763-43b9-9b9c-54edcc03c07b",
    ];
    for (const id of ids) expect(script).toContain(id);
    // Mostakim was left out on purpose.
    expect(script).not.toContain("d3055da0-73be-4728-8357-b80cf5c4c4e3");
    expect(script.match(/^\s+\('[0-9a-f-]{36}', '/gm)).toHaveLength(3);
    expect(script).toContain("2002-05-15");
    expect(script).toContain("2002-12-18");
    expect(script).toContain("2004-04-15");
  });

  it("refuses to run when production is not the reviewed pre-state", () => {
    for (const guard of [
      "this looks like STAGING",
      "a listed player already has a date of birth",
      "a listed player already has a date-of-birth observation",
      "expected exactly one active staff member holding football.correct",
      "a mapping proposal exists",
      "another database session is working right now",
    ]) {
      expect(script).toContain(guard);
    }
  });

  it("writes no proposal, mapping, candidate, schedule or Fantasy row", () => {
    expect(script).not.toMatch(/insert into app_private\.football_/);
    expect(script).not.toMatch(/update app_private\.football_/);
    expect(script).not.toMatch(/cron\.schedule/);
    expect(script).not.toMatch(/fantasy_\w+\s+set|insert into app\.fantasy/);
  });
});

describe("player date-of-birth import rehearsal runner", () => {
  it("pins the reviewed script to the repository bytes", () => {
    expect(runner).toContain(`SCRIPT_SHA256 = "${sha(scriptBytes)}"`);
  });

  it("can only rehearse: no commit path and the script is never edited", () => {
    expect(runner).toContain("rollback;");
    expect(runner).toContain("active commit;");
    expect(runner).not.toMatch(
      /script\.replace\(|re\.sub\(|script_path\.write_text|script\s*=\s*script\./,
    );
  });

  it("reads counts and digests only, never names or dates", () => {
    expect(runner).not.toMatch(/full_name|display_name|slug/);
    expect(runner).not.toMatch(/'date_of_birth', *\(select date_of_birth/);
  });

  it("is guarded like the other production workflows", () => {
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("github.actor == 'mrdata007'");
    expect(workflow).toContain("environment: production-admin-activation");
    expect(workflow).toContain("REHEARSE_PLAYER_DOB_IMPORT_PRODUCTION");
    expect(workflow).toContain("tkewgajrljbwgwedqsxn");
    expect(workflow).toContain("GITHUB_WORKFLOW_RERUN_FORBIDDEN");
    const body = workflow
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    expect(body).not.toMatch(/commit;|apply:|--commit|mode:/i);
  });
});
