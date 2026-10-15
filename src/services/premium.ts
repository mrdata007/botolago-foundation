import type { RepositoryContext } from "@/backend/contracts/repository";
import {
  MY_PREMIUM_OFF,
  PAYMENT_DETAILS_OFF,
  PREMIUM_STATUS_OFF,
  type PremiumRepository,
} from "@/backend/premium/contracts";
import { SupabasePremiumRepository } from "@/backend/premium/supabase-repository";
import { PREMIUM_BUILD } from "@/lib/feature-flags";
import { authService } from "@/services/auth";

/**
 * BotolaGO+ service: the repository behind `usePremium()`.
 *
 *   - a development server reaches the mock repository through the dynamic import below and
 *     nowhere else. Vite replaces `import.meta.env.DEV` with `false` in a production build, so
 *     the branch and its import are removed and no mock chunk is emitted;
 *   - a build with `PREMIUM_BUILD` on reads the database (`api.premium_status()`,
 *     `api.get_my_premium()`): a database that does not have them yet answers like the feature
 *     switched off;
 *   - every other build gets `OFF_REPOSITORY`: the feature reads as switched off, with no request
 *     at all.
 */
export const OFF_REPOSITORY: PremiumRepository = {
  status: async () => PREMIUM_STATUS_OFF,
  mine: async () => MY_PREMIUM_OFF,
  getPaymentDetails: async () => PAYMENT_DETAILS_OFF,
  getMyPayCode: async () => ({ code: null }),
};

/** Which repository a build gets: the pure decision, so a test can walk it. */
export function premiumRepositoryKind(input: {
  dev: boolean;
  build: boolean;
}): "mock" | "supabase" | "off" {
  if (input.dev) return "mock";
  return input.build ? "supabase" : "off";
}

let mockRepository: PremiumRepository | null = null;
let supabaseRepository: PremiumRepository | null = null;

export async function getPremiumRepository(): Promise<PremiumRepository> {
  if (import.meta.env.DEV) {
    if (!mockRepository) {
      const { MockPremiumRepository } = await import("@/backend/premium/mock-repository");
      mockRepository ??= new MockPremiumRepository();
    }
    return mockRepository;
  }
  if (premiumRepositoryKind({ dev: false, build: PREMIUM_BUILD }) === "supabase") {
    supabaseRepository ??= new SupabasePremiumRepository();
    return supabaseRepository;
  }
  return OFF_REPOSITORY;
}

function context(signal?: AbortSignal): RepositoryContext {
  const session = authService.getSession();
  return {
    actorId: session.status === "authenticated" ? (session.user?.id ?? null) : null,
    requestId: globalThis.crypto?.randomUUID?.() ?? `premium-${Date.now().toString(36)}`,
    signal,
  };
}

export const premiumService = {
  async status(signal?: AbortSignal) {
    return (await getPremiumRepository()).status(context(signal));
  },
  async mine(signal?: AbortSignal) {
    return (await getPremiumRepository()).mine(context(signal));
  },
  async paymentDetails(signal?: AbortSignal) {
    return (await getPremiumRepository()).getPaymentDetails(context(signal));
  },
  async payCode(signal?: AbortSignal) {
    return (await getPremiumRepository()).getMyPayCode(context(signal));
  },
};
