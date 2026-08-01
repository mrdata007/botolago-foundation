import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";

type Counters = Record<string, number>;

type RequestEvidence = {
  curlExit: number;
  httpStatus: number;
  responseFile: string;
};

type Gate4Evidence = {
  schemaVersion: 2;
  mode: "production_news_ratings_canary";
  expectedCommit: string;
  projectRef: string;
  requests: {
    ratings: RequestEvidence;
    crests: RequestEvidence;
    news: RequestEvidence;
  };
  verdict: "pass" | "fail";
  failureCode?: string;
  ratings?: {
    seasonId: number;
    algorithmVersion: string;
    candidates: number;
    ratingRange: { minimum: number; maximum: number };
    counters: Counters;
  };
  crests?: { teams: Counters };
  news?: { languages: string[]; counters: Counters };
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
  if (!Number.isInteger(value) || value < 0) {
    throw new EvidenceError(`INVALID_${name}`);
  }
  return value;
}

function evidenceFile(root: string, envName: string): string {
  const path = resolve(required(envName));
  const rootPath = resolve(root);
  const pathFromRoot = relative(rootPath, path);
  if (pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === "..") {
    throw new EvidenceError(`${envName}_OUTSIDE_EVIDENCE_DIR`);
  }
  return path;
}

function parseJson(path: string, label: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("response is not an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new EvidenceError(`${label}_INVALID_JSON`);
  }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function counters(value: unknown): Counters {
  return Object.fromEntries(
    Object.entries(object(value)).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1]),
    ),
  );
}

function counterTotal(values: Counters): number {
  return ["inserted", "updated", "skipped"].reduce(
    (total, key) => total + (values[key] ?? -1_000_000),
    0,
  );
}

function validateResponses(
  ratingsPath: string,
  crestsPath: string,
  newsPath: string,
  evidence: Gate4Evidence,
): void {
  for (const [label, request] of Object.entries(evidence.requests)) {
    if (request.curlExit !== 0) {
      throw new EvidenceError(`${label.toUpperCase()}_CURL_EXIT_${request.curlExit}`);
    }
    if (request.httpStatus !== 200) {
      throw new EvidenceError(`${label.toUpperCase()}_HTTP_${request.httpStatus}`);
    }
  }

  const ratings = parseJson(ratingsPath, "RATINGS");
  const crests = parseJson(crestsPath, "CRESTS");
  const news = parseJson(newsPath, "NEWS");
  const ratingsCounters = counters(ratings.counters);
  const crestCounters = counters(object(crests.jobs).teams);
  const newsCounters = counters(news.counters);

  if (
    ratings.provider !== "sportsmonks" ||
    ratings.seasonId !== 26027 ||
    ratings.algorithmVersion !== "botolago-preseason-rating-v1" ||
    ratings.candidates !== 561 ||
    ratingsCounters.validated !== 561 ||
    counterTotal(ratingsCounters) < 561
  ) {
    throw new EvidenceError("INVALID_RATINGS_CANARY");
  }

  const ratingRange = object(ratings.ratingRange);
  const minimum = ratingRange.minimum;
  const maximum = ratingRange.maximum;
  if (
    typeof minimum !== "number" ||
    typeof maximum !== "number" ||
    minimum < 4 ||
    minimum > maximum ||
    maximum > 10
  ) {
    throw new EvidenceError("INVALID_RATING_RANGE");
  }

  if (
    crests.provider !== "sportsmonks" ||
    crestCounters.fetched !== 16 ||
    crestCounters.validated !== 16 ||
    crestCounters.rejected !== 0 ||
    counterTotal(crestCounters) !== 16
  ) {
    throw new EvidenceError("INVALID_CREST_CANARY");
  }

  const languages = Array.isArray(news.languages) ? news.languages : [];
  if (
    news.provider !== "gnews" ||
    languages.length !== 2 ||
    languages[0] !== "fr" ||
    languages[1] !== "ar" ||
    (newsCounters.fetched ?? 0) < 1 ||
    (newsCounters.validated ?? 0) < 1 ||
    counterTotal(newsCounters) !== newsCounters.validated
  ) {
    throw new EvidenceError("INVALID_GNEWS_CANARY");
  }

  evidence.ratings = {
    seasonId: ratings.seasonId as number,
    algorithmVersion: ratings.algorithmVersion as string,
    candidates: ratings.candidates as number,
    ratingRange: { minimum, maximum },
    counters: ratingsCounters,
  };
  evidence.crests = { teams: crestCounters };
  evidence.news = { languages: languages as string[], counters: newsCounters };
  evidence.verdict = "pass";
}

function main(): void {
  const evidenceDir = required("GATE4_EVIDENCE_DIR");
  const outputPath = resolve(evidenceDir, "gate4-news-ratings-canary.json");
  const ratingsPath = evidenceFile(evidenceDir, "GATE4_RATINGS_RESPONSE");
  const crestsPath = evidenceFile(evidenceDir, "GATE4_CREST_RESPONSE");
  const newsPath = evidenceFile(evidenceDir, "GATE4_NEWS_RESPONSE");

  const evidence: Gate4Evidence = {
    schemaVersion: 2,
    mode: "production_news_ratings_canary",
    expectedCommit: required("EXPECTED_COMMIT"),
    projectRef: required("EXPECTED_PROJECT_REF"),
    requests: {
      ratings: {
        curlExit: integer("GATE4_RATINGS_CURL_EXIT"),
        httpStatus: integer("GATE4_RATINGS_STATUS"),
        responseFile: basename(ratingsPath),
      },
      crests: {
        curlExit: integer("GATE4_CREST_CURL_EXIT"),
        httpStatus: integer("GATE4_CREST_STATUS"),
        responseFile: basename(crestsPath),
      },
      news: {
        curlExit: integer("GATE4_NEWS_CURL_EXIT"),
        httpStatus: integer("GATE4_NEWS_STATUS"),
        responseFile: basename(newsPath),
      },
    },
    verdict: "fail",
  };

  try {
    validateResponses(ratingsPath, crestsPath, newsPath, evidence);
  } catch (error) {
    evidence.failureCode =
      error instanceof EvidenceError ? error.code : "UNEXPECTED_EVIDENCE_ERROR";
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
