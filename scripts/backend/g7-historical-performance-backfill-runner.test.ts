import { afterEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CAPTURE_ONLY_DIAGNOSTIC_CONFIRMATION,
  HistoricalPerformanceBackfillError,
  MANAGED_SECRET_NAMES,
  parseMode,
  parseRequestedSeasonIds,
  parseSecretsListTable,
  runHistoricalPerformanceBackfill,
  sha256Hex,
  validateHistoricalPerformanceBatch,
  validateHistoricalRatingDerivation,
  type RunnerDependencies,
} from "./g7-historical-performance-backfill-runner";

const EXPECTED_PROJECT_REF = "tkewgajrljbwgwedqsxn";
const EXPECTED_COMMIT = "a".repeat(40);

/**
 * Regression guard for the season-configuration `commands.push` leak (Reviewer attempt 1,
 * defect 1): recursively walks a piece of evidence and fails if any object anywhere carries a
 * `stdout` key. `CommandResult.stdout` exists so captureConfiguration/performRestore can parse the
 * `secrets list` table, but that raw stdout — which can contain live secret values such as
 * SPORTSMONKS_API_TOKEN or a freshly-minted FOOTBALL_INGESTION_TRIGGER_SECRET — must never reach
 * anything written into the evidence directory. This must fail on the pre-fix code (which pushed
 * the full CommandResult, stdout included, for the season-configuration command) and pass after.
 */
function assertNoStdoutLeak(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoStdoutLeak(entry, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (key === "stdout") {
        throw new Error(`FOUND_STDOUT_KEY_AT ${path}.stdout`);
      }
      assertNoStdoutLeak(entry, `${path}.${key}`);
    }
  }
}

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(dir);
  return dir;
}

// ---------------------------------------------------------------------------
// Fake Supabase CLI: a Bun script written to a temp dir per test. It keeps a JSON
// "live secret state" ({name: sha256(value)}) and appends every invocation's argv to a
// call log, so tests can assert both the effect (verify-after-restore) and the call
// ordering / arguments (never --output, never `unset` with zero names) without a real CLI.
// ---------------------------------------------------------------------------

interface FakeCli {
  readonly cliPath: string;
  readonly stateFile: string;
  readonly callLogFile: string;
  calls(): string[][];
  state(): Record<string, string>;
}

function createFakeCli(dir: string, failOps: readonly string[] = []): FakeCli {
  const cliPath = join(dir, "fake-supabase");
  const stateFile = join(dir, "state.json");
  const callLogFile = join(dir, "calls.jsonl");
  writeFileSync(stateFile, "{}");
  writeFileSync(callLogFile, "");
  const script = `#!/usr/bin/env bun
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const stateFile = ${JSON.stringify(stateFile)};
const callLog = ${JSON.stringify(callLogFile)};
const failOps = ${JSON.stringify(failOps)};
function sha256(v) { return createHash("sha256").update(v, "utf8").digest("hex"); }
function loadState() { return JSON.parse(readFileSync(stateFile, "utf8")); }
function saveState(s) { writeFileSync(stateFile, JSON.stringify(s)); }
appendFileSync(callLog, JSON.stringify(args) + "\\n");
const [group, sub, ...rest] = args;
if (group !== "secrets") { console.error("FAKE_CLI_UNSUPPORTED"); process.exit(1); }
if (sub === "list") {
  if (failOps.includes("list")) { console.error("FAKE_CLI_FORCED_FAILURE"); process.exit(1); }
  const state = loadState();
  const lines = ["NAME | DIGEST"];
  for (const name of Object.keys(state).sort()) lines.push(\`\${name} | \${state[name]}\`);
  console.log(lines.join("\\n"));
  process.exit(0);
}
if (sub === "set") {
  if (failOps.includes("set")) { console.error("FAKE_CLI_FORCED_FAILURE"); process.exit(1); }
  const envFileIndex = rest.indexOf("--env-file");
  const envFile = rest[envFileIndex + 1];
  const content = readFileSync(envFile, "utf8");
  const state = loadState();
  for (const line of content.split("\\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    const name = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    state[name] = sha256(value);
  }
  saveState(state);
  process.exit(0);
}
if (sub === "unset") {
  if (failOps.includes("unset")) { console.error("FAKE_CLI_FORCED_FAILURE"); process.exit(1); }
  const projectIndex = rest.indexOf("--project-ref");
  const names = projectIndex === -1 ? rest : rest.slice(0, projectIndex);
  if (names.length === 0) { console.error("FAKE_CLI_REFUSING_ZERO_NAME_UNSET"); process.exit(1); }
  const state = loadState();
  for (const name of names) delete state[name];
  saveState(state);
  process.exit(0);
}
console.error("FAKE_CLI_UNSUPPORTED_SUBCOMMAND");
process.exit(1);
`;
  writeFileSync(cliPath, script);
  chmodSync(cliPath, 0o755);
  return {
    cliPath,
    stateFile,
    callLogFile,
    calls: () =>
      readFileSync(callLogFile, "utf8")
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as string[]),
    state: () => JSON.parse(readFileSync(stateFile, "utf8")) as Record<string, string>,
  };
}

function seedState(cli: FakeCli, values: Record<string, string>): void {
  const state: Record<string, string> = {};
  for (const [name, value] of Object.entries(values)) state[name] = sha256Hex(value);
  writeFileSync(cli.stateFile, JSON.stringify(state));
}

// ---------------------------------------------------------------------------
// Fake fetch: football-ingest batches/derivation + the two best-effort identity-check calls.
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface FakeFetchOptions {
  readonly failFirstBatch?: boolean;
}

function createFakeFetch(options: FakeFetchOptions = {}) {
  let processed = 0;
  let postCount = 0;
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/functions/v1/football-ingest")) {
      postCount += 1;
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      if (body.action === "ingest_batch") {
        if (options.failFirstBatch && processed === 0) {
          return jsonResponse({ error: "provider_unavailable" }, 503);
        }
        const take = Math.min(5, 240 - processed);
        processed += take;
        const nextCursor = processed < 240 ? String(19_480_000 + processed) : null;
        return jsonResponse({
          provider: "sportsmonks",
          seasonId: 26_027,
          action: "ingest_batch",
          expectedFixtureCount: 240,
          fixturesProcessed: take,
          acceptedFixtures: take,
          quarantinedFixtures: 0,
          performanceRows: take * 22,
          excludedIncompleteRows: 0,
          excludedMappingRows: 0,
          nextCursor,
          hasMore: nextCursor !== null,
          counters: { validated: take * 22, rejected: 0 },
        });
      }
      if (body.action === "derive_ratings") {
        return jsonResponse({
          provider: "sportsmonks",
          seasonId: 26_027,
          action: "derive_ratings",
          historicalOnly: true,
          algorithmVersion: "botolago-preseason-rating-v2-fixture-performance",
          expectedFixtureCount: 240,
          performanceRows: processed * 22,
          candidates: 200,
          sourceVersion: `sportsmonks-season-fixtures:${"a".repeat(64)}`,
          ratingRange: { minimum: 4.5, maximum: 9.5 },
          counters: { validated: 200, rejected: 0 },
        });
      }
      return jsonResponse({ error: "unexpected_request" }, 400);
    }
    if (url.includes("rest/v1/rpc/football_season_catalog")) {
      return jsonResponse([{ label: "2026/2027", isCurrent: true }]);
    }
    if (url.includes("api.sportmonks.com")) {
      return jsonResponse({ data: { is_current: true, league_id: 860, name: "2026/2027" } });
    }
    return jsonResponse({});
  }) as typeof fetch;
  return { fetch, postCount: () => postCount };
}

