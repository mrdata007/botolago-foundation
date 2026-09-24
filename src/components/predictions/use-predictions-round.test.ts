import { describe, expect, test } from "bun:test";

import type { PredictionsRoundDto } from "@/backend/predictions/contracts";
import { seedUpdatedAt } from "./use-predictions-round";

const closed = (mode: "off" | "testers"): PredictionsRoundDto => ({
  schemaVersion: 1,
  mode,
  allowed: false,
  serverTime: "2026-09-24T20:00:00.000Z",
});

describe("seedUpdatedAt: the journée the server rendered, in the browser", () => {
  test("a testers-only refusal is asked again at once, with the reader's session", () => {
    // The server renders as a visitor; the owner testing in Stage 3 is not one.
    expect(seedUpdatedAt({ data: closed("testers"), updatedAt: 1_000 })).toBe(0);
  });

  test("a game switched off stays off: the answer is everyone's", () => {
    expect(seedUpdatedAt({ data: closed("off"), updatedAt: 1_000 })).toBe(1_000);
  });
});
