import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const workflow = readFileSync(".github/workflows/pepites-photo-publish.yml", "utf8");
const body = workflow
  .split("\n")
  .filter((line) => !line.trim().startsWith("#"))
  .join("\n");

describe("publish approved player photos: the workflow", () => {
  it("is owner-only, main-only, dispatch-only and typed-confirmed", () => {
    expect(body).toContain("github.repository == 'mrdata007/botolago-foundation'");
    expect(body).toContain("github.ref == 'refs/heads/main'");
    expect(body).toContain("github.event_name == 'workflow_dispatch'");
    expect(body).toContain("github.actor == 'mrdata007'");
    expect(body).toContain("environment: production-admin-activation");
    expect(body).toContain('[[ "$CONFIRMATION" == "PUBLISH_APPROVED_PHOTOS" ]]');
    expect(body).toContain('"${GITHUB_RUN_ATTEMPT:-}" == "1"');
    expect(body).toContain("GITHUB_WORKFLOW_RERUN_FORBIDDEN");
  });

  it("is one production writer among the others, never cancelled midway", () => {
    expect(body).toContain("group: botolago-production-v2-mutation");
    expect(body).toContain("cancel-in-progress: false");
  });

  it("targets only the production project", () => {
    expect(body).toContain('"${SUPABASE_PRODUCTION_PROJECT_REF:-}" == "tkewgajrljbwgwedqsxn"');
    expect(body).toContain(
      '"${SUPABASE_PRODUCTION_URL%/}" == "https://tkewgajrljbwgwedqsxn.supabase.co"',
    );
  });

  it("takes no input but the confirmation, and never runs on its own", () => {
    const inputs = body.slice(body.indexOf("inputs:"), body.indexOf("concurrency:"));
    expect([...inputs.matchAll(/^ {6}(\w+):$/gm)].map((match) => match[1])).toEqual([
      "confirmation",
    ]);
    expect(body).not.toMatch(/schedule:|pull_request|push:|repository_dispatch/);
  });

  it("runs the reviewed photo job, tested first, and nothing else", () => {
    expect(body).toContain("bun install --frozen-lockfile");
    expect(body).toContain(
      "bun test scripts/backend/pepites-photo-job.test.ts scripts/backend/pepites-tick-pause.test.ts",
    );
    expect([...body.matchAll(/^\s+bun scripts\/backend\/([\w.-]+)/gm)].map((m) => m[1])).toEqual([
      "pepites-tick-pause.ts",
      "pepites-photo-job.ts",
      "pepites-tick-pause.ts",
    ]);
    expect(body).not.toMatch(/supabase (db|functions|secrets)|psql|curl /);
  });

  it("pauses the Pépites tick before publishing and always restores it afterwards", () => {
    const pause = body.indexOf("bun scripts/backend/pepites-tick-pause.ts pause");
    const publish = body.indexOf("bun scripts/backend/pepites-photo-job.ts");
    const resume = body.indexOf(
      'bun scripts/backend/pepites-tick-pause.ts resume "$PREVIOUS_ACTIVE"',
    );
    expect(pause).toBeGreaterThan(0);
    expect(publish).toBeGreaterThan(pause);
    expect(resume).toBeGreaterThan(publish);
    expect(body).toContain("id: pause");
    expect(body).toContain("if: always() && steps.pause.outputs.previous_active != ''");
    expect(body).not.toContain("pepites_configure");
  });

  it("masks both keys, reads each only in the steps that need it, and never prints them", () => {
    expect(body).toContain("printf '::add-mask::%s\\n' \"$SUPABASE_SECRET_KEY\"");
    expect(body.match(/secrets\.SUPABASE_SECRET_KEY/g)).toHaveLength(1);
    expect(body.match(/printf '::add-mask::%s\\n' "\$SUPABASE_ACCESS_TOKEN"/g)).toHaveLength(2);
    expect(body.match(/secrets\.SUPABASE_ACCESS_TOKEN/g)).toHaveLength(2);
    expect(body).not.toMatch(/echo[^\n]*\$(SUPABASE_SECRET_KEY|SUPABASE_ACCESS_TOKEN)/);
    expect(body).toContain("persist-credentials: false");
    expect(body).toContain("contents: read");
  });
});