// ---------------------------------------------------------------------------
// Environment + evidence harness
// ---------------------------------------------------------------------------

const CURRENT_RUNTIME_INPUTS = {
  G7_CURRENT_SEASON_ID: "28647",
  G7_CURRENT_SEASON_START: "2026-08-01",
  G7_CURRENT_SEASON_END: "2027-05-30",
  G7_CURRENT_FIXTURE_FROM: "2026-08-01",
  G7_CURRENT_FIXTURE_TO: "2027-05-30",
  G7_CURRENT_TEAM_IDS: "1,2,3",
} as const;

function currentRestoreValues(): Record<string, string> {
  return {
    SPORTSMONKS_API_TOKEN: "provider-token-value",
    FOOTBALL_PROVIDER: "sportsmonks",
    FOOTBALL_PROVIDER_BASE_URL: "https://api.sportmonks.com/v3/football",
    FOOTBALL_SPORTSMONKS_LEAGUE_ID: "860",
    FOOTBALL_SPORTSMONKS_SEASON_ID: CURRENT_RUNTIME_INPUTS.G7_CURRENT_SEASON_ID,
    FOOTBALL_SPORTSMONKS_TEAM_IDS: CURRENT_RUNTIME_INPUTS.G7_CURRENT_TEAM_IDS,
    FOOTBALL_SPORTSMONKS_COUNTRY_CODE: "MA",
    FOOTBALL_SPORTSMONKS_COMPETITION_TYPE: "league",
    FOOTBALL_SPORTSMONKS_SEASON_START: CURRENT_RUNTIME_INPUTS.G7_CURRENT_SEASON_START,
    FOOTBALL_SPORTSMONKS_SEASON_END: CURRENT_RUNTIME_INPUTS.G7_CURRENT_SEASON_END,
    FOOTBALL_SPORTSMONKS_FIXTURE_FROM: CURRENT_RUNTIME_INPUTS.G7_CURRENT_FIXTURE_FROM,
    FOOTBALL_SPORTSMONKS_FIXTURE_TO: CURRENT_RUNTIME_INPUTS.G7_CURRENT_FIXTURE_TO,
    FOOTBALL_PROVIDER_TIMEOUT_MS: "15000",
    FOOTBALL_PROVIDER_MAX_RETRIES: "2",
  };
}

function writeManifest(evidenceDir: string): void {
  const teamIds16 = Array.from({ length: 16 }, (_, index) => index + 1);
  writeFileSync(
    join(evidenceDir, "g7-historical-performance-backfill-manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      provider: "sportsmonks",
      mode: "read_only_two_season_backfill_preflight",
      expectedCommit: EXPECTED_COMMIT,
      observedAt: new Date().toISOString(),
      league: { id: 860, name: "Botola Pro", active: true },
      seasons: [
        {
          id: 26_027,
          name: "2025/2026",
          startingAt: "2025-09-12",
          endingAt: "2026-07-05",
          rounds: 30,
          teamIds: teamIds16,
          fixtureWindows: [],
        },
        {
          id: 24_319,
          name: "2024/2025",
          startingAt: "2024-08-30",
          endingAt: "2025-05-12",
          rounds: 30,
          teamIds: teamIds16,
          fixtureWindows: [],
        },
      ],
      seasonCount: 2,
      requestCount: 11,
      verdict: "pass",
    }),
  );
}

interface Harness {
  readonly runtimeDir: string;
  readonly evidenceDir: string;
  readonly cli: FakeCli;
  deps(
    overrides?: Record<string, string | undefined>,
    fetchImpl?: RunnerDependencies["fetch"],
  ): RunnerDependencies;
}

function createHarness(failOps: readonly string[] = []): Harness {
  const base = tempDir("botolago-g7-runner-");
  const runtimeDir = join(base, "runtime");
  const evidenceDir = join(base, "evidence");
  mkdirSync(runtimeDir, { recursive: true });
  mkdirSync(evidenceDir, { recursive: true });
  writeManifest(evidenceDir);
  const cli = createFakeCli(base, failOps);
  const githubEnvFile = join(base, "github-env");
  writeFileSync(githubEnvFile, "");

  return {
    runtimeDir,
    evidenceDir,
    cli,
    deps(overrides = {}, fetchImpl) {
      const { fetch } = fetchImpl ? { fetch: fetchImpl } : createFakeFetch();
      const env: Record<string, string | undefined> = {
        GITHUB_ACTIONS: "true",
        CONFIRMATION: "RUN_G7_TWO_SEASON_HISTORICAL_PERFORMANCE_BACKFILL",
        EXPECTED_PROJECT_REF,
        EXPECTED_COMMIT,
        GITHUB_SHA: EXPECTED_COMMIT,
        G7_BACKFILL_RUNTIME_DIR: runtimeDir,
        G7_BACKFILL_EVIDENCE_DIR: evidenceDir,
        G7_SEASON_IDS: "26027",
        SPORTSMONKS_API_TOKEN: "provider-token-value",
        SUPABASE_SECRET_KEY: "secret-key-value",
        GITHUB_ENV: githubEnvFile,
        ...CURRENT_RUNTIME_INPUTS,
        ...overrides,
      };
      return {
        env,
        cliPath: cli.cliPath,
        fetch,
        now: () => new Date("2026-09-18T00:00:00Z"),
        writeFile: async (path, content) => {
          writeFileSync(path, content, { mode: 0o600 });
          chmodSync(path, 0o600);
        },
      };
    },
  };
}

