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
const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Collects the places where a reply is not what was read in Phase 0. */
class Check {
  readonly paths: string[] = [];
  constructor(private readonly what: string) {}
  bad(path: string) {
    this.paths.push(path);
  }
  object(value: unknown, path: string): Json | null {
    if (isObject(value)) return value;
    this.bad(path);
    return null;
  }
  array(value: unknown, path: string): unknown[] | null {
    if (Array.isArray(value)) return value;
    this.bad(path);
    return null;
  }
  int(value: unknown, path: string): number | null {
    if (typeof value === "number" && Number.isInteger(value)) return value;
    this.bad(path);
    return null;
  }
  string(value: unknown, path: string): string | null {
    if (typeof value === "string") return value;
    this.bad(path);
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
      this.bad(p);
      return null;
    });
  }
  optionalBoolean(value: unknown, path: string): boolean | undefined {
    return this.optional(value, path, (v, p) => {
      if (typeof v === "boolean") return v;
      this.bad(p);
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
      const name = this.string(o.name, `${p}.name`);
      return id === null || name === null ? null : { id, name };
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
    const name = person ? check.string(person.name, `${at}.player.name`) : null;
    const playerPosition = person
      ? check.optionalString(person.position, `${at}.player.position`)
      : undefined;
    const shirtNumber = check.optionalInt(e.shirtNumber, `${at}.shirtNumber`);
    const pos = check.optionalString(e.position, `${at}.position`);
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
          rating: num("rating"),
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
    provider: "sofascore",
    players: [...build("home", home), ...build("away", away)],
    fullCoverage,
  };
}

/**
 * Incident type and class pairs seen in Phase 0: goal/regular, goal/penalty,
 * inGamePenalty/missed, card/yellow, card/yellowRed, card/red, substitution/
 * regular, and `period` markers (skipped). Anything else, including an own
 * goal (not seen in any of the ten matches), is `unknown` with its raw labels.
 * Rescinded incidents (VAR) are dropped.
 */
export function parseSofascoreIncidents(raw: unknown): PerformanceIncident[] {
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
  }
  const read: Read[] = [];
  (list ?? []).forEach((item, index) => {
    const at = `incidents.${index}`;
    const o = check.object(item, at);
    if (!o) return;
    const rawType = check.string(o.incidentType, `${at}.incidentType`);
    const rawClass = check.optionalString(o.incidentClass, `${at}.incidentClass`);
    const entry: Read = {
      rawType: rawType ?? "",
      rawClass: rawClass ?? null,
      time: check.optionalInt(o.time, `${at}.time`),
      addedTime: check.optionalInt(o.addedTime, `${at}.addedTime`),
      isHome: check.optionalBoolean(o.isHome, `${at}.isHome`),
      rescinded: check.optionalBoolean(o.rescinded, `${at}.rescinded`),
      player: check.playerRef(o.player, `${at}.player`),
      assist1: check.playerRef(o.assist1, `${at}.assist1`),
      playerIn: check.playerRef(o.playerIn, `${at}.playerIn`),
      playerOut: check.playerRef(o.playerOut, `${at}.playerOut`),
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
      // An incident that cannot be placed must not be guessed at: fail the whole
      // match so it goes to review instead of scoring on partial data.
      throw new SofascoreParseError("incidents", [`${rawType}: no minute or side`]);
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
  return out;
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
