import type { LeagueStanding } from "@/types/fantasy";
import type { TierCode } from "@/components/manager-card/types";

import type {
  CardClubDto,
  HistoryRowDto,
  ManagerCardStatus,
  MemberCardDto,
  MomentDto,
  MyCardDto,
  SeasonSummaryDto,
  StatNullReason,
} from "./contracts";

/**
 * Development fixtures for the Manager Card (plan section 7.7 and Appendix B). Every card here is
 * a labelled sample: the profile built from it carries `sample: true`, so the object prints
 * « Exemple » / «مثال». Names are fictional.
 *
 * A production build contains none of this: the only way in is the `import.meta.env.DEV` branch
 * of `src/services/manager-card.ts`, and `scripts/qa/manager-card-fixture-gate.ts` scans the
 * built output for the sentinel below and for the sample names. Do not import this module from
 * anywhere else (a source test checks it).
 *
 * The tier thresholds used to label the fixtures (HOMA below 70, STADE 70-83, PRO 84-87,
 * CHAMPION 88-91, LEGEND 92 and up) belong to the fixtures only. They are not a product rule: the
 * server decides the tiers.
 */
export const MANAGER_CARD_FIXTURE_SENTINEL = "mc-fixture-sentinel-6b1f";

export const FIXTURE_IDS = [
  "featureOff",
  "offline",
  "unavailable",
  "noCard",
  "born0",
  "born0Serial",
  "forming1",
  "eve2",
  "notFinal2",
  "insufficient3",
  "rated",
  "ratedTrfNull",
  "cleared",
  "tierUp",
  "legend",
  "tierDown",
  "founder",
  "seasonClosed",
  "seasonStarted",
  "launchArrival",
  "returning",
  "clubNull",
  "longNameLatin",
  "arabicName",
  "homa",
] as const;
export type FixtureId = (typeof FIXTURE_IDS)[number];
export const DEFAULT_FIXTURE_ID: FixtureId = "rated";

/** How a fixture's card reads behave: normally, failing on the network, or switched off mid-session. */
export type FixtureBehaviour = "normal" | "offline" | "unavailable";

export interface FixtureLeague {
  id: string;
  name: string;
  members: MemberCardDto[];
  /** In the league's own points order, which is deliberately not the order of the ratings. */
  standings: LeagueStanding[];
}

export interface ManagerCardFixture {
  id: FixtureId;
  /** One line for the people reading the list of fixtures. */
  label: string;
  status: ManagerCardStatus;
  behaviour: FixtureBehaviour;
  card: MyCardDto | null;
  league?: FixtureLeague;
  /** Every stored journée, newest first, across the card's seasons. */
  history: HistoryRowDto[];
}

/* ------------------------------------------------------------------------------------------ */
/* Building blocks                                                                             */
/* ------------------------------------------------------------------------------------------ */

