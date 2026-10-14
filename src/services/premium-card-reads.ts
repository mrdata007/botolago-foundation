import type { RepositoryContext } from "@/backend/contracts/repository";
import {
  SupabasePremiumCardReadsRepository,
  type PremiumCardReadsRepository,
} from "@/backend/premium/card-reads";
import { authService } from "@/services/auth";
import { managerCardDataMode } from "@/services/manager-card-mode";

/**
 * The member reads behind « Votre saison » and « Détail du duel »
 * (`api.get_my_card_career`, `api.get_card_duel`).
 *
 * A development server in the Manager Card's mock mode reaches a fixture member through the
 * dynamic import below and nowhere else (Vite replaces `import.meta.env.DEV` with `false` in a
 * production build, so the branch and its import are removed and no fixture chunk is emitted).
 * Every other build reads the database. The screens only call these for a member: for anyone else
 * the hooks are disabled and no request is made (`use-premium-card-reads.ts`), and the database
 * answers `{ locked: true }` anyway.
 */
const supabaseRepository = new SupabasePremiumCardReadsRepository();
let mockRepository: PremiumCardReadsRepository | null = null;

export async function getPremiumCardReadsRepository(): Promise<PremiumCardReadsRepository> {
  if (import.meta.env.DEV && managerCardDataMode() === "mock") {
    if (!mockRepository) {
      const { MockPremiumCardReadsRepository } = await import("@/backend/premium/card-reads-mock");
      mockRepository ??= new MockPremiumCardReadsRepository();
    }
    return mockRepository;
  }
  return supabaseRepository;
}

function context(signal?: AbortSignal): RepositoryContext {
  const session = authService.getSession();
  return {
    actorId: session.status === "authenticated" ? (session.user?.id ?? null) : null,
    requestId: globalThis.crypto?.randomUUID?.() ?? `premium-reads-${Date.now().toString(36)}`,
    signal,
  };
}

export const premiumCardReadsService = {
  async career(season: string | null, signal?: AbortSignal) {
    return (await getPremiumCardReadsRepository()).career(season, context(signal));
  },
  async duel(otherTeamId: string, season: string | null, signal?: AbortSignal) {
    return (await getPremiumCardReadsRepository()).duel(otherTeamId, season, context(signal));
  },
};
