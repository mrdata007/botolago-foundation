import type { RepositoryContext } from "@/backend/contracts/repository";
import { isMemberState } from "@/backend/premium/contracts";
import { mockMine, scenarioFromSearch } from "@/backend/premium/mock-repository";

import {
  leagueMemberTrophiesSchema,
  trophiesCabinetSchema,
  type ChooseFrameResponse,
  type LeagueMemberTrophiesResponse,
  type SetVisibilityResponse,
  type TrophiesCabinet,
  type TrophiesRepository,
  type TrophiesResponse,
} from "./contracts";

/**
 * A development cabinet for the Trophées screens, until the database serves one to a preview.
 * Reached only through the dynamic import in `src/services/trophies.ts` behind
 * `import.meta.env.DEV`, so a production build carries none of it.
 *
 * It is Karim B. (KACM) after journée 11 of 2026/27: six trophies earned, the league podium and the
 * league champion still in progress (they are given at the end of the season only), the rest still to
 * earn with the server's own counts. Whether he is a member follows `?plus=<scenario>` like the
 * membership mock (`none` is the default: a non-member). A frame chosen here, and the switch « Montrer
 * mes trophées », live in memory until the page reloads. The league mates are the Fantasy mock's
 * `m1` and `m2` (Youssef A. and Salma B., league « lg1 »).
 */

const SEASON = { id: "00000000-0000-4000-8000-000000000001", label: "2026/27" };
const stamp = (day: string) => `2026-${day}T09:00:00+00:00`;

const CATALOG: TrophiesCabinet["catalog"] = [
  {
    code: "first_rating",
    family: "paliers",
    scope: "season",
    need: null,
    labelFr: "Première note",
    labelAr: "أول تقييم",
  },
  {
    code: "first_stade",
    family: "paliers",
    scope: "season",
    need: null,
    labelFr: "Premier passage STADE",
    labelAr: "أول مرة في مستوى ملعب",
  },
  {
    code: "first_pro",
    family: "paliers",
    scope: "season",
    need: null,
    labelFr: "Premier passage PRO",
    labelAr: "أول مرة في مستوى محترف",
  },
  {
    code: "first_champion",
    family: "paliers",
    scope: "season",
    need: null,
    labelFr: "Premier passage CHAMPION",
    labelAr: "أول مرة في مستوى بطل",
  },
  {
    code: "first_legend",
    family: "paliers",
    scope: "season",
    need: null,
    labelFr: "Premier passage LEGEND",
    labelAr: "أول مرة في مستوى أسطورة",
  },
  {
    code: "gw_80",
    family: "journees",
    scope: "season",
    need: 80,
    labelFr: "Journée à 80 pts",
    labelAr: "جولة بـ 80 نقطة",
  },
  {
    code: "ten_gameweeks",
    family: "journees",
    scope: "season",
    need: 10,
    labelFr: "10 journées jouées",
    labelAr: "10 جولات لُعبت",
  },
  {
    code: "thirty_gameweeks",
    family: "journees",
    scope: "season",
    need: 30,
    labelFr: "30 journées jouées",
    labelAr: "30 جولة لُعبت",
  },
  {
    code: "winning_transfer",
    family: "decisions",
    scope: "season",
    need: 10,
    labelFr: "Transfert gagnant",
    labelAr: "انتقال رابح",
  },
  {
    code: "league_podium",
    family: "ligue",
    scope: "season",
    need: 3,
    labelFr: "Podium de la ligue",
    labelAr: "منصة الدوري",
  },
  {
    code: "league_leader",
    family: "ligue",
    scope: "season",
    need: 1,
    labelFr: "Champion de votre ligue",
    labelAr: "بطل دوريك",
  },
  {
    code: "founder_2026",
    family: "carte",
    scope: "card",
    need: null,
    labelFr: "Fondateur 2026",
    labelAr: "مؤسس 2026",
  },
];

const label = (code: string) => CATALOG.find((c) => c.code === code)!;
const earn = (
  code: string,
  gameweekSeq: number | null,
  facts: Record<string, unknown>,
  publishedDay: string,
  seasonId: string | null = SEASON.id,
) => ({
  code,
  family: label(code).family,
  labelFr: label(code).labelFr,
  labelAr: label(code).labelAr,
  gameweekSeq,
  facts,
  publishedAt: stamp(publishedDay),
  earnedAt: stamp(publishedDay),
  seasonId,
});

