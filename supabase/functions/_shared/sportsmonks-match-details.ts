// Goals, cards, substitutions, team statistics and lineups: what the match
// page's Résumé, Stats and Compos tabs show.
//
// Scores come from the fixture job (sportsmonks-fixtures.ts), which reads many
// fixtures at once and asks only for participants, state and scores. Details
// are much larger and matter for a handful of fixtures at a time, so they are
// fetched here one fixture at a time, for the fixtures the database says are
// due (api.service_football_match_details_due), and stored with
// api.ingest_football_match_details. The live refresh runs this after the
// scores and only reports the outcome: nothing here can hold a score back.
//
// Dependency-free apart from the shared fixture module, so it runs under Bun
// (tests) and Deno (the Edge Function).

import {
  FixtureRuntimeError,
  providerRequest,
  type FixtureRpcClient,
} from "./sportsmonks-fixtures.ts";

type JsonRecord = Record<string, unknown>;
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type Side = "home" | "away";

export type MatchDetailsScope = "live" | "backfill";

export type MatchEventType =
  | "goal"
  | "own_goal"
  | "penalty_goal"
  | "missed_penalty"
  | "yellow_card"
  | "second_yellow"
  | "red_card"
  | "substitution"
  | "var";

export type StatisticCode =
  | "possession"
  | "shots"
  | "shots_on_target"
  | "corners"
  | "fouls"
  | "offsides"
  | "saves"
  | "passes"
  | "pass_accuracy"
  | "expected_goals"
  | "expected_goals_on_target";

type Position = "goalkeeper" | "defender" | "midfielder" | "forward";

export interface MatchDetailsEvent {
  readonly key: string;
  readonly type: MatchEventType;
  readonly teamExternalId: string | null;
  readonly playerExternalId: string | null;
  readonly relatedPlayerExternalId: string | null;
  readonly detail: string | null;
  readonly minute: number;
  readonly addedTime: number;
  readonly period: "first_half" | "second_half" | "extra_time";
  readonly sequence: number;
}

export interface MatchDetailsStatistic {
  readonly code: StatisticCode;
  readonly teamExternalId: string;
  readonly value: number;
  readonly displayValue: null;
}

export interface MatchDetailsLineupPlayer {
  /** `null` for the provider's anonymous rows; the database counts them as unknown. */
  readonly playerExternalId: string | null;
  /** The provider's name, which Compos shows for a player the catalogue does not know. */
  readonly playerName: string | null;
  readonly slot: "starting" | "bench";
  readonly position: Position | null;
  readonly shirtNumber: number | null;
  readonly order: number;
}

export interface MatchDetailsLineup {
  readonly teamExternalId: string;
  readonly formation: string | null;
  readonly confirmed: true;
  readonly players: readonly MatchDetailsLineupPlayer[];
}

/** One club's pressure index for one minute (the Pressure Index add-on). */
export interface MatchDetailsPressure {
  readonly teamExternalId: string;
  readonly minute: number;
  readonly value: number;
}

/** A player the provider lists as injured or suspended for the match. */
export interface MatchDetailsAbsence {
  readonly key: string;
  readonly teamExternalId: string;
  readonly playerExternalId: string | null;
  readonly playerName: string | null;
  readonly category: "injury" | "suspension";
  readonly expectedReturnOn: string | null;
  readonly gamesMissed: number | null;
}

/** Provider rows left out because they could not be read, per section. */
export interface MatchDetailsSkipped {
  events: number;
  statistics: number;
  lineupPlayers: number;
  pressure: number;
  absences: number;
}

export interface NormalizedMatchDetails {
  readonly providerUpdatedAt: string;
  readonly sourceSequence: number;
  /** `null` when the reply carries no readable list: the stored events stand. */
  readonly events: readonly MatchDetailsEvent[] | null;
  /** The provider's team statistics and, with the xG add-on, expected goals. */
  readonly statistics: readonly MatchDetailsStatistic[];
  readonly lineups: readonly MatchDetailsLineup[];
  readonly pressure: readonly MatchDetailsPressure[];
  /** `null` when the reply carries no readable list: the stored one stands. */
  readonly absences: readonly MatchDetailsAbsence[] | null;
  readonly skipped: MatchDetailsSkipped;
}

