import { describe, expect, it } from "bun:test";

const APPROVED_BASE_COMMIT = "df1548aa18ffcae8f8a5dc29107eab989eadae3a";
const TICKET_PATH = "docs/production/g5-two-season-backfill-trigger.json";
const WORKFLOW_PATH = ".github/workflows/g5-production-two-season-backfill.yml";

describe("G5 one-time two-season backfill activation", () => {
  it("pins the exact ticket and merge parent enforced by the production workflow", async () => {
    const ticket = await Bun.file(TICKET_PATH).json();
    expect(ticket).toEqual({
      schemaVersion: 1,
      requestId: "g5-two-season-backfill-2026-08-02-03",
      approvedBaseCommit: APPROVED_BASE_COMMIT,
      requestedSeasonIds: [26_027, 24_319],
      confirmation: "RUN_G5_TWO_SEASON_BACKFILL",
    });

    const workflow = await Bun.file(WORKFLOW_PATH).text();
    expect(workflow).toContain(`      - "${TICKET_PATH}"`);
    expect(workflow).toContain(`"approvedBaseCommit": "${APPROVED_BASE_COMMIT}"`);
    expect(workflow).toContain(`"$first_parent" != "${APPROVED_BASE_COMMIT}"`);
    expect(workflow).toContain("fetch-depth: 2");
    expect(workflow).toContain(`<<< "$(git show -s --format=%P "$GITHUB_SHA")" || true`);
    expect(workflow).toContain("GITHUB_WORKFLOW_RERUN_FORBIDDEN");
  });
});
