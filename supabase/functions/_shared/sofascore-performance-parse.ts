// SofaScore per-match replies (lineups, incidents, statistics) as the
// provider-neutral performance shapes of performance-contracts.ts.
//
// One implementation for both runtimes: the Edge Function reads the replies it
// already fetched for match details and builds the Fantasy observation from
// them, and src/backend/football/provider/sofascore-adapter.ts delegates its
// three parsers here (it wraps SofascoreParseError in a FootballError). The
// field names and values were read from real responses in Phase 0
// (docs/audits/2026-10-01-fantasy-providers-phase0.md); a field that is optional
// there is optional here, and `null` is not the same as absent.
//
// Dependency free apart from the shared types, so it runs under Bun and Deno.

import type {
  LineupPosition,
  MatchSide,
  PerformanceIncident,
  PerformanceIncidentKind,
  PerformanceLineupPlayer,
  PerformanceLineups,
  PerformancePlayerRef,
  PerformancePlayerStats,
  PerformanceStatisticLine,
} from "./performance-contracts.ts";

/** The reply does not have the shape this parser reads. Paths only, never values. */
export class SofascoreParseError extends Error {
  constructor(
    readonly what: string,
    readonly paths: readonly string[],
  ) {
    super(`Sofascore ${what} did not match the expected shape (${paths.slice(0, 5).join(", ")}).`);
    this.name = "SofascoreParseError";
  }
}

type Json = Record<string, unknown>;
const describeType = (value: unknown): string =>
  value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Collects the places where a reply is not what was read in Phase 0.
 *
 * A strict check fails the whole reply for any path. A lenient view of it
 * (`lenient()`) is for fields that are never scored: a wrong type there is
 * recorded as a diagnostic (path and JSON type, never the value) and the field
 * is read as absent. Any field that is scored is read through the strict check.
 */
class Check {
  readonly paths: string[] = [];
  readonly diagnostics: string[];
  private readonly soft: boolean;
  constructor(
    private readonly what: string,
    diagnostics: string[] = [],
    soft = false,
  ) {
    this.diagnostics = diagnostics;
    this.soft = soft;
  }
  /** The same check, but a bad value is a diagnostic and reads as absent. */
  lenient(): Check {
    return new Check(this.what, this.diagnostics, true);
  }
  bad(path: string, value?: unknown) {
    if (this.soft) this.diagnostics.push(`${path}: not used (${describeType(value)})`);
    else this.paths.push(path);
  }
  object(value: unknown, path: string): Json | null {
    if (isObject(value)) return value;
    this.bad(path, value);
    return null;
  }
  array(value: unknown, path: string): unknown[] | null {
    if (Array.isArray(value)) return value;
    this.bad(path, value);
    return null;
  }
  int(value: unknown, path: string): number | null {
    if (typeof value === "number" && Number.isInteger(value)) return value;
    this.bad(path, value);
    return null;
  }
  string(value: unknown, path: string): string | null {
    if (typeof value === "string") return value;
    this.bad(path, value);
    return null;
  }
  optional<T>(
    value: unknown,
    path: string,
    read: (v: unknown, p: string) => T | null,
  ): T | undefined {
    if (value === undefined) return undefined;
    const result = read(value, path);
    return result === null ? undefined : result;
  }
  optionalNumber(value: unknown, path: string): number | undefined {
    return this.optional(value, path, (v, p) => {
      if (typeof v === "number" && Number.isFinite(v)) return v;
      this.bad(p, v);
      return null;
    });
  }
  optionalBoolean(value: unknown, path: string): boolean | undefined {
    return this.optional(value, path, (v, p) => {
      if (typeof v === "boolean") return v;
      this.bad(p, v);
      return null;
    });
  }
  optionalString(value: unknown, path: string): string | undefined {
    return this.optional(value, path, (v, p) => this.string(v, p));
  }
  optionalInt(value: unknown, path: string): number | undefined {
    return this.optional(value, path, (v, p) => this.int(v, p));
  }
  playerRef(value: unknown, path: string): { id: number; name: string } | undefined {
    return this.optional(value, path, (v, p) => {
      const o = this.object(v, p);
      if (!o) return null;
      const id = this.int(o.id, `${p}.id`);
      // A name is display text, never identity: a missing or odd one reads as empty.
      const name = this.lenient().string(o.name, `${p}.name`) ?? "";
      return id === null ? null : { id, name };
    });
  }
  done(): void {
    if (this.paths.length > 0) throw new SofascoreParseError(this.what, this.paths);
  }
}

const ref = (value: { id: number; name: string } | undefined): PerformancePlayerRef | null =>
  value ? { externalId: String(value.id), name: value.name } : null;

