import { describe, expect, it } from "bun:test";

import type { HistoryRowDto } from "@/backend/manager-card/contracts";

import {
  MINUS,
  deltaArrow,
  ratingChange,
  shouldPop,
  signedDelta,
  type RoundMemory,
} from "./rating-change";

const SEASON = "3c000001-0000-4000-8000-000000000001";
const row = (seq: number, ovr: number | null, seasonId = SEASON): HistoryRowDto => ({
  seasonId,
  seasonLabel: "2026/27",
  gameweekSeq: seq,
  ovr,
  tier: null,
  provisional: false,
  gameweeksCounted: seq,
  stats: { cap: null, sel: null, trf: null, con: null },
  calculatedAt: "2026-09-28T10:00:00Z",
});
const input = (rows: HistoryRowDto[], ovr: number | null = 84) => ({
  rows,
  ovr,
  newSeason: false,
  seasonId: SEASON,
});

describe("the rating change", () => {
  it("is the newest number less the one before it, tagged with its round", () => {
    expect(ratingChange(input([row(9, 84), row(8, 81), row(7, 80)]))).toEqual({
      delta: 3,
      round: `${SEASON}:9`,
    });
    expect(ratingChange(input([row(9, 79), row(8, 81)], 79))?.delta).toBe(-2);
  });

  it("does not depend on the order the rows come in", () => {
    expect(ratingChange(input([row(7, 80), row(9, 84), row(8, 81)]))?.delta).toBe(3);
  });

  it("compares with the last rated journée, skipping the ones with no number", () => {
    expect(ratingChange(input([row(9, 84), row(8, null), row(7, 82)]))?.delta).toBe(2);
  });

  it("is absent with no previous rating (the first rating, or only unrated journées before it)", () => {
    expect(ratingChange(input([row(7, 84), row(6, null), row(5, null)]))).toBeNull();
    expect(ratingChange(input([row(7, 84)]))).toBeNull();
    expect(ratingChange(input([]))).toBeNull();
  });

  it("is absent when nothing moved", () => {
    expect(ratingChange(input([row(9, 84), row(8, 84)]))).toBeNull();
  });

  it("is absent when the history is not the number the card shows (it lags, or the card has no number)", () => {
    expect(ratingChange(input([row(9, 83), row(8, 80)], 84))).toBeNull();
    expect(ratingChange(input([row(9, null), row(8, 80)], null))).toBeNull();
    expect(ratingChange(input([row(9, 84), row(8, 80)], null))).toBeNull();
  });

  it("is absent in a new season, which shows last season's number, and ignores other seasons' rows", () => {
    expect(ratingChange({ ...input([row(9, 84), row(8, 80)]), newSeason: true })).toBeNull();
    const other = "3c000001-0000-4000-8000-000000000002";
    expect(ratingChange(input([row(9, 84), row(8, 70, other)]))).toBeNull();
  });
});

describe("the chip's figure", () => {
  it("signs a rise with + and a fall with the true minus sign (U+2212), never a hyphen", () => {
    expect(signedDelta(3)).toBe("+3");
    expect(signedDelta(-2)).toBe(`${MINUS}2`);
    expect(MINUS.codePointAt(0)).toBe(0x2212);
    expect(signedDelta(-2)).not.toContain("-");
  });

  it("has an arrow as well as a colour: up for a rise, down for a fall", () => {
    expect(deltaArrow(3)).toBe("▲");
    expect(deltaArrow(-2)).toBe("▼");
  });
});

function memory(initial: string | null, keeps = true): RoundMemory & { value: string | null } {
  const m = {
    value: initial,
    read: () => m.value,
    write: (value: string) => {
      if (!keeps) return false;
      m.value = value;
      return true;
    },
  };
  return m;
}

describe("the pop, once per new round on a phone", () => {
  it("pops for a round this phone has not seen, and writes it down first", () => {
    const m = memory(null);
    expect(shouldPop("s:9", m)).toBe(true);
    expect(m.value).toBe("s:9");
  });

  it("does not pop the same round again", () => {
    const m = memory("s:9");
    expect(shouldPop("s:9", m)).toBe(false);
  });

  it("pops again for the next round", () => {
    const m = memory("s:9");
    expect(shouldPop("s:10", m)).toBe(true);
    expect(shouldPop("s:10", m)).toBe(false);
  });

  it("shows the chip without the pop where storage cannot remember (never replayed on every visit)", () => {
    expect(shouldPop("s:9", memory(null, false))).toBe(false);
  });
});
