import { describe, expect, it } from "bun:test";

import { derivePremium } from "@/services/use-premium";

import {
  LAUNCH_PRICES,
  MY_PREMIUM_OFF,
  PAYMENT_DETAILS_OFF,
  payCodeSchema,
  paymentDetailsSchema,
  PREMIUM_STATES,
  PREMIUM_STATUS_OFF,
  isMemberState,
  myPremiumSchema,
  premiumPriceSchema,
  premiumStatusSchema,
  premiumStatusWireSchema,
} from "./contracts";
import {
  MockPremiumRepository,
  PLUS_SCENARIOS,
  mockMine,
  scenarioFromSearch,
  MOCK_PAY_CODE,
  MOCK_SEASON_END,
  type PlusScenario,
} from "./mock-repository";

const NOW = new Date("2026-10-13T10:00:00Z");
const context = { actorId: "u1", requestId: "r1" };

describe("contracts", () => {
  it("carry the owner's price: one Saison, 200 MAD, no period, no renewal", () => {
    expect(
      LAUNCH_PRICES.map((p) => [p.code, p.amountMad, p.periodMonths, p.renews, p.validUntil]),
    ).toEqual([["plus_season", 200, null, false, null]]);
    for (const price of LAUNCH_PRICES) expect(premiumPriceSchema.parse(price)).toEqual(price);
  });
  it("convert the server's centimes to dirhams and carry validUntil", () => {
    const wire = {
      enabled: true,
      checkoutEnabled: false,
      prices: [
        {
          code: "plus_season",
          periodMonths: null,
          renews: false,
          priceMinor: 20000,
          currency: "MAD",
          validUntil: "2027-05-31T20:00:00+00:00",
        },
      ],
      savingMinor: null,
      editions: [],
    };
    expect(premiumStatusWireSchema.parse(wire)).toEqual({
      enabled: true,
      checkoutEnabled: false,
      prices: [
        {
          code: "plus_season",
          amountMad: 200,
          periodMonths: null,
          renews: false,
          validUntil: "2027-05-31T20:00:00+00:00",
        },
      ],
    });
    const offWire = { ...PREMIUM_STATUS_OFF, savingMinor: null, editions: [] };
    expect(premiumStatusWireSchema.parse(offWire)).toEqual(PREMIUM_STATUS_OFF);
    const halfDirham = { ...wire, prices: [{ ...wire.prices[0], priceMinor: 20050 }] };
    expect(() => premiumStatusWireSchema.parse(halfDirham)).toThrow();
  });
  it("still parse the old monthly and yearly products, so old data cannot crash", () => {
    const old = {
      enabled: true,
      checkoutEnabled: false,
      prices: [
        { code: "plus_monthly", periodMonths: 1, renews: true, priceMinor: 2000, currency: "MAD" },
        {
          code: "plus_yearly",
          periodMonths: 12,
          renews: false,
          priceMinor: 20000,
          currency: "MAD",
        },
      ],
    };
    const parsed = premiumStatusWireSchema.parse(old);
    expect(parsed.prices.map((p) => [p.code, p.validUntil])).toEqual([
      ["plus_monthly", null],
      ["plus_yearly", null],
    ]);
  });
  it("read the payment details, and « not available » without a WhatsApp number", () => {
    const wire = {
      available: true,
      whatsapp: "+212 6 00 00 00 00",
      bankHolder: "BotolaGO SARL",
      bankName: "Banque exemple",
      rib: "000 000 0000000000000000 00",
      cashplusName: "BotolaGO SARL",
      noteFr: null,
      noteAr: null,
      amountMinor: 20000,
      currency: "MAD",
    };
    expect(paymentDetailsSchema.parse(wire)).toMatchObject({
      available: true,
      whatsapp: "+212 6 00 00 00 00",
      amountMad: 200,
    });
    expect(paymentDetailsSchema.parse({ ...wire, whatsapp: null }).available).toBe(false);
    expect(paymentDetailsSchema.parse({ available: false })).toEqual(PAYMENT_DETAILS_OFF);
  });
  it("read the personal code, or none while the mode is off", () => {
    expect(payCodeSchema.parse({ code: "BG-7K4M9X" })).toEqual({ code: "BG-7K4M9X" });
    expect(payCodeSchema.parse({ available: false })).toEqual({ code: null });
  });
  it("read « switched off » as an answer, not an error", () => {
    expect(premiumStatusSchema.parse(PREMIUM_STATUS_OFF)).toEqual(PREMIUM_STATUS_OFF);
    expect(myPremiumSchema.parse(MY_PREMIUM_OFF)).toEqual(MY_PREMIUM_OFF);
    expect(() => myPremiumSchema.parse({ available: true })).toThrow();
  });
  it("give member features to active, cancelling and grace only", () => {
    const members = PREMIUM_STATES.filter(isMemberState);
    expect(members).toEqual(["active", "cancelling", "grace"]);
  });
});

