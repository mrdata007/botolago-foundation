import { describe, expect, it } from "bun:test";

import type { VersionResponse } from "@/backend/pepites/contracts";

import { nextPollDelay, REVEAL_POLL, secondsUntil } from "./reveal";

const NOW = Date.parse("2026-10-12T18:59:00Z");
const base = {
  available: true as const,
  preview: false,
  version: "a",
  source: "edition" as const,
  nextRevealAt: null,
};
const midJitter = () => 0.5;

describe("the reveal (architecture §7)", () => {
  it("waits for the reveal time in a countdown, then checks every 5 seconds", () => {
    const pointer: VersionResponse = {
      ...base,
      state: "countdown",
      nextRevealAt: "2026-10-12T19:00:00Z",
    };
    expect(nextPollDelay(pointer, NOW, midJitter)).toBe(60_000);
    expect(nextPollDelay(pointer, Date.parse("2026-10-12T19:00:01Z"), midJitter)).toBe(
      REVEAL_POLL.countdownMs,
    );
  });

  it("keeps checking every 30 seconds while delayed, with jitter both ways", () => {
    const pointer: VersionResponse = { ...base, state: "delayed" };
    expect(nextPollDelay(pointer, NOW, midJitter)).toBe(30_000);
    expect(nextPollDelay(pointer, NOW, () => 0)).toBe(24_000);
    expect(nextPollDelay(pointer, NOW, () => 1)).toBe(36_000);
  });

  it("does not poll when nothing is due, or when Pépites is closed", () => {
    expect(nextPollDelay({ ...base, state: "current" }, NOW, midJitter)).toBeNull();
    expect(nextPollDelay({ available: false }, NOW, midJitter)).toBeNull();
    expect(nextPollDelay(undefined, NOW, midJitter)).toBeNull();
  });

  it("counts down in whole seconds and never below zero", () => {
    expect(secondsUntil("2026-10-12T19:00:00Z", NOW)).toBe(60);
    expect(secondsUntil("2026-10-12T18:00:00Z", NOW)).toBe(0);
    expect(secondsUntil(null, NOW)).toBeNull();
  });
});
