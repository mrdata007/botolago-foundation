// FANT-05 — reading the season board (or one round's board) a page at a time.
//
// `api.fantasy_overall_standings` pages by keyset: it takes a position
// (`p_after_rank`, `p_after_team_id`), returns at most 100 rows, the board's
// real `total`, the next position when a row follows, and the caller's own
// standing (`myRank`) whatever page was read. It has no offset and no search.
//
// The route used to read every page of the board (at most 20 of 100, so 2,000
// managers, silently) for each page turn, search keystroke and 60-second
// refresh, and then paged and searched that copy in memory. This reader keeps
// the same server order and ranks (it sorts, ranks and re-numbers nothing) but
// reads only the blocks of 100 a page needs, remembers each block and the
// position where the next one starts for a short while, and so:
//
//   * turning a page reads nothing, or one block when the page crosses into
//     one not yet read;
//   * any rank is reachable: a block far from the ones known is found with one
//     position the browser builds from the rank asked for (see `seek`), then
//     checked against the ranks the server returned;
//   * the total is the server's, not the number of rows that were loaded.
//
// Two facts about the server's ranks make a far jump less than exact, and the
// reader is written around both:
//
//   * accounts hidden from the public board are subtracted from the rank shown
//     (shown = stored rank - hidden above), while the position stays on the
//     stored rank;
//   * stored ranks are unique but NOT always gapless: deleting an account
//     removes its ranking row without renumbering the rest, and the gap can last
//     until the next gameweek is ranked. Shown ranks then skip a number.
//
// A block reached by walking from the top, each from the position the one before
// returned, is exact whatever the ranks look like. A block reached by a jump
// (`seek`) is exact only while the ranks have no gaps, which is checked on every
// read (`findsGap`): the moment a read shows one, every jumped block and
// position is dropped and the reader only walks. Past the longest walk it
// allows, it shows the rows nearest the rank asked for (`nearest`) rather than
// failing; the ranks printed are always the server's.
//
// What it does not do is search: the server cannot, so a search scans the
// first `SEARCH_SCAN_ROWS` rows of the board (read once, then cached) and says
// so when the board is larger (see `scan`).

import type { LeagueStanding } from "@/types/fantasy";

/** The most rows one read of the board may ask for (the RPC's own limit). */
export const BOARD_BLOCK_SIZE = 100;
/** How long a block, and the position it started from, are trusted. */
export const BOARD_TTL_MS = 30_000;
/** How many rows of the board a search looks through. */
export const SEARCH_SCAN_ROWS = 2_000;

/** More blocks than this between the nearest known one and the wanted one: seek, do not walk. */
const WALK_MAX_BLOCKS = 3;
/** How many times a built position may be corrected against the ranks the server returned. */
const SEEK_TRIES = 16;
/** The longest walk a failed seek falls back to (4,000 rows). */
const FALLBACK_WALK_BLOCKS = 40;
/** Sorts after every team id, so a position built from a rank alone skips that whole rank. */
export const BOARD_AFTER_ANY_TEAM = "ffffffff-ffff-ffff-ffff-ffffffffffff";
/** Blocks and positions kept per board. */
const KEEP_ENTRIES = 64;

export interface BoardCursor {
  readonly rank: number;
  readonly teamId: string;
}

export interface BoardBlock {
  /** The rows exactly as the server ordered, ranked and named them. */
  readonly rows: LeagueStanding[];
  /** Where the next block starts; null on the last block. */
  readonly nextCursor: BoardCursor | null;
  /** The board's real size, as the server counts it. */
  readonly total: number;
  /** The caller's own standing, from the server; null when they are not ranked. */
  readonly myRank: LeagueStanding | null;
}

export type BoardFetch = (cursor: BoardCursor | null, limit: number) => Promise<BoardBlock>;

export interface BoardRows {
  readonly rows: LeagueStanding[];
  readonly total: number;
  readonly myRank: LeagueStanding | null;
}

export interface BoardScan {
  readonly rows: LeagueStanding[];
  readonly total: number;
  /** False when the board has rows beyond the ones scanned. */
  readonly complete: boolean;
  readonly myRank: LeagueStanding | null;
}

interface Held<T> {
  readonly at: number;
  readonly value: T;
  /** Reached by walking from the top: exact whatever the ranks look like (see the header). */
  readonly exact: boolean;
}

/** Readers kept per account, season and board; see `forgetBoardReaders`. */
export const boardReaders = new Map<string, BoardReader>();

/** Drops every held board read: an account switch, a sign-out, a write, and tests. */
export function forgetBoardReaders(): void {
  boardReaders.clear();
}

export class BoardReader {
  private readonly blocks = new Map<number, Held<BoardBlock>>();
  /** Where block N starts (block 0 starts at the top: null). */
  private readonly starts = new Map<number, Held<BoardCursor | null>>();
  private readonly inflight = new Map<number, Promise<BoardBlock>>();
  private mine: LeagueStanding | null = null;
  /** True once a read has shown a hole in the ranks: from then on the reader only walks. */
  private gap = false;

