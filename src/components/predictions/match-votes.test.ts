import { describe, expect, test } from "bun:test";

import type { OpenMatchVotesDto } from "@/backend/predictions/contracts";
import {
  formatShare,
  formatVoteTotal,
  questionView,
  sharesVisible,
  voteCardWorthShowing,
  votePercentages,
  withMyVote,
} from "./match-votes";

const votes: OpenMatchVotesDto = {
  schemaVersion: 1,
  allowed: true,
  serverTime: "2026-09-25T15:00:00.000Z",
  fixtureId: "00000020-0000-4000-8000-000000000001",
  covered: true,
  open: true,
  questions: [
    { question: "winner", counts: { home: 5, draw: 2, away: 3 }, mine: null },
    { question: "both_score", counts: { yes: 1, no: 0 }, mine: "yes" },
    { question: "first_goal", counts: { home: 0, none: 0, away: 0 }, mine: null },
  ],
};

describe("votePercentages", () => {
  test("whole numbers that always add up to 100", () => {
    expect(votePercentages([1, 1, 1])).toEqual([34, 33, 33]);
    expect(votePercentages([2, 1])).toEqual([67, 33]);
    expect(votePercentages([5, 2, 3])).toEqual([50, 20, 30]);
    for (const counts of [
      [7, 11, 13],
      [1, 0, 2],
      [999, 1, 1],
    ])
      expect(votePercentages(counts).reduce((a, b) => a + b, 0)).toBe(100);
  });

  test("all zero when nobody has voted", () => {
    expect(votePercentages([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("questionView", () => {
  test("the database's totals, in display order, and the player's own choice", () => {
    const view = questionView(votes.questions[1]!);
    expect(view.options.map((option) => [option.choice, option.percent, option.mine])).toEqual([
      ["yes", 100, true],
      ["no", 0, false],
    ]);
    expect(view.mine).toBe("yes");
    expect(view.total).toBe(1);
  });

  test("a visitor's vote on the phone is added to the shares they see", () => {
    const view = questionView(votes.questions[0]!, "away");
    expect(view.options.map((option) => option.count)).toEqual([5, 2, 4]);
    expect(view.mine).toBe("away");
    expect(view.total).toBe(11);
  });

  test("a vote the database already has is not counted twice", () => {
    const view = questionView(votes.questions[1]!, "no");
    expect(view.options.map((option) => option.count)).toEqual([1, 0]);
    expect(view.mine).toBe("yes");
  });
});

describe("withMyVote", () => {
  test("a first vote adds one to the chosen answer", () => {
    const next = withMyVote(votes, "winner", "draw");
    expect(next.questions[0]).toEqual({
      question: "winner",
      counts: { home: 5, draw: 3, away: 3 },
      mine: "draw",
    });
  });

  test("a changed vote moves from the old answer to the new one", () => {
    const next = withMyVote(votes, "both_score", "no");
    expect(next.questions[1]).toEqual({
      question: "both_score",
      counts: { yes: 0, no: 1 },
      mine: "no",
    });
    expect(next.questions[0]).toBe(votes.questions[0]);
  });
});

describe("formatShare", () => {
  test("French puts a space before the sign", () => {
    expect(formatShare(56, "fr").replace(/\s/g, " ")).toBe("56 %");
  });
  test("Arabic keeps the number whole", () => {
    expect(formatShare(56, "ar")).toContain("56");
  });
});

describe("formatVoteTotal", () => {
  test("short, as Sofascore writes it: whole below a thousand, then k and M", () => {
    const fr = (n: number) => formatVoteTotal(n, "fr").replace(/\s/g, " ");
    expect([0, 167, 999].map(fr)).toEqual(["0", "167", "999"]);
    expect([6_900, 8_700, 55_000, 1_234_567].map(fr)).toEqual(["6,9 k", "8,7 k", "55 k", "1,2 M"]);
  });
  test("Arabic spells the thousands out", () => {
    expect(formatVoteTotal(6_900, "ar")).toContain("ألف");
    expect(formatVoteTotal(167, "ar")).toContain("167");
  });
});

describe("sharesVisible", () => {
  test("hides shares until a question has 20 votes", () => {
    expect(sharesVisible(0)).toBe(false);
    expect(sharesVisible(19)).toBe(false);
    expect(sharesVisible(20)).toBe(true);
  });
});

describe("voteCardWorthShowing", () => {
  const view = (counts: { home: number; draw: number; away: number }, mine: "home" | null) =>
    questionView({ question: "winner", counts, mine });

  test("an open poll is always shown, even with no votes", () => {
    expect(voteCardWorthShowing(view({ home: 0, draw: 0, away: 0 }, null), true)).toBe(true);
  });

  test("a closed poll with too few votes and no answer of the player's is dropped", () => {
    expect(voteCardWorthShowing(view({ home: 5, draw: 2, away: 3 }, null), false)).toBe(false);
    expect(voteCardWorthShowing(view({ home: 0, draw: 0, away: 0 }, null), false)).toBe(false);
  });

  test("a closed poll with enough votes for shares is kept", () => {
    expect(voteCardWorthShowing(view({ home: 10, draw: 5, away: 5 }, null), false)).toBe(true);
  });

  test("a closed poll the player answered is kept, however few votes it has", () => {
    expect(voteCardWorthShowing(view({ home: 1, draw: 0, away: 0 }, "home"), false)).toBe(true);
  });
});
