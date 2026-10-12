// SofaScore match details for the Edge runtime: goals, cards, substitutions,
// lineups and team statistics, in the exact payload the SportsMonks path sends
// to api.ingest_football_match_details (see sportsmonks-match-details.ts).
//
// Three requests per fixture, always in this order and always all read before
// anything is written for that fixture:
//   matches/get-incidents   -> events (goals, cards, substitutions)
//   matches/get-lineups     -> lineups (starters, bench, shirt, position, formation)
//   matches/get-statistics  -> team statistics (period ALL only)
// A quota refusal (`provider_rate_limited`) or any other provider failure on
// one of them leaves that fixture entirely unwritten; a refusal also stops the
// run, so the remaining fixtures keep their quota.
//
// Rules this module keeps (they come from what the real responses showed, see
// tests/fixtures/providers/sofascore and
// docs/audits/2026-10-01-sofascore-rapidapi-coverage-test.md):
//   * Goals come from INCIDENTS only. A lineup player's `goals` can undercount.
//   * The side of everything is the FIXTURE's home/away, never a lineup's
//     `teamId` (the `home` and `away` objects of the lineups reply, and the
//     incident's `isHome`, are the provider's own split). The club ids sent are
//     the fixture's SofaScore team ids, which the database checks against the
//     fixture's two clubs.
//   * Players are sent by their SofaScore id and name. The RPC resolves them
//     through the `sofascore` player mappings where those exist; a player with
//     no mapping is stored by name (lineups) or as the event's `detail`
//     (timeline), exactly as an unknown SportsMonks player is.
//   * No pressure index and no absences are sent (SofaScore has neither):
//     `pressure: []` and `absences: null`, which the RPC reads as "keep what is
//     stored".
//
// Dependency-free apart from sibling shared modules, so it runs under Bun
// (tests) and Deno (the Edge Function).

import { RapidApiError, type RapidApiQuota } from "./rapidapi-client.ts";
import { SOFASCORE_PROVIDER_NAME, type SofascoreShadowClient } from "./sofascore-fixtures.ts";
import type { FixtureRpcClient } from "./sportsmonks-fixtures.ts";

type JsonRecord = Record<string, unknown>;
type Side = "home" | "away";

export type SofascoreDetailsScope = "live" | "backfill";

export type SofascoreMatchEventType =
  | "goal"
  | "own_goal"
  | "penalty_goal"
  | "missed_penalty"
  | "yellow_card"
  | "second_yellow"
  | "red_card"
  | "substitution";

export type SofascoreStatisticCode =
  | "possession"
  | "shots"
  | "shots_on_target"
  | "corners"
  | "fouls"
  | "offsides"
  | "saves"
  | "passes"
  | "expected_goals";

export interface SofascoreDetailsEvent {
  readonly key: string;
  readonly type: SofascoreMatchEventType;
  readonly teamExternalId: string;
  readonly playerExternalId: string | null;
  readonly relatedPlayerExternalId: string | null;
  readonly detail: string | null;
  readonly minute: number;
  readonly addedTime: number;
  readonly period: "first_half" | "second_half" | "extra_time";
  readonly sequence: number;
}

export interface SofascoreDetailsStatistic {
  readonly code: SofascoreStatisticCode;
  readonly teamExternalId: string;
  readonly value: number;
  readonly displayValue: null;
}

export interface SofascoreDetailsLineupPlayer {
  readonly playerExternalId: string | null;
  readonly playerName: string | null;
  readonly slot: "starting" | "bench";
  readonly position: "goalkeeper" | "defender" | "midfielder" | "forward" | null;
  readonly shirtNumber: number | null;
  readonly order: number;
}

export interface SofascoreDetailsLineup {
  readonly teamExternalId: string;
  readonly formation: string | null;
  readonly confirmed: true;
  readonly players: readonly SofascoreDetailsLineupPlayer[];
}

/** The `p_details` argument of api.ingest_football_match_details. */
export interface SofascoreMatchDetailsPayload {
  readonly providerUpdatedAt: string;
  readonly sourceSequence: number;
  readonly events: readonly SofascoreDetailsEvent[];
  readonly statistics: readonly SofascoreDetailsStatistic[];
  readonly lineups: readonly SofascoreDetailsLineup[];
  readonly pressure: readonly [];
  readonly absences: null;
}

