import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = join(import.meta.dir, "gate4-canary-evidence.ts");
const scanner = join(import.meta.dir, "phase7f-scan-sanitized-evidence.py");
const workflow = join(
  import.meta.dir,
  "../../.github/workflows/gate4-production-news-ratings-canary.yml",
);
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function fixture(overrides: Record<string, string> = {}) {
  const directory = mkdtempSync(join(tmpdir(), "botolago-gate4-evidence-"));
  temporaryDirectories.push(directory);
  const paths = {
    ratings: join(directory, "ratings-response.json"),
    crests: join(directory, "crest-response.json"),
    news: join(directory, "news-response.json"),
  };
  writeFileSync(
    paths.ratings,
    JSON.stringify({
      provider: "sportsmonks",
      seasonId: 26027,
      algorithmVersion: "botolago-preseason-rating-v1",
      candidates: 561,
      ratingRange: { minimum: 4, maximum: 10 },
      counters: { fetched: 561, validated: 561, inserted: 0, updated: 0, skipped: 561 },
    }),
  );
  writeFileSync(
    paths.crests,
    JSON.stringify({
      provider: "sportsmonks",
      jobs: {
        teams: { fetched: 16, validated: 16, inserted: 0, updated: 0, skipped: 16, rejected: 0 },
      },
    }),
  );
  writeFileSync(
    paths.news,
    JSON.stringify({
      provider: "gnews",
      languages: ["fr", "ar"],
      counters: { fetched: 2, validated: 2, inserted: 2, updated: 0, skipped: 0 },
    }),
  );

  const env = {
    ...process.env,
    EXPECTED_COMMIT: "a".repeat(40),
    EXPECTED_PROJECT_REF: "tkewgajrljbwgwedqsxn",
    GATE4_EVIDENCE_DIR: directory,
    GATE4_RATINGS_RESPONSE: paths.ratings,
    GATE4_CREST_RESPONSE: paths.crests,
    GATE4_NEWS_RESPONSE: paths.news,
    GATE4_RATINGS_STATUS: "200",
    GATE4_CREST_STATUS: "200",
    GATE4_NEWS_STATUS: "200",
    GATE4_RATINGS_CURL_EXIT: "0",
    GATE4_CREST_CURL_EXIT: "0",
    GATE4_NEWS_CURL_EXIT: "0",
    ...overrides,
  };
  return { directory, env, paths };
}

function run(env: Record<string, string | undefined>) {
  return Bun.spawnSync(["bun", script], { env, stderr: "pipe", stdout: "pipe" });
}

function manifest(directory: string) {
  return JSON.parse(readFileSync(join(directory, "gate4-news-ratings-canary.json"), "utf8"));
}

describe("Gate 4 canary evidence", () => {
  test("writes a passing manifest for the approved counters", () => {
    const { directory, env } = fixture();
    const result = run(env);

    expect(result.exitCode).toBe(0);
    expect(manifest(directory)).toMatchObject({
      schemaVersion: 2,
      verdict: "pass",
      requests: {
        ratings: { curlExit: 0, httpStatus: 200, responseFile: "ratings-response.json" },
        crests: { curlExit: 0, httpStatus: 200, responseFile: "crest-response.json" },
        news: { curlExit: 0, httpStatus: 200, responseFile: "news-response.json" },
      },
    });
  });

  test("preserves responses and writes a failure manifest for provider HTTP errors", () => {
    const { directory, env, paths } = fixture({ GATE4_NEWS_STATUS: "429" });
    const result = run(env);

    expect(result.exitCode).toBe(1);
    expect(readFileSync(paths.news, "utf8")).toContain('"provider":"gnews"');
    expect(manifest(directory)).toMatchObject({
      verdict: "fail",
      failureCode: "NEWS_HTTP_429",
      requests: { news: { httpStatus: 429 } },
    });
  });

  test("writes a failure manifest when a response is invalid JSON", () => {
    const { directory, env, paths } = fixture();
    writeFileSync(paths.crests, "not-json");

    expect(run(env).exitCode).toBe(1);
    expect(manifest(directory)).toMatchObject({
      verdict: "fail",
      failureCode: "CRESTS_INVALID_JSON",
    });
  });

  test("records curl transport failures before parsing responses", () => {
    const { directory, env } = fixture({
      GATE4_RATINGS_CURL_EXIT: "28",
      GATE4_RATINGS_STATUS: "0",
    });

    expect(run(env).exitCode).toBe(1);
    expect(manifest(directory)).toMatchObject({
      verdict: "fail",
      failureCode: "RATINGS_CURL_EXIT_28",
    });
  });

  test("credential scanner remains a hard gate for upload contents", () => {
    const { directory } = fixture();
    const unsafe = join(directory, "unsafe.json");
    writeFileSync(
      unsafe,
      JSON.stringify({ authorization: "Bearer eyJunsafeunsafeunsafeunsafeunsafe" }),
    );
    chmodSync(unsafe, 0o600);

    const result = Bun.spawnSync(["python3", scanner, directory], {
      stderr: "pipe",
      stdout: "pipe",
    });
    expect(result.exitCode).toBe(1);
  });

  test("workflow scans and uploads failure evidence before cleanup", () => {
    const source = readFileSync(workflow, "utf8");
    const scanIndex = source.indexOf("- name: Verify sanitized evidence");
    const uploadIndex = source.indexOf("- name: Upload sanitized evidence");
    const cleanupIndex = source.indexOf(
      "- name: Remove one-time ratings trigger and runtime files",
    );

    expect(source).toContain('echo "GATE4_RATINGS_RESPONSE=$evidence_dir/ratings-response.json"');
    expect(source).toContain("scripts/backend/gate4-sanitize-command-log.test.ts");
    expect(source).toContain('GATE4_COMMAND_LOG_DESTINATION="$evidence_path"');
    expect(source).toContain("football-deploy.raw.log football-deploy.log");
    expect(source).toContain("news-deploy.raw.log news-deploy.log");
    expect(source).toContain("secrets-set.raw.log secrets-set.log");
    expect(source).toContain("if: always() && steps.runtime.outcome == 'success'");
    expect(source).toContain("if: always() && steps.evidence_scan.outcome == 'success'");
    expect(scanIndex).toBeGreaterThan(0);
    expect(uploadIndex).toBeGreaterThan(scanIndex);
    expect(cleanupIndex).toBeGreaterThan(uploadIndex);
  });
});
