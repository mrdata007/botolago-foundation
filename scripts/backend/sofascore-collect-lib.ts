/** Database-free collection. API IDs here are evidence, never BotolaGO identity mappings. */
import { z } from "zod";
import { parseSofascoreLineups } from "../../src/backend/football/provider/sofascore-adapter";
import {
  collapseReplacedEvents,
  parseSofascoreEventList,
  sofascoreLastMatchesPath,
} from "../../src/backend/football/provider/sofascore-schedule";
import {
  RapidApiRequestError,
  type RapidApiClient,
} from "../../src/backend/football/provider/rapidapi-client";
import { auditLineups } from "./sofascore-ratings-audit";

export const SOURCE = "sofascore:api-dojo-rapidapi";
const id = z.number().int().positive().max(999_999_999_999);
const team = z.object({ id, name: z.string().min(1).max(160) });
const eventSchema = z.object({
  id,
  startTimestamp: z.number().int().nonnegative().max(8_640_000_000),
  status: z.object({ type: z.string(), code: z.number().int() }),
  tournament: z.object({ uniqueTournament: z.object({ id }) }),
  season: z.object({ id }),
  roundInfo: z.object({ round: id }).optional(),
  homeTeam: team,
  awayTeam: team,
});
export type CollectedEvent = z.infer<typeof eventSchema>;
export class CollectionError extends Error {
  constructor(
    readonly reason: string,
    readonly field: string | null = null,
  ) {
    super(reason);
  }
}
function checked<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new CollectionError("invalid_payload");
  return parsed.data;
}
export interface Observation {
  data: unknown;
  fetchedAt: string;
  transport: "live" | "cache";
}
export type Read = (path: string) => Promise<Observation>;
export function safeError(error: unknown) {
  if (error instanceof RapidApiRequestError)
    return { reason: error.reason, httpStatus: error.httpStatus, retryAfterMs: error.retryAfterMs };
  if (error instanceof CollectionError)
    return { reason: error.reason, field: error.field, httpStatus: null, retryAfterMs: null };
  if (
    error instanceof Error &&
    ["ratings_player_id_invalid", "ratings_lineups_missing"].includes(error.message)
  )
    return { reason: error.message, httpStatus: null, retryAfterMs: null };
  return { reason: "collection_or_payload_failed", httpStatus: null, retryAfterMs: null };
}
export function parseEvent(raw: unknown, eventId: string, now: number): CollectedEvent {
  const { event } = checked(z.object({ event: eventSchema }), raw);
  if (String(event.id) !== eventId) throw new CollectionError("event_identity_mismatch");
  if (event.tournament.uniqueTournament.id !== 937)
    throw new CollectionError("foreign_competition");
  if (
    event.status.type !== "finished" ||
    ![100, 110, 120].includes(event.status.code) ||
    event.startTimestamp * 1000 > now
  )
    throw new CollectionError("event_not_finished");
  if (event.homeTeam.id === event.awayTeam.id) throw new CollectionError("duplicate_match_teams");
  return event;
}
const rawPlayer = z
  .object({
    player: z
      .object({ id, name: z.string().max(160), position: z.string().optional() })
      .passthrough(),
    substitute: z.boolean(),
    shirtNumber: z.number().int().nonnegative().optional(),
    position: z.string().optional(),
    statistics: z.record(z.string(), z.unknown()).nullish(),
  })
  .passthrough();
