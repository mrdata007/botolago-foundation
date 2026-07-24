import type { RepositoryContext } from "@/backend/contracts/repository";
import type { FollowRepository } from "@/backend/identity/contracts";
import { SupabaseFollowRepository } from "@/backend/identity/supabase-repositories";
import { authService } from "@/services/auth";
import { footballService } from "@/services/football";
import type { Club, Language } from "@/types/domain";

function context(): RepositoryContext {
  return {
    actorId: authService.getSession().user?.id ?? null,
    requestId: globalThis.crypto?.randomUUID?.() ?? `follow-${Date.now().toString(36)}`,
  };
}

export class FollowService {
  constructor(
    private readonly repository: FollowRepository = new SupabaseFollowRepository(),
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
