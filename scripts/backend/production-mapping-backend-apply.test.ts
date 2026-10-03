import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const runner = readFileSync("scripts/backend/production-mapping-backend-apply.py", "utf8");
const workflow = readFileSync(".github/workflows/production-mapping-backend-apply.yml", "utf8");
const scriptBytes = readFileSync(
  "scripts/backend/apply-20261001150000-mapping-backend-combined.sql",
);
const sha = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

function commitVersion(): string {
  const lines = scriptBytes.toString("utf8").split("\n");
  const at = lines
    .map((line, index) => (line.trim() === "rollback;" ? index : -1))
    .filter((i) => i >= 0);
  expect(at).toHaveLength(1);
  lines[at[0]] = "commit;";
  return lines.join("\n");
}

describe("production mapping backend one-shot apply runner", () => {
  it("pins the rehearsed script, the commit version and the three migrations", () => {
    expect(runner).toContain(`REHEARSAL_SCRIPT_SHA256 = "${sha(scriptBytes)}"`);
    expect(runner).toContain(`COMMIT_SCRIPT_SHA256 = "${sha(commitVersion())}"`);
    for (const file of [
      "20261001150000_register_sofascore_flashscore_providers",
      "20261001160000_football_player_mapping_tables",
      "20261001161000_football_player_mapping_functions",
    ]) {
      expect(runner).toContain(sha(readFileSync(`supabase/migrations/${file}.sql`)));
    }
  });

  it("the commit version differs from the rehearsal only by the final rollback line", () => {
    const rehearsal = scriptBytes.toString("utf8").split("\n");
    const commit = commitVersion().split("\n");
    expect(commit).toHaveLength(rehearsal.length);
    const differing = rehearsal.flatMap((line, index) =>
      line === commit[index] ? [] : [[line, commit[index]]],
    );
    expect(differing).toEqual([["rollback;", "commit;"]]);
    const active = commit.filter((line) => /^\s*(commit|rollback)\s*;\s*$/.test(line));
    expect(active).toEqual(["commit;"]);
  });

  it("never retries and never deletes anything", () => {
    expect(runner.match(/post\(token, script, False, 170\)/g)).toHaveLength(1);
    expect(runner).not.toMatch(/drop (table|function|schema)|delete from|truncate table/i);
    for (const label of [
      "MAPPING_BACKEND_PRODUCTION_APPLIED_AND_VERIFIED",
      "MAPPING_BACKEND_COMMIT_FAILED_ROLLED_BACK",
      "MAPPING_BACKEND_COMMIT_OUTCOME_UNVERIFIED",
      "MAPPING_BACKEND_COMMITTED_NEEDS_REVIEW",
    ]) {
      expect(runner).toContain(label);
    }
  });

  it("is guarded like the other production workflows", () => {
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("github.actor == 'mrdata007'");
    expect(workflow).toContain("environment: production-admin-activation");
    expect(workflow).toContain("APPLY_MAPPING_BACKEND_PRODUCTION");
    expect(workflow).toContain("tkewgajrljbwgwedqsxn");
    expect(workflow).toContain("GITHUB_WORKFLOW_RERUN_FORBIDDEN");
    expect(workflow).toContain("group: botolago-production-v2-mutation");
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).not.toMatch(/^\s+(push|pull_request|schedule):/m);
  });
});