const rawLineups = z.object({
  confirmed: z.boolean().optional(),
  home: z.object({ players: z.array(rawPlayer).min(11).max(40) }),
  away: z.object({ players: z.array(rawPlayer).min(11).max(40) }),
});
const signed = new Set([
  "keeperSaveValue",
  "goalsPrevented",
  "passValueNormalized",
  "defensiveValueNormalized",
  "goalkeeperValueNormalized",
  "dribbleValueNormalized",
  "shotValueNormalized",
]);
// Counts whose units were established in the coverage audit. Other finite numeric
// metrics can be fractional; do not infer their units from an unfamiliar name.
const counters = new Set([
  "minutesPlayed",
  "goals",
  "goalAssist",
  "ownGoals",
  "saves",
  "totalPass",
  "penaltyMiss",
  "totalShots",
  "onTargetScoringAttempt",
  "accuratePass",
  "keyPass",
  "totalTackle",
  "wonTackle",
  "interceptionWon",
  "totalClearance",
  "duelWon",
  "duelLost",
  "fouls",
  "wasFouled",
  "bigChanceMissed",
  "bigChanceCreated",
  "possessionLostCtrl",
  "dispossessed",
  "totalCross",
  "accurateCross",
  "totalLongBalls",
  "accurateLongBalls",
  "penaltyWon",
  "penaltyConceded",
  "goodHighClaim",
  "crossNotClaimed",
  "totalKeeperSweeper",
  "accurateKeeperSweeper",
  "savedShotsFromInsideTheBox",
  "totalOffside",
  "touches",
  "totalContest",
  "wonContest",
  "aerialWon",
  "aerialLost",
  "errorLeadToAShot",
  "errorLeadToAGoal",
]);
/** Preserve numeric statistics, but reject invalid counts/ranges; missing stays null/absent. */
export function numericStatistics(raw: Record<string, unknown> | null | undefined) {
  const values: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,59}$/.test(key))
      throw new CollectionError("invalid_statistic_key");
    if (value === null) {
      values[key] = null;
      continue;
    }
    if (key === "ratingVersions" || key === "statisticsType") continue;
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value > 100_000 ||
      value < (signed.has(key) ? -100 : 0)
    )
      throw new CollectionError("invalid_statistic_value", key);
    if (counters.has(key) && !Number.isInteger(value))
      throw new CollectionError("invalid_statistic_count", key);
    if (key === "minutesPlayed" && value > 130) throw new CollectionError("invalid_minutes");
    if (key === "rating" && (value > 10 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-7))
      throw new CollectionError("invalid_rating");
    values[key] = value;
  }
  return values;
}
export function collectLineups(
  event: CollectedEvent,
  raw: unknown,
  observation: Observation,
  evidenceKind: "authenticated" | "mock" | "historical_replay",
) {
  const lineup = checked(rawLineups, raw);
  if (lineup.confirmed === false) throw new CollectionError("lineups_unconfirmed");
  // Explicit null is missing, not an invalid number. Keep the shared parser's coverage rules.
  const normalize = (side: typeof lineup.home) => ({
    players: side.players.map((p) => ({
      ...p,
      statistics:
        p.statistics == null
          ? undefined
          : Object.fromEntries(Object.entries(p.statistics).filter(([, v]) => v !== null)),
    })),
  });
  const numeric = [...lineup.home.players, ...lineup.away.players].map((p) =>
    numericStatistics(p.statistics),
  );
  const parsed = parseSofascoreLineups({
    home: normalize(lineup.home),
    away: normalize(lineup.away),
  });
  const audit = auditLineups(parsed);
  if (!audit.validSides) throw new CollectionError("invalid_starting_sides");
  const players = audit.players.map((p, index) => {
    const values = { ...numeric[index] };
    const unreliableStatistics = !parsed.fullCoverage
      ? ["goalAssist", "totalShots", "saves"].filter((key) => key in values)
      : [];
    for (const key of unreliableStatistics) values[key] = null;
    return {
      eventId: String(event.id),
      matchSideTeamId: String(p.side === "home" ? event.homeTeam.id : event.awayTeam.id),
      playerId: p.externalId,
      side: p.side,
      starter: p.starter,
      appearance: p.appeared ? "appeared" : p.uncertain ? "uncertain" : "did_not_appear",
      minutes: p.minutes,
      rating: p.rating,
      ratingState:
        p.rating !== null
          ? "available"
          : p.appeared || p.uncertain
            ? "unavailable"
            : "not_applicable",
      statistics: values,
      availableStatistics: Object.keys(values)
        .filter((k) => values[k] !== null)
        .sort(),
      unreliableStatistics,
      source: SOURCE,
      observedAt: observation.fetchedAt,
      transport: observation.transport,
      evidenceKind,
    };
  });
  return {
    coverage: parsed.fullCoverage ? "full" : "incomplete",
    ratingState:
      audit.missingRatingIds.length === 0
        ? "complete"
        : audit.rated === 0
          ? "unavailable"
          : "partial",
    participants: audit.participants,
    ratedPlayers: audit.rated,
    missingRatingIds: audit.missingRatingIds,
    availableStatistics: [...new Set(players.flatMap((p) => p.availableStatistics))].sort(),
    unreliableStatistics: [...new Set(players.flatMap((p) => p.unreliableStatistics))].sort(),
    players,
  };
}

