/**
 * The example season behind step 2 of the offer (« Votre saison » and « Détail du duel »).
 *
 * One consistent made-up season: you are Karim B. (KACM), the rival is Sami (RCA), 11 journées
 * played in a league of 12. Every number on screen is computed from the raw series below
 * (`deriveSeason`); no figure is typed into the copy. `plus-season-data.test.ts` re-asserts every
 * invariant (totals, wins, margins, averages, ranks, OVR = mean of the four ratings, build
 * contributions), so a changed series cannot leave a screen that does not add up.
 *
 * Not from the backend today: the league average and best score per journée, the rank after each
 * journée, the league's captain and transfer figures, the per-rating league average and rank, and
 * everything on the rival's side except the per-journée scores. They are computable from the
 * league's members once lane C serves the reads (TODO(lane C)); until then they are examples.
 */

export const JOURNEES = 11;
export const LEAGUE_SIZE = 12;
/** A paid transfer costs this many points. */
export const TRANSFER_PENALTY = 4;

/**
 * A figure the backend does not serve yet. It flows through the arithmetic as `NaN` (so every
 * derived figure that needs it is missing too) and the screens write it as « — » (`useSeasonFmt`).
 * Only the member mapper (`plus-member-data.ts`) produces it; the example season has none.
 */
export const MISSING = Number.NaN;
export const isMissing = (n: number | null | undefined): boolean =>
  n === null || n === undefined || !Number.isFinite(n);

export type RatingCode = "CAP" | "SEL" | "TRF" | "CON";
export const RATING_CODES: readonly RatingCode[] = ["CAP", "SEL", "TRF", "CON"];

/** One journée with transfers: [journée, gross gain, penalty paid, transfers made]. */
export type TransferWeek = readonly [number, number, number, number];

export interface SeasonRaw {
  /** Your points per journée, after penalties. */
  you: readonly number[];
  rival: readonly number[];
  /** League average and best score per journée. */
  leagueAvg: readonly number[];
  leagueBest: readonly number[];
  /** Rank in the league after each journée. */
  youRank: readonly number[];
  rivalRank: readonly number[];
  /** Your captain's bonus and your best starter's points, per journée. */
  captain: readonly number[];
  bestStarter: readonly number[];
  leaderTotal: number;
  leagueCaptain: number;
  leagueNetTransfers: number;
  transfers: readonly TransferWeek[];
  bestTransfer: { from: string; to: string } | null;
  worstTransfer: { from: string; to: string } | null;
  /** Journées the captain scored at least as much as the best starter, when the backend counts them. */
  bestChoiceWeeks?: number;
  rival_: {
    captain: number;
    bestStarters: number;
    gross: number;
    penalty: number;
    transfers: number;
    paidTransfers: number;
    captainBest: number;
  };
  /**
   * The card's OVR after each journée when the backend gives it (a member's own); otherwise it is
   * the mean of the four ratings, as the example's is.
   */
  ovrSeries?: readonly (number | null)[];
  /** The rival's OVR when the backend gives it; otherwise the mean of `rivalRating`. */
  rivalOvr?: number | null;
  /** Ratings (1 to 99) after each journée; `null` before the rating exists. */
  ratings: Record<RatingCode, readonly (number | null)[]>;
  leagueRating: Record<RatingCode, number>;
  ratingRank: Record<RatingCode | "OVR", number>;
  rivalRating: Record<RatingCode, number>;
  rivalRatingRank: Record<RatingCode | "OVR", number>;
}

export const SEASON_RAW: SeasonRaw = {
  you: [52, 58, 44, 56, 63, 48, 60, 55, 71, 47, 62],
  rival: [49, 61, 40, 50, 66, 45, 57, 59, 64, 53, 58],
  leagueAvg: [51, 54, 47, 52, 55, 50, 53, 52, 58, 49, 54],
  leagueBest: [74, 70, 66, 79, 83, 67, 76, 72, 88, 70, 81],
  youRank: [7, 5, 8, 4, 4, 5, 3, 4, 2, 3, 3],
  rivalRank: [8, 5, 7, 7, 6, 7, 5, 5, 4, 4, 4],
  captain: [8, 10, 6, 12, 14, 5, 11, 9, 20, 4, 12],
  bestStarter: [12, 10, 13, 12, 14, 9, 15, 9, 20, 11, 12],
  leaderTotal: 655,
  leagueCaptain: 93,
  leagueNetTransfers: 17,
  transfers: [
    [2, 9, 4, 2],
    [4, 7, 4, 2],
    [6, -2, 4, 2],
    [8, 11, 0, 1],
    [10, 2, 4, 2],
  ],
  bestTransfer: { from: "M. Tahiri", to: "A. Chakir" },
  worstTransfer: { from: "H. Lamrani", to: "S. Idrissi" },
  rival_: {
    captain: 90,
    bestStarters: 131,
    gross: 31,
    penalty: 12,
    transfers: 11,
    paidTransfers: 3,
    captainBest: 4,
  },
  ratings: {
    CAP: [62, 66, 64, 69, 71, 70, 73, 74, 76, 77, 78],
    SEL: [70, 66, 68, 65, 67, 69, 68, 70, 69, 70, 71],
    TRF: [null, null, 50, 48, 52, 55, 54, 57, 56, 57, 58],
    CON: [55, 60, 64, 67, 70, 73, 76, 78, 80, 81, 82],
  },
  leagueRating: { CAP: 66, SEL: 67, TRF: 62, CON: 62 },
  ratingRank: { CAP: 3, SEL: 4, TRF: 9, CON: 2, OVR: 3 },
  rivalRating: { CAP: 69, SEL: 74, TRF: 70, CON: 64 },
  rivalRatingRank: { CAP: 6, SEL: 2, TRF: 3, CON: 7, OVR: 4 },
};

