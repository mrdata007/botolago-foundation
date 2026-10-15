import type { RepositoryContext } from "@/backend/contracts/repository";
import { SEASON_RAW } from "@/components/plus/plus-season-data";

import { mockCareer } from "./card-reads-mock";
import { rivalSeries } from "./mock-rival";
import {
  leagueContextMemberSchema,
  type LeagueContextMember,
  type LeagueContextResponse,
  type LeagueRatingKey,
  type LeagueContextRequest,
  type PremiumLeagueContextRepository,
} from "./league-context";

/**
 * A development league for the member screens, until the database serves one to a preview. Reached
 * only through the dynamic import in `src/services/premium-league-context.ts` behind
 * `import.meta.env.DEV`, so a production build carries none of it.
 *
 * It is the league of the example season (`SEASON_RAW`) and of the career fixture
 * (`card-reads-mock.ts`): five managers, Karim B. third on 612 points, Sami fourth on 598, the
 * leader on 655. Every figure the member screens compare with the league is served, so a member
 * sees comparisons rather than gaps. The ids are made up.
 */

const LEAGUE_ID = "00000000-0000-4000-8000-000000000701";
const SEASON = { id: "00000000-0000-4000-8000-000000000001", label: "2026/27" };
const ME_TEAM = "00000000-0000-4000-8000-000000000001";
const MEMBERS = 5;
/** Karim B. and Sami in a league of five, journée by journée. */
const YOU_RANK = [4, 3, 5, 3, 3, 4, 3, 3, 2, 3, 3];
const RIVAL_RANK = [5, 4, 4, 5, 4, 5, 4, 4, 4, 4, 4];
const KEYS: readonly LeagueRatingKey[] = ["cap", "sel", "trf", "con", "ovr"];
const AVERAGE = {
  cap: SEASON_RAW.leagueRating.CAP,
  sel: SEASON_RAW.leagueRating.SEL,
  trf: SEASON_RAW.leagueRating.TRF,
  con: SEASON_RAW.leagueRating.CON,
  ovr: Math.round(
    (SEASON_RAW.leagueRating.CAP +
      SEASON_RAW.leagueRating.SEL +
      SEASON_RAW.leagueRating.TRF +
      SEASON_RAW.leagueRating.CON) /
      4,
  ),
};
const MY_RANK = { cap: 3, sel: 4, trf: 5, con: 2, ovr: 3 };
const RIVAL_RANK_NOW = { cap: 4, sel: 2, trf: 3, con: 5, ovr: 4 };
const RIVAL_NOW = { cap: 69, sel: 74, trf: 70, con: 64, ovr: 70 };

const byKey = <T>(value: (key: LeagueRatingKey) => T) =>
  Object.fromEntries(KEYS.map((key) => [key, value(key)])) as Record<LeagueRatingKey, T>;

export function mockLeagueContext(rivalTeam: string | null): LeagueContextMember {
  const career = mockCareer();
  const total = SEASON_RAW.you.reduce((a, b) => a + b, 0);
  const rivalTotal = rivalSeries(rivalTeam).reduce((a, b) => a + b, 0);
  const gross = SEASON_RAW.transfers.reduce((a, t) => a + t[1], 0);
  const penalty = SEASON_RAW.transfers.reduce((a, t) => a + t[2], 0);
  const withRival = rivalTeam !== null;
  return leagueContextMemberSchema.parse({
    available: true,
    locked: false,
    season: SEASON,
    league: { id: LEAGUE_ID, name: "Les Lions du Derb", members: MEMBERS, ranked: MEMBERS },
    minGroup: 3,
    totals: {
      ranked: MEMBERS,
      leagueAverage: SEASON_RAW.leagueAvg.reduce((a, b) => a + b, 0),
      leaderTotal: SEASON_RAW.leaderTotal,
    },
    captain: { contributors: MEMBERS, leagueAverage: SEASON_RAW.leagueCaptain },
    transfers: {
      contributors: MEMBERS,
      leagueAverage: SEASON_RAW.leagueNetTransfers,
      leagueAverageAll: SEASON_RAW.leagueNetTransfers,
    },
    ratings: byKey((key) => ({ rated: MEMBERS, average: AVERAGE[key] })),
    me: {
      teamId: ME_TEAM,
      total,
      rank: 3,
      captain: {
        points: SEASON_RAW.captain.reduce((a, b) => a + b, 0),
        weeks: career.weeks.length,
      },
      transfers: {
        net: gross - penalty,
        gross,
        hitsPaid: penalty / 4,
        transfers: SEASON_RAW.transfers.reduce((a, t) => a + t[3], 0),
        counted: SEASON_RAW.transfers.length,
      },
      ratings: byKey((key) => ({
        value: key === "ovr" ? 72 : (career.weeks.at(-1)!.stats[key] ?? null),
        rank: MY_RANK[key],
      })),
    },
    rival: withRival
      ? {
          teamId: rivalTeam,
          total: rivalTotal,
          rank: 4,
          captain: { points: SEASON_RAW.rival_.captain, weeks: career.weeks.length },
          transfers: {
            net: SEASON_RAW.rival_.gross - SEASON_RAW.rival_.penalty,
            gross: SEASON_RAW.rival_.gross,
            hitsPaid: SEASON_RAW.rival_.paidTransfers,
            transfers: SEASON_RAW.rival_.transfers,
            counted: SEASON_RAW.rival_.transfers,
          },
          ratings: byKey((key) => ({ value: RIVAL_NOW[key], rank: RIVAL_RANK_NOW[key] })),
          historyVisible: true,
        }
      : null,
    weeks: career.weeks.map((week, i) => ({
      gameweekSeq: week.gameweekSeq,
      gameweekName: week.gameweekName,
      scored: MEMBERS,
      ranked: MEMBERS,
      leagueAverage: SEASON_RAW.leagueAvg[i]!,
      leagueBest: SEASON_RAW.leagueBest[i]!,
      me: {
        score: week.score,
        rank: YOU_RANK[i]!,
        previousRank: i === 0 ? null : YOU_RANK[i - 1]!,
        movement: i === 0 ? null : YOU_RANK[i - 1]! - YOU_RANK[i]!,
      },
      captain: {
        contributors: MEMBERS,
        leagueAverage: Math.round(SEASON_RAW.leagueCaptain / SEASON_RAW.you.length),
        me: week.captain?.points ?? null,
      },
      ratings: byKey((key) => ({
        rated: MEMBERS,
        average: AVERAGE[key],
        me: key === "ovr" ? week.ovr : (week.stats[key] ?? null),
        rank: MY_RANK[key],
      })),
      rival: withRival
        ? {
            score: rivalSeries(rivalTeam)[i]!,
            rank: RIVAL_RANK[i]!,
            movement: i === 0 ? null : RIVAL_RANK[i - 1]! - RIVAL_RANK[i]!,
            captain: null,
            ratings: byKey((key) => ({ value: RIVAL_NOW[key], rank: RIVAL_RANK_NOW[key] })),
          }
        : null,
    })),
  });
}

export class MockPremiumLeagueContextRepository implements PremiumLeagueContextRepository {
  async leagueContext(
    request: LeagueContextRequest,
    _context: RepositoryContext,
  ): Promise<LeagueContextResponse> {
    return mockLeagueContext(request.rivalTeam ?? null);
  }
}
