import { describe, expect, test } from "bun:test";

import { parseArguments, runtimeGuard } from "./news-engine-run";

const STAGING = "https://srdrflfrfpwixsllveid.supabase.co";
const PRODUCTION = "https://tkewgajrljbwgwedqsxn.supabase.co";

function environment(overrides: Record<string, string | undefined> = {}) {
  return {
    SUPABASE_URL: STAGING,
    SUPABASE_SECRET_KEY: "sb_secret_example_value",
    ANTHROPIC_API_KEY: "sk-ant-example",
    ...overrides,
  };
}

describe("news engine runner arguments", () => {
  test("defaults are the safe ones", () => {
    const args = parseArguments([]);
    expect(args.job).toBe("incremental");
    expect(args.sources).toEqual(["elbotola"]);
    expect(args.languages).toEqual(["ar", "fr"]);
    expect(args.limit).toBe(25);
    // Nothing publishes unless explicitly asked.
    expect(args.publish).toBe(false);
    expect(args.dryRun).toBe(false);
  });

  test("supports every documented control", () => {
    const args = parseArguments([
      "--job",
      "backfill",
      "--source",
      "elbotola,frmf",
      "--language",
      "ar",
      "--limit",
      "100",
      "--since",
      "2026-08-01",
      "--until",
      "2026-09-01",
      "--dry-run",
      "--publish",
    ]);
    expect(args.job).toBe("backfill");
    expect(args.sources).toEqual(["elbotola", "frmf"]);
    expect(args.languages).toEqual(["ar"]);
    expect(args.limit).toBe(100);
    expect(args.since).toBe("2026-08-01");
    expect(args.until).toBe("2026-09-01");
    expect(args.dryRun).toBe(true);
    expect(args.publish).toBe(true);
  });

  test("accepts --key=value form", () => {
    expect(parseArguments(["--limit=50"]).limit).toBe(50);
  });

  test("rejects --publish together with --review-only", () => {
    expect(() => parseArguments(["--publish", "--review-only"])).toThrow(
      "publish_and_review_only_conflict",
    );
  });

  test("rejects an out-of-range batch size", () => {
    expect(() => parseArguments(["--limit", "0"])).toThrow("invalid_limit");
    expect(() => parseArguments(["--limit", "500"])).toThrow("invalid_limit");
    expect(() => parseArguments(["--limit", "abc"])).toThrow("invalid_limit");
  });

  test("rejects an unknown job, language or malformed slug and date", () => {
    expect(() => parseArguments(["--job", "nonsense"])).toThrow("invalid_job_kind");
    expect(() => parseArguments(["--language", "de"])).toThrow("invalid_language");
    expect(() => parseArguments(["--source", "Bad_Slug"])).toThrow("invalid_source_slug");
    expect(() => parseArguments(["--since", "yesterday"])).toThrow("invalid_since");
    expect(() => parseArguments(["--until", "01-09-2026"])).toThrow("invalid_until");
  });
});

describe("news engine runtime guard", () => {
  test("accepts a complete configuration", () => {
    const configuration = runtimeGuard(environment());
    expect(configuration.projectRef).toBe("srdrflfrfpwixsllveid");
  });

  test("refuses to start without a service key", () => {
    expect(() => runtimeGuard(environment({ SUPABASE_SECRET_KEY: undefined }))).toThrow(
      "protected_service_key_missing",
    );
  });

  test("refuses a key containing whitespace", () => {
    expect(() => runtimeGuard(environment({ SUPABASE_SECRET_KEY: "has space" }))).toThrow(
      "protected_service_key_missing",
    );
  });

  test("refuses a malformed Supabase url", () => {
    expect(() => runtimeGuard(environment({ SUPABASE_URL: "http://localhost:54321" }))).toThrow(
      "invalid_supabase_url",
    );
    expect(() => runtimeGuard(environment({ SUPABASE_URL: undefined }))).toThrow(
      "invalid_supabase_url",
    );
  });

  test("refuses a project that is not the expected one", () => {
    // A service-role worker pointed at the wrong project does not fail — it
    // writes real articles into a database nobody is reading.
    expect(() =>
      runtimeGuard(
        environment({
          SUPABASE_URL: PRODUCTION,
          NEWS_ENGINE_EXPECTED_PROJECT_REF: "srdrflfrfpwixsllveid",
        }),
      ),
    ).toThrow("project_ref_mismatch");
  });

  test("accepts a matching expected project ref", () => {
    const configuration = runtimeGuard(
      environment({
        SUPABASE_URL: PRODUCTION,
        NEWS_ENGINE_EXPECTED_PROJECT_REF: "tkewgajrljbwgwedqsxn",
      }),
    );
    expect(configuration.projectRef).toBe("tkewgajrljbwgwedqsxn");
  });

  test("refuses to start without a model key", () => {
    expect(() => runtimeGuard(environment({ ANTHROPIC_API_KEY: undefined }))).toThrow(
      "anthropic_api_key_missing",
    );
  });

  test("tolerates the VITE_ url alias", () => {
    const configuration = runtimeGuard(
      environment({ SUPABASE_URL: undefined, VITE_SUPABASE_URL: STAGING }),
    );
    expect(configuration.projectRef).toBe("srdrflfrfpwixsllveid");
  });
});
