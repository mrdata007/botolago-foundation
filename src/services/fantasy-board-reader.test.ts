import { describe, expect, it } from "bun:test";

import type { LeagueStanding } from "@/types/fantasy";
import {
  BOARD_BLOCK_SIZE,
  BOARD_TTL_MS,
  BoardReader,
  SEARCH_SCAN_ROWS,
  type BoardBlock,
  type BoardCursor,
} from "./fantasy-board-reader";

/**
 * FANT-05 — the board reader over a stand-in for `api.fantasy_overall_standings`:
 * a keyset cursor on the STORED rank and team id, at most 100 rows a read, the
 * board's real total, and a shown rank that has the hidden accounts above it
 * taken out (migration 20261011160000).
 */

const teamId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function fakeServer(size: number, hiddenStoredRanks: ReadonlySet<number> = new Set()) {
  const stored: Array<{ storedRank: number; shown: number; row: LeagueStanding }> = [];
  let hiddenAhead = 0;
  for (let storedRank = 1; storedRank <= size + hiddenStoredRanks.size; storedRank += 1) {
    if (hiddenStoredRanks.has(storedRank)) {
      hiddenAhead += 1;
      continue;
    }
    const shown = storedRank - hiddenAhead;
    stored.push({
      storedRank,
      shown,
      row: {
        managerId: teamId(storedRank),
        managerName: `manager-${shown}`,
        teamName: `team-${shown}`,
        rank: shown,
        previousRank: null,
        gameweekScore: 0,
        totalScore: 100_000 - shown,
      },
    });
  }
  const calls: Array<{ cursor: BoardCursor | null; limit: number }> = [];
  const fetch = async (cursor: BoardCursor | null, limit: number): Promise<BoardBlock> => {
    calls.push({ cursor, limit });
    if (limit < 1 || limit > 100) throw new Error("validation_failed");
    const after = stored.filter(
      (entry) =>
        !cursor ||
        entry.storedRank > cursor.rank ||
        (entry.storedRank === cursor.rank && teamId(entry.storedRank) > cursor.teamId),
    );
    const page = after.slice(0, limit);
    const last = page[page.length - 1];
    return {
      rows: page.map((entry) => entry.row),
      nextCursor:
        last && after.length > page.length
          ? { rank: last.storedRank, teamId: teamId(last.storedRank) }
          : null,
      total: stored.length,
      myRank: stored[1]?.row ?? null,
    };
  };
  return { fetch, calls, stored };
}