describe("G7 historical performance production response validation", () => {
  it("pins a manual historical-only workflow with failure evidence preservation", async () => {
    const ticket = (await Bun.file(
      "docs/production/g7-historical-performance-backfill-trigger.json",
    ).json()) as Record<string, unknown>;
    expect(ticket).toMatchObject({
      requestedSeasonIds: [26_027],
      expectedFixturesPerSeason: 240,
      batchSize: 5,
      algorithmVersion: "botolago-preseason-rating-v2-fixture-performance",
      historicalOnly: true,
      currentSeasonActivated: false,
      currentSeasonId: 28_647,
      skipDeployRequiresFunctionIdentity: true,
      confirmation: "RUN_G7_TWO_SEASON_HISTORICAL_PERFORMANCE_BACKFILL",
      restorePolicy: {
        source: "captured_pre_run_fingerprints",
        triggerSecret: "unset_if_absent_else_restore_or_refuse",
        verifyAfterRestore: true,
      },
    });
    const workflow = await Bun.file(
      ".github/workflows/g7-production-historical-performance-backfill.yml",
    ).text();
    expect(workflow).not.toContain("push:");
    expect(workflow).toContain("GITHUB_WORKFLOW_RERUN_FORBIDDEN");
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain(
      'export FOOTBALL_INGESTION_TRIGGER_SECRET="${G7_BACKFILL_TRIGGER:-}"',
    );
    expect(workflow.indexOf("Upload sanitized historical backfill evidence")).toBeLessThan(
      workflow.indexOf("Remove protected runtime files"),
    );
    expect(workflow.indexOf("Restore production function configuration")).toBeGreaterThan(-1);
    expect(workflow.indexOf("Restore production function configuration")).toBeLessThan(
      workflow.indexOf("Preserve sanitized command evidence"),
    );

    // Parity: the workflow's embedded expected ticket dict must equal the ticket JSON exactly.
    const pythonBlockStart = workflow.indexOf("expected = {");
    const pythonBlockEnd = workflow.indexOf("\n          }\n          actual = json.loads(");
    const pythonSource = workflow.slice(pythonBlockStart, pythonBlockEnd + "\n          }".length);
    const jsonLike = pythonSource
      .replace(/^expected = /, "")
      .replaceAll("True", "true")
      .replaceAll("False", "false")
      .replace(/,(\s*[}\]])/g, "$1");
    const embedded = JSON.parse(jsonLike) as Record<string, unknown>;
    expect(embedded).toEqual(ticket);
  });

  it("accepts a bounded, exact fixture batch", () => {
    expect(
      validateHistoricalPerformanceBatch(
        {
          provider: "sportsmonks",
          seasonId: 26_027,
          action: "ingest_batch",
          expectedFixtureCount: 240,
          fixturesProcessed: 5,
          acceptedFixtures: 5,
          quarantinedFixtures: 0,
          performanceRows: 196,
          excludedIncompleteRows: 2,
          excludedMappingRows: 1,
          nextCursor: "19490001",
          hasMore: true,
          counters: { validated: 196, rejected: 0 },
        },
        26_027,
        "19480000",
      ),
    ).toEqual({
      fixturesProcessed: 5,
      acceptedFixtures: 5,
      quarantinedFixtures: 0,
      performanceRows: 196,
      excludedIncompleteRows: 2,
      excludedMappingRows: 1,
      nextCursor: "19490001",
      hasMore: true,
    });
  });

  it("accepts a batch containing a BG-0011 quarantined fixture (0 performance rows for it)", () => {
    // 4 accepted fixtures (minimum 18 identified starters each = 72) + 1 quarantined (0 rows).
    expect(
      validateHistoricalPerformanceBatch(
        {
          provider: "sportsmonks",
          seasonId: 26_027,
          action: "ingest_batch",
          expectedFixtureCount: 240,
          fixturesProcessed: 5,
          acceptedFixtures: 4,
          quarantinedFixtures: 1,
          performanceRows: 88,
          excludedIncompleteRows: 2,
          excludedMappingRows: 0,
          nextCursor: "19490001",
          hasMore: true,
          counters: { validated: 88, rejected: 1 },
        },
        26_027,
        "19480000",
      ),
    ).toEqual({
      fixturesProcessed: 5,
      acceptedFixtures: 4,
      quarantinedFixtures: 1,
      performanceRows: 88,
      excludedIncompleteRows: 2,
      excludedMappingRows: 0,
      nextCursor: "19490001",
      hasMore: true,
    });
  });

  it("rejects cursor regressions and partial provider rows", () => {
    expect(() =>
      validateHistoricalPerformanceBatch(
        {
          provider: "sportsmonks",
          seasonId: 26_027,
          action: "ingest_batch",
          expectedFixtureCount: 240,
          fixturesProcessed: 5,
          acceptedFixtures: 5,
          quarantinedFixtures: 0,
          performanceRows: 50,
          excludedIncompleteRows: 0,
          excludedMappingRows: 0,
          nextCursor: "19470000",
          hasMore: true,
          counters: { validated: 50, rejected: 0 },
        },
        26_027,
        "19480000",
      ),
    ).toThrow("historical_performance_batch_mismatch");
  });

  it("requires a non-neutral v2 rating range after all 240 fixtures", () => {
    expect(
      validateHistoricalRatingDerivation(
        {
          provider: "sportsmonks",
          seasonId: 24_319,
          action: "derive_ratings",
          historicalOnly: true,
          algorithmVersion: "botolago-preseason-rating-v2-fixture-performance",
          expectedFixtureCount: 240,
          performanceRows: 9_240,
          candidates: 612,
          sourceVersion: `sportsmonks-season-fixtures:${"a".repeat(64)}`,
          ratingRange: { minimum: 4.2, maximum: 9.8 },
          counters: { validated: 612, rejected: 0 },
        },
        24_319,
        9_240,
        240,
      ),
    ).toMatchObject({
      candidates: 612,
      ratingRange: { minimum: 4.2, maximum: 9.8 },
    });
  });

  it("rejects the old all-neutral fallback as derivation evidence", () => {
    expect(() =>
      validateHistoricalRatingDerivation(
        {
          provider: "sportsmonks",
          seasonId: 24_319,
          action: "derive_ratings",
          historicalOnly: true,
          algorithmVersion: "botolago-preseason-rating-v2-fixture-performance",
          expectedFixtureCount: 240,
          performanceRows: 9_240,
          candidates: 612,
          sourceVersion: `sportsmonks-season-fixtures:${"a".repeat(64)}`,
          ratingRange: { minimum: 6, maximum: 6 },
          counters: { validated: 612, rejected: 0 },
        },
        24_319,
        9_240,
        240,
      ),
    ).toThrow("historical_rating_derivation_mismatch");
  });

  // BG-0044: expectedFixtureCount validates fixtures that actually fed rating derivation
  // (acceptedFixtures), which after BG-0011 option B whole-fixture quarantine can legitimately be
  // below the flat 240-per-season total. It must be compared against the run's own dynamically
  // computed acceptedFixtures value, never against the hardcoded EXPECTED_FIXTURES_PER_SEASON
  // constant (that constant validates a different quantity: fixtures ATTEMPTED).
  function derivationResponse(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      provider: "sportsmonks",
      seasonId: 26_027,
      action: "derive_ratings",
      historicalOnly: true,
      algorithmVersion: "botolago-preseason-rating-v2-fixture-performance",
      expectedFixtureCount: 238,
      performanceRows: 9_258,
      candidates: 521,
      sourceVersion: `sportsmonks-season-fixtures:${"b".repeat(64)}`,
      ratingRange: { minimum: 4.2, maximum: 9.8 },
      counters: { validated: 521, rejected: 0 },
      ...overrides,
    };
  }

  it("BG-0044 real-world scenario: passes when expectedFixtureCount (238) matches the run's own acceptedFixtures (238), with 2 fixtures whole-fixture quarantined out of 240", () => {
    // This is the exact production scenario (season 26027, workflow run 35438310171,
    // 2026-09-19) that the unfixed code incorrectly failed: 238 accepted + 2 quarantined = 240
    // attempted, 9258 performance rows, 521 rating candidates -- all real, correct data.
    expect(
      validateHistoricalRatingDerivation(
        derivationResponse({ expectedFixtureCount: 238 }),
        26_027,
        9_258,
        238,
      ),
    ).toMatchObject({ candidates: 521 });
  });

  it("BG-0044: fails when the worker reports expectedFixtureCount 240 but this run's acceptedFixtures is genuinely 238 (worker still assuming a flat 240)", () => {
    expect(() =>
      validateHistoricalRatingDerivation(
        derivationResponse({ expectedFixtureCount: 240 }),
        26_027,
        9_258,
        238,
      ),
    ).toThrow("historical_rating_derivation_mismatch");
  });

  it("BG-0044: fails when the worker reports expectedFixtureCount 238 but this run's acceptedFixtures is actually 240 (worker under-reporting)", () => {
    expect(() =>
      validateHistoricalRatingDerivation(
        derivationResponse({ expectedFixtureCount: 238 }),
        26_027,
        9_258,
        240,
      ),
    ).toThrow("historical_rating_derivation_mismatch");
  });

  it("BG-0044: still passes the pre-existing all-clear case (zero quarantines, acceptedFixtures === 240 === fixturesProcessed) exactly as before this fix", () => {
    expect(
      validateHistoricalRatingDerivation(
        derivationResponse({
          expectedFixtureCount: 240,
          performanceRows: 9_240,
          candidates: 612,
          counters: { validated: 612, rejected: 0 },
        }),
        26_027,
        9_240,
        240,
      ),
    ).toMatchObject({ candidates: 612 });
  });
});

