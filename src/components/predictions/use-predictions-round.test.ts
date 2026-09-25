import { describe, expect, test } from "bun:test";

import type {
  MyPredictionDto,
  PredictionFixtureDto,
  PredictionsRoundDto,
} from "@/backend/predictions/contracts";
import { awaitingScoring, scoringMoved, seedUpdatedAt } from "./use-predictions-round";

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

const fixture = (id: string, flags: { final: boolean; void?: boolean }) =>
  ({ id, final: flags.final, void: flags.void ?? false }) as PredictionFixtureDto;
const saved = (fixtureId: string, resultKind: MyPredictionDto["resultKind"]): MyPredictionDto => ({
  fixtureId,
  home: 1,
  away: 0,
  submittedAt: "2026-09-24T19:00:00.000Z",
  points: resultKind === null ? null : 0,
  resultKind,
});

describe("awaitingScoring: keep asking until a finished match is scored", () => {
  test("a pick on a final match without points waits for the scoring job", () => {
    const mine = new Map([["a", saved("a", null)]]);
    expect(awaitingScoring([fixture("a", { final: true })], mine)).toBe(true);
  });

  test("a scored pick, an unfinished match, a void match or no pick do not", () => {
    expect(
      awaitingScoring([fixture("a", { final: true })], new Map([["a", saved("a", "miss")]])),
    ).toBe(false);
    expect(
      awaitingScoring([fixture("a", { final: false })], new Map([["a", saved("a", null)]])),
    ).toBe(false);
    expect(
      awaitingScoring(
        [fixture("a", { final: true, void: true })],
        new Map([["a", saved("a", null)]]),
      ),
    ).toBe(false);
    expect(awaitingScoring([fixture("a", { final: true })], new Map())).toBe(false);
  });
});

describe("scoringMoved: when a player's points must be read again", () => {
  test("a rise for the same player and journée", () => {
    expect(scoringMoved({ key: "u:14", version: 2 }, { key: "u:14", version: 3 })).toBe(true);
  });

  test("not the first sighting, not an unchanged version, not another journée or player", () => {
    expect(scoringMoved(null, { key: "u:14", version: 3 })).toBe(false);
    expect(scoringMoved({ key: "u:14", version: 3 }, { key: "u:14", version: 3 })).toBe(false);
    expect(scoringMoved({ key: "u:13", version: 2 }, { key: "u:14", version: 5 })).toBe(false);
    expect(scoringMoved({ key: "u:14", version: 2 }, { key: "v:14", version: 5 })).toBe(false);
  });
});
