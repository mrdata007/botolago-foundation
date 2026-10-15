import type { RepositoryContext } from "@/backend/contracts/repository";
import { SupabaseTrophiesRepository, type TrophiesRepository } from "@/backend/trophies/contracts";
import { authService } from "@/services/auth";
import { managerCardDataMode } from "@/services/manager-card-mode";

/**
 * The reads behind « Trophées » (`api.get_my_trophies`, `api.choose_card_frame`,
 * `api.set_trophies_visibility`, `api.get_league_member_trophies`).
 *
 * A development server in the Manager Card's mock mode reads Karim B.'s cabinet through the dynamic
 * import below and nowhere else (Vite replaces `import.meta.env.DEV` with `false` in a production
 * build, so the branch and its import are removed and no fixture chunk is emitted). Every other
 * build reads the database. The screens only call the read while the feature is on for the reader
 * (`use-trophies.ts`), and the database answers `{ available: false }` otherwise anyway.
 */
const supabaseRepository = new SupabaseTrophiesRepository();
let mockRepository: TrophiesRepository | null = null;

export async function getTrophiesRepository(): Promise<TrophiesRepository> {
  if (import.meta.env.DEV && managerCardDataMode() === "mock") {
    if (!mockRepository) {
      const { MockTrophiesRepository } = await import("@/backend/trophies/mock");
      mockRepository ??= new MockTrophiesRepository();
    }
    return mockRepository;
  }
  return supabaseRepository;
}

function context(signal?: AbortSignal): RepositoryContext {
  const session = authService.getSession();
  return {
    actorId: session.status === "authenticated" ? (session.user?.id ?? null) : null,
    requestId: globalThis.crypto?.randomUUID?.() ?? `trophies-${Date.now().toString(36)}`,
    signal,
  };
}

export const trophiesService = {
  async myTrophies(signal?: AbortSignal) {
    return (await getTrophiesRepository()).myTrophies(null, context(signal));
  },
  async chooseFrame(code: string) {
    return (await getTrophiesRepository()).chooseFrame(code, context());
  },
  async setVisibility(visible: boolean) {
    return (await getTrophiesRepository()).setVisibility(visible, context());
  },
  async leagueMemberTrophies(leagueId: string, signal?: AbortSignal) {
    return (await getTrophiesRepository()).leagueMemberTrophies(leagueId, context(signal));
  },
};
