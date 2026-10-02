import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The phone-push workflow writes to production, so its guards are pinned: it is
 * started by hand only (no schedule), by the owner, on the exact reviewed
 * commit, behind a typed confirmation, and under the one-writer lock.
 */

const root = join(import.meta.dir, "../..");
const workflow = readFileSync(
  join(root, ".github/workflows/notification-push-dispatch.yml"),
  "utf8",
);

describe("notification-push-dispatch.yml", () => {
  test("is never scheduled or triggered by a push", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/^\s*schedule:/m);
    expect(workflow).not.toMatch(/^\s*push:/m);
    expect(workflow).not.toMatch(/^\s*pull_request/m);
  });

  test("only the owner, on main, on the exact reviewed commit, with a typed word", () => {
    expect(workflow).toContain("github.actor == 'mrdata007'");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain('test "$EXPECTED_COMMIT" = "$GITHUB_SHA"');
    expect(workflow).toContain("CHECK_PUSH_CONFIGURATION | SEND_QUEUED_PUSH_NOTIFICATIONS");
    expect(workflow).toContain('test "$SUPABASE_PRODUCTION_PROJECT_REF" = "tkewgajrljbwgwedqsxn"');
  });

  test("shares the one-writer lock and never cancels a run in progress", () => {
    expect(workflow).toContain("group: botolago-production-v2-mutation");
    expect(workflow).toContain("cancel-in-progress: false");
  });

  test("the check mode has no database credential; the private key is a secret and is masked", () => {
    const check = workflow.slice(
      workflow.indexOf("Check the push configuration"),
      workflow.indexOf("Send one batch"),
    );
    expect(check).not.toContain("SUPABASE");
    expect(workflow).toContain("secrets.WEB_PUSH_VAPID_PRIVATE_KEY");
    expect(workflow).not.toContain("vars.WEB_PUSH_VAPID_PRIVATE_KEY");
    expect(workflow).toContain('::add-mask::%s\\n\' "$WEB_PUSH_VAPID_PRIVATE_KEY"');
  });
});