describe("the mock repository", () => {
  it("answers every scenario in the shape lane B's get_my_premium will", () => {
    for (const scenario of PLUS_SCENARIOS) {
      expect(() => myPremiumSchema.parse(mockMine(scenario, NOW))).not.toThrow();
    }
  });
  it("reads the scenario from ?plus= and ignores anything else", () => {
    expect(scenarioFromSearch("?plus=monthly")).toBe("monthly");
    expect(scenarioFromSearch("?plus=cancelling&x=1")).toBe("cancelling");
    expect(scenarioFromSearch("?plus=free-money")).toBe("none");
    expect(scenarioFromSearch("")).toBe("none");
  });
  it("has an « off » scenario: the status and the reader's answer both say switched off", async () => {
    expect(scenarioFromSearch("?plus=off")).toBe("off");
    const repo = new MockPremiumRepository(
      () => "off",
      () => NOW,
    );
    expect(await repo.status(context)).toEqual(PREMIUM_STATUS_OFF);
    expect(await repo.mine(context)).toEqual(MY_PREMIUM_OFF);
    expect(await repo.getPaymentDetails(context)).toEqual(PAYMENT_DETAILS_OFF);
    expect(await repo.getMyPayCode(context)).toEqual({ code: null });
  });
  it("puts dates relative to now", () => {
    const mine = mockMine("monthly", NOW);
    expect(mine.available && mine.currentPeriodEnd).toBe("2026-10-25T10:00:00.000Z");
  });
  it("serves the Saison, the reader's Saison, the example payment details and a code", async () => {
    let scenario: PlusScenario = "season";
    const repo = new MockPremiumRepository(
      () => scenario,
      () => NOW,
    );
    const status = premiumStatusSchema.parse(await repo.status(context));
    expect(status.prices).toHaveLength(1);
    expect(status.prices[0]).toMatchObject({ code: "plus_season", amountMad: 200 });
    expect(status.prices[0]?.validUntil).toBeTruthy();
    expect(await repo.mine(context)).toMatchObject({
      available: true,
      state: "active",
      productCode: "plus_season",
      currentPeriodEnd: MOCK_SEASON_END,
    });
    expect(await repo.getPaymentDetails(context)).toMatchObject({
      available: true,
      whatsapp: "+212 6 00 00 00 00",
    });
    expect(await repo.getMyPayCode(context)).toEqual({ code: MOCK_PAY_CODE });
    scenario = "nopay";
    expect((await repo.getPaymentDetails(context)).available).toBe(false);
    expect(await repo.getMyPayCode(context)).toEqual({ code: null });
  });
  it("has an « ended » Saison: no longer a member, the end in the past", () => {
    const mine = mockMine("ended", NOW);
    expect(mine).toMatchObject({ available: true, state: "expired", productCode: "plus_season" });
    expect(mine.available && Date.parse(mine.currentPeriodEnd!)).toBeLessThan(NOW.getTime());
  });
});

describe("derivePremium", () => {
  const status = { enabled: true, checkoutEnabled: false, prices: [...LAUNCH_PRICES] };
  it("is off and member-less while the status says off and the reader is not a member", () => {
    const view = derivePremium(PREMIUM_STATUS_OFF, mockMine("expired", NOW), true);
    expect(view).toMatchObject({ enabled: false, isMember: false, state: "none", periodEnd: null });
  });
  it("is member-less for a signed-out reader, whatever the answer", () => {
    expect(derivePremium(status, mockMine("monthly", NOW), false).isMember).toBe(false);
  });
  it("reads an old monthly member as a member with an end date", () => {
    const view = derivePremium(status, mockMine("monthly", NOW), true);
    expect(view).toMatchObject({
      enabled: true,
      isMember: true,
      state: "active",
      productCode: "plus_monthly",
    });
    expect(view.periodEnd?.toISOString()).toBe("2026-10-25T10:00:00.000Z");
  });
  it("reads a Saison with its end, and the season's end and price from the status", () => {
    const season = { ...status, prices: [{ ...LAUNCH_PRICES[0]!, validUntil: MOCK_SEASON_END }] };
    const view = derivePremium(season, mockMine("season", NOW), true);
    expect(view).toMatchObject({ isMember: true, productCode: "plus_season", seasonPrice: 200 });
    expect(view.periodEnd?.toISOString()).toBe(MOCK_SEASON_END);
    expect(view.seasonEnd?.toISOString()).toBe(MOCK_SEASON_END);
  });
  it("reads cancelling as a member, an ended Saison as no member", () => {
    expect(derivePremium(status, mockMine("cancelling", NOW), true)).toMatchObject({
      isMember: true,
    });
    expect(derivePremium(status, mockMine("ended", NOW), true)).toMatchObject({
      isMember: false,
      state: "expired",
    });
  });
  it("never exposes checkout while the status keeps it closed", () => {
    expect(derivePremium(status, undefined, true).checkoutEnabled).toBe(false);
  });
});
