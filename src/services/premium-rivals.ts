import type { RepositoryContext } from "@/backend/contracts/repository";
import {
  SupabasePremiumRivalsRepository,
  type PremiumRivalsRepository,
} from "@/backend/premium/rivals";
import { authService } from "@/services/auth";
import { managerCardDataMode } from "@/services/manager-card-mode";

/**
 * The member reads and writes behind « Vos rivaux » (`api.get_my_rivals`, `get_rival_candidates`,
 * `pin_rival`, `unpin_rival`, `set_rivals_notify`).
 *
 * A development server in the Manager Card's mock mode reads a made-up board (`rivals-mock.ts`,
 * Karim B. and two friends) through the dynamic import below. Every other build reads the database.
 * Only a member's screen calls it (the hooks are disabled for anyone else), and the database answers
 * `{ locked: true }` to a non-member anyway.
 */
const supabaseRepository = new SupabasePremiumRivalsRepository();
let mockRepository: PremiumRivalsRepository | null = null;

export async function getPremiumRivalsRepository(): Promise<PremiumRivalsRepository> {
  if (import.meta.env.DEV && managerCardDataMode() === "mock") {
    if (!mockRepository) {
      const { MockPremiumRivalsRepository } = await import("@/backend/premium/rivals-mock");
      mockRepository ??= new MockPremiumRivalsRepository();
    }
    return mockRepository;
  }
  return supabaseRepository;
}

function context(signal?: AbortSignal): RepositoryContext {
  const session = authService.getSession();
  return {
    actorId: session.status === "authenticated" ? (session.user?.id ?? null) : null,
    requestId: globalThis.crypto?.randomUUID?.() ?? `premium-rivals-${Date.now().toString(36)}`,
    signal,
  };
}

export const premiumRivalsService = {
  async myRivals(signal?: AbortSignal) {
    return (await getPremiumRivalsRepository()).myRivals(context(signal));
  },
  async candidates(signal?: AbortSignal) {
    return (await getPremiumRivalsRepository()).candidates(context(signal));
  },
  async pin(teamId: string) {
    return (await getPremiumRivalsRepository()).pin(teamId, context());
  },
  async unpin(teamId: string) {
    return (await getPremiumRivalsRepository()).unpin(teamId, context());
  },
  async setNotify(enabled: boolean) {
    return (await getPremiumRivalsRepository()).setNotify(enabled, context());
  },
};
