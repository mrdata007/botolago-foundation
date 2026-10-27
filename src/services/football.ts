import type { Club, Match, MatchOffStatus, MatchStatus, TableRow } from "@/types/domain";
import type { RepositoryContext } from "@/backend/contracts/repository";
import type {
  CompetitionSummaryDto,
  FootballLanguage,
  FootballRepository,
  MatchAbsenceDto,
  MatchCardDto,
  MatchLineupDto,
  MatchPageCursor,
  MatchPressurePointDto,
  SeasonSummaryDto,
  SquadMemberDto,
  StandingRowDto,
  TeamSummaryDto,
} from "@/backend/football/contracts";
import { FootballError } from "@/backend/football/errors";
import { MockFootballRepository } from "@/backend/football/mock-repository";
import { SupabaseFootballRepository } from "@/backend/football/supabase-repository";
import { clubShortCode } from "@/lib/club-identity";
import { seasonsWithResults, type SquadPlayer } from "@/lib/club-season";
import {
  computeLeagueTable,
  roundsPlayed,
  type LeagueTableRow,
  type TableResult,
} from "@/lib/league-table";
import { clubSlug } from "@/lib/club-slug";
import { resolveMediaUrl } from "@/lib/media";
import { matchDayKey } from "@/lib/match-kickoff";
import {
  findRivalryClubs,
  splitMeetings,
  type Rivalry,
  type RivalryMeetings,
} from "@/lib/rivalries";
import { presentMatchLiveDetail, type MatchLiveDetail } from "@/services/match-live";

export type FootballDataMode = "mock" | "supabase";

export function selectFootballDataMode(
  configuredMode: string | undefined,
  production: boolean,
): FootballDataMode {
  if (production && configuredMode !== "supabase") {
    throw new FootballError(
      "data_unavailable",
      "Production Football requires VITE_FOOTBALL_DATA_MODE=supabase.",
    );
  }
  if (configuredMode === "mock" || configuredMode === "supabase") return configuredMode;
  return "mock";
}

const mockRepository = new MockFootballRepository();
const supabaseRepository = new SupabaseFootballRepository();

export function getFootballRepository(): FootballRepository {
  const mode = selectFootballDataMode(
    import.meta.env.VITE_FOOTBALL_DATA_MODE,
    import.meta.env.PROD,
  );
  return mode === "supabase" ? supabaseRepository : mockRepository;
}

/**
 * `signal` is the query's own (React Query hands one to every `queryFn`):
 * passed on, a cancelled query -- a server render past its budget
 * (`@/lib/ssr-prefetch`), a page left before it loaded -- ends its requests
 * instead of letting them run on.
 */
function requestContext(signal?: AbortSignal): RepositoryContext {
  return {
    actorId: null,
    requestId: globalThis.crypto?.randomUUID?.() ?? `football-${Date.now().toString(36)}`,
    ...(signal ? { signal } : {}),
  };
}

function presentationStatus(status: MatchCardDto["status"]): MatchStatus {
  if (
    ["live_first_half", "half_time", "live_second_half", "extra_time", "penalties"].includes(status)
  )
    return "live";
  if (status === "finished") return "finished";
  if (offStatusOf(status) !== undefined) return "postponed";
  // `scheduled`, `not_started` and `delayed` -- and, for a status this build
  // does not know, the one reading that claims nothing: a fixture still to
  // come, with no score. Never `finished`, which would invite a made-up result.
  return "scheduled";
}

/** The provider statuses that share the domain `postponed`, each by its own word. */
const OFF_STATUSES: readonly MatchOffStatus[] = [
  "postponed",
  "suspended",
  "cancelled",
  "abandoned",
];

export function offStatusOf(status: string): MatchOffStatus | undefined {
  return OFF_STATUSES.find((off) => off === status);
}

/**
 * The fixtures that are in play by the product's own reading of the status.
 * The repository's live query also returns `delayed` and `suspended`
 * fixtures, which every other screen presents as scheduled and postponed;
 * in the live strip they would carry its live dot and a 0–0 from null scores.
 */
export function inPlayFixtures<T extends Pick<MatchCardDto, "status">>(
  fixtures: readonly T[],
): T[] {
  return fixtures.filter((fixture) => presentationStatus(fixture.status) === "live");
}

/**
 * The provider statuses in which the fixture no longer has a date.
 *
 * Narrower than the four that collapse into the domain `postponed` above: a
 * suspended or abandoned match kicked off at the stored instant and keeps
 * that date -- it is history, not a plan -- so only these two lose it.
 */
const DATE_UNCONFIRMED_STATUSES: readonly MatchCardDto["status"][] = ["postponed", "cancelled"];

/**
 * The provider statuses in which the fixture will not be played as scheduled
 * at all. A postponed or suspended match is still to come; these are not.
 */
const CALLED_OFF_STATUSES: readonly MatchCardDto["status"][] = ["cancelled", "abandoned"];

