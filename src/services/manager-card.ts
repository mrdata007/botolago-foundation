import type { RepositoryContext } from "@/backend/contracts/repository";
import type {
  AckResponse,
  CardsResponse,
  HistoryResponse,
  ManagerCardRepository,
  ManagerCardStatus,
  MyCardResponse,
} from "@/backend/manager-card/contracts";
import { ManagerCardError } from "@/backend/manager-card/errors";
import { SupabaseManagerCardRepository } from "@/backend/manager-card/supabase-repository";
import { authService } from "@/services/auth";
import { managerCardDataMode } from "./manager-card-mode";

export {
  isManagerCardSampleData,
  managerCardDataMode,
  selectManagerCardDataMode,
  type ManagerCardDataMode,
} from "./manager-card-mode";

const supabaseRepository = new SupabaseManagerCardRepository();
let mockRepository: ManagerCardRepository | null = null;

/**
 * The repository for the configured data mode. The fixtures are reached through the dynamic
 * import below and nowhere else: Vite replaces `import.meta.env.DEV` with `false` in a production
 * build, so the branch and its import are removed and no fixture chunk is emitted
 * (`scripts/qa/manager-card-fixture-gate.ts` scans the build for them).
 */
export async function getManagerCardRepository(): Promise<ManagerCardRepository> {
  if (managerCardDataMode() === "supabase") return supabaseRepository;
  if (import.meta.env.DEV) {
    if (!mockRepository) {
      const { MockManagerCardRepository } = await import("@/backend/manager-card/mock-repository");
      mockRepository ??= new MockManagerCardRepository();
    }
    return mockRepository;
  }
  // Unreachable: a production build refuses every mode but `supabase` before it gets here.
  throw new ManagerCardError("data_unavailable", "The Manager Card has no development data here.");
}

function context(signal?: AbortSignal): RepositoryContext {
  const session = authService.getSession();
  return {
    actorId: session.status === "authenticated" ? (session.user?.id ?? null) : null,
    requestId: globalThis.crypto?.randomUUID?.() ?? `manager-card-${Date.now().toString(36)}`,
    signal,
  };
}

/** The status is callable by anyone, so it carries no session: the server reads it too. */
export function anonymousContext(signal?: AbortSignal): RepositoryContext {
  return {
    actorId: null,
    requestId: globalThis.crypto?.randomUUID?.() ?? `manager-card-${Date.now().toString(36)}`,
    signal,
  };
}

export const managerCardService = {
  async status(signal?: AbortSignal): Promise<ManagerCardStatus> {
    return (await getManagerCardRepository()).status(anonymousContext(signal));
  },
  async myCard(signal?: AbortSignal): Promise<MyCardResponse> {
    return (await getManagerCardRepository()).myCard(context(signal));
  },
  async cards(teamIds: readonly string[], signal?: AbortSignal): Promise<CardsResponse> {
    return (await getManagerCardRepository()).cards(teamIds, context(signal));
  },
  async myHistory(
    query: { seasonId: string | null; beforeSeq: number | null; limit: number },
    signal?: AbortSignal,
  ): Promise<HistoryResponse> {
    return (await getManagerCardRepository()).myHistory(query, context(signal));
  },
  async ackMoments(keys: readonly string[]): Promise<AckResponse> {
    return (await getManagerCardRepository()).ackMoments(keys, context());
  },
};