const POSITIONS: readonly string[] = ["G", "D", "M", "F"];
const position = (value: string | undefined): LineupPosition | null =>
  value && POSITIONS.includes(value) ? (value as LineupPosition) : null;

interface RawLineupPlayer {
  id: number;
  name: string;
  playerPosition?: string;
  shirtNumber?: number;
  position?: string;
  substitute?: boolean;
  stats?: {
    minutesPlayed?: number;
    goals?: number;
    goalAssist?: number;
    ownGoals?: number;
    saves?: number;
    rating?: number;
    totalPass?: number;
    penaltyMiss?: number;
  };
}

function readLineupSide(check: Check, value: unknown, path: string): RawLineupPlayer[] {
  const side = check.object(value, path);
  const entries = side ? check.array(side.players, `${path}.players`) : null;
  const out: RawLineupPlayer[] = [];
  (entries ?? []).forEach((entry, index) => {
    const at = `${path}.players.${index}`;
    const e = check.object(entry, at);
    if (!e) return;
    const person = check.object(e.player, `${at}.player`);
    const id = person ? check.int(person.id, `${at}.player.id`) : null;
    // Never scored: the name, the positions and the rating read as absent when they are
    // null or of the wrong type (a diagnostic, not a failure). Identity is the id.
    const soft = check.lenient();
    const name = person ? (soft.string(person.name, `${at}.player.name`) ?? "") : null;
    const playerPosition = person
      ? soft.optionalString(person.position, `${at}.player.position`)
      : undefined;
    const shirtNumber = check.optionalInt(e.shirtNumber, `${at}.shirtNumber`);
    const pos = soft.optionalString(e.position, `${at}.position`);
    const substitute = check.optionalBoolean(e.substitute, `${at}.substitute`);
    let stats: RawLineupPlayer["stats"];
    if (e.statistics !== undefined) {
      const s = check.object(e.statistics, `${at}.statistics`);
      if (s) {
        const num = (key: string) => check.optionalNumber(s[key], `${at}.statistics.${key}`);
        stats = {
          minutesPlayed: num("minutesPlayed"),
          goals: num("goals"),
          goalAssist: num("goalAssist"),
          ownGoals: num("ownGoals"),
          saves: num("saves"),
          rating: soft.optionalNumber(s.rating, `${at}.statistics.rating`),
          totalPass: num("totalPass"),
          penaltyMiss: num("penaltyMiss"),
        };
      }
    }
    if (id === null || name === null) return;
    out.push({ id, name, playerPosition, shirtNumber, position: pos, substitute, stats });
  });
  return out;
}

/**
 * Lineups with per-player statistics. `fullCoverage` is true when any player
 * carries `totalPass`. On a limited match `goalAssist` is 0 for everyone and
 * there is no `saves`, so `assists` is returned as null there (unknown), and
 * `saves` is null whenever the provider did not send it. A goalkeeper with no
 * `saves` value is never read as zero saves.
 */
export function parseSofascoreLineups(raw: unknown): PerformanceLineups {
  return parseSofascoreLineupsDetailed(raw).lineups;
}

/** A parse result with the places where an unscored field was not used (paths and JSON types only). */
export interface ParsedLineups {
  readonly lineups: PerformanceLineups;
  readonly diagnostics: readonly string[];
}

export function parseSofascoreLineupsDetailed(raw: unknown): ParsedLineups {
  const check = new Check("lineups");
  const root = check.object(raw, "");
  const home = readLineupSide(check, root?.home, "home");
  const away = readLineupSide(check, root?.away, "away");
  check.done();
  const all = [...home, ...away];
  const fullCoverage = all.some((entry) => entry.stats?.totalPass !== undefined);
  const build = (side: MatchSide, entries: RawLineupPlayer[]): PerformanceLineupPlayer[] =>
    entries.map((entry) => {
      const stats = entry.stats;
      const playerStats: PerformancePlayerStats | null = stats
        ? {
            minutesPlayed: stats.minutesPlayed ?? null,
            goals: stats.goals ?? null,
            assists: fullCoverage ? (stats.goalAssist ?? null) : null,
            ownGoals: stats.ownGoals ?? null,
            saves: fullCoverage ? (stats.saves ?? null) : null,
            rating: stats.rating ?? null,
            penaltyMissed: stats.penaltyMiss ?? null,
          }
        : null;
      return {
        provider: "sofascore",
        externalId: String(entry.id),
        name: entry.name,
        side,
        shirtNumber: entry.shirtNumber ?? null,
        position: position(entry.position ?? entry.playerPosition),
        starter: entry.substitute === false,
        stats: playerStats,
      };
    });
  return {
    lineups: {
      provider: "sofascore",
      players: [...build("home", home), ...build("away", away)],
      fullCoverage,
    },
    diagnostics: check.diagnostics,
  };
}

