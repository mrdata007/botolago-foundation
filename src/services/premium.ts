import type { RepositoryContext } from "@/backend/contracts/repository";
import {
  MY_PREMIUM_OFF,
  PREMIUM_STATUS_OFF,
  type PremiumRepository,
} from "@/backend/premium/contracts";
import { authService } from "@/services/auth";

/**
 * BotolaGO+ service: the repository behind `usePremium()`.
 *
 * There is no database function yet (lane B ships `api.premium_status()` and
 * `api.get_my_premium()`), so:
 *   - a development server reaches the mock repository through the dynamic import below and
 *     nowhere else. Vite replaces `import.meta.env.DEV` with `false` in a production build, so
 *     the branch and its import are removed and no mock chunk is emitted;
 *   - every other build gets `OFF_REPOSITORY`: the feature reads as switched off, checkout and
 *     the rest answer « bientôt ». Flipping `PREMIUM_BUILD` on before lane B lands therefore shows
 *     nothing, rather than a made-up membership.
 *
 * TODO(lane B): replace `OFF_REPOSITORY` with a `SupabasePremiumRepository` that calls the two
 * functions and parses them with `premiumStatusWireSchema` / `myPremiumSchema`.
 */
export const OFF_REPOSITORY: PremiumRepository = {
  status: async () => PREMIUM_STATUS_OFF,
  mine: async () => MY_PREMIUM_OFF,
  receipts: async () => [],
  startCheckout: async () => ({ status: "soon" }),
  cancel: async () => ({ status: "soon" }),
  restore: async () => ({ status: "soon" }),
};

let mockRepository: PremiumRepository | null = null;

export async function getPremiumRepository(): Promise<PremiumRepository> {
  if (import.meta.env.DEV) {
    if (!mockRepository) {
      const { MockPremiumRepository } = await import("@/backend/premium/mock-repository");
      mockRepository ??= new MockPremiumRepository();
    }
    return mockRepository;
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
  async receipts(signal?: AbortSignal) {
    return (await getPremiumRepository()).receipts(context(signal));
  },
  async startCheckout(product: Parameters<PremiumRepository["startCheckout"]>[0]) {
    return (await getPremiumRepository()).startCheckout(product, context());
  },
  async cancel() {
    return (await getPremiumRepository()).cancel(context());
  },
  async restore() {
    return (await getPremiumRepository()).restore(context());
  },
};
