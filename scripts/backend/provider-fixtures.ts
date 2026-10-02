/**
 * Phase 0 fixture builder for docs/backend/FANTASY_SOFASCORE_FLASHSCORE_PLAN.md.
 *
 * Fetches each listed match from Sofascore and Flashscore (RapidAPI) and writes
 * TRIMMED copies: only the fields the Fantasy adapters will read, chosen by the
 * keep-lists below. The repository is public and the payloads are third-party
 * data, so no full response is ever written. The log shows counts and field
 * NAMES that were dropped, never values.
 *
 *   RAPIDAPI_KEY=... FLASHSCORE_RAPIDAPI_HOST=... \
 *     bun scripts/backend/provider-fixtures.ts tests/fixtures/providers/matches.json --out <dir>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { probe, requestsUsed } from "./provider-probe";

/** `true` keeps a value as is; an object keeps only the named keys (through lists). */
export type KeepSpec = true | { readonly [key: string]: KeepSpec };

/** Keeps only the fields named in `spec`. Fields absent from the source stay absent. */
export function trim(value: unknown, spec: KeepSpec): unknown {
  if (spec === true) return value;
  if (Array.isArray(value)) return value.map((item) => trim(item, spec));
  if (value === null || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(spec)) {
    if (key in source) out[key] = trim(source[key], child);
  }
  return out;
}

/** The names of the fields `trim` would drop, as dotted paths without list indexes. */
export function droppedFields(value: unknown, spec: KeepSpec, path = "$"): string[] {
  if (spec === true) return [];
  if (Array.isArray(value)) return value.flatMap((item) => droppedFields(item, spec, `${path}[]`));
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    key in spec ? droppedFields(child, spec[key] ?? true, `${path}.${key}`) : [`${path}.${key}`],
  );
}

const PERSON: KeepSpec = { id: true, name: true, shortName: true };

// ---- Sofascore -------------------------------------------------------------

/** Player statistics the reconciler or the display reads (rating is display-only). */
export const SOFASCORE_PLAYER_STATS: KeepSpec = {
  minutesPlayed: true,
  goals: true,
  goalAssist: true,
  ownGoals: true,
  saves: true,
  rating: true,
  totalShots: true,
  onTargetScoringAttempt: true,
  // Present only on full-coverage matches: how coverage is told apart from a real zero.
  totalPass: true,
  // A missed penalty is a scoring fact; the incident ("inGamePenalty", class "missed") is the other source.
  penaltyMiss: true,
};

const SOFASCORE_LINEUP_SIDE: KeepSpec = {
  players: {
    player: { id: true, name: true, shortName: true, position: true, jerseyNumber: true },
    teamId: true,
    shirtNumber: true,
    position: true,
    substitute: true,
    statistics: SOFASCORE_PLAYER_STATS,
  },
  formation: true,
};

export const SOFASCORE_SPEC = {
  detail: {
    event: {
      id: true,
      startTimestamp: true,
      status: { type: true },
      roundInfo: { round: true },
      season: { id: true },
      tournament: { uniqueTournament: { id: true } },
      homeTeam: PERSON,
      awayTeam: PERSON,
      homeScore: { current: true, period1: true, period2: true },
      awayScore: { current: true, period1: true, period2: true },
    },
  },
  lineups: { confirmed: true, home: SOFASCORE_LINEUP_SIDE, away: SOFASCORE_LINEUP_SIDE },
  incidents: {
    incidents: {
      id: true,
      incidentType: true,
      incidentClass: true,
      time: true,
      addedTime: true,
      isHome: true,
      text: true,
      reason: true,
      rescinded: true,
      from: true,
      homeScore: true,
      awayScore: true,
      player: PERSON,
      assist1: PERSON,
      assist2: PERSON,
      playerIn: PERSON,
      playerOut: PERSON,
    },
  },
} as const satisfies Record<string, KeepSpec>;

/** Team statistic lines worth keeping: shots on target and keeper saves, plus cards. */
export const SOFASCORE_TEAM_STAT_KEYS = [
  "shotsOnGoal",
  "totalShotsOnGoal",
  "goalkeeperSaves",
  "yellowCards",
  "redCards",
] as const;

type SofascoreStatistics = {
  statistics?: {
    period?: string;
    groups?: { groupName?: string; statisticsItems?: unknown[] }[];
  }[];
};

export function trimSofascoreStatistics(raw: unknown): unknown {
  const keep = new Set<string>(SOFASCORE_TEAM_STAT_KEYS);
  const periods = (raw as SofascoreStatistics).statistics ?? [];
  return {
    statistics: periods.map((period) => ({
      period: period.period,
      groups: (period.groups ?? []).map((group) => ({
        groupName: group.groupName,
        statisticsItems: trim(
          (group.statisticsItems ?? []).filter((item) =>
            keep.has((item as { key?: string }).key ?? ""),
          ),
          { key: true, name: true, home: true, away: true, homeValue: true, awayValue: true },
        ),
      })),
    })),
  };
}

// ---- Flashscore ------------------------------------------------------------