/** Labels that may change the score or a card count; shared with the Fantasy builder. */
export const SCORE_RELEVANT_LABEL = /goal|card|penalt|red|yellow|own/i;

export const incidentLabel = (rawType: string, rawClass: string | null): string =>
  `${rawType}${rawClass ? `/${rawClass}` : ""}`;

/**
 * Is this the SofaScore label of an own goal (`goal` with class `ownGoal`)? The
 * parser keeps such an incident as `unknown` with its raw labels, as stored
 * replies and the two-provider reconciler expect; the Fantasy builder reads it
 * through this function. The named player is the one who put it into his own net.
 */
export const isOwnGoalIncident = (incident: {
  readonly rawType: string;
  readonly rawClass: string | null;
}): boolean => incident.rawType === "goal" && incident.rawClass === "ownGoal";

/** Types whose fields all matter to a score: strict, as before. Everything else is metadata. */
const SCORING_TYPES: ReadonlySet<string> = new Set(["substitution"]);
const scoringType = (rawType: string): boolean =>
  SCORING_TYPES.has(rawType) || SCORE_RELEVANT_LABEL.test(rawType);

/**
 * Incident type and class pairs seen in Phase 0: goal/regular, goal/penalty,
 * inGamePenalty/missed, card/yellow, card/yellowRed, card/red, substitution/
 * regular, and `period` markers (skipped). Anything else is `unknown` with its
 * raw labels; goal/ownGoal is one of those (see `isOwnGoalIncident`).
 * Rescinded incidents (VAR) are dropped.
 *
 * Strictness: an incident whose type can change a score (goal, card, penalty,
 * substitution...) must be well formed in every field, or the whole reply fails.
 * Any other incident (a VAR note, a period marker...) is metadata: a null or
 * wrongly typed class, minute or side reads as absent with a diagnostic, and
 * one that cannot be placed is dropped with a diagnostic, unless its label
 * (type and class) or a named player says it could matter.
 * Only the explicitly understood `injuryTime` announcement without a class or
 * player attribution may be dropped silently when its minute or side is absent.
 */
export function parseSofascoreIncidents(raw: unknown): PerformanceIncident[] {
  return parseSofascoreIncidentsDetailed(raw).incidents;
}

export interface ParsedIncidents {
  readonly incidents: PerformanceIncident[];
  readonly diagnostics: readonly string[];
}

export function parseSofascoreIncidentsDetailed(raw: unknown): ParsedIncidents {
  const check = new Check("incidents");
  const root = check.object(raw, "");
  const list = root ? check.array(root.incidents, "incidents") : null;
  interface Read {
    rawType: string;
    rawClass: string | null;
    time?: number;
    addedTime?: number;
    isHome?: boolean;
    rescinded?: boolean;
    player?: { id: number; name: string };
    assist1?: { id: number; name: string };
    playerIn?: { id: number; name: string };
    playerOut?: { id: number; name: string };
    path: string;
  }
  const read: Read[] = [];
  (list ?? []).forEach((item, index) => {
    const at = `incidents.${index}`;
    const o = check.object(item, at);
    if (!o) return;
    const rawType = check.string(o.incidentType, `${at}.incidentType`);
    // A scored incident is read strictly; any other is metadata and read leniently.
    const field = rawType !== null && scoringType(rawType) ? check : check.lenient();
    const rawClass = field.optionalString(o.incidentClass, `${at}.incidentClass`);
    const entry: Read = {
      rawType: rawType ?? "",
      rawClass: rawClass ?? null,
      time: field.optionalInt(o.time, `${at}.time`),
      addedTime: field.optionalInt(o.addedTime, `${at}.addedTime`),
      isHome: field.optionalBoolean(o.isHome, `${at}.isHome`),
      rescinded: field.optionalBoolean(o.rescinded, `${at}.rescinded`),
      player: check.playerRef(o.player, `${at}.player`),
      assist1: check.playerRef(o.assist1, `${at}.assist1`),
      playerIn: check.playerRef(o.playerIn, `${at}.playerIn`),
      playerOut: check.playerRef(o.playerOut, `${at}.playerOut`),
      path: at,
    };
    if (rawType !== null) read.push(entry);
  });
  check.done();
  const out: PerformanceIncident[] = [];
  for (const incident of read) {
    if (incident.rawType === "period") continue;
    if (incident.rescinded === true) continue;
    const { rawType, rawClass } = incident;
    let kind: PerformanceIncidentKind = "unknown";
    if (rawType === "goal" && rawClass === "regular") kind = "goal";
    else if (rawType === "goal" && rawClass === "penalty") kind = "penalty_goal";
    else if (rawType === "inGamePenalty" && rawClass === "missed") kind = "penalty_missed";
    else if (rawType === "card" && rawClass === "yellow") kind = "yellow_card";
    else if (rawType === "card" && rawClass === "yellowRed") kind = "second_yellow";
    else if (rawType === "card" && rawClass === "red") kind = "red_card";
    else if (rawType === "substitution" && rawClass === "regular") kind = "substitution";
    if (incident.time === undefined || incident.isHome === undefined) {
      const named =
        incident.player !== undefined ||
        incident.assist1 !== undefined ||
        incident.playerIn !== undefined ||
        incident.playerOut !== undefined;
      // Only the reviewed added-time announcement is harmless metadata.
      if (rawType === "injuryTime" && rawClass === null && !named) continue;
      // Unknown substitutions, goals and cards that cannot be placed must not be guessed at:
      // fail the whole match so it goes to review instead of scoring on partial data.
      if (
        scoringType(rawType) ||
        SCORE_RELEVANT_LABEL.test(incidentLabel(rawType, rawClass)) ||
        named
      )
        throw new SofascoreParseError("incidents", [`${rawType}: no minute or side`]);
      // Not score-relevant and not placed: nothing to score, nothing to guess.
      check.diagnostics.push(`${incident.path}: dropped (${rawType} without minute or side)`);
      continue;
    }
    out.push({
      provider: "sofascore",
      kind,
      side: incident.isHome ? "home" : "away",
      minute: incident.time,
      addedMinutes: incident.addedTime ?? null,
      player: ref(incident.player),
      assist: ref(incident.assist1),
      playerIn: ref(incident.playerIn),
      playerOut: ref(incident.playerOut),
      rawType,
      rawClass,
    });
  }
  return { incidents: out, diagnostics: check.diagnostics };
}

