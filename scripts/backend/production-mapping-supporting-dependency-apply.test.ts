import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const read = (path: string) => readFileSync(path, "utf8");
const sha = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const MIGRATION = "supabase/migrations/20261003120000_football_mapping_supporting_dependency.sql";
const WRAPPER = "scripts/backend/apply-20261003120000-mapping-supporting-dependency.sql";
const MANIFEST = "docs/production/manifests/gw1-flashscore-executable.v2.manifest.json";
const runner = read("scripts/backend/production-mapping-supporting-dependency-apply.py");
const workflow = read(".github/workflows/production-mapping-supporting-dependency-apply.yml");
const wrapperBytes = readFileSync(WRAPPER);
const wrapper = wrapperBytes.toString("utf8");

const commitPayload = () => {
  const lines = wrapper.split("\n");
  const index = lines.indexOf("rollback;");
  lines[index] = "commit;";
  return { payload: lines.join("\n"), index };
};

describe("supporting-dependency guard: the pinned inputs", () => {
  it("pins the migration, the wrapper, the manifest (file bytes and canonical hash) and the commit payload", () => {
    expect(runner).toContain(`MIGRATION_SHA256 = "${sha(readFileSync(MIGRATION))}"`);
    expect(runner).toContain(`WRAPPER_SHA256 = "${sha(wrapperBytes)}"`);
    expect(runner).toContain(`MANIFEST_FILE_SHA256 = "${sha(readFileSync(MANIFEST))}"`);
    expect(runner).toContain(
      'MANIFEST_CANONICAL_SHA256 = "f2eef95dd199244ca6c48e9a2e0595a39a6bc2e534e7455a41467c7dba17a286"',
    );
    expect(runner).toContain(`COMMIT_PAYLOAD_SHA256 = "${sha(commitPayload().payload)}"`);
  });

  it("matches the owner-approved hashes", () => {
    expect(sha(readFileSync(MIGRATION))).toBe(
      "d435bde5d9ca114a17f94786178b1f4261ff3b8e8c65f8d8f8fcbd70baa18577",
    );
    expect(sha(wrapperBytes)).toBe(
      "920cd532be40299f85e99656d1ba75c0f451ec63f5b4547961a1d827f68340c4",
    );
    expect(sha(readFileSync(MANIFEST))).toBe(
      "c5a335ec20755534acb3ac75c9dbc4ae8e35df1d4919dcebdefd63ae3dc88c50",
    );
  });

  it("changes exactly one line of the reviewed wrapper: the final rollback; becomes commit;", () => {
    const { payload, index } = commitPayload();
    const before = wrapper.split("\n");
    const after = payload.split("\n");
    expect(after).toHaveLength(before.length);
    const changed = before.flatMap((line, i) => (line !== after[i] ? [i] : []));
    expect(changed).toEqual([index]);
    expect(before[index]).toBe("rollback;");
    expect(after[index]).toBe("commit;");
    expect(before.filter((line) => line === "rollback;")).toHaveLength(1);
    expect(payload.toLowerCase().split("on commit drop").length).toBe(
      wrapper.toLowerCase().split("on commit drop").length,
    );
    expect(payload).toContain(read(MIGRATION));
    expect(payload.match(/^\s*drop\s+function\b/gim)).toHaveLength(1);
    expect(payload).not.toMatch(/\bcascade\b/i);
  });
});

describe("supporting-dependency guard: the apply workflow", () => {
  it("is manual, owner-only, main-only, exact-commit, exact-project, typed-confirmation, first attempt", () => {
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("github.actor == 'mrdata007'");
    expect(workflow).toContain("github.triggering_actor == 'mrdata007'");
    expect(workflow).toContain('"$EXPECTED_COMMIT" == "$GITHUB_SHA"');
    expect(workflow).toContain("tkewgajrljbwgwedqsxn");
    expect(workflow).toContain("APPLY_SUPPORTING_DEPENDENCY_PRODUCTION");
    expect(workflow).toContain("GITHUB_WORKFLOW_RERUN_FORBIDDEN");
    expect(workflow).toContain("environment: production-admin-activation");
  });

  it("shares the production mutation lock, never cancels it, and never retries", () => {
    expect(workflow).toContain("group: botolago-production-v2-mutation");
    expect(workflow).toContain("cancel-in-progress: false");
    const body = workflow
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    expect(body).not.toMatch(
      /retry|schedule:|push:|pull_request|continue-on-error|run_attempt: [2-9]/i,
    );
    expect(body.match(/supporting-dependency-apply\.py/g)).toHaveLength(1);
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("if: always()");
  });

  it("keeps the rehearsal workflows rehearsal-only", () => {
    for (const name of [
      "production-mapping-supporting-dependency-rehearsal.yml",
      "staging-mapping-supporting-dependency-rehearsal.yml",
    ]) {
      const text = read(`.github/workflows/${name}`)
        .split("\n")
        .filter((line) => !line.trim().startsWith("#"))
        .join("\n");
      expect(text).not.toContain("APPLY_SUPPORTING_DEPENDENCY_PRODUCTION");
      expect(text).not.toContain("-apply.py");
    }
  });
});

describe("supporting-dependency guard: the apply runner", () => {
  it("decides the outcome from production's state with the five reported outcomes", () => {
    for (const outcome of [
      "BLOCKED_NO_WRITE",
      "FAILED_ROLLED_BACK",
      "APPLIED_AND_VERIFIED",
      "COMMITTED_NEEDS_REVIEW",
      "OUTCOME_UNVERIFIED",
    ]) {
      expect(runner).toContain(outcome);
    }
    expect(runner).toContain("Nothing is deleted or reversed automatically");
  });

  it("sends the apply once and never edits the payload beyond the one line", () => {
    expect(runner.match(/send\(payload\)/g)).toHaveLength(1);
    expect(runner).not.toMatch(/payload\.replace\(|re\.sub\(/);
    expect(runner).toContain('lines[hits[0]] = "commit;"');
  });
});
