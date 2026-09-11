import type { CursorPageRequest, RepositoryContext } from "@/backend/contracts/repository";
import type { FollowDto, FollowRepository } from "@/backend/identity/contracts";
import { SupabaseFollowRepository } from "@/backend/identity/supabase-repositories";
import { mockFootballTeamId } from "@/backend/football/mock-repository";
import { authService, IS_MOCK_AUTH } from "@/services/auth";
import { footballService } from "@/services/football";
import type { Club, Language } from "@/types/domain";

type FollowKind = "team" | "competition";
type FollowStorage = Pick<Storage, "getItem" | "setItem">;

const MOCK_FOLLOW_STORAGE_PREFIX = "botolago.mock.follows.v1";
const DEFAULT_MOCK_TEAM_ID = mockFootballTeamId("war");
const DEFAULT_MOCK_CREATED_AT = new Date(0).toISOString();

function context(): RepositoryContext {
  return {
    actorId: authService.getSession().user?.id ?? null,
    requestId: globalThis.crypto?.randomUUID?.() ?? `follow-${Date.now().toString(36)}`,
  };
}

function browserStorage(): FollowStorage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function storageKey(kind: FollowKind, repositoryContext: RepositoryContext): string {
  return `${MOCK_FOLLOW_STORAGE_PREFIX}.${repositoryContext.actorId ?? "guest"}.${kind}`;
}

function initialMockFollows(kind: FollowKind): FollowDto[] {
  return kind === "team"
    ? [{ targetId: DEFAULT_MOCK_TEAM_ID, createdAt: DEFAULT_MOCK_CREATED_AT }]
    : [];
}

function parseStoredFollows(raw: string | null, kind: FollowKind): FollowDto[] {
  if (raw === null) return initialMockFollows(kind);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return initialMockFollows(kind);
    return parsed.filter(
      (item): item is FollowDto =>
        !!item &&
        typeof item === "object" &&
        typeof (item as FollowDto).targetId === "string" &&
        typeof (item as FollowDto).createdAt === "string",
    );
  } catch {
    return initialMockFollows(kind);
  }
}

export class LocalFollowRepository implements FollowRepository {
  constructor(private readonly getStorage: () => FollowStorage | null = browserStorage) {}

  private read(kind: FollowKind, repositoryContext: RepositoryContext): FollowDto[] {
    const storage = this.getStorage();
    return parseStoredFollows(storage?.getItem(storageKey(kind, repositoryContext)) ?? null, kind);
  }

  private write(
    kind: FollowKind,
    repositoryContext: RepositoryContext,
    follows: readonly FollowDto[],
  ): void {
    this.getStorage()?.setItem(storageKey(kind, repositoryContext), JSON.stringify(follows));
  }

  private async follow(
    kind: FollowKind,
    targetId: string,
    repositoryContext: RepositoryContext,
  ): Promise<void> {
    const current = this.read(kind, repositoryContext);
    if (current.some((item) => item.targetId === targetId)) return;
    this.write(kind, repositoryContext, [
      { targetId, createdAt: new Date().toISOString() },
      ...current,
    ]);
  }

  private async unfollow(
    kind: FollowKind,
    targetId: string,
    repositoryContext: RepositoryContext,
  ): Promise<void> {
    this.write(
      kind,
      repositoryContext,
      this.read(kind, repositoryContext).filter((item) => item.targetId !== targetId),
    );
  }

  private async list(
    kind: FollowKind,
    page: CursorPageRequest,
    repositoryContext: RepositoryContext,
  ) {
    const limit = Math.min(Math.max(page.limit ?? 25, 1), 100);
    return { items: this.read(kind, repositoryContext).slice(0, limit), nextCursor: null };
  }

  followTeam(teamId: string, repositoryContext: RepositoryContext) {
    return this.follow("team", teamId, repositoryContext);
  }

  unfollowTeam(teamId: string, repositoryContext: RepositoryContext) {
    return this.unfollow("team", teamId, repositoryContext);
  }

  listTeams(page: CursorPageRequest, repositoryContext: RepositoryContext) {
    return this.list("team", page, repositoryContext);
  }

  followCompetition(competitionId: string, repositoryContext: RepositoryContext) {
    return this.follow("competition", competitionId, repositoryContext);
  }

  unfollowCompetition(competitionId: string, repositoryContext: RepositoryContext) {
    return this.unfollow("competition", competitionId, repositoryContext);
  }

  listCompetitions(page: CursorPageRequest, repositoryContext: RepositoryContext) {
    return this.list("competition", page, repositoryContext);
  }
}

function defaultRepository(): FollowRepository {
  return IS_MOCK_AUTH ? new LocalFollowRepository() : new SupabaseFollowRepository();
}

export class FollowService {
  constructor(
    private readonly repository: FollowRepository = defaultRepository(),
    private readonly repositoryContext: () => RepositoryContext = context,
  ) {}

  async getFollowedTeamIds(): Promise<string[]> {
    const page = await this.repository.listTeams({ limit: 100 }, this.repositoryContext());
    return page.items.map((follow) => follow.targetId);
  }

  async getFollowedTeams(language: Language): Promise<Club[]> {
    const [ids, clubs] = await Promise.all([
      this.getFollowedTeamIds(),
      footballService.getClubs(language),
    ]);
    const followed = new Set(ids);
    return clubs.filter((club) => followed.has(club.id));
  }

  async followTeam(teamId: string): Promise<void> {
    await this.repository.followTeam(teamId, this.repositoryContext());
  }

  async unfollowTeam(teamId: string): Promise<void> {
    await this.repository.unfollowTeam(teamId, this.repositoryContext());
  }
}

export const followService = new FollowService();