export const FLASHSCORE_SPEC = {
  data: {
    DATA: {
      EVENT: {
        EVENT_ID: true,
        START_UTIME: true,
        STAGE: true,
        ROUND: true,
        HOME_NAME: true,
        AWAY_NAME: true,
        HOME_PARTICIPANT_IDS: true,
        AWAY_PARTICIPANT_IDS: true,
        HOME_SCORE_FULL: true,
        AWAY_SCORE_FULL: true,
      },
      TOURNAMENT: {
        NAME: true,
        TOURNAMENT_ID: true,
        TOURNAMENT_STAGE_ID: true,
        TOURNAMENT_SEASON_ID: true,
      },
    },
  },
  summary: {
    DATA: {
      STAGE_NAME: true,
      RESULT_HOME: true,
      RESULT_AWAY: true,
      ITEMS: {
        INCIDENT_ID: true,
        INCIDENT_TEAM: true,
        INCIDENT_TIME: true,
        ADDED_TIME: true,
        INCIDENT_PARTICIPANTS: {
          INCIDENT_TYPE: true,
          INCIDENT_NAME: true,
          PARTICIPANT_NAME: true,
          PARTICIPANT_ID: true,
          HOME_SCORE: true,
          AWAY_SCORE: true,
        },
      },
    },
  },
  lineups: {
    DATA: {
      FORMATION_NAME: true,
      PLAYER_GROUP_TYPE: true,
      FORMATIONS: {
        FORMATION_LINE: true,
        MEMBERS: {
          PLAYER_ID: true,
          PLAYER_FULL_NAME: true,
          SHORT_NAME: true,
          PLAYER_NUMBER: true,
          PLAYER_POSITION: true,
          PLAYER_POSITION_ID: true,
          PLAYER_TYPE: true,
          INCIDENTS: true,
        },
      },
    },
  },
  statistics: {
    DATA: {
      STAGE_NAME: true,
      GROUPS: {
        GROUP_LABEL: true,
        ITEMS: { INCIDENT_NAME: true, VALUE_HOME: true, VALUE_AWAY: true },
      },
    },
  },
} as const satisfies Record<string, KeepSpec>;

// ---- Per-match summary (counts and labels only: no names, no values that identify people) ----

type Json = Record<string, unknown>;
const asList = (value: unknown): Json[] => (Array.isArray(value) ? (value as Json[]) : []);
const asObject = (value: unknown): Json =>
  value !== null && typeof value === "object" ? (value as Json) : {};
const tally = (labels: string[]) =>
  Object.fromEntries(
    [...new Set(labels)].sort().map((label) => [label, labels.filter((l) => l === label).length]),
  );

export function summarizeSofascore(raw: {
  lineups: unknown;
  incidents: unknown;
  statistics: unknown;
}) {
  const sides = [asObject(asObject(raw.lineups).home), asObject(asObject(raw.lineups).away)];
  const stats = sides.flatMap((side) =>
    asList(side.players).flatMap((p) => (p.statistics ? [asObject(p.statistics)] : [])),
  );
  const incidents = asList(asObject(raw.incidents).incidents);
  const goals = incidents.filter((i) => i.incidentType === "goal");
  const sum = (key: string) => stats.reduce((total, s) => total + Number(s[key] ?? 0), 0);
  const teamKeys = asList(asObject(raw.statistics).statistics).flatMap((period) =>
    asList(period.groups).flatMap((group) =>
      asList(group.statisticsItems).map((item) => String(item.key)),
    ),
  );
  return {
    playersWithStatistics: stats.length,
    fullCoverage: stats.some((s) => s.totalPass !== undefined),
    rated: stats.filter((s) => s.rating !== undefined).length,
    keepersWithSaves: stats.filter((s) => s.saves !== undefined).length,
    incidents: tally(
      incidents.map((i) => `${String(i.incidentType)}/${String(i.incidentClass ?? "")}`),
    ),
    goalsInIncidents: goals.length,
    goalsWithAssistInIncidents: goals.filter((g) => g.assist1 !== undefined).length,
    goalsInLineups: sum("goals"),
    assistsInLineups: sum("goalAssist"),
    teamStatKeys: [...new Set(teamKeys)].filter((key) =>
      (SOFASCORE_TEAM_STAT_KEYS as readonly string[]).includes(key),
    ),
  };
}

export function summarizeFlashscore(raw: { data: unknown; summary: unknown; statistics: unknown }) {
  const event = asObject(asObject(asObject(raw.data).DATA).EVENT);
  const types = asList(asObject(raw.summary).DATA).flatMap((stage) =>
    asList(stage.ITEMS).flatMap((item) =>
      asList(item.INCIDENT_PARTICIPANTS).map((p) => String(p.INCIDENT_TYPE)),
    ),
  );
  const matchStage = asList(asObject(raw.statistics).DATA).find((s) => s.STAGE_NAME === "Match");
  const onTarget = asList(matchStage?.GROUPS)
    .flatMap((group) => asList(group.ITEMS))
    .find((item) => item.INCIDENT_NAME === "Shots on target");
  return {
    score: [event.HOME_SCORE_FULL ?? null, event.AWAY_SCORE_FULL ?? null],
    incidentTypes: tally(types),
    shotsOnTarget: onTarget ? [onTarget.VALUE_HOME, onTarget.VALUE_AWAY] : null,
  };
}

