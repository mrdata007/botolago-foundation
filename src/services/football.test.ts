import { describe, expect, test } from "bun:test";
import { MockFootballRepository } from "@/backend/football/mock-repository";
import { selectFootballDataMode } from "./football";

const context = { actorId: null, requestId: "test" } as const;

describe("Football frontend repository cutover", () => {
  test("fails closed when production mode is not configured", () => {
    expect(() => selectFootballDataMode(undefined, true)).toThrow(
      "VITE_FOOTBALL_DATA_MODE=supabase",
    );
    expect(() => selectFootballDataMode("mock", true)).toThrow(
      "VITE_FOOTBALL_DATA_MODE=supabase",
    );
    expect(selectFootballDataMode(undefined, false)).toBe("mock");
    expect(selectFootballDataMode("supabase", true)).toBe("supabase");
  });

  test("preserves deterministic mock and bilingual DTO contracts", async () => {
    const repository = new MockFootballRepository();
    const french = await repository.getHomeMatches("fr", 3, context);
    const arabic = await repository.getHomeMatches("ar", 3, context);
    expect(french).toHaveLength(3);
    expect(french[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(french[0]?.homeTeam.name).not.toBe(arabic[0]?.homeTeam.name);
    expect(french[0]?.status).toBe("live_second_half");
  });

  test("supports match detail and head-to-head without scanning in route components", async () => {
    const repository = new MockFootballRepository();
    const matches = await repository.getHomeMatches("fr", 3, context);
    const detail = await repository.getMatchDetail(matches[0]!.id, "fr", context);
    const headToHead = await repository.getHeadToHead(detail.id, "fr", 5, context);
    expect(detail.id).toBe(matches[0]!.id);
    expect(Array.isArray(headToHead)).toBe(true);
  });
});
