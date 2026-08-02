import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = join(import.meta.dir, "g5-gnews-schedule-evidence.ts");
const workflow = join(import.meta.dir, "../../.github/workflows/g5-production-gnews-schedule.yml");
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture(overrides: Record<string, string> = {}) {
  const directory = mkdtempSync(join(tmpdir(), "botolago-g5-gnews-"));
  temporaryDirectories.push(directory);
  const response = join(directory, "gnews-response.json");
  writeFileSync(
    response,
    JSON.stringify({
      provider: "gnews",
      languages: ["fr", "ar"],
      counters: {
        fetched: 11,
        validated: 11,
        inserted: 0,
        updated: 0,
        skipped: 11,
        rejected: 0,
        retries: 0,
      },
    }),
  );
  return {
    directory,
    response,
    env: {
      ...process.env,
      G5_GNEWS_EVIDENCE_DIR: directory,
      G5_GNEWS_RESPONSE: response,
      G5_GNEWS_CURL_EXIT: "0",
      G5_GNEWS_STATUS: "200",
      EXPECTED_COMMIT: "a".repeat(40),
      EXPECTED_PROJECT_REF: "tkewgajrljbwgwedqsxn",
      GITHUB_RUN_ID: "123456",
      GITHUB_EVENT_NAME: "schedule",
      ...overrides,
    },
  };
}

function run(env: Record<string, string | undefined>) {
  return Bun.spawnSync(["bun", script], { env, stdout: "pipe", stderr: "pipe" });
}

function manifest(directory: string) {
  return JSON.parse(readFileSync(join(directory, "g5-scheduled-gnews-evidence.json"), "utf8"));
}

describe("G5 scheduled GNews evidence", () => {
  test("accepts an exact zero-rejection bilingual reconciliation", () => {
    const { directory, env } = fixture();
    expect(run(env).exitCode).toBe(0);
    expect(manifest(directory)).toMatchObject({
      schemaVersion: 1,
      mode: "production_scheduled_gnews",
      verdict: "pass",
      request: { curlExit: 0, httpStatus: 200, responseFile: "gnews-response.json" },
      news: {
        languages: ["fr", "ar"],
        counters: { fetched: 11, validated: 11, skipped: 11, rejected: 0 },
      },
    });
  });

  test("preserves the response and records provider HTTP failures", () => {
    const { directory, response, env } = fixture({ G5_GNEWS_STATUS: "429" });
    expect(run(env).exitCode).toBe(1);
    expect(readFileSync(response, "utf8")).toContain('"provider":"gnews"');
    expect(manifest(directory)).toMatchObject({
      verdict: "fail",
      failureCode: "NEWS_HTTP_429",
    });
  });

  test("rejects provider rows that do not reconcile exactly", () => {
    const { directory, response, env } = fixture();
    writeFileSync(
      response,
      JSON.stringify({
        provider: "gnews",
        languages: ["fr", "ar"],
        counters: {
          fetched: 2,
          validated: 1,
          inserted: 1,
          updated: 0,
          skipped: 0,
          rejected: 1,
          retries: 0,
        },
      }),
    );
    expect(run(env).exitCode).toBe(1);
    expect(manifest(directory)).toMatchObject({
      verdict: "fail",
      failureCode: "GNEWS_RECONCILIATION_FAILED",
    });
  });

  test("keeps licensing and credential scans ahead of activation and cleanup", () => {
    const source = readFileSync(workflow, "utf8");
    expect(source).toContain("vars.GNEWS_COMMERCIAL_LICENSE_APPROVED == 'true'");
    expect(source).toContain(
      "github.event_name == 'schedule' && vars.GNEWS_SCHEDULE_ENABLED == 'true'",
    );
    expect(source).toContain(
      "github.event_name == 'workflow_dispatch' && github.actor == 'mrdata007'",
    );
    expect(source).toContain('GITHUB_EVENT_NAME" == "schedule"');
    expect(source).toContain("GITHUB_WORKFLOW_RERUN_FORBIDDEN");
    expect(source).toContain("--max-time 45");
    expect(source.indexOf("Verify evidence contains no credentials")).toBeLessThan(
      source.indexOf("Upload sanitized schedule evidence"),
    );
    expect(source.indexOf("Upload sanitized schedule evidence")).toBeLessThan(
      source.indexOf("Remove protected runtime files"),
    );
  });
});
