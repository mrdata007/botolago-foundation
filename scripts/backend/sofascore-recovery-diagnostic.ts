/** Four fixed GET requests. No database, identity or scoring write path. */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { RapidApiClient } from "../../src/backend/football/provider/rapidapi-client";
import { parseSofascoreEvents } from "../../supabase/functions/_shared/sofascore-fixtures";
import {
  parseSofascoreLineups,
  parseSofascoreIncidents,
} from "../../src/backend/football/provider/sofascore-adapter";
import { buildApiRatingLineups } from "../../supabase/functions/_shared/fantasy-api-ratings";

export const DIAGNOSTIC_PATHS = [
  "tournaments/get-next-matches?tournamentId=937&seasonId=102220&pageIndex=0",
  "tournaments/get-last-matches?tournamentId=937&seasonId=102220&pageIndex=0",
  "matches/get-lineups?matchId=17256972",
  "matches/get-incidents?matchId=17256972",
] as const;

function inspect(path: string, raw: unknown) {
  if (path.startsWith("tournaments/")) {
    const parsed = parseSofascoreEvents(raw, { uniqueTournamentId: 937 });
    return { parsed: true, events: parsed.events.length, malformed: parsed.malformedCount };
  }
  if (path.startsWith("matches/get-lineups")) {
    const parsed = buildApiRatingLineups(parseSofascoreLineups(raw));
    return {
      parsed: true,
      ready: parsed.ready,
      player: parsed.players.find((p) => p.externalId === "919712") ?? null,
    };
  }
  return { parsed: true, incidents: parseSofascoreIncidents(raw).length };
}

export async function collectRecoveryDiagnostic(client: Pick<RapidApiClient, "getJson">) {
  const results: Record<string, unknown>[] = [];
  for (const path of DIAGNOSTIC_PATHS) {
    try {
      const raw = await client.getJson(path);
      let inspection: unknown;
      try {
        inspection = inspect(path, raw);
      } catch {
        inspection = { parsed: false, error: "invalid_provider_payload" };
      }
      results.push({
        path,
        capturedAt: new Date().toISOString(),
        fetched: true,
        sha256: createHash("sha256").update(JSON.stringify(raw)).digest("hex"),
        inspection,
        raw,
      });
    } catch {
      // Credential-bearing errors and request/response headers are never saved.
      results.push({
        path,
        capturedAt: new Date().toISOString(),
        fetched: false,
        error: "provider_read_failed",
      });
    }
  }
  return { commit: process.env.GITHUB_SHA ?? null, results };
}

export function serializeDiagnostic(report: unknown, key: string) {
  const serialized = JSON.stringify(report, null, 2);
  if (Buffer.byteLength(serialized) > 2_000_000) throw new Error("diagnostic_payload_too_large");
  return serialized.replaceAll(key, "[REDACTED]") + "\n";
}

async function main() {
  const key = process.env.RAPIDAPI_KEY;
  const outputIndex = process.argv.indexOf("--out");
  const output = process.argv[outputIndex + 1];
  if (!key || outputIndex < 0 || !output) throw new Error("diagnostic_configuration_required");
  const client = new RapidApiClient({
    host: "sofascore.p.rapidapi.com",
    key,
    policy: { maxRetries: 0 },
  });
  const report = await collectRecoveryDiagnostic(client);
  writeFileSync(output, serializeDiagnostic(report, key));
  console.log(
    JSON.stringify({
      requests: client.requestsSent(),
      results: report.results.map(({ path, fetched, inspection }) => ({
        path,
        fetched,
        inspection,
      })),
    }),
  );
  if (report.results.some((r) => !r.fetched)) process.exitCode = 1;
}
if (import.meta.main)
  main().catch(() => {
    console.error("Read-only provider diagnostic failed.");
    process.exitCode = 1;
  });