describe("season id scope", () => {
  it("accepts the ticket-pinned scope and rejects invalid ones", () => {
    expect(parseRequestedSeasonIds("26027")).toEqual([26_027]);
    expect(() => parseRequestedSeasonIds("24319")).not.toThrow();
    expect(() => parseRequestedSeasonIds("26027,26027")).toThrow("g7_season_ids_duplicate");
    expect(() => parseRequestedSeasonIds("")).toThrow("g7_season_ids_empty");
    expect(() => parseRequestedSeasonIds(undefined)).toThrow("g7_season_ids_empty");
    expect(() => parseRequestedSeasonIds("28647")).toThrow("g7_season_ids_out_of_scope");
  });
});

describe("parseMode", () => {
  it("recognizes the three CLI modes", () => {
    expect(parseMode([])).toBe("default");
    expect(parseMode(["--capture-only"])).toBe("capture-only");
    expect(parseMode(["--restore"])).toBe("restore");
  });
});

describe("parseSecretsListTable", () => {
  it("parses a NAME | DIGEST table and ignores header/separator rows", () => {
    const table = parseSecretsListTable(
      [
        "NAME | DIGEST",
        "----------------",
        `FOO | ${sha256Hex("x")}`,
        "",
        "BAR | notahexvalue",
      ].join("\n"),
    );
    expect(table.get("FOO")).toBe(sha256Hex("x"));
    expect(table.get("BAR")).toBe("notahexvalue");
    expect(table.has("NAME")).toBe(false);
  });
});

describe("runHistoricalPerformanceBackfill — capture", () => {
  it("captures presence/fingerprints, never leaking raw digests into evidence", async () => {
    const h = createHarness();
    seedState(h.cli, { SPORTSMONKS_API_TOKEN: "provider-token-value" });
    const deps = h.deps();
    const evidence = await runHistoricalPerformanceBackfill(deps, "capture-only");
    const secrets = evidence.secrets as Array<Record<string, unknown>>;
    const token = secrets.find((s) => s.name === "SPORTSMONKS_API_TOKEN")!;
    expect(token.present).toBe(true);
    expect(token.fingerprintSha256).toBe(sha256Hex(sha256Hex("provider-token-value")));
    expect(token).not.toHaveProperty("fingerprint");
    const absent = secrets.find((s) => s.name === "FOOTBALL_INGESTION_TRIGGER_SECRET")!;
    expect(absent.present).toBe(false);
    expect(absent.fingerprintSha256).toBeNull();

    const evidenceFileText = readFileSync(
      join(h.evidenceDir, "g7-historical-performance-backfill-capture.json"),
      "utf8",
    );
    expect(evidenceFileText).not.toContain(sha256Hex("provider-token-value"));

    const preRunConfig = JSON.parse(
      readFileSync(join(h.runtimeDir, "pre-run-config.json"), "utf8"),
    ) as Record<string, unknown>;
    const secretsBlock = preRunConfig.secrets as Record<string, { fingerprint: string | null }>;
    expect(secretsBlock.SPORTSMONKS_API_TOKEN.fingerprint).toBe(sha256Hex("provider-token-value"));
  });

  it("fails closed when secrets list exits non-zero or returns zero rows", async () => {
    const failing = createHarness(["list"]);
    await expect(runHistoricalPerformanceBackfill(failing.deps(), "capture-only")).rejects.toThrow(
      "production_config_capture_failed",
    );

    const empty = createHarness();
    await expect(runHistoricalPerformanceBackfill(empty.deps(), "capture-only")).rejects.toThrow(
      "production_config_capture_failed",
    );
  });
});