export interface MatchDetailsConfiguration {
  readonly token: string;
  readonly leagueId: number;
  readonly seasonId: number;
  readonly timeoutMs: number;
  readonly maxRetries: number;
}

export interface MatchDetailsDependencies {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly client: FixtureRpcClient;
  readonly fetch?: FetchLike;
  readonly now?: () => Date;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export interface MatchDetailsSummary {
  readonly scope: MatchDetailsScope;
  /** Fixtures the database named. */
  readonly due: number;
  readonly stored: number;
  /** Replies older than what was already stored: nothing written. */
  readonly stale: number;
  readonly rejected: number;
  readonly events: number;
  readonly statistics: number;
  readonly lineupPlayers: number;
  /** Lineup rows for players the catalogue does not know (not listed). */
  readonly unmappedPlayers: number;
  readonly pressure: number;
  readonly absences: number;
  /** Fixtures read without the xG and Pressure Index add-ons (refused with them). */
  readonly addOnsUnavailable: number;
  readonly skipped: MatchDetailsSkipped;
  /** The distinct failure codes, when any fixture failed. */
  readonly errors: readonly string[];
}

export type MatchDetailsOutcome =
  | MatchDetailsSummary
  | { readonly scope: MatchDetailsScope; readonly error: string };

/**
 * One request per fixture. Rows are mapped by type id, from SportsMonks'
 * published type lists (a `type` object, when a reply carries one, must
 * agree). The two nested includes give an absent player's dates and name.
 */
export const MATCH_DETAILS_BASE_INCLUDE =
  "participants;events;statistics;lineups;formations;sidelined.sideline;sidelined.player";
/**
 * With the xG and Pressure Index add-ons. A plan without them has the whole
 * request refused, so a refusal is retried once with the base include: the
 * events, statistics, lineups and absences never depend on an add-on.
 */
export const MATCH_DETAILS_INCLUDE = `${MATCH_DETAILS_BASE_INCLUDE};xGFixture;pressure`;

/** Fixtures per refresh: a live one is a Saturday's simultaneous kick-offs. */
const DUE_LIMIT: Readonly<Record<MatchDetailsScope, number>> = { live: 8, backfill: 10 };
// Tighter than the fixture job's (15 s, 2 retries): this runs after it,
// inside the same pg_net call window.
const DETAILS_TIMEOUT_MS = 10_000;
const DETAILS_MAX_RETRIES = 1;
const MAX_EVENTS = 400;
const MAX_LINEUP_ROWS_PER_TEAM = 60;
const MAX_PRESSURE_ROWS = 400;
const MAX_ABSENCES = 100;

/**
 * SportsMonks event types by `developer_name`, compared without separators
 * ("OWN_GOAL" and "OWNGOAL" alike). `null`: a real type the page does not
 * show — a shoot-out kick is not a match event there. Anything absent from
 * this table is counted as skipped, so a new provider type is noticed.
 */
const EVENT_TYPES: Readonly<Record<string, MatchEventType | null>> = {
  GOAL: "goal",
  OWNGOAL: "own_goal",
  PENALTY: "penalty_goal",
  MISSEDPENALTY: "missed_penalty",
  SUBSTITUTION: "substitution",
  YELLOWCARD: "yellow_card",
  REDCARD: "red_card",
  YELLOWREDCARD: "second_yellow",
  VAR: "var",
  PENALTYSHOOTOUTGOAL: null,
  PENALTYSHOOTOUTMISS: null,
  // A VAR card duplicates the card it reviews; a highlight is a video marker.
  VARCARD: null,
  HIGHLIGHT: null,
};
/** The same types by id, for a row whose `type` include is missing. */
const EVENT_TYPE_IDS: Readonly<Record<number, string>> = {
  10: "VAR",
  14: "GOAL",
  15: "OWNGOAL",
  16: "PENALTY",
  17: "MISSEDPENALTY",
  18: "SUBSTITUTION",
  19: "YELLOWCARD",
  20: "REDCARD",
  21: "YELLOWREDCARD",
  22: "PENALTYSHOOTOUTMISS",
  23: "PENALTYSHOOTOUTGOAL",
  1675: "HIGHLIGHT",
  1697: "VARCARD",
};

/**
 * The team statistics the page has a definition for (`app.statistic_definitions`).
 * The provider sends dozens more (attacks, crosses, …); those are not stored
 * and not counted as skipped.
 */
const STATISTIC_CODES: Readonly<Record<string, StatisticCode>> = {
  BALLPOSSESSION: "possession",
  SHOTSTOTAL: "shots",
  SHOTSONTARGET: "shots_on_target",
  CORNERS: "corners",
  FOULS: "fouls",
  OFFSIDES: "offsides",
  SAVES: "saves",
  PASSES: "passes",
  SUCCESSFULPASSESPERCENTAGE: "pass_accuracy",
  // The xG add-on's rows (`xGFixture`), shaped like team statistics.
  EXPECTEDGOALS: "expected_goals",
  EXPECTEDGOALSONTARGET: "expected_goals_on_target",
};
const STATISTIC_TYPE_IDS: Readonly<Record<number, string>> = {
  34: "CORNERS",
  42: "SHOTSTOTAL",
  45: "BALLPOSSESSION",
  51: "OFFSIDES",
  56: "FOULS",
  57: "SAVES",
  80: "PASSES",
  82: "SUCCESSFULPASSESPERCENTAGE",
  86: "SHOTSONTARGET",
  5304: "EXPECTEDGOALS",
  5305: "EXPECTEDGOALSONTARGET",
};
const PERCENT_CODES: ReadonlySet<StatisticCode> = new Set(["possession", "pass_accuracy"]);

/** Lineup `position_id`s, as scripts/backend/current-season-recovery.ts reads them. */
const POSITIONS: Readonly<Record<number, Position>> = {
  24: "goalkeeper",
  25: "defender",
  26: "midfielder",
  27: "forward",
};
/** Lineup `type_id`s: the starting eleven and the bench. */
const LINEUP_SLOTS: Readonly<Record<number, "starting" | "bench">> = {
  11: "starting",
  12: "bench",
};

const GOAL_TYPES: ReadonlySet<MatchEventType> = new Set(["goal", "own_goal", "penalty_goal"]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  if (!isRecord(value)) throw new FixtureRuntimeError("invalid_provider_payload");
  return value;
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

/** An optional list: absent is "no data", anything but an array is a broken reply. */
function rows(value: unknown): readonly unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new FixtureRuntimeError("invalid_provider_payload");
  return value;
}

/** SportsMonks writes UTC as "2026-09-24 20:00:00". */
function providerTime(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

/**
 * The row's type name: the included type's `developer_name` when there is
 * one (and it agrees with the row's `type_id`), else the name the id stands
 * for. `null` when neither says.
 */
function typeName(row: JsonRecord, byId: Readonly<Record<number, string>>): string | null {
  if (isRecord(row.type) && typeof row.type.developer_name === "string") {
    if (row.type.id !== undefined && row.type.id !== row.type_id) return null;
    return row.type.developer_name.toUpperCase().replace(/[^A-Z]/g, "");
  }
  const id = positiveId(row.type_id);
  return id === null ? null : (byId[id] ?? null);
}

function participants(fixture: JsonRecord): Record<Side, number> {
  const found: Partial<Record<Side, number>> = {};
  for (const value of rows(fixture.participants)) {
    if (!isRecord(value) || !isRecord(value.meta) || typeof value.meta.location !== "string")
      continue;
    const location = value.meta.location.toLowerCase();
    if (location !== "home" && location !== "away") continue;
    const id = positiveId(value.id);
    if (id === null || found[location] !== undefined) {
      throw new FixtureRuntimeError("invalid_provider_payload");
    }
    found[location] = id;
  }
  if (found.home === undefined || found.away === undefined || found.home === found.away) {
    throw new FixtureRuntimeError("invalid_provider_payload");
  }
  return { home: found.home, away: found.away };
}

function sideOf(teams: Record<Side, number>, id: unknown): Side | null {
  if (id === teams.home) return "home";
  if (id === teams.away) return "away";
  return null;
}

/** "2-1" → home 2, away 1 (the provider's score after a goal, home first). */
function scoreAfter(value: unknown): Record<Side, number> | null {
  if (typeof value !== "string") return null;
  const match = /^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$/.exec(value);
  return match ? { home: Number(match[1]), away: Number(match[2]) } : null;
}

/**
 * `null` (the stored events stand) when the reply has no events section, or
 * when it has rows and none could be read. Otherwise the list, even empty, is
 * the provider's current word: an event missing from it is removed.
 */
function normalizeEvents(
  values: readonly unknown[] | null,
  teams: Record<Side, number>,
  skipped: MatchDetailsSkipped,
): MatchDetailsEvent[] | null {
  if (values === null) return null;
  const unreadableBefore = skipped.events;
  const read: Array<{
    key: string;
    type: MatchEventType;
    side: Side | null;
    playerId: number | null;
    relatedPlayerId: number | null;
    playerName: string | null;
    minute: number;
    addedTime: number;
    sortOrder: number;
    result: Record<Side, number> | null;
  }> = [];
  const keys = new Set<string>();
  for (const value of values) {
    if (!isRecord(value)) {
      skipped.events += 1;
      continue;
    }
    // Withdrawn by the provider (a card rescinded): not on the sheet.
    if (value.rescinded === true) continue;
    const id = positiveId(value.id);
    const name = typeName(value, EVENT_TYPE_IDS);
    if (id === null || name === null || !(name in EVENT_TYPES)) {
      skipped.events += 1;
      continue;
    }
    const type = EVENT_TYPES[name];
    if (type === null) continue;
    const minute = integerBetween(value.minute, 0, 180);
    const addedTime =
      value.extra_minute === null || value.extra_minute === undefined
        ? 0
        : integerBetween(value.extra_minute, 0, 60);
    const noTeam = value.participant_id === null || value.participant_id === undefined;
    const side = noTeam ? null : sideOf(teams, value.participant_id);
    if (minute === null || addedTime === null || (!noTeam && side === null)) {
      skipped.events += 1;
      continue;
    }
    const key = String(id);
    if (keys.has(key)) continue;
    keys.add(key);
    read.push({
      key,
      type,
      side,
      playerId: positiveId(value.player_id),
      relatedPlayerId: positiveId(value.related_player_id),
      playerName: text(value.player_name, 500),
      minute,
      addedTime,
      sortOrder: integerBetween(value.sort_order, 0, 1_000_000) ?? 0,
      result: scoreAfter(value.result),
    });
    if (read.length === MAX_EVENTS) break;
  }
  if (read.length === 0 && skipped.events > unreadableBefore) return null;

  read.sort(
    (left, right) =>
      left.minute - right.minute ||
      left.addedTime - right.addedTime ||
      left.sortOrder - right.sortOrder ||
      Number(left.key) - Number(right.key),
  );

  // An own goal belongs on the side it counted for, as scoreboards list it.
  // The score after each goal says which side that was, whichever team the
  // provider files the event under; without it, the provider's team stands.
  let score: Record<Side, number> = { home: 0, away: 0 };
  return read.map((event, index) => {
    let side = event.side;
    if (GOAL_TYPES.has(event.type) && event.result) {
      const home = event.result.home - score.home;
      const away = event.result.away - score.away;
      if (event.type === "own_goal") {
        if (home === 1 && away === 0) side = "home";
        else if (away === 1 && home === 0) side = "away";
      }
      score = event.result;
    }
    const player = event.playerId === null ? null : String(event.playerId);
    const related = event.relatedPlayerId === null ? null : String(event.relatedPlayerId);
    return {
      key: event.key,
      type: event.type,
      teamExternalId: side === null ? null : String(teams[side]),
      playerExternalId: player,
      relatedPlayerExternalId: related === player ? null : related,
      // The name, for a player the catalogue does not know; a VAR check's
      // provider text is English whatever the reader's language, so none.
      detail: event.type === "var" ? null : event.playerName,
      minute: event.minute,
      addedTime: event.addedTime,
      // "90+3" is minute 90 with 3 added, so the minute alone says the half.
      period: event.minute <= 45 ? "first_half" : event.minute <= 90 ? "second_half" : "extra_time",
      sequence: index + 1,
    };
  });
}

function normalizeStatistics(
  values: readonly unknown[],
  teams: Record<Side, number>,
  skipped: MatchDetailsSkipped,
): MatchDetailsStatistic[] {
  const statistics: MatchDetailsStatistic[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!isRecord(value)) {
      skipped.statistics += 1;
      continue;
    }
    const name = typeName(value, STATISTIC_TYPE_IDS);
    const code = name === null ? undefined : STATISTIC_CODES[name];
    if (!code) continue;
    const location = typeof value.location === "string" ? value.location.toLowerCase() : null;
    const side =
      sideOf(teams, value.participant_id) ??
      (location === "home" || location === "away" ? location : null);
    const figure = isRecord(value.data) ? value.data.value : undefined;
    if (
      side === null ||
      typeof figure !== "number" ||
      !Number.isFinite(figure) ||
      figure < 0 ||
      (PERCENT_CODES.has(code) && figure > 100) ||
      seen.has(`${side}:${code}`)
    ) {
      skipped.statistics += 1;
      continue;
    }
    seen.add(`${side}:${code}`);
    statistics.push({
      code,
      teamExternalId: String(teams[side]),
      value: figure,
      displayValue: null,
    });
  }
  return statistics;
}

function normalizeLineups(
  values: readonly unknown[],
  formationValues: readonly unknown[],
  teams: Record<Side, number>,
  skipped: MatchDetailsSkipped,
): MatchDetailsLineup[] {
  const formations = new Map<Side, string>();
  for (const value of formationValues) {
    if (!isRecord(value)) continue;
    const side = sideOf(teams, value.participant_id);
    const formation = text(value.formation, 20);
    if (side && formation) formations.set(side, formation);
  }

  const players: Record<Side, MatchDetailsLineupPlayer[]> = { home: [], away: [] };
  values.forEach((value, index) => {
    if (!isRecord(value)) {
      skipped.lineupPlayers += 1;
      return;
    }
    const side = sideOf(teams, value.team_id);
    const slot = LINEUP_SLOTS[positiveId(value.type_id) ?? 0];
    if (side === null || !slot || players[side].length === MAX_LINEUP_ROWS_PER_TEAM) {
      skipped.lineupPlayers += 1;
      return;
    }
    const player = positiveId(value.player_id);
    players[side].push({
      playerExternalId: player === null ? null : String(player),
      playerName: text(value.player_name, 200),
      slot,
      position: POSITIONS[positiveId(value.position_id) ?? 0] ?? null,
      shirtNumber: integerBetween(value.jersey_number, 1, 99),
      // The provider's on-pitch order (1 is the keeper) for the eleven; the
      // bench in the order it came.
      order:
        (slot === "starting" ? integerBetween(value.formation_position, 1, 11) : null) ??
        100 + index,
    });
  });

  return (["home", "away"] as const)
    .filter((side) => players[side].length > 0)
    .map((side) => ({
      teamExternalId: String(teams[side]),
      formation: formations.get(side) ?? null,
      confirmed: true,
      players: players[side],
    }));
}

function normalizePressure(
  values: readonly unknown[],
  teams: Record<Side, number>,
  skipped: MatchDetailsSkipped,
): MatchDetailsPressure[] {
  const pressure: MatchDetailsPressure[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!isRecord(value)) {
      skipped.pressure += 1;
      continue;
    }
    const side = sideOf(teams, value.participant_id);
    const minute = integerBetween(value.minute, 0, 180);
    const figure = value.pressure;
    if (
      side === null ||
      minute === null ||
      typeof figure !== "number" ||
      !Number.isFinite(figure) ||
      figure < 0 ||
      figure > 10_000 ||
      seen.has(`${side}:${minute}`) ||
      pressure.length === MAX_PRESSURE_ROWS
    ) {
      skipped.pressure += 1;
      continue;
    }
    seen.add(`${side}:${minute}`);
    pressure.push({ teamExternalId: String(teams[side]), minute, value: figure });
  }
  return pressure;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

/**
 * The provider's absent players (`sidelined`, with each row's `sideline` and
 * `player`). `null` — keep what is stored — when the reply has no such list,
 * or lists players none of which could be read: a reply that lost its nested
 * includes must not clear the absences.
 */
function normalizeAbsences(
  values: readonly unknown[] | null,
  teams: Record<Side, number>,
  skipped: MatchDetailsSkipped,
): MatchDetailsAbsence[] | null {
  if (values === null) return null;
  const absences: MatchDetailsAbsence[] = [];
  const keys = new Set<string>();
  for (const value of values) {
    const sideline = isRecord(value) && isRecord(value.sideline) ? value.sideline : null;
    const player = isRecord(value) && isRecord(value.player) ? value.player : null;
    const id = isRecord(value) ? positiveId(value.id) : null;
    const side = isRecord(value)
      ? (sideOf(teams, value.participant_id) ?? sideOf(teams, sideline?.team_id))
      : null;
    const kind = typeof sideline?.category === "string" ? sideline.category.toLowerCase() : "";
    const category = kind.includes("suspen")
      ? "suspension"
      : kind.includes("injur")
        ? "injury"
        : null;
    const playerId = isRecord(value)
      ? (positiveId(value.player_id) ?? positiveId(sideline?.player_id))
      : null;
    const playerName = text(player?.display_name ?? player?.common_name ?? player?.name, 200);
    if (
      id === null ||
      side === null ||
      category === null ||
      (playerId === null && playerName === null) ||
      keys.has(String(id)) ||
      absences.length === MAX_ABSENCES
    ) {
      skipped.absences += 1;
      continue;
    }
    keys.add(String(id));
    absences.push({
      key: String(id),
      teamExternalId: String(teams[side]),
      playerExternalId: playerId === null ? null : String(playerId),
      playerName,
      category,
      expectedReturnOn: isoDate(sideline?.end_date),
      gamesMissed: integerBetween(sideline?.games_missed, 0, 500),
    });
  }
  return values.length > 0 && absences.length === 0 ? null : absences;
}

/**
 * One SportsMonks fixture (`/fixtures/{id}` with `MATCH_DETAILS_INCLUDE`) as
 * the payload `api.ingest_football_match_details` takes, plus what was left
 * out. The fixture must be the one asked for, in the configured league and
 * season. A row that cannot be read is skipped and counted rather than
 * failing the fixture. Events and absences missing from the reply are sent as
 * `null` and any other section as empty, which the database reads as "keep
 * what is stored"; an events or absences list, even empty, replaces it.
 */
export function normalizeMatchDetails(
  payload: unknown,
  expected: {
    readonly fixtureExternalId: string;
    readonly leagueId: number;
    readonly seasonId: number;
  },
  observedAt: string,
): NormalizedMatchDetails {
  const fixture = record(record(payload).data);
  const id = positiveId(fixture.id);
  if (
    id === null ||
    String(id) !== expected.fixtureExternalId ||
    fixture.league_id !== expected.leagueId ||
    fixture.season_id !== expected.seasonId
  ) {
    throw new FixtureRuntimeError("invalid_provider_payload");
  }
  const teams = participants(fixture);
  const skipped: MatchDetailsSkipped = {
    events: 0,
    statistics: 0,
    lineupPlayers: 0,
    pressure: 0,
    absences: 0,
  };
  // The xG rows come back under `expected` (the include is `xGFixture`).
  const expectedGoals = [fixture.expected, fixture.xgfixture, fixture.xGFixture].find(
    Array.isArray,
  );
  const providerUpdatedAt =
    providerTime(fixture.last_processed_at) ?? providerTime(fixture.updated_at) ?? observedAt;
  return {
    providerUpdatedAt,
    // When BotolaGO read it: a later read always outranks an earlier one of
    // the same provider version, so two overlapping refreshes settle in order.
    sourceSequence: Math.max(0, Date.parse(observedAt)),
    events: normalizeEvents(
      fixture.events === undefined || fixture.events === null ? null : rows(fixture.events),
      teams,
      skipped,
    ),
    statistics: normalizeStatistics(
      [...rows(fixture.statistics), ...rows(expectedGoals)],
      teams,
      skipped,
    ),
    lineups: normalizeLineups(rows(fixture.lineups), rows(fixture.formations), teams, skipped),
    pressure: normalizePressure(rows(fixture.pressure), teams, skipped),
    absences: normalizeAbsences(
      fixture.sidelined === undefined || fixture.sidelined === null
        ? null
        : rows(fixture.sidelined),
      teams,
      skipped,
    ),
    skipped,
  };
}

function hasControlOrWhitespace(value: string): boolean {
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    if (point <= 0x20 || point === 0x7f) return true;
  }
  return false;
}

