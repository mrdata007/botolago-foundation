import type { RepositoryContext } from "@/backend/contracts/repository";

import {
  LAUNCH_PRICES,
  type MyPremium,
  type PremiumActionResult,
  type PremiumProductCode,
  type PremiumReceipt,
  type PremiumRepository,
  type PremiumStatus,
} from "./contracts";

/**
 * Mocked BotolaGO+ membership for development and the browser tests, until lane B's functions
 * exist. Reached only through the dynamic import in `src/services/premium.ts` behind
 * `import.meta.env.DEV`, so a production build carries none of it.
 *
 * The scenario comes from `?plus=<scenario>` (development only), so every state of the Profil
 * section and of the offer can be looked at without a database:
 * `none` (the default), `monthly`, `yearly`, `cancelling`, `grace`, `expired`.
 *
 * Dates are relative to `now`, so the same scenario always reads « renews in 12 days ».
 */
export const PLUS_SCENARIOS = [
  "none",
  "monthly",
  "yearly",
  "cancelling",
  "grace",
  "expired",
] as const;
export type PlusScenario = (typeof PLUS_SCENARIOS)[number];

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

function mockReceipts(scenario: PlusScenario, now: Date): readonly PremiumReceipt[] {
  if (scenario === "none") return [];
  const yearly = scenario === "yearly";
  return [
    {
      id: "rcpt-sample-1",
      paidAt: inDays(now, yearly ? -84 : -18),
      amountMad: yearly ? 200 : 20,
      productCode: yearly ? "plus_yearly" : "plus_monthly",
      url: null,
    },
  ];
}

export class MockPremiumRepository implements PremiumRepository {
  constructor(
    private readonly pick: () => PlusScenario = currentScenario,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async status(_context: RepositoryContext): Promise<PremiumStatus> {
    return { enabled: true, checkoutEnabled: false, prices: [...LAUNCH_PRICES] };
  }
  async mine(_context: RepositoryContext): Promise<MyPremium> {
    return mockMine(this.pick(), this.clock());
  }
  async receipts(_context: RepositoryContext) {
    return mockReceipts(this.pick(), this.clock());
  }
  async startCheckout(
    _product: PremiumProductCode,
    _context: RepositoryContext,
  ): Promise<PremiumActionResult> {
    return { status: "soon" };
  }
  async cancel(_context: RepositoryContext): Promise<PremiumActionResult> {
    return { status: "soon" };
  }
  async restore(_context: RepositoryContext): Promise<PremiumActionResult> {
    return { status: "soon" };
  }
}