describe("runHistoricalPerformanceBackfill — refuse before mutate", () => {
  it("refuses when a present secret's fingerprint does not match the supplied restore value", async () => {
    const h = createHarness();
    seedState(h.cli, { FOOTBALL_SPORTSMONKS_SEASON_ID: "26027" }); // wrong value for the proof
    const deps = h.deps();
    await expect(runHistoricalPerformanceBackfill(deps, "default")).rejects.toThrow(
      "production_config_restore_unprovable",
    );
    expect(h.cli.calls()).toEqual([["secrets", "list", "--project-ref", EXPECTED_PROJECT_REF]]);
  });

  it("refuses when the trigger secret is present pre-run and no matching input is supplied", async () => {
    const h = createHarness();
    seedState(h.cli, { FOOTBALL_INGESTION_TRIGGER_SECRET: "some-live-trigger" });
    const deps = h.deps();
    await expect(runHistoricalPerformanceBackfill(deps, "default")).rejects.toThrow(
      "production_config_restore_unprovable",
    );
    expect(h.cli.calls().length).toBe(1);
  });

  it("accepts a present trigger secret when a matching G7_CURRENT_TRIGGER_SECRET is supplied", async () => {
    const h = createHarness();
    seedState(h.cli, {
      ...currentRestoreValues(),
      FOOTBALL_INGESTION_TRIGGER_SECRET: "live-trigger-value",
    });
    const deps = h.deps({ G7_CURRENT_TRIGGER_SECRET: "live-trigger-value" });
    const evidence = await runHistoricalPerformanceBackfill(deps, "default");
    expect(evidence.verdict).toBe("pass");
    const restoreEnv = readFileSync(join(h.runtimeDir, "restore-production-config.env"), "utf8");
    expect(restoreEnv).toContain("FOOTBALL_INGESTION_TRIGGER_SECRET=live-trigger-value");
    const unsetCall = h.cli.calls().find((call) => call[1] === "unset");
    expect(unsetCall).toBeUndefined();
  });

  it("rejects an out-of-scope, empty, or duplicate G7_SEASON_IDS before any command runs", async () => {
    const h = createHarness();
    for (const invalid of ["", "26027,26027", "28647"]) {
      const deps = h.deps({ G7_SEASON_IDS: invalid });
      await expect(runHistoricalPerformanceBackfill(deps, "default")).rejects.toThrow();
    }
    expect(h.cli.calls()).toEqual([]);
  });
});

describe("runHistoricalPerformanceBackfill — success path", () => {
  it("issues list, set(season), POST batches, POST derive, set(restore), unset, list — and verifies", async () => {
    const h = createHarness();
    seedState(h.cli, currentRestoreValues()); // trigger absent pre-run
    const { fetch, postCount } = createFakeFetch();
    const deps = h.deps({}, fetch);

    const evidence = await runHistoricalPerformanceBackfill(deps, "default");

    expect(evidence.verdict).toBe("pass");
    const restoration = evidence.restoration as Record<string, unknown>;
    expect(restoration.verified).toBe(true);

    const calls = h.cli.calls();
    const shapes = calls.map((call) => `${call[0]} ${call[1]}`);
    expect(shapes).toEqual([
      "secrets list",
      "secrets set",
      "secrets set",
      "secrets unset",
      "secrets list",
    ]);
    expect(calls.some((call) => call.includes("--output"))).toBe(false);
    expect(calls.some((call) => call[1] === "unset" && call.length <= 3)).toBe(false);
    expect(postCount()).toBeGreaterThan(0);

    const restoreEnv = readFileSync(join(h.runtimeDir, "restore-production-config.env"), "utf8");
    expect(restoreEnv).not.toContain("26027");
    expect(restoreEnv).toContain("FOOTBALL_SPORTSMONKS_SEASON_ID=28647");

    // Trigger was absent pre-run, so it must be explicitly unset (not carried into the restore file).
    const unsetCall = calls.find((call) => call[1] === "unset")!;
    expect(unsetCall).toContain("FOOTBALL_INGESTION_TRIGGER_SECRET");

    expect(existsSync(join(h.runtimeDir, "restore-verified"))).toBe(true);
  });

  it("still restores and verifies on a mid-run provider failure, but fails the run with the batch code", async () => {
    const h = createHarness();
    seedState(h.cli, currentRestoreValues());
    const { fetch } = createFakeFetch({ failFirstBatch: true });
    const deps = h.deps({}, fetch);

    await expect(runHistoricalPerformanceBackfill(deps, "default")).rejects.toThrow(
      /provider_unavailable/,
    );

    const resultText = readFileSync(
      join(h.evidenceDir, "g7-historical-performance-backfill-result.json"),
      "utf8",
    );
    const result = JSON.parse(resultText) as Record<string, unknown>;
    expect(result.verdict).toBe("fail");
    expect(String(result.failureCode)).toContain("provider_unavailable");
    expect((result.restoration as Record<string, unknown>).verified).toBe(true);
    expect(existsSync(join(h.runtimeDir, "restore-verified"))).toBe(true);
  });
});

describe("runHistoricalPerformanceBackfill — cancellation recovery via --restore", () => {
  it("restores from a capture that survived a kill, verifies, writes evidence, and is idempotent", async () => {
    const h = createHarness();
    seedState(h.cli, currentRestoreValues());

    // Simulate the process being killed right after capture completed: capture-only leaves
    // pre-run-config.json on disk with no restore-verified marker, exactly the state a
    // SIGKILL after capture (but before restore) would leave behind.
    await runHistoricalPerformanceBackfill(h.deps(), "capture-only");
    expect(existsSync(join(h.runtimeDir, "pre-run-config.json"))).toBe(true);
    expect(existsSync(join(h.runtimeDir, "restore-verified"))).toBe(false);

    const callsBeforeRestore = h.cli.calls().length;
    const restoreEvidence = await runHistoricalPerformanceBackfill(h.deps(), "restore");
    expect((restoreEvidence.restoration as Record<string, unknown>).verified).toBe(true);
    expect(existsSync(join(h.runtimeDir, "restore-verified"))).toBe(true);
    expect(existsSync(join(h.evidenceDir, "restore-after-cancel.json"))).toBe(true);
    expect(h.cli.calls().length).toBeGreaterThan(callsBeforeRestore);

    const callsBeforeSecondRestore = h.cli.calls().length;
    const secondEvidence = await runHistoricalPerformanceBackfill(h.deps(), "restore");
    expect(secondEvidence.noop).toBe(true);
    expect(h.cli.calls().length).toBe(callsBeforeSecondRestore); // no new CLI calls: idempotent no-op
  });
});

describe("runHistoricalPerformanceBackfill — dry run", () => {
  it("captures and proves the restore plan but performs no mutation", async () => {
    const h = createHarness();
    seedState(h.cli, currentRestoreValues());
    const { fetch, postCount } = createFakeFetch();
    const deps = h.deps({ G7_DRY_RUN: "1" }, fetch);

    const evidence = await runHistoricalPerformanceBackfill(deps, "default");
    expect(evidence.dryRun).toBe(true);
    expect(evidence.verdict).toBe("pass");
    expect(postCount()).toBe(0);
    expect(h.cli.calls()).toEqual([["secrets", "list", "--project-ref", EXPECTED_PROJECT_REF]]);
  });
});

