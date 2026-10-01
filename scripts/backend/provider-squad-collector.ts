/**
 * READ-ONLY squad candidate collector (stage after the 16-club population
 * probe). It asks Sofascore and Flashscore for each club's squad, normalizes
 * the answers in memory and prints ONE sanitized evidence document: counts and
 * states only, never a name, a date, a raw payload or a signal value.
 *
 *   RAPIDAPI_KEY=... FLASHSCORE_RAPIDAPI_HOST=... \
 *     bun scripts/backend/provider-squad-collector.ts [--out file.json]
 *
 * No database access of any kind, nothing is persisted but the optional --out
 * file (which holds the same sanitized document). 32 requests in total.
 */
import { writeFileSync } from "node:fs";
import { collectSquads, type FetchJson } from "../../src/backend/football/identity/collector";
import { assertNoPersonalData, buildEvidence } from "../../src/backend/football/identity/evidence";
import {
  independentPairs,
  measurePositionAgreement,
} from "../../src/backend/football/identity/position-agreement";
import {
  parseFlashscoreData,
  parseFlashscoreLineups,
  parseFlashscoreStatistics,
  parseFlashscoreSummary,
} from "../../src/backend/football/provider/flashscore-adapter";
import { providerFixture } from "../../src/backend/football/provider/performance-fixtures";
import {
  parseSofascoreDetail,
  parseSofascoreIncidents,
  parseSofascoreLineups,
  parseSofascoreStatistics,
} from "../../src/backend/football/provider/sofascore-adapter";
import { reconcileMatch } from "../../src/backend/fantasy/provider-reconciler";
import { probe } from "./provider-probe";

/** The seven round-1 matches both providers cover (Sofascore id, Flashscore id). */
const COMMITTED_MATCHES = [
  ["16958239", "88o4wcDb"],
  ["16958236", "vZ4vNyTH"],
  ["17132472", "pW7nLFcU"],
  ["16958238", "0rrduJrn"],
  ["17132481", "W81WOcb5"],
  ["17132482", "nLBqJSRq"],
  ["17132480", "GYlCyyrB"],
] as const;

/** Players both providers attribute the same incident to, from the committed fixtures. */
function independentPairsFromFixtures() {
  return COMMITTED_MATCHES.flatMap(([s, f]) => {
    const sofa = (name: string) => providerFixture("sofascore", `${s}.${name}`);
    const flash = (name: string) => providerFixture("flashscore", `${f}.${name}`);
    const result = reconcileMatch({
      observedAt: "2026-10-01T12:00:00.000Z",
      sofascore: {
        summary: parseSofascoreDetail(sofa("detail")),
        lineups: parseSofascoreLineups(sofa("lineups")),
        incidents: parseSofascoreIncidents(sofa("incidents")),
        statistics: parseSofascoreStatistics(sofa("statistics")),
      },
      flashscore: {
        summary: parseFlashscoreData(flash("data")),
        lineups: parseFlashscoreLineups(flash("lineups")),
        incidents: parseFlashscoreSummary(flash("summary")),
        statistics: parseFlashscoreStatistics(flash("statistics")),
      },
    });
    return independentPairs(result.players);
  });
}

const fetchJson: FetchJson = async (provider, path) => {
  const response = await probe(provider, path);
  let body: unknown = null;
  try {
    body = JSON.parse(response.body);
  } catch {
    body = null;
  }
  return { status: response.status, body };
};

async function main() {
  const out = process.argv.includes("--out")
    ? process.argv[process.argv.indexOf("--out") + 1]
    : undefined;
  const collection = await collectSquads({ fetchJson, now: new Date() });
  const positionAgreement = measurePositionAgreement(
    independentPairsFromFixtures(),
    collection.squads,
  );
  const evidence = buildEvidence(collection, positionAgreement);
  assertNoPersonalData(evidence, collection);
  const text = JSON.stringify(evidence, null, 2);
  if (out) writeFileSync(out, `${text}\n`);
  console.log(text);
}

if (import.meta.main) {
  main().catch((error) => {
    // A stable one-line message only: never a response body.
    console.error(`Collector failed: ${error instanceof Error ? error.name : "error"}`);
    process.exit(1);
  });
}