const sum = (a: readonly number[]) => a.reduce((x, y) => x + y, 0);
const cum = (a: readonly number[]) => {
  let s = 0;
  return a.map((x) => (s += x));
};
/** Round half up, as the Manager Card does for the OVR. */
export const roundHalfUp = (x: number) => Math.floor(x + 0.5);
const std = (a: readonly number[]) => {
  const m = sum(a) / a.length;
  return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / a.length);
};
const argMax = (a: readonly number[]) => a.indexOf(Math.max(...a));
const argMin = (a: readonly number[]) => a.indexOf(Math.min(...a));
const allFinite = (a: readonly number[]) => a.every(Number.isFinite);
/** How many values pass `test`; missing (`NaN`) when any value is missing, never a wrong small count. */
const countWhere = (a: readonly number[], test: (x: number) => boolean) =>
  allFinite(a) ? a.filter(test).length : MISSING;
const ovrOf = (values: readonly (number | null)[]) => {
  const v = values.filter((x): x is number => x !== null);
  return v.length === 0 ? MISSING : roundHalfUp(sum(v) / v.length);
};

export function deriveSeason(raw: SeasonRaw, leagueSize: number = LEAGUE_SIZE) {
  const topHalf = (ranks: readonly number[]) => countWhere(ranks, (r) => r <= leagueSize / 2);
  const J = raw.you.length;
  const total = sum(raw.you);
  const rivalTotal = sum(raw.rival);
  const leagueTotal = sum(raw.leagueAvg);
  const lead = raw.you.map((v, i) => v - raw.rival[i]!);
  const cumLead = cum(lead);
  const vsLeague = raw.you.map((v, i) => v - raw.leagueAvg[i]!);
  const captainTotal = sum(raw.captain);
  const bestStarterTotal = sum(raw.bestStarter);
  const gross = sum(raw.transfers.map((t) => t[1]));
  const penalty = sum(raw.transfers.map((t) => t[2]));
  const netByWeek = raw.transfers.map((t) => t[1] - t[2]);
  const net = gross - penalty;
  const starters = total - captainTotal + penalty;
  const rivalStarters = rivalTotal - raw.rival_.captain + raw.rival_.penalty;
  const rivalNet = raw.rival_.gross - raw.rival_.penalty;
  const ovrSeries = Array.from({ length: J }, (_, i) =>
    raw.ovrSeries
      ? (raw.ovrSeries[i] ?? MISSING)
      : ovrOf(RATING_CODES.map((c) => raw.ratings[c][i] ?? null)),
  );
  const leagueOvrExact = sum(RATING_CODES.map((c) => raw.leagueRating[c])) / RATING_CODES.length;
  const lastRating = (c: RatingCode) => raw.ratings[c][J - 1] ?? MISSING;
  const contributions = Object.fromEntries(
    RATING_CODES.map((c) => [c, (lastRating(c) - raw.leagueRating[c]) / RATING_CODES.length]),
  ) as Record<RatingCode, number>;
  const bestWeek = argMax(raw.you);
  const worstWeek = argMin(raw.you);
  const rivalBestWeek = argMax(raw.rival);
  const rivalWorstWeek = argMin(raw.rival);
  // Best and worst by the net gain (gain minus penalty), the figure the chart and headline use.
  const netGain = (t: TransferWeek) => t[1] - t[2];
  const noWeek: TransferWeek = [MISSING, MISSING, 0, 0];
  const bestTransferWeek = raw.transfers.reduce(
    (a, t) => (netGain(t) > netGain(a) ? t : a),
    raw.transfers[0] ?? noWeek,
  );
  const worstTransferWeek = raw.transfers.reduce(
    (a, t) => (netGain(t) < netGain(a) ? t : a),
    raw.transfers[0] ?? noWeek,
  );
  const wins = lead.filter((x) => x > 0).length;
  const rivalWins = lead.filter((x) => x < 0).length;
  const bestLead = Math.max(...lead);
  const worstLead = Math.min(...lead);
  const peakLead = Math.max(...cumLead);
  const rivalAbove = countWhere(
    raw.rival.map((v, i) => v - raw.leagueAvg[i]!),
    (x) => x > 0,
  );
  const rivalOvr =
    raw.rivalOvr !== undefined
      ? (raw.rivalOvr ?? MISSING)
      : ovrOf(RATING_CODES.map((c) => raw.rivalRating[c]));
  const bestChoiceWeeks =
    raw.bestChoiceWeeks ??
    countWhere(
      raw.bestStarter.map((b, i) => b - raw.captain[i]!),
      (x) => x === 0,
    );
  // Categories of the duel (the seven rows of « Décisions »), counted for you.
  const aboveYou = countWhere(vsLeague, (x) => x > 0);
  const categoryPairs: [number, number][] = [
    [total, rivalTotal],
    [wins, rivalWins],
    [Math.max(...raw.you), Math.max(...raw.rival)],
    [aboveYou, rivalAbove],
    [captainTotal, raw.rival_.captain],
    [starters, rivalStarters],
    [net, rivalNet],
  ];
  const categoriesKnown = categoryPairs.every(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  const categories = categoryPairs.map(([a, b]) => a > b);
  return {
    J,
    total,
    rivalTotal,
    leagueTotal,
    cumYou: cum(raw.you),
    cumRival: cum(raw.rival),
    cumLeague: cum(raw.leagueAvg),
    lead,
    cumLead,
    vsLeague,
    captainTotal,
    bestStarterTotal,
    captainLeft: bestStarterTotal - captainTotal,
    bestChoiceWeeks,
    captainVsLeague: captainTotal - raw.leagueCaptain,
    gross,
    penalty,
    paidTransfers: penalty / TRANSFER_PENALTY,
    transferCount: sum(raw.transfers.map((t) => t[3])),
    netByWeek,
    net,
    netVsLeague: net - raw.leagueNetTransfers,
    starters,
    rivalStarters,
    rivalNet,
    gross_points: starters + captainTotal,
    wins,
    rivalWins,
    bestLead,
    worstLead,
    bestLeadWeek: lead.indexOf(bestLead),
    worstLeadWeek: lead.indexOf(worstLead),
    peakLead,
    peakLeadWeek: cumLead.indexOf(peakLead),
    winsSum: sum(lead.filter((x) => x > 0)),
    lossesSum: sum(lead.filter((x) => x < 0)),
    above: aboveYou,
    rivalAbove,
    belowWeeks: raw.you.map((v, i) => (v < raw.leagueAvg[i]! ? i + 1 : 0)).filter(Boolean),
    topHalf: topHalf(raw.youRank),
    rivalTopHalf: topHalf(raw.rivalRank),
    under50: countWhere(raw.you, (v) => v < 50),
    rivalUnder50: countWhere(raw.rival, (v) => v < 50),
    stdYou: std(raw.you),
    stdRival: std(raw.rival),
    bestWeek,
    worstWeek,
    rivalBestWeek,
    rivalWorstWeek,
    bestTransferWeek,
    worstTransferWeek,
    ovrSeries,
    ovr: ovrSeries[J - 1]!,
    leagueOvr: roundHalfUp(leagueOvrExact),
    leagueOvrExact,
    rivalOvr,
    contributions,
    lastRating,
    categoriesWon: categoriesKnown ? categories.filter(Boolean).length : MISSING,
    categoryCount: categories.length,
    /** The gap to the rival, term by term (what each adds to your lead): captain, starters, penalties. */
    gapTerms: {
      captain: captainTotal - raw.rival_.captain,
      starters: starters - rivalStarters,
      penalty: raw.rival_.penalty - penalty,
    },
    /** True when the last journée is a win that follows a loss (the current streak is one). */
    streak: (() => {
      let n = 0;
      for (let i = J - 1; i >= 0 && lead[i]! > 0; i--) n++;
      return n;
    })(),
  };
}

export type Season = ReturnType<typeof deriveSeason>;
export const SEASON: Season = deriveSeason(SEASON_RAW);

/** The two managers of the example duel: the initials on the avatar and the club's short name. */
export const SEASON_PEOPLE = {
  you: { initials: "KB", club: "KACM" },
  rival: { initials: "S", club: "RCA" },
} as const;
