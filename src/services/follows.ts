import type { FollowDto, FollowRepository } from "@/backend/identity/contracts";
import { SupabaseFollowRepository } from "@/backend/identity/supabase-repositories";
import { authService, IS_MOCK_AUTH } from "@/services/auth";
import { footballService } from "@/services/football";
import type { Club, Language } from "@/types/domain";
import type {
  CursorPage,
  CursorPageRequest,
  RepositoryContext,
} from "@/backend/contracts/repository";

type FollowKind = "team" | "competition";

function localFollowKey(context: RepositoryContext, kind: FollowKind): string {
  return `botolago.follows.${context.actorId ?? "anonymous"}.${kind}`;
}

function readLocalFollows(context: RepositoryContext, kind: FollowKind): FollowDto[] {
  if (typeof window === "undefined" || !context.actorId) return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(localFollowKey(context, kind)) ?? "[]");
    return Array.isArray(value) ? (value as FollowDto[]) : [];
  } catch {
    return [];
  }
}

function writeLocalFollows(context: RepositoryContext, kind: FollowKind, items: FollowDto[]): void {
  if (typeof window === "undefined" || !context.actorId) return;
  window.localStorage.setItem(localFollowKey(context, kind), JSON.stringify(items));
}

export class LocalFollowRepository implements FollowRepository {
  private follow(targetId: string, context: RepositoryContext, kind: FollowKind) {
    const items = readLocalFollows(context, kind);
    if (items.some((item) => item.targetId === targetId)) return;
    writeLocalFollows(context, kind, [{ targetId, createdAt: new Date().toISOString() }, ...items]);
  }

  private unfollow(targetId: string, context: RepositoryContext, kind: FollowKind) {
    writeLocalFollows(
      context,
      kind,
      readLocalFollows(context, kind).filter((item) => item.targetId !== targetId),
    );
  }

  private list(
    page: CursorPageRequest,
    context: RepositoryContext,
    kind: FollowKind,
  ): CursorPage<FollowDto> {
    const limit = Math.min(Math.max(page.limit ?? 25, 1), 100);
    const items = readLocalFollows(context, kind).slice(0, limit);
    return { items, nextCursor: null };
  }

  async followTeam(teamId: string, context: RepositoryContext) {
    this.follow(teamId, context, "team");
  }

  async unfollowTeam(teamId: string, context: RepositoryContext) {
    this.unfollow(teamId, context, "team");
  }

  async listTeams(page: CursorPageRequest, context: RepositoryContext) {
    return this.list(page, context, "team");
  }

  async followCompetition(competitionId: string, context: RepositoryContext) {
    this.follow(competitionId, context, "competition");
  }

  async unfollowCompetition(competitionId: string, context: RepositoryContext) {
    this.unfollow(competitionId, context, "competition");
  }

  async listCompetitions(page: CursorPageRequest, context: RepositoryContext) {
    return this.list(page, context, "competition");
  }
}

function context(): RepositoryContext {
  return {
    actorId: authService.getSession().user?.id ?? null,
    requestId: globalThis.crypto?.randomUUID?.() ?? `follow-${Date.now().toString(36)}`,
  };
}

export class FollowService {
  constructor(
    private readonly repository: FollowRepository = IS_MOCK_AUTH
      ? new LocalFollowRepository()
      : new SupabaseFollowRepository(),
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