export function presentFootballClub(team: TeamSummaryDto, supabaseUrl?: string | null): Club {
  // BG-0111 — `team.code` is blank (not null) for 13 of the 21 active clubs on
  // production, and `??` does not fall back on `""`. That shipped an empty
  // crest placeholder for most of the league: blank initials in `ClubCrest`
  // and a bare "(D)" on the pitch fixture plate. `clubShortCode` treats a
  // whitespace-only code as absent and derives the letters from `short_name`,
  // which is populated for all 21.
  const placeholder = clubShortCode(team.code, team.shortName);
  // The API has already translated `name` and `shortName` into the language
  // asked for, so both halves below hold that one language: `.fr` is Arabic
  // in an Arabic response. Display only — anything that orders or keys clubs
  // uses `id` or `slug` (see `buildStandings`).
  return {
    id: team.id,
    slug: team.slug,
    pathSlug: clubSlug({ shortName: { fr: team.shortName }, name: { fr: team.name } }),
    name: { fr: team.name, ar: team.name },
    shortName: { fr: team.shortName, ar: team.shortName },
    city: { fr: team.city ?? "", ar: team.city ?? "" },
    // Every one of the 21 production clubs has a null `primary_color`
    // (BG-0112), so this fallback is what the whole league renders as today.
    // It was a hardcoded navy: a literal colour, light-only, one shade away
    // from the token that means exactly this. `--ui-ink` is the brand FILL,
    // which is the job here — a crest plate is a fill, and the monogram on it
    // is `--ui-on-ink-plain`.
    primaryColor: team.primaryColor ?? "var(--ui-ink)",
    secondaryColor: team.secondaryColor ?? undefined,
    crestPlaceholder: placeholder,
    crestUrl: resolveMediaUrl(
      { sourceUrl: team.crestUrl, storagePath: team.crestPath },
      supabaseUrl,
    ),
  };
}

export function toMatch(match: MatchCardDto): Match {
  const venueName = match.venue?.name ?? "";
  const offStatus = offStatusOf(match.status);
  return {
    id: match.id,
    gameweek: match.roundNumber ?? 0,
    homeClubId: match.homeTeam.id,
    awayClubId: match.awayTeam.id,
    kickoff: match.kickoffAt,
    status: presentationStatus(match.status),
    minute: match.minute ?? undefined,
    period: match.period,
    addedTime: match.addedTime ?? undefined,
    homeScore: match.homeScore ?? undefined,
    awayScore: match.awayScore ?? undefined,
    halfTimeHomeScore: match.halfTimeHomeScore ?? undefined,
    halfTimeAwayScore: match.halfTimeAwayScore ?? undefined,
    venue: { fr: venueName, ar: venueName },
    dateUnconfirmed: DATE_UNCONFIRMED_STATUSES.includes(match.status),
    calledOff: CALLED_OFF_STATUSES.includes(match.status),
    ...(offStatus ? { offStatus } : {}),
    dataUpdatedAt: latestDataTime(match),
  };
}

/**
 * When the fixture's data last changed (`Match.dataUpdatedAt`): the later of
 * the provider's change time and our row's last write. Both are stored
 * timestamps, neither is the time of this read. An unreadable one is ignored;
 * none readable gives `undefined`, never a guess.
 */
function latestDataTime(
  match: Pick<MatchCardDto, "providerUpdatedAt" | "updatedAt">,
): string | undefined {
  let latest: number | null = null;
  for (const value of [match.providerUpdatedAt, match.updatedAt]) {
    const time = Date.parse(value);
    if (Number.isFinite(time) && (latest === null || time > latest)) latest = time;
  }
  return latest === null ? undefined : new Date(latest).toISOString();
}

function toTableRow(row: StandingRowDto): TableRow {
  return {
    position: row.rank,
    clubId: row.team.id,
    played: row.played,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    goalDifference: row.goalDifference,
    points: row.points,
    form:
      row.form
        ?.split("")
        .filter((item): item is "W" | "D" | "L" => ["W", "D", "L"].includes(item)) ?? [],
  };
}

/** The optional sections of the match page, each read on its own. */
export const MATCH_SECTIONS = [
  "headToHead",
  "timeline",
  "statistics",
  "lineups",
  "pressure",
  "absences",
] as const;
export type MatchSectionKey = (typeof MATCH_SECTIONS)[number];

/**
 * How one section's read went. `error` is a short code (a `FootballError` code,
 * else "unknown"), never the message of the failure: the page is rendered to
 * the browser and must not carry internals.
 */
export type MatchSectionOutcome =
  | {
      readonly status: "ok";
      readonly error: null;
      /**
       * How many refreshes in a row reused the earlier copy of this section
       * because their own read failed (absent when the copy is fresh).
       */
      readonly carried?: number;
    }
  | { readonly status: "failed"; readonly error: string };

/**
 * How many refreshes in a row may reuse an earlier copy of a section whose read
 * keeps failing. At the page's 30-second refresh that is about a minute and a
 * half: one hiccup is hidden, a lasting outage ends in the error card instead
 * of a copy that looks fresh.
 */