const FRAMES: TrophiesCabinet["frames"] = [
  { code: "standard", trophyCode: null, labelFr: "Standard", labelAr: "عادي", earned: true },
  {
    code: "founder_2026",
    trophyCode: "founder_2026",
    labelFr: "Fondateur 2026",
    labelAr: "مؤسس 2026",
    earned: true,
  },
  {
    code: "first_stade",
    trophyCode: "first_stade",
    labelFr: "STADE",
    labelAr: "ملعب",
    earned: true,
  },
  { code: "first_pro", trophyCode: "first_pro", labelFr: "PRO", labelAr: "محترف", earned: false },
  {
    code: "first_champion",
    trophyCode: "first_champion",
    labelFr: "CHAMPION",
    labelAr: "بطل",
    earned: false,
  },
  {
    code: "first_legend",
    trophyCode: "first_legend",
    labelFr: "LEGEND",
    labelAr: "أسطورة",
    earned: false,
  },
  {
    code: "winning_transfer",
    trophyCode: "winning_transfer",
    labelFr: "Transfert gagnant",
    labelAr: "انتقال رابح",
    earned: true,
  },
  {
    code: "ten_gameweeks",
    trophyCode: "ten_gameweeks",
    labelFr: "10 journées",
    labelAr: "10 جولات",
    earned: true,
  },
  {
    code: "thirty_gameweeks",
    trophyCode: "thirty_gameweeks",
    labelFr: "30 journées",
    labelAr: "30 جولة",
    earned: false,
  },
];

function isMember(): boolean {
  const search = typeof window === "undefined" ? "" : window.location.search;
  const mine = mockMine(scenarioFromSearch(search), new Date());
  return mine.available && isMemberState(mine.state);
}

export function mockTrophies(
  chosen: string,
  member: boolean,
  showToLeagues = true,
): TrophiesCabinet {
  return trophiesCabinetSchema.parse({
    available: true,
    member,
    season: SEASON,
    journeesPlayed: 11,
    catalog: CATALOG,
    earned: [
      earn("first_rating", 3, { ovr: 62, tier: "lastreet" }, "09-21"),
      earn("first_stade", 7, { ovr: 70, tier: "stade" }, "09-28"),
      earn("gw_80", 8, { score: 81 }, "10-03"),
      earn(
        "winning_transfer",
        8,
        { playerOut: "M. Tahiri", playerIn: "A. Chakir", gain: 11 },
        "10-03",
      ),
      earn("ten_gameweeks", 10, { played: 10 }, "10-09"),
      earn("founder_2026", null, { cohort: 1 }, "09-10", null),
    ],
    pending: [],
    progress: [
      { code: "first_pro", have: 72, need: 84, unit: "rating" },
      { code: "first_champion", have: 72, need: 90, unit: "rating" },
      { code: "first_legend", have: 72, need: 95, unit: "rating" },
      { code: "thirty_gameweeks", have: 11, need: 30, unit: "gameweeks" },
      { code: "league_podium", have: 3, need: 3, unit: "rank" },
      { code: "league_leader", have: 3, need: 1, unit: "rank" },
    ],
    frames: FRAMES,
    chosenFrame: chosen,
    frame: member ? chosen : "standard",
    showToLeagues,
  });
}

const mateTrophy = (code: string, gameweekSeq: number | null, publishedDay: string) => {
  const item = label(code);
  return {
    code,
    family: item.family,
    labelFr: item.labelFr,
    labelAr: item.labelAr,
    gameweekSeq,
    publishedAt: stamp(publishedDay),
  };
};

/** The mates who show trophies in the development league: only what they earned, nothing else. */
export function mockMateTrophies(leagueId: string): LeagueMemberTrophiesResponse {
  const mates = [
    {
      teamId: "m1",
      trophies: [
        mateTrophy("first_rating", 3, "09-21"),
        mateTrophy("gw_80", 8, "10-03"),
        mateTrophy("ten_gameweeks", 10, "10-09"),
      ],
    },
    { teamId: "m2", trophies: [mateTrophy("first_stade", 7, "09-28")] },
  ];
  return leagueMemberTrophiesSchema.parse({
    available: true,
    leagueId,
    members: mates.map((m) => ({ ...m, count: m.trophies.length })),
  });
}

/** An in-memory repository: Karim B.'s cabinet, and the frame he picks until the page reloads. */
export class MockTrophiesRepository implements TrophiesRepository {
  private chosen = "founder_2026";
  private shown = true;

  async myTrophies(_season: string | null, _context: RepositoryContext): Promise<TrophiesResponse> {
    return mockTrophies(this.chosen, isMember(), this.shown);
  }

  async setVisibility(
    visible: boolean,
    _context: RepositoryContext,
  ): Promise<SetVisibilityResponse> {
    this.shown = visible;
    return { available: true, showToLeagues: visible };
  }

  async leagueMemberTrophies(
    leagueId: string,
    _context: RepositoryContext,
  ): Promise<LeagueMemberTrophiesResponse> {
    return mockMateTrophies(leagueId);
  }

  async chooseFrame(code: string, _context: RepositoryContext): Promise<ChooseFrameResponse> {
    const frame = FRAMES.find((f) => f.code === code && f.earned);
    if (!frame) throw new Error("trophy_not_earned");
    if (code !== "standard" && !isMember()) throw new Error("premium_required");
    this.chosen = code;
    return { available: true, chosenFrame: code, frame: code };
  }
}
