import { describe, expect, it } from "bun:test";

import { selectPredictionsDataMode } from "./predictions";

describe("Pronostics data mode", () => {
  it("fails loudly when a production build is not reading the database", () => {
    expect(() => selectPredictionsDataMode(undefined, true)).toThrow(
      "VITE_PREDICTIONS_DATA_MODE=supabase",
    );
    expect(() => selectPredictionsDataMode("mock", true)).toThrow();
    expect(selectPredictionsDataMode("supabase", true)).toBe("supabase");
  });

  it("uses the mock outside production unless told otherwise", () => {
    expect(selectPredictionsDataMode(undefined, false)).toBe("mock");
    expect(selectPredictionsDataMode("supabase", false)).toBe("supabase");
  });

  it("ships the production mode in .env.production and the mock in .env.example", async () => {
    const production = await Bun.file(new URL("../../.env.production", import.meta.url)).text();
    expect(production).toMatch(/^VITE_PREDICTIONS_DATA_MODE=supabase$/m);
    const example = await Bun.file(new URL("../../.env.example", import.meta.url)).text();
    expect(example).toMatch(/^VITE_PREDICTIONS_DATA_MODE=mock$/m);
  });
});
