import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const read = (path: string) => readFileSync(path, "utf8");
const runner = read("scripts/backend/production-player-dob-import-apply.py");
const workflow = read(".github/workflows/production-player-dob-import-apply.yml");
const rehearsalWorkflow = read(".github/workflows/production-player-dob-import-rehearsal.yml");
const scriptBytes = readFileSync("scripts/backend/data-player-dob-manual-observations.sql");
const sha = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

// The commit version is the reviewed script with its one `rollback;` line turned
// into `commit;`, byte for byte otherwise.
const commitVersion = () => {
  const lines = scriptBytes.toString("utf8").split("\n");
  const at = lines.findIndex((line) => line.trim() === "rollback;");
  lines[at] = "commit;";
  return lines.join("\n");
};

describe("three-player DOB import apply: the pinned script", () => {
  it("pins the rehearsed script and its commit version", () => {
    expect(runner).toContain(`REHEARSAL_SCRIPT_SHA256 = "${sha(scriptBytes)}"`);
    expect(runner).toContain(`COMMIT_SCRIPT_SHA256 = "${sha(commitVersion())}"`);
  });

  it("is the same script the rehearsal runner pins", () => {
    const rehearsal = read("scripts/backend/production-player-dob-import-rehearsal.py");
    expect(rehearsal).toContain(`SCRIPT_SHA256 = "${sha(scriptBytes)}"`);
  });

  it("differs from the rehearsal only by rollback; -> commit;", () => {
    const rehearsalLines = scriptBytes.toString("utf8").split("\n");
    const commitLines = commitVersion().split("\n");
    expect(commitLines).toHaveLength(rehearsalLines.length);
    const differing = commitLines.filter((line, i) => line !== rehearsalLines[i]);
    expect(differing).toEqual(["commit;"]);
  });

  it("applies exactly the three approved records and never the excluded player", () => {
    for (const record of [
      ["f3e4ac15-2770-48c6-a89f-5d8158404e8b", "2002-05-15"],
      ["96837dad-5250-4fd9-b0ee-8bb0dbd16d17", "2002-12-18"],
      ["721d92d0-1763-43b9-9b9c-54edcc03c07b", "2004-04-15"],
    ]) {
      expect(runner).toContain(`("${record[0]}", "${record[1]}")`);
      expect(scriptBytes.toString("utf8")).toContain(record[0]);
    }
    const excluded = "d3055da0-73be-4728-8357-b80cf5c4c4e3";
    expect(scriptBytes.toString("utf8")).not.toContain(excluded);
    expect(runner).toContain(`EXCLUDED = "${excluded}"`);
    expect(runner).toContain("the excluded player appears in the script");
  });
});

describe("three-player DOB import apply: the runner", () => {
  it("expects the verified baseline before and the three-row change after", () => {
    for (const expected of [
      '"players": 993',
      '"players_with_dob": 766',
      '"dob_observations": 766',
      '"attribute_observations": 766',
      '"audit_events": 3',
      '"candidates": 1004',
      '"mapping_rows": 1541',
      '"proposals": 0',
      '"cron_jobs": 14',
      '"players_with_dob": 769',
      '"dob_observations": 769',
      '"attribute_observations": 769',
      '"audit_events": 6',
    ]) {
      expect(runner).toContain(expected);
    }
  });

  it("never retries, never reverts, and names all four outcomes", () => {
    for (const outcome of [
      "THREE_DOB_IMPORT_APPLIED_AND_VERIFIED",
      "THREE_DOB_IMPORT_FAILED_ROLLED_BACK",
      "THREE_DOB_IMPORT_OUTCOME_UNVERIFIED",
      "THREE_DOB_IMPORT_COMMITTED_NEEDS_REVIEW",
    ]) {
      expect(runner).toContain(outcome);
    }
    expect(runner.match(/post\(token, script, False/g)).toHaveLength(1);
    expect(runner).not.toMatch(
      /\bdelete from\b|\bupdate app\.players\b|for attempt in|while True/i,
    );
  });

  it("reads counts and digests only, never names", () => {
    expect(runner).not.toMatch(/full_name|display_name|slug/);
  });
});

describe("three-player DOB import apply: the workflow", () => {
  it("is owner-only, main-only, dispatch-only and typed-confirmed", () => {
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("github.actor == 'mrdata007'");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain("environment: production-admin-activation");
    expect(workflow).toContain("APPLY_THREE_PLAYER_DOBS_PRODUCTION");
    expect(workflow).toContain("tkewgajrljbwgwedqsxn");
    expect(workflow).toContain('"${GITHUB_RUN_ATTEMPT:-}" == "1"');
    expect(workflow).toContain("GITHUB_WORKFLOW_RERUN_FORBIDDEN");
    expect(workflow).toContain("group: botolago-production-v2-mutation");
    expect(workflow).toContain("cancel-in-progress: false");
  });

  it("has no mode, list or input that could widen the import", () => {
    const inputs = workflow.slice(workflow.indexOf("inputs:"), workflow.indexOf("concurrency:"));
    expect([...inputs.matchAll(/^      (\w+):$/gm)].map((m) => m[1])).toEqual([
      "expected_commit",
      "confirmation",
    ]);
    expect(workflow).not.toMatch(/retry|schedule:|pull_request|push:/i);
  });

  it("leaves the rehearsal workflow without any commit path", () => {
    const body = rehearsalWorkflow
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    expect(body).not.toMatch(/commit;|apply:|--commit|mode:/i);
  });
});
