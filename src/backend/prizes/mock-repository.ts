import type { RepositoryContext } from "@/backend/contracts/repository";
import type {
  PrizeWinnerCursor,
  PrizesRepository,
  PublicPrizeDto,
  PublicPrizeWinnerDto,
  PublicPrizeWinnerPageDto,
} from "./contracts";

/**
 * Local and CI stand-in for the prize RPCs. The catalog mirrors the migration's
 * default prizes, switched on, plus a mini-league prize; the winners are
 * invented demo managers with masked usernames, never real accounts.
 */
const id = (block: string, index: number) =>
  `${block}-0000-4000-8000-${String(index).padStart(12, "0")}`;

export const MOCK_PRIZES: PublicPrizeDto[] = [
  {
    id: id("f7a10000", 1),
    tier: "gameweek",
    name: {
      fr: "Recharge mobile + maillot d'un club de la Botola",
      ar: "رصيد هاتفي + قميص نادٍ من البطولة",
    },
    description: {
      fr: "Le meilleur score de la journée remporte une recharge mobile et un maillot officiel d'un club de la Botola Pro.",
      ar: "صاحب أعلى نقاط في الجولة يفوز برصيد هاتفي وقميص رسمي لأحد أندية البطولة الاحترافية.",
    },
    estimatedValueMad: 500,
    sponsorName: null,
    sponsorLogoUrl: null,
    imageUrl: null,
  },
  {
    id: id("f7a10000", 2),
    tier: "monthly",
    name: { fr: "Smartphone", ar: "هاتف ذكي" },
    description: {
      fr: "Le meilleur total sur un bloc de 4 journées remporte un smartphone.",
      ar: "صاحب أعلى مجموع نقاط خلال 4 جولات متتالية يفوز بهاتف ذكي.",
    },
    estimatedValueMad: 2500,
    sponsorName: null,
    sponsorLogoUrl: null,
    imageUrl: null,
  },
  {
    id: id("f7a10000", 3),
    tier: "season",
    name: {
      fr: "Voyage pour le derby + smartphone haut de gamme",
      ar: "رحلة لحضور الديربي + هاتف ذكي من الفئة الراقية",
    },
    description: {
      fr: "Le champion de la saison remporte un voyage pour assister au derby et un smartphone haut de gamme.",
      ar: "بطل الموسم يفوز برحلة لحضور الديربي وهاتف ذكي من الفئة الراقية.",
    },
    estimatedValueMad: 25000,
    sponsorName: null,
    sponsorLogoUrl: null,
    imageUrl: null,
  },
  {
    id: id("f7a10000", 4),
    tier: "mini_league",
    name: { fr: "Pack supporter", ar: "حزمة المشجع" },
    description: {
      fr: "Le leader de chaque ligue privée d'au moins 10 membres reçoit un pack supporter.",
      ar: "متصدر كل دوري خاص يضم 10 أعضاء على الأقل يحصل على حزمة المشجع.",
    },
    estimatedValueMad: null,
    sponsorName: null,
    sponsorLogoUrl: null,
    imageUrl: null,
  },
];

const winner = (
  index: number,
  tier: PublicPrizeWinnerDto["tier"],
  first: number,
  last: number,
  teamName: string,
  maskedUsername: string,
  points: number,
  tieBreak: PublicPrizeWinnerDto["tieBreak"] = "outright",
): PublicPrizeWinnerDto => {
  const prize = MOCK_PRIZES.find((item) => item.tier === tier)!;
  return {
    id: id("f7b10000", index),
    tier,
    seasonName: "2026/27",
    blockNumber: tier === "monthly" ? Math.ceil(last / 4) : null,
    firstGameweekNumber: first,
    lastGameweekNumber: last,
    teamName,
    maskedUsername,
    points,
    tieBreak,
    prizeName: prize.name,
    awardedAt: new Date(Date.UTC(2026, 10, 30 - index)).toISOString(),
  };
};

export const MOCK_PRIZE_WINNERS: PublicPrizeWinnerDto[] = [
  winner(1, "monthly", 5, 8, "Atlas Lions XI", "y***a", 268),
  winner(2, "gameweek", 8, 8, "Casa Kings", "m***9", 94, "fewer_transfers"),
  winner(3, "gameweek", 7, 7, "Rif Rovers", "s***i", 88),
  winner(4, "gameweek", 6, 6, "Souss United", "h***7", 102),
  winner(5, "gameweek", 5, 5, "Oriental Stars", "n***e", 79, "earlier_registration"),
  winner(6, "monthly", 1, 4, "Bouregreg FC", "a***m", 251),
];

export class MockPrizesRepository implements PrizesRepository {
  async listPrizes(_context: RepositoryContext): Promise<PublicPrizeDto[]> {
    return MOCK_PRIZES;
  }

  async listWinners(
    cursor: PrizeWinnerCursor | null,
    limit: number,
    _context: RepositoryContext,
  ): Promise<PublicPrizeWinnerPageDto> {
    const start = cursor ? MOCK_PRIZE_WINNERS.findIndex((item) => item.id === cursor.id) + 1 : 0;
    const items = MOCK_PRIZE_WINNERS.slice(start, start + limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        last && start + limit < MOCK_PRIZE_WINNERS.length
          ? { createdAt: last.awardedAt, id: last.id }
          : null,
    };
  }
}
