/** Read-only: local files and SofaScore GETs only; no database or identity writes. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { RapidApiClient } from "../../src/backend/football/provider/rapidapi-client";
import { collect, CollectionError, csvReport, safeError, type Read } from "./sofascore-collect-lib";

const HELP = `Read-only SofaScore collection (RAPIDAPI_KEY in environment only).
Usage: bun scripts/backend/sofascore-collect.ts --out-dir /tmp/botola-evidence
  [--event-ids 17132481,16958239] [--recent-round] [--season-id 102220]
  [--max-pages 3] [--max-age-days 30] [--max-requests 64] [--min-remaining 100]
  [--player-statistics 0] [--incidents] [--fresh] [--cache-ttl-seconds 3600]
At most 24 explicit events, 10 pages, 90 days, 100 HTTP attempts, 2 diagnostic
player-statistics requests per match. Recent discovery requires 8 finished matches
and 16 distinct teams in one round. --fresh bypasses cache without stale fallback.
Outputs: report.json and players.csv; raw cache/ stays private/outside the repo.
Exit: 0 complete; 2 usage/credentials/local I/O; 3 retrieval/validation failed;
4 collection succeeded but ratings or statistics coverage incomplete.
JSON carries match/section failures, quota, request counts and original observation
times. Empty CSV cells are unknown, never inferred zero. No scoring or mapping.`;

export function parseArgs(args: string[]) {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const boolean = new Set(["--recent-round", "--incidents", "--fresh"]);
  const valued = new Set([
    "--out-dir",
    "--event-ids",
    "--season-id",
    "--max-pages",
    "--max-age-days",
    "--max-requests",
    "--min-remaining",
    "--player-statistics",
    "--cache-ttl-seconds",
  ]);
  for (let i = 0; i < args.length; i++) {
    const name = args[i]!;
    if (flags.has(name) || values.has(name)) throw new CollectionError("duplicate_option");
    if (boolean.has(name)) {
      flags.add(name);
      continue;
    }
    if (!valued.has(name) || !args[i + 1] || args[i + 1]!.startsWith("--"))
      throw new CollectionError("invalid_option");
    values.set(name, args[++i]!);
  }
  const integer = (name: string, fallback: number, low: number, high: number) => {
    const raw = values.get(name) ?? String(fallback);
    if (
      !/^\d+$/.test(raw) ||
      !Number.isSafeInteger(Number(raw)) ||
      Number(raw) < low ||
      Number(raw) > high
    )
      throw new CollectionError("invalid_option_range");
    return Number(raw);
  };
  const eventIds = values.get("--event-ids")?.split(",") ?? [];
  if (eventIds.length > 24 || eventIds.some((id) => !/^[1-9]\d{0,11}$/.test(id)))
    throw new CollectionError("invalid_event_ids");
  if (eventIds.length === 0 && !flags.has("--recent-round"))
    throw new CollectionError("event_scope_required");
  const outDir = values.get("--out-dir");
  if (!outDir || !isAbsolute(outDir))
    throw new CollectionError("absolute_output_directory_required");
  return {
    outDir,
    eventIds: [...new Set(eventIds)],
    recentRound: flags.has("--recent-round"),
    seasonId: values.has("--season-id") ? integer("--season-id", 0, 1, 999_999_999_999) : undefined,
    maxPages: integer("--max-pages", 3, 1, 10),
    maxAgeDays: integer("--max-age-days", 30, 1, 90),
    maxRequests: integer("--max-requests", 64, 1, 100),
    minRemaining: integer("--min-remaining", 100, 0, 100_000),
    playerStatistics: integer("--player-statistics", 0, 0, 2),
    incidents: flags.has("--incidents"),
    fresh: flags.has("--fresh"),
    cacheTtlMs: integer("--cache-ttl-seconds", 3600, 0, 86400) * 1000,
  };
}

/** Original timestamps survive cache hits. Invalid/expired caches never become live evidence. */
export function cachedReader(
  client: Pick<RapidApiClient, "getJson">,
  directory: string,
  ttlMs: number,
  fresh: boolean,
  now = Date.now,
): Read {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return async (path) => {
    const file = resolve(directory, createHash("sha256").update(path).digest("hex") + ".json");
    if (!fresh && ttlMs > 0) {
      try {
        const cached = JSON.parse(readFileSync(file, "utf8"));
        const fetched = Date.parse(cached.fetchedAt);
        if (
          cached.version === 1 &&
          cached.path === path &&
          cached.source === "sofascore:api-dojo-rapidapi" &&
          "data" in cached &&
          Number.isFinite(fetched) &&
          fetched <= now() &&
          now() - fetched < ttlMs
        )
          return { data: cached.data, fetchedAt: cached.fetchedAt, transport: "cache" };
      } catch {
        /* Missing/corrupt caches are a miss, never a successful empty response. */
      }
    }
    const data = await client.getJson(path);
    const fetchedAt = new Date(now()).toISOString();
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(
      temporary,
      JSON.stringify({ version: 1, source: "sofascore:api-dojo-rapidapi", path, data, fetchedAt }),
      { mode: 0o600 },
    );
    renameSync(temporary, file);
    return { data, fetchedAt, transport: "live" };
  };
}

