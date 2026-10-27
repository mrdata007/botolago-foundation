/**
 * Reviewed corrections, step 1 of 3: read the named Sofascore matches through
 * RapidAPI (detail, lineups, incidents: 3 requests per match) and write the
 * parsed facts to $OUT_DIR/sofascore-matches.json. No database access.
 *
 *   RAPIDAPI_KEY=… MATCH_IDS=17256977,17256968 OUT_DIR=… bun scripts/backend/reviewed-correction-fetch.ts
 *
 * Only the adapters' parsed output is written (names, ids, minutes, events),
 * never a raw payload.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { RapidApiClient } from "../../src/backend/football/provider/rapidapi-client";
import { SofascorePerformanceProvider } from "../../src/backend/football/provider/sofascore-adapter";
import type { SofascoreMatchCapture } from "./reviewed-correction";

const MAX_MATCHES = 10;

export function parseMatchIds(raw: string | undefined): string[] {
  const ids = (raw ?? "")
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0 || ids.length > MAX_MATCHES || ids.some((id) => !/^\d{1,12}$/.test(id)))
    throw new Error(`MATCH_IDS must list 1 to ${MAX_MATCHES} Sofascore match ids`);
  return [...new Set(ids)];
}

async function main(): Promise<void> {
  const key = process.env.RAPIDAPI_KEY ?? "";
  const outDir = process.env.OUT_DIR ?? "";
  if (!key.trim()) throw new Error("RAPIDAPI_KEY is not set");
  if (!outDir) throw new Error("OUT_DIR is not set");
  const ids = parseMatchIds(process.env.MATCH_IDS);
  const client = new RapidApiClient({ host: "sofascore.p.rapidapi.com", key, minRemaining: 20 });
  const provider = new SofascorePerformanceProvider(client);
  const captures: SofascoreMatchCapture[] = [];
  for (const id of ids) {
    const summary = await provider.getMatchSummary(id);
    if (!summary.finished) {
      console.log(`SOFASCORE_MATCH_NOT_FINISHED match=${id}`);
      continue;
    }
    const lineups = await provider.getLineups(id);
    const incidents = await provider.getIncidents(id);
    captures.push({
      matchId: id,
      kickoffAt: summary.kickoffAt,
      homeName: summary.homeName,
      awayName: summary.awayName,
      homeScore: summary.homeScore,
      awayScore: summary.awayScore,
      players: lineups.players,
      incidents,
      capturedAt: new Date().toISOString(),
    });
    console.log(
      `SOFASCORE_MATCH_READ match=${id} players=${lineups.players.length} incidents=${incidents.length} fullCoverage=${lineups.fullCoverage}`,
    );
  }
  await mkdir(outDir, { recursive: true });
  await writeFile(
    resolve(outDir, "sofascore-matches.json"),
    `${JSON.stringify(captures, null, 2)}\n`,
  );
  const quota = client.quota();
  console.log(
    `SOFASCORE_FETCH_DONE matches=${captures.length} requests=${client.requestsSent()} remaining=${quota.remaining ?? "unknown"}`,
  );
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    // Adapter errors carry a path and a status, never the key or a body.
    console.error(`SOFASCORE_FETCH_FAILED ${error instanceof Error ? error.message : "unknown"}`);
    process.exit(1);
  });
}
