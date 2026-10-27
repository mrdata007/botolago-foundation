// The owned Fantasy repository as the root provider sees it. A visitor with no
// account gets the guest repository at once (it reads nothing). The local
// (sample data) and cloud repositories are fetched on the first call, so the
// transfer rules, the sample data and the Supabase Fantasy adapter are not part
// of the first-view JavaScript of pages that never touch a team.

import { FantasyRepoError } from "@/services/fantasy-errors";
import {
  GuestFantasyRepository,
  selectFantasyRepoSource,
} from "@/services/fantasy-guest-repository";
import type {
  FantasyOwnedRepository,
  FantasyRepoSource,
  RepositoryFactoryInput,
} from "@/services/fantasy-owned-repository";

class LazyFantasyOwnedRepository implements FantasyOwnedRepository {
  private loaded: Promise<FantasyOwnedRepository> | null = null;

  constructor(
    readonly source: FantasyRepoSource,
    private readonly input: RepositoryFactoryInput,
  ) {}

  private repo(): Promise<FantasyOwnedRepository> {
    return (this.loaded ??= import("@/services/fantasy-owned-repository").then((m) =>
      m.createFantasyOwnedRepository(this.input),
    ));
  }

  loadSnapshot: FantasyOwnedRepository["loadSnapshot"] = async () =>
    (await this.repo()).loadSnapshot();
  saveTeam: FantasyOwnedRepository["saveTeam"] = async (input) =>
    (await this.repo()).saveTeam(input);
  previewTransfers: FantasyOwnedRepository["previewTransfers"] = async (input) =>
    (await this.repo()).previewTransfers(input);
  confirmTransfers: FantasyOwnedRepository["confirmTransfers"] = async (input) =>
    (await this.repo()).confirmTransfers(input);
  activateChip: FantasyOwnedRepository["activateChip"] = async (input) =>
    (await this.repo()).activateChip(input);
  cancelChip: FantasyOwnedRepository["cancelChip"] = async (input) =>
    (await this.repo()).cancelChip(input);
  finalizeGameweek: FantasyOwnedRepository["finalizeGameweek"] = async (input) =>
    (await this.repo()).finalizeGameweek(input);
  reload: FantasyOwnedRepository["reload"] = async () => (await this.repo()).reload();
}

/** Same choice as `createFantasyOwnedRepository`, with the heavy repositories loaded on demand. */
export function createLazyFantasyOwnedRepository(
  input: RepositoryFactoryInput,
): FantasyOwnedRepository {
  const source = selectFantasyRepoSource(input);
  if (source === "cloud" && !input.userId) {
    throw new FantasyRepoError(
      "unauthenticated",
      "Cloud repository requires an authenticated user id",
    );
  }
  if (source === "guest") return new GuestFantasyRepository();
  return new LazyFantasyOwnedRepository(source, input);
}
