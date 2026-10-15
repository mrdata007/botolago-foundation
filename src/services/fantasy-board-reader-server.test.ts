import { describe, expect, it } from "bun:test";

import type { LeagueStanding } from "@/types/fantasy";
import {
  BOARD_AFTER_ANY_TEAM,
  BoardReader,
  type BoardBlock,
  type BoardCursor,
} from "./fantasy-board-reader";

/**
 * The board reader against a stand-in that follows the real
 * `api.fantasy_overall_standings` (migration 20261011160000) point for point:
 *
 *   - the position is a keyset on (STORED rank, team id), team ids random uuids;
 *   - stored ranks are unique but NOT always gapless (an account deletion removes
 *     its ranking row without renumbering);
 *   - hidden accounts are left out, and the rank shown is the stored rank minus
 *     the hidden accounts above it;
 *   - `total` counts the visible rows; a page is at most 100 rows;
 *   - the board can be re-ranked between two reads.
 *
 * (The same scenarios were measured by an independent reviewer against the real
 * SQL in a throwaway Postgres 16; no database is used here.)
 */

interface Entry {
  storedRank: number;
  teamId: string;
  hidden: boolean;
}

/** Deterministic "random" uuids: the order of team ids has nothing to do with the order of ranks. */
function uuidFor(n: number): string {
  let h = (n + 1) * 2654435761;
  const hex = (len: number) => {
    let out = "";
    for (let i = 0; i < len; i += 1) {
      h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
      out += (h & 15).toString(16);
    }
    return out;
  };
  return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`;
}

class FakeBoard {
  entries: Entry[] = [];
  reads = 0;

  constructor(opts: { visible: number; hiddenStored?: number[]; deletedStored?: number[] }) {
    const hidden = new Set(opts.hiddenStored ?? []);
    const deleted = new Set(opts.deletedStored ?? []);
    let visible = 0;
    for (let stored = 1; visible < opts.visible || hidden.has(stored); stored += 1) {
      if (deleted.has(stored)) continue;
      const isHidden = hidden.has(stored);
      this.entries.push({ storedRank: stored, teamId: uuidFor(stored), hidden: isHidden });
      if (!isHidden) visible += 1;
    }
  }

  private standing(entry: Entry): LeagueStanding {
    const hiddenAbove = this.entries.filter(
      (other) => other.hidden && other.storedRank < entry.storedRank,
    ).length;
    const shown = entry.storedRank - hiddenAbove;
    return {
      managerId: entry.teamId,
      managerName: `manager-${entry.storedRank}`,
      teamName: `team-${entry.storedRank}`,
      rank: shown,
      previousRank: null,
      gameweekScore: 0,
      totalScore: 1_000_000 - entry.storedRank,
    };
  }

  fetch = async (cursor: BoardCursor | null, limit: number): Promise<BoardBlock> => {
    this.reads += 1;
    if (limit < 1 || limit > 100) throw new Error("validation_failed");
    const visible = this.entries
      .filter((entry) => !entry.hidden)
      .sort((a, b) => a.storedRank - b.storedRank);
    const after = visible.filter(
      (entry) =>
        !cursor ||
        entry.storedRank > cursor.rank ||
        (entry.storedRank === cursor.rank && entry.teamId > cursor.teamId),
    );
    const page = after.slice(0, limit);
    const last = page[page.length - 1];
    return {
      rows: page.map((entry) => this.standing(entry)),
      nextCursor:
        last && after.length > page.length ? { rank: last.storedRank, teamId: last.teamId } : null,
      total: visible.length,
      myRank: null,
    };
  };

  /** Every visible row in server order: the truth a reader is held to. */
  truth(): LeagueStanding[] {
    return this.entries
      .filter((entry) => !entry.hidden)
      .sort((a, b) => a.storedRank - b.storedRank)
      .map((entry) => this.standing(entry));
  }
}

const ids = (rows: LeagueStanding[]) => rows.map((row) => row.managerId);

describe("a re-ranked board between two reads (the position)", () => {
  it("starts the next block at the next rank, not on the team that held the last one", async () => {
    const board = new FakeBoard({ visible: 300 });
    // The team at stored rank 100 sorts BEFORE the team at 101 by id, and they swap places.
    const at100 = board.entries.find((entry) => entry.storedRank === 100)!;
    const at101 = board.entries.find((entry) => entry.storedRank === 101)!;
    at100.teamId = "00000000-0000-4000-8000-000000000001";
    at101.teamId = "ffffffff-ffff-4fff-8fff-fffffffffff0";
    const reader = new BoardReader(board.fetch);

    const page4 = await reader.page(4, 25); // ranks 76 to 100, from block 0
    expect(page4.rows.at(-1)?.rank).toBe(100);

    // Re-rank: the team that was 101st now holds rank 100, the other moves to 101.
    at101.storedRank = 100;
    at100.storedRank = 101;

    const page5 = await reader.page(5, 25); // block 1, from the position block 0 gave
    // (100, id of the old 100th) would also return the team now holding rank 100.
    expect(page5.rows.map((row) => row.rank)).toEqual(
      Array.from({ length: 25 }, (_, i) => 101 + i),
    );
  });

  it("keeps every later block aligned after that re-rank", async () => {
    const board = new FakeBoard({ visible: 400 });
    const reader = new BoardReader(board.fetch);
    await reader.page(4, 25);
    const swap = board.entries.filter((entry) => [100, 101].includes(entry.storedRank));
    swap[0]!.teamId = "00000000-0000-4000-8000-000000000002";
    swap[1]!.teamId = "ffffffff-ffff-4fff-8fff-fffffffffff1";
    [swap[0]!.storedRank, swap[1]!.storedRank] = [swap[1]!.storedRank, swap[0]!.storedRank];

    const pages = [];
    for (const page of [5, 9, 13]) pages.push(await reader.page(page, 25));

    expect(pages.map((read) => read.rows[0]?.rank)).toEqual([101, 201, 301]);
  });
});

describe("accounts hidden from the public board", () => {
  const jump = async (hiddenStored: number[], to: number) => {
    const board = new FakeBoard({ visible: 6_000, hiddenStored });
    const reader = new BoardReader(board.fetch);
    await reader.page(1, 25);
    const read = await reader.page(to, 25);
    return { read, truth: board.truth(), reads: board.reads };
  };

  it("reaches a far page when three hidden accounts in a row sit at a block boundary", async () => {
    // Measured on the real SQL: this threw `fantasy_board_unreachable` on the first version.
    for (let start = 4_490; start <= 4_510; start += 1) {
      const { read, truth } = await jump([start, start + 1, start + 2], 181);
      expect(read.rows.map((row) => row.rank)).toEqual(
        truth.slice(4_500, 4_525).map((row) => row.rank),
      );
      expect(ids(read.rows)).toEqual(ids(truth.slice(4_500, 4_525)));
    }
  });

  it("reaches the last page, and a page past a long run of hidden accounts", async () => {
    const run = Array.from({ length: 12 }, (_, i) => 4_495 + i);
    const last = await jump(run, 240);
    expect(ids(last.read.rows)).toEqual(ids(last.truth.slice(5_975, 6_000)));
    const past = await jump(run, 200);
    expect(ids(past.read.rows)).toEqual(ids(past.truth.slice(4_975, 5_000)));
  });

  it("does not need many reads to get there", async () => {
    const { reads } = await jump([4_500, 4_501, 4_502], 181);
    expect(reads).toBeLessThanOrEqual(8);
  });
});

describe("a hole in the ranks left by a deleted account", () => {
  // 1,201 visible teams, stored rank 50 deleted: stored ranks run 1..49, 51..1202.
  const make = () => new FakeBoard({ visible: 1_201, deletedStored: [50] });
  const pageRows = (truth: LeagueStanding[], page: number) =>
    truth.slice((page - 1) * 25, page * 25);

  it("pages forward exactly", async () => {
    const board = make();
    const reader = new BoardReader(board.fetch);
    const truth = board.truth();
    for (let page = 1; page <= 49; page += 1) {
      expect(ids((await reader.page(page, 25)).rows)).toEqual(ids(pageRows(truth, page)));
    }
  });

  it("jumps from page 1 to the last page and pages backwards with no duplicate and no one lost", async () => {
    const board = make();
    const reader = new BoardReader(board.fetch);
    const truth = board.truth();
    const seen: string[] = [];

    for (const page of [1, 49, 48, 47, 30, 12, 3, 2]) {
      const read = await reader.page(page, 25);
      expect(ids(read.rows)).toEqual(ids(pageRows(truth, page)));
      seen.push(...ids(read.rows));
    }
    // The last manager (1,201st) is reachable and nobody is on two pages.
    expect(seen).toContain(truth[1_200]!.managerId);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("stops jumping once it has seen the hole, and walks instead", async () => {
    const board = make();
    const reader = new BoardReader(board.fetch);
    await reader.page(1, 25); // block 0 holds the hole: its ranks skip 50
    const before = board.reads;
    await reader.page(49, 25);
    // 12 blocks walked, none sought: 11 reads for blocks 1 to 12.
    expect(board.reads - before).toBe(12);
  });

  it("detects the hole from a jump to the last page alone", async () => {
    const board = make();
    const reader = new BoardReader(board.fetch);
    const truth = board.truth();
    // Nothing read before: the last block's last rank (1,201 - ... ) is not the total.
    const read = await reader.page(49, 25);
    expect(ids(read.rows)).toEqual(ids(pageRows(truth, 49)));
    expect(read.rows.at(-1)?.managerId).toBe(truth[1_200]!.managerId);
  });

  it("never throws for a valid rank on a big board with a hole: it shows the nearest rows", async () => {
    const board = new FakeBoard({ visible: 10_000, deletedStored: [50] });
    const reader = new BoardReader(board.fetch);
    await reader.page(1, 25);
    const read = await reader.page(400, 25); // 99 blocks away: past the longest walk
    expect(read.rows.length).toBeGreaterThan(0);
    // The ranks printed are the server's, and close to those the page number implies.
    expect(Math.abs((read.rows[0]?.rank ?? 0) - 9_976)).toBeLessThanOrEqual(50);
  });

  it("does not throw for a jump into the middle of a board whose hole it has not seen", async () => {
    const board = new FakeBoard({ visible: 3_000, deletedStored: [750] });
    const reader = new BoardReader(board.fetch);
    await reader.page(1, 25);
    const read = await reader.page(100, 25);
    expect(read.rows).toHaveLength(25);
  });
});

describe("the position after a block", () => {
  it("is the stored rank with an id that sorts after every team", () => {
    expect(BOARD_AFTER_ANY_TEAM > "fffffffe-ffff-ffff-ffff-ffffffffffff").toBe(true);
    expect(BOARD_AFTER_ANY_TEAM > uuidFor(1)).toBe(true);
  });
});
