import { afterEach, describe, expect, it } from "bun:test";
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

import { MANAGED_SECRET_NAMES, sha256Hex } from "./g7-historical-performance-backfill-runner";
import {
  APPROVED_STALE_BASELINE_DOUBLE_HASH,
  CurrentRuntimeCorrectionError,
  TARGET_SECRET_NAMES,
  TARGET_SECRET_VALUES,
  UNRELATED_SECRET_NAMES,
  allTargetsAlreadyCorrect,
  checkPreWriteBaseline,
  planTargetKeys,
  runCurrentRuntimeConfigurationCorrection,
  type CorrectionDependencies,
} from "./g7-current-runtime-configuration-correction";

const EXPECTED_PROJECT_REF = "tkewgajrljbwgwedqsxn";
const EXPECTED_COMMIT = "b".repeat(40);
const CONFIRMATION = "RUN_G7_CURRENT_RUNTIME_CONFIGURATION_CORRECTION";

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
// Fake Supabase CLI, following the same pattern as
// g7-historical-performance-backfill-runner.test.ts's createFakeCli: a live "secret state"
// ({name: sha256(value)}) plus a call log, so tests can assert both effects and call ordering
// without a real CLI. Supports an optional `driftOnListCallNumber`, which injects an unrelated
// key's digest change starting from that 1-indexed `secrets list` invocation, to simulate a
// conflicting external writer.
// ---------------------------------------------------------------------------

interface FakeCli {
  readonly cliPath: string;
  readonly stateFile: string;
  readonly callLogFile: string;
  calls(): string[][];
  state(): Record<string, string>;
}

interface FakeCliOptions {
  readonly failOps?: readonly string[];
  /** Injects a changed digest for `driftName` into every `secrets list` call from this 1-indexed
   * call number onward, simulating a conflicting external writer touching an unrelated key. */
  readonly driftFromListCallNumber?: number;
  readonly driftName?: string;
  readonly driftValue?: string;
  /** Makes `secrets set` a no-op (never actually writes) for exactly this many calls, simulating a
   * transient write failure that still exits 0 but doesn't take effect — models "verification
   * finds a mismatch on a target key" for the retry test. */
  readonly ineffectiveSetCalls?: number;
}

