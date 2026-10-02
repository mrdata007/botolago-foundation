import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const read = (path: string) => readFileSync(path, "utf8");
const runner = read("scripts/backend/production-mapping-backend-rehearsal.py");
const workflow = read(".github/workflows/production-mapping-backend-rehearsal.yml");
const script = readFileSync("scripts/backend/apply-20261001150000-mapping-backend-combined.sql");
const sha = (buffer: Buffer | string) => createHash("sha256").update(buffer).digest("hex");

describe("production mapping backend rehearsal runner", () => {
  it("pins the reviewed script and migrations to the repository bytes", () => {
    expect(runner).toContain(`SCRIPT_SHA256 = "${sha(script)}"`);
    for (const file of [
      "20261001150000_register_sofascore_flashscore_providers",
      "20261001160000_football_player_mapping_tables",
      "20261001161000_football_player_mapping_functions",
    ]) {
      const digest = sha(readFileSync(`supabase/migrations/${file}.sql`));
      expect(runner).toContain(digest);
    }
  });

  it("can only rehearse: no commit path and the script is never edited", () => {
    expect(runner).toContain("rollback;");
    expect(runner).toContain("active commit;");
    expect(runner).not.toMatch(/script\.replace\(|re\.sub\(|script_path\.write_text|script\s*=\s*script\./);
    expect(script.toString("utf8").split("\n").filter((line) => line.trim() === "rollback;")).toHaveLength(1);
    expect(script.toString("utf8").split("\n").filter((line) => /^\s*commit\s*;\s*$/.test(line))).toHaveLength(0);
  });

  it("is guarded like the other production workflows", () => {
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("github.actor == 'mrdata007'");
    expect(workflow).toContain("environment: production-admin-activation");
    expect(workflow).toContain("REHEARSE_MAPPING_BACKEND_PRODUCTION");
    expect(workflow).toContain("tkewgajrljbwgwedqsxn");
    expect(workflow).toContain("GITHUB_WORKFLOW_RERUN_FORBIDDEN");
    const body = workflow.split("\n").filter((line) => !line.trim().startsWith("#")).join("\n");
    expect(body).not.toMatch(/commit;|apply:|--commit|mode:/i);
  });
});
