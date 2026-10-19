// Unattended approved-ID-only collection for the existing football-live-refresh
// scheduler. SQL owns discovery, retry dates, deadlines, leases and budgets.
import { canonicalJson, sha256Hex } from "./canonical-json.ts";
import { buildReviewedIdentitySnapshot, type MappingRowInput } from "./reviewed-identities.ts";
import { prepareSofascoreObservation } from "./sofascore-fantasy.ts";
import {
  parseSofascoreIncidents,
  parseSofascoreLineups,
  parseSofascoreStatistics,
  parseSofascoreStoppage,
} from "./sofascore-performance-parse.ts";
import { RapidApiError } from "./rapidapi-client.ts";
import type { SofascoreShadowClient } from "./sofascore-fixtures.ts";
import type { FixtureRpcClient } from "./sportsmonks-fixtures.ts";

const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9-]{36}$/i.test(v);
const id = (v: unknown): boolean =>
  (typeof v === "number" && Number.isSafeInteger(v) && v > 0) ||
  (typeof v === "string" && /^[1-9]\d{0,11}$/.test(v));
class CollectionFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function validateCollectionLineups(raw: unknown) {
  if (!object(raw) || raw.confirmed !== true) throw new CollectionFailure("lineups_unconfirmed");
  const seen = new Set<string>();
  for (const side of ["home", "away"]) {
    const group = raw[side];
    if (
      !object(group) ||
      !Array.isArray(group.players) ||
      group.players.length < 11 ||
      group.players.length > 40
    )
      throw new CollectionFailure("lineups_invalid");
    let starters = 0;
    for (const p of group.players) {
      if (!object(p) || !object(p.player) || !id(p.player.id) || typeof p.substitute !== "boolean")
        throw new CollectionFailure("player_identity_invalid");
      const key = String(p.player.id);
      if (seen.has(key)) throw new CollectionFailure("duplicate_player_id");
      seen.add(key);
      if (!p.substitute) starters++;
      if (p.statistics != null) {
        if (!object(p.statistics)) throw new CollectionFailure("statistics_invalid");
        for (const field of [
          "minutesPlayed",
          "rating",
          "goals",
          "goalAssist",
          "ownGoals",
          "saves",
          "totalPass",
          "penaltyMiss",
        ]) {
          const v = p.statistics[field];
          if (v == null) {
            delete p.statistics[field];
            continue;
          }
          const max = field === "rating" ? 10 : field === "minutesPlayed" ? 130 : 100_000;
          if (
            typeof v !== "number" ||
            !Number.isFinite(v) ||
            v < 0 ||
            v > max ||
            (field !== "rating" && !Number.isInteger(v)) ||
            (field === "rating" && Math.abs(v * 100 - Math.round(v * 100)) > 1e-7)
          )
            throw new CollectionFailure("statistic_range_invalid");
        }
      } else delete p.statistics;
    }
    if (starters !== 11) throw new CollectionFailure("starting_sides_invalid");
  }
  return parseSofascoreLineups(raw);
}

interface Candidate {
  fixture_id: string;
  event_id: string;
  season_id: string;
  home_external: string;
  away_external: string;
}
function candidate(raw: unknown): Candidate {
  if (
    !object(raw) ||
    !uuid(raw.fixture_id) ||
    !id(raw.event_id) ||
    !id(raw.season_id) ||
    !id(raw.home_external) ||
    !id(raw.away_external)
  )
    throw new CollectionFailure("fixture_mapping_missing");
  return raw as unknown as Candidate;
}
function validateEvent(raw: unknown, c: Candidate) {
  const e = object(raw) && object(raw.event) ? raw.event : null;
  if (
    !e ||
    !object(e.tournament) ||
    !object(e.tournament.uniqueTournament) ||
    e.tournament.uniqueTournament.id !== 937 ||
    !object(e.season) ||
    String(e.season.id) !== c.season_id ||
    String(e.id) !== c.event_id ||
    !object(e.homeTeam) ||
    String(e.homeTeam.id) !== c.home_external ||
    !object(e.awayTeam) ||
    String(e.awayTeam.id) !== c.away_external ||
    !object(e.status) ||
    e.status.type !== "finished" ||
    ![100, 110, 120].includes(Number(e.status.code))
  )
    throw new CollectionFailure("event_identity_or_status_invalid");
  return e;
}

