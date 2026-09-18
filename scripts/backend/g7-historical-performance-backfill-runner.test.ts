import { afterEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
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
      performanceRows: 196,
      excludedIncompleteRows: 2,
      excludedMappingRows: 1,
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
          performanceRows: 100,
          excludedIncompleteRows: 0,
          excludedMappingRows: 0,
          nextCursor: "19470000",
          hasMore: true,
          counters: { validated: 100, rejected: 0 },
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
      ),
    ).toThrow("historical_rating_derivation_mismatch");
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
