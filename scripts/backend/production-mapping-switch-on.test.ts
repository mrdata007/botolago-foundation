import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const read = (path: string) => readFileSync(path, "utf8");
const scriptBytes = readFileSync("scripts/backend/data-mapping-single-approver-switch-on.sql");
const script = scriptBytes.toString("utf8");
const rehearsal = read("scripts/backend/production-mapping-switch-on-rehearsal.py");
const apply = read("scripts/backend/production-mapping-switch-on-apply.py");
const rehearsalWorkflow = read(".github/workflows/production-mapping-switch-on-rehearsal.yml");
const applyWorkflow = read(".github/workflows/production-mapping-switch-on-apply.yml");
const sha = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

const commitVersion = () => {
  const lines = script.split("\n");
  lines[lines.findIndex((line) => line.trim() === "rollback;")] = "commit;";
  return lines.join("\n");
};

const code = (text: string) =>
  text
    .split("\n")
    .filter((line) => !line.trim().startsWith("--") && !line.trim().startsWith("#"))
    .join("\n");

describe("switch-on script", () => {
  it("is a rehearsal as shipped: exactly one rollback; and no commit;", () => {
    const lines = script.split("\n");
    expect(lines.filter((line) => line.trim() === "rollback;")).toHaveLength(1);
    expect(lines.filter((line) => /^\s*commit\s*;\s*$/.test(line))).toHaveLength(0);
  });

  it("makes exactly one change: the switch, one row, nothing inserted or deleted", () => {
    const body = code(script);
    expect(body).toContain("update app_private.football_mapping_settings");
    expect(body).toContain("set allow_self_approval = true");
    expect(body).toContain("where allow_self_approval = false");
    expect(body.match(/\bupdate\s+app/gi)).toHaveLength(1);
    expect(body).not.toMatch(/\binsert\s+into\s+(app|supabase_migrations)/i);
    expect(body).not.toMatch(
      /\bdelete\s+from\b|\btruncate\b|\bdrop\s+(table|function|trigger|column|constraint|index|schema)\b|\balter\b|\bcreate\s+(or\s+replace\s+)?function/i,
    );
    expect(body).toContain("v_rows <> 1");
  });

  it("stops on anything open, any other writer, or a changed first mapping", () => {
    for (const guard of [
      "the single-approver switch is not OFF",
      "a proposal is still open",
      "does not hold exactly one proposal, and it executed",
      "not 1,542 rows with exactly one reviewed-provider row",
      "the first mapping row is not the reviewed one, active",
      "the first mapping row or its proposal is not byte-identical to what was reviewed",
      "the first candidate is not the only mapped candidate",
      "a Fantasy gameweek is finalizing right now",
      "another database session is working right now",
      "a function that reads the switch is not the reviewed text",
      "the proposal changed",
      "a mapping row changed",
      "an audit event or idempotency key changed",
    ]) {
      expect(script).toContain(guard);
    }
  });

  it("is about the first mapping and the Tagnaouti app player only", () => {
    for (const id of [
      "add2150a-4d34-4e7c-abf1-0017e68bc89d",
      "3f867678-cb4e-4362-99c3-a2850b34ccb0",
      "166598ad-5934-44fa-aa40-a0ad69a4a010",
      "6c06addc-4cdc-4598-ba94-42221728122b",
    ]) {
      expect(script).toContain(id);
    }
  });
});

describe("switch-on runners", () => {
  it("pin the reviewed script and its commit version", () => {
    expect(rehearsal).toContain(`SCRIPT_SHA256 = "${sha(scriptBytes)}"`);
    expect(apply).toContain(`REHEARSAL_SCRIPT_SHA256 = "${sha(scriptBytes)}"`);
    expect(apply).toContain(`COMMIT_SCRIPT_SHA256 = "${sha(commitVersion())}"`);
  });

  it("commit version differs from the rehearsal only by rollback; -> commit;", () => {
    const a = script.split("\n");
    const b = commitVersion().split("\n");
    expect(b).toHaveLength(a.length);
    expect(b.filter((line, i) => line !== a[i])).toEqual(["commit;"]);
  });

  it("the rehearsal runner has no commit path", () => {
    expect(rehearsal).toContain("active commit;");
    expect(rehearsal).not.toMatch(/script\.replace\(|re\.sub\(|lines\[[^\]]*\]\s*=/);
  });

  it("the apply runner sends once, never retries, and names the four outcomes", () => {
    for (const outcome of [
      "SINGLE_OPERATOR_SWITCH_ON_APPLIED_AND_VERIFIED",
      "SINGLE_OPERATOR_SWITCH_ON_FAILED_ROLLED_BACK",
      "SINGLE_OPERATOR_SWITCH_ON_OUTCOME_UNVERIFIED",
      "SINGLE_OPERATOR_SWITCH_ON_COMMITTED_NEEDS_REVIEW",
    ]) {
      expect(apply).toContain(outcome);
    }
    expect(apply.match(/post\(token, script, False/g)).toHaveLength(1);
    expect(apply).not.toMatch(/for attempt in|while True|\bdelete from\b|update app_private/i);
  });

  it("expect the verified production state before the change", () => {
    for (const expected of [
      '"switch": False',
      '"settings_rows": 1',
      '"executed_proposals": 1',
      '"open_proposals": 0',
      '"mapping_rows": 1542',
      '"reviewed_provider_mapping_rows": 1',
      '"candidates": 1004',
      '"mapping_observations": 1006',
      '"proposals": 1',
      '"audit_events": 9',
    ]) {
      expect(apply).toContain(expected);
    }
  });

  it("read counts and digests only, never names", () => {
    expect(apply).not.toMatch(/full_name|display_name|slug/);
    expect(rehearsal).not.toMatch(/full_name|display_name|slug/);
  });
});

describe("switch-on workflows", () => {
  it("are owner-only, main-only, dispatch-only, typed-confirmed and one attempt", () => {
    for (const [workflow, phrase] of [
      [rehearsalWorkflow, "REHEARSE_SINGLE_OPERATOR_MODE_PRODUCTION"],
      [applyWorkflow, "APPLY_SINGLE_OPERATOR_MODE_PRODUCTION"],
    ]) {
      expect(workflow).toContain("github.ref == 'refs/heads/main'");
      expect(workflow).toContain("github.actor == 'mrdata007'");
      expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
      expect(workflow).toContain("environment: production-admin-activation");
      expect(workflow).toContain(phrase);
      expect(workflow).toContain("tkewgajrljbwgwedqsxn");
      expect(workflow).toContain("GITHUB_WORKFLOW_RERUN_FORBIDDEN");
      expect(workflow).toContain("group: botolago-production-v2-mutation");
      expect(workflow).toContain("cancel-in-progress: false");
    }
  });

  it("take only the commit and the confirmation as inputs", () => {
    for (const workflow of [rehearsalWorkflow, applyWorkflow]) {
      const inputs = workflow.slice(workflow.indexOf("inputs:"), workflow.indexOf("concurrency:"));
      expect([...inputs.matchAll(/^ {6}(\w+):$/gm)].map((m) => m[1])).toEqual([
        "expected_commit",
        "confirmation",
      ]);
      expect(workflow).not.toMatch(/retry|schedule:|pull_request|push:/i);
    }
  });

  it("the rehearsal workflow has no commit path", () => {
    expect(code(rehearsalWorkflow)).not.toMatch(/commit;|apply:|--commit|mode:/i);
  });
});