export interface SofascoreDetailsSkipped {
  events: number;
  statistics: number;
  lineupPlayers: number;
}

export interface SofascoreMatchDetails {
  readonly payload: SofascoreMatchDetailsPayload;
  readonly skipped: SofascoreDetailsSkipped;
}

/** The fixture's two clubs as SofaScore team ids. */
export interface SofascoreFixtureTeams {
  readonly home: string;
  readonly away: string;
}

export const SOFASCORE_DETAILS_PER_TICK_DEFAULT = 4;
export const SOFASCORE_DETAILS_PER_TICK_MAX = 8;
export const SOFASCORE_DETAILS_BACKFILL_DEFAULT = 4;
export const SOFASCORE_DETAILS_BACKFILL_MAX = 10;
export const SOFASCORE_REQUESTS_PER_FIXTURE = 3;

const MAX_EVENTS = 400;
const MAX_LINEUP_ROWS_PER_TEAM = 60;

/**
 * SofaScore team statistic keys the app has a definition for
 * (`app.statistic_definitions`). `totalShotsOnGoal`, `shotsOnGoal` and
 * `goalkeeperSaves` were read from real responses (tests/fixtures). The other
 * keys are SofaScore's published names for the same figures; a key absent from
 * a reply is simply not stored. `accuratePasses` is not mapped: its value is a
 * count, not the percentage `pass_accuracy` holds.
 */
const STATISTIC_KEYS: Readonly<Record<string, SofascoreStatisticCode>> = {
  ballPossession: "possession",
  totalShotsOnGoal: "shots",
  shotsOnGoal: "shots_on_target",
  cornerKicks: "corners",
  fouls: "fouls",
  offsides: "offsides",
  goalkeeperSaves: "saves",
  passes: "passes",
  expectedGoals: "expected_goals",
};
const PERCENT_CODES: ReadonlySet<SofascoreStatisticCode> = new Set(["possession"]);

