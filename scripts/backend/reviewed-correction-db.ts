/**
 * Reviewed corrections: the production reads and the one write, through the
 * Supabase Management API's SQL endpoint (as phase7e-production-admin-preflight
 * does). The write goes through api.service_record_fantasy_observation, so
 * every guard of that function applies; this file adds none of its own logic.
 */
import type { FixtureSnapshot, SquadMember } from "./reviewed-correction";

export const PRODUCTION_PROJECT_REF = "tkewgajrljbwgwedqsxn";

type Fetch = typeof fetch;

export class ManagementQueryError extends Error {
  constructor(
    readonly status: number,
    readonly databaseMessage: string,
  ) {
    super(`management_query_failed status=${status}`);
  }
}

export async function managementQuery(
  sql: string,
  options: { token: string; projectRef: string; fetchImpl?: Fetch },
): Promise<unknown[]> {
  const response = await (options.fetchImpl ?? fetch)(
    `https://api.supabase.com/v1/projects/${options.projectRef}/database/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${options.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    },
  );
  const text = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (response.status !== 200 && response.status !== 201) {
    const message =
      body && typeof body === "object" && "message" in body ? String(body.message) : "";
    throw new ManagementQueryError(response.status, message.slice(0, 500));
  }
  if (Array.isArray(body)) return body;
  const rows =
    (body as { result?: unknown; data?: unknown } | null)?.result ??
    (body as { data?: unknown } | null)?.data;
  return Array.isArray(rows) ? rows : [];
}

/** A literal that cannot be closed by its contents. */
export function dollarQuote(value: string): string {
  let tag = "rc";
  while (value.includes(`$${tag}$`)) tag += "x";
  return `$${tag}$${value}$${tag}$`;
}

export function snapshotSql(fixtureExternalIds: readonly string[]): string {
  if (fixtureExternalIds.some((id) => !/^[1-9]\d{0,14}$/.test(id)))
    throw new Error("invalid fixture external id");
  const ids = fixtureExternalIds.map((id) => `'${id}'`).join(",");
  const atKickoff = `tm.season_id = t.season_id
      and tm.valid_from <= t.kickoff_at::date
      and (tm.valid_to is null or tm.valid_to >= t.kickoff_at::date)
      and tm.team_id in (t.home_team_id, t.away_team_id)`;
  return `
with target as (
  select m.external_id, f.*
  from app_private.football_provider_mappings m
  join app.fixtures f on f.id = m.internal_entity_id
  where m.provider_name = 'sportsmonks' and m.entity_type = 'fixture' and m.active
    and m.external_id in (${ids})
)
select coalesce(jsonb_agg(jsonb_build_object(
  'fixtureId', t.id,
  'fixtureExternalId', t.external_id,
  'kickoffAt', t.kickoff_at,
  'status', t.status,
  'finalized', t.finalized_at is not null,
  'homeTeamId', t.home_team_id,
  'awayTeamId', t.away_team_id,
  'homeTeamName', (select name from app.teams where id = t.home_team_id),
  'awayTeamName', (select name from app.teams where id = t.away_team_id),
  'homeScore', t.home_score,
  'awayScore', t.away_score,
  'gameweek', gw.sequence_number,
  'gameweekStatus', gw.status,
  'adaptiveEnabled', coalesce(app_private.fantasy_adaptive_enabled(gw.id), false),
  'latestDigest', obs.digest,
  'latestSource', obs.source,
  'members', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'playerId', p.id, 'teamId', tm.team_id, 'displayName', p.display_name,
      'position', p.position, 'shirtNumber', tm.shirt_number,
      'sofascoreId', (select pm.external_id from app_private.football_provider_mappings pm
        where pm.provider_name = 'sofascore' and pm.entity_type = 'player'
          and pm.internal_entity_id = p.id and pm.active)
    )), '[]'::jsonb)
    from app.team_memberships tm join app.players p on p.id = tm.player_id
    where ${atKickoff}),
  'fantasyPlayerIds', (
    select coalesce(jsonb_agg(distinct fp.football_player_id), '[]'::jsonb)
    from app.fantasy_players fp
    join app.team_memberships tm on tm.player_id = fp.football_player_id
    where ${atKickoff})
)), '[]'::jsonb) as snapshot
from target t
left join lateral (
  select g.id, g.sequence_number, g.status from app.fantasy_fixture_assignments a
  join app.fantasy_gameweeks g on g.id = a.gameweek_id
  where a.fixture_id = t.id and a.superseded_at is null
  order by g.sequence_number desc limit 1) gw on true
left join lateral (
  select o.digest, o.source from app_private.fantasy_fixture_observations o
  where o.fixture_id = t.id order by o.observed_at desc, o.id desc limit 1) obs on true`;
}

/** One membership row per player: the snapshot can list a player twice. */
export function normalizeSnapshot(raw: unknown): FixtureSnapshot[] {
  if (!Array.isArray(raw)) throw new Error("snapshot is not a list");
  return raw.map((entry) => {
    const fixture = entry as FixtureSnapshot & { members: SquadMember[] };
    const seen = new Set<string>();
    const members = fixture.members.filter((member) => {
      if (seen.has(member.playerId)) return false;
      seen.add(member.playerId);
      return true;
    });
    return { ...fixture, members };
  });
}

const SERVICE_ROLE = `set_config('request.jwt.claims', '{"role":"service_role"}', true)`;

/**
 * Dry run: the real function runs with every guard, and a deliberate raise
 * carries its answer out and rolls the whole call back (CLAUDE.md).
 */
export function dryRunSql(fixtureId: string, payload: unknown): string {
  if (!/^[0-9a-f-]{36}$/.test(fixtureId)) throw new Error("invalid fixture id");
  return `do $dry$
declare result jsonb;
begin
  perform ${SERVICE_ROLE};
  result := api.service_record_fantasy_observation('${fixtureId}'::uuid, ${dollarQuote(JSON.stringify(payload))}::jsonb, 'reviewed-correction');
  raise exception 'REVIEWED_CORRECTION_DRY_RUN_OK %', result::text;
end $dry$`;
}

/** The write. The FROM subquery runs first (set_config is volatile, never pulled up). */
export function recordSql(fixtureId: string, payload: unknown): string {
  if (!/^[0-9a-f-]{36}$/.test(fixtureId)) throw new Error("invalid fixture id");
  return `select api.service_record_fantasy_observation('${fixtureId}'::uuid, ${dollarQuote(JSON.stringify(payload))}::jsonb, 'reviewed-correction') as result
from (select ${SERVICE_ROLE}) as service_role`;
}

/** The database's own code from an error message, or the dry run's answer. */
export function readDryRun(
  error: unknown,
): { ok: true; result: Record<string, unknown> } | { ok: false; code: string } {
  const message = error instanceof ManagementQueryError ? error.databaseMessage : "";
  const ok = /REVIEWED_CORRECTION_DRY_RUN_OK (\{.*\})/.exec(message);
  if (ok) {
    try {
      return { ok: true, result: JSON.parse(ok[1]!) as Record<string, unknown> };
    } catch {
      return { ok: false, code: "dry_run_answer_unreadable" };
    }
  }
  const code = /\b(adaptive_[a-z_]+|fantasy_[a-z_]+|forbidden|reconciled_[a-z_]+)\b/.exec(message);
  return { ok: false, code: code?.[1] ?? "database_refused" };
}
