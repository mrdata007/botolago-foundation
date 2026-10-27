// The pieces of the owned Fantasy repository that every page needs: the source
// selector and the anonymous (guest) repository, which reads nothing. The
// local and cloud repositories (`fantasy-owned-repository.ts`) bring the
// sample data, the transfer rules and the Supabase adapter, so the root
// provider reaches them only through `fantasy-owned-repository-lazy.ts`.

import { DEFAULT_STATE } from "@/services/fantasy-state";
import { FantasyRepoError } from "@/services/fantasy-errors";
import type { FantasyChip, FantasyTransferPreviewDto } from "@/backend/fantasy/contracts";
import type {
  ConfirmOwnedTransfersInput,
  FantasyOwnedRepository,
  FantasyRepoSource,
  FantasySnapshot,
  FinalizeOwnedGameweekInput,
  PreviewOwnedTransfersInput,
  SaveOwnedTeamInput,
} from "@/services/fantasy-owned-repository";

// ---------- Source selector ----------

export function selectFantasyRepoSource(input: {
  authMode: "supabase" | "mock";
  isAuthenticated: boolean;
}): FantasyRepoSource {
  if (input.authMode === "supabase" && input.isAuthenticated) return "cloud";
  if (input.authMode === "supabase") return "guest";
  return "local";
}

// ---------- Anonymous cloud adapter ----------

/**
 * Production Supabase mode must never substitute the local/mock team for an
 * anonymous visitor. This read-only adapter represents the honest no-team
 * state while keeping all mutations authentication-gated.
 */
export class GuestFantasyRepository implements FantasyOwnedRepository {
  readonly source: FantasyRepoSource = "guest";

  async loadSnapshot(): Promise<FantasySnapshot> {
    return {
      teamId: null,
      version: 0,
      team: {
        managerName: "",
        teamName: "",
        formation: "4-4-2",
        squad: [],
        bank: 0,
        freeTransfers: 0,
        pendingTransfers: 0,
      },
      lifecycle: { ...DEFAULT_STATE },
      finalizedResults: {},
      source: "guest",
      currentGameweekId: null,
      purchasePrices: {},
      activeChipCancellable: false,
      emptyCloudSquad: true,
    };
  }

  private unauthorized(): never {
    throw new FantasyRepoError("unauthenticated", "Authentication is required.");
  }

  async saveTeam(_input: SaveOwnedTeamInput): Promise<FantasySnapshot> {
    return this.unauthorized();
  }

  async previewTransfers(_input: PreviewOwnedTransfersInput): Promise<FantasyTransferPreviewDto> {
    return this.unauthorized();
  }

  async confirmTransfers(_input: ConfirmOwnedTransfersInput): Promise<FantasySnapshot> {
    return this.unauthorized();
  }

  async activateChip(_input: {
    gameweekId: string;
    chip: FantasyChip;
    expectedVersion: number;
  }): Promise<FantasySnapshot> {
    return this.unauthorized();
  }

  async cancelChip(_input: {
    gameweekId: string;
    expectedVersion: number;
  }): Promise<FantasySnapshot> {
    return this.unauthorized();
  }

  async finalizeGameweek(_input: FinalizeOwnedGameweekInput): Promise<FantasySnapshot> {
    return this.unauthorized();
  }

  async reload(): Promise<FantasySnapshot> {
    return this.loadSnapshot();
  }
}
