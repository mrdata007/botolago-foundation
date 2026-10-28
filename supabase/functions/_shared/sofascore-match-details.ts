// SofaScore match details for the Edge runtime: goals, cards, substitutions,
// lineups and team statistics, in the exact payload the SportsMonks path sends
// to api.ingest_football_match_details (see sportsmonks-match-details.ts).
//
// Three requests per fixture, always in this order and always all read before
// anything is written for that fixture:
//   matches/get-incidents   -> events (goals, cards, substitutions)
//   matches/get-lineups     -> lineups (starters, bench, shirt, position, formation)
//   matches/get-statistics  -> team statistics (period ALL only)
// A quota refusal (`provider_rate_limited`) stops the run with that fixture
// unwritten, so the remaining fixtures keep their quota. Otherwise the three
// sections are independent (2026-10-14, FUS Rabat - Raja: a statistics reply
// the provider did not have yet threw away every goal, card and lineup of the
// match until full time):
//   * a reply the provider does not have (HTTP 404, or HTTP 200 with an
//     `{"error": {...}}` body, which is how RapidAPI answers for SofaScore) is
//     "no data": lineups and statistics are sent empty (the RPC keeps what is
//     stored), incidents leave the fixture `unavailable` (not a rejection);
//   * a lineups or statistics reply that fails or cannot be read is reported
//     in `sections` and sent empty; the events are still stored;
//   * the database stores each section on its own and names a section it
//     could not store in `rejectedSections` (migration 20261014120000).
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

export type SofascoreDetailsScope = "live" | "backfill" | "staged";

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
  /** Null when the incidents could not be read: the RPC keeps the stored timeline. */
  readonly events: readonly SofascoreDetailsEvent[] | null;
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

/** A reply section that could not be read and was sent empty (or null). */
export type SofascoreDetailsSection = "incidents" | "lineups" | "statistics";

