import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface CurrentSeasonReadiness {
  ready: boolean;
  rounds: number;
  teams: number;
  fixtureSample: boolean;
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(code);
  }
  return value as Record<string, unknown>;
}

function nonnegativeInteger(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(code);
  }
  return value;
}

export function classifyCurrentSeasonReadiness(evidence: unknown): CurrentSeasonReadiness {
  const root = record(evidence, "INVALID_PROVIDER_EVIDENCE");
  const resources = record(root.verifiedResources, "INVALID_VERIFIED_RESOURCES");
  const fixture = record(root.fixtureSample, "INVALID_FIXTURE_SAMPLE");
  const rounds = nonnegativeInteger(resources.rounds, "INVALID_ROUND_COUNT");
  const teams = nonnegativeInteger(resources.teams, "INVALID_TEAM_COUNT");
  if (typeof fixture.available !== "boolean") {
    throw new Error("INVALID_FIXTURE_AVAILABILITY");
  }
  const fixtureSample = fixture.available;
  return {
    ready: rounds > 0 && teams > 0 && fixtureSample,
    rounds,
    teams,
    fixtureSample,
  };
}

function run(): void {
  const evidenceDirectory = process.env.GATE2E_EVIDENCE_DIR;
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (!evidenceDirectory) throw new Error("GATE2E_EVIDENCE_DIR_REQUIRED");
  if (!githubOutput) throw new Error("GITHUB_OUTPUT_REQUIRED");

  const evidence = JSON.parse(
    readFileSync(join(evidenceDirectory, "sportsmonks-production-probe.json"), "utf8"),
  );
  const result = classifyCurrentSeasonReadiness(evidence);
  appendFileSync(githubOutput, `ready=${result.ready ? "true" : "false"}\n`, "utf8");
  console.log(
    `Current-season readiness: ready=${result.ready} rounds=${result.rounds} teams=${result.teams} fixtureSample=${result.fixtureSample}`,
  );
}

if (import.meta.main) run();
