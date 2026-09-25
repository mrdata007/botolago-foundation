import { describe, expect, test } from "bun:test";

import {
  GuestPredictionStore,
  type GuestPrediction,
  type KeyValueStorage,
} from "@/backend/predictions/guest-store";
import { guestRoundEvents } from "./guest-analytics";

class MemoryStorage implements KeyValueStorage {
  private values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

const SEASON = "00000050-0000-4000-8000-000000000001";
const TEAM = "00000010-0000-4000-8000-000000000001";
const fixture = (n: number) => `00000020-0000-4000-8000-${String(n).padStart(12, "0")}`;

function pick(store: GuestPredictionStore, round: number, n: number): void {
  const prediction: GuestPrediction = {
    fixtureId: fixture(n),
    home: 1,
    away: 0,
    homeTeamId: TEAM,
    awayTeamId: TEAM,
    roundNumber: round,
    kickoffAt: "2026-09-26T19:00:00.000Z",
    savedAt: "2026-09-24T20:00:00.000Z",
  };
  store.upsert(SEASON, prediction);
}

describe("guestRoundEvents: once per journée per phone", () => {
  test("the first pick of a journée starts it; the next picks do not", () => {
    const store = new GuestPredictionStore(new MemoryStorage());
    const open = [fixture(1), fixture(2), fixture(3)];
    pick(store, 14, 1);
    expect(guestRoundEvents(store, SEASON, 14, open)).toEqual(["pronostics_guest_start"]);
    pick(store, 14, 2);
    expect(guestRoundEvents(store, SEASON, 14, open)).toEqual([]);
  });

  test("the pick that fills every open match completes it, once", () => {
    const store = new GuestPredictionStore(new MemoryStorage());
    const open = [fixture(1), fixture(2)];
    pick(store, 14, 1);
    guestRoundEvents(store, SEASON, 14, open);
    pick(store, 14, 2);
    expect(guestRoundEvents(store, SEASON, 14, open)).toEqual(["pronostics_guest_complete"]);
    // Changing a score afterwards is not a second completion.
    pick(store, 14, 2);
    expect(guestRoundEvents(store, SEASON, 14, open)).toEqual([]);
  });

  test("a one-pick journée starts and completes in the same tap", () => {
    const store = new GuestPredictionStore(new MemoryStorage());
    pick(store, 14, 1);
    expect(guestRoundEvents(store, SEASON, 14, [fixture(1)])).toEqual([
      "pronostics_guest_start",
      "pronostics_guest_complete",
    ]);
  });

  test("a phone that played the journée before is returning", () => {
    const store = new GuestPredictionStore(new MemoryStorage());
    pick(store, 13, 1);
    guestRoundEvents(store, SEASON, 13, [fixture(1), fixture(9)]);
    pick(store, 14, 2);
    expect(guestRoundEvents(store, SEASON, 14, [fixture(2), fixture(3)])).toEqual([
      "pronostics_guest_start",
      "pronostics_guest_start_returning",
    ]);
  });

  test("skipping a journée is not returning", () => {
    const store = new GuestPredictionStore(new MemoryStorage());
    pick(store, 12, 1);
    guestRoundEvents(store, SEASON, 12, [fixture(1), fixture(9)]);
    pick(store, 14, 2);
    expect(guestRoundEvents(store, SEASON, 14, [fixture(2), fixture(3)])).toEqual([
      "pronostics_guest_start",
    ]);
  });

  test("the memory survives a reload: a new store on the same storage", () => {
    const storage = new MemoryStorage();
    const first = new GuestPredictionStore(storage);
    pick(first, 14, 1);
    guestRoundEvents(first, SEASON, 14, [fixture(1), fixture(2)]);
    const again = new GuestPredictionStore(storage);
    pick(again, 14, 2);
    expect(guestRoundEvents(again, SEASON, 14, [fixture(1), fixture(2)])).toEqual([
      "pronostics_guest_complete",
    ]);
  });
});
