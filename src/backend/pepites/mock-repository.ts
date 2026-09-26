import type { RepositoryContext } from "@/backend/contracts/repository";

import type {
  EditionEntry,
  EditionResponse,
  FollowState,
  HomeResponse,
  MethodologyResponse,
  PepitesEdition,
  PepitesPlayerCard,
  PepitesRepository,
  PepitesTeam,
  PlayerMatchesResponse,
  PlayerResponse,
  PlayerStatsResponse,
  PositionGroup,
  RankingQuery,
  RankingResponse,
  RankingRow,
  ReportableField,
  VersionResponse,
  WeeklyEmailDto,
} from "./contracts";
import { PepitesError } from "./errors";

/**
 * Sample Pépites data for development and the browser tests: fictional
 * players ("Joueur exemple"), real club names, two published weeks. Nothing
 * here reaches production (`src/services/pepites.ts` refuses the mock there).
 *
 * The browser tests drive the reveal through `globalThis.__pepitesMock`
 * (development builds only): `{ state, nextRevealAt, publishNext, offline }`.
 */

const SEASON_ID = "7e000000-0000-4000-8000-000000000001";
const PREVIOUS_SEASON_ID = "7e000000-0000-4000-8000-000000000002";
const EDITION_14 = "7e100000-0000-4000-8000-000000000014";
const EDITION_15 = "7e100000-0000-4000-8000-000000000015";
const EDITION_16 = "7e100000-0000-4000-8000-000000000016";

const CLUBS: Array<[string, string, string, string]> = [
  ["raja", "Raja Casablanca", "الرجاء الرياضي", "Raja"],
  ["wydad", "Wydad AC", "الوداد الرياضي", "Wydad"],
  ["far", "AS FAR", "الجيش الملكي", "FAR"],
  ["berkane", "RS Berkane", "نهضة بركان", "RSB"],
  ["fus", "FUS Rabat", "الفتح الرياضي", "FUS"],
  ["mas", "Maghreb Fès", "المغرب الفاسي", "MAS"],
  ["husa", "Hassania Agadir", "حسنية أكادير", "HUSA"],
  ["irt", "Ittihad Tanger", "اتحاد طنجة", "IRT"],
];