export function outputDirectory(path: string) {
  const repository = realpathSync(resolve(import.meta.dir, "../.."));
  const outside = (candidate: string) => {
    const rel = relative(repository, candidate);
    return rel.startsWith("../") || isAbsolute(rel);
  };
  if (!outside(resolve(path))) throw new CollectionError("output_must_be_outside_repository");
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const actual = realpathSync(path);
  if (!outside(actual)) throw new CollectionError("output_must_be_outside_repository");
  // Reject a pre-existing cache symlink into the repository too.
  const cache = resolve(actual, "cache");
  mkdirSync(cache, { recursive: true, mode: 0o700 });
  if (!outside(realpathSync(cache))) throw new CollectionError("cache_must_be_outside_repository");
  return actual;
}
async function main() {
  if (process.argv.includes("--help")) {
    console.log(HELP);
    return;
  }
  const options = parseArgs(process.argv.slice(2));
  const directory = outputDirectory(options.outDir);
  const capturedAt = new Date().toISOString();
  const key = process.env.RAPIDAPI_KEY;
  if (!key?.trim()) {
    const failure = {
      schemaVersion: 1,
      capturedAt,
      freshAuthenticatedPull: false,
      requestsConsumed: 0,
      quota: { limit: null, remaining: null },
      errors: [{ reason: "missing_rapidapi_key" }],
      results: [],
      exitCode: 2,
    };
    writeFileSync(resolve(directory, "report.json"), JSON.stringify(failure, null, 2) + "\n", {
      mode: 0o600,
    });
    console.error(JSON.stringify(failure));
    process.exitCode = 2;
    return;
  }
  const client = new RapidApiClient({
    host: "sofascore.p.rapidapi.com",
    key,
    maxRequests: options.maxRequests,
    minRemaining: options.minRemaining,
  });
  const read = cachedReader(client, resolve(directory, "cache"), options.cacheTtlMs, options.fresh);
  const report = await collect(read, client, {
    eventIds: options.eventIds,
    discovery: options.recentRound
      ? {
          seasonId: options.seasonId,
          maxPages: options.maxPages,
          maxAgeDays: options.maxAgeDays,
          now: Date.now(),
        }
      : undefined,
    playerStatistics: options.playerStatistics,
    incidents: options.incidents,
    now: Date.now,
  });
  writeFileSync(resolve(directory, "report.json"), JSON.stringify(report, null, 2) + "\n", {
    mode: 0o600,
  });
  writeFileSync(resolve(directory, "players.csv"), csvReport(report), { mode: 0o600 });
  // Summaries only; normalized per-player evidence is in the explicitly requested files.
  console.log(
    JSON.stringify(
      {
        capturedAt: report.capturedAt,
        freshAuthenticatedPull: report.freshAuthenticatedPull,
        discovery: report.discovery && {
          season: report.discovery.season,
          round: report.discovery.round,
          eventIds: report.discovery.eventIds,
        },
        discoveryRequests: report.discoveryRequests,
        requestsConsumed: report.requestsConsumed,
        quota: report.quota,
        errors: report.errors,
        matches: report.results.map(
          ({ players: _players, playerStatistics: _stats, ...match }) => match,
        ),
        exitCode: report.exitCode,
      },
      null,
      2,
    ),
  );
  process.exitCode = report.exitCode;
}
if (import.meta.main)
  main().catch((error) => {
    console.error(JSON.stringify({ ...safeError(error), exitCode: 2 }));
    process.exitCode = 2;
  });
