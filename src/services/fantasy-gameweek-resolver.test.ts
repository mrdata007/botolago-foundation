import { describe, it, expect } from "bun:test";
import {
  buildGameweekIndex,
  resolveGameweekId,
  resolveGameweek,
} from "./fantasy-gameweek-resolver";
import { FantasyRepoError } from "./fantasy-errors";

const rows = [
  { id: "u1", number: 14, season: "2025-26", status: "open", deadline: "2026-01-01" },
  { id: "u2", number: 15, season: "2025-26", status: "open", deadline: "2026-01-08" },
  { id: "u3", number: 14, season: "2024-25", status: "closed", deadline: "2025-01-01" },
];

describe("gameweek resolver", () => {
  it("indexes by season+number and resolves ids", () => {
    const idx = buildGameweekIndex(rows);
    expect(resolveGameweekId(idx, { number: 14, season: "2025-26" })).toBe("u1");
    expect(resolveGameweekId(idx, { number: 14, season: "2024-25" })).toBe("u3");
    expect(resolveGameweek(idx, { number: 15, season: "2025-26" }).id).toBe("u2");
  });
  it("throws typed FantasyRepoError for missing gameweek", () => {
    const idx = buildGameweekIndex(rows);
    let e: unknown;
    try {
      resolveGameweekId(idx, { number: 99, season: "2025-26" });
    } catch (err) {
      e = err;
    }
    expect(e).toBeInstanceOf(FantasyRepoError);
    expect((e as FantasyRepoError).code).toBe("gameweek_unresolved");
  });
});
