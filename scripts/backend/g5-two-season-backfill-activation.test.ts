import { describe, expect, it } from "bun:test";

const APPROVED_BASE_COMMIT = "802f929e84635369d8c4f35d3777ee30184547be";
const TICKET_PATH = "docs/production/g5-two-season-backfill-trigger.json";
const WORKFLOW_PATH = ".github/workflows/g5-production-two-season-backfill.yml";

describe("G5 one-time two-season backfill activation", () => {
  it("pins the exact ticket and merge parent enforced by the production workflow", async () => {
    const ticket = await Bun.file(TICKET_PATH).json();
    expect(ticket).toEqual({
      schemaVersion: 1,
      requestId: "g5-two-season-backfill-2026-08-02-01",
      approvedBaseCommit: APPROVED_BASE_COMMIT,
      requestedSeasonIds: [26_027, 24_319],
      confirmation: "RUN_G5_TWO_SEASON_BACKFILL",
    });

    const workflow = await Bun.file(WORKFLOW_PATH).text();
    expect(workflow).toContain(`      - "${TICKET_PATH}"`);
    expect(workflow).toContain(`"approvedBaseCommit": "${APPROVED_BASE_COMMIT}"`);
    expect(workflow).toContain(`"$first_parent" != "${APPROVED_BASE_COMMIT}"`);
    expect(workflow).toContain("GITHUB_WORKFLOW_RERUN_FORBIDDEN");
  });
});
