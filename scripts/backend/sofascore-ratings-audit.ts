/** Read-only coverage audit. Never resolves players or ingests observations. */
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  RapidApiClient,
  RapidApiRequestError,
} from "../../src/backend/football/provider/rapidapi-client";
import { SofascorePerformanceProvider } from "../../src/backend/football/provider/sofascore-adapter";
import type { PerformanceLineups } from "../../src/backend/football/provider/performance-contracts";
import { isValidRating } from "../../supabase/functions/_shared/fantasy-rating-scoring";

const PROJECT = "tkewgajrljbwgwedqsxn";
export const FIXTURES_SQL = `select coalesce(jsonb_agg(jsonb_build_object(
 'fixtureId',f.id,'eventId',m.external_id,'gameweekId',g.id,
 'gameweek',g.sequence_number,'gameweekStatus',g.status) order by g.sequence_number,f.kickoff_at,f.id),'[]'::jsonb) as fixtures
 from app.fantasy_fixture_assignments a
 join app.fantasy_gameweeks g on g.id=a.gameweek_id
 join app.fixtures f on f.id=a.fixture_id
 left join app_private.football_provider_mappings m on m.internal_entity_id=f.id
   and m.provider_name='sofascore' and m.entity_type='fixture' and m.active
 where a.superseded_at is null and f.status='finished' and f.finalized_at is not null
   and g.fantasy_season_id='5ada3e98-2929-405a-a3f1-a26de8e51933'::uuid`;

export function auditLineups(lineups: PerformanceLineups) {
  if (lineups.provider !== "sofascore" || lineups.players.length === 0)
    throw new Error("ratings_lineups_missing");
  const ids = new Set<string>();
  const players = lineups.players.map((p) => {
    if (!/^\d{1,12}$/.test(p.externalId) || ids.has(p.externalId))
      throw new Error("ratings_player_id_invalid");
    ids.add(p.externalId);
    const minutes = p.stats?.minutesPlayed ?? null;
    const rating = isValidRating(p.stats?.rating) ? p.stats!.rating : null;
    // A named starter or a rated substitute cannot become a DNP because minutes
    // are missing. An unused bench row with no statistics is a confirmed DNP.
    const appeared = p.starter || (minutes !== null && minutes > 0) || rating !== null;
    const uncertain = minutes === null && p.stats !== null && !appeared;
    return {
      externalId: p.externalId,
      side: p.side,
      starter: p.starter,
      minutes,
      rating,
      appeared,
      uncertain,
    };
  });
  const validSides = ["home", "away"].every(
    (side) => players.filter((p) => p.side === side && p.starter).length === 11,
  );
  const missing = players.filter((p) => (p.appeared && p.rating === null) || p.uncertain);
  return {
    ready: validSides && missing.length === 0,
    participants: players.filter((p) => p.appeared).length,
    rated: players.filter((p) => p.appeared && p.rating !== null).length,
    missingRatingIds: missing.map((p) => p.externalId),
    validSides,
    players,
  };
}

async function main() {
  if (process.env.SUPABASE_PRODUCTION_PROJECT_REF !== PROJECT)
    throw new Error("production_project_ref_required");
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const key = process.env.RAPIDAPI_KEY;
  const output = process.argv[process.argv.indexOf("--out") + 1];
  if (!token || !key || !process.argv.includes("--out") || !output)
    throw new Error("audit_credentials_and_output_required");
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: FIXTURES_SQL, read_only: true }),
  });
  if (!response.ok) throw new Error(`ratings_fixture_read_failed:${response.status}`);
  type Fixture = {
    fixtureId: string;
    eventId: string;
    gameweekId: string;
    gameweek: number;
    gameweekStatus: string;
  };
  const fixtures: Fixture[] = (await response.json())[0]?.fixtures;
  if (!Array.isArray(fixtures) || fixtures.length === 0 || fixtures.length > 300)
    throw new Error("ratings_fixture_scope_invalid");
  const client = new RapidApiClient({
    host: "sofascore.p.rapidapi.com",
    key,
    policy: { maxRetries: 0 },
  });
  const provider = new SofascorePerformanceProvider(client);
  const results: unknown[] = [];
  let failures = 0;
  for (const fixture of fixtures) {
    const before = client.requestsSent();
    try {
      const lineups = await provider.getLineups(fixture.eventId);
      const audit = auditLineups(lineups);
      results.push({
        ...fixture,
        ...audit,
        observedAt: new Date().toISOString(),
        source: "sofascore:api-dojo-rapidapi",
        requestsConsumed: client.requestsSent() - before,
        quota: client.quota(),
        digest: createHash("sha256").update(JSON.stringify(audit.players)).digest("hex"),
      });
      console.log(
        `GW${fixture.gameweek} event ${fixture.eventId}: ${audit.rated}/${audit.participants} rated; ${audit.ready ? "ready" : "pending"}`,
      );
    } catch (error) {
      // Provider responses and credential-bearing errors never enter artifacts.
      failures += 1;
      results.push({
        ...fixture,
        ready: false,
        error:
          error instanceof RapidApiRequestError ? error.reason : "ratings_fetch_or_payload_failed",
        httpStatus: error instanceof RapidApiRequestError ? error.httpStatus : null,
        requestsConsumed: client.requestsSent() - before,
        quota: client.quota(),
      });
      console.log(`GW${fixture.gameweek} event ${fixture.eventId}: fetch/payload failed`);
    }
  }
  writeFileSync(
    output,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        commit: process.env.GITHUB_SHA ?? null,
        requests: client.requestsSent(),
        quota: client.quota(),
        failures,
        results,
      },
      null,
      2,
    ) + "\n",
  );
  if (failures > 0) process.exitCode = 1;
}
if (import.meta.main)
  main().catch(() => {
    console.error("Ratings audit failed; no database writes were attempted.");
    process.exitCode = 1;
  });
