import type { RepositoryContext } from "@/backend/contracts/repository";
import {
  SupabasePremiumBriefingRepository,
  type PremiumBriefingRepository,
} from "@/backend/premium/briefing";
import type { VisitSnapshot } from "@/components/plus/plus-briefing-data";
import { authService } from "@/services/auth";
import { managerCardDataMode } from "@/services/manager-card-mode";

/**
 * The member reads behind « Briefing avant la deadline » (`api.get_my_deadline_briefing`,
 * `api.get_my_briefing_alternatives`).
 *
 * A development server in the Manager Card's mock mode reads Karim B.'s example through the
 * dynamic import below, so the screen can be looked at without a database. Every other build reads
 * the database. Only a member's screen calls them (the hooks are disabled for anyone else), and
 * the database answers `{ locked: true }` to a non-member anyway.
 */
const supabaseRepository = new SupabasePremiumBriefingRepository();
let mockRepository: PremiumBriefingRepository | null = null;

const isMock = () => import.meta.env.DEV && managerCardDataMode() === "mock";

export async function getPremiumBriefingRepository(): Promise<PremiumBriefingRepository> {
  if (isMock()) {
    if (!mockRepository) {
      const { MockPremiumBriefingRepository } = await import("@/backend/premium/briefing-mock");
      mockRepository ??= new MockPremiumBriefingRepository();
    }
    return mockRepository;
  }
  return supabaseRepository;
}

function context(signal?: AbortSignal): RepositoryContext {
  const session = authService.getSession();
  return {
    actorId: session.status === "authenticated" ? (session.user?.id ?? null) : null,
    requestId: globalThis.crypto?.randomUUID?.() ?? `premium-briefing-${Date.now().toString(36)}`,
    signal,
  };
}

export const premiumBriefingService = {
  async briefing(signal?: AbortSignal) {
    return (await getPremiumBriefingRepository()).briefing(null, context(signal));
  },
  async alternatives(playerOut: string, signal?: AbortSignal) {
    return (await getPremiumBriefingRepository()).alternatives(playerOut, 6, context(signal));
  },
  /** Development only: the last visit the example pretends this device made. Null everywhere else. */
  async previousVisitSeed(): Promise<VisitSnapshot | null> {
    if (!isMock()) return null;
    const { MOCK_PREVIOUS_VISIT } = await import("@/backend/premium/briefing-mock");
    return MOCK_PREVIOUS_VISIT;
  },
};