export const MAX_CARRIED_REFRESHES = 3;
export type MatchSections = Readonly<Record<MatchSectionKey, MatchSectionOutcome>>;

/**
 * A settled section read: its list and how it went. A failed read gives an
 * empty list only because nothing was read; `outcome` is what says so.
 */
function settledSection<T>(result: PromiseSettledResult<readonly T[]>): {
  data: readonly T[];
  outcome: MatchSectionOutcome;
} {
  if (result.status === "fulfilled") {
    return { data: result.value, outcome: { status: "ok", error: null } };
  }
  const code = (result.reason as { code?: unknown } | null)?.code;
  return {
    data: [],
    outcome: { status: "failed", error: typeof code === "string" && code ? code : "unknown" },
  };
}

/** What `footballService.getMatchDetailPage` answers. */
export type FootballMatchDetailPage = Awaited<
  ReturnType<typeof footballService.getMatchDetailPage>
>;

/**
 * A refresh of the match page in which a section failed keeps the copy of that
 * section the page already held, if it held a good one: the page is refetched
 * every 30 seconds through a live match, and one hiccup of the pressure read
 * must not replace good lineups or a good timeline with an error card (before
 * sections were separate, a failed refresh rejected and the page kept all of
 * its last read). The error card is for a section with no earlier good copy.
 * The restored section reports `ok` (the copy it holds was a good read) and
 * counts how many refreshes in a row it has been reused, up to
 * `MAX_CARRIED_REFRESHES`: past that the failure shows, so an outage that lasts
 * is never hidden behind an old copy.
 *
 * `previous` must be the page of the same match and language (the query key's
 * own). The header, the one thing that is always read, is never carried over.
 */
export function keepLastGoodSections(
  next: FootballMatchDetailPage,
  previous: FootballMatchDetailPage | undefined,
): FootballMatchDetailPage {
  if (!previous || previous.match.id !== next.match.id) return next;
  const restore = (section: MatchSectionKey) => {
    const earlier = previous.sections[section];
    return (
      next.sections[section].status === "failed" &&
      earlier.status === "ok" &&
      (earlier.carried ?? 0) < MAX_CARRIED_REFRESHES
    );
  };
  if (!MATCH_SECTIONS.some(restore)) return next;

  const headToHead = restore("headToHead") ? previous.headToHead : next.headToHead;
  const outcome = (section: MatchSectionKey): MatchSectionOutcome => {
    if (!restore(section)) return next.sections[section];
    const earlier = previous.sections[section];
    return {
      status: "ok",
      error: null,
      carried: (earlier.status === "ok" ? (earlier.carried ?? 0) : 0) + 1,
    };
  };
  return {
    ...next,
    headToHead,
    // The meetings are part of "the matches on the page"; the clubs come from
    // the header and the meetings of those same two clubs, so they stay.
    matches: restore("headToHead") ? [next.match, ...previous.headToHead] : next.matches,
    live: {
      ...next.live,
      events: restore("timeline") ? previous.live.events : next.live.events,
      stats: restore("statistics") ? previous.live.stats : next.live.stats,
    },
    lineups: restore("lineups") ? previous.lineups : next.lineups,
    pressure: restore("pressure") ? previous.pressure : next.pressure,
    absences: restore("absences") ? previous.absences : next.absences,
    sections: {
      headToHead: outcome("headToHead"),
      timeline: outcome("timeline"),
      statistics: outcome("statistics"),
      lineups: outcome("lineups"),
      pressure: outcome("pressure"),
      absences: outcome("absences"),
    },
  };
}

export interface FootballSeason {
  readonly id: string;
  /** The competition the season belongs to (Botola Pro): its fixtures are listed by it. */
  readonly competitionId: string;
  readonly label: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly status: SeasonSummaryDto["status"];
  readonly isCurrent: boolean;
  readonly firstMatchDate: string | null;
  readonly lastMatchDate: string | null;
  readonly competitionName: string;
}

function toSeason(season: SeasonSummaryDto): FootballSeason {
  return {
    id: season.id,
    competitionId: season.competition.id,
    label: season.label,
    startsOn: season.startsOn,
    endsOn: season.endsOn,
    status: season.status,
    isCurrent: season.isCurrent,
    firstMatchDate: season.firstMatchDate,
    lastMatchDate: season.lastMatchDate,
    competitionName: season.competition.name,
  };
}

/** The season a club page opens on: the current one, else the latest listed. */
export function defaultSeason(seasons: readonly FootballSeason[]): FootballSeason | undefined {
  return seasons.find((season) => season.isCurrent) ?? seasons[0];
}

/**
 * A match's season as the match names it (`getMatchDetailPage`): what its
 * table is read by (`getStandings`), and the kind of competition it counts
 * in, which says whether it has a table at all (`hasLeagueTable`).
 *
 * Not the season's status, which says whether a table worked out from the
 * results is provisional or unofficial (`StandingsNotes`): the fixture DTO
 * (`api.football_match_detail`, `matchCardSchema`) names its season by id and
 * label only. The match page reads the status from the season list.
 */