const uid = (kind: number, n: number): string =>
  `3c0000${kind.toString(16).padStart(2, "0")}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

const SEASON = { id: uid(1, 1), label: "2026/27" } as const;
const NEXT_SEASON = { id: uid(1, 2), label: "2027/28" } as const;
const SERIAL = "482913";
const OWN_TEAM_ID = uid(2, 1);

const STATUS_ON: ManagerCardStatus = { enabled: true, minRated: 3, minConfirmed: 5 };
const STATUS_OFF: ManagerCardStatus = { enabled: false, minRated: null, minConfirmed: null };

const RAJA: CardClubDto = {
  id: uid(3, 1),
  slug: "raja-ca",
  code: "RCA",
  name: { fr: "Raja CA", ar: "الرجاء الرياضي" },
  shortName: { fr: "Raja", ar: "الرجاء" },
  city: { fr: "Casablanca", ar: "الدار البيضاء" },
  primaryColor: null,
  secondaryColor: null,
};
const WYDAD: CardClubDto = {
  id: uid(3, 2),
  slug: "wydad-ac",
  code: "WAC",
  name: { fr: "Wydad AC", ar: "الوداد الرياضي" },
  shortName: { fr: "Wydad", ar: "الوداد" },
  city: { fr: "Casablanca", ar: "الدار البيضاء" },
  primaryColor: null,
  secondaryColor: null,
};

const tierOf = (ovr: number | null): TierCode | null =>
  ovr === null
    ? null
    : ovr >= 92
      ? "legend"
      : ovr >= 88
        ? "champion"
        : ovr >= 84
          ? "pro"
          : ovr >= 70
            ? "stade"
            : "homa";
const NEXT: Record<TierCode, { code: TierCode; fromOvr: number } | null> = {
  homa: { code: "stade", fromOvr: 70 },
  stade: { code: "pro", fromOvr: 84 },
  pro: { code: "champion", fromOvr: 88 },
  champion: { code: "legend", fromOvr: 92 },
  legend: null,
};

const stat = (value: number | null, nullReason: StatNullReason | null = null) => ({
  value,
  nullReason,
});
const NO_STATS: MyCardDto["stats"] = {
  cap: stat(null, "pending_minimum"),
  sel: stat(null, "pending_minimum"),
  trf: stat(null, "pending_minimum"),
  con: stat(null, "pending_minimum"),
};
const stats = (cap: number, sel: number, trf: number | null, con: number): MyCardDto["stats"] => ({
  cap: stat(cap),
  sel: stat(sel),
  trf: trf === null ? stat(null, "no_transfers") : stat(trf),
  con: stat(con),
});
const FULL_STATS = stats(91, 82, 86, 78);

type CardParts = Partial<Omit<MyCardDto, "seasons" | "moments">> & {
  moments?: MomentDto[];
  previous?: SeasonSummaryDto[];
};

/** A card with the defaults of a manager whose squad was just saved; each fixture overrides what differs. */
function card(over: CardParts = {}): MyCardDto {
  const { previous = [], moments = [], ...rest } = over;
  const base: MyCardDto = {
    teamId: OWN_TEAM_ID,
    name: "Ali",
    handle: null,
    season: { ...SEASON },
    serial: SERIAL,
    founder: null,
    club: RAJA,
    ratingState: "forming",
    ovr: null,
    ovrNullReason: "pending_minimum",
    tier: null,
    bestTier: null,
    nextTier: null,
    provisional: false,
    stats: NO_STATS,
    gameweeksCounted: 0,
    minRated: 3,
    minConfirmed: 5,
    rulesVersion: "v1",
    throughGameweekSeq: null,
    calculatedAt: null,
    firstCountedGameweekSeq: null,
    firstRatedGameweekSeq: null,
    ratingGameweeks: [5, 6, 7],
    ratingGameweeksComplete: true,
    previousSeason: null,
    seasonClosed: false,
    seasons: [],
    createdAt: "2026-09-28T10:00:00Z",
    moments: [],
    ...rest,
  };
  const current: SeasonSummaryDto = {
    seasonId: base.season.id,
    label: base.season.label,
    ovr: base.ovr,
    tier: base.tier,
    bestTier: base.bestTier ?? base.tier,
    gameweeksCounted: base.gameweeksCounted,
    closedAt: base.seasonClosed ? "2027-05-30T20:00:00Z" : null,
  };
  return { ...base, seasons: [current, ...previous], moments };
}

/**
 * A rated card: the number, the tier, the next tier and the stored dates follow from `ovr`. A
 * rating is provisional until `minConfirmed` journées are counted (5), unless a fixture says so.
 */
function rated(ovr: number, over: CardParts = {}): MyCardDto {
  const tier = tierOf(ovr)!;
  const counted = over.gameweeksCounted ?? 3;
  const first = over.firstCountedGameweekSeq ?? 5;
  const provisional = over.provisional ?? counted < 5;
  return card({
    ratingState: provisional ? "provisional" : "rated",
    ovr,
    ovrNullReason: null,
    tier,
    bestTier: tier,
    nextTier: NEXT[tier],
    provisional,
    stats: FULL_STATS,
    gameweeksCounted: counted,
    throughGameweekSeq: first + counted - 1,
    calculatedAt: "2026-10-19T21:14:00Z",
    firstCountedGameweekSeq: first,
    firstRatedGameweekSeq: first + 2,
    ...over,
  });
}

const at = (n: number): string =>
  `2026-10-${String(10 + Math.min(n, 19)).padStart(2, "0")}T21:14:00Z`;

const firstRating = (gameweekSeq: number, ovr: number, provisional = true): MomentDto => ({
  kind: "first_rating",
  key: `first_rating:${SEASON.id}`,
  occurredAt: at(gameweekSeq),
  gameweekSeq,
  ovr,
  tier: tierOf(ovr)!,
  provisional,
  gameweeksCounted: 3,
  firstEver: true,
});
const cardCreated = (): MomentDto => ({
  kind: "card_created",
  key: "card_created",
  occurredAt: "2026-09-28T10:00:00Z",
  seasonLabel: SEASON.label,
});

const WOBBLE = [0, -2, 1, -1, 2, -3, 0, 1] as const;

/**
 * The stored journées of one season, newest first. The first `minRated - 1` rows carry no number;
 * rows below `minConfirmed` counted journées are provisional. The last row is `finalOvr`; `pin`
 * fixes the number of chosen counted journées (the replay of a first rating needs the real one).
 */
function historyFor(
  season: { id: string; label: string },
  firstSeq: number,
  counted: number,
  finalOvr: number | null,
  minRated = 3,
  minConfirmed = 5,
  pin: Record<number, number> = {},
): HistoryRowDto[] {
  const clamp = (n: number) => Math.max(1, Math.min(99, n));
  const rows: HistoryRowDto[] = [];
  for (let k = 1; k <= counted; k += 1) {
    const hasNumber = k >= minRated && finalOvr !== null;
    const ovr = !hasNumber
      ? null
      : (pin[k] ?? (k === counted ? finalOvr : clamp(finalOvr + WOBBLE[(counted - k) % 8]!)));
    rows.push({
      seasonId: season.id,
      seasonLabel: season.label,
      gameweekSeq: firstSeq + k - 1,
      ovr,
      tier: tierOf(ovr),
      provisional: ovr !== null && k < minConfirmed,
      gameweeksCounted: k,
      stats:
        ovr === null
          ? { cap: null, sel: null, trf: null, con: null }
          : {
              cap: clamp(ovr + 7),
              sel: clamp(ovr - 2),
              trf: k % 4 === 0 ? null : clamp(ovr + 2),
              con: clamp(ovr - 6),
            },
      calculatedAt: at(firstSeq + k - 1),
    });
  }
  return rows.reverse();
}

/* ------------------------------------------------------------------------------------------ */
/* The league sample                                                                           */
/* ------------------------------------------------------------------------------------------ */

function member(
  n: number,
  name: string,
  club: CardClubDto | null,
  over: Partial<MemberCardDto>,
): MemberCardDto {
  return {
    teamId: uid(4, n),
    name,
    club,
    serial: String(400000 + n * 11113),
    founderCohort: null,
    seasonLabel: SEASON.label,
    ratingState: "rated",
    ovr: null,
    tier: null,
    provisional: false,
    stats: { cap: null, sel: null, trf: null, con: null },
    gameweeksCounted: 9,
    minRated: 3,
    firstRatedGameweekSeq: 7,
    ...over,
  };
}

const KARIM = member(1, "KARIM", WYDAD, {
  ovr: 78,
  tier: "stade",
  stats: { cap: 82, sel: 76, trf: 80, con: 74 },
});
const SALMA = member(2, "SALMA", RAJA, {
  ratingState: "forming",
  gameweeksCounted: 2,
  firstRatedGameweekSeq: null,
});
const YASMINE = member(3, "YASMINE", null, {
  founderCohort: 2026,
  ovr: 92,
  tier: "champion",
  stats: { cap: 96, sel: 90, trf: 93, con: 88 },
  gameweeksCounted: 12,
});
const OTHMANE = member(4, "OTHMANE", null, {
  ovr: 88,
  tier: "champion",
  stats: { cap: 92, sel: 86, trf: 89, con: 84 },
  gameweeksCounted: 11,
});
const HAMZA = member(5, "HAMZA", null, {
  ovr: 63,
  tier: "homa",
  stats: { cap: 66, sel: 61, trf: null, con: 60 },
});

/** The caller's own card as another manager would be shown it in the league. */
export function asMember(own: MyCardDto): MemberCardDto {
  return {
    teamId: own.teamId,
    name: own.name,
    club: own.club,
    serial: own.serial,
    founderCohort: own.founder?.cohort ?? null,
    seasonLabel: own.season.label,
    ratingState: own.ratingState,
    ovr: own.ovr,
    tier: own.tier,
    provisional: own.provisional,
    stats: {
      cap: own.stats.cap.value,
      sel: own.stats.sel.value,
      trf: own.stats.trf.value,
      con: own.stats.con.value,
    },
    gameweeksCounted: own.gameweeksCounted,
    minRated: own.minRated,
    firstRatedGameweekSeq: own.firstRatedGameweekSeq,
  };
}

function leagueFor(own: MyCardDto): FixtureLeague {
  const row = (
    teamId: string,
    managerName: string,
    teamName: string,
    rank: number,
    previousRank: number,
    gameweekScore: number,
    totalScore: number,
  ): LeagueStanding => ({
    managerId: teamId,
    managerName,
    teamName,
    rank,
    previousRank,
    gameweekScore,
    totalScore,
  });
  return {
    id: uid(5, 1),
    name: "Les Lions du Derb",
    members: [KARIM, SALMA, YASMINE, OTHMANE, HAMZA, asMember(own)],
    // Points order. The best rating (YASMINE, 92) is fourth, on purpose: nothing ranks by it.
    standings: [
      row(OTHMANE.teamId, "Othmane", "Derb United", 1, 1, 71, 702),
      row(own.teamId, own.name, "Atlas XI", 2, 3, 64, 688),
      row(KARIM.teamId, "Karim", "Casa Rouge", 3, 2, 52, 671),
      row(YASMINE.teamId, "Yasmine", "Les Panthères", 4, 4, 58, 640),
      row(HAMZA.teamId, "Hamza", "Hay Hassani FC", 5, 5, 47, 612),
      row(SALMA.teamId, "Salma", "Vert & Blanc", 6, 6, 39, 590),
    ],
  };
}

/* ------------------------------------------------------------------------------------------ */
/* The fixtures                                                                                */
/* ------------------------------------------------------------------------------------------ */

function make(
  id: FixtureId,
  label: string,
  cardValue: MyCardDto | null,
  extra: Partial<Pick<ManagerCardFixture, "status" | "behaviour" | "history">> & {
    league?: boolean;
  } = {},
): ManagerCardFixture {
  const { league = true, history, ...rest } = extra;
  const own = cardValue;
  return {
    id,
    label,
    status: STATUS_ON,
    behaviour: "normal",
    card: own,
    ...(own && league ? { league: leagueFor(own) } : {}),
    history:
      history ??
      (own
        ? historyFor(
            own.season,
            own.firstCountedGameweekSeq ?? 5,
            own.gameweeksCounted,
            own.ovr,
            own.minRated,
            own.minConfirmed,
          )
        : []),
    ...rest,
  };
}

const RATED = rated(84, {
  moments: [firstRating(7, 84)],
});

const SEASON_2627_FINAL = historyFor(SEASON, 1, 30, 86);

const BUILT: Record<FixtureId, ManagerCardFixture> = {
  featureOff: make("featureOff", "Status switched off", RATED, { status: STATUS_OFF }),
  offline: make("offline", "Every card read fails on the network", RATED, {
    behaviour: "offline",
  }),
  unavailable: make("unavailable", "The card read answers { available: false }", RATED, {
    behaviour: "unavailable",
  }),
  noCard: make("noCard", "Signed in, no card (deleted-pending path)", null),
  born0: make(
    "born0",
    "Saved, 0/3, serial not yet assigned",
    card({ serial: null, moments: [cardCreated()] }),
  ),
  born0Serial: make(
    "born0Serial",
    "Saved, 0/3, serial assigned",
    card({ moments: [cardCreated()] }),
  ),
  forming1: make(
    "forming1",
    "Forming, 1 of 3",
    card({
      gameweeksCounted: 1,
      firstCountedGameweekSeq: 5,
      throughGameweekSeq: 5,
      calculatedAt: "2026-10-12T21:14:00Z",
    }),
  ),
  eve2: make(
    "eve2",
    "Eve of the first rating, 2 of 3",
    card({
      gameweeksCounted: 2,
      firstCountedGameweekSeq: 5,
      throughGameweekSeq: 6,
      calculatedAt: "2026-10-16T21:14:00Z",
    }),
  ),
  notFinal2: make(
    "notFinal2",
    "Third journée over, not final yet, 2 of 3",
    card({
      gameweeksCounted: 2,
      firstCountedGameweekSeq: 5,
      throughGameweekSeq: 6,
      calculatedAt: "2026-10-16T21:14:00Z",
      provisional: true,
    }),
  ),
  insufficient3: make(
    "insufficient3",
    "3 of 3 counted, the rating waits for a statistic",
    card({
      ratingState: "insufficient",
      ovrNullReason: "too_few_stats",
      gameweeksCounted: 3,
      firstCountedGameweekSeq: 5,
      throughGameweekSeq: 7,
      calculatedAt: "2026-10-19T21:14:00Z",
      stats: {
        cap: stat(91),
        sel: stat(82),
        trf: stat(null, "no_transfers"),
        con: stat(null, "pending_minimum"),
      },
    }),
  ),
  rated: make("rated", "First rating, provisional (the default)", RATED),
  ratedTrfNull: make(
    "ratedTrfNull",
    "First rating, no transfer yet (TRF empty)",
    rated(84, {
      stats: stats(91, 82, null, 78),
      moments: [firstRating(7, 84)],
    }),
  ),
  cleared: make(
    "cleared",
    "No longer provisional",
    rated(85, {
      gameweeksCounted: 5,
      stats: stats(91, 84, 86, 78),
      throughGameweekSeq: 9,
      moments: [
        {
          kind: "provisional_cleared",
          key: `provisional_cleared:${SEASON.id}`,
          occurredAt: at(9),
          gameweekSeq: 9,
          ovr: 85,
          gameweeksCounted: 5,
        },
      ],
    }),
  ),
  tierUp: make(
    "tierUp",
    "First time at CHAMPION (from PRO)",
    rated(88, {
      gameweeksCounted: 8,
      stats: stats(94, 86, 89, 83),
      throughGameweekSeq: 12,
      moments: [
        {
          kind: "tier_changed",
          key: "tier_changed:champion",
          occurredAt: at(12),
          tier: "champion",
          previousTier: "pro",
          ovr: 88,
          gameweekSeq: 12,
          seasonLabel: SEASON.label,
        },
      ],
    }),
  ),
  legend: make(
    "legend",
    "First time at LEGEND",
    rated(93, {
      gameweeksCounted: 10,
      stats: stats(97, 91, 94, 89),
      throughGameweekSeq: 14,
      moments: [
        {
          kind: "tier_changed",
          key: "tier_changed:legend",
          occurredAt: at(14),
          tier: "legend",
          previousTier: "champion",
          ovr: 93,
          gameweekSeq: 14,
          seasonLabel: SEASON.label,
        },
      ],
    }),
  ),
  tierDown: make(
    "tierDown",
    "Fell to STADE, best was PRO",
    rated(79, {
      tier: "stade",
      bestTier: "pro",
      gameweeksCounted: 9,
      stats: stats(84, 76, 81, 75),
      throughGameweekSeq: 13,
    }),
  ),
  founder: make(
    "founder",
    "Founder granted",
    rated(84, {
      founder: { cohort: 2026, grantedAt: at(10), cutoffDate: "2026-11-30" },
      gameweeksCounted: 6,
      throughGameweekSeq: 10,
      moments: [
        {
          kind: "founder_granted",
          key: "founder_granted",
          occurredAt: at(10),
          cohort: 2026,
          cutoffDate: "2026-11-30",
        },
      ],
    }),
  ),
  seasonClosed: make(
    "seasonClosed",
    "Season 2026/27 closed, 30 counted",
    rated(86, {
      gameweeksCounted: 30,
      stats: stats(92, 84, 88, 80),
      firstCountedGameweekSeq: 1,
      firstRatedGameweekSeq: 3,
      throughGameweekSeq: 30,
      seasonClosed: true,
      moments: [
        {
          kind: "season_closed",
          key: `season_closed:${SEASON.id}`,
          occurredAt: "2027-05-30T20:00:00Z",
          seasonLabel: SEASON.label,
          ovr: 86,
          tier: "pro",
        },
      ],
    }),
    { history: SEASON_2627_FINAL },
  ),
  seasonStarted: make(
    "seasonStarted",
    "New season 2027/28, forming; last season 86 PRO",
    card({
      season: { ...NEXT_SEASON },
      ratingGameweeks: [1, 2, 3],
      previousSeason: { label: SEASON.label, ovr: 86, tier: "pro" },
      moments: [
        {
          kind: "season_started",
          key: `season_started:${NEXT_SEASON.id}`,
          occurredAt: "2027-08-14T08:00:00Z",
          seasonLabel: NEXT_SEASON.label,
          previous: { label: SEASON.label, ovr: 86, tier: "pro" },
        },
      ],
      previous: [
        {
          seasonId: SEASON.id,
          label: SEASON.label,
          ovr: 86,
          tier: "pro",
          bestTier: "champion",
          gameweeksCounted: 30,
          closedAt: "2027-05-30T20:00:00Z",
        },
      ],
    }),
    { history: SEASON_2627_FINAL },
  ),
  launchArrival: make(
    "launchArrival",
    "Launch: existing manager, already rated",
    rated(84, {
      gameweeksCounted: 7,
      throughGameweekSeq: 11,
      moments: [cardCreated(), firstRating(7, 84, false)],
    }),
  ),
  returning: make(
    "returning",
    "Returning: first rating 84 at J3, 81 today",
    rated(81, {
      gameweeksCounted: 6,
      stats: stats(86, 79, 80, 77),
      firstCountedGameweekSeq: 1,
      firstRatedGameweekSeq: 3,
      throughGameweekSeq: 6,
      bestTier: "pro",
      moments: [
        {
          kind: "first_rating",
          key: `first_rating:${SEASON.id}`,
          occurredAt: at(3),
          gameweekSeq: 3,
          ovr: 84,
          tier: "pro",
          provisional: true,
          gameweeksCounted: 3,
          firstEver: true,
        },
        {
          kind: "provisional_cleared",
          key: `provisional_cleared:${SEASON.id}`,
          occurredAt: at(5),
          gameweekSeq: 5,
          ovr: 81,
          gameweeksCounted: 5,
        },
      ],
    }),
    { history: historyFor(SEASON, 1, 6, 81, 3, 5, { 3: 84, 4: 83, 5: 82 }) },
  ),
  clubNull: make("clubNull", "Rated, club not chosen", rated(84, { club: null })),
  longNameLatin: make(
    "longNameLatin",
    "A 28-character Latin name",
    rated(84, { name: "Abdelkarim Benjelloun-Alaoui" }),
  ),
  arabicName: make("arabicName", "An Arabic name", rated(84, { name: "فاطمة الزهراء" })),
  homa: make(
    "homa",
    "Rated 61, HOMA",
    rated(61, {
      stats: stats(66, 58, 61, 55),
      moments: [],
    }),
  ),
};

export const FIXTURES: Readonly<Record<FixtureId, ManagerCardFixture>> = BUILT;

export function isFixtureId(value: unknown): value is FixtureId {
  return typeof value === "string" && (FIXTURE_IDS as readonly string[]).includes(value);
}

/** The fixture for an id; the default one for anything unknown or missing. */
export function fixtureById(id: string | null | undefined): ManagerCardFixture {
  return FIXTURES[isFixtureId(id) ? id : DEFAULT_FIXTURE_ID];
}

/** The sample members of the league, for the batch read's fallback assignment. */
export const SAMPLE_MEMBERS: readonly MemberCardDto[] = [KARIM, SALMA, YASMINE, OTHMANE, HAMZA];