const POSITIONS: Readonly<Record<string, SofascoreDetailsLineupPlayer["position"]>> = {
  G: "goalkeeper",
  D: "defender",
  M: "midfielder",
  F: "forward",
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveId(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function integerBetween(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

function text(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maximum).trim() : null;
}

export class SofascoreDetailsPayloadError extends Error {
  constructor() {
    super("invalid_provider_payload");
    this.name = "SofascoreDetailsPayloadError";
  }
}

// ---------------------------------------------------------------------------
// Incidents -> events

interface RawEvent {
  readonly id: number;
  readonly type: SofascoreMatchEventType;
  readonly isHome: boolean;
  readonly minute: number;
  readonly addedTime: number;
  readonly playerId: number | null;
  readonly relatedId: number | null;
  readonly name: string | null;
  readonly scoreAfter: { home: number; away: number } | null;
}

function personRef(value: unknown): { id: number; name: string | null } | null {
  if (!isRecord(value)) return null;
  const id = positiveId(value.id);
  return id === null ? null : { id, name: text(value.name, 500) };
}

function eventType(incidentType: string, incidentClass: string): SofascoreMatchEventType | null {
  const klass = incidentClass.toLowerCase().replace(/[^a-z]/g, "");
  if (incidentType === "goal") {
    if (klass === "penalty") return "penalty_goal";
    if (klass === "owngoal") return "own_goal";
    // "regular", and any other goal class (header, volley, …) the page treats as a goal.
    return "goal";
  }
  if (incidentType === "inGamePenalty") {
    return klass === "missed" || klass === "saved" ? "missed_penalty" : null;
  }
  if (incidentType === "card") {
    if (klass === "yellow") return "yellow_card";
    if (klass === "yellowred") return "second_yellow";
    if (klass === "red") return "red_card";
    return null;
  }
  if (incidentType === "substitution") return "substitution";
  return null;
}

/**
 * `incidents` (the reply's list) as timeline events. Period markers and
 * withdrawn (rescinded) incidents are left out silently; a type the page does
 * not know, or an incident that cannot be placed (no id, minute or side), is
 * counted in `skipped` rather than guessed at.
 */
export function normalizeIncidents(
  raw: unknown,
  teams: SofascoreFixtureTeams,
  skipped: SofascoreDetailsSkipped,
): SofascoreDetailsEvent[] {
  if (!isRecord(raw) || !Array.isArray(raw.incidents)) throw new SofascoreDetailsPayloadError();
  const read: RawEvent[] = [];
  const ids = new Set<number>();
  for (const value of raw.incidents) {
    if (!isRecord(value)) {
      skipped.events += 1;
      continue;
    }
    const incidentType = typeof value.incidentType === "string" ? value.incidentType : "";
    if (incidentType === "period" || incidentType === "injuryTime") continue;
    if (value.rescinded === true) continue;
    const type = eventType(
      incidentType,
      typeof value.incidentClass === "string" ? value.incidentClass : "",
    );
    const id = positiveId(value.id);
    const minute = integerBetween(value.time, 0, 180);
    const added =
      value.addedTime === undefined || value.addedTime === null
        ? 0
        : integerBetween(value.addedTime, 0, 60);
    if (
      type === null ||
      id === null ||
      minute === null ||
      added === null ||
      typeof value.isHome !== "boolean" ||
      ids.has(id)
    ) {
      skipped.events += 1;
      continue;
    }
    ids.add(id);
    let player = personRef(value.player);
    let related = personRef(value.assist1);
    if (type === "substitution") {
      // As the SportsMonks path: the player coming on, and the one replaced.
      player = personRef(value.playerIn);
      related = personRef(value.playerOut);
    } else if (type !== "goal" && type !== "penalty_goal") {
      related = null;
    }
    const home = integerBetween(value.homeScore, 0, 99);
    const away = integerBetween(value.awayScore, 0, 99);
    read.push({
      id,
      type,
      isHome: value.isHome,
      minute,
      addedTime: added,
      playerId: player?.id ?? null,
      relatedId: related?.id ?? null,
      name: player?.name ?? null,
      scoreAfter: home !== null && away !== null ? { home, away } : null,
    });
    if (read.length === MAX_EVENTS) break;
  }

  // SofaScore lists the newest incident first.
  read.sort((l, r) => l.minute - r.minute || l.addedTime - r.addedTime || l.id - r.id);

  // An own goal belongs on the side it counted for, as scoreboards list it.
  // The score after each goal says which side that was; without it the
  // provider's side stands.
  let score = { home: 0, away: 0 };
  return read.map((event, index) => {
    let side: Side = event.isHome ? "home" : "away";
    if (
      (event.type === "goal" || event.type === "penalty_goal" || event.type === "own_goal") &&
      event.scoreAfter
    ) {
      const home = event.scoreAfter.home - score.home;
      const away = event.scoreAfter.away - score.away;
      if (event.type === "own_goal") {
        if (home === 1 && away === 0) side = "home";
        else if (away === 1 && home === 0) side = "away";
      }
      score = event.scoreAfter;
    }
    const player = event.playerId === null ? null : String(event.playerId);
    const related = event.relatedId === null ? null : String(event.relatedId);
    return {
      key: String(event.id),
      type: event.type,
      teamExternalId: teams[side],
      playerExternalId: player,
      relatedPlayerExternalId: related === player ? null : related,
      detail: event.name,
      minute: event.minute,
      addedTime: event.addedTime,
      period: event.minute <= 45 ? "first_half" : event.minute <= 90 ? "second_half" : "extra_time",
      sequence: index + 1,
    };
  });
}

// ---------------------------------------------------------------------------
// Lineups

function sideLineup(
  value: unknown,
  teamExternalId: string,
  skipped: SofascoreDetailsSkipped,
): SofascoreDetailsLineup | null {
  if (!isRecord(value) || !Array.isArray(value.players)) return null;
  const starters: SofascoreDetailsLineupPlayer[] = [];
  const bench: SofascoreDetailsLineupPlayer[] = [];
  for (const entry of value.players) {
    const person = isRecord(entry) && isRecord(entry.player) ? entry.player : null;
    const id = person ? positiveId(person.id) : null;
    const name = person ? text(person.name, 200) : null;
    const slot =
      isRecord(entry) && entry.substitute === false
        ? "starting"
        : isRecord(entry) && entry.substitute === true
          ? "bench"
          : null;
    if (
      !isRecord(entry) ||
      slot === null ||
      (id === null && name === null) ||
      starters.length + bench.length === MAX_LINEUP_ROWS_PER_TEAM
    ) {
      skipped.lineupPlayers += 1;
      continue;
    }
    const code = typeof entry.position === "string" ? entry.position : person?.position;
    const row = {
      playerExternalId: id === null ? null : String(id),
      playerName: name,
      slot,
      position: typeof code === "string" ? (POSITIONS[code] ?? null) : null,
      shirtNumber: integerBetween(entry.shirtNumber, 1, 99),
    } as const;
    // The provider's order for the eleven (kept: 1..11), the bench after it.
    if (slot === "starting") starters.push({ ...row, order: starters.length + 1 });
    else bench.push({ ...row, order: 100 + bench.length });
  }
  const players = [...starters, ...bench];
  if (players.length === 0) return null;
  return {
    teamExternalId,
    formation: text(value.formation, 20),
    confirmed: true,
    players,
  };
}

/**
 * `lineups` as one lineup per side, home first. The `home` and `away` objects
 * are used as the provider split them and attached to the FIXTURE's clubs; the
 * `teamId` on each player row is never read.
 */
export function normalizeLineups(
  raw: unknown,
  teams: SofascoreFixtureTeams,
  skipped: SofascoreDetailsSkipped,
): SofascoreDetailsLineup[] {
  if (raw === null) return [];
  if (!isRecord(raw)) throw new SofascoreDetailsPayloadError();
  return [
    sideLineup(raw.home, teams.home, skipped),
    sideLineup(raw.away, teams.away, skipped),
  ].filter((lineup): lineup is SofascoreDetailsLineup => lineup !== null);
}

// ---------------------------------------------------------------------------
// Statistics

/** Whole-match (`period: "ALL"`) team figures the app has a definition for. */
export function normalizeStatistics(
  raw: unknown,
  teams: SofascoreFixtureTeams,
  skipped: SofascoreDetailsSkipped,
): SofascoreDetailsStatistic[] {
  if (raw === null) return [];
  if (!isRecord(raw) || !Array.isArray(raw.statistics)) throw new SofascoreDetailsPayloadError();
  const out: SofascoreDetailsStatistic[] = [];
  const seen = new Set<string>();
  for (const period of raw.statistics) {
    if (!isRecord(period) || period.period !== "ALL" || !Array.isArray(period.groups)) continue;
    for (const group of period.groups) {
      const items =
        isRecord(group) && Array.isArray(group.statisticsItems) ? group.statisticsItems : [];
      for (const item of items) {
        if (!isRecord(item) || typeof item.key !== "string") continue;
        const code = STATISTIC_KEYS[item.key];
        if (!code) continue;
        for (const side of ["home", "away"] as const) {
          const figure = side === "home" ? item.homeValue : item.awayValue;
          // First figure for a key wins: SofaScore repeats some keys in
          // several groups (shots, saves) with the same number.
          if (seen.has(`${side}:${code}`)) continue;
          if (
            typeof figure !== "number" ||
            !Number.isFinite(figure) ||
            figure < 0 ||
            (PERCENT_CODES.has(code) && figure > 100)
          ) {
            skipped.statistics += 1;
            continue;
          }
          seen.add(`${side}:${code}`);
          out.push({ code, teamExternalId: teams[side], value: figure, displayValue: null });
        }
      }
    }
  }
  return out;
}

/**
 * The three replies as the payload for api.ingest_football_match_details.
 * `lineups` and `statistics` may be null (the provider has none for this
 * match); `incidents` may not: without it there is no timeline to store.
 */
export function normalizeSofascoreMatchDetails(
  replies: { readonly incidents: unknown; readonly lineups: unknown; readonly statistics: unknown },
  teams: SofascoreFixtureTeams,
  observedAt: string,
): SofascoreMatchDetails {
  if (teams.home === teams.away) throw new SofascoreDetailsPayloadError();
  const skipped: SofascoreDetailsSkipped = { events: 0, statistics: 0, lineupPlayers: 0 };
  const events = normalizeIncidents(replies.incidents, teams, skipped);
  const lineups = normalizeLineups(replies.lineups, teams, skipped);
  const statistics = normalizeStatistics(replies.statistics, teams, skipped);
  return {
    payload: {
      providerUpdatedAt: observedAt,
      // When BotolaGO read it: a later read always outranks an earlier one.
      sourceSequence: Math.max(0, Date.parse(observedAt)),
      events,
      statistics,
      lineups,
      pressure: [],
      absences: null,
    },
    skipped,
  };
}

// ---------------------------------------------------------------------------
// Fetch + store

export interface SofascoreDetailsRequestLog {
  readonly path: string;
  readonly quotaRemaining: number | null;
  readonly quotaLimit: number | null;
}

export interface SofascoreDetailsTarget {
  /** The SofaScore event id (the fixture's `sofascore` mapping). */
  readonly eventId: string;
  readonly teams: SofascoreFixtureTeams;
  /**
   * Set only for a fixture that is finished: the app fixture id the Fantasy
   * step (sofascore-fantasy-auto.ts) records an observation for, from these
   * same replies. Absent for a match in play.
   */
  readonly fantasyFixtureId?: string;
  /**
   * Set only for a match in play: the app fixture id whose lineup players the
   * player matching (sofascore-fantasy-auto.ts, `fromLiveReplies`) may map while
   * the match is on, from these same replies.
   */
  readonly liveFixtureId?: string;
}

export interface SofascoreDetailsSummary {
  readonly scope: SofascoreDetailsScope;
  readonly mode: "sofascore" | "shadow";
  /** Fixtures the caller offered. */
  readonly offered: number;
  /** Fixtures attempted (the run stops early on a quota refusal). */
  readonly attempted: number;
  readonly stored: number;
  readonly stale: number;
  readonly rejected: number;
  /** Shadow only: fixtures read and normalized, nothing written. */
  readonly wouldStore: number;
  readonly events: number;
  readonly statistics: number;
  readonly lineupPlayers: number;
  readonly unmappedPlayers: number;
  readonly skipped: SofascoreDetailsSkipped;
  readonly requests: readonly SofascoreDetailsRequestLog[];
  readonly rateLimited: boolean;
  readonly errors: readonly string[];
}

export interface SofascoreDetailsDependencies {
  readonly mode: "sofascore" | "shadow";
  readonly scope: SofascoreDetailsScope;
  readonly client: FixtureRpcClient;
  readonly rapid: SofascoreShadowClient;
  readonly now: Date;
  readonly log: (fields: Record<string, unknown>) => void;
  /** Backfill fixtures without resolvable clubs; record refusal without guessing. */
  readonly unresolvedTargets?: readonly string[];
  /**
   * Called with the three raw replies of a target that has a `fantasyFixtureId`,
   * after its details were stored (or logged, in shadow). Whatever it does or
   * throws never changes the details outcome.
   */
  readonly onReplies?: (
    target: SofascoreDetailsTarget,
    replies: {
      readonly incidents: unknown;
      readonly lineups: unknown;
      readonly statistics: unknown;
    },
  ) => Promise<void>;
  /**
   * Called with the three raw replies of a target that has a `liveFixtureId`,
   * after its details were stored (or logged, in shadow). Whatever it does or
   * throws never changes the details outcome.
   */
  readonly onLiveReplies?: (
    target: SofascoreDetailsTarget,
    replies: {
      readonly incidents: unknown;
      readonly lineups: unknown;
      readonly statistics: unknown;
    },
  ) => Promise<void>;
}

function eventPath(endpoint: string, eventId: string): string {
  return `matches/${endpoint}?matchId=${eventId}`;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function failureCode(error: unknown): string {
  if (error instanceof RapidApiError) return error.code;
  if (error instanceof SofascoreDetailsPayloadError) return "invalid_provider_payload";
  return "match_details_failed";
}

async function fingerprint(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Reads the three replies for one event. Lineups and statistics the provider
 * does not have (`data_unavailable`, a 404) come back null; the incidents are
 * required. Any other failure, a quota refusal included, throws with nothing
 * returned, so the caller never stores half a fixture.
 */
export async function fetchSofascoreMatchReplies(
  rapid: SofascoreShadowClient,
  eventId: string,
  requests: SofascoreDetailsRequestLog[],
): Promise<{ incidents: unknown; lineups: unknown; statistics: unknown }> {
  if (!/^[1-9][0-9]{0,11}$/.test(eventId)) throw new SofascoreDetailsPayloadError();
  const read = async (endpoint: string, optional: boolean): Promise<unknown> => {
    const path = eventPath(endpoint, eventId);
    try {
      const result = await rapid.getJson(path);
      const quota: RapidApiQuota = result.quota;
      requests.push({ path, quotaRemaining: quota.remaining, quotaLimit: quota.limit });
      return result.data;
    } catch (error) {
      if (optional && error instanceof RapidApiError && error.code === "data_unavailable") {
        requests.push({ path, quotaRemaining: null, quotaLimit: null });
        return null;
      }
      throw error;
    }
  };
  const incidents = await read("get-incidents", false);
  const lineups = await read("get-lineups", true);
  const statistics = await read("get-statistics", true);
  return { incidents, lineups, statistics };
}

/**
 * Fetches and, in `sofascore` mode, stores the details of each target in
 * order. In `shadow` mode the same reads and normalization happen, one JSON log
 * line carries what would be stored, and nothing is written (not even an
 * ingestion run). Never throws: failures are counted and returned.
 */
export async function runSofascoreMatchDetails(
  targets: readonly SofascoreDetailsTarget[],
  dependencies: SofascoreDetailsDependencies,
): Promise<SofascoreDetailsSummary> {
  const { mode, scope, client, rapid, now, log } = dependencies;
  const unresolved = dependencies.unresolvedTargets ?? [];
  const requests: SofascoreDetailsRequestLog[] = [];
  const errors = new Set<string>();
  const skipped: SofascoreDetailsSkipped = { events: 0, statistics: 0, lineupPlayers: 0 };
  const totals = {
    attempted: 0,
    stored: 0,
    stale: 0,
    rejected: 0,
    wouldStore: 0,
    events: 0,
    statistics: 0,
    lineupPlayers: 0,
    unmappedPlayers: 0,
  };
  let rateLimited = false;
  const rpc = (name: string, args: Record<string, unknown>) => client.schema("api").rpc(name, args);
  const build = (): SofascoreDetailsSummary => ({
    scope,
    mode,
    offered: targets.length + unresolved.length,
    ...totals,
    skipped,
    requests,
    rateLimited,
    errors: [...errors].sort(),
  });
  if (targets.length + unresolved.length === 0) return build();

  let runId: string | null = null;
  if (mode === "sofascore") {
    try {
      const begun = await rpc("begin_football_ingestion", {
        p_provider_name: SOFASCORE_PROVIDER_NAME,
        p_job_type: "match_events",
        p_target_scope: { kind: "match_details", scope, source: SOFASCORE_PROVIDER_NAME },
        p_checkpoint: {},
      });
      if (begun.error || typeof begun.data !== "string") throw new Error("begin");
      runId = begun.data;
    } catch {
      errors.add("database_unavailable");
      return build();
    }
  }

  const failed: { eventId: string; code: string }[] = unresolved.map((eventId) => ({
    eventId,
    code: "unresolved_team_mapping",
  }));
  if (unresolved.length > 0) {
    totals.attempted += unresolved.length;
    totals.rejected += unresolved.length;
    errors.add("unresolved_team_mapping");
  }
  for (const target of targets) {
    totals.attempted += 1;
    let normalized: SofascoreMatchDetails;
    let replies: { incidents: unknown; lineups: unknown; statistics: unknown };
    try {
      replies = await fetchSofascoreMatchReplies(rapid, target.eventId, requests);
      normalized = normalizeSofascoreMatchDetails(replies, target.teams, now.toISOString());
    } catch (error) {
      const code = failureCode(error);
      errors.add(code);
      // A quota refusal says nothing about the fixture: it is not a rejection
      // (the backfill leaves out a fixture refused twice), it ends the run.
      if (code === "provider_rate_limited") {
        rateLimited = true;
        break;
      }
      totals.rejected += 1;
      failed.push({ eventId: target.eventId, code });
      continue;
    }
    const { payload } = normalized;
    // The Fantasy step reads these same replies; it never affects the details.
    const afterwards = async () => {
      try {
        if (target.fantasyFixtureId && dependencies.onReplies)
          await dependencies.onReplies(target, replies);
        else if (target.liveFixtureId && dependencies.onLiveReplies)
          await dependencies.onLiveReplies(target, replies);
      } catch {
        // Fantasy must never hold back the match details.
      }
    };
    for (const section of Object.keys(skipped) as Array<keyof SofascoreDetailsSkipped>) {
      skipped[section] += normalized.skipped[section];
    }
    if (mode === "shadow") {
      totals.wouldStore += 1;
      totals.events += payload.events.length;
      totals.statistics += payload.statistics.length;
      totals.lineupPlayers += payload.lineups.reduce((n, l) => n + l.players.length, 0);
      log({
        result: "shadow_match_details",
        scope,
        eventId: target.eventId,
        wouldStore: {
          events: payload.events.length,
          statistics: payload.statistics.length,
          lineups: payload.lineups.map((l) => ({
            team: l.teamExternalId,
            players: l.players.length,
          })),
        },
        payload,
        written: 0,
      });
      await afterwards();
      continue;
    }
    try {
      const result = await rpc("ingest_football_match_details", {
        p_provider_name: SOFASCORE_PROVIDER_NAME,
        p_fixture_external_id: target.eventId,
        p_details: payload,
      });
      if (result.error) {
        const message = result.error.message ?? "";
        throw new Error(
          message.includes("INVALID_PROVIDER_PAYLOAD")
            ? "details_rejected_by_database"
            : message.includes("MAPPING_NOT_FOUND")
              ? "mapping_not_found"
              : "database_unavailable",
        );
      }
      const stored = isRecord(result.data) ? result.data : {};
      if (stored.outcome === "stale") {
        totals.stale += 1;
      } else if (stored.outcome === "stored") {
        totals.stored += 1;
        totals.events += count(stored.events);
        totals.statistics += count(stored.statistics);
        totals.lineupPlayers += count(stored.lineupPlayers);
        totals.unmappedPlayers += count(stored.unmappedPlayers);
      } else {
        throw new Error("database_unavailable");
      }
    } catch (error) {
      const code =
        error instanceof Error &&
        ["details_rejected_by_database", "mapping_not_found"].includes(error.message)
          ? error.message
          : "database_unavailable";
      errors.add(code);
      totals.rejected += 1;
      failed.push({ eventId: target.eventId, code });
    }
    await afterwards();
  }

  if (runId !== null) {
    for (const item of failed) {
      try {
        const rejection = await rpc("record_football_ingestion_rejection", {
          p_run_id: runId,
          p_entity_type: "fixture",
          p_external_id: item.eventId,
          p_payload_fingerprint: await fingerprint(item),
          p_error_code: item.code,
          p_validation_issues: [{ code: item.code }],
        });
        if (rejection.error) errors.add("record_rejection_failed");
      } catch {
        errors.add("record_rejection_failed");
      }
    }
    try {
      const completion = await rpc("complete_football_ingestion", {
        p_run_id: runId,
        p_status:
          totals.rejected === 0
            ? "succeeded"
            : totals.stored + totals.stale > 0
              ? "partial"
              : "failed",
        p_checkpoint: {
          source: SOFASCORE_PROVIDER_NAME,
          scope,
          events: totals.events,
          statistics: totals.statistics,
          lineupPlayers: totals.lineupPlayers,
          unmappedPlayers: totals.unmappedPlayers,
          skipped,
        },
        p_records_fetched: totals.attempted,
        p_records_validated: totals.stored + totals.stale,
        p_records_inserted: 0,
        p_records_updated: totals.stored,
        p_records_skipped: totals.stale,
        p_records_rejected: totals.rejected,
        p_retry_count: 0,
        p_error_code: totals.rejected > 0 ? "match_details_item_rejected" : null,
        p_error_summary:
          totals.rejected > 0
            ? "The SofaScore match details refresh did not complete for every fixture."
            : null,
      });
      if (completion.error) errors.add("complete_run_failed");
    } catch {
      errors.add("complete_run_failed");
    }
  }
  return build();
}