export interface DiscoveryOptions {
  seasonId?: number;
  maxPages: number;
  maxAgeDays: number;
  now: number;
}
/** No hardcoded season. Check live seasons, then bounded pages; never call a partial round complete. */
export async function discoverRound(read: Read, options: DiscoveryOptions) {
  const seasonsObservation = await read("tournaments/get-seasons?tournamentId=937");
  const { seasons } = checked(
    z.object({
      seasons: z
        .array(z.object({ id, name: z.string(), year: z.string() }))
        .min(1)
        .max(100),
    }),
    seasonsObservation.data,
  );
  const season = options.seasonId ? seasons.find((s) => s.id === options.seasonId) : seasons[0];
  if (!season) throw new CollectionError("season_not_listed");
  const observations = [seasonsObservation];
  const all = new Map<string, ReturnType<typeof parseSofascoreEventList>["events"][number]>();
  let ended = false;
  let pages = 0;
  for (; pages < options.maxPages; pages++) {
    const observation = await read(sofascoreLastMatchesPath(937, season.id, pages));
    observations.push(observation);
    const page = parseSofascoreEventList(observation.data, { uniqueTournamentId: 937 });
    if (page.malformedCount || page.foreignTournamentCount || page.unknownStatus.length)
      throw new CollectionError("discovery_invalid_events");
    let added = 0;
    for (const e of page.events) {
      if (e.seasonId !== String(season.id)) throw new CollectionError("discovery_season_mismatch");
      const previous = all.get(e.sofascoreEventId);
      if (previous && JSON.stringify(previous) !== JSON.stringify(e))
        throw new CollectionError("discovery_conflicting_events");
      if (!previous) added++;
      all.set(e.sofascoreEventId, e);
    }
    ended = !page.hasNextPage;
    // Eight finished distinct pairings/16 teams prove a round within the Botola 16-club format.
    if (ended || completeRounds([...all.values()], options.now, options.maxAgeDays).length > 0) {
      pages++;
      break;
    }
    if (added === 0) throw new CollectionError("discovery_repeated_page");
  }
  const rounds = completeRounds([...all.values()], options.now, options.maxAgeDays);
  const round = rounds[0];
  if (!round)
    throw new CollectionError(ended ? "no_complete_recent_round" : "discovery_page_bound");
  return {
    season,
    round: round[0]!.round,
    eventIds: round.map((e) => e.sofascoreEventId),
    events: round,
    pages,
    observedAt: observations.map((o) => o.fetchedAt),
    transport: observations.every((o) => o.transport === "live") ? "live" : "cache_or_mixed",
  };
}
function completeRounds(
  events: ReturnType<typeof parseSofascoreEventList>["events"],
  now: number,
  age: number,
) {
  const groups = new Map<number, (typeof events)[number][]>();
  for (const e of collapseReplacedEvents(events).events) {
    if (e.round === null) continue;
    const group = groups.get(e.round) ?? [];
    group.push(e);
    groups.set(e.round, group);
  }
  return [...groups.values()]
    .filter(
      (group) =>
        group.length === 8 &&
        new Set(group.flatMap((e) => [e.home.id, e.away.id])).size === 16 &&
        group.every(
          (e) =>
            e.status === "finished" &&
            [100, 110, 120].includes(e.rawStatusCode) &&
            Date.parse(e.startsAt) <= now &&
            Date.parse(e.startsAt) >= now - age * 86_400_000,
        ),
    )
    .sort(
      (a, b) =>
        Math.max(...b.map((e) => Date.parse(e.startsAt))) -
        Math.max(...a.map((e) => Date.parse(e.startsAt))),
    );
}