function idSetting(
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
): number {
  const raw = environment[name]?.trim() ?? "";
  if (!/^[1-9][0-9]{0,9}$/.test(raw))
    throw new FixtureRuntimeError("invalid_runtime_configuration");
  return Number(raw);
}

/** The token and scope the fixture job uses (see `liveRefreshEnvironment`). */
export function matchDetailsConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): MatchDetailsConfiguration {
  const token = environment.SPORTSMONKS_API_TOKEN?.trim() ?? "";
  if (token.length < 16 || token.length > 512 || hasControlOrWhitespace(token)) {
    throw new FixtureRuntimeError("invalid_runtime_configuration");
  }
  return {
    token,
    leagueId: idSetting(environment, "FOOTBALL_SPORTSMONKS_LEAGUE_ID"),
    seasonId: idSetting(environment, "FOOTBALL_SPORTSMONKS_SEASON_ID"),
    timeoutMs: DETAILS_TIMEOUT_MS,
    maxRetries: DETAILS_MAX_RETRIES,
  };
}

function failureCode(error: unknown): string {
  return error instanceof FixtureRuntimeError ? error.code : "match_details_failed";
}

async function rpc(
  client: FixtureRpcClient,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await client.schema("api").rpc(name, args);
  if (result.error) {
    const message = result.error.message ?? "";
    throw new FixtureRuntimeError(
      message.includes("INVALID_PROVIDER_PAYLOAD")
        ? "details_rejected_by_database"
        : message.includes("MAPPING_NOT_FOUND")
          ? "mapping_not_found"
          : "database_unavailable",
    );
  }
  return result.data;
}

