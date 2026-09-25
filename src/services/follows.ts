import { queryOptions } from "@tanstack/react-query";
import type { RepositoryContext } from "@/backend/contracts/repository";
import type { FollowRepository } from "@/backend/identity/contracts";
import { SupabaseFollowRepository } from "@/backend/identity/supabase-repositories";
import { authService, IS_MOCK_AUTH } from "@/services/auth";
import { footballService } from "@/services/football";
import type { Club, Language } from "@/types/domain";

/** Every account's followed-club ids, for invalidation after a follow or unfollow. */
export const FOLLOWED_TEAM_IDS_QUERY_KEY = ["identity", "followed-team-ids"] as const;

/** One account's followed-club ids. The account id is part of the key. */
export function followedTeamIdsQueryKey(userId: string | null) {
  return [...FOLLOWED_TEAM_IDS_QUERY_KEY, userId] as const;
}

/**
 * The followed-club ids of the signed-in account `userId`, shared by the club
 * page's follow button, News and Profile. Asked only for a real account: with
 * nobody signed in (or a second factor still owed, where the session's user is
 * null) there is no entry at all rather than an empty list under a shared key.
 * Mock auth has no follow store behind it, so it is never asked there.
 */
export function followedTeamIdsQuery(userId: string | null) {
  return queryOptions({
    queryKey: followedTeamIdsQueryKey(userId),
    queryFn: () => followService.getFollowedTeamIds(),
    enabled: !IS_MOCK_AUTH && userId !== null,
  });
}

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