export interface MatchSeason extends Pick<FootballSeason, "id" | "competitionId"> {
  readonly competitionType: CompetitionSummaryDto["type"];
}

/**
 * Only a league's season has a table. A cup, super cup, international or
 * friendly fixture's season has results too, and `buildStandings` would work
 * them into a points table no such competition keeps — merging its groups
 * and rounds into one ranking — which the page would then call provisional.
 */
export function hasLeagueTable(season: Pick<MatchSeason, "competitionType">): boolean {
  return season.competitionType === "league";
}

export function presentSquadMember(member: SquadMemberDto): SquadPlayer {
  return {
    id: member.playerId,
    name: member.displayName,
    position: member.position,
    shirtNumber: member.shirtNumber,
    role: member.squadRole,
  };
}

/** Clubs by name, in the reader's language's collation. */
function byClubName(language: FootballLanguage) {
  const collator = new Intl.Collator(language === "ar" ? "ar-MA" : "fr-FR");
  return (a: Club, b: Club) => collator.compare(a.name[language], b.name[language]);
}

/**
 * How many pages of a club's fixtures (100 a page) a season may take to
 * reach. A season is 30 league matches; the cap only stops a runaway loop.
 */
const CLUB_FIXTURE_PAGES = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ClubDirectory {
  /**
   * The season the clubs were read from, or null when no season named any
   * club and the list is the whole team catalogue instead (which also holds
   * clubs that have since left the league).
   */
  readonly season: FootballSeason | null;
  readonly clubs: readonly Club[];
}

function uniqueClubs(
  matches: readonly MatchCardDto[],
  standings: readonly StandingRowDto[] = [],
): Club[] {
  const teams = new Map<string, TeamSummaryDto>();
  for (const match of matches) {
    teams.set(match.homeTeam.id, match.homeTeam);
    teams.set(match.awayTeam.id, match.awayTeam);
  }
  for (const row of standings) teams.set(row.team.id, row.team);
  return [...teams.values()].map((team) => presentFootballClub(team));
}

/**
 * The day key sent to the backend, which resolves it against
 * `Africa/Casablanca`. Reading the browser's calendar fields here asked for a
 * different day than the page then filtered on, for every viewer outside
 * UTC+1 (BG-0100).
 */
const dateKey = matchDayKey;

export interface FootballMatchCollection {
  readonly matches: readonly Match[];
  readonly clubs: readonly Club[];
  readonly standings: readonly TableRow[];
}

/** A finished fixture as the table reads it; `null` for one without a final score. */
function toTableResult(match: MatchCardDto): TableResult | null {
  if (match.status !== "finished" || match.homeScore === null || match.awayScore === null) {
    return null;
  }
  return {
    homeClubId: match.homeTeam.id,
    awayClubId: match.awayTeam.id,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    kickoff: match.kickoffAt,
  };
}

/** A stored row, with the form worked out from the results when the provider sent none. */
function storedTableRow(row: StandingRowDto, computed: LeagueTableRow | undefined): LeagueTableRow {
  const base = toTableRow(row);
  return {
    ...base,
    form: base.form.length > 0 ? base.form : (computed?.form ?? []),
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
  };
}

const totalPlayed = (rows: readonly { readonly played: number }[]) =>
  rows.reduce((sum, row) => sum + row.played, 0);

/**
 * Whether the stored table has been overtaken by a result: for some club the
 * two tables cover the same matches yet count them differently, and a finished
 * fixture changed more recently than the table did.
 *
 * Equal played counts say the table covers as many matches, not that it counts
 * them the same way: a result corrected from 1–0 to 0–1 leaves every club's
 * played figure where it was and moves a win to a loss. Only the record the
 * results decide is compared -- wins, draws, losses and goals -- never points
 * or rank, which an official deduction or tie-break rule legitimately sets
 * apart from the results. A table that agrees on the record stays the
 * provider's, deductions included. A difference the table is newer than every
 * result (a coarse test: the table's clock is the provider's, the results' is
 * ours) stays too: it is the provider's later word. A club whose stored table
 * covers more matches than the results are skipped, as the coverage rule above
 * already treats that as the provider knowing more.
 */
function contradictedByNewerResults(
  stored: readonly StandingRowDto[],
  computed: readonly LeagueTableRow[],
  fixtures: readonly MatchCardDto[],
): boolean {
  const byClub = new Map(computed.map((row) => [row.clubId, row]));
  const differs = stored.some((row) => {
    const counted = byClub.get(row.team.id);
    return (
      counted !== undefined &&
      counted.played === row.played &&
      (counted.won !== row.won ||
        counted.drawn !== row.drawn ||
        counted.lost !== row.lost ||
        counted.goalsFor !== row.goalsFor ||
        counted.goalsAgainst !== row.goalsAgainst)
    );
  });
  if (!differs) return false;
  const tableTime = Math.max(...stored.map((row) => Date.parse(row.providerUpdatedAt)));
  const resultTime = Math.max(
    ...fixtures
      .filter((fixture) => toTableResult(fixture) !== null)
      .map((fixture) => Date.parse(latestDataTime(fixture) ?? "")),
  );
  // Unreadable times are NaN, which compares false: the stored table is then
  // not shown to be newer, and the results the page can verify are used.
  return !(tableTime > resultTime);
}