describe("evidence never carries raw command stdout", () => {
  it("capture-only evidence has no stdout key anywhere", async () => {
    const h = createHarness();
    seedState(h.cli, { SPORTSMONKS_API_TOKEN: "provider-token-value" });
    const evidence = await runHistoricalPerformanceBackfill(h.deps(), "capture-only");
    assertNoStdoutLeak(evidence);
    const written = JSON.parse(
      readFileSync(join(h.evidenceDir, "g7-historical-performance-backfill-capture.json"), "utf8"),
    );
    assertNoStdoutLeak(written);
  });

  it("dry-run evidence has no stdout key anywhere", async () => {
    const h = createHarness();
    seedState(h.cli, currentRestoreValues());
    const { fetch } = createFakeFetch();
    const evidence = await runHistoricalPerformanceBackfill(
      h.deps({ G7_DRY_RUN: "1" }, fetch),
      "default",
    );
    assertNoStdoutLeak(evidence);
  });

  it("the default success path's commands array — including season-configuration — has no stdout key", async () => {
    const h = createHarness();
    seedState(h.cli, currentRestoreValues());
    const { fetch } = createFakeFetch();
    const evidence = await runHistoricalPerformanceBackfill(h.deps({}, fetch), "default");
    expect((evidence.commands as unknown[]).length).toBeGreaterThan(0);
    assertNoStdoutLeak(evidence);

    const written = JSON.parse(
      readFileSync(join(h.evidenceDir, "g7-historical-performance-backfill-result.json"), "utf8"),
    );
    assertNoStdoutLeak(written);
    for (const command of written.commands as Record<string, unknown>[]) {
      expect(Object.keys(command).sort()).toEqual(["exitCode", "operation"]);
    }
  });

  it("the mid-run-failure result file's commands array has no stdout key", async () => {
    const h = createHarness();
    seedState(h.cli, currentRestoreValues());
    const { fetch } = createFakeFetch({ failFirstBatch: true });
    await expect(runHistoricalPerformanceBackfill(h.deps({}, fetch), "default")).rejects.toThrow();
    const written = JSON.parse(
      readFileSync(join(h.evidenceDir, "g7-historical-performance-backfill-result.json"), "utf8"),
    );
    assertNoStdoutLeak(written);
  });

  it("--restore evidence (returned and restore-after-cancel.json) has no stdout key", async () => {
    const h = createHarness();
    seedState(h.cli, currentRestoreValues());
    await runHistoricalPerformanceBackfill(h.deps(), "capture-only");
    const restoreEvidence = await runHistoricalPerformanceBackfill(h.deps(), "restore");
    assertNoStdoutLeak(restoreEvidence);
    const written = JSON.parse(
      readFileSync(join(h.evidenceDir, "restore-after-cancel.json"), "utf8"),
    );
    assertNoStdoutLeak(written);
  });

  it("--restore-only evidence (returned and restore-only-result.json) has no stdout key", async () => {
    const h = createHarness();
    seedState(h.cli, currentRestoreValues());
    const evidence = await runHistoricalPerformanceBackfill(h.deps(), "restore-only");
    assertNoStdoutLeak(evidence);
    const written = JSON.parse(
      readFileSync(join(h.evidenceDir, "restore-only-result.json"), "utf8"),
    );
    assertNoStdoutLeak(written);
  });
});

describe("MANAGED_SECRET_NAMES", () => {
  it("has exactly the 15 documented names", () => {
    expect(MANAGED_SECRET_NAMES).toHaveLength(15);
    expect(new Set(MANAGED_SECRET_NAMES).size).toBe(15);
  });
});

describe("HistoricalPerformanceBackfillError", () => {
  it("carries its code as both name-adjacent message and .code", () => {
    const error = new HistoricalPerformanceBackfillError("some_code");
    expect(error.code).toBe("some_code");
    expect(error.message).toBe("some_code");
  });
});

// ---------------------------------------------------------------------------
// BG-0033-OWNER-3 regression tests: Defect 1 (fingerprintMatches accepted the digest itself as
// plaintext) and Defect 2 (post-restore verification compared against what was just supplied,
// not the original pre-run baseline).
// ---------------------------------------------------------------------------

/** Recursively collects {path, content} for every regular file under `dir`. */
function readAllFiles(dir: string): Array<{ path: string; content: string }> {
  const results: Array<{ path: string; content: string }> = [];
  for (const entry of readdirSync(dir)) {
    const entryPath = join(dir, entry);
    if (statSync(entryPath).isDirectory()) {
      results.push(...readAllFiles(entryPath));
    } else {
      results.push({ path: entryPath, content: readFileSync(entryPath, "utf8") });
    }
  }
  return results;
}

/**
 * A fake Supabase CLI identical to createFakeCli, except its `secrets list` output, from the
 * FIRST `list` call issued after any `set` call has run, replaces the digest of `corruptedName`
 * with `corruptedFingerprint` instead of the value's real sha256. This models the post-restore
 * verification step observing a fingerprint that is unrelated to the true original captured
 * digest — e.g. a stale/incorrect backend response — while the initial pre-run capture (the
 * FIRST `list` call, before any `set`) still reports the real, correct digest.
 */