// ---- Plan and run ----------------------------------------------------------

export interface PlannedMatch {
  readonly key: string;
  readonly label: string;
  readonly sofascoreId: number | null;
  readonly flashscoreId: string | null;
}

export interface Plan {
  readonly matches: readonly PlannedMatch[];
}

const SOFASCORE_ENDPOINTS = {
  detail: (id: number) => `matches/detail?matchId=${id}`,
  lineups: (id: number) => `matches/get-lineups?matchId=${id}`,
  incidents: (id: number) => `matches/get-incidents?matchId=${id}`,
  statistics: (id: number) => `matches/get-statistics?matchId=${id}`,
} as const;

const FLASHSCORE_ENDPOINTS = {
  data: (id: string) => `v1/events/data?event_id=${id}&locale=en_INT`,
  summary: (id: string) => `v1/events/summary?event_id=${id}&locale=en_INT`,
  lineups: (id: string) => `v1/events/lineups?event_id=${id}&locale=en_INT`,
  statistics: (id: string) => `v1/events/statistics?event_id=${id}&locale=en_INT`,
} as const;

async function fetchJson(provider: "sofascore" | "flashscore", path: string): Promise<unknown> {
  const result = await probe(provider, path);
  if (result.status !== 200)
    throw new Error(`${provider} ${path.split("?")[0]}: HTTP ${result.status}`);
  return JSON.parse(result.body) as unknown;
}

function write(outDir: string, relative: string, value: unknown) {
  const file = resolve(outDir, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

if (import.meta.main) {
  const [planPath, flag, outDir, ...rest] = process.argv.slice(2);
  if (!planPath || flag !== "--out" || !outDir) {
    console.error("usage: provider-fixtures.ts <plan.json> --out <dir> [--only=<key>,<key>]");
    process.exit(2);
  }
  const only = rest
    .find((a) => a.startsWith("--only="))
    ?.slice(7)
    .split(",")
    .filter(Boolean);
  if (resolve(outDir).startsWith(resolve(import.meta.dir, "../.."))) {
    throw new Error("--out must be outside the repository: review the files, then commit them");
  }
  const plan = JSON.parse(readFileSync(planPath, "utf8")) as Plan;
  const dropped = new Map<string, Set<string>>();
  const note = (scope: string, names: string[]) => {
    const set = dropped.get(scope) ?? new Set<string>();
    for (const name of names) set.add(name);
    dropped.set(scope, set);
  };

  for (const match of plan.matches) {
    if (only && !only.includes(match.key)) continue;
    const sofascoreRaw: Record<string, unknown> = {};
    const flashscoreRaw: Record<string, unknown> = {};
    if (match.sofascoreId !== null) {
      for (const [name, build] of Object.entries(SOFASCORE_ENDPOINTS)) {
        const raw = await fetchJson("sofascore", build(match.sofascoreId));
        sofascoreRaw[name] = raw;
        if (name === "statistics") {
          write(
            outDir,
            `sofascore/${match.sofascoreId}.${name}.json`,
            trimSofascoreStatistics(raw),
          );
        } else {
          const spec = SOFASCORE_SPEC[name as keyof typeof SOFASCORE_SPEC];
          note(`sofascore.${name}`, droppedFields(raw, spec));
          write(outDir, `sofascore/${match.sofascoreId}.${name}.json`, trim(raw, spec));
        }
      }
    }
    if (match.flashscoreId !== null) {
      for (const [name, build] of Object.entries(FLASHSCORE_ENDPOINTS)) {
        const raw = await fetchJson("flashscore", build(match.flashscoreId));
        flashscoreRaw[name] = raw;
        const spec = FLASHSCORE_SPEC[name as keyof typeof FLASHSCORE_SPEC];
        note(`flashscore.${name}`, droppedFields(raw, spec));
        write(outDir, `flashscore/${match.flashscoreId}.${name}.json`, trim(raw, spec));
      }
    }
    console.log(`${match.key}: done (${requestsUsed()} requests so far)`);
    if (match.sofascoreId !== null) {
      const { lineups, incidents, statistics } = sofascoreRaw;
      console.log(
        `SUMMARY ${match.key} sofascore ${JSON.stringify(summarizeSofascore({ lineups, incidents, statistics }))}`,
      );
    }
    if (match.flashscoreId !== null) {
      const { data, summary, statistics } = flashscoreRaw;
      console.log(
        `SUMMARY ${match.key} flashscore ${JSON.stringify(summarizeFlashscore({ data, summary, statistics }))}`,
      );
    }
  }
  // Field names only: which fields the keep-lists left out, so a needed one is not missed.
  for (const [scope, names] of dropped)
    console.log(`DROPPED ${scope}: ${[...names].sort().join(" ")}`);
  console.log(`requests used: ${requestsUsed()}`);
}