async function fingerprint(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/**
 * Fetches and stores the details of every fixture the database names for
 * this scope: `live` (on, about to start, or finalized in the last two
 * hours) after each score refresh, `backfill` (finished, never stored) on
 * demand. Records one ingestion run (`match_events`) when anything was due,
 * with one rejection per fixture that failed; the backfill leaves out a
 * fixture refused twice. Never throws: a failure comes back as `{ error }` for
 * the caller to report.
 */
export async function runMatchDetailsRefresh(
  scope: MatchDetailsScope,
  dependencies: MatchDetailsDependencies,
): Promise<MatchDetailsOutcome> {
  let config: MatchDetailsConfiguration;
  let due: string[];
  try {
    config = matchDetailsConfiguration(dependencies.environment);
    const listed = await rpc(dependencies.client, "service_football_match_details_due", {
      p_provider_name: "sportsmonks",
      p_season_external_id: String(config.seasonId),
      p_scope: scope,
      p_limit: DUE_LIMIT[scope],
    });
    if (!Array.isArray(listed) || listed.length > DUE_LIMIT[scope]) {
      throw new FixtureRuntimeError("database_unavailable");
    }
    due = listed.map((item) => {
      const externalId = isRecord(item) ? item.externalId : null;
      if (typeof externalId !== "string" || !/^[1-9][0-9]{0,18}$/.test(externalId)) {
        throw new FixtureRuntimeError("database_unavailable");
      }
      return externalId;
    });
  } catch (error) {
    return { scope, error: failureCode(error) };
  }

  const summary = {
    scope,
    due: due.length,
    stored: 0,
    stale: 0,
    rejected: 0,
    events: 0,
    statistics: 0,
    lineupPlayers: 0,
    unmappedPlayers: 0,
    pressure: 0,
    absences: 0,
    addOnsUnavailable: 0,
    skipped: { events: 0, statistics: 0, lineupPlayers: 0, pressure: 0, absences: 0 },
    errors: [] as string[],
  };
  // Nothing due is the usual case between kick-offs: no run is recorded.
  if (due.length === 0) return summary;

  let runId: string;
  try {
    runId = String(
      await rpc(dependencies.client, "begin_football_ingestion", {
        p_provider_name: "sportsmonks",
        p_job_type: "match_events",
        p_target_scope: {
          kind: "match_details",
          scope,
          leagueId: config.leagueId,
          seasonId: config.seasonId,
        },
        p_checkpoint: {},
      }),
    );
  } catch (error) {
    return { scope, error: failureCode(error) };
  }

  const now = dependencies.now ?? (() => new Date());
  const failures = await Promise.all(
    due.map(async (externalId): Promise<string | null> => {
      try {
        const read = (include: string) =>
          providerRequest(
            `/fixtures/${externalId}`,
            { include, timezone: "UTC" },
            config,
            dependencies,
          );
        let payload: Record<string, unknown>;
        try {
          payload = await read(MATCH_DETAILS_INCLUDE);
        } catch (error) {
          if (!(error instanceof FixtureRuntimeError) || error.code !== "provider_unavailable") {
            throw error;
          }
          payload = await read(MATCH_DETAILS_BASE_INCLUDE);
          summary.addOnsUnavailable += 1;
        }
        const details = normalizeMatchDetails(
          payload,
          { fixtureExternalId: externalId, leagueId: config.leagueId, seasonId: config.seasonId },
          now().toISOString(),
        );
        const { skipped, ...stored } = details;
        const result = record(
          await rpc(dependencies.client, "ingest_football_match_details", {
            p_provider_name: "sportsmonks",
            p_fixture_external_id: externalId,
            p_details: stored,
          }),
        );
        if (result.outcome === "stale") {
          summary.stale += 1;
          return null;
        }
        if (result.outcome !== "stored") throw new FixtureRuntimeError("database_unavailable");
        summary.stored += 1;
        summary.events += count(result.events);
        summary.statistics += count(result.statistics);
        summary.lineupPlayers += count(result.lineupPlayers);
        summary.unmappedPlayers += count(result.unmappedPlayers);
        summary.pressure += count(result.pressure);
        summary.absences += count(result.absences);
        for (const section of Object.keys(skipped) as Array<keyof MatchDetailsSkipped>) {
          summary.skipped[section] += skipped[section];
        }
        return null;
      } catch (error) {
        return failureCode(error);
      }
    }),
  );

  const errors = new Set<string>();
  for (const [index, code] of failures.entries()) {
    if (code === null) continue;
    summary.rejected += 1;
    errors.add(code);
    try {
      await rpc(dependencies.client, "record_football_ingestion_rejection", {
        p_run_id: runId,
        p_entity_type: "fixture",
        p_external_id: due[index],
        p_payload_fingerprint: await fingerprint({ externalId: due[index], code }),
        p_error_code: code,
        p_validation_issues: [{ code }],
      });
    } catch {
      // The run still completes below, with the rejection counted.
    }
  }
  summary.errors = [...errors].sort();

  try {
    await rpc(dependencies.client, "complete_football_ingestion", {
      p_run_id: runId,
      p_status:
        summary.rejected === 0
          ? "succeeded"
          : summary.stored + summary.stale > 0
            ? "partial"
            : "failed",
      p_checkpoint: {
        events: summary.events,
        statistics: summary.statistics,
        lineupPlayers: summary.lineupPlayers,
        unmappedPlayers: summary.unmappedPlayers,
        pressure: summary.pressure,
        absences: summary.absences,
        addOnsUnavailable: summary.addOnsUnavailable,
        skipped: summary.skipped,
      },
      p_records_fetched: due.length,
      p_records_validated: summary.stored + summary.stale,
      p_records_inserted: 0,
      p_records_updated: summary.stored,
      p_records_skipped: summary.stale,
      p_records_rejected: summary.rejected,
      p_retry_count: 0,
      p_error_code: summary.rejected > 0 ? "match_details_item_rejected" : null,
      p_error_summary:
        summary.rejected > 0
          ? "The match details refresh did not complete for every fixture."
          : null,
    });
  } catch (error) {
    return { scope, error: failureCode(error) };
  }
  return summary;
}
