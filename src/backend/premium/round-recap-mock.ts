import type { RepositoryContext } from "@/backend/contracts/repository";
import { EXAMPLE_RECAP_J10, EXAMPLE_RECAP_J11 } from "@/components/plus/plus-recap-example";

import {
  recapMemberSchema,
  type PremiumRoundRecapRepository,
  type RoundRecapRequest,
  type RoundRecapResponse,
} from "./round-recap";

/**
 * A development member for the round recap, until the database serves one to a preview. Reached
 * only through the dynamic import in `src/services/premium-round-recap.ts` behind
 * `import.meta.env.DEV`, so a production build carries none of it (the example the locked screen
 * blurs is `plus-recap-example.ts`, which does ship). Karim B., KACM: journée 11 with one starter
 * still unscored, and journée 10, published.
 */
export class MockPremiumRoundRecapRepository implements PremiumRoundRecapRepository {
  async roundRecap(
    request: RoundRecapRequest,
    _context: RepositoryContext,
  ): Promise<RoundRecapResponse> {
    const wanted = request.gameweek ?? EXAMPLE_RECAP_J11.gameweek.id;
    const answer = wanted === EXAMPLE_RECAP_J10.gameweek.id ? EXAMPLE_RECAP_J10 : EXAMPLE_RECAP_J11;
    return recapMemberSchema.parse(answer);
  }
}