function createFakeCliWithVerificationDrift(
  dir: string,
  corruptedName: string,
  corruptedFingerprint: string,
): FakeCli {
  const cliPath = join(dir, "fake-supabase-drift");
  const stateFile = join(dir, "state.json");
  const callLogFile = join(dir, "calls.jsonl");
  const setHappenedFile = join(dir, "set-happened");
  writeFileSync(stateFile, "{}");
  writeFileSync(callLogFile, "");
  const script = `#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const stateFile = ${JSON.stringify(stateFile)};
const callLog = ${JSON.stringify(callLogFile)};
const setHappenedFile = ${JSON.stringify(setHappenedFile)};
const corruptedName = ${JSON.stringify(corruptedName)};
const corruptedFingerprint = ${JSON.stringify(corruptedFingerprint)};
function sha256(v) { return createHash("sha256").update(v, "utf8").digest("hex"); }
function loadState() { return JSON.parse(readFileSync(stateFile, "utf8")); }
function saveState(s) { writeFileSync(stateFile, JSON.stringify(s)); }
appendFileSync(callLog, JSON.stringify(args) + "\\n");
const [group, sub, ...rest] = args;
if (group !== "secrets") { console.error("FAKE_CLI_UNSUPPORTED"); process.exit(1); }
if (sub === "list") {
  const state = loadState();
  const afterSet = existsSync(setHappenedFile);
  const lines = ["NAME | DIGEST"];
  for (const name of Object.keys(state).sort()) {
    const digest = (afterSet && name === corruptedName) ? corruptedFingerprint : state[name];
    lines.push(\`\${name} | \${digest}\`);
  }
  console.log(lines.join("\\n"));
  process.exit(0);
}
if (sub === "set") {
  const envFileIndex = rest.indexOf("--env-file");
  const envFile = rest[envFileIndex + 1];
  const content = readFileSync(envFile, "utf8");
  const state = loadState();
  for (const line of content.split("\\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    const name = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    state[name] = sha256(value);
  }
  saveState(state);
  writeFileSync(setHappenedFile, "1");
  process.exit(0);
}
if (sub === "unset") {
  const projectIndex = rest.indexOf("--project-ref");
  const names = projectIndex === -1 ? rest : rest.slice(0, projectIndex);
  if (names.length === 0) { console.error("FAKE_CLI_REFUSING_ZERO_NAME_UNSET"); process.exit(1); }
  const state = loadState();
  for (const name of names) delete state[name];
  saveState(state);
  process.exit(0);
}
console.error("FAKE_CLI_UNSUPPORTED_SUBCOMMAND");
process.exit(1);
`;
  writeFileSync(cliPath, script);
  chmodSync(cliPath, 0o755);
  return {
    cliPath,
    stateFile,
    callLogFile,
    calls: () =>
      readFileSync(callLogFile, "utf8")
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as string[]),
    state: () => JSON.parse(readFileSync(stateFile, "utf8")) as Record<string, string>,
  };
}

describe("capture-only diagnostic confirmation is mode-scoped, never a mutation bypass", () => {
  it("accepts CAPTURE_ONLY_DIAGNOSTIC_CONFIRMATION for --capture-only", async () => {
    const h = createHarness();
    seedState(h.cli, { SPORTSMONKS_API_TOKEN: "provider-token-value" });
    const deps = h.deps({ CONFIRMATION: CAPTURE_ONLY_DIAGNOSTIC_CONFIRMATION });
    const evidence = await runHistoricalPerformanceBackfill(deps, "capture-only");
    expect(evidence.verdict).toBe("pass");
  });

  it("still accepts the shared CONFIRMATION for --capture-only (the main workflow's own internal capture step)", async () => {
    const h = createHarness();
    seedState(h.cli, { SPORTSMONKS_API_TOKEN: "provider-token-value" });
    const deps = h.deps(); // default harness CONFIRMATION is the shared one
    const evidence = await runHistoricalPerformanceBackfill(deps, "capture-only");
    expect(evidence.verdict).toBe("pass");
  });

  it("REJECTS the diagnostic-only confirmation for every mutating mode (default, restore, restore-only)", async () => {
    for (const mode of ["default", "restore", "restore-only"] as const) {
      const h = createHarness();
      seedState(h.cli, currentRestoreValues());
      const deps = h.deps({ CONFIRMATION: CAPTURE_ONLY_DIAGNOSTIC_CONFIRMATION });
      await expect(runHistoricalPerformanceBackfill(deps, mode)).rejects.toThrow(
        "production_runner_guard_failed",
      );
      expect(h.cli.calls()).toEqual([]);
    }
  });
});

describe("Defect 1 correction — fingerprintMatches never accepts a digest as plaintext", () => {
  it("1. a correct original plaintext value passes fingerprintMatches and restoration proceeds", async () => {
    const h = createHarness();
    seedState(h.cli, currentRestoreValues()); // trigger absent pre-run
    const deps = h.deps({ G7_DRY_RUN: "1" }); // dry run still runs buildRestorePlan's proof
    const evidence = await runHistoricalPerformanceBackfill(deps, "default");
    expect(evidence.verdict).toBe("pass");
    expect(evidence.dryRun).toBe(true);
    // The proof succeeded for every present managed secret, including a genuine sha256Hex match.
    expect(h.cli.calls()).toEqual([["secrets", "list", "--project-ref", EXPECTED_PROJECT_REF]]);
  });

  it("2. an incorrect restore value fails BEFORE any mutation (no set/unset ever invoked)", async () => {
    const h = createHarness();
    seedState(h.cli, {
      ...currentRestoreValues(),
      // The live FOOTBALL_SPORTSMONKS_LEAGUE_ID digest does not correspond to the constant "860"
      // the runner will supply, so the proof must fail before anything is written.
      FOOTBALL_SPORTSMONKS_LEAGUE_ID: "not-eight-sixty",
    });
    const deps = h.deps();
    await expect(runHistoricalPerformanceBackfill(deps, "default")).rejects.toThrow(
      "production_config_restore_unprovable",
    );
    const calls = h.cli.calls();
    expect(calls).toEqual([["secrets", "list", "--project-ref", EXPECTED_PROJECT_REF]]);
    expect(calls.some((call) => call[1] === "set" || call[1] === "unset")).toBe(false);
  });

  it("3. REGRESSION: supplying the captured digest itself as the restore value fails, not passes", async () => {
    const h = createHarness();
    // Seed every managed secret EXCEPT SPORTSMONKS_API_TOKEN with correct real digests.
    const { SPORTSMONKS_API_TOKEN: _unused, ...otherRestoreValues } = currentRestoreValues();
    seedState(h.cli, otherRestoreValues);

    // The real (never-supplied) original plaintext, and its digest as `secrets list` would report it.
    const realTokenValue = "the-actual-original-provider-token-plaintext";
    const capturedDigest = sha256Hex(realTokenValue);
    const state = h.cli.state();
    state.SPORTSMONKS_API_TOKEN = capturedDigest;
    writeFileSync(h.cli.stateFile, JSON.stringify(state));

    // The regression: an operator supplies the DIGEST ITSELF as the "restore value", instead of
    // the real plaintext. Under the pre-fix `fingerprintMatches` (`sha256Hex(x) === fp || x ===
    // fp`), `capturedDigest === capturedDigest` would have trivially and INCORRECTLY passed.
    expect(capturedDigest).toBe(capturedDigest); // the old code's accepted (buggy) condition
    expect(sha256Hex(capturedDigest)).not.toBe(capturedDigest); // the fixed code's condition

    const deps = h.deps({ SPORTSMONKS_API_TOKEN: capturedDigest });
    await expect(runHistoricalPerformanceBackfill(deps, "default")).rejects.toThrow(
      "production_config_restore_unprovable",
    );
    expect(h.cli.calls()).toEqual([["secrets", "list", "--project-ref", EXPECTED_PROJECT_REF]]);
  });
});

