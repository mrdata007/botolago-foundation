import type { RepositoryContext } from "@/backend/contracts/repository";

import type {
  AckResponse,
  CardsResponse,
  HistoryResponse,
  ManagerCardRepository,
  ManagerCardStatus,
  MemberCardDto,
  MyCardDto,
  MyCardResponse,
} from "./contracts";
import { ManagerCardError } from "./errors";
import { currentFixtureId } from "./fixture-selection";
import { asMember, fixtureById, SAMPLE_MEMBERS, type ManagerCardFixture } from "./fixtures";

/**
 * Sample Manager Card data for development and the browser tests, selected by `?mc=<fixture>`
 * (Appendix B of the plan). Nothing here reaches production: `src/services/manager-card.ts`
 * imports this module only behind `import.meta.env.DEV`, and the fixture gate proves it.
 *
 * The one piece of state is the set of acknowledged moments per fixture, so a card read after an
 * acknowledgement no longer lists them, as the real function would answer. It lives in memory: a
 * reload starts the fixture again.
 */

/** A stable index into the sample members for a team id the fixtures do not know. */
function sampleIndex(teamId: string): number {
  let hash = 0;
  for (const ch of teamId) hash = (hash * 31 + ch.charCodeAt(0)) % 100_003;
  return hash % SAMPLE_MEMBERS.length;
}

export class MockManagerCardRepository implements ManagerCardRepository {
  private readonly acknowledged = new Map<string, Set<string>>();

  /** `pick` is how the repository learns which fixture is on: the page's `?mc=` by default. */
  constructor(private readonly pick: () => string | null = currentFixtureId) {}

  private fixture(): ManagerCardFixture {
    return fixtureById(this.pick());
  }

  private pending(fixture: ManagerCardFixture): MyCardDto | null {
    const card = fixture.card;
    if (!card) return null;
    const done = this.acknowledged.get(fixture.id);
    if (!done || done.size === 0) return card;
    return { ...card, moments: card.moments.filter((moment) => !done.has(moment.key)) };
  }

  private guard(fixture: ManagerCardFixture): { available: false } | null {
    if (fixture.behaviour === "offline") {
      throw new ManagerCardError("network", "The network request failed.");
    }
    return fixture.behaviour === "unavailable" ? { available: false } : null;
  }

  async status(): Promise<ManagerCardStatus> {
    return this.fixture().status;
  }

  async myCard(): Promise<MyCardResponse> {
    const fixture = this.fixture();
    const off = this.guard(fixture);
    if (off) return off;
    return { available: true, card: this.pending(fixture) };
  }

  async cards(teamIds: readonly string[], _context?: RepositoryContext): Promise<CardsResponse> {
    const fixture = this.fixture();
    const off = this.guard(fixture);
    if (off) return off;
    const own = fixture.card;
    const known = new Map<string, MemberCardDto>();
    for (const member of fixture.league?.members ?? []) known.set(member.teamId, member);
    if (own) known.set(own.teamId, asMember(own));
    const cards: MemberCardDto[] = [];
    for (const id of new Set(teamIds)) {
      const exact = known.get(id);
      if (exact) {
        cards.push(exact);
      } else if (id === "me" && own) {
        // The Fantasy mock names the caller's own row "me".
        cards.push({ ...asMember(own), teamId: id });
      } else {
        // Any other id (the Fantasy mock's "m1", "m2"): a sample member under that id.
        cards.push({ ...SAMPLE_MEMBERS[sampleIndex(id)]!, teamId: id });
      }
    }
    return { available: true, cards };
  }

  async myHistory(query: {
    seasonId: string | null;
    beforeSeq: number | null;
    limit: number;
  }): Promise<HistoryResponse> {
    const fixture = this.fixture();
    const off = this.guard(fixture);
    if (off) return off;
    const seasonId = query.seasonId ?? fixture.card?.season.id ?? null;
    const rows = fixture.history
      .filter((row) => seasonId === null || row.seasonId === seasonId)
      .filter((row) => query.beforeSeq === null || row.gameweekSeq < query.beforeSeq)
      .sort((a, b) => b.gameweekSeq - a.gameweekSeq);
    const limit = Math.max(1, Math.min(40, query.limit));
    const items = rows.slice(0, limit);
    const nextBeforeSeq =
      rows.length > items.length ? (items[items.length - 1]?.gameweekSeq ?? null) : null;
    return { available: true, items, nextBeforeSeq };
  }

  async ackMoments(keys: readonly string[]): Promise<AckResponse> {
    const fixture = this.fixture();
    this.guard(fixture);
    const pending = new Set((this.pending(fixture)?.moments ?? []).map((moment) => moment.key));
    const done = this.acknowledged.get(fixture.id) ?? new Set<string>();
    const acknowledged: string[] = [];
    const ignored: string[] = [];
    for (const key of new Set(keys)) {
      if (pending.has(key)) {
        done.add(key);
        acknowledged.push(key);
      } else {
        ignored.push(key);
      }
    }
    this.acknowledged.set(fixture.id, done);
    return { acknowledged, ignored };
  }
}