  constructor(
    private readonly fetchBlock: BoardFetch,
    private readonly now: () => number = Date.now,
  ) {
    this.starts.set(0, { at: Number.POSITIVE_INFINITY, value: null, exact: true });
  }

  /** The caller's own standing from the most recent read; null when they are not ranked. */
  get myRank(): LeagueStanding | null {
    return this.mine;
  }

  /** The first rows of the board, when the first block is still held; otherwise none. */
  top(count: number): LeagueStanding[] {
    return this.held(this.blocks, 0)?.rows.slice(0, count) ?? [];
  }

  /** One block of 100 rows (the last one holds the remainder; a block past the end is empty). */
  block(index: number): Promise<BoardBlock> {
    const held = this.held(this.blocks, index);
    if (held) return Promise.resolve(held);
    const pending = this.inflight.get(index);
    if (pending) return pending;
    const run = this.load(index).finally(() => this.inflight.delete(index));
    this.inflight.set(index, run);
    return run;
  }

  /** Rows `(page - 1) * pageSize` onward, in the server's order. `page` is 1-based. */
  async page(page: number, pageSize: number): Promise<BoardRows> {
    const wanted = Math.max(1, Math.floor(page) || 1);
    const read = await this.rowsOf(wanted, pageSize);
    const pageCount = Math.max(1, Math.ceil(read.total / pageSize));
    // A page past the end of the board is the last page, as it always was.
    return wanted > pageCount ? this.rowsOf(pageCount, pageSize) : read;
  }

  /**
   * The first `maxRows` rows of the board (blocks read one after the other, once:
   * a later scan inside the same minute reads nothing). `complete` is false when
   * the board goes on past them.
   */
  async scan(maxRows: number): Promise<BoardScan> {
    const rows: LeagueStanding[] = [];
    let total = 0;
    const blocks = Math.ceil(maxRows / BOARD_BLOCK_SIZE);
    for (let index = 0; index < blocks; index += 1) {
      const block = await this.block(index);
      rows.push(...block.rows);
      total = block.total;
      if (!block.nextCursor) return { rows, total, complete: true, myRank: this.mine };
    }
    return { rows, total, complete: false, myRank: this.mine };
  }

  private async rowsOf(page: number, pageSize: number): Promise<BoardRows> {
    const start = (page - 1) * pageSize;
    const first = Math.floor(start / BOARD_BLOCK_SIZE);
    const last = Math.floor((start + pageSize - 1) / BOARD_BLOCK_SIZE);
    const rows: LeagueStanding[] = [];
    let total = 0;
    for (let index = first; index <= last; index += 1) {
      const block = await this.block(index);
      const from = Math.max(0, start - index * BOARD_BLOCK_SIZE);
      rows.push(...block.rows.slice(from, from + pageSize - rows.length));
      total = block.total;
      if (!block.nextCursor) break;
    }
    return { rows, total, myRank: this.mine };
  }

  private async load(index: number): Promise<BoardBlock> {
    const start = this.startOf(index);
    if (start !== undefined) return this.read(index, start.value, start.exact);
    if (index - this.nearestStart(index) > WALK_MAX_BLOCKS && !this.gap) {
      const sought = await this.seek(index);
      if (sought) return sought;
    }
    return this.walk(this.nearestStart(index), index, FALLBACK_WALK_BLOCKS);
  }

  /**
   * Reads the blocks from `from` up to `index`, each from the position the one
   * before gave. A walk longer than `limit` blocks is not made: the rows nearest
   * the rank asked for are shown instead.
   */
  private async walk(from: number, index: number, limit = Infinity): Promise<BoardBlock> {
    if (index - from > limit) return this.nearest(index);
    for (let step = from; step < index; step += 1) {
      const block = await this.block(step);
      // The board ended before the block asked for: it is empty, not an error.
      if (!block.nextCursor) return this.remember(index, emptyBlock(block), true);
    }
    let start = this.startOf(index);
    if (start === undefined) {
      // The position expired between the two reads above: read the block before it again.
      this.blocks.delete(index - 1);
      await this.block(index - 1);
      start = this.startOf(index);
    }
    return start === undefined ? this.nearest(index) : this.read(index, start.value, start.exact);
  }

  /**
   * One read at a position built from the rank wanted: the rows after rank
   * `index * 100`. That position is exact only if the ranks have no holes and
   * no accounts hidden from the public board sit above it; hidden accounts make
   * the server's shown ranks lower than the ranks its position uses. The first
   * row's shown rank says by how much (it can never be ahead of the rank wanted
   * while the ranks have no holes), the position is moved forward by that
   * amount, and the block is accepted only when its first row is the rank
   * wanted. Several hidden accounts in a row cost one more read each time the
   * correction crosses them. Null when it cannot be made to agree, or when a
   * read shows a hole in the ranks (a first rank AHEAD of the one wanted), so the
   * caller walks instead.
   */
  private async seek(index: number): Promise<BoardBlock | null> {
    const wanted = index * BOARD_BLOCK_SIZE + 1;
    let after = index * BOARD_BLOCK_SIZE;
    for (let attempt = 0; attempt < SEEK_TRIES; attempt += 1) {
      const cursor: BoardCursor = { rank: after, teamId: BOARD_AFTER_ANY_TEAM };
      const block = await this.fetchBlock(cursor, BOARD_BLOCK_SIZE);
      this.noteMine(block);
      if (this.findsGap(index, block, false)) {
        this.markGap();
        return null;
      }
      const first = block.rows[0];
      // Nothing after that rank: the board ends before this block.
      if (!first) return this.remember(index, block, false);
      const missing = wanted - first.rank;
      if (missing === 0) {
        this.starts.set(index, { at: this.now(), value: cursor, exact: false });
        return this.remember(index, block, false);
      }
      if (missing < 0) {
        this.markGap();
        return null;
      }
      after += missing;
    }
    return null;
  }

