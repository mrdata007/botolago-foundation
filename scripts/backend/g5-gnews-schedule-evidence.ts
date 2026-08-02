import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";

type Counters = {
  fetched: number;
  validated: number;
  inserted: number;
  updated: number;
  skipped: number;
  rejected: number;
  retries: number;
};

type ScheduledGnewsEvidence = {
  schemaVersion: 1;
  mode: "production_scheduled_gnews";
  expectedCommit: string;
  projectRef: string;
  runId: string;
  eventName: string;
  request: {
    curlExit: number;
    httpStatus: number;
    responseFile: string;
  };
  verdict: "pass" | "fail";
  failureCode?: string;
  news?: {
    languages: ["fr", "ar"];
    counters: Counters;
  };
};

class EvidenceError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new EvidenceError(`MISSING_${name}`);
  return value;
}

function integer(name: string): number {
  const raw = required(name);
  if (!/^\d+$/.test(raw)) throw new EvidenceError(`INVALID_${name}`);
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value < 0) throw new EvidenceError(`INVALID_${name}`);
  return value;
}

function evidenceFile(root: string, environmentName: string): string {
  const rootPath = resolve(root);
  const path = resolve(required(environmentName));
  const pathFromRoot = relative(rootPath, path);
  if (pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`)) {
    throw new EvidenceError(`${environmentName}_OUTSIDE_EVIDENCE_DIR`);
  }
  return path;
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new EvidenceError(code);
  }
  return value as Record<string, unknown>;
}

function parseJson(path: string): Record<string, unknown> {
  try {
    return record(JSON.parse(readFileSync(path, "utf8")), "NEWS_RESPONSE_INVALID_JSON");
  } catch (error) {
    if (error instanceof EvidenceError) throw error;
    throw new EvidenceError("NEWS_RESPONSE_INVALID_JSON");
  }
}

function counter(value: unknown, name: keyof Counters): number {
  const count = record(value, "INVALID_GNEWS_COUNTERS")[name];
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
    throw new EvidenceError(`INVALID_GNEWS_${name.toUpperCase()}`);
  }
  return count;
}

function validateResponse(
  responsePath: string,
  evidence: ScheduledGnewsEvidence,
): ScheduledGnewsEvidence["news"] {
  if (evidence.request.curlExit !== 0) {
    throw new EvidenceError(`NEWS_CURL_EXIT_${evidence.request.curlExit}`);
  }
  if (evidence.request.httpStatus !== 200) {
    throw new EvidenceError(`NEWS_HTTP_${evidence.request.httpStatus}`);
  }

  const response = parseJson(responsePath);
  const languages = response.languages;
  if (
    response.provider !== "gnews" ||
    !Array.isArray(languages) ||
    languages.length !== 2 ||
    languages[0] !== "fr" ||
    languages[1] !== "ar"
  ) {
    throw new EvidenceError("INVALID_GNEWS_SCOPE");
  }
  const rawCounters = response.counters;
  const counters: Counters = {
    fetched: counter(rawCounters, "fetched"),
    validated: counter(rawCounters, "validated"),
    inserted: counter(rawCounters, "inserted"),
    updated: counter(rawCounters, "updated"),
    skipped: counter(rawCounters, "skipped"),
    rejected: counter(rawCounters, "rejected"),
    retries: counter(rawCounters, "retries"),
  };
  if (
    counters.fetched < 1 ||
    counters.fetched !== counters.validated ||
    counters.rejected !== 0 ||
    counters.inserted + counters.updated + counters.skipped !== counters.validated
  ) {
    throw new EvidenceError("GNEWS_RECONCILIATION_FAILED");
  }
  return { languages: ["fr", "ar"], counters };
}

function main(): void {
  const evidenceDirectory = required("G5_GNEWS_EVIDENCE_DIR");
  const responsePath = evidenceFile(evidenceDirectory, "G5_GNEWS_RESPONSE");
  const outputPath = resolve(evidenceDirectory, "g5-scheduled-gnews-evidence.json");
  const evidence: ScheduledGnewsEvidence = {
    schemaVersion: 1,
    mode: "production_scheduled_gnews",
    expectedCommit: required("EXPECTED_COMMIT"),
    projectRef: required("EXPECTED_PROJECT_REF"),
    runId: required("GITHUB_RUN_ID"),
    eventName: required("GITHUB_EVENT_NAME"),
    request: {
      curlExit: integer("G5_GNEWS_CURL_EXIT"),
      httpStatus: integer("G5_GNEWS_STATUS"),
      responseFile: basename(responsePath),
    },
    verdict: "fail",
  };

  try {
    evidence.news = validateResponse(responsePath, evidence);
    evidence.verdict = "pass";
  } catch (error) {
    evidence.failureCode =
      error instanceof EvidenceError ? error.code : "UNEXPECTED_GNEWS_EVIDENCE_FAILURE";
  }

  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(outputPath, 0o600);
  if (evidence.verdict !== "pass") {
    console.error(evidence.failureCode);
    process.exitCode = 1;
  }
}

main();
