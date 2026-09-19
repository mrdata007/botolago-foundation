import { chmod, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  MANAGED_SECRET_NAMES,
  parseSecretsListTable,
  sha256Hex,
  type CapturedSecret,
  type ManagedSecretName,
  type PreRunConfig,
} from "./g7-historical-performance-backfill-runner";

const EXPECTED_PROJECT_REF = "tkewgajrljbwgwedqsxn";
const CONFIRMATION = "RUN_G7_CURRENT_RUNTIME_CONFIGURATION_CORRECTION";
const TRIGGER_SECRET_NAME: ManagedSecretName = "FOOTBALL_INGESTION_TRIGGER_SECRET";

/**
 * The six current-runtime keys this correction targets. These are the ONLY keys this script may
 * ever write. Every other MANAGED_SECRET_NAMES entry (including FOOTBALL_INGESTION_TRIGGER_SECRET)
 * must be left byte-identical by this run — see UNRELATED_SECRET_NAMES and the post-write check.
 */
export const TARGET_SECRET_NAMES = [
  "FOOTBALL_SPORTSMONKS_SEASON_ID",
  "FOOTBALL_SPORTSMONKS_SEASON_START",
  "FOOTBALL_SPORTSMONKS_SEASON_END",
  "FOOTBALL_SPORTSMONKS_TEAM_IDS",
  "FOOTBALL_SPORTSMONKS_FIXTURE_FROM",
  "FOOTBALL_SPORTSMONKS_FIXTURE_TO",
] as const satisfies readonly ManagedSecretName[];

export type TargetSecretName = (typeof TARGET_SECRET_NAMES)[number];

/**
 * OWNER-APPROVED, EVIDENCE-BACKED production correction values (2026-09-19 correction packet,
 * docs/engineering/LAUNCH_LEDGER.yaml BG-0033 `current_runtime_correction_packet_2026_09_19`).
 * Hardcoded here — never passed as a workflow_dispatch input — matching this repo's existing
 * "pinned production function secrets" convention (see gate2f/gate3b's own "Install pinned
 * production function secrets" steps).
 *
 * FOOTBALL_SPORTSMONKS_SEASON_END = "2027-06-30" is an OWNER-APPROVED OPERATIONAL BOUNDARY, NOT a
 * verified official final-match date. The live SportsMonks provider itself reports a conflicting,
 * internally-implausible seasonEndingAt of "2026-09-24" (identical to its own season start date)
 * for season 28647; that provider value is a known anomaly and is deliberately NOT used here.
 *
 * FOOTBALL_SPORTSMONKS_FIXTURE_FROM / FOOTBALL_SPORTSMONKS_FIXTURE_TO are the FIRST 100-day fetch
 * window only, computed via the existing reviewed `boundedFixtureWindow()` logic in
 * scripts/backend/sportsmonks-production-probe.ts:254-272, evaluated for observedAt = 2026-09-19
 * against seasonStart "2026-09-24" / seasonEnd "2027-06-30":
 *   boundedFixtureWindow("2026-09-24", "2027-06-30", new Date("2026-09-19")) ===
 *     { from: "2026-09-24", to: "2027-01-01", inclusiveDays: 100 }
 * This is NOT the whole season and will need periodic refresh later (tracked separately — not
 * this script's job to automate).
 */
export const TARGET_SECRET_VALUES: Readonly<Record<TargetSecretName, string>> = {
  FOOTBALL_SPORTSMONKS_SEASON_ID: "28647",
  FOOTBALL_SPORTSMONKS_SEASON_START: "2026-09-24",
  FOOTBALL_SPORTSMONKS_SEASON_END: "2027-06-30",
  FOOTBALL_SPORTSMONKS_TEAM_IDS:
    "306,2846,6856,9369,9511,9535,16845,16847,16850,16851,16853,16858,16938,227263,228516,270260",
  FOOTBALL_SPORTSMONKS_FIXTURE_FROM: "2026-09-24",
  FOOTBALL_SPORTSMONKS_FIXTURE_TO: "2027-01-01",
};