describe("BoardReader", () => {
  it("reaches the 2,001st manager of a 2,500-manager board by paging, with the real total", async () => {
    const server = fakeServer(2_500);
    const reader = new BoardReader(server.fetch);

    // 25 a page: page 81 starts at rank 2,001 (the old walk stopped at 2,000).
    const read = await reader.page(81, 25);

    expect(read.total).toBe(2_500);
    expect(read.rows[0]?.rank).toBe(2_001);
    expect(read.rows).toHaveLength(25);
    expect(read.rows.at(-1)?.rank).toBe(2_025);
  });

  it("reaches the last manager of a 10,000-manager board in a handful of reads, not 100", async () => {
    const server = fakeServer(10_000);
    const reader = new BoardReader(server.fetch);

    const read = await reader.page(400, 25);

    expect(read.rows.map((row) => row.rank)[0]).toBe(9_976);
    expect(read.rows.at(-1)?.rank).toBe(10_000);
    expect(read.total).toBe(10_000);
    expect(server.calls.length).toBeLessThanOrEqual(2);
  });

  it("finds the right block when accounts hidden from the board sit above it", async () => {
    // Stored ranks 3, 4 and 90 are hidden: shown ranks run 1, 2, 3 ... with no gap.
    const server = fakeServer(1_000, new Set([3, 4, 90]));
    const reader = new BoardReader(server.fetch);

    const read = await reader.page(21, 25); // ranks 501 to 525

    expect(read.rows.map((row) => row.rank)).toEqual(Array.from({ length: 25 }, (_, i) => 501 + i));
    expect(read.total).toBe(1_000);
  });

  it("does not read the board again to turn a page or step back", async () => {
    const server = fakeServer(1_000);
    const reader = new BoardReader(server.fetch);

    await reader.page(1, 25);
    const afterFirst = server.calls.length;
    await reader.page(2, 25);
    await reader.page(3, 25);
    await reader.page(4, 25);
    await reader.page(2, 25);
    await reader.page(1, 25);

    expect(afterFirst).toBe(1);
    // Pages 1 to 4 are all inside the first block of 100.
    expect(server.calls).toHaveLength(1);

    // Page 5 is the next block: exactly one more read, from the position the first gave.
    await reader.page(5, 25);
    expect(server.calls).toHaveLength(2);
    expect(server.calls[1]?.cursor).toEqual({ rank: 100, teamId: teamId(100) });
  });

  it("never reads more than one block per page turn on a long walk", async () => {
    const server = fakeServer(1_000);
    const reader = new BoardReader(server.fetch);
    for (let page = 1; page <= 40; page += 1) {
      const before = server.calls.length;
      const read = await reader.page(page, 25);
      expect(read.rows[0]?.rank).toBe((page - 1) * 25 + 1);
      expect(server.calls.length - before).toBeLessThanOrEqual(1);
    }
    expect(server.calls).toHaveLength(10);
  });

  it("reads a block again only after it has gone stale", async () => {
    const server = fakeServer(300);
    let clock = 1_000;
    const reader = new BoardReader(server.fetch, () => clock);

    await reader.page(1, 25);
    clock += BOARD_TTL_MS - 1;
    await reader.page(2, 25);
    expect(server.calls).toHaveLength(1);

    clock += 2;
    await reader.page(2, 25);
    expect(server.calls).toHaveLength(2);
  });

  it("shares one read between two callers that ask for the same block together", async () => {
    const server = fakeServer(300);
    const reader = new BoardReader(server.fetch);

    await Promise.all([reader.page(1, 25), reader.page(2, 25), reader.scan(100)]);

    expect(server.calls).toHaveLength(1);
  });

  it("treats a page past the end as the last page", async () => {
    const server = fakeServer(130);
    const reader = new BoardReader(server.fetch);

    const read = await reader.page(99, 25);

    expect(read.total).toBe(130);
    expect(read.rows.map((row) => row.rank)).toEqual([126, 127, 128, 129, 130]);
  });

  it("answers an empty board with no rows and a total of zero", async () => {
    const reader = new BoardReader(fakeServer(0).fetch);
    expect(await reader.page(1, 25)).toEqual({ rows: [], total: 0, myRank: null });
  });

  it("serves a page that spans two blocks", async () => {
    const server = fakeServer(500);
    const reader = new BoardReader(server.fetch);

    const read = await reader.page(2, 80); // ranks 81 to 160

    expect(read.rows.map((row) => row.rank)).toEqual(Array.from({ length: 80 }, (_, i) => 81 + i));
    expect(server.calls).toHaveLength(2);
  });

  it("reports the signed-in manager's own standing from the server, wherever the page is", async () => {
    const server = fakeServer(3_000);
    const reader = new BoardReader(server.fetch);
    const read = await reader.page(100, 25);
    expect(read.myRank?.rank).toBe(2);
    expect(reader.myRank?.rank).toBe(2);
  });

  describe("scan (search)", () => {
    it("scans a small board whole, once", async () => {
      const server = fakeServer(250);
      const reader = new BoardReader(server.fetch);

      const first = await reader.scan(SEARCH_SCAN_ROWS);
      const second = await reader.scan(SEARCH_SCAN_ROWS);

      expect(first.rows).toHaveLength(250);
      expect(first.complete).toBe(true);
      expect(second.rows).toHaveLength(250);
      expect(server.calls).toHaveLength(3);
    });

    it("says it stopped short when the board is larger than the scan", async () => {
      const server = fakeServer(2_500);
      const reader = new BoardReader(server.fetch);

      const scan = await reader.scan(SEARCH_SCAN_ROWS);

      expect(scan.rows).toHaveLength(SEARCH_SCAN_ROWS);
      expect(scan.total).toBe(2_500);
      expect(scan.complete).toBe(false);
      expect(server.calls).toHaveLength(SEARCH_SCAN_ROWS / BOARD_BLOCK_SIZE);
    });

    it("leaves paging cheap after a scan", async () => {
      const server = fakeServer(2_500);
      const reader = new BoardReader(server.fetch);
      await reader.scan(SEARCH_SCAN_ROWS);
      const before = server.calls.length;

      await reader.page(3, 25);
      await reader.page(80, 25); // inside the scanned rows, still cached

      expect(server.calls.length).toBe(before);
    });
  });
});
