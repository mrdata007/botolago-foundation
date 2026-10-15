import type { RepositoryContext } from "@/backend/contracts/repository";
import {
  SupabasePremiumRoundRecapRepository,
  type PremiumRoundRecapRepository,
} from "@/backend/premium/round-recap";
import { authService } from "@/services/auth";
import { managerCardDataMode } from "@/services/manager-card-mode";

/**
 * The member read behind « Votre journée expliquée » (`api.get_round_recap`).
 *
 * A development server in the Manager Card's mock mode reads a made-up member (Karim B.,
 * `round-recap-mock.ts`) through the dynamic import below; every other build reads the database.
 * Only a member's screen calls it (the hook is disabled for anyone else,
 * `use-premium-round-recap.ts`), and the database answers `{ locked: true }` to a non-member anyway.
 */
const supabaseRepository = new SupabasePremiumRoundRecapRepository();
let mockRepository: PremiumRoundRecapRepository | null = null;

export async function getPremiumRoundRecapRepository(): Promise<PremiumRoundRecapRepository> {
  if (import.meta.env.DEV && managerCardDataMode() === "mock") {
    if (!mockRepository) {
      const { MockPremiumRoundRecapRepository } =
        await import("@/backend/premium/round-recap-mock");
      mockRepository ??= new MockPremiumRoundRecapRepository();
    }
    return mockRepository;
  }
  return supabaseRepository;
}

function context(signal?: AbortSignal): RepositoryContext {
  const session = authService.getSession();
  return {
    actorId: session.status === "authenticated" ? (session.user?.id ?? null) : null,
    requestId: globalThis.crypto?.randomUUID?.() ?? `premium-recap-${Date.now().toString(36)}`,
    signal,
  };
}

export const premiumRoundRecapService = {
  async roundRecap(
    request: { gameweek: string | null; league: string | null },
    signal?: AbortSignal,
  ) {
    return (await getPremiumRoundRecapRepository()).roundRecap(request, context(signal));
  },
};