/** Stoppage time announced for each half, in minutes; null when SofaScore announced none. */
export interface SofascoreStoppage {
  readonly firstHalf: number | null;
  readonly secondHalf: number | null;
}

/** Longer than any real announcement: a value above it is not trusted. */
const MAX_ANNOUNCED_STOPPAGE = 20;

/**
 * The stoppage time the fourth official announced, read from the `injuryTime`
 * incidents (`time` 45 or 90, `length` in minutes). Never throws: a missing or
 * odd value is null, and null means "not known", never zero. Two announcements
 * for one half that disagree are not known either.
 */
export function parseSofascoreStoppage(raw: unknown): SofascoreStoppage {
  const list =
    typeof raw === "object" &&
    raw !== null &&
    Array.isArray((raw as { incidents?: unknown }).incidents)
      ? (raw as { incidents: unknown[] }).incidents
      : [];
  const seen: Record<45 | 90, Set<number>> = { 45: new Set(), 90: new Set() };
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    if (o.incidentType !== "injuryTime" || o.rescinded === true) continue;
    const { time, length } = o;
    if (time !== 45 && time !== 90) continue;
    if (
      typeof length !== "number" ||
      !Number.isInteger(length) ||
      length < 0 ||
      length > MAX_ANNOUNCED_STOPPAGE
    )
      continue;
    seen[time].add(length);
  }
  const one = (values: Set<number>) => (values.size === 1 ? [...values][0] : null);
  return { firstHalf: one(seen[45]), secondHalf: one(seen[90]) };
}

/** Team statistic lines, whole match and per half as the provider sends them. */
export function parseSofascoreStatistics(raw: unknown): PerformanceStatisticLine[] {
  const check = new Check("statistics");
  const root = check.object(raw, "");
  const periods = root ? check.array(root.statistics, "statistics") : null;
  const out: PerformanceStatisticLine[] = [];
  (periods ?? []).forEach((period, pi) => {
    const at = `statistics.${pi}`;
    const p = check.object(period, at);
    if (!p) return;
    const name = check.string(p.period, `${at}.period`);
    const groups = check.array(p.groups, `${at}.groups`);
    (groups ?? []).forEach((group, gi) => {
      const g = check.object(group, `${at}.groups.${gi}`);
      const items = g ? check.array(g.statisticsItems, `${at}.groups.${gi}.statisticsItems`) : null;
      (items ?? []).forEach((item, ii) => {
        const ip = `${at}.groups.${gi}.statisticsItems.${ii}`;
        const o = check.object(item, ip);
        if (!o) return;
        const key = check.string(o.key, `${ip}.key`);
        const label = check.string(o.name, `${ip}.name`);
        const home = check.optionalNumber(o.homeValue, `${ip}.homeValue`);
        const away = check.optionalNumber(o.awayValue, `${ip}.awayValue`);
        if (name !== null && key !== null && label !== null)
          out.push({ period: name, key, label, home: home ?? null, away: away ?? null });
      });
    });
  });
  check.done();
  return out;
}
