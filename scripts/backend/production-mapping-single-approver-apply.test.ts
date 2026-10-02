import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const read = (path: string) => readFileSync(path, "utf8");
const runner = read("scripts/backend/production-mapping-single-approver-apply.py");
const workflow = read(".github/workflows/production-mapping-single-approver-apply.yml");
const rehearsalWorkflow = read(
  ".github/workflows/production-mapping-single-approver-rehearsal.yml",
);
const scriptBytes = readFileSync(
  "scripts/backend/apply-20261002100000-mapping-single-approver.sql",
);
const migrationBytes = readFileSync(
  "supabase/migrations/20261002100000_football_mapping_single_approver_switch.sql",
);
const sha = (buffer: Buffer | string) => createHash("sha256").update(buffer).digest("hex");

/** The commit version: the rehearsed script with its one `rollback;` line made `commit;`. */
const commitVersion = () => {
  const lines = scriptBytes.toString("utf8").split("\n");
  const index = lines.findIndex((line) => line.trim() === "rollback;");
  lines[index] = "commit;";
  return lines.join("\n");
};

describe("single-approver switch apply runner", () => {
  it("pins the rehearsed script, its commit version and the migration to the repository bytes", () => {
    expect(runner).toContain(`REHEARSAL_SCRIPT_SHA256 = "${sha(scriptBytes)}"`);
    expect(runner).toContain(`COMMIT_SCRIPT_SHA256 = "${sha(commitVersion())}"`);
    expect(runner).toContain(`MIGRATION_SHA256 = "${sha(migrationBytes)}"`);
  });

  it("the commit version differs from the rehearsal by that one line only", () => {
    const before = scriptBytes.toString("utf8").split("\n");
    const after = commitVersion().split("\n");
    expect(after).toHaveLength(before.length);
    const differing = before.filter((line, i) => line !== after[i]);
    expect(differing).toEqual(["rollback;"]);
    expect(after.filter((line) => /^\s*commit\s*;\s*$/.test(line))).toHaveLength(1);
    expect(after.filter((line) => line.trim() === "rollback;")).toHaveLength(0);
  });

  it("never retries, and classifies the outcome from a fresh read", () => {
    expect(runner).toContain("never retried");
    for (const outcome of [
      "SINGLE_APPROVER_PRODUCTION_APPLIED_AND_VERIFIED",
      "SINGLE_APPROVER_COMMIT_FAILED_ROLLED_BACK",
      "SINGLE_APPROVER_COMMIT_OUTCOME_UNVERIFIED",
      "SINGLE_APPROVER_COMMITTED_NEEDS_REVIEW",
    ]) {
      expect(runner).toContain(outcome);
    }
    expect(runner.match(/post\(token, script, False/g)).toHaveLength(1);
  });

  it("checks that nothing but the switch changed", () => {
    for (const key of [
      '"proposals"',
      '"mapping_identity_digest"',
      '"audit_events"',
      '"cron_digest"',
      '"fantasy_table_counts"',
      '"resolver_md5"',
    ]) {
      expect(runner).toContain(key);
    }
  });
});

describe("single-approver switch apply workflow", () => {
  it("is guarded like the other production workflows, with its own confirmation", () => {
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("github.actor == 'mrdata007'");
    expect(workflow).toContain("environment: production-admin-activation");
    expect(workflow).toContain("APPLY_SINGLE_APPROVER_PRODUCTION");
    expect(workflow).toContain("tkewgajrljbwgwedqsxn");
    expect(workflow).toContain("GITHUB_WORKFLOW_RERUN_FORBIDDEN");
    expect(workflow).toContain("botolago-production-v2-mutation");
    expect(workflow).toContain("scripts/backend/production-mapping-single-approver-apply.py");
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).not.toMatch(/\n\s+(push|pull_request|schedule):/);
  });

  it("the rehearsal workflow still has no commit path", () => {
    const body = rehearsalWorkflow
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    expect(body).not.toMatch(/commit;|apply:|--commit|mode:/i);
  });
});
