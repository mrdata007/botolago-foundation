/** Read-only coverage audit. Never resolves players or ingests observations. */
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { RapidApiClient } from "../../src/backend/football/provider/rapidapi-client";
import { parseSofascoreLineups } from "../../src/backend/football/provider/sofascore-adapter";
import { buildConfirmedApiRatingLineups } from "../../supabase/functions/_shared/fantasy-api-ratings.ts";

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

export { buildApiRatingLineups as auditLineups } from "../../supabase/functions/_shared/fantasy-api-ratings.ts";
import { buildApiRatingLineups as auditLineups } from "../../supabase/functions/_shared/fantasy-api-ratings.ts";

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
  const results: unknown[] = [];
  let failures = 0;
  for (const fixture of fixtures) {
    try {
      if (!/^\d{1,12}$/.test(fixture.eventId)) throw new Error("ratings_event_id_invalid");
      const rawLineups = await client.getJson(`matches/get-lineups?matchId=${fixture.eventId}`);
      let audit = auditLineups(parseSofascoreLineups(rawLineups));
      let participationCheck = "not_needed";
      if (audit.players.some((p) => p.uncertain)) {
        try {
          const rawIncidents = await client.getJson(
            `matches/get-incidents?matchId=${fixture.eventId}`,
          );
          audit = buildConfirmedApiRatingLineups(rawLineups, rawIncidents);
          participationCheck = "confirmed_timeline_checked";
        } catch {
          failures += 1;
          participationCheck = "unavailable";
        }
      }
      results.push({
        ...fixture,
        ...audit,
        participationCheck,
        digest: createHash("sha256").update(JSON.stringify(audit.players)).digest("hex"),
      });
      console.log(
        `GW${fixture.gameweek} event ${fixture.eventId}: ${audit.rated}/${audit.participants} rated; ${audit.ready ? "ready" : "pending"}`,
      );
    } catch {
      // Provider responses and credential-bearing errors never enter artifacts.
      failures += 1;
      results.push({ ...fixture, ready: false, error: "ratings_fetch_or_payload_failed" });
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
