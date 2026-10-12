import { describe, expect, it } from "bun:test";

import { FIXTURES } from "@/backend/manager-card/fixtures";
import { myCardSchema, type MyCardDto, type OvrChangeDto } from "@/backend/manager-card/contracts";

import { COUNT_DELAY_MS, countMs, countValue, pendingOvrChange } from "./ovr-change";

const GW = "3c000004-0000-4000-8000-000000000003";
const rated = FIXTURES.rated.card!;

const change = (over: Partial<OvrChangeDto> = {}): OvrChangeDto => ({
  kind: "ovr_changed",
  key: `ovr_up:${GW}`,
  direction: "up",
  occurredAt: "2026-10-12T20:00:00Z",
  gameweekSeq: 3,
  fromOvr: (rated.ovr ?? 50) - 4,
  toOvr: rated.ovr ?? 50,
  delta: 4,
  fromTier: rated.tier,
  toTier: rated.tier,
  ...over,
});
const withChanges = (changes: OvrChangeDto[] | undefined): MyCardDto => ({
  ...rated,
  ovrChanges: changes,
});

describe("pendingOvrChange", () => {
  it("plays the served change, from the old number to the card's", () => {
    const card = withChanges([change()]);
    expect(pendingOvrChange(card, card.ovr)).toEqual({
      key: `ovr_up:${GW}`,
      from: card.ovr! - 4,
      to: card.ovr!,
      delta: 4,
    });
  });

  it("plays a fall with a negative delta", () => {
    const card = withChanges([
      change({ key: `ovr_down:${GW}`, direction: "down", fromOvr: rated.ovr! + 3, delta: -3 }),
    ]);
    expect(pendingOvrChange(card, card.ovr)?.delta).toBe(-3);
  });

  it("does nothing without a change: an older server (no key), an empty list, or already seen", () => {
    expect(pendingOvrChange(withChanges(undefined), rated.ovr)).toBeNull();
    expect(pendingOvrChange(withChanges([]), rated.ovr)).toBeNull();
  });

  it("ignores a change whose new number is not the number shown (the card moved since, or a new season shows last season's)", () => {
    expect(
      pendingOvrChange(withChanges([change({ toOvr: rated.ovr! - 1 })]), rated.ovr),
    ).toBeNull();
    expect(pendingOvrChange(withChanges([change()]), rated.ovr! - 10)).toBeNull();
    expect(pendingOvrChange(withChanges([change()]), null)).toBeNull();
  });

  it("ignores a change that does not move", () => {
    expect(pendingOvrChange(withChanges([change({ fromOvr: rated.ovr! })]), rated.ovr)).toBeNull();
  });
});

describe("the count", () => {
  it("lasts a little longer for a bigger move, never past 1.4 s, and starts after the entrance", () => {
    expect(countMs(1)).toBe(760);
    expect(countMs(-4)).toBe(940);
    expect(countMs(40)).toBe(1400);
    expect(COUNT_DELAY_MS).toBe(620);
  });

  it("shows whole numbers between the two, never past either", () => {
    expect(countValue(58, 62, 59.4)).toBe(59);
    expect(countValue(58, 62, 61.6)).toBe(62);
    expect(countValue(58, 62, 63)).toBe(62);
    expect(countValue(66, 63, 62.2)).toBe(63);
    expect(countValue(66, 63, 66.4)).toBe(66);
  });
});

describe("the contract", () => {
  it("reads a card with a change, without the key, and with a malformed list as no change", () => {
    expect(myCardSchema.parse(withChanges([change()])).ovrChanges).toHaveLength(1);
    const { ovrChanges: _drop, ...older } = withChanges(undefined);
    expect(myCardSchema.parse(older).ovrChanges).toBeUndefined();
    expect(
      myCardSchema.parse({ ...rated, ovrChanges: [{ kind: "sideways" }] }).ovrChanges,
    ).toBeUndefined();
    const malformed = myCardSchema.safeParse({
      ...rated,
      ovrChanges: [change({ key: "ovr_up:nope" })],
    });
    expect(malformed.success).toBe(true);
    expect(malformed.data?.ovrChanges).toBeUndefined();
  });
});