/** One season's league table, three ways, and the clubs to draw it with. */
export interface FootballStandings {
  readonly clubs: readonly Club[];
  /** Best first. Empty until the season has a result (or the provider a table). */
  readonly overall: readonly LeagueTableRow[];
  /** Home matches only, then away matches only: always worked out from the results. */
  readonly home: readonly LeagueTableRow[];
  readonly away: readonly LeagueTableRow[];
  /** The rounds `overall` reflects: matches played by its busiest club. */
  readonly rounds: number;
  /**
   * `overall` is worked out from the results, not the provider's table: it
   * carries each club's points deduction only if a stored table gave one
   * (`buildStandings`), and clubs level on every figure share a rank instead
   * of being separated by the league's rule. Say so with it —
   * provisional while the season is played, unofficial once it is over
   * (`StandingsNotes`) — and never call it final.
   */
  readonly computed: boolean;
}

/**
 * A season's table from its fixtures, worked out from the finished results
 * (see `league-table.ts`): nothing refreshes the stored table during a
 * season, the fixtures do.
 *
 * The stored table still wins when there is one covering at least as many
 * matches and not overtaken by a result (`contradictedByNewerResults`) — it
 * is the provider's, so a points deduction the results cannot know about is
 * in it. When a result has overtaken it, the table is worked out from the
 * results instead, but each club keeps the points the provider gave it beyond
 * its record (a deduction); the order of clubs level on points still comes
 * from the results, not the league's rule, so the table is labelled computed
 * (provisional, `StandingsNotes`). For both completed seasons the two agree row for row;
 * the stored rows only lack the form guide, which the results add. Home and
 * away are always the results'. Before the first result there is no table
 * at all, rather than sixteen rows of zeros.
 *
 * Every position is the same in French and Arabic: the stored rank is the
 * provider's, and the computed table lists level clubs by slug. It used to
 * list them by `shortName.fr`, which in an Arabic response is the Arabic name
 * (see `presentFootballClub`), so switching language moved tied clubs, and
 * their zone colours with them (audit A04).
 */
export function buildStandings(
  fixtures: readonly MatchCardDto[],
  stored: readonly StandingRowDto[],
): FootballStandings {
  const clubs = uniqueClubs(fixtures, stored);
  const clubIds = clubs.map((club) => club.id);
  const slugs = new Map(clubs.map((club) => [club.id, club.slug]));
  const slugOf = (clubId: string) => slugs.get(clubId) ?? clubId;
  const results = fixtures.flatMap((fixture) => {
    const result = toTableResult(fixture);
    return result ? [result] : [];
  });

  // What the provider's table gives each club beyond what its record earns --
  // an official deduction is negative. The results cannot show it, so it rides
  // along when the table is worked out from them.
  const adjustments = new Map(
    stored
      .map((row) => [row.team.id, row.points - (3 * row.won + row.drawn)] as const)
      .filter(([, delta]) => delta !== 0),
  );
  const computed = computeLeagueTable(clubIds, results, "overall", slugOf, adjustments);
  const useStored =
    stored.length > 0 &&
    totalPlayed(stored) >= totalPlayed(computed) &&
    !contradictedByNewerResults(stored, computed, fixtures);
  const overall = useStored
    ? [...stored]
        .sort((a, b) => a.rank - b.rank)
        .map((row) =>
          storedTableRow(
            row,
            computed.find((candidate) => candidate.clubId === row.team.id),
          ),
        )
    : results.length > 0
      ? computed
      : [];
  return {
    clubs,
    overall,
    home: results.length > 0 ? computeLeagueTable(clubIds, results, "home", slugOf) : [],
    away: results.length > 0 ? computeLeagueTable(clubIds, results, "away", slugOf) : [],
    rounds: roundsPlayed(overall),
    computed: !useStored,
  };
}

/**
 * How many fixtures Home's payload carries (live first, then by kick-off): the
 * gameweek band's carousel shows the whole round, which is 8 matches, and 10
 * is the most `api.football_home_matches` returns (BG-0155).
 */
export const HOME_MATCHES_LIMIT = 10;

/**
 * How many of those fixtures the lists that read the same payload show: Home's
 * "À venir" and the landing page's "En ce moment". It is the 3 the payload
 * itself carried before the carousel needed the round, so both lists keep
 * exactly the rows they had.
 */
export const HOME_LIST_SIZE = 3;

/**
 * How many upcoming fixtures complete Home's payload when live fixtures fill
 * it: enough for the rest of a round and the next (`api.football_upcoming_matches`
 * takes 1 to 50).
 */
export const HOME_UPCOMING_LIMIT = 20;