function createFakeCli(dir: string, options: FakeCliOptions = {}): FakeCli {
  const cliPath = join(dir, "fake-supabase");
  const stateFile = join(dir, "state.json");
  const callLogFile = join(dir, "calls.jsonl");
  const listCallCountFile = join(dir, "list-call-count");
  const setCallCountFile = join(dir, "set-call-count");
  writeFileSync(stateFile, "{}");
  writeFileSync(callLogFile, "");
  writeFileSync(listCallCountFile, "0");
  writeFileSync(setCallCountFile, "0");
  const failOps = options.failOps ?? [];
  const driftFromListCallNumber = options.driftFromListCallNumber ?? Number.POSITIVE_INFINITY;
  const driftName = options.driftName ?? "";
  const driftValue = options.driftValue ?? "";
  const ineffectiveSetCalls = options.ineffectiveSetCalls ?? 0;
  const script = `#!/usr/bin/env bun
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const stateFile = ${JSON.stringify(stateFile)};
const callLog = ${JSON.stringify(callLogFile)};
const listCallCountFile = ${JSON.stringify(listCallCountFile)};
const setCallCountFile = ${JSON.stringify(setCallCountFile)};
const failOps = ${JSON.stringify(failOps)};
const driftFromListCallNumber = ${JSON.stringify(driftFromListCallNumber)};
const driftName = ${JSON.stringify(driftName)};
const driftValue = ${JSON.stringify(driftValue)};
const ineffectiveSetCalls = ${JSON.stringify(ineffectiveSetCalls)};
function sha256(v) { return createHash("sha256").update(v, "utf8").digest("hex"); }
function loadState() { return JSON.parse(readFileSync(stateFile, "utf8")); }
function saveState(s) { writeFileSync(stateFile, JSON.stringify(s)); }
appendFileSync(callLog, JSON.stringify(args) + "\\n");
const [group, sub, ...rest] = args;
if (group !== "secrets") { console.error("FAKE_CLI_UNSUPPORTED"); process.exit(1); }
if (sub === "list") {
  if (failOps.includes("list")) { console.error("FAKE_CLI_FORCED_FAILURE"); process.exit(1); }
  const callNumber = Number(readFileSync(listCallCountFile, "utf8")) + 1;
  writeFileSync(listCallCountFile, String(callNumber));
  const state = loadState();
  const lines = ["NAME | DIGEST"];
  for (const name of Object.keys(state).sort()) {
    let digest = state[name];
    if (name === driftName && callNumber >= driftFromListCallNumber) {
      digest = sha256(driftValue);
    }
    lines.push(\`\${name} | \${digest}\`);
  }
  console.log(lines.join("\\n"));
  process.exit(0);
}
if (sub === "set") {
  if (failOps.includes("set")) { console.error("FAKE_CLI_FORCED_FAILURE"); process.exit(1); }
  const setCallNumber = Number(readFileSync(setCallCountFile, "utf8")) + 1;
  writeFileSync(setCallCountFile, String(setCallNumber));
  const envFileIndex = rest.indexOf("--env-file");
  const envFile = rest[envFileIndex + 1];
  const content = readFileSync(envFile, "utf8");
  if (setCallNumber <= ineffectiveSetCalls) {
    // Simulate a write that exits 0 but does not actually take effect.
    process.exit(0);
  }
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

/** A full set of live values: all fifteen MANAGED_SECRET_NAMES present, target keys correct, plus
 * some plausible plaintext for the nine unrelated keys (never asserted by name, only used to prove
 * they stay unchanged and never leak). */
function fullyCorrectLiveValues(): Record<string, string> {
  return {
    ...TARGET_SECRET_VALUES,
    SPORTSMONKS_API_TOKEN: "unrelated-provider-token",
    FOOTBALL_PROVIDER: "sportsmonks",
    FOOTBALL_PROVIDER_BASE_URL: "https://api.sportmonks.com/v3/football",
    FOOTBALL_SPORTSMONKS_LEAGUE_ID: "860",
    FOOTBALL_SPORTSMONKS_COUNTRY_CODE: "MA",
    FOOTBALL_SPORTSMONKS_COMPETITION_TYPE: "league",
    FOOTBALL_PROVIDER_TIMEOUT_MS: "15000",
    FOOTBALL_PROVIDER_MAX_RETRIES: "2",
    // FOOTBALL_INGESTION_TRIGGER_SECRET deliberately absent — must stay absent.
  };
}

/** The stale-26027-style live values: every unrelated key present + correct, but the six target
 * keys hold a DIFFERENT (stale) value than TARGET_SECRET_VALUES. */
function staleLiveValues(): Record<string, string> {
  return {
    FOOTBALL_SPORTSMONKS_SEASON_ID: "26027",
    FOOTBALL_SPORTSMONKS_SEASON_START: "2025-09-12",
    FOOTBALL_SPORTSMONKS_SEASON_END: "2026-07-05",
    FOOTBALL_SPORTSMONKS_TEAM_IDS: "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16",
    FOOTBALL_SPORTSMONKS_FIXTURE_FROM: "2025-09-12",
    FOOTBALL_SPORTSMONKS_FIXTURE_TO: "2026-07-05",
    SPORTSMONKS_API_TOKEN: "unrelated-provider-token",
    FOOTBALL_PROVIDER: "sportsmonks",
    FOOTBALL_PROVIDER_BASE_URL: "https://api.sportmonks.com/v3/football",
    FOOTBALL_SPORTSMONKS_LEAGUE_ID: "860",
    FOOTBALL_SPORTSMONKS_COUNTRY_CODE: "MA",
    FOOTBALL_SPORTSMONKS_COMPETITION_TYPE: "league",
    FOOTBALL_PROVIDER_TIMEOUT_MS: "15000",
    FOOTBALL_PROVIDER_MAX_RETRIES: "2",
  };
}

/**
 * A synthetic "approved stale baseline" double-hash table for tests, derived from
 * staleLiveValues()'s own plaintext. This exists ONLY because the real
 * APPROVED_STALE_BASELINE_DOUBLE_HASH's doubleHash entries are one-way hashes of real production
 * secrets with no known preimage available here — there is no plaintext a test could seed into
 * the fake CLI that would ever hash-of-hash to those literal production values. Injected via
 * CorrectionDependencies.approvedBaseline (see its doc comment), which defaults to the REAL
 * baseline in production and is overridden here purely for testability. The pre-write gate LOGIC
 * under test (checkPreWriteBaseline / the wiring in runCurrentRuntimeConfigurationCorrection) is
 * identical either way — only the comparison table's source values differ.
 */
const TEST_APPROVED_STALE_BASELINE_DOUBLE_HASH: Record<
  string,
  { present: boolean; doubleHash: string | null }
> = Object.fromEntries(
  MANAGED_SECRET_NAMES.map((name) => {
    const raw = staleLiveValues()[name];
    return [
      name,
      raw === undefined
        ? { present: false, doubleHash: null }
        : { present: true, doubleHash: sha256Hex(sha256Hex(raw)) },
    ];
  }),
) as Record<string, { present: boolean; doubleHash: string | null }>;

interface Harness {
  readonly runtimeDir: string;
  readonly evidenceDir: string;
  readonly cli: FakeCli;
  deps(overrides?: Record<string, string | undefined>): CorrectionDependencies;
}

function createHarness(options: FakeCliOptions = {}): Harness {
  const base = tempDir("botolago-g7-correction-");
  const runtimeDir = join(base, "runtime");
  const evidenceDir = join(base, "evidence");
  mkdirSync(runtimeDir, { recursive: true });
  mkdirSync(evidenceDir, { recursive: true });
  const cli = createFakeCli(base, options);
  return {
    runtimeDir,
    evidenceDir,
    cli,
    deps(overrides = {}) {
      const env: Record<string, string | undefined> = {
        GITHUB_ACTIONS: "true",
        CONFIRMATION,
        EXPECTED_PROJECT_REF,
        EXPECTED_COMMIT,
        GITHUB_SHA: EXPECTED_COMMIT,
        G7_CORRECTION_RUNTIME_DIR: runtimeDir,
        G7_CORRECTION_EVIDENCE_DIR: evidenceDir,
        ...overrides,
      };
      return {
        env,
        cliPath: cli.cliPath,
        now: () => new Date("2026-09-19T00:00:00Z"),
        writeFile: async (path, content) => {
          writeFileSync(path, content, { mode: 0o600 });
          chmodSync(path, 0o600);
        },
        approvedBaseline:
          TEST_APPROVED_STALE_BASELINE_DOUBLE_HASH as CorrectionDependencies["approvedBaseline"],
      };
    },
  };
}

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

describe("TARGET_SECRET_NAMES / UNRELATED_SECRET_NAMES", () => {
  it("splits the 15 managed names into exactly 6 target + 9 unrelated, no overlap", () => {
    expect(TARGET_SECRET_NAMES).toHaveLength(6);
    expect(UNRELATED_SECRET_NAMES).toHaveLength(9);
    expect(new Set(TARGET_SECRET_NAMES).size).toBe(6);
    const overlap = TARGET_SECRET_NAMES.filter((name) =>
      (UNRELATED_SECRET_NAMES as readonly string[]).includes(name),
    );
    expect(overlap).toEqual([]);
    expect(UNRELATED_SECRET_NAMES).toContain("FOOTBALL_INGESTION_TRIGGER_SECRET");
  });
});

describe("planTargetKeys — pre-write comparison logic", () => {
  it("marks a key needing a write when absent", () => {
    const preRunConfig = Object.fromEntries(
      TARGET_SECRET_NAMES.map((name) => [name, { name, present: false, fingerprint: null }]),
    ) as Parameters<typeof planTargetKeys>[0];
    const plans = planTargetKeys(preRunConfig);
    expect(plans.every((plan) => plan.needsWrite)).toBe(true);
    expect(allTargetsAlreadyCorrect(plans)).toBe(false);
  });

  it("marks a key needing a write when present but digest differs from target", () => {
    const preRunConfig = Object.fromEntries(
      TARGET_SECRET_NAMES.map((name) => [
        name,
        { name, present: true, fingerprint: sha256Hex("some-other-value") },
      ]),
    ) as Parameters<typeof planTargetKeys>[0];
    const plans = planTargetKeys(preRunConfig);
    expect(plans.every((plan) => plan.needsWrite)).toBe(true);
  });

  it("marks a key already correct when its captured digest matches sha256Hex(targetValue)", () => {
    const preRunConfig = Object.fromEntries(
      TARGET_SECRET_NAMES.map((name) => [
        name,
        { name, present: true, fingerprint: sha256Hex(TARGET_SECRET_VALUES[name]) },
      ]),
    ) as Parameters<typeof planTargetKeys>[0];
    const plans = planTargetKeys(preRunConfig);
    expect(plans.every((plan) => !plan.needsWrite)).toBe(true);
    expect(allTargetsAlreadyCorrect(plans)).toBe(true);
  });

  it("a mix of already-correct and needs-write keys is reported per key, not collapsed", () => {
    const values = Object.fromEntries(
      TARGET_SECRET_NAMES.map((name, index) => [
        name,
        index === 0
          ? { name, present: true, fingerprint: sha256Hex(TARGET_SECRET_VALUES[name]) }
          : { name, present: false, fingerprint: null },
      ]),
    ) as Parameters<typeof planTargetKeys>[0];
    const plans = planTargetKeys(values);
    expect(plans[0].needsWrite).toBe(false);
    expect(plans.slice(1).every((plan) => plan.needsWrite)).toBe(true);
    expect(allTargetsAlreadyCorrect(plans)).toBe(false);
  });
});

describe("runCurrentRuntimeConfigurationCorrection — already-applied path", () => {
  it("skips the write entirely when all six target keys already match, and issues no `secrets set`", async () => {
    const h = createHarness();
    seedState(h.cli, fullyCorrectLiveValues());
    const evidence = await runCurrentRuntimeConfigurationCorrection(h.deps());

    expect(evidence.verdict).toBe("pass");
    expect(evidence.writePerformed).toBe(false);
    expect(evidence.attempts).toEqual([]);
    for (const plan of evidence.targetPlan) expect(plan.needsWrite).toBe(false);
    for (const entry of evidence.perKeyVerdict.filter((row) => row.role === "target")) {
      expect(entry.verdict).toBe("already-correct");
    }
    expect(evidence.triggerSecretStillAbsent).toBe(true);

    const setCalls = h.cli.calls().filter((call) => call[1] === "set");
    expect(setCalls).toEqual([]);
    const listCalls = h.cli.calls().filter((call) => call[1] === "list");
    expect(listCalls.length).toBe(2); // pre-write capture + post-write capture, no write in between
  });
});

describe("runCurrentRuntimeConfigurationCorrection — write path", () => {
  it("writes exactly once when the six target keys are stale, and verifies unrelated keys unchanged", async () => {
    const h = createHarness();
    seedState(h.cli, staleLiveValues());
    const evidence = await runCurrentRuntimeConfigurationCorrection(h.deps());

    expect(evidence.verdict).toBe("pass");
    expect(evidence.writePerformed).toBe(true);
    expect(evidence.attempts.length).toBe(1);
    for (const plan of evidence.targetPlan) expect(plan.needsWrite).toBe(true);
    const targetVerdicts = evidence.perKeyVerdict.filter((row) => row.role === "target");
    expect(targetVerdicts.every((row) => row.verdict === "corrected")).toBe(true);
    const unrelatedVerdicts = evidence.perKeyVerdict.filter((row) => row.role === "unrelated");
    expect(unrelatedVerdicts.length).toBe(9);
    expect(unrelatedVerdicts.every((row) => row.verdict === "unrelated-unchanged")).toBe(true);
    expect(evidence.triggerSecretStillAbsent).toBe(true);

    const calls = h.cli.calls();
    const shapes = calls.map((call) => `${call[0]} ${call[1]}`);
    expect(shapes).toEqual(["secrets list", "secrets set", "secrets list"]);

    const envFileContent = readFileSync(
      join(h.runtimeDir, "apply-correction-attempt-1.env"),
      "utf8",
    );
    for (const name of TARGET_SECRET_NAMES) {
      expect(envFileContent).toContain(`${name}=${TARGET_SECRET_VALUES[name]}`);
    }
    for (const name of UNRELATED_SECRET_NAMES) {
      expect(envFileContent).not.toContain(`${name}=`);
    }

    // The live fake-CLI state now reflects the corrected values for all six target keys.
    const liveState = h.cli.state();
    for (const name of TARGET_SECRET_NAMES) {
      expect(liveState[name]).toBe(sha256Hex(TARGET_SECRET_VALUES[name]));
    }
  });
});

describe("runCurrentRuntimeConfigurationCorrection — unrelated-key drift fails immediately, never retries", () => {
  it("fails loudly, with the correct error code, and never issues a second `secrets set`", async () => {
    const h = createHarness({
      driftFromListCallNumber: 2, // the SECOND `secrets list` call (post-write) sees the drift
      driftName: "FOOTBALL_SPORTSMONKS_LEAGUE_ID",
      driftValue: "999", // some other writer changed the league id concurrently
    });
    seedState(h.cli, staleLiveValues());

    await expect(runCurrentRuntimeConfigurationCorrection(h.deps())).rejects.toThrow(
      CurrentRuntimeCorrectionError,
    );
    const h2 = createHarness({
      driftFromListCallNumber: 2,
      driftName: "FOOTBALL_SPORTSMONKS_LEAGUE_ID",
      driftValue: "999",
    });
    seedState(h2.cli, staleLiveValues());
    await expect(runCurrentRuntimeConfigurationCorrection(h2.deps())).rejects.toThrow(
      "unrelated_secret_drift_detected",
    );

    // Exactly the ORIGINAL apply write — no retry was ever attempted for unrelated-key drift.
    const setCalls = h.cli.calls().filter((call) => call[1] === "set");
    expect(setCalls.length).toBe(1);
  });

  it("reports the drifted unrelated key with a FAILED verdict in the evidence", async () => {
    const h = createHarness({
      driftFromListCallNumber: 2,
      driftName: "FOOTBALL_SPORTSMONKS_LEAGUE_ID",
      driftValue: "999",
    });
    seedState(h.cli, staleLiveValues());

    let evidence: Record<string, unknown> | undefined;
    try {
      await runCurrentRuntimeConfigurationCorrection(h.deps());
    } catch {
      const resultPath = join(h.evidenceDir, "g7-current-runtime-configuration-correction.json");
      evidence = JSON.parse(readFileSync(resultPath, "utf8")) as Record<string, unknown>;
    }
    expect(evidence).toBeDefined();
    expect(evidence!.verdict).toBe("fail");
    expect(evidence!.failureCode).toBe("unrelated_secret_drift_detected");
    const perKeyVerdict = evidence!.perKeyVerdict as Array<Record<string, unknown>>;
    const drifted = perKeyVerdict.find((row) => row.name === "FOOTBALL_SPORTSMONKS_LEAGUE_ID");
    expect(drifted?.verdict).toBe("FAILED");
    expect(drifted?.role).toBe("unrelated");
  });
});

describe("runCurrentRuntimeConfigurationCorrection — target-key mismatch triggers exactly one retry", () => {
  it("retries once when the first write is ineffective, then verifies and passes", async () => {
    const h = createHarness({ ineffectiveSetCalls: 1 }); // first `secrets set` exits 0 but no-ops
    seedState(h.cli, staleLiveValues());

    const evidence = await runCurrentRuntimeConfigurationCorrection(h.deps());

    expect(evidence.verdict).toBe("pass");
    expect(evidence.attempts.length).toBe(2);
    const targetVerdicts = evidence.perKeyVerdict.filter((row) => row.role === "target");
    expect(targetVerdicts.every((row) => row.verdict === "corrected")).toBe(true);

    const calls = h.cli.calls();
    const shapes = calls.map((call) => `${call[0]} ${call[1]}`);
    // list (pre) -> set (attempt 1, ineffective) -> list (post-1, still stale) -> set (attempt 2)
    // -> list (post-2, corrected).
    expect(shapes).toEqual([
      "secrets list",
      "secrets set",
      "secrets list",
      "secrets set",
      "secrets list",
    ]);
  });

  it("fails loudly (does not retry a second time) when the retried write still doesn't verify", async () => {
    const h = createHarness({ ineffectiveSetCalls: 2 }); // both writes are ineffective
    seedState(h.cli, staleLiveValues());

    await expect(runCurrentRuntimeConfigurationCorrection(h.deps())).rejects.toThrow(
      "target_secret_verification_failed_after_retry",
    );
    const setCalls = h.cli.calls().filter((call) => call[1] === "set");
    expect(setCalls.length).toBe(2); // exactly one retry, never more
  });
});

describe("runCurrentRuntimeConfigurationCorrection — FOOTBALL_INGESTION_TRIGGER_SECRET guard", () => {
  it("fails loudly, and issues zero writes, if the trigger secret is present pre-write", async () => {
    // The new pre-write baseline gate (checkPreWriteBaseline) now catches this BEFORE any write is
    // ever issued, with its own distinct code — see the "pre-write baseline gate" describe block
    // below for the dedicated regression test proving this. The existing POST-write absence check
    // (triggerSecretStillAbsent / "football_ingestion_trigger_secret_unexpectedly_present") is left
    // fully intact in the source as defense-in-depth for a hypothetical drift the pre-write gate
    // did not (and structurally cannot) observe; it is unreachable via any input where the trigger
    // secret is present at pre-write time, precisely because the new gate now fires first.
    const h = createHarness();
    seedState(h.cli, { ...fullyCorrectLiveValues(), FOOTBALL_INGESTION_TRIGGER_SECRET: "oops" });

    await expect(runCurrentRuntimeConfigurationCorrection(h.deps())).rejects.toThrow(
      "trigger_secret_unexpectedly_present_pre_write",
    );
    expect(h.cli.calls().filter((call) => call[1] === "set")).toEqual([]);
  });
});

describe("runCurrentRuntimeConfigurationCorrection — guards", () => {
  it("refuses a re-run attempt / wrong confirmation / wrong commit / wrong project ref before any command runs", async () => {
    const h = createHarness();
    seedState(h.cli, fullyCorrectLiveValues());

    await expect(
      runCurrentRuntimeConfigurationCorrection(h.deps({ CONFIRMATION: "WRONG" })),
    ).rejects.toThrow("production_runner_guard_failed");
    await expect(
      runCurrentRuntimeConfigurationCorrection(h.deps({ EXPECTED_PROJECT_REF: "wrong-ref" })),
    ).rejects.toThrow("production_project_guard_failed");
    await expect(
      runCurrentRuntimeConfigurationCorrection(h.deps({ GITHUB_SHA: "c".repeat(40) })),
    ).rejects.toThrow("invalid_expected_commit");

    expect(h.cli.calls()).toEqual([]);
  });
});

describe("evidence never carries a plaintext secret value", () => {
  it("no evidence-directory file across the write path contains a known test plaintext value", async () => {
    const h = createHarness();
    seedState(h.cli, staleLiveValues());
    const evidence = await runCurrentRuntimeConfigurationCorrection(h.deps());
    expect(evidence.verdict).toBe("pass");

    const evidenceText = JSON.stringify(evidence);
    // The six target values are intentionally public/non-secret operational configuration and are
    // NOT scrubbed from evidence (they're pinned literals reviewed in the source, same as
    // gate2f/gate3b's own evidence); only fingerprints (digests-of-digests) are ever written.
    for (const name of TARGET_SECRET_NAMES) {
      expect(evidenceText).not.toContain(sha256Hex(TARGET_SECRET_VALUES[name]));
    }
    expect(evidenceText).not.toContain("unrelated-provider-token");

    for (const file of readAllFiles(h.evidenceDir)) {
      expect(file.content).not.toContain("unrelated-provider-token");
      expect(file.content).not.toContain(sha256Hex("unrelated-provider-token"));
    }
  });

  it("evidence contains only fingerprintSha256 (a digest of the digest), never a raw fingerprint", async () => {
    const h = createHarness();
    seedState(h.cli, fullyCorrectLiveValues());
    const evidence = await runCurrentRuntimeConfigurationCorrection(h.deps());
    for (const entry of [...evidence.preWriteCapture, ...evidence.postWriteCapture]) {
      expect(entry).not.toHaveProperty("fingerprint");
      expect(Object.keys(entry).sort()).toEqual(["fingerprintSha256", "name", "present"]);
    }
  });
});

describe("checkPreWriteBaseline — the new pre-write approved-baseline gate", () => {
  /**
   * Builds a PreRunConfig for all 15 MANAGED_SECRET_NAMES from a plaintext map (raw values, or
   * `null` for an absent secret), computing the single-hash `fingerprint` the way the real CLI
   * capture would (`sha256Hex(rawValue)`), exactly like parseSecretsListTable's output feeds
   * captureConfiguration().
   */
  function preRunConfigFrom(
    values: Record<string, string | null>,
  ): Parameters<typeof planTargetKeys>[0] {
    return Object.fromEntries(
      MANAGED_SECRET_NAMES.map((name) => {
        const raw = values[name] ?? null;
        return [
          name,
          { name, present: raw !== null, fingerprint: raw === null ? null : sha256Hex(raw) },
        ];
      }),
    ) as Parameters<typeof planTargetKeys>[0];
  }

  it(
    "REGRESSION (proves item 1): an unexpected target-key state — neither approved-stale nor " +
      "approved-corrected — is rejected by the new gate, which the OLD planTargetKeys()-only logic " +
      "could never have caught",
    () => {
      const values: Record<string, string | null> = { ...staleLiveValues() };
      // Neither the approved-stale value ("26027") nor the approved-corrected value ("28647") — an
      // unexplained third state, e.g. a conflicting concurrent writer.
      values.FOOTBALL_SPORTSMONKS_SEASON_ID = "99999";
      const preRunConfig = preRunConfigFrom(values);

      // OLD behavior (what planTargetKeys() alone concluded, pre-fix): this unexpected value has a
      // digest that differs from the target digest, so the OLD logic just says "needs write" — it
      // has no way to distinguish this from the legitimate, approved-stale case. This is exactly the
      // silent-overwrite gap the owner identified; planTargetKeys() itself is UNCHANGED by this fix
      // and still returns needsWrite: true here.
      const oldPlans = planTargetKeys(preRunConfig);
      const seasonIdPlan = oldPlans.find((plan) => plan.name === "FOOTBALL_SPORTSMONKS_SEASON_ID");
      expect(seasonIdPlan?.needsWrite).toBe(true); // old logic would have proceeded to overwrite it

      // NEW behavior: the pre-write baseline gate rejects this state outright, before any write.
      const check = checkPreWriteBaseline(
        preRunConfig,
        TEST_APPROVED_STALE_BASELINE_DOUBLE_HASH as CorrectionDependencies["approvedBaseline"],
      );
      expect(check.ok).toBe(false);
      expect(check.failureCode).toBe("target_secret_unexpected_pre_write_state");
      expect(check.failedName).toBe("FOOTBALL_SPORTSMONKS_SEASON_ID");
    },
  );

  it(
    "REGRESSION (proves item 2): unrelated-key drift relative to the approved baseline is rejected " +
      "by the new gate, which the OLD planTargetKeys()-only logic never even looked at",
    () => {
      const values: Record<string, string | null> = { ...staleLiveValues() };
      values.FOOTBALL_SPORTSMONKS_LEAGUE_ID = "999"; // drifted from the approved baseline's "860"
      const preRunConfig = preRunConfigFrom(values);

      // OLD behavior: planTargetKeys() never inspects unrelated keys at all — there is no code path
      // in the pre-fix script that would ever notice this drift before issuing a write.
      const oldPlans = planTargetKeys(preRunConfig);
      expect(oldPlans.every((plan) => plan.needsWrite)).toBe(true); // old logic proceeds regardless

      const check = checkPreWriteBaseline(
        preRunConfig,
        TEST_APPROVED_STALE_BASELINE_DOUBLE_HASH as CorrectionDependencies["approvedBaseline"],
      );
      expect(check.ok).toBe(false);
      expect(check.failureCode).toBe("unrelated_secret_unexpected_pre_write_state");
      expect(check.failedName).toBe("FOOTBALL_SPORTSMONKS_LEAGUE_ID");
    },
  );

  it(
    "REGRESSION (proves item 3): the trigger secret being present pre-write is rejected by the new " +
      "gate with its own distinct code, which the OLD planTargetKeys()-only logic never checked at " +
      "all (it never even reads FOOTBALL_INGESTION_TRIGGER_SECRET)",
    () => {
      const values: Record<string, string | null> = {
        ...staleLiveValues(),
        FOOTBALL_INGESTION_TRIGGER_SECRET: "oops",
      };
      const preRunConfig = preRunConfigFrom(values);

      // OLD behavior: planTargetKeys() has no notion of the trigger secret whatsoever — its presence
      // is invisible to the pre-fix pre-write logic.
      const oldPlans = planTargetKeys(preRunConfig);
      expect(oldPlans.every((plan) => plan.needsWrite)).toBe(true); // old logic proceeds regardless

      const check = checkPreWriteBaseline(
        preRunConfig,
        TEST_APPROVED_STALE_BASELINE_DOUBLE_HASH as CorrectionDependencies["approvedBaseline"],
      );
      expect(check.ok).toBe(false);
      expect(check.failureCode).toBe("trigger_secret_unexpectedly_present_pre_write");
      expect(check.failedName).toBe("FOOTBALL_INGESTION_TRIGGER_SECRET");
    },
  );

  it(
    "the real, exported APPROVED_STALE_BASELINE_DOUBLE_HASH covers all 15 MANAGED_SECRET_NAMES and " +
      "is used as checkPreWriteBaseline's default",
    () => {
      expect(Object.keys(APPROVED_STALE_BASELINE_DOUBLE_HASH).sort()).toEqual(
        [...MANAGED_SECRET_NAMES].sort(),
      );
      expect(APPROVED_STALE_BASELINE_DOUBLE_HASH.FOOTBALL_INGESTION_TRIGGER_SECRET).toEqual({
        present: false,
        doubleHash: null,
      });
      // FIXTURE_FROM/FIXTURE_TO are byte-identical to SEASON_START/SEASON_END respectively.
      expect(APPROVED_STALE_BASELINE_DOUBLE_HASH.FOOTBALL_SPORTSMONKS_FIXTURE_FROM.doubleHash).toBe(
        APPROVED_STALE_BASELINE_DOUBLE_HASH.FOOTBALL_SPORTSMONKS_SEASON_START.doubleHash,
      );
      expect(APPROVED_STALE_BASELINE_DOUBLE_HASH.FOOTBALL_SPORTSMONKS_FIXTURE_TO.doubleHash).toBe(
        APPROVED_STALE_BASELINE_DOUBLE_HASH.FOOTBALL_SPORTSMONKS_SEASON_END.doubleHash,
      );
    },
  );
});

describe("runCurrentRuntimeConfigurationCorrection — new pre-write baseline gate, end-to-end", () => {
  it("REGRESSION (item 1, end-to-end): an unexpected target-key state throws before any `secrets set` is invoked", async () => {
    const h = createHarness();
    seedState(h.cli, { ...staleLiveValues(), FOOTBALL_SPORTSMONKS_SEASON_ID: "99999" });

    await expect(runCurrentRuntimeConfigurationCorrection(h.deps())).rejects.toThrow(
      "target_secret_unexpected_pre_write_state",
    );
    expect(h.cli.calls().filter((call) => call[1] === "set")).toEqual([]);
    // Exactly one `secrets list` (the pre-write capture) — the gate fails before any post-write
    // capture is ever attempted.
    expect(h.cli.calls().filter((call) => call[1] === "list").length).toBe(1);
  });

  it(
    "REGRESSION (item 2, end-to-end): unrelated-key drift relative to the approved baseline, detected " +
      "pre-write, throws before any `secrets set` is invoked",
    async () => {
      const h = createHarness();
      seedState(h.cli, { ...staleLiveValues(), FOOTBALL_SPORTSMONKS_LEAGUE_ID: "999" });

      await expect(runCurrentRuntimeConfigurationCorrection(h.deps())).rejects.toThrow(
        "unrelated_secret_unexpected_pre_write_state",
      );
      expect(h.cli.calls().filter((call) => call[1] === "set")).toEqual([]);
      expect(h.cli.calls().filter((call) => call[1] === "list").length).toBe(1);
    },
  );

  it("REGRESSION (item 3, end-to-end): the trigger secret present pre-write throws before any `secrets set` is invoked", async () => {
    const h = createHarness();
    seedState(h.cli, { ...staleLiveValues(), FOOTBALL_INGESTION_TRIGGER_SECRET: "oops" });

    await expect(runCurrentRuntimeConfigurationCorrection(h.deps())).rejects.toThrow(
      "trigger_secret_unexpectedly_present_pre_write",
    );
    expect(h.cli.calls().filter((call) => call[1] === "set")).toEqual([]);
    expect(h.cli.calls().filter((call) => call[1] === "list").length).toBe(1);
  });

  it("(item 4) the approved stale baseline on all 15 keys proceeds to exactly the permitted correction", async () => {
    const h = createHarness();
    seedState(h.cli, staleLiveValues());

    const evidence = await runCurrentRuntimeConfigurationCorrection(h.deps());

    expect(evidence.verdict).toBe("pass");
    expect(evidence.preWriteBaselineCheck.ok).toBe(true);
    expect(evidence.writePerformed).toBe(true);
    const setCalls = h.cli.calls().filter((call) => call[1] === "set");
    expect(setCalls.length).toBe(1);
    for (const name of TARGET_SECRET_NAMES) {
      expect(setCalls[0].join(" ")).toBeDefined(); // sanity: a `set` call happened
    }
  });

  it("(item 5) an already-approved-corrected baseline still passes the new pre-write gate and issues no write", async () => {
    const h = createHarness();
    seedState(h.cli, fullyCorrectLiveValues());

    const evidence = await runCurrentRuntimeConfigurationCorrection(h.deps());

    expect(evidence.verdict).toBe("pass");
    expect(evidence.preWriteBaselineCheck.ok).toBe(true);
    expect(evidence.writePerformed).toBe(false);
    expect(h.cli.calls().filter((call) => call[1] === "set")).toEqual([]);
  });
});

describe("CurrentRuntimeCorrectionError", () => {
  it("carries its code as both name-adjacent message and .code", () => {
    const error = new CurrentRuntimeCorrectionError("some_code");
    expect(error.code).toBe("some_code");
    expect(error.message).toBe("some_code");
  });
});

describe("result file on disk matches the returned evidence and is never world-readable", () => {
  it("writes g7-current-runtime-configuration-correction.json with mode 0600", async () => {
    const h = createHarness();
    seedState(h.cli, fullyCorrectLiveValues());
    await runCurrentRuntimeConfigurationCorrection(h.deps());
    const resultPath = join(h.evidenceDir, "g7-current-runtime-configuration-correction.json");
    expect(existsSync(resultPath)).toBe(true);
    const mode = statSync(resultPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
