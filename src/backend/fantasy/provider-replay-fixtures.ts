/**
 * The committed Phase 0 payloads, parsed by the approved adapters, as the
 * reconciler's input. Historical responses captured on 2026-10-01: replaying
 * them validates those payloads only, it is not a fresh provider check.
 */
import {
  parseFlashscoreData,
  parseFlashscoreLineups,
  parseFlashscoreStatistics,
  parseFlashscoreSummary,
} from "../football/provider/flashscore-adapter";
import { providerFixture } from "../football/provider/performance-fixtures";
import {
  parseSofascoreDetail,
  parseSofascoreIncidents,
  parseSofascoreLineups,
  parseSofascoreStatistics,
} from "../football/provider/sofascore-adapter";
import type { ProviderMatchData } from "./provider-reconciler";

/** The seven 2026/27 round-1 matches both providers cover (see tests/fixtures/providers/matches.json). */
export const COMMITTED_GW1_MATCHES = [
  { key: "touargaFus", sofascoreId: "16958239", flashscoreId: "88o4wcDb" },
  { key: "dhjCodm", sofascoreId: "16958236", flashscoreId: "vZ4vNyTH" },
  { key: "wacTemara", sofascoreId: "17132472", flashscoreId: "pW7nLFcU" },
  { key: "tiznitTanger", sofascoreId: "16958238", flashscoreId: "0rrduJrn" },
  { key: "masZemamra", sofascoreId: "17132481", flashscoreId: "W81WOcb5" },
  { key: "tetouanBerkane", sofascoreId: "17132482", flashscoreId: "nLBqJSRq" },
  { key: "kacmHusa", sofascoreId: "17132480", flashscoreId: "GYlCyyrB" },
] as const;

export type CommittedMatch = (typeof COMMITTED_GW1_MATCHES)[number];

/** When the Phase 0 responses were captured. Used as the replay's `observedAt`. */
export const COMMITTED_OBSERVED_AT = "2026-10-01T12:00:00.000Z";

export function loadCommittedMatch(match: Pick<CommittedMatch, "sofascoreId" | "flashscoreId">): {
  sofascore: ProviderMatchData;
  flashscore: ProviderMatchData;
} {
  const sofa = (name: string) => providerFixture("sofascore", `${match.sofascoreId}.${name}`);
  const flash = (name: string) => providerFixture("flashscore", `${match.flashscoreId}.${name}`);
  return {
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
  };
}
