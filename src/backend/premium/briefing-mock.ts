import type { RepositoryContext } from "@/backend/contracts/repository";
import {
  EXAMPLE_PREVIOUS_VISIT,
  exampleAlternatives,
  exampleBriefing,
} from "@/components/plus/plus-briefing-example";

import type { AlternativesResponse, BriefingResponse, PremiumBriefingRepository } from "./briefing";

/**
 * A development briefing: Karim B.'s example (`plus-briefing-example.ts`), until the database
 * serves one to a preview. Reached only through the dynamic import in
 * `src/services/premium-briefing.ts` behind `import.meta.env.DEV`, so a production build carries
 * none of it.
 */
export class MockPremiumBriefingRepository implements PremiumBriefingRepository {
  async briefing(_season: string | null, _context: RepositoryContext): Promise<BriefingResponse> {
    return exampleBriefing();
  }
  async alternatives(
    playerOut: string,
    _limit: number,
    _context: RepositoryContext,
  ): Promise<AlternativesResponse> {
    return exampleAlternatives(playerOut);
  }
}

/** The mock's « last visit », so the development screen shows what changed since then. */
export const MOCK_PREVIOUS_VISIT = EXAMPLE_PREVIOUS_VISIT;