describe("Defect 2 correction — post-restore verification compares against the ORIGINAL baseline", () => {
  it("4. REGRESSION: a post-restore fingerprint that differs from the original baseline fails verification, even when it matches plan.setValues", async () => {
    const base = tempDir("botolago-g7-drift-");
    const runtimeDir = join(base, "runtime");
    const evidenceDir = join(base, "evidence");
    mkdirSync(runtimeDir, { recursive: true });
    mkdirSync(evidenceDir, { recursive: true });
    writeManifest(evidenceDir);
    const githubEnvFile = join(base, "github-env");
    writeFileSync(githubEnvFile, "");

    // The corrupted post-restore digest is set to the exact literal plaintext ("860") that
    // buildRestorePlan supplies for FOOTBALL_SPORTSMONKS_LEAGUE_ID. Under the PRE-FIX
    // performRestore (which verified via `fingerprintMatches(plan.setValues[name],
    // observedFingerprint)`), `"860" === "860"` would have matched via the very same
    // plaintext-equality fallback Defect 1 removed — "matching plan.setValues" — even though it is
    // nowhere close to the real sha256 digest ORIGINALLY captured for this name pre-run.
    const cli = createFakeCliWithVerificationDrift(base, "FOOTBALL_SPORTSMONKS_LEAGUE_ID", "860");
    seedState(cli, currentRestoreValues()); // trigger absent pre-run

    const deps: RunnerDependencies = {
      env: {
        GITHUB_ACTIONS: "true",
        CONFIRMATION: "RUN_G7_TWO_SEASON_HISTORICAL_PERFORMANCE_BACKFILL",
        EXPECTED_PROJECT_REF,
        EXPECTED_COMMIT,
        GITHUB_SHA: EXPECTED_COMMIT,
        G7_BACKFILL_RUNTIME_DIR: runtimeDir,
        G7_BACKFILL_EVIDENCE_DIR: evidenceDir,
        G7_SEASON_IDS: "26027",
        SPORTSMONKS_API_TOKEN: "provider-token-value",
        SUPABASE_SECRET_KEY: "secret-key-value",
        GITHUB_ENV: githubEnvFile,
        ...CURRENT_RUNTIME_INPUTS,
      },
      cliPath: cli.cliPath,
      fetch: createFakeFetch().fetch,
      now: () => new Date("2026-09-18T00:00:00Z"),
      writeFile: async (path, content) => {
        writeFileSync(path, content, { mode: 0o600 });
        chmodSync(path, 0o600);
      },
    };

    await expect(runHistoricalPerformanceBackfill(deps, "restore-only")).rejects.toThrow(
      "production_config_restore_unverified",
    );

    const written = JSON.parse(
      readFileSync(join(evidenceDir, "restore-only-result.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(written.verdict).toBe("fail");
    const restoration = written.restoration as Record<string, unknown>;
    expect(restoration.verified).toBe(false);
    const perName = restoration.perName as Array<Record<string, unknown>>;
    const corrupted = perName.find((row) => row.name === "FOOTBALL_SPORTSMONKS_LEAGUE_ID")!;
    expect(corrupted.expectedPresent).toBe(true);
    expect(corrupted.observedPresent).toBe(true);
    expect(corrupted.fingerprintMatched).toBe(false);
  });
});

describe("Originally-absent secrets stay absent after restoration", () => {
  it("5. a key captured as present:false is confirmed absent after restoration, and only unset (never set) is called for it", async () => {
    const h = createHarness();
    // Every managed secret is seeded EXCEPT FOOTBALL_SPORTSMONKS_COUNTRY_CODE (and the trigger,
    // which is always absent in currentRestoreValues()): it was never present in production.
    const { FOOTBALL_SPORTSMONKS_COUNTRY_CODE: _unused, ...partialRestoreValues } =
      currentRestoreValues();
    seedState(h.cli, partialRestoreValues);

    const deps = h.deps();
    const evidence = await runHistoricalPerformanceBackfill(deps, "restore-only");
    expect(evidence.verdict).toBe("pass");
    const restoration = evidence.restoration as Record<string, unknown>;
    expect(restoration.verified).toBe(true);
    const perName = restoration.perName as Array<Record<string, unknown>>;
    const countryCode = perName.find((row) => row.name === "FOOTBALL_SPORTSMONKS_COUNTRY_CODE")!;
    expect(countryCode.expectedPresent).toBe(false);
    expect(countryCode.observedPresent).toBe(false);
    expect(countryCode.fingerprintMatched).toBeNull();

    // It must have been unset, and never set.
    const unsetCall = h.cli.calls().find((call) => call[1] === "unset");
    expect(unsetCall).toContain("FOOTBALL_SPORTSMONKS_COUNTRY_CODE");
    const restoreEnv = readFileSync(join(h.runtimeDir, "restore-production-config.env"), "utf8");
    expect(restoreEnv).not.toContain("FOOTBALL_SPORTSMONKS_COUNTRY_CODE");

    // It is genuinely absent from the live (fake) CLI state after restoration.
    expect(Object.hasOwn(h.cli.state(), "FOOTBALL_SPORTSMONKS_COUNTRY_CODE")).toBe(false);
  });
});

describe("Evidence never carries a plaintext secret value", () => {
  it("6. no file written to the evidence directory across capture/restore/verify contains a known test plaintext value", async () => {
    const h = createHarness();
    seedState(h.cli, {
      ...currentRestoreValues(),
      FOOTBALL_INGESTION_TRIGGER_SECRET: "live-trigger-value-for-leak-check",
    });
    const { fetch } = createFakeFetch();
    const deps = h.deps({ G7_CURRENT_TRIGGER_SECRET: "live-trigger-value-for-leak-check" }, fetch);

    const evidence = await runHistoricalPerformanceBackfill(deps, "default");
    expect(evidence.verdict).toBe("pass");

    const knownPlaintextSecrets = [
      "provider-token-value", // SPORTSMONKS_API_TOKEN
      "live-trigger-value-for-leak-check", // FOOTBALL_INGESTION_TRIGGER_SECRET / G7_CURRENT_TRIGGER_SECRET
      "secret-key-value", // SUPABASE_SECRET_KEY
    ];

    // The returned evidence object (what a caller would serialize/upload) must be clean.
    const evidenceText = JSON.stringify(evidence);
    for (const plaintext of knownPlaintextSecrets) {
      expect(evidenceText).not.toContain(plaintext);
    }

    // Every file actually written into the EVIDENCE directory (as opposed to the runtime
    // directory, which by design transiently holds real env files consumed by `secrets set` and
    // is deleted by the workflow's cleanup step before anything is uploaded) must also be clean.
    for (const file of readAllFiles(h.evidenceDir)) {
      for (const plaintext of knownPlaintextSecrets) {
        expect(file.content).not.toContain(plaintext);
      }
    }
  });
});