/** Every managed secret NOT among the six targets — must never change as a result of this run. */
export const UNRELATED_SECRET_NAMES = MANAGED_SECRET_NAMES.filter(
  (name): name is Exclude<ManagedSecretName, TargetSecretName> =>
    !(TARGET_SECRET_NAMES as readonly string[]).includes(name),
);

export class CurrentRuntimeCorrectionError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CurrentRuntimeCorrectionError";
  }
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface CorrectionDependencies {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly cliPath: string;
  readonly now: () => Date;
  readonly writeFile: (path: string, content: string) => Promise<void>;
}

async function defaultWriteSecure(path: string, content: string): Promise<void> {
  await writeFile(path, content, { mode: 0o600 });
  await chmod(path, 0o600);
}

export function defaultCorrectionDependencies(): CorrectionDependencies {
  return {
    env: process.env,
    cliPath: resolve("node_modules/.bin/supabase"),
    now: () => new Date(),
    writeFile: defaultWriteSecure,
  };
}

function required(deps: CorrectionDependencies, name: string): string {
  const value = deps.env[name]?.trim();
  if (!value) throw new CurrentRuntimeCorrectionError(`missing_${name.toLowerCase()}`);
  return value;
}

// ---------------------------------------------------------------------------
// Command execution (read-only `secrets list` / a single scoped `secrets set`; never `deploy`,
// never `db push`, never the football-ingest HTTP endpoint).
// ---------------------------------------------------------------------------

interface CommandResult {
  readonly operation: string;
  readonly exitCode: number;
  readonly stdout: string;
}

interface EvidenceCommand {
  readonly operation: string;
  readonly exitCode: number;
}

function toEvidenceCommand(result: CommandResult): EvidenceCommand {
  return { operation: result.operation, exitCode: result.exitCode };
}