  /**
   * The rows nearest the rank asked for, from one read, when the exact block
   * cannot be reached within the walk allowed. Its first rank may be a little
   * off the page number's; the ranks shown are the server's. Nothing is
   * remembered as a position for the block itself, only for the one after it.
   */
  private async nearest(index: number): Promise<BoardBlock> {
    const cursor: BoardCursor = { rank: index * BOARD_BLOCK_SIZE, teamId: BOARD_AFTER_ANY_TEAM };
    const block = await this.fetchBlock(cursor, BOARD_BLOCK_SIZE);
    this.noteMine(block);
    return this.remember(index, block, false);
  }

  private async read(
    index: number,
    start: BoardCursor | null,
    exact: boolean,
  ): Promise<BoardBlock> {
    const block = await this.fetchBlock(start, BOARD_BLOCK_SIZE);
    this.noteMine(block);
    if (this.findsGap(index, block, exact)) this.markGap();
    return this.remember(index, block, exact);
  }

  private remember(index: number, block: BoardBlock, exact: boolean): BoardBlock {
    const at = this.now();
    this.blocks.set(index, { at, value: block, exact });
    // The next block starts after this block's last STORED rank. Ranks are unique, so the
    // position is the same at read time as (rank, team id) and, unlike it, still exact if the
    // board was re-ranked since: that pair would also return the team now holding that rank.
    if (block.nextCursor) {
      const value = { rank: block.nextCursor.rank, teamId: BOARD_AFTER_ANY_TEAM };
      this.starts.set(index + 1, { at, value, exact });
    }
    this.prune(this.blocks);
    this.prune(this.starts);
    return block;
  }

  /**
   * Whether a read shows a hole in the ranks. Shown ranks are gapless unless an
   * account was deleted without the board being ranked again, so: a block whose
   * rows skip a rank, a last block whose last rank is not the total, or (for a
   * block reached by walking) a first rank that is not the one its place in the
   * board implies.
   */
  private findsGap(index: number, block: BoardBlock, exact: boolean): boolean {
    const first = block.rows[0];
    const last = block.rows[block.rows.length - 1];
    if (!first || !last) return false;
    if (last.rank - first.rank + 1 !== block.rows.length) return true;
    if (!block.nextCursor && last.rank !== block.total) return true;
    return exact && first.rank !== index * BOARD_BLOCK_SIZE + 1;
  }

  /** From now on only walked blocks and positions are used; jumped ones are dropped. */
  private markGap(): void {
    this.gap = true;
    for (const [index, entry] of [...this.blocks]) if (!entry.exact) this.blocks.delete(index);
    for (const [index, entry] of [...this.starts]) if (!entry.exact) this.starts.delete(index);
  }

  /** Where block `index` starts, if known, fresh and, once a hole is known, exact. */
  private startOf(index: number): { value: BoardCursor | null; exact: boolean } | undefined {
    const entry = this.starts.get(index);
    if (!entry) return undefined;
    if (this.now() - entry.at >= BOARD_TTL_MS || (this.gap && !entry.exact)) {
      this.starts.delete(index);
      return undefined;
    }
    return { value: entry.value, exact: entry.exact };
  }

  private noteMine(block: BoardBlock): void {
    this.mine = block.myRank;
  }

  /** The closest block before `index` whose starting position is still trusted. */
  private nearestStart(index: number): number {
    let nearest = 0;
    for (const known of [...this.starts.keys()]) {
      if (known < index && known > nearest && this.startOf(known) !== undefined) nearest = known;
    }
    return nearest;
  }

  private held<T>(map: Map<number, Held<T>>, index: number): T | undefined {
    const entry = map.get(index);
    if (!entry) return undefined;
    if (this.now() - entry.at >= BOARD_TTL_MS) {
      map.delete(index);
      return undefined;
    }
    return entry.value;
  }

  private prune<T>(map: Map<number, Held<T>>): void {
    if (map.size <= KEEP_ENTRIES) return;
    const now = this.now();
    for (const [index, entry] of map) {
      if (index !== 0 && now - entry.at >= BOARD_TTL_MS) map.delete(index);
    }
    // Still too many: drop the oldest first (a Map iterates in insertion order).
    for (const index of map.keys()) {
      if (map.size <= KEEP_ENTRIES) break;
      if (index !== 0) map.delete(index);
    }
  }
}

function emptyBlock(last: BoardBlock): BoardBlock {
  return { rows: [], nextCursor: null, total: last.total, myRank: last.myRank };
}