function uuid(prefix: string, n: number): string {
  return `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

const teams: PepitesTeam[] = CLUBS.map(([slug, fr, ar, short], index) => ({
  id: uuid("7e200000", index + 1),
  slug,
  name: { fr, ar },
  shortName: { fr: short, ar },
}));

const POSITIONS: PositionGroup[] = ["FWD", "MID", "DEF", "GK"];

interface MockPlayer extends RankingRow {
  readonly preferredFoot: string | null;
  readonly heightCm: number | null;
}

/** Rounds 1-7 then 8-15; some players break through in the second half. */
const SPLIT = { firstTo: 7, lastRound: 15, firstMatches: 7, secondMatches: 8 };
const FIRST_HALF_SHARE = [0.12, 0.3, 0.45, 0.5, 0.55];

function firstHalfMinutes(index: number, minutes: number): number {
  return Math.round(minutes * FIRST_HALF_SHARE[index % FIRST_HALF_SHARE.length]!);
}

const players: MockPlayer[] = Array.from({ length: 30 }, (_, index) => {
  const n = index + 1;
  const score = Math.round(92 - index * 1.9);
  const minutes = 1350 - index * 21;
  return {
    id: uuid("7e300000", n),
    slug: `joueur-exemple-${n}`,
    name: `Joueur exemple ${n}`,
    fullName: `Joueur exemple ${n}`,
    positionGroup: POSITIONS[index % 4]!,
    detailedPosition: null,
    age: 18 + (index % 5),
    team: teams[index % teams.length]!,
    score,
    rank: n,
    rankInPosition: Math.floor(index / 4) + 1,
    photo: null,
    minutes,
    apps: 15,
    starts: 15 - (index % 4),
    goals: index % 4 === 0 ? 9 - Math.floor(index / 4) : index % 3,
    assists: (index * 7) % 6,
    ratingAvg: Math.round((7.6 - index * 0.03) * 100) / 100,
    formAvg: Math.round((7.4 - index * 0.02) * 100) / 100,
    ga90: Math.round(((9 - index * 0.2) / (minutes / 90)) * 100) / 100,
    secondHalfMinutes: minutes - firstHalfMinutes(index, minutes),
    flags: [],
    movement: null,
    preferredFoot: index % 3 === 0 ? null : index % 2 === 0 ? "right" : "left",
    heightCm: index % 4 === 0 ? null : 170 + (index % 15),
  };
});

function card(player: MockPlayer): PepitesPlayerCard {
  return {
    id: player.id,
    slug: player.slug,
    name: player.name,
    fullName: player.fullName,
    positionGroup: player.positionGroup,
    detailedPosition: player.detailedPosition,
    age: player.age,
    team: player.team,
    score: player.score,
    rank: player.rank,
    rankInPosition: player.rankInPosition,
    photo: null,
  };
}

const REASONS: Array<[string, string]> = [
  ["Deux buts et une passe décisive en trois matchs.", "هدفان وتمريرة حاسمة في ثلاث مباريات."],
  ["Titulaire à chaque match, très régulier.", "أساسي في كل مباراة، ثابت جدًا."],
  ["", ""],
];

function edition(
  id: string,
  week: number,
  previous: string | null,
  order: number[],
): PepitesEdition {
  const previousOrder = previous === EDITION_14 ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : null;
  const entries: EditionEntry[] = order.map((playerNumber, index) => {
    const player = players[playerNumber - 1]!;
    const previousRank = previousOrder ? previousOrder.indexOf(playerNumber) + 1 : 0;
    const [reasonFr, reasonAr] = REASONS[index % REASONS.length]!;
    return {
      rank: index + 1,
      computedRank: player.rank!,
      score: player.score!,
      reasonFr: reasonFr || null,
      reasonAr: reasonAr || null,
      movement: !previousOrder
        ? null
        : previousRank === 0
          ? { kind: "new" }
          : previousRank > index + 1
            ? { kind: "up", by: previousRank - index - 1 }
            : previousRank < index + 1
              ? { kind: "down", by: index + 1 - previousRank }
              : { kind: "same" },
      player: card(player),
    };
  });
  return {
    id,
    seasonId: SEASON_ID,
    seasonLabel: "2026/2027",
    week,
    round: week - 10,
    status: "published",
    publishedAt: `2026-10-${String(week - 9).padStart(2, "0")}T19:00:00Z`,
    withdrawnAt: null,
    withdrawnReason: null,
    correctsEditionId: null,
    correctedBy: null,
    correctedByWeek: null,
    previousEditionId: previous,
    methodology: "v1",
    entries,
  };
}

const editions: Record<string, PepitesEdition> = {
  [EDITION_14]: edition(EDITION_14, 14, null, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
  [EDITION_15]: edition(EDITION_15, 15, EDITION_14, [2, 1, 3, 5, 4, 6, 7, 11, 9, 8]),
  [EDITION_16]: edition(EDITION_16, 16, EDITION_15, [1, 2, 4, 3, 5, 6, 12, 7, 11, 9]),
};

interface MockControl {
  state?: "current" | "countdown" | "delayed";
  nextRevealAt?: string | null;
  /** Once true, week 16 is published and becomes the version. */
  publishNext?: boolean;
  /** Pépites switched off. */
  closed?: boolean;
  /** The version read fails, as during an outage. */
  offline?: boolean;
}

function control(): MockControl {
  if (import.meta.env?.PROD) return {};
  const value = (globalThis as { __pepitesMock?: MockControl }).__pepitesMock;
  return value && typeof value === "object" ? value : {};
}

function currentEditionId(): string {
  return control().publishNext ? EDITION_16 : EDITION_15;
}

function resolve(version: string | null): PepitesEdition | null {
  if (!version || version === "current") return editions[currentEditionId()]!;
  const found = editions[version];
  if (!found || (found.id === EDITION_16 && !control().publishNext)) return null;
  return found;
}

/** Follows, per account (the sample data keeps them for the page's life). */
const follows = new Map<string, Set<string>>();

function followers(player: MockPlayer): number {
  const base = ((player.rank ?? 1) * 437) % 1500;
  let count = base;
  for (const set of follows.values()) if (set.has(player.id)) count += 1;
  return count;
}

let weeklyEmail: WeeklyEmailDto = {
  enabled: false,
  changedAt: null,
  emailReachable: true,
  blockers: [],
};

function open<T extends object>(value: T): T & { available: true; preview: false } {
  return { available: true, preview: false, ...value };
}

export class MockPepitesRepository implements PepitesRepository {
  async version(_context: RepositoryContext): Promise<VersionResponse> {
    const settings = control();
    if (settings.offline) throw new Error("pepites_mock_offline");
    if (settings.closed) return { available: false };
    const current = editions[currentEditionId()]!;
    return open({
      version: current.id,
      source: "edition" as const,
      editionId: current.id,
      runId: null,
      seasonId: SEASON_ID,
      week: current.week,
      state: settings.publishNext ? "current" : (settings.state ?? "current"),
      nextRevealAt: settings.publishNext ? null : (settings.nextRevealAt ?? null),
    });
  }

  async home(version: string | null, _context: RepositoryContext): Promise<HomeResponse> {
    if (control().closed) return { available: false };
    const found = resolve(version);
    if (!found) return open({ found: false });
    return open({ found: true, version: found.id, source: "edition" as const, edition: found });
  }

  async ranking(query: RankingQuery, context: RepositoryContext): Promise<RankingResponse> {
    if (control().closed) return { available: false };
    const current = resolve(query.version);
    if (!current) return open({ found: false });
    const key: Record<RankingQuery["sort"], (row: MockPlayer) => number> = {
      score: (row) => row.rank ?? 999,
      minutes: (row) => -row.minutes,
      goals: (row) => -row.goals,
      assists: (row) => -row.assists,
      rating: (row) => -(row.ratingAvg ?? -1),
      form: (row) => -(row.formAvg ?? -1),
      ga90: (row) => -(row.ga90 ?? -1),
    };
    const mine = context.actorId ? (follows.get(context.actorId) ?? new Set()) : new Set();
    const rows = players
      .filter((row) => !query.position || row.positionGroup === query.position)
      .filter((row) => query.maxAge === null || (row.age ?? 99) <= query.maxAge)
      .filter((row) => !query.teamId || row.team?.id === query.teamId)
      .filter((row) => !query.minMinutes || row.minutes >= query.minMinutes)
      .filter((row) => !query.followed || mine.has(row.id))
      .sort((a, b) => key[query.sort](a) - key[query.sort](b) || (a.rank ?? 0) - (b.rank ?? 0));
    return open({
      found: true,
      version: current.id,
      source: "edition" as const,
      total: rows.length,
      rows: rows
        .slice(query.offset, query.offset + query.limit)
        .map(({ preferredFoot: _foot, heightCm: _height, ...row }) => row),
      ...(query.offset === 0
        ? {
            teams: [...teams].sort((a, b) => a.name.fr.localeCompare(b.name.fr, "fr")),
          }
        : {}),
    });
  }

  async player(
    version: string | null,
    playerId: string,
    _context: RepositoryContext,
  ): Promise<PlayerResponse> {
    if (control().closed) return { available: false };
    const current = resolve(version);
    const player = players.find((row) => row.id === playerId);
    if (!current || !player) return open({ found: false });
    const missing = [
      ...(player.preferredFoot ? [] : ["preferred_foot"]),
      ...(player.heightCm ? [] : ["height_cm"]),
      "nationality",
      "detailed_position",
    ];
    return open({
      found: true,
      version: current.id,
      source: "edition" as const,
      player: {
        ...card(player),
        preferredFoot: player.preferredFoot,
        heightCm: player.heightCm,
        nationality: null,
        missing,
      },
      score: {
        eligible: true,
        score: player.score,
        rank: player.rank,
        rankInPosition: player.rankInPosition ?? null,
        apps: player.apps,
        starts: player.starts,
        minutes: player.minutes,
        goals: player.goals,
        assists: player.assists,
        saves: player.positionGroup === "GK" ? 31 : null,
        cleanSheets: player.positionGroup === "GK" || player.positionGroup === "DEF" ? 5 : null,
        ratingAvg: player.ratingAvg,
        ratingCount: player.apps,
        formAvg: player.formAvg,
        per90: { goalsAssists: player.ga90, cleanSheets: null, saves: null },
        percentiles: {
          rating: Math.max(5, 97 - (player.rank ?? 1) * 2.5),
          form: Math.max(5, 90 - (player.rank ?? 1) * 2),
          contribution: Math.max(5, 88 - (player.rank ?? 1) * 1.5),
          progression: Math.max(5, 70 - (player.rank ?? 1)),
          minutes: Math.max(5, 95 - (player.rank ?? 1) * 1.2),
        },
        components: { weightSum: 1 },
        flags: [],
      },
      editions: Object.values(editions)
        .filter((item) => item.id !== EDITION_16 || control().publishNext)
        .flatMap((item) =>
          item.entries
            .filter((entry) => entry.player.id === player.id)
            .map((entry) => ({
              editionId: item.id,
              week: item.week,
              rank: entry.rank,
              status: item.status,
            })),
        )
        .sort((a, b) => b.week - a.week),
    });
  }

  async playerMatches(
    playerId: string,
    limit: number,
    _context: RepositoryContext,
  ): Promise<PlayerMatchesResponse> {
    if (control().closed) return { available: false };
    const player = players.find((row) => row.id === playerId);
    if (!player) return open({ found: false });
    const opponents = teams.filter((team) => team.id !== player.team?.id);
    return open({
      found: true,
      matches: Array.from({ length: Math.min(limit, 6) }, (_, index) => ({
        fixtureId: uuid("7e400000", index + 1),
        kickoffAt: new Date(Date.UTC(2026, 9, 11 - index * 7, 19)).toISOString(),
        home: index % 2 === 0,
        opponent: opponents[index % opponents.length]!,
        teamScore: (index + 2) % 3,
        opponentScore: index % 2,
        minutes: 90 - (index % 3) * 10,
        started: true,
        goals: index === 1 ? 1 : 0,
        assists: index === 3 ? 1 : 0,
        yellowCards: index === 4 ? 1 : 0,
        redCards: 0,
        rating: Math.round((7.8 - index * 0.2) * 10) / 10,
      })),
    });
  }

  async playerStats(
    version: string | null,
    playerId: string,
    _context: RepositoryContext,
  ): Promise<PlayerStatsResponse> {
    if (control().closed) return { available: false };
    const current = resolve(version);
    const index = players.findIndex((row) => row.id === playerId);
    const player = players[index];
    if (!current || !player) return open({ found: false });
    const first = firstHalfMinutes(index, player.minutes);
    const keeper = player.positionGroup === "GK";
    const back = keeper || player.positionGroup === "DEF";
    return open({
      found: true,
      version: current.id,
      source: "edition" as const,
      stats: {
        apps: player.apps,
        starts: player.starts,
        minutes: player.minutes,
        goals: player.goals,
        assists: player.assists,
        saves: keeper ? 31 : null,
        cleanSheets: back ? 5 : 0,
        goalsConceded: back ? 12 : 0,
        penaltiesSaved: keeper ? 1 : null,
        penaltiesMissed: index % 7 === 0 ? 1 : 0,
        yellowCards: index % 4,
        redCards: index % 9 === 4 ? 1 : 0,
        ownGoals: 0,
      },
      split: { ...SPLIT, firstMinutes: first, secondMinutes: player.minutes - first },
      fantasyPlayerId: index % 3 === 2 ? null : uuid("7e600000", index + 1),
    });
  }

  async followState(playerId: string, context: RepositoryContext): Promise<FollowState> {
    if (control().closed) return { available: false };
    const player = players.find((row) => row.id === playerId);
    if (!player) return open({ found: false });
    return open({
      found: true,
      followers: followers(player),
      following: context.actorId ? (follows.get(context.actorId)?.has(playerId) ?? false) : null,
    });
  }

  async setFollow(
    playerId: string,
    follow: boolean,
    context: RepositoryContext,
  ): Promise<FollowState> {
    if (!context.actorId) throw new PepitesError("unauthenticated", "Sign in to continue.");
    if (control().closed) throw new PepitesError("unavailable", "PEPITES_UNAVAILABLE");
    const player = players.find((row) => row.id === playerId);
    if (!player) throw new PepitesError("not_found", "No such player in Pépites.");
    const mine = follows.get(context.actorId) ?? new Set<string>();
    if (follow) mine.add(playerId);
    else mine.delete(playerId);
    follows.set(context.actorId, mine);
    return this.followState(playerId, context);
  }

  async edition(
    _seasonId: string | null,
    week: number,
    _context: RepositoryContext,
  ): Promise<EditionResponse> {
    if (control().closed) return { available: false };
    const found = Object.values(editions).find(
      (item) => item.week === week && (item.id !== EDITION_16 || control().publishNext),
    );
    return found ? open({ found: true, edition: found }) : open({ found: false });
  }

  async methodology(_context: RepositoryContext): Promise<MethodologyResponse> {
    if (control().closed) return { available: false };
    return open({
      methodology: {
        version: "v1",
        params: {
          age_limit: 23,
          weights: { rating: 0.3, form: 0.2, contribution: 0.2, progression: 0.15, minutes: 0.15 },
          minutes_floor: { absolute: 180, share: 0.3 },
          min_rated_appearances: 3,
          form_window: 6,
          first_edition_round: 3,
        },
        descriptionFr:
          "Classement des joueurs de Botola Pro de moins de 23 ans : note, forme, contribution, progression et temps de jeu, comparés en percentiles.",
        descriptionAr:
          "ترتيب لاعبي البطولة الاحترافية دون 23 سنة: التنقيط، الجاهزية، المساهمة، التطور ودقائق اللعب، مقارنة بالنسب المئوية.",
      },
      coverage: {
        runId: uuid("7e500000", 1),
        source: "edition",
        asOfRound: 5,
        poolSize: 142,
        noDateOfBirth: 6,
        eligible: 61,
        ranked: 58,
        ratingCoverage: 0.94,
        footCoverage: 0.71,
        heightCoverage: 0.63,
      },
    });
  }

  async myWeeklyEmail(context: RepositoryContext): Promise<WeeklyEmailDto> {
    if (!context.actorId) throw new PepitesError("unauthenticated", "Sign in to continue.");
    return weeklyEmail;
  }

  async setMyWeeklyEmail(enabled: boolean, context: RepositoryContext): Promise<WeeklyEmailDto> {
    if (!context.actorId) throw new PepitesError("unauthenticated", "Sign in to continue.");
    weeklyEmail = { ...weeklyEmail, enabled, changedAt: new Date().toISOString() };
    return weeklyEmail;
  }

  async reportDataIssue(
    _playerId: string,
    _field: ReportableField,
    _message: string,
    context: RepositoryContext,
  ): Promise<void> {
    if (!context.actorId) throw new PepitesError("unauthenticated", "Sign in to continue.");
  }
}

export const MOCK_PEPITES_IDS = {
  SEASON_ID,
  PREVIOUS_SEASON_ID,
  EDITION_14,
  EDITION_15,
  EDITION_16,
};
