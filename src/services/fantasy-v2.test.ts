import { describe, expect, it } from "bun:test";
import { selectFantasyDataMode } from "./fantasy-v2";

describe("Fantasy V2 data mode", () => {
  it("fails closed when production is not explicitly cloud-authoritative", () => {
    expect(() => selectFantasyDataMode(undefined, true)).toThrow("VITE_FANTASY_DATA_MODE=supabase");
    expect(() => selectFantasyDataMode("mock", true)).toThrow(
      "VITE_FANTASY_DATA_MODE=supabase",
    );
  });
  it("allows deterministic mock mode outside production", () => {
    expect(selectFantasyDataMode(undefined, false)).toBe("mock");
    expect(selectFantasyDataMode("supabase", true)).toBe("supabase");
  });
});