/**
 * Home's payload: live first, then by kick-off. `football_home_matches` puts
 * the live fixtures in the same ten rows, so with several live while the next
 * round is already scheduled the round loses its last cards (three live and a
 * round of eight return seven of the eight). When the payload is full and
 * holds a live fixture, its upcoming part is read again from the upcoming list,
 * which leaves the live ones out; postponed fixtures stay out, as in the home
 * read. The first rows, which the lists show, are the same either way.
 */
export function completeHomeMatches<T extends Pick<MatchCardDto, "id" | "status">>(
  home: readonly T[],
  upcoming: readonly T[] | null,
): T[] {
  if (!upcoming) return [...home];
  const live = inPlayFixtures(home);
  const seen = new Set(live.map((fixture) => fixture.id));
  return [
    ...live,
    ...upcoming.filter(
      (fixture) => !seen.has(fixture.id) && presentationStatus(fixture.status) !== "postponed",
    ),
  ];
}

export const footballService = {
  async getSeasons(language: FootballLanguage, signal?: AbortSignal): Promise<FootballSeason[]> {
    return (await getFootballRepository().getSeasons(language, 12, requestContext(signal))).map(
      toSeason,
    );
  },

  async getClubs(language: FootballLanguage, signal?: AbortSignal): Promise<Club[]> {
    return (await getFootballRepository().getTeams(language, 100, requestContext(signal))).map(
      (team) => presentFootballClub(team),
    );
  },

  async getHomeMatches(
    language: FootballLanguage,
    signal?: AbortSignal,
  ): Promise<FootballMatchCollection> {
    const repository = getFootballRepository();
    const home = await repository.getHomeMatches(
      language,
      HOME_MATCHES_LIMIT,
      requestContext(signal),
    );
    const full = home.length === HOME_MATCHES_LIMIT && inPlayFixtures(home).length > 0;
    const upcoming = full
      ? await repository.getUpcomingMatches(language, HOME_UPCOMING_LIMIT, requestContext(signal))
      : null;
    const matches = completeHomeMatches(home, upcoming);
    return { matches: matches.map(toMatch), clubs: uniqueClubs(matches), standings: [] };
  },

  /** Matches in play right now, for the live strip. */
  async getLiveMatches(language: FootballLanguage): Promise<FootballMatchCollection> {
    const repository = getFootballRepository();
    const matches = inPlayFixtures(await repository.getLiveMatches(language, 10, requestContext()));
    return { matches: matches.map(toMatch), clubs: uniqueClubs(matches), standings: [] };
  },

  async getMatchDay(
    date: Date,
    language: FootballLanguage,
    seasonId?: string,
    signal?: AbortSignal,
  ): Promise<FootballMatchCollection> {
    const repository = getFootballRepository();
    const page = await repository.getMatchesByDate(
      {
        date: dateKey(date),
        language,
        timezone: "Africa/Casablanca",
        seasonId,
        limit: 100,
      },
      requestContext(signal),
    );
    const matches = seasonId
      ? page.items.filter((match) => match.seasonId === seasonId)
      : page.items;
    // The table is `getStandings`' job now: it has a tab of its own.
    return { matches: matches.map(toMatch), clubs: uniqueClubs(matches), standings: [] };
  },

  /**
   * The days of a season on which a match has been played to the end, as
   * competition-day keys, oldest first. For the empty states that point a
   * reader at the latest results ("Derniers résultats : sam. 3 oct."): the
   * same fixture list the table is worked out from, kept to the day of each
   * finished match, so nothing but the days is held.
   */
  async getSeasonResultDays(
    season: Pick<FootballSeason, "id" | "competitionId">,
    language: FootballLanguage,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const fixtures = await getFootballRepository().getSeasonFixtures(
      season.competitionId,
      season.id,
      language,
      requestContext(signal),
    );
    const days = new Set<string>();
    for (const fixture of fixtures) {
      const match = toMatch(fixture);
      if (match.status === "finished" && !Number.isNaN(Date.parse(match.kickoff))) {
        days.add(matchDayKey(new Date(match.kickoff)));
      }
    }
    return [...days].sort();
  },

  /**
   * The season's table: its fixtures and any stored table, read together (see
   * `buildStandings`). Every surface that shows a rank reads it here, under
   * `["football", "standings", seasonId, language]`: the Classement tab, Home,
   * a club page and the match page's "Face à face" tab — for a league match
   * only (`hasLeagueTable`). It needs only the season's identity, which is
   * what a match carries (`getMatchDetailPage`).
   */
  async getStandings(
    season: Pick<FootballSeason, "id" | "competitionId">,
    language: FootballLanguage,
    signal?: AbortSignal,
  ): Promise<FootballStandings> {
    const repository = getFootballRepository();
    const [fixtures, stored] = await Promise.all([
      repository.getSeasonFixtures(
        season.competitionId,
        season.id,
        language,
        requestContext(signal),
      ),
      repository.getStandings(season.id, language, requestContext(signal)),
    ]);
    return buildStandings(fixtures, stored);
  },

  /**
   * Everything the match page shows except the table. The page refetches this
   * every 30 seconds through a live match (`matchRefetchInterval`), so it
   * carries what belongs to the match and names its season (`season`); the
   * "Face à face" tab reads that season's table through `getStandings`, as the
   * Classement tab does, when the season is a league's (`hasLeagueTable`). It
   * used to carry the provider's stored rows, read again on every refresh and
   * shown as they came: the one table in the product that `buildStandings`
   * did not make, which could order a tie, share a rank or colour a zone
   * differently from every other, and never said it was provisional.
   */
  async getMatchDetailPage(
    id: string,
    language: FootballLanguage,
  ): Promise<
    Omit<FootballMatchCollection, "standings"> & {
      match: Match;
      /**
       * The match's season: what its table is read by (`getStandings`), and
       * whether it has one (`hasLeagueTable`).
       */
      season: MatchSeason;
      headToHead: readonly Match[];
      live: MatchLiveDetail;
      /** Confirmed/provisional lineups, one entry per team. Empty when the
       * provider has not published lineups yet — never fabricated. */
      lineups: readonly MatchLineupDto[];
      /** The provider's pressure index, minute by minute; empty without it. */
      pressure: readonly MatchPressurePointDto[];
      /** Players the provider lists as injured or suspended for the match. */
      absences: readonly MatchAbsenceDto[];
      /**
       * Whether each optional section could be read. The match itself (score,
       * teams, kickoff) is the page and is always here, or the read fails; a
       * section whose read failed is `failed` and its list above is empty
       * because nothing was read, which is not the same as `ok` and empty (the
       * provider answered and had nothing). A page tells the two apart by
       * this, never by the list being empty.
       */
      sections: MatchSections;
    }
  > {
    const repository = getFootballRepository();
    // The header is the page: if it cannot be read there is nothing to show,
    // and the read fails as it always has (404 / 503 in the loader).
    const detail = await repository.getMatchDetail(id, language, requestContext());
    const match = toMatch(detail);
    // Everything else is optional, and independent of the rest: one section
    // failing must not take the score or the healthy sections with it
    // (audit 2026-10-14, DATA-02). Still six reads in one go, as before.
    const [h2hRead, timelineRead, statisticsRead, lineupsRead, pressureRead, absencesRead] =
      await Promise.allSettled([
        repository.getHeadToHead(id, language, 5, requestContext()),
        repository.getTimeline(id, language, requestContext()),
        repository.getStatistics(id, language, requestContext()),
        repository.getLineups(id, language, requestContext()),
        repository.getPressure(id, language, requestContext()),
        repository.getAbsences(id, language, requestContext()),
      ]);
    const headToHead = settledSection(h2hRead);
    const timeline = settledSection(timelineRead);
    const statistics = settledSection(statisticsRead);
    const lineups = settledSection(lineupsRead);
    const pressure = settledSection(pressureRead);
    const absences = settledSection(absencesRead);
    const allMatches = [detail, ...headToHead.data];
    return {
      match,
      season: {
        id: detail.seasonId,
        competitionId: detail.competition.id,
        competitionType: detail.competition.type,
      },
      headToHead: headToHead.data.map(toMatch),
      live: presentMatchLiveDetail(match, timeline.data, statistics.data),
      lineups: lineups.data,
      pressure: pressure.data,
      absences: absences.data,
      sections: {
        headToHead: headToHead.outcome,
        timeline: timeline.outcome,
        statistics: statistics.outcome,
        lineups: lineups.outcome,
        pressure: pressure.outcome,
        absences: absences.outcome,
      },
      matches: allMatches.map(toMatch),
      clubs: uniqueClubs(allMatches),
    };
  },

  /**
   * Every fixture of the current season and of the one before it in the same
   * competition, for the match sitemap: match pages are the site's largest
   * source of search impressions, and the server's HTML links to none of
   * them (the calendar loads its days in the browser), so the sitemap is how
   * a crawler finds them.
   */
  async getSitemapMatches(
    language: FootballLanguage,
    signal?: AbortSignal,
  ): Promise<{ id: string; kickoff: string }[]> {
    const seasons = await footballService.getSeasons(language, signal);
    const current = defaultSeason(seasons);
    if (!current) return [];
    const previous = seasons
      .filter(
        (season) =>
          season.competitionId === current.competitionId &&
          season.id !== current.id &&
          season.startsOn < current.startsOn,
      )
      .sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0];
    const repository = getFootballRepository();
    const lists = await Promise.all(
      [current, previous]
        .filter((season): season is FootballSeason => Boolean(season))
        .map((season) =>
          repository.getSeasonFixtures(
            season.competitionId,
            season.id,
            language,
            requestContext(signal),
          ),
        ),
    );
    return lists.flat().map((fixture) => ({ id: fixture.id, kickoff: fixture.kickoffAt }));
  },

  async getClub(id: string, language: FootballLanguage): Promise<Club> {
    return presentFootballClub(
      await getFootballRepository().getTeam(id, language, requestContext()),
    );
  },

  /**
   * The clubs of the current season (else the latest one), by name: the
   * teams in its table, and — before a table exists, as at the start of a
   * season — the teams in its first 100 fixtures, which cover every club by
   * the end of the first rounds. The full team catalogue is only the last
   * resort: it also lists clubs that have been relegated.
   */
  async getClubDirectory(language: FootballLanguage, signal?: AbortSignal): Promise<ClubDirectory> {
    const repository = getFootballRepository();
    const season = defaultSeason(await footballService.getSeasons(language, signal)) ?? null;
    if (season) {
      const [standings, page] = await Promise.all([
        repository.getStandings(season.id, language, requestContext(signal)),
        repository.getCompetitionFixtures(
          {
            competitionId: season.competitionId,
            seasonId: season.id,
            language,
            limit: 100,
          },
          requestContext(signal),
        ),
      ]);
      const clubs = uniqueClubs(page.items, standings);
      if (clubs.length > 0) return { season, clubs: clubs.sort(byClubName(language)) };
    }
    const catalogue = await footballService.getClubs(language, signal);
    return { season: null, clubs: catalogue.sort(byClubName(language)) };
  },

  /**
   * One club's matches in one season, oldest first, and every club they
   * name. The API pages a club's fixtures newest first across all seasons,
   * so this reads back until it has passed the season's first day.
   */
  async getClubSeasonMatches(
    clubId: string,
    season: Pick<FootballSeason, "id" | "startsOn"> | null,
    language: FootballLanguage,
  ): Promise<FootballMatchCollection> {
    const repository = getFootballRepository();
    const collected: MatchCardDto[] = [];
    let before: MatchPageCursor | null = null;
    for (let page = 0; page < CLUB_FIXTURE_PAGES; page += 1) {
      const items = await repository.getTeamFixtures(
        { teamId: clubId, language, before, limit: 100 },
        requestContext(),
      );
      collected.push(...items);
      const oldest = items.at(-1);
      if (!season || !oldest || items.length < 100) break;
      // A day of slack either side of midnight: the season's date is a
      // calendar day, the kickoff an instant.
      if (Date.parse(oldest.kickoffAt) < Date.parse(`${season.startsOn}T00:00:00Z`) - DAY_MS) break;
      before = { kickoffAt: oldest.kickoffAt, id: oldest.id };
    }
    const matches = (
      season ? collected.filter((match) => match.seasonId === season.id) : collected
    ).sort((a, b) => Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt));
    return { matches: matches.map(toMatch), clubs: uniqueClubs(matches), standings: [] };
  },

  /**
   * The seasons in which the club has at least one result, read back as far
   * as the club's fixture pages go: what "see last season" may offer.
   */
  async getClubSeasonsPlayed(clubId: string, language: FootballLanguage): Promise<string[]> {
    const repository = getFootballRepository();
    const collected: MatchCardDto[] = [];
    let before: MatchPageCursor | null = null;
    for (let page = 0; page < CLUB_FIXTURE_PAGES; page += 1) {
      const items = await repository.getTeamFixtures(
        { teamId: clubId, language, before, limit: 100 },
        requestContext(),
      );
      collected.push(...items);
      const oldest = items.at(-1);
      if (!oldest || items.length < 100) break;
      before = { kickoffAt: oldest.kickoffAt, id: oldest.id };
    }
    return seasonsWithResults(
      collected.map((item) => ({ seasonId: item.seasonId, match: toMatch(item) })),
      clubId,
    );
  },

  /**
   * A rivalry page (`@/lib/rivalries`): the two clubs, found among the
   * current season's, and their next and past meetings, read from the first
   * club's fixtures across every season the API pages back through. `null`
   * when either club is not in the directory.
   */
  async getRivalry(
    rivalry: Rivalry,
    language: FootballLanguage,
  ): Promise<({ clubs: readonly [Club, Club] } & RivalryMeetings) | null> {
    // The clubs are identified from the French names: an Arabic response has
    // translated them, and the match is on the names and the slug.
    const french = findRivalryClubs(rivalry, (await footballService.getClubDirectory("fr")).clubs);
    if (!french) return null;
    const [first, second] = french;
    let clubs: readonly [Club, Club] = french;
    if (language !== "fr") {
      const named = (await footballService.getClubDirectory(language)).clubs;
      const a = named.find((club) => club.id === first.id);
      const b = named.find((club) => club.id === second.id);
      if (a && b) clubs = [a, b];
    }
    const { matches } = await footballService.getClubSeasonMatches(first.id, null, language);
    return { clubs, ...splitMeetings(matches, first.id, second.id, Date.now()) };
  },

  /** `seasonId` null: the club's current squad; a season id: its squad that season. */
  async getClubSquad(
    clubId: string,
    seasonId: string | null,
    language: FootballLanguage,
  ): Promise<SquadPlayer[]> {
    const squad = await getFootballRepository().getTeamSquad(
      clubId,
      seasonId,
      language,
      requestContext(),
    );
    return squad.map(presentSquadMember);
  },
};
