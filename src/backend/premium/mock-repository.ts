import type { RepositoryContext } from "@/backend/contracts/repository";

import {
  MY_PREMIUM_OFF,
  PAYMENT_DETAILS_OFF,
  PREMIUM_STATUS_OFF,
  SEASON_PRICE_MAD,
  type MyPremium,
  type PayCode,
  type PaymentDetails,
  type PremiumRepository,
  type PremiumStatus,
} from "./contracts";

/**
 * Mocked BotolaGO+ Saison for development and the browser tests, until the database functions are
 * applied. Reached only through the dynamic import in `src/services/premium.ts` behind
 * `import.meta.env.DEV`, so a production build carries none of it.
 *
 * The scenario comes from `?plus=<scenario>` (development only), so every state can be looked at
 * without a database: `none` (the default), `season` (a Saison in progress), `ended` (the Saison is
 * over), `nopay` (no payment details published yet), the old `monthly`, `yearly`, `cancelling`,
 * `grace` and `expired` states (they still parse and read as « jusqu'au »), `off` (the database
 * mode is off: nothing shows).
 *
 * The payment details below are EXAMPLES, in this mock only. Real ones are typed by the owner in
 * the admin screen and never live in code.
 */
export const PLUS_SCENARIOS = [
  "none",
  "season",
  "ended",
  "nopay",
  "monthly",
  "yearly",
  "cancelling",
  "grace",
  "expired",
  "off",
] as const;
export type PlusScenario = (typeof PLUS_SCENARIOS)[number];

/** The end of the example season (a fixed date: the mock has no calendar). */
export const MOCK_SEASON_END = "2027-05-31T20:00:00.000Z";

/** EXAMPLE payment details, for the mock only. */
export const MOCK_PAYMENT_DETAILS: PaymentDetails = {
  available: true,
  whatsapp: "+212 6 00 00 00 00",
  bankHolder: "BotolaGO SARL",
  bankName: "Banque exemple",
  rib: "000 000 0000000000000000 00",
  cashplusName: "BotolaGO SARL",
  noteFr: null,
  noteAr: null,
  amountMad: SEASON_PRICE_MAD,
};
export const MOCK_PAY_CODE = "BG-7K4M9X";

const DAY_MS = 86_400_000;

export function scenarioFromSearch(search: string): PlusScenario {
  const value = new URLSearchParams(search).get("plus");
  return (PLUS_SCENARIOS as readonly string[]).includes(value ?? "")
    ? (value as PlusScenario)
    : "none";
}

function currentScenario(): PlusScenario {
  return typeof window === "undefined" ? "none" : scenarioFromSearch(window.location.search);
}

function inDays(now: Date, days: number): string {
  return new Date(now.getTime() + days * DAY_MS).toISOString();
}

export function mockMine(scenario: PlusScenario, now: Date): MyPremium {
  const base = { available: true as const, source: "web" as const };
  switch (scenario) {
    case "season":
      return {
        ...base,
        source: "grant" as const,
        state: "active",
        productCode: "plus_season",
        currentPeriodEnd: MOCK_SEASON_END,
        cancelAtPeriodEnd: false,
      };
    case "ended":
      return {
        ...base,
        source: "grant" as const,
        state: "expired",
        productCode: "plus_season",
        currentPeriodEnd: inDays(now, -10),
        cancelAtPeriodEnd: false,
      };
    case "monthly":
      return {
        ...base,
        state: "active",
        productCode: "plus_monthly",
        currentPeriodEnd: inDays(now, 12),
        cancelAtPeriodEnd: false,
      };
    case "yearly":
      return {
        ...base,
        state: "active",
        productCode: "plus_yearly",
        currentPeriodEnd: inDays(now, 281),
        cancelAtPeriodEnd: false,
      };
    case "cancelling":
      return {
        ...base,
        state: "cancelling",
        productCode: "plus_monthly",
        currentPeriodEnd: inDays(now, 9),
        cancelAtPeriodEnd: true,
      };
    case "grace":
      return {
        ...base,
        state: "grace",
        productCode: "plus_monthly",
        currentPeriodEnd: inDays(now, -2),
        cancelAtPeriodEnd: false,
      };
    case "expired":
      return {
        ...base,
        state: "expired",
        productCode: "plus_monthly",
        currentPeriodEnd: inDays(now, -30),
        cancelAtPeriodEnd: false,
      };
    case "off":
    case "nopay":
    case "none":
      return {
        ...base,
        state: "none",
        productCode: null,
        source: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      };
  }
}

export class MockPremiumRepository implements PremiumRepository {
  constructor(
    private readonly pick: () => PlusScenario = currentScenario,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async status(_context: RepositoryContext): Promise<PremiumStatus> {
    if (this.pick() === "off") return PREMIUM_STATUS_OFF;
    return {
      enabled: true,
      checkoutEnabled: false,
      prices: [
        {
          code: "plus_season",
          amountMad: SEASON_PRICE_MAD,
          periodMonths: null,
          renews: false,
          validUntil: MOCK_SEASON_END,
        },
      ],
    };
  }
  async mine(_context: RepositoryContext): Promise<MyPremium> {
    if (this.pick() === "off") return MY_PREMIUM_OFF;
    return mockMine(this.pick(), this.clock());
  }
  async getPaymentDetails(_context: RepositoryContext): Promise<PaymentDetails> {
    const scenario = this.pick();
    return scenario === "off" || scenario === "nopay" ? PAYMENT_DETAILS_OFF : MOCK_PAYMENT_DETAILS;
  }
  async getMyPayCode(_context: RepositoryContext): Promise<PayCode> {
    const scenario = this.pick();
    return { code: scenario === "off" || scenario === "nopay" ? null : MOCK_PAY_CODE };
  }
}