async function runCommand(
  deps: CorrectionDependencies,
  operation: string,
  args: readonly string[],
  runtimeDirectory: string,
): Promise<CommandResult> {
  const env = {
    ...process.env,
    ...Object.fromEntries(
      Object.entries(deps.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ),
  };
  const child = Bun.spawn([deps.cliPath, ...args], { env, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  await deps.writeFile(resolve(runtimeDirectory, `${operation}.raw.log`), `${stdout}${stderr}`);
  await deps.writeFile(resolve(runtimeDirectory, `${operation}.exit`), `${exitCode}\n`);
  return { operation, exitCode, stdout };
}

// ---------------------------------------------------------------------------
// Capture (read-only). Reuses the SAME parseSecretsListTable/sha256Hex helpers as
// g7-historical-performance-backfill-runner.ts's captureConfiguration, rather than
// reimplementing the parsing/fingerprint logic.
// ---------------------------------------------------------------------------

interface CaptureResult {
  readonly preRunConfig: PreRunConfig;
  readonly evidenceSecrets: Array<Record<string, unknown>>;
  readonly command: EvidenceCommand;
}

async function captureConfiguration(
  deps: CorrectionDependencies,
  runtimeDirectory: string,
  operation: string,
): Promise<CaptureResult> {
  const listCommand = await runCommand(
    deps,
    operation,
    ["secrets", "list", "--project-ref", EXPECTED_PROJECT_REF],
    runtimeDirectory,
  );
  if (listCommand.exitCode !== 0) {
    throw new CurrentRuntimeCorrectionError("production_config_capture_failed");
  }
  const table = parseSecretsListTable(listCommand.stdout);
  if (table.size === 0) {
    throw new CurrentRuntimeCorrectionError("production_config_capture_failed");
  }
  const preRunConfig = {} as Record<ManagedSecretName, CapturedSecret>;
  const evidenceSecrets: Array<Record<string, unknown>> = [];
  for (const name of MANAGED_SECRET_NAMES) {
    const fingerprint = table.get(name) ?? null;
    const present = fingerprint !== null;
    preRunConfig[name] = { name, present, fingerprint };
    evidenceSecrets.push({
      name,
      present,
      // Never write the raw fingerprint into evidence — a digest of the digest, exactly like the
      // historical runner's own capture evidence shape, so the digest itself never leaves this
      // process (see g7-historical-performance-backfill-runner.ts's captureConfiguration).
      fingerprintSha256: fingerprint ? sha256Hex(fingerprint) : null,
    });
  }
  return {
    preRunConfig: preRunConfig as PreRunConfig,
    evidenceSecrets,
    command: toEvidenceCommand(listCommand),
  };
}

// ---------------------------------------------------------------------------
// Per-key comparison logic
// ---------------------------------------------------------------------------

export type KeyVerdict = "already-correct" | "corrected" | "unrelated-unchanged" | "FAILED";

interface TargetKeyPlan {
  readonly name: TargetSecretName;
  readonly needsWrite: boolean;
  readonly preWriteFingerprint: string | null;
}

/**
 * For each of the six target keys, compares the captured pre-write fingerprint against
 * sha256Hex(targetValue). A key "needs a write" whenever the captured fingerprint is absent OR
 * differs from the target's digest — the pre-write value is NEVER compared against anything else
 * (e.g. a hardcoded "known stale" digest); only ever pre-write vs target, per this task's spec.
 */
export function planTargetKeys(preRunConfig: PreRunConfig): readonly TargetKeyPlan[] {
  return TARGET_SECRET_NAMES.map((name) => {
    const captured = preRunConfig[name];
    const targetDigest = sha256Hex(TARGET_SECRET_VALUES[name]);
    const needsWrite = !captured.present || captured.fingerprint !== targetDigest;
    return { name, needsWrite, preWriteFingerprint: captured.fingerprint };
  });
}

export function allTargetsAlreadyCorrect(plans: readonly TargetKeyPlan[]): boolean {
  return plans.every((plan) => !plan.needsWrite);
}

// ---------------------------------------------------------------------------
// Apply: exactly one `secrets set --env-file` call containing ALL SIX target keys. Including an
// already-correct key in the same batch write is harmless (the CLI simply re-sets it to the same
// plaintext, producing the same digest) and keeps the write path simple — one file, one call,
// covering every key this run is responsible for, rather than assembling a partial env file that
// would need its own separate "which subset" bookkeeping for no safety benefit.
// ---------------------------------------------------------------------------

async function applyCorrection(
  deps: CorrectionDependencies,
  runtimeDirectory: string,
  operation: string,
): Promise<EvidenceCommand> {
  const envFileContent = TARGET_SECRET_NAMES.map(
    (name) => `${name}=${TARGET_SECRET_VALUES[name]}\n`,
  ).join("");
  const envFilePath = resolve(runtimeDirectory, `${operation}.env`);
  await deps.writeFile(envFilePath, envFileContent);
  const result = await runCommand(
    deps,
    operation,
    ["secrets", "set", "--project-ref", EXPECTED_PROJECT_REF, "--env-file", envFilePath],
    runtimeDirectory,
  );
  return toEvidenceCommand(result);
}

// ---------------------------------------------------------------------------
// Post-write verification
// ---------------------------------------------------------------------------

interface PerKeyVerdict {
  readonly name: ManagedSecretName;
  readonly role: "target" | "unrelated";
  readonly verdict: KeyVerdict;
  readonly detail: string;
}

function verifyTargets(
  plans: readonly TargetKeyPlan[],
  postWriteConfig: PreRunConfig,
): { readonly perKey: PerKeyVerdict[]; readonly allVerified: boolean } {
  const perKey: PerKeyVerdict[] = [];
  let allVerified = true;
  for (const plan of plans) {
    const targetDigest = sha256Hex(TARGET_SECRET_VALUES[plan.name]);
    const observed = postWriteConfig[plan.name];
    const matches = observed.present && observed.fingerprint === targetDigest;
    if (!matches) {
      allVerified = false;
      perKey.push({
        name: plan.name,
        role: "target",
        verdict: "FAILED",
        detail: "post-write fingerprint does not match sha256Hex(targetValue)",
      });
    } else {
      perKey.push({
        name: plan.name,
        role: "target",
        verdict: plan.needsWrite ? "corrected" : "already-correct",
        detail: plan.needsWrite
          ? "pre-write fingerprint differed from target; verified corrected"
          : "pre-write fingerprint already matched target",
      });
    }
  }
  return { perKey, allVerified };
}

function verifyUnrelated(
  preRunConfig: PreRunConfig,
  postWriteConfig: PreRunConfig,
): { readonly perKey: PerKeyVerdict[]; readonly allUnchanged: boolean } {
  const perKey: PerKeyVerdict[] = [];
  let allUnchanged = true;
  for (const name of UNRELATED_SECRET_NAMES) {
    const before = preRunConfig[name];
    const after = postWriteConfig[name];
    const unchanged = before.present === after.present && before.fingerprint === after.fingerprint;
    if (!unchanged) {
      allUnchanged = false;
      perKey.push({
        name,
        role: "unrelated",
        verdict: "FAILED",
        detail:
          "fingerprint or presence changed relative to the pre-write baseline captured THIS run",
      });
    } else {
      perKey.push({
        name,
        role: "unrelated",
        verdict: "unrelated-unchanged",
        detail: "byte-identical to the pre-write baseline captured this run",
      });
    }
  }
  return { perKey, allUnchanged };
}

function triggerSecretStillAbsent(config: PreRunConfig): boolean {
  return config[TRIGGER_SECRET_NAME].present === false;
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function checkGuards(deps: CorrectionDependencies): string {
  if (deps.env.GITHUB_ACTIONS !== "true" || required(deps, "CONFIRMATION") !== CONFIRMATION) {
    throw new CurrentRuntimeCorrectionError("production_runner_guard_failed");
  }
  if (required(deps, "EXPECTED_PROJECT_REF") !== EXPECTED_PROJECT_REF) {
    throw new CurrentRuntimeCorrectionError("production_project_guard_failed");
  }
  const expectedCommit = required(deps, "EXPECTED_COMMIT");
  if (!/^[0-9a-f]{40}$/.test(expectedCommit) || required(deps, "GITHUB_SHA") !== expectedCommit) {
    throw new CurrentRuntimeCorrectionError("invalid_expected_commit");
  }
  return expectedCommit;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export interface CorrectionEvidence extends Record<string, unknown> {
  readonly schemaVersion: 1;
  readonly mode: "g7_current_runtime_configuration_correction";
  readonly expectedCommit: string;
  readonly projectRef: string;
  readonly preWriteCapture: Array<Record<string, unknown>>;
  readonly targetPlan: Array<{ name: TargetSecretName; needsWrite: boolean }>;
  readonly writePerformed: boolean;
  readonly attempts: Array<Record<string, unknown>>;
  readonly postWriteCapture: Array<Record<string, unknown>>;
  readonly perKeyVerdict: PerKeyVerdict[];
  readonly triggerSecretStillAbsent: boolean;
  readonly verdict: "pass" | "fail";
  failureCode?: string;
}

export async function runCurrentRuntimeConfigurationCorrection(
  deps: CorrectionDependencies,
): Promise<CorrectionEvidence> {
  const expectedCommit = checkGuards(deps);
  const runtimeDirectory = resolve(required(deps, "G7_CORRECTION_RUNTIME_DIR"));
  const evidenceDirectory = resolve(required(deps, "G7_CORRECTION_EVIDENCE_DIR"));
  const resultPath = resolve(evidenceDirectory, "g7-current-runtime-configuration-correction.json");

  const preWrite = await captureConfiguration(deps, runtimeDirectory, "pre-write-capture");
  const plans = planTargetKeys(preWrite.preRunConfig);
  const attempts: Array<Record<string, unknown>> = [];

  const evidence: CorrectionEvidence = {
    schemaVersion: 1,
    mode: "g7_current_runtime_configuration_correction",
    expectedCommit,
    projectRef: EXPECTED_PROJECT_REF,
    preWriteCapture: preWrite.evidenceSecrets,
    targetPlan: plans.map((plan) => ({ name: plan.name, needsWrite: plan.needsWrite })),
    writePerformed: false,
    attempts,
    postWriteCapture: [],
    perKeyVerdict: [],
    triggerSecretStillAbsent: false,
    verdict: "fail",
  };

  try {
    if (allTargetsAlreadyCorrect(plans)) {
      // Step 2: every target key already matches — skip the write entirely. No `secrets set` call
      // is ever issued in this branch.
      console.log("G7_CURRENT_RUNTIME_CORRECTION_ALREADY_APPLIED");
    } else {
      const firstAttempt = await applyCorrection(
        deps,
        runtimeDirectory,
        "apply-correction-attempt-1",
      );
      attempts.push({ attempt: 1, command: firstAttempt });
      evidence.writePerformed = true;
    }

    let postWrite = await captureConfiguration(deps, runtimeDirectory, "post-write-capture-1");
    let unrelatedCheck = verifyUnrelated(preWrite.preRunConfig, postWrite.preRunConfig);
    let targetCheck = verifyTargets(plans, postWrite.preRunConfig);

    if (!unrelatedCheck.allUnchanged) {
      // Unrelated-key drift means a conflicting writer touched production concurrently. This must
      // fail immediately and loudly — it must NEVER trigger a retry, regardless of what the target
      // keys show.
      evidence.postWriteCapture = postWrite.evidenceSecrets;
      evidence.perKeyVerdict = [...targetCheck.perKey, ...unrelatedCheck.perKey];
      throw new CurrentRuntimeCorrectionError("unrelated_secret_drift_detected");
    }

    if (!targetCheck.allVerified && evidence.writePerformed) {
      // One bounded retry: only reachable when unrelated keys are clean and this is the FIRST
      // attempt within this run (attempts.length === 1 at this point).
      const retryAttempt = await applyCorrection(
        deps,
        runtimeDirectory,
        "apply-correction-attempt-2",
      );
      attempts.push({ attempt: 2, command: retryAttempt });

      postWrite = await captureConfiguration(deps, runtimeDirectory, "post-write-capture-2");
      unrelatedCheck = verifyUnrelated(preWrite.preRunConfig, postWrite.preRunConfig);
      if (!unrelatedCheck.allUnchanged) {
        evidence.postWriteCapture = postWrite.evidenceSecrets;
        evidence.perKeyVerdict = [
          ...verifyTargets(plans, postWrite.preRunConfig).perKey,
          ...unrelatedCheck.perKey,
        ];
        throw new CurrentRuntimeCorrectionError("unrelated_secret_drift_detected_after_retry");
      }
      targetCheck = verifyTargets(plans, postWrite.preRunConfig);
    }

    evidence.postWriteCapture = postWrite.evidenceSecrets;
    evidence.perKeyVerdict = [...targetCheck.perKey, ...unrelatedCheck.perKey];
    evidence.triggerSecretStillAbsent = triggerSecretStillAbsent(postWrite.preRunConfig);

    if (!targetCheck.allVerified) {
      throw new CurrentRuntimeCorrectionError("target_secret_verification_failed_after_retry");
    }
    if (!evidence.triggerSecretStillAbsent) {
      throw new CurrentRuntimeCorrectionError(
        "football_ingestion_trigger_secret_unexpectedly_present",
      );
    }

    evidence.verdict = "pass";
  } catch (error) {
    evidence.verdict = "fail";
    evidence.failureCode =
      error instanceof CurrentRuntimeCorrectionError
        ? error.code
        : "unexpected_current_runtime_correction_failure";
  } finally {
    await deps.writeFile(resultPath, `${JSON.stringify(evidence, null, 2)}\n`);
  }

  if (evidence.verdict !== "pass") {
    throw new CurrentRuntimeCorrectionError(
      evidence.failureCode ?? "current_runtime_correction_failed",
    );
  }
  console.log("G7_CURRENT_RUNTIME_CONFIGURATION_CORRECTION_PASS");
  return evidence;
}

if (import.meta.main) {
  runCurrentRuntimeConfigurationCorrection(defaultCorrectionDependencies()).catch(
    (error: unknown) => {
      const code =
        error instanceof CurrentRuntimeCorrectionError
          ? error.code
          : "unexpected_current_runtime_correction_failure";
      console.error(`G7_CURRENT_RUNTIME_CONFIGURATION_CORRECTION_FAIL code=${code}`);
      process.exitCode = 1;
    },
  );
}
