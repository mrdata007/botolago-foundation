// The mock Fantasy service, fetched on first use. Only the mock data mode and
// the local prototype team read it, and production never selects either, so
// the sample data behind it (`src/mocks/fantasy-data.ts`) stays out of the
// first-view JavaScript. `saveTeam` is synchronous and lives in
// `fantasy-team-patch.ts` for that reason.

import { lazyRepository } from "@/backend/lazy-repository";
import type { FantasyService } from "@/services/fantasy-mock";

export const lazyMockFantasyService = lazyRepository<Omit<FantasyService, "saveTeam">>(() =>
  import("@/services/fantasy-mock").then((m) => m.fantasyService),
);
