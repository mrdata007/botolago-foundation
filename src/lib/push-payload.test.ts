import { describe, expect, test } from "bun:test";

import { pushDeepLink, pushDestination } from "./push-payload";

const MATCH = "e9500000-0000-4000-8000-000000000001";

describe("push alert pages", () => {
  test("a goal, kick-off or result opens the match (Android's data: every value a string)", () => {
    const data = {
      deliveryId: "d1",
      type: "goal",
      target: "match_detail",
      entityId: MATCH,
      threadId: `match_detail:${MATCH}`,
    };
    expect(pushDeepLink(data)).toEqual({ target: "match_detail", entityId: MATCH });
    expect(pushDestination(data, true)).toEqual({
      to: "/matches/$matchId",
      params: { matchId: MATCH },
    });
  });

  test("iPhone's data carries the sender's keys at the top, beside Apple's own aps", () => {
    const data = {
      aps: { alert: { title: "But !", body: "..." }, sound: "default" },
      deliveryId: "d1",
      type: "full_time",
      target: "match_detail",
      entityId: MATCH,
    };
    expect(pushDestination(data, true)).toEqual({
      to: "/matches/$matchId",
      params: { matchId: MATCH },
    });
  });

  test("a Fantasy deadline opens the transfers page, with an empty or missing id", () => {
    expect(pushDestination({ target: "fantasy_transfers", entityId: "" }, true)).toEqual({
      to: "/fantasy/transfers",
    });
    expect(pushDestination({ target: "fantasy_transfers", entityId: null }, true)).toEqual({
      to: "/fantasy/transfers",
    });
    expect(pushDestination({ target: "fantasy_transfers" }, true)).toEqual({
      to: "/fantasy/transfers",
    });
  });

  test("a match page without a valid id, an unknown page and junk open nothing", () => {
    expect(pushDestination({ target: "match_detail", entityId: "" }, true)).toBeNull();
    expect(pushDestination({ target: "match_detail", entityId: "not-an-id" }, true)).toBeNull();
    expect(pushDestination({ target: "fantasy_transfers", entityId: MATCH }, true)).toBeNull();
    expect(pushDestination({ target: "https://evil.example", entityId: "" }, true)).toBeNull();
    expect(pushDestination({ target: "none", entityId: "" }, true)).toBeNull();
    expect(pushDestination(null, true)).toBeNull();
    expect(pushDestination("match_detail", true)).toBeNull();
    expect(pushDestination(undefined, true)).toBeNull();
  });

  test("an article alert opens nothing while News is hidden", () => {
    const data = { target: "article", entityId: MATCH };
    expect(pushDestination(data, true)).toEqual({
      to: "/news/$articleId",
      params: { articleId: MATCH },
    });
    expect(pushDestination(data, false)).toBeNull();
  });
});