export interface SofascoreMatchDetails {
  readonly payload: SofascoreMatchDetailsPayload;
  readonly skipped: SofascoreDetailsSkipped;
  /** Sections whose reply was there but unreadable: left out, the rest kept. */
  readonly unreadable: readonly SofascoreDetailsSection[];
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
 * True for a reply that says the provider has no data: RapidAPI answers HTTP
 * 200 with `{"error": {"code": 404, ...}}` for SofaScore data that does not
 * exist (yet), where SofaScore itself answers 404 (see
 * docs/audits/2026-10-01-sofascore-rapidapi-coverage-test.md). `expected` is
 * the key a real reply carries (`incidents`, `statistics`, `home`).
 */
export function isProviderNoData(value: unknown, expected: string): boolean {
  return isRecord(value) && value.error !== undefined && !(expected in value);
}

/**
 * The three replies as the payload for api.ingest_football_match_details.
 * Any of them may be null (the provider has none). Each section is read on its
 * own: one that cannot be read is left out and named in `unreadable` (events
 * null, so the stored timeline is kept; lineups or statistics empty, which the
 * RPC also reads as "keep"), and the others are still sent. Throws only when
 * nothing at all could be read, or when the two clubs are the same.
 */
export function normalizeSofascoreMatchDetails(
  replies: { readonly incidents: unknown; readonly lineups: unknown; readonly statistics: unknown },
  teams: SofascoreFixtureTeams,
  observedAt: string,
): SofascoreMatchDetails {
  if (teams.home === teams.away) throw new SofascoreDetailsPayloadError();
  const skipped: SofascoreDetailsSkipped = { events: 0, statistics: 0, lineupPlayers: 0 };
  const unreadable: SofascoreDetailsSection[] = [];
  const section = <T>(name: SofascoreDetailsSection, read: () => T, empty: T): T => {
    try {
      return read();
    } catch (error) {
      if (!(error instanceof SofascoreDetailsPayloadError)) throw error;
      unreadable.push(name);
      return empty;
    }
  };
  const events =
    replies.incidents === null || isProviderNoData(replies.incidents, "incidents")
      ? null
      : section<SofascoreDetailsEvent[] | null>(
          "incidents",
          () => normalizeIncidents(replies.incidents, teams, skipped),
          null,
        );
  const lineups = isProviderNoData(replies.lineups, "home")
    ? []
    : section("lineups", () => normalizeLineups(replies.lineups, teams, skipped), []);
  const statistics = isProviderNoData(replies.statistics, "statistics")
    ? []
    : section("statistics", () => normalizeStatistics(replies.statistics, teams, skipped), []);
  if (events === null && lineups.length === 0 && statistics.length === 0 && unreadable.length > 0) {
    // Nothing readable at all: the reply is not what this module knows.
    throw new SofascoreDetailsPayloadError();
  }
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
    unreadable,
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
  /**
   * A match in play: read `matches/get-incidents` only (1 request instead of 3).
   * Lineups and statistics are read at full time, where the Fantasy step needs
   * them. The payload then carries empty lineups and statistics, which the RPC
   * does not treat as a deletion (it keeps what is stored).
   */
  readonly incidentsOnly?: boolean;
  /**
   * With `incidentsOnly`: also read `matches/get-lineups` (2 requests, no
   * statistics). Set once per match, on the tick that sees it start, so the
   * player matching can offer unknown names to the staff before full time.
   */
  readonly withLineups?: boolean;
  /**
   * A match in play: read `matches/get-lineups` only (1 request), once, when
   * the match starts. The payload carries no events and no statistics (the RPC
   * keeps what is stored); a lineup the provider has not published yet is
   * `unavailable`, not a rejection.
   */
  readonly lineupsOnly?: boolean;
  /**
   * A finished match: read `matches/get-statistics` only (1 request), the late
   * statistics read. No events and no lineups in the payload (the RPC keeps what
   * is stored).
   */
  readonly statisticsOnly?: boolean;
  /**
   * Replies already read by the caller (the staged statistics pulls of a
   * finished match): stored as they are, with no request.
   */
  readonly replies?: {
    readonly incidents: unknown;
    readonly lineups: unknown;
    readonly statistics: unknown;
  };
}

/** A fixture whose details were stored without one or more sections. */
export interface SofascoreDetailsPartial {
  readonly eventId: string;
  /** Read from the provider but failed or unreadable: sent empty. */
  readonly leftOut: readonly SofascoreDetailsSection[];
  /** Refused by the database (`rejectedSections`), the rest stored. */
  readonly rejected: readonly string[];
  /** Rows the database left out (`eventsRejected` + `statisticsRejected` + `lineupPlayersRejected`). */
  readonly rowsRejected: number;
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
  /**
   * Matches in play whose incidents the provider does not have yet: nothing
   * to store, not a rejection.
   */
  readonly unavailable: number;
  /** Fixtures stored (or, in shadow, normalized) without every section. */
  readonly partial: readonly SofascoreDetailsPartial[];
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
 * Reads the three replies for one event. A reply the provider does not have
 * (`data_unavailable`, a 404, or HTTP 200 with an `{"error": ...}` body) comes
 * back null for the lineups and statistics, and throws `data_unavailable` for
 * the incidents. Any other failure, a quota refusal included, throws with
 * nothing returned, unless `failures` is given: then a lineups or statistics
 * failure other than a quota refusal comes back null and is named there, so
 * the incidents are still stored.
 */
export async function fetchSofascoreMatchReplies(
  rapid: SofascoreShadowClient,
  eventId: string,
  requests: SofascoreDetailsRequestLog[],
  incidentsOnly = false,
  withLineups = false,
  failures?: SofascoreDetailsSection[],
  lineupsOnly = false,
  statisticsOnly = false,
): Promise<{ incidents: unknown; lineups: unknown; statistics: unknown }> {
  if (!/^[1-9][0-9]{0,11}$/.test(eventId)) throw new SofascoreDetailsPayloadError();
  const read = async (
    endpoint: string,
    section: SofascoreDetailsSection,
    expected: string,
  ): Promise<unknown> => {
    const optional =
      section !== (lineupsOnly ? "lineups" : statisticsOnly ? "statistics" : "incidents");
    const path = eventPath(endpoint, eventId);
    try {
      const result = await rapid.getJson(path);
      const quota: RapidApiQuota = result.quota;
      requests.push({ path, quotaRemaining: quota.remaining, quotaLimit: quota.limit });
      if (isProviderNoData(result.data, expected)) {
        if (optional) return null;
        throw new RapidApiError("data_unavailable", `The provider has no data for ${path}.`);
      }
      return result.data;
    } catch (error) {
      if (!(error instanceof RapidApiError) || !optional) throw error;
      if (error.code === "data_unavailable") {
        if (!requests.some((logged) => logged.path === path)) {
          requests.push({ path, quotaRemaining: null, quotaLimit: null });
        }
        return null;
      }
      if (failures && error.code !== "provider_rate_limited") {
        failures.push(section);
        return null;
      }
      throw error;
    }
  };
  if (statisticsOnly) {
    return {
      incidents: null,
      lineups: null,
      statistics: await read("get-statistics", "statistics", "statistics"),
    };
  }
  if (lineupsOnly) {
    return {
      incidents: null,
      lineups: await read("get-lineups", "lineups", "home"),
      statistics: null,
    };
  }
  const incidents = await read("get-incidents", "incidents", "incidents");
  if (incidentsOnly) {
    return {
      incidents,
      lineups: withLineups ? await read("get-lineups", "lineups", "home") : null,
      statistics: null,
    };
  }
  const lineups = await read("get-lineups", "lineups", "home");
  const statistics = await read("get-statistics", "statistics", "statistics");
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
    unavailable: 0,
    wouldStore: 0,
    events: 0,
    statistics: 0,
    lineupPlayers: 0,
    unmappedPlayers: 0,
  };
  let rateLimited = false;
  const partial: SofascoreDetailsPartial[] = [];
  const rpc = (name: string, args: Record<string, unknown>) => client.schema("api").rpc(name, args);
  const build = (): SofascoreDetailsSummary => ({
    scope,
    mode,
    offered: targets.length + unresolved.length,
    ...totals,
    partial,
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
    const failures: SofascoreDetailsSection[] = [];
    try {
      replies =
        target.replies ??
        (await fetchSofascoreMatchReplies(
          rapid,
          target.eventId,
          requests,
          target.incidentsOnly === true,
          target.withLineups === true,
          failures,
          target.lineupsOnly === true,
          target.statisticsOnly === true,
        ));
      normalized = normalizeSofascoreMatchDetails(replies, target.teams, now.toISOString());
    } catch (error) {
      const code = failureCode(error);
      // A quota refusal says nothing about the fixture: it is not a rejection
      // (the backfill leaves out a fixture refused twice), it ends the run.
      if (code === "provider_rate_limited") {
        errors.add(code);
        rateLimited = true;
        break;
      }
      // A match in play with no incidents yet: nothing to store, and nothing
      // wrong with the fixture. A finished one without them stays a rejection
      // (the backfill stops asking after two).
      if (
        code === "data_unavailable" &&
        (target.incidentsOnly === true ||
          target.lineupsOnly === true ||
          target.statisticsOnly === true)
      ) {
        totals.unavailable += 1;
        continue;
      }
      errors.add(code);
      totals.rejected += 1;
      failed.push({ eventId: target.eventId, code });
      continue;
    }
    const { payload } = normalized;
    const leftOut = [...failures, ...normalized.unreadable];
    const notePartial = (rejected: readonly string[], rowsRejected: number) => {
      if (leftOut.length + rejected.length + rowsRejected === 0) return;
      partial.push({ eventId: target.eventId, leftOut, rejected, rowsRejected });
      errors.add(rejected.length > 0 ? "details_section_rejected" : "details_section_left_out");
    };
    // The Fantasy step reads these same replies; it never affects the details.
    const afterwards = async () => {
      // A reply that failed is not handed on as empty: Fantasy waits for a
      // whole set (its own retries and catch-up read it again).
      if (failures.length > 0) return;
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
      notePartial([], 0);
      totals.wouldStore += 1;
      totals.events += payload.events?.length ?? 0;
      totals.statistics += payload.statistics.length;
      totals.lineupPlayers += payload.lineups.reduce((n, l) => n + l.players.length, 0);
      log({
        result: "shadow_match_details",
        scope,
        eventId: target.eventId,
        wouldStore: {
          events: payload.events?.length ?? null,
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
        const rejectedSections = Array.isArray(stored.rejectedSections)
          ? stored.rejectedSections
              .filter((name): name is string => typeof name === "string")
              .map((name) => name.slice(0, 80))
              .slice(0, 10)
          : [];
        notePartial(
          rejectedSections,
          count(stored.eventsRejected) +
            count(stored.statisticsRejected) +
            count(stored.lineupPlayersRejected),
        );
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
    // A fixture stored without a section is not a rejection of the fixture,
    // but the part left out is recorded, so it can be found afterwards.
    for (const item of partial) {
      const code =
        item.rejected.length > 0 ? "details_section_rejected" : "details_section_left_out";
      try {
        const rejection = await rpc("record_football_ingestion_rejection", {
          p_run_id: runId,
          p_entity_type: "fixture",
          p_external_id: item.eventId,
          p_payload_fingerprint: await fingerprint(item),
          p_error_code: code,
          p_validation_issues: [
            ...item.leftOut.map((section) => ({ code: "section_left_out", section })),
            ...item.rejected.map((section) => ({ code: "section_rejected", section })),
            ...(item.rowsRejected > 0 ? [{ code: "rows_rejected", rows: item.rowsRejected }] : []),
          ],
        });
        if (rejection.error) errors.add("record_rejection_failed");
      } catch {
        errors.add("record_rejection_failed");
      }
    }
    const errorCode =
      totals.rejected > 0
        ? "match_details_item_rejected"
        : partial.length > 0
          ? "match_details_section_rejected"
          : null;
    try {
      const completion = await rpc("complete_football_ingestion", {
        p_run_id: runId,
        p_status:
          totals.rejected === 0 && partial.length === 0
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
          unavailable: totals.unavailable,
          partial: partial.length,
          skipped,
        },
        p_records_fetched: totals.attempted,
        p_records_validated: totals.stored + totals.stale,
        p_records_inserted: 0,
        p_records_updated: totals.stored,
        p_records_skipped: totals.stale + totals.unavailable,
        p_records_rejected: totals.rejected,
        p_retry_count: 0,
        p_error_code: errorCode,
        p_error_summary:
          totals.rejected > 0
            ? "The SofaScore match details refresh did not complete for every fixture."
            : partial.length > 0
              ? "A SofaScore match details section could not be stored; the rest of the fixture was."
              : null,
      });
      if (completion.error) errors.add("complete_run_failed");
    } catch {
      errors.add("complete_run_failed");
    }
  }
  return build();
}
