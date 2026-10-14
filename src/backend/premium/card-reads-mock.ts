import type { RepositoryContext } from "@/backend/contracts/repository";

import type {
  CareerMember,
  CareerResponse,
  CareerWeek,
  DuelMember,
  DuelResponse,
  DuelWeek,
  HistoryVisibilityResponse,
  PremiumCardReadsRepository,
} from "./card-reads";

/**
 * A development member for the card reads, until the database serves them to a preview. Reached
 * only through the dynamic import in `src/services/premium-card-reads.ts` behind
 * `import.meta.env.DEV`, so a production build carries none of it. Eleven journées of a made-up
 * manager; the league mate's side is a made-up rival with a visible history. The ids are made up.
 */

const SCORES = [52, 58, 44, 56, 63, 48, 60, 55, 71, 47, 62];
const RIVAL = [49, 61, 40, 50, 66, 45, 57, 59, 64, 53, 58];
const CAPTAIN = [8, 10, 6, 12, 14, 5, 11, 9, 20, 4, 12];
const BEST_STARTER = [12, 10, 13, 12, 14, 9, 15, 9, 20, 11, 12];
const CAP = [62, 66, 64, 69, 71, 70, 73, 74, 76, 77, 78];
const SEL = [70, 66, 68, 65, 67, 69, 68, 70, 69, 70, 71];
const TRF = [null, null, 50, 48, 52, 55, 54, 57, 56, 57, 58];
const CON = [55, 60, 64, 67, 70, 73, 76, 78, 80, 81, 82];
const OVR = [62, 64, 62, 62, 65, 67, 68, 70, 70, 71, 72];
const SEASON = { id: "00000000-0000-4000-8000-000000000001", label: "2026/27" };
const ZERO = "00000000-0000-4000-8000-0000000000";

function weeks(): CareerWeek[] {
  return SCORES.map((score, i) => ({
    gameweekSeq: i + 1,
    gameweekName: `Journée ${i + 1}`,
    score,
    transferHit: [1, 3, 5, 9].includes(i) ? 4 : 0,
    chip: null,
    ovr: OVR[i]!,
    tier: "stade",
    provisional: i < 3,
    gameweeksCounted: i + 1,
    stats: { cap: CAP[i]!, sel: SEL[i]!, trf: TRF[i] ?? null, con: CON[i]! },
    raw: { cap: 0.8, sel: 0.7, trf: 1.2, con: 0.5 },
    captain: {
      name: "Capitaine",
      points: CAPTAIN[i]!,
      bestStarterPoints: BEST_STARTER[i]!,
      usedVice: false,
      share: 0.9,
      hit: CAPTAIN[i] === BEST_STARTER[i],
    },
  }));
}

export function mockCareer(): CareerMember {
  const transfer = (seq: number, out: string, into: string, gain: number) => ({
    gameweekSeq: seq,
    playerOut: out,
    playerIn: into,
    hit: 4,
    gain,
    state: "counted" as const,
  });
  const best = transfer(8, "M. Tahiri", "A. Chakir", 11);
  const worst = transfer(6, "H. Lamrani", "S. Idrissi", -2);
  return {
    available: true,
    locked: false,
    season: SEASON,
    hero: {
      firstOvr: 62,
      firstGameweekSeq: 1,
      lastOvr: 72,
      lastGameweekSeq: 11,
      tier: "stade",
      provisional: false,
    },
    weeks: weeks(),
    bestWeeks: [],
    worstWeeks: [],
    captain: { weeksCounted: 11, hits: 3, averageShare: 0.82 },
    transfers: {
      items: [best, worst],
      byGameweek: [
        { gameweekSeq: 2, gain: 9, transfers: 2 },
        { gameweekSeq: 4, gain: 7, transfers: 2 },
        { gameweekSeq: 6, gain: -2, transfers: 2 },
        { gameweekSeq: 8, gain: 11, transfers: 1 },
        { gameweekSeq: 10, gain: 2, transfers: 2 },
      ],
      seasonGain: 27,
      averageGain: 5.4,
      hitsPaid: 4,
      best,
      worst,
    },
    seasons: [],
  };
}

export function mockDuel(otherTeamId: string): DuelMember {
  const side = (score: number, i: number, rival: boolean) => ({
    score,
    ovr: rival ? 70 : OVR[i]!,
    tier: "stade" as const,
    provisional: false,
    stats: rival
      ? { cap: 69, sel: 74, trf: 70, con: 64 }
      : { cap: CAP[i]!, sel: SEL[i]!, trf: TRF[i] ?? null, con: CON[i]! },
  });
  const duelWeeks: DuelWeek[] = SCORES.map((score, i) => ({
    gameweekSeq: i + 1,
    gameweekName: `Journée ${i + 1}`,
    winner: score > RIVAL[i]! ? "me" : score < RIVAL[i]! ? "opponent" : "tie",
    me: side(score, i, false),
    opponent: side(RIVAL[i]!, i, true),
  }));
  const wins = duelWeeks.filter((w) => w.winner === "me").length;
  const card = (name: string, teamId: string) => ({
    teamId,
    name,
    club: null,
    serial: null,
    founderCohort: null,
    seasonLabel: SEASON.label,
    ratingState: "rated" as const,
    ovr: 70,
    tier: "stade" as const,
    provisional: false,
    stats: { cap: 69, sel: 74, trf: 70, con: 64 },
    gameweeksCounted: 11,
    minRated: 3,
    firstRatedGameweekSeq: 3,
    edition: "standard" as const,
  });
  return {
    available: true,
    locked: false,
    season: SEASON,
    seasons: [{ seasonId: SEASON.id, label: SEASON.label }],
    me: { teamId: `${ZERO}01`, card: card("Karim B.", `${ZERO}01`) },
    opponent: { teamId: otherTeamId, card: card("Sami", otherTeamId), historyVisible: true },
    weeks: duelWeeks,
    summary: {
      played: duelWeeks.length,
      meWins: wins,
      opponentWins: duelWeeks.length - wins,
      ties: 0,
      biggestWin: { gameweekSeq: 9, margin: 7 },
      biggestLoss: { gameweekSeq: 5, margin: 3 },
      opponentBestCaptain: null,
    },
  };
}

export class MockPremiumCardReadsRepository implements PremiumCardReadsRepository {
  async career(_season: string | null, _context: RepositoryContext): Promise<CareerResponse> {
    return mockCareer();
  }
  async duel(
    otherTeamId: string,
    _season: string | null,
    _context: RepositoryContext,
  ): Promise<DuelResponse> {
    return mockDuel(otherTeamId);
  }
  async setHistoryVisibility(
    visible: boolean,
    _context: RepositoryContext,
  ): Promise<HistoryVisibilityResponse> {
    return { available: true, visible };
  }
  async historyVisibility(_context: RepositoryContext): Promise<HistoryVisibilityResponse> {
    return { available: true, visible: true };
  }
}
