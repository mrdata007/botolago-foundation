import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const workflow = readFileSync(
  ".github/workflows/gate2f-production-current-season-catalog-canary.yml",
  "utf8",
);

describe("Gate 2F current-season catalog canary workflow", () => {
  test("is manual-only and bound to the owner, main, and an immutable commit", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).not.toContain("push:");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("github.actor == 'mrdata007'");
    expect(workflow).toContain('EXPECTED_COMMIT" != "$GITHUB_SHA');
    expect(workflow).toContain("GITHUB_WORKFLOW_RERUN_FORBIDDEN");
  });

  test("proves current provider readiness before the first production mutation", () => {
    const probe = workflow.indexOf("Re-probe current-season provider readiness before mutation");
    const readiness = workflow.indexOf("Require exact current-season readiness");
    const deploy = workflow.indexOf("Deploy the exact reviewed ingestion runtime");
    const secrets = workflow.indexOf("Install pinned current-season function configuration");
    const canary = workflow.indexOf("Run the bounded current-season catalog canary");
    expect(probe).toBeGreaterThan(0);
    expect(readiness).toBeGreaterThan(probe);
    expect(deploy).toBeGreaterThan(readiness);
    expect(secrets).toBeGreaterThan(deploy);
    expect(canary).toBeGreaterThan(secrets);
    expect(workflow).toContain('fixture.get("available") is not True');
    expect(workflow).toContain("CURRENT_SEASON_ROUNDS_NOT_READY");
    expect(workflow).toContain("CURRENT_SEASON_TEAMS_NOT_READY");
  });

  test("keeps credentials server-only and restores the historical configuration on failure", () => {
    expect(workflow).not.toContain("VITE_SPORTSMONKS");
    expect(workflow).toContain("secrets.SPORTSMONKS_API_TOKEN");
    expect(workflow).toContain("phase7f-scan-sanitized-evidence.py");
    expect(workflow).toContain(
      "always() && steps.runtime.outcome == 'success' && steps.checkout.outcome == 'success'",
    );
    expect(workflow).toContain("GATE2F_ROLLBACK_FILE");
    expect(workflow).toContain('"FOOTBALL_SPORTSMONKS_SEASON_ID": "26027"');
    expect(workflow).toContain("FOOTBALL_INGESTION_TRIGGER_SECRET");
    expect(workflow).toContain("GATE2F_CLEANUP_OR_ROLLBACK_FAILED");
  });
});
