import { mockCareer } from "@/backend/premium/card-reads-mock";
import type { CareerMember } from "@/backend/premium/card-reads";
import {
  leagueContextMemberSchema,
  toLeagueSeries,
  type LeagueContextMember,
  type LeagueSeries,
} from "@/backend/premium/league-context";

/**
 * Test support: a member's league answer shaped like the database's (journées 1, 2, 3 and 5, the
 * gap a postponed fixture leaves), with a career to set against it. The figures are made up and
 * easy to recognise on screen: the league average of journée 5 is 57.5, the leader has 655.
 */
export const LEAGUE_ID = "bc0e0000-0000-4000-8000-000000000701";
export const RIVAL_TEAM = "bc0e0000-0000-4000-8000-000000000402";
const SEASON = { id: "bc0e0000-0000-4000-8000-000000000005", label: "2026/27" };
const SEQS = [1, 2, 3, 5];
const NO_RATING = { me: null, rank: null, rated: 0, average: null };
const NO_RIVAL_RATING = { rank: null, value: null };

export function gappedCareer(): CareerMember {
  const base = mockCareer();
  const weeks = base.weeks.slice(0, 4).map((week, i) => ({
    ...week,
    gameweekSeq: SEQS[i]!,
    gameweekName: `Journée ${SEQS[i]}`,
    // A 4-point hit on the second and the fourth journée.
    transferHit: i === 1 || i === 3 ? 4 : 0,
    captain: week.captain && { ...week.captain, points: 10 + i, bestStarterPoints: 10 + i },
  }));
  // The API's gain is net of the hit: journée 2 gained 2 after a 4-point hit, journée 5 gained 9.
  const byGameweek = [
    { gameweekSeq: 2, gain: 2, transfers: 2 },
    { gameweekSeq: 5, gain: 9, transfers: 1 },
  ];
  return {
    ...base,
    weeks,
    captain: { weeksCounted: 3, hits: 2, averageShare: 0.9 },
    transfers: { ...base.transfers, byGameweek, seasonGain: 11, hitsPaid: 8 },
  };
}

export function leagueAnswer(
  overrides: { rivalShowsHistory?: boolean; withRival?: boolean; minGroup?: boolean } = {},
): LeagueContextMember {
  const { rivalShowsHistory = true, withRival = false, minGroup = false } = overrides;
  const shown = withRival && rivalShowsHistory;
  const week = (seq: number, i: number) => ({
    gameweekSeq: seq,
    gameweekName: `Journée ${seq}`,
    scored: 4,
    ranked: 4,
    leagueAverage: [56.67, 50, 50, 57.5][i]!,
    leagueBest: [60, 55, 70, 80][i]!,
    me: { score: 60, rank: [1, 1, 2, 1][i]!, previousRank: null, movement: null },
    captain: { contributors: 4, leagueAverage: minGroup ? null : 8, me: 10 + i },
    ratings: {
      cap: i === 3 ? { me: 84, rank: 1, rated: 3, average: 56 } : NO_RATING,
      sel: NO_RATING,
      trf: NO_RATING,
      con: NO_RATING,
      ovr: NO_RATING,
    },
    rival: shown
      ? {
          score: 50,
          rank: [2, 2, 1, 2][i]!,
          movement: null,
          captain: 5,
          ratings: {
            cap: NO_RIVAL_RATING,
            sel: NO_RIVAL_RATING,
            trf: NO_RIVAL_RATING,
            con: NO_RIVAL_RATING,
            ovr: NO_RIVAL_RATING,
          },
        }
      : null,
  });
  const ratingNow = (value: number, rank: number) => ({ value, rank });
  const rival = withRival
    ? {
        teamId: RIVAL_TEAM,
        total: 220,
        rank: 2,
        captain: shown ? { points: 15, weeks: 3 } : null,
        transfers: shown ? { net: 8, gross: 12, hitsPaid: 4, transfers: 3, counted: 2 } : null,
        ratings: {
          cap: ratingNow(61, 3),
          sel: ratingNow(86, 1),
          trf: { value: null, rank: null },
          con: ratingNow(75, 2),
          ovr: ratingNow(54, 3),
        },
        historyVisible: rivalShowsHistory,
      }
    : null;
  return leagueContextMemberSchema.parse({
    available: true,
    locked: false,
    season: SEASON,
    league: { id: LEAGUE_ID, name: "Test league", members: minGroup ? 2 : 4, ranked: 4 },
    minGroup: 3,
    totals: { ranked: 4, leagueAverage: 187.5, leaderTotal: 655 },
    captain: { contributors: 4, leagueAverage: minGroup ? null : 20.5 },
    transfers: { contributors: 1, leagueAverage: minGroup ? null : 3.5, leagueAverageAll: 0.5 },
    ratings: {
      cap: { rated: 3, average: 56 },
      sel: { rated: 3, average: 76 },
      trf: { rated: 1, average: minGroup ? null : 55 },
      con: { rated: 3, average: 66 },
      ovr: { rated: 3, average: 63 },
    },
    me: {
      teamId: "bc0e0000-0000-4000-8000-000000000401",
      total: 255,
      rank: 1,
      captain: { points: 38, weeks: 4 },
      transfers: { net: 11, gross: 19, hitsPaid: 8, transfers: 3, counted: 2 },
      ratings: {
        cap: ratingNow(84, 1),
        sel: ratingNow(85, 2),
        trf: ratingNow(55, 1),
        con: ratingNow(99, 1),
        ovr: ratingNow(81, 1),
      },
    },
    rival,
    weeks: SEQS.map(week),
  });
}

export function leagueSeries(overrides: Parameters<typeof leagueAnswer>[0] = {}): LeagueSeries {
  return toLeagueSeries(leagueAnswer(overrides));
}
