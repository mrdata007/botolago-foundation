/**
 * Scoring proof, match 1 (club 1 2-1 club 2): the request the reconciled ingestion
 * sends, built by the real code path (reconciler, replay verdict, request builder)
 * from SYNTHETIC provider data. No real payload, no provider call, no database.
 *
 *   bun scripts/backend/scoring-proof/match-1-request.ts > match-1-request.json
 *
 * Provider ids are `proof-s-h<shirt>` / `proof-f-a<shirt>`; home shirt k is proof player k,
 * away shirt k is proof player 11 + k (scripts/backend/scoring-proof/world.sql).
 */
import { prepareReconciledObservation } from "../../../src/backend/fantasy/reconciled-ingestion";
import type { ProviderMatchData } from "../../../src/backend/fantasy/provider-reconciler";
import {
  build,
  DEFAULT_SHIRTS,
  fid,
  row,
  sid,
} from "../../../src/backend/fantasy/provider-test-world";
import { buildReviewedIdentitySnapshot } from "../../../src/backend/fantasy/reviewed-identities";

export const PROOF_ID = (kind: string, n: number) =>
  `fb5c0000-0000-4000-8000-${kind}${String(n).padStart(12 - kind.length, "0")}`;
const PREFIX = "proof-";
const OBSERVED_AT = "2026-08-20T21:00:00.000Z";
const position = (shirt: number) => (shirt === 1 ? "G" : shirt <= 5 ? "D" : shirt <= 9 ? "M" : "F");

export async function matchOneRequest() {
  // Goals: home shirts 10 and 6, away shirt 11 (proof players 10, 6 and 22).
  const m = build({
    goals: [
      ["home", 20, 10, 10],
      ["home", 50, 6, 6],
      ["away", 70, 11, 11],
    ],
    sofascoreFixtureId: "990001",
    flashscoreFixtureId: "ProofF01",
    sofaIdPrefix: PREFIX,
    flashIdPrefix: PREFIX,
  });
  const scorers = new Set(["home:10", "home:6", "away:11"]);
  const sofascore: ProviderMatchData = {
    ...m.sofascore,
    lineups: {
      ...m.sofascore.lineups,
      fullCoverage: true,
      players: m.sofascore.lineups.players.map((p) => ({
        ...p,
        position: position(p.shirtNumber ?? 0),
        stats: {
          minutesPlayed: 90,
          goals: scorers.has(`${p.side}:${p.shirtNumber}`) ? 1 : 0,
          assists: 0,
          ownGoals: 0,
          saves: 0,
          rating: null,
          penaltyMissed: 0,
        },
      })),
    },
  };
  const rows = [];
  for (const side of ["home", "away"] as const) {
    for (const shirt of DEFAULT_SHIRTS) {
      const app = PROOF_ID("e", side === "home" ? shirt : 11 + shirt);
      rows.push(
        row("sofascore", sid(side, shirt, PREFIX), app),
        row("flashscore", fid(side, shirt, PREFIX), app),
      );
    }
  }
  return prepareReconciledObservation({
    observedAt: OBSERVED_AT,
    sofascore,
    flashscore: m.flashscore,
    snapshot: await buildReviewedIdentitySnapshot(rows, OBSERVED_AT),
    binding: {
      appFixtureId: PROOF_ID("f", 1),
      homeTeamId: PROOF_ID("d", 1),
      awayTeamId: PROOF_ID("d", 2),
    },
  });
}

if (import.meta.main) {
  const prepared = await matchOneRequest();
  if (!prepared.request) {
    console.error(JSON.stringify(prepared.blockers, null, 2));
    process.exit(2);
  }
  process.stdout.write(JSON.stringify(prepared.request));
}
