import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const read = (path: string) => readFileSync(path, "utf8");
const PREREQUISITE =
  "supabase/migrations/20261002100000_football_mapping_single_approver_switch.sql";
const MIGRATION = "supabase/migrations/20261003120000_football_mapping_supporting_dependency.sql";
const TEST = "supabase/tests/database/football_player_mapping_supporting_dependency.test.sql";
const runner = read("scripts/backend/staging-mapping-supporting-dependency-rehearsal.py");
const workflow = read(".github/workflows/staging-mapping-supporting-dependency-rehearsal.yml");
const writerGuard = read("scripts/backend/staging-writer-guard.py");
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

describe("staging rehearsal of the supporting-dependency guard", () => {
  it("pins the prerequisite, the migration and the pgTAP file to the repository bytes", () => {
    expect(runner).toContain(`PREREQUISITE_SHA256 = "${sha(PREREQUISITE)}"`);
    expect(runner).toContain(`MIGRATION_SHA256 = "${sha(MIGRATION)}"`);
    expect(runner).toContain(`TEST_SHA256 = "${sha(TEST)}"`);
  });

  it("expects exactly the number of assertions the pgTAP file makes", () => {
    const test = read(TEST);
    const count =
      (test.match(/extensions\.is\(/g)?.length ?? 0) +
      (test.match(/extensions\.ok\(/g)?.length ?? 0) +
      (test.match(/extensions\.throws_ok\(/g)?.length ?? 0);
    expect(runner).toContain(`EXPECTED_ASSERTIONS = ${count}`);
  });

  it("applies only the one missing prerequisite and the guard, and never commits", () => {
    expect(runner).toContain("20261002100000");
    expect(runner).toContain("20261003120000");
    expect(runner).toContain('"rollback;"]');
    expect(runner).not.toMatch(/\bcommit\s*;/i);
    expect(runner).not.toMatch(/supabase\/migrations\/\*|glob\(|db push|migration up/i);
    expect(runner).toContain("STAGING_REHEARSAL_REPORT");
  });

  it("takes the migration's DROP FUNCTION as written: no rename, no cascade", () => {
    expect(runner).toContain("(repo / MIGRATION).read_text");
    expect(runner).not.toMatch(/\.replace\([^)]*(drop function|football_mapping_compute)/i);
    expect(runner).not.toMatch(/rename to|alter function[^"']*rename/i);
    expect(runner).toContain("the migration is not the reviewed DROP FUNCTION without CASCADE");
  });

  it("reads staging before and after and fails on any difference, including synthetic residue", () => {
    for (const key of [
      "synthetic_residue",
      "content_digests",
      "function_md5",
      "function_acls",
      "mapping_tables",
      "history_rows",
    ]) {
      expect(runner).toContain(`"${key}"`);
    }
    expect(runner).toContain("staging differs after the rehearsal");
  });

  it("holds the scheduled jobs before it writes anything, as the production script does", () => {
    expect(runner).toContain("app_private.hold_scheduled_jobs()");
    expect(runner).toContain("e0ff799389c935e3844df2620b53ae87");
    expect(runner.indexOf("perform app_private.hold_scheduled_jobs();")).toBeLessThan(
      runner.indexOf("POST_SQL_HEAD = "),
    );
  });

  it("refuses any project but staging", () => {
    expect(runner).toContain('STAGING_REF = "srdrflfrfpwixsllveid"');
    expect(runner).toContain("staging project-ref guard failed");
    expect(runner).toContain("/v1/projects/{STAGING_REF}/database/query");
  });

  it("is guarded: manual dispatch, owner, main, exact commit, staging ref, shared writer group", () => {
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("github.actor == 'mrdata007'");
    expect(workflow).toContain('"$EXPECTED_COMMIT" == "$GITHUB_SHA"');
    expect(workflow).toContain("REHEARSE_SUPPORTING_DEPENDENCY_STAGING");
    expect(workflow).toContain("srdrflfrfpwixsllveid");
    expect(workflow).toContain("GITHUB_WORKFLOW_RERUN_FORBIDDEN");
    expect(workflow).toContain("group: phase6-staging-load-test");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("environment: staging-load-test");
    expect(workflow).toContain("scripts/backend/staging-writer-guard.py");
    const body = workflow
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    expect(body).not.toMatch(/commit;|--commit|mode:|schedule:|push:|pull_request/i);
  });

  it("is counted as a staging writer, so no other staging writer runs beside it", () => {
    expect(writerGuard).toContain('"staging-mapping-supporting-dependency-rehearsal.yml": None');
  });
});
