import { describe, expect, it } from "bun:test";

import { MockPrizesRepository, MOCK_PRIZE_WINNERS } from "@/backend/prizes/mock-repository";
import { selectPrizesDataMode } from "./prizes";

const context = { actorId: null, requestId: "request" };

describe("prize data mode", () => {
  it("fails loudly when a production build is not reading the database", () => {
    expect(() => selectPrizesDataMode(undefined, true)).toThrow("VITE_PRIZES_DATA_MODE=supabase");
    expect(() => selectPrizesDataMode("mock", true)).toThrow();
    expect(selectPrizesDataMode("supabase", true)).toBe("supabase");
  });

  it("uses the mock outside production unless told otherwise", () => {
    expect(selectPrizesDataMode(undefined, false)).toBe("mock");
    expect(selectPrizesDataMode("supabase", false)).toBe("supabase");
  });

  it("ships the production mode in .env.production", async () => {
    const env = await Bun.file(new URL("../../.env.production", import.meta.url)).text();
    expect(env).toMatch(/^VITE_PRIZES_DATA_MODE=supabase$/m);
  });
});

describe("the mock prize repository", () => {
  it("pages the winners wall with the same cursor contract as the database", async () => {
    const repository = new MockPrizesRepository();
    const first = await repository.listWinners(null, 4, context);
    expect(first.items).toHaveLength(4);
    expect(first.nextCursor).not.toBeNull();
    const second = await repository.listWinners(first.nextCursor, 4, context);
    expect(second.items.map((item) => item.id)).toEqual(
      MOCK_PRIZE_WINNERS.slice(4).map((item) => item.id),
    );
    expect(second.nextCursor).toBeNull();
  });

  it("shows masked usernames only", async () => {
    const page = await new MockPrizesRepository().listWinners(null, 20, context);
    for (const winner of page.items) expect(winner.maskedUsername).toMatch(/^.\*\*\*.?$/);
  });
});
