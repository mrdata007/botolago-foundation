import type { RepositoryContext } from "@/backend/contracts/repository";
import { BackendError, requireMock } from "@/backend/errors";
import type {
  PrizeWinnerCursor,
  PrizesRepository,
  PublicPrizeDto,
  PublicPrizeWinnerPageDto,
} from "@/backend/prizes/contracts";
import { MockPrizesRepository } from "@/backend/prizes/mock-repository";
import { SupabasePrizesRepository } from "@/backend/prizes/supabase-repository";

export type PrizesDataMode = "mock" | "supabase";

/** Same contract as the other domains: production reads the database or fails loudly. */
export function selectPrizesDataMode(
  configuredMode: string | undefined,
  production: boolean,
): PrizesDataMode {
  if (production && configuredMode !== "supabase")
    throw new BackendError(
      "data_unavailable",
      "Production prizes require VITE_PRIZES_DATA_MODE=supabase.",
      { status: 503 },
    );
  if (configuredMode === "mock" || configuredMode === "supabase") return configuredMode;
  return "mock";
}

const mockRepository =
  import.meta.env.VITE_PRIZES_DATA_MODE === "supabase" ? undefined : new MockPrizesRepository();
const supabaseRepository = new SupabasePrizesRepository();

export function getPrizesRepository(): PrizesRepository {
  return selectPrizesDataMode(import.meta.env.VITE_PRIZES_DATA_MODE, import.meta.env.PROD) ===
    "supabase"
    ? supabaseRepository
    : requireMock(mockRepository, "Prizes");
}

function context(): RepositoryContext {
  return {
    actorId: null,
    requestId: globalThis.crypto?.randomUUID?.() ?? `prizes-${Date.now().toString(36)}`,
  };
}

/** Public reads only: both RPCs answer anonymous callers the same way. */
export const prizesService = {
  listPrizes(): Promise<PublicPrizeDto[]> {
    return getPrizesRepository().listPrizes(context());
  },
  listWinners(cursor: PrizeWinnerCursor | null, limit = 20): Promise<PublicPrizeWinnerPageDto> {
    return getPrizesRepository().listWinners(cursor, limit, context());
  },
};