export interface CollectionDependencies {
  client: FixtureRpcClient;
  rapid: SofascoreShadowClient;
  now: Date;
  dryRun?: boolean;
  holder?: string;
  log?: (line: string) => void;
}
/** Dry-run is a read-only plan: no provider use, lease, observation or scoring writes. */
export async function runSofascoreCollection(deps: CollectionDependencies) {
  const rpc = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await deps.client.schema("api").rpc(name, args);
    if (r.error) throw new CollectionFailure("collection_database_error");
    return r.data;
  };
  const holder = deps.holder ?? crypto.randomUUID();
  if (deps.dryRun)
    return {
      status: 200,
      body: { dryRun: true, plan: await rpc("service_sofascore_collection_plan") },
    };
  const claim = await rpc("service_sofascore_collection_claim", { p_holder: holder });
  if (!object(claim) || claim.status !== "claimed")
    return {
      status: 200,
      body: { job: "ratings_collection", status: object(claim) ? claim.status : "unavailable" },
    };
  const started = Date.now();
  let requests = 0,
    fetched = 0,
    validated = 0,
    created = 0,
    missingRatings = 0;
  let code = "collected",
    cooldownSeconds = 0,
    quotaRemaining: number | null = null;
  const results: Record<string, unknown>[] = [];
  const read = async (path: string) => {
    if (requests >= 8 || Date.now() - started > 45_000)
      throw new CollectionFailure("collection_pass_bound");
    if ((await rpc("service_sofascore_collection_reserve", { p_holder: holder })) !== true)
      throw new CollectionFailure("collection_budget_or_lease_stop");
    requests++;
    const result = await deps.rapid.getJson(path);
    quotaRemaining = result.quota.remaining;
    const body = result.data;
    if (object(body) && object(body.error) && Number(body.error.code) === 404)
      throw new CollectionFailure("upstream_data_unavailable");
    return body;
  };
  try {
    const due = Array.isArray(claim.due) ? claim.due : [];
    for (const raw of due.slice(0, 2)) {
      let c: Candidate | undefined;
      let request: unknown = null;
      let meta: Record<string, unknown> = { code: "collection_failed", validated: false };
      try {
        c = candidate(raw);
        const event = validateEvent(await read(`matches/detail?matchId=${c.event_id}`), c);
        const lineups = validateCollectionLineups(
          await read(`matches/get-lineups?matchId=${c.event_id}`),
        );
        const incidentsRaw = await read(`matches/get-incidents?matchId=${c.event_id}`);
        let statisticsRaw: unknown;
        try {
          statisticsRaw = await read(`matches/get-statistics?matchId=${c.event_id}`);
        } catch (e) {
          if (
            (e instanceof CollectionFailure && e.code === "upstream_data_unavailable") ||
            (e instanceof RapidApiError && e.code === "data_unavailable")
          )
            statisticsRaw = null;
          else throw e;
        }
        fetched++;
        const missing = lineups.players.filter(
          (p) =>
            (p.starter ||
              (p.stats?.minutesPlayed ?? 0) > 0 ||
              p.stats?.rating != null ||
              (p.stats != null && p.stats.minutesPlayed == null)) &&
            p.stats?.rating == null,
        );
        missingRatings += missing.length;
        const ctx = await rpc("service_sofascore_fantasy_context", {
          p_fixture_id: c.fixture_id,
          p_player_ids: lineups.players.map((p) => p.externalId),
        });
        if (
          !object(ctx) ||
          ctx.found !== true ||
          ctx.sofascoreEventId !== c.event_id ||
          ctx.status !== "finished" ||
          ctx.finalized !== true ||
          !uuid(ctx.homeTeamId) ||
          !uuid(ctx.awayTeamId) ||
          ctx.adaptiveEnabled !== true
        )
          throw new CollectionFailure("fixture_context_invalid");
        const hs = object(event.homeScore) ? event.homeScore.current : null,
          as = object(event.awayScore) ? event.awayScore.current : null;
        if (ctx.homeScore !== hs || ctx.awayScore !== as)
          throw new CollectionFailure("final_score_mismatch");
        const mappings: MappingRowInput[] = (Array.isArray(ctx.players) ? ctx.players : []).flatMap(
          (p) =>
            object(p) &&
            p.active === true &&
            p.reviewed === true &&
            uuid(p.id) &&
            uuid(p.appPlayerId) &&
            typeof p.externalId === "string"
              ? [
                  {
                    mappingId: p.id,
                    provider: "sofascore" as const,
                    externalId: p.externalId,
                    appPlayerId: p.appPlayerId,
                    active: true,
                    reviewed: true,
                    version: typeof p.version === "string" ? p.version : null,
                    updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : "",
                  },
                ]
              : [],
        );
        const snapshot = await buildReviewedIdentitySnapshot(mappings, deps.now.toISOString());
        // No shirt/name matching, auto-map, player creation, or new exclusions.
        if (
          lineups.players.some(
            (p) =>
              (p.starter || (p.stats?.minutesPlayed ?? 0) > 0 || p.stats?.rating != null) &&
              !mappings.some((m) => m.externalId === p.externalId),
          )
        )
          throw new CollectionFailure("approved_player_mapping_missing");
        const parts = {
          lineups,
          incidents: parseSofascoreIncidents(incidentsRaw),
          statistics: statisticsRaw === null ? [] : parseSofascoreStatistics(statisticsRaw),
          stoppage: parseSofascoreStoppage(incidentsRaw),
        };
        const digest = await sha256Hex(canonicalJson({ parts, mappingDigest: snapshot.digest }));
        const prepared = await prepareSofascoreObservation({
          observedAt: deps.now.toISOString(),
          snapshot,
          binding: {
            appFixtureId: c.fixture_id,
            homeTeamId: ctx.homeTeamId,
            awayTeamId: ctx.awayTeamId,
          },
          payloadDigest: digest,
          match: {
            ...parts,
            summary: {
              provider: "sofascore",
              externalId: c.event_id,
              finished: true,
              kickoffAt: "",
              homeName: "",
              awayName: "",
              round: null,
              homeScore: Number(hs),
              awayScore: Number(as),
            },
          },
        });
        if (!prepared.request || prepared.blockers.length > 0)
          throw new CollectionFailure("observation_validation_held");
        request = prepared.request;
        meta = {
          code: missing.length ? "ratings_pending" : "collected",
          validated: true,
          missingRatings: missing.length,
          missingPlayerIds: missing.map((p) => p.externalId),
          digest,
          coverage: lineups.fullCoverage ? "full" : "core",
          matchData: { version: 1, ...parts },
          ratings: Object.fromEntries(
            lineups.players
              .filter((p) => p.stats?.rating != null)
              .map((p) => [p.externalId, p.stats!.rating]),
          ),
        };
      } catch (error) {
        const transport = error instanceof RapidApiError;
        const failure =
          error instanceof CollectionFailure
            ? error.code
            : transport
              ? error.code
              : "invalid_provider_payload";
        meta = { ...meta, code: failure, validated: false };
        code = failure;
        if (transport && (error.httpStatus === 401 || error.httpStatus === 403))
          cooldownSeconds = 86400;
        else if (transport && error.code === "provider_rate_limited")
          cooldownSeconds = Math.max(3600, error.retryAfterSeconds ?? 0);
        else if (transport && error.code === "provider_unavailable") cooldownSeconds = 600;
      }
      if (object(raw) && uuid(raw.fixture_id)) {
        const outcome = await rpc("service_sofascore_collection_commit", {
          p_holder: holder,
          p_fixture_id: raw.fixture_id,
          p_request: request,
          p_meta: meta,
        });
        if (object(outcome) && outcome.validated === true) {
          validated++;
          if (outcome.created === true) created++;
        } else
          code =
            object(outcome) && typeof outcome.code === "string"
              ? outcome.code
              : "collection_commit_failed";
        const { matchData: _data, ratings: _ratings, ...safeMeta } = meta;
        results.push({ fixtureId: raw.fixture_id, eventId: c?.event_id ?? null, ...safeMeta });
      }
      if (
        cooldownSeconds ||
        code === "collection_budget_or_lease_stop" ||
        code === "collection_pass_bound"
      )
        break;
    }
  } catch {
    code = "collection_database_error";
  }
  if (code === "collected" && missingRatings > 0) code = "ratings_pending";
  const summary = {
    code,
    fetched,
    validated,
    created,
    missingRatings,
    requests,
    cooldownSeconds,
    quotaRemaining,
    results,
  };
  // This atomic finalizer is fenced. On an ambiguous failure the lease is left
  // intact; the next claim traces the expired run and resumes durable queue state.
  await rpc("service_sofascore_collection_finish", { p_holder: holder, p_summary: summary });
  deps.log?.(JSON.stringify({ event: "football_sofascore_collection", ...summary }));
  return {
    status: code === "collection_database_error" ? 503 : 200,
    body: { job: "ratings_collection", ...summary },
  };
}
