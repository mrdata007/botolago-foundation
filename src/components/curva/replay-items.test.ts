import { describe, expect, it } from "bun:test";

import { FIXTURES } from "@/backend/manager-card/fixtures";

import { closedSeasons, deriveReplayItems, stageReplayBeat } from "./replay-items";

describe("the « Revoir » list: only what happened, from what the server stored", () => {
  it("lists the first rating, then the first time at a tier above it", () => {
    const f = FIXTURES.founder;
    const items = deriveReplayItems(f.card!, f.history);
    expect(items.map((i) => i.kind)).toEqual(["first_rating", "tier", "founder"]);
    expect(items[0]).toMatchObject({ kind: "first_rating", gameweekSeq: 7, beat: "first" });
    expect(items[1]).toMatchObject({ kind: "tier", tier: "pro", beat: "tier" });
    expect(items[2]).toMatchObject({ kind: "founder", beat: "founder", row: null, seasonId: null });
  });

  it("lists nothing for a card with no number and no founder mark", () => {
    const f = FIXTURES.forming1;
    expect(deriveReplayItems(f.card!, f.history)).toEqual([]);
  });

  it("never invents a founder item for anyone who is not one", () => {
    const f = FIXTURES.rated;
    expect(deriveReplayItems(f.card!, f.history).some((i) => i.kind === "founder")).toBe(false);
  });

  it("lists each season that has closed, with the cast-off beat", () => {
    const f = FIXTURES.seasonStarted;
    expect(closedSeasons(f.card!).map((s) => s.label)).toEqual(["2026/27"]);
    const items = deriveReplayItems(f.card!, f.history);
    expect(items.at(-1)).toMatchObject({ kind: "season", beat: "castoff" });
  });

  it("reads the season in view, not only the current one", () => {
    const f = FIXTURES.seasonStarted;
    const earlier = f.card!.seasons[1]!.seasonId;
    const items = deriveReplayItems(f.card!, f.history, earlier);
    expect(items[0]).toMatchObject({ kind: "first_rating", gameweekSeq: 3 });
  });

  it("replays the first rating on the stage when there is one, else the making", () => {
    expect(stageReplayBeat(FIXTURES.rated.card!)).toBe("first");
    expect(stageReplayBeat(FIXTURES.forming1.card!)).toBe("make");
  });
});