export interface CollectionOptions {
  eventIds: string[];
  discovery?: DiscoveryOptions;
  playerStatistics: number;
  incidents: boolean;
  now: () => number;
  evidenceKind?: "authenticated" | "mock" | "historical_replay";
}
export async function collect(
  read: Read,
  client: Pick<RapidApiClient, "requestsSent" | "quota" | "stoppedReason">,
  options: CollectionOptions,
) {
  const evidenceKind = options.evidenceKind ?? "authenticated";
  const results = [];
  let discovery: Awaited<ReturnType<typeof discoverRound>> | null = null;
  const errors: ReturnType<typeof safeError>[] = [];
  const discoveryStart = client.requestsSent();
  if (options.discovery) {
    try {
      discovery = await discoverRound(read, options.discovery);
    } catch (error) {
      errors.push(safeError(error));
    }
  }
  const discoveryRequests = client.requestsSent() - discoveryStart;
  const ids = [...new Set([...options.eventIds, ...(discovery?.eventIds ?? [])])];
  for (const eventId of ids) {
    const before = client.requestsSent();
    const observations: { endpoint: string; fetchedAt: string; transport: string }[] = [];
    const observe = async (path: string) => {
      const value = await read(path);
      observations.push({
        endpoint: path.split("?")[0]!,
        fetchedAt: value.fetchedAt,
        transport: value.transport,
      });
      return value;
    };
    const sectionErrors: {
      endpoint: string;
      playerId?: string;
      error: ReturnType<typeof safeError>;
    }[] = [];
    let event: CollectedEvent | null = null;
    let lineup: ReturnType<typeof collectLineups> | null = null;
    const playerStatistics: unknown[] = [];
    let incidentCount: number | null = null;
    try {
      event = parseEvent(
        (await observe(`matches/detail?matchId=${eventId}`)).data,
        eventId,
        options.now(),
      );
      const expected = discovery?.events.find((e) => e.sofascoreEventId === eventId);
      if (
        expected &&
        (expected.seasonId !== String(event.season.id) ||
          expected.round !== event.roundInfo?.round ||
          expected.home.id !== String(event.homeTeam.id) ||
          expected.away.id !== String(event.awayTeam.id))
      )
        throw new CollectionError("discovered_event_changed");
      const lineups = await observe(`matches/get-lineups?matchId=${eventId}`);
      lineup = collectLineups(event, lineups.data, lineups, evidenceKind);
      // Diagnostic only: do not merge a second endpoint into lineup ratings/coverage.
      for (const p of lineup.players
        .filter((p) => p.appearance === "appeared")
        .slice(0, options.playerStatistics)) {
        try {
          const observation = await observe(
            `matches/get-player-statistics?matchId=${eventId}&playerId=${p.playerId}`,
          );
          const data = checked(
            z.object({ statistics: z.record(z.string(), z.unknown()) }),
            observation.data,
          );
          const statistics = numericStatistics(data.statistics);
          if (lineup.coverage !== "full")
            for (const key of ["goalAssist", "totalShots", "saves"])
              if (key in statistics) statistics[key] = null;
          playerStatistics.push({
            eventId,
            matchSideTeamId: p.matchSideTeamId,
            playerId: p.playerId,
            statistics,
            source: SOURCE,
            observedAt: observation.fetchedAt,
            transport: observation.transport,
            evidenceKind,
          });
        } catch (error) {
          sectionErrors.push({
            endpoint: "matches/get-player-statistics",
            playerId: p.playerId,
            error: safeError(error),
          });
          if (client.stoppedReason()) break;
        }
      }
      if (options.incidents && !client.stoppedReason()) {
        try {
          const observation = await observe(`matches/get-incidents?matchId=${eventId}`);
          const data = checked(z.object({ incidents: z.array(z.unknown()) }), observation.data);
          incidentCount = data.incidents.length;
        } catch (error) {
          sectionErrors.push({ endpoint: "matches/get-incidents", error: safeError(error) });
        }
      }
    } catch (error) {
      sectionErrors.push({
        endpoint: lineup ? "optional_sections" : event ? "matches/get-lineups" : "matches/detail",
        error: safeError(error),
      });
    }
    results.push({
      eventId,
      event: event
        ? {
            home: event.homeTeam,
            away: event.awayTeam,
            seasonId: event.season.id,
            round: event.roundInfo?.round ?? null,
            kickoffAt: new Date(event.startTimestamp * 1000).toISOString(),
          }
        : null,
      ...lineup,
      status: lineup ? (sectionErrors.length ? "partial" : "collected") : "failed",
      playerStatistics,
      incidentCount,
      observations,
      errors: sectionErrors,
      requestsConsumed: client.requestsSent() - before,
      quota: client.quota(),
      capturedAt: new Date(options.now()).toISOString(),
    });
  }
  const failed = errors.length > 0 || results.some((r) => r.errors.length > 0);
  const incomplete = results.some((r) => r.ratingState !== "complete" || r.coverage !== "full");
  const freshAuthenticatedPull =
    evidenceKind === "authenticated" &&
    !failed &&
    results.length > 0 &&
    results.every((r) => r.observations.every((o) => o.transport === "live")) &&
    (!discovery || discovery.transport === "live");
  return {
    schemaVersion: 1,
    source: SOURCE,
    evidenceKind,
    capturedAt: new Date(options.now()).toISOString(),
    freshAuthenticatedPull,
    discovery,
    discoveryRequests,
    errors,
    results,
    requestsConsumed: client.requestsSent(),
    quota: client.quota(),
    exitCode: failed ? 3 : incomplete ? 4 : 0,
  };
}

function cell(value: unknown) {
  const text =
    value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  // Spreadsheet formula injection guard, including optional free-text fields.
  return '"' + (/^[=+\-@\t\r]/.test(text) ? "'" : "") + text.replaceAll('"', '""') + '"';
}
export function csvReport(report: Awaited<ReturnType<typeof collect>>) {
  const columns = [
    "eventId",
    "matchSideTeamId",
    "playerId",
    "side",
    "starter",
    "appearance",
    "minutes",
    "rating",
    "ratingState",
    "statistics",
    "availableStatistics",
    "unreliableStatistics",
    "source",
    "observedAt",
    "transport",
    "evidenceKind",
  ] as const;
  return (
    columns.join(",") +
    "\n" +
    report.results
      .flatMap((r) => r.players ?? [])
      .map((p) => columns.map((k) => cell(p[k])).join(","))
      .join("\n") +
    "\n"
  );
}
