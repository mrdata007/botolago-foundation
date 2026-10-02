import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const read = (path: string) => readFileSync(path, "utf8");
const MIGRATION = "supabase/migrations/20261002100000_football_mapping_single_approver_switch.sql";
const runner = read("scripts/backend/production-mapping-single-approver-rehearsal.py");
const workflow = read(".github/workflows/production-mapping-single-approver-rehearsal.yml");
const scriptBytes = readFileSync(
  "scripts/backend/apply-20261002100000-mapping-single-approver.sql",
);
const script = scriptBytes.toString("utf8");
const migrationBytes = readFileSync(MIGRATION);
const sha = (buffer: Buffer | string) => createHash("sha256").update(buffer).digest("hex");

describe("single-approver switch: the reviewed script", () => {
  it("embeds the migration byte for byte and pins its digest", () => {
    const tag = "$bg_20261002100000_file$";
    const start = script.indexOf(tag) + tag.length;
    const end = script.indexOf(tag, start);
    expect(script.slice(start, end)).toBe(migrationBytes.toString("utf8"));
    expect(script).toContain(`'${sha(migrationBytes)}'`);
  });

  it("is a rehearsal as shipped: exactly one rollback; and no commit;", () => {
    const lines = script.split("\n");
    expect(lines.filter((line) => line.trim() === "rollback;")).toHaveLength(1);
    expect(lines.filter((line) => /^\s*commit\s*;\s*$/.test(line))).toHaveLength(0);
  });

  it("refuses to run when production is not the reviewed pre-state", () => {
    for (const guard of [
      "this looks like STAGING",
      "a proposal already exists",
      "a mapping function is not the reviewed text",
      "another database session is working right now",
      "the switch already exists",
    ]) {
      expect(script).toContain(guard);
    }
  });

  it("writes no proposal, mapping, audit event or schedule", () => {
    const body = script.replace(migrationBytes.toString("utf8"), "");
    expect(body).not.toMatch(/insert into app_private\.(football_|admin_)/);
    expect(body).not.toMatch(/cron\.schedule/);
  });
});

describe("single-approver switch rehearsal runner", () => {
  it("pins the reviewed script and migration to the repository bytes", () => {
    expect(runner).toContain(`SCRIPT_SHA256 = "${sha(scriptBytes)}"`);
    expect(runner).toContain(`MIGRATION_SHA256 = "${sha(migrationBytes)}"`);
  });

  it("can only rehearse: no commit path and the script is never edited", () => {
    expect(runner).toContain("rollback;");
    expect(runner).toContain("active commit;");
    expect(runner).not.toMatch(
      /script\.replace\(|re\.sub\(|script_path\.write_text|script\s*=\s*script\./,
    );
  });

  it("is guarded like the other production workflows", () => {
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("github.actor == 'mrdata007'");
    expect(workflow).toContain("environment: production-admin-activation");
    expect(workflow).toContain("REHEARSE_SINGLE_APPROVER_PRODUCTION");
    expect(workflow).toContain("tkewgajrljbwgwedqsxn");
    expect(workflow).toContain("GITHUB_WORKFLOW_RERUN_FORBIDDEN");
    const body = workflow
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    expect(body).not.toMatch(/commit;|apply:|--commit|mode:/i);
  });
});
