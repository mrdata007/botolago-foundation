import type { RepositoryContext } from "@/backend/contracts/repository";
import {
  HISTORY_DEFAULT_LIMIT,
  HISTORY_MAX_LIMIT,
  HISTORY_MIN_LIMIT,
  MAX_CARDS_PER_READ,
  type ManagerCardDto,
  type ManagerCardHistoryItemDto,
  type ManagerCardHistoryPageDto,
  type ManagerCardHistoryRequest,
  type ManagerCardRepository,
} from "./contracts";
import { ManagerCardError } from "./errors";

/**
 * Manager Cards without a database, for development and tests.
 *
 * SAMPLE DATA ONLY. Every name, number, club and figure below is invented:
 * none of it describes a real manager, and the serials are not real card
 * numbers. The mock follows the database's rules (switch off, hidden cards
 * left out, the order of a batch read, keyset history) so a screen built on it
 * behaves as it will on the real functions.
 */
export const MANAGER_CARD_SAMPLE_NOTICE =
  "Sample data: invented managers and figures, not real Manager Cards.";

const uuid = (index: number) => `5a3b1e00-0000-4000-8000-${String(index).padStart(12, "0")}`;
const SEASON = { id: uuid(900), label: "2026/27 (sample)" };

const SAMPLE_CLUB = {
  id: uuid(800),
  code: "SMP",
  shortName: { fr: "Club exemple", ar: "نادي تجريبي" },
  primaryColor: "#0B6E4F",
  secondaryColor: "#F2F2F2",
} as const;

function sampleCard(index: number, patch: Partial<ManagerCardDto>): ManagerCardDto {
  return {
    fantasyTeamId: uuid(index),
    name: `Sample Manager ${index}`,
    handle: `sample_${index}`,
    serial: String(100000 + index * 111),
    founderCohort: null,
    season: SEASON,
    ovr: 64,
    tier: "stade",
    stats: { cap: 66, sel: 61, trf: 58, con: 71 },
    provisional: false,
    gameweeksCounted: 9,
    rulesVersion: 1,
    club: SAMPLE_CLUB,
    ...patch,
  };
}

/** The caller's sample card. */
export const SAMPLE_MY_CARD: ManagerCardDto = sampleCard(1, {
  name: "Sample Manager (you)",
  handle: "sample_you",
  founderCohort: 1,
  ovr: 72,
  tier: "pro",
  stats: { cap: 75, sel: 70, trf: 64, con: 80 },
});

export const SAMPLE_CARDS: readonly ManagerCardDto[] = [
  SAMPLE_MY_CARD,
  sampleCard(2, { ovr: 91, tier: "legend", stats: { cap: 93, sel: 90, trf: 88, con: 94 } }),
  // Under the minimum: figures are null, the season and the number still show.
  sampleCard(3, {
    ovr: null,
    tier: null,
    stats: { cap: null, sel: null, trf: null, con: null },
    provisional: true,
    gameweeksCounted: 2,
    club: null,
  }),
  // No transfer yet: one stat is a dash, the others show.
  sampleCard(4, {
    ovr: 55,
    tier: "stade",
    stats: { cap: 60, sel: 52, trf: null, con: 53 },
    provisional: true,
    gameweeksCounted: 4,
  }),
];

/** Newest first, like the database. */
export const SAMPLE_HISTORY: readonly ManagerCardHistoryItemDto[] = Array.from(
  { length: 9 },
  (_, offset) => {
    const gameweekSequence = 9 - offset;
    return {
      gameweekSequence,
      ovr: 60 + gameweekSequence,
      tier: gameweekSequence >= 8 ? ("pro" as const) : ("stade" as const),
      stats: {
        cap: 70 + (gameweekSequence % 3),
        sel: 65 + (gameweekSequence % 4),
        trf: 60,
        con: 75,
      },
      provisional: gameweekSequence < 5,
    };
  },
);

export interface MockManagerCardOptions {
  /** The read switch. Off: every read fails with `manager_card_off`. */
  readonly enabled?: boolean;
  /** False: every read fails with `unauthenticated`. */
  readonly signedIn?: boolean;
}

export class MockManagerCardRepository implements ManagerCardRepository {
  constructor(private readonly options: MockManagerCardOptions = {}) {}

  private guard(): void {
    if (this.options.signedIn === false)
      throw new ManagerCardError("unauthenticated", "Sign in to see Manager Cards.");
    if (this.options.enabled === false)
      throw new ManagerCardError("manager_card_off", "Manager Cards are switched off.");
  }

  async getMyCard(_context: RepositoryContext): Promise<ManagerCardDto | null> {
    this.guard();
    return SAMPLE_MY_CARD;
  }

  async getCard(
    fantasyTeamId: string,
    _context: RepositoryContext,
  ): Promise<ManagerCardDto | null> {
    this.guard();
    if (!fantasyTeamId) throw new ManagerCardError("validation_failed", "validation_failed");
    return SAMPLE_CARDS.find((card) => card.fantasyTeamId === fantasyTeamId) ?? null;
  }

  async getCards(
    fantasyTeamIds: readonly string[],
    _context: RepositoryContext,
  ): Promise<readonly ManagerCardDto[]> {
    this.guard();
    const ids = [...new Set(fantasyTeamIds)];
    if (ids.length > MAX_CARDS_PER_READ)
      throw new ManagerCardError("validation_failed", "validation_failed");
    // The order each team was first asked for; unknown teams are left out.
    return ids.flatMap((id) => SAMPLE_CARDS.filter((card) => card.fantasyTeamId === id));
  }

  async getMyHistory(
    input: ManagerCardHistoryRequest,
    _context: RepositoryContext,
  ): Promise<ManagerCardHistoryPageDto> {
    this.guard();
    const limit = input.limit ?? HISTORY_DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < HISTORY_MIN_LIMIT || limit > HISTORY_MAX_LIMIT)
      throw new ManagerCardError("validation_failed", "validation_failed");
    const after = input.afterGameweekSequence ?? null;
    if (after !== null && (!Number.isInteger(after) || after < 1))
      throw new ManagerCardError("validation_failed", "validation_failed");
    const rest = SAMPLE_HISTORY.filter((item) => after === null || item.gameweekSequence < after);
    const items = rest.slice(0, limit);
    return {
      items,
      nextAfter: rest.length > limit ? items[items.length - 1]!.gameweekSequence : null,
    };
  }
}
