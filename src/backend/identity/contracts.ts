import type { CursorPage, CursorPageRequest, RepositoryContext } from "../contracts/repository";

export type IdentityLanguage = "fr" | "ar";

export interface NotificationPreferencesDto {
  readonly matchAlerts: boolean;
  readonly breakingNews: boolean;
  readonly fantasyDeadlines: boolean;
}

export interface ProfileDto {
  readonly id: string;
  readonly username: string | null;
  readonly displayName: string;
  readonly avatarPath: string | null;
  readonly preferredLanguage: IdentityLanguage;
  readonly favoriteTeamId: string | null;
  readonly favoriteTeamReference: string | null;
  readonly onboardingCompletedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly notifications: NotificationPreferencesDto;
}

export interface UsernameAvailabilityDto {
  readonly available: boolean;
  readonly normalizedUsername: string;
  readonly reason: "invalid" | "reserved" | "taken" | null;
}

export interface CompleteOnboardingInput {
  readonly displayName: string;
  readonly username: string;
  readonly avatarPath: string | null;
  readonly preferredLanguage: IdentityLanguage;
  readonly favoriteTeamId?: string | null;
  readonly favoriteTeamReference?: string | null;
  readonly notifications: NotificationPreferencesDto;
}

export interface ProfileRepository {
  getMe(context: RepositoryContext): Promise<ProfileDto | null>;
  checkUsername(candidate: string, context: RepositoryContext): Promise<UsernameAvailabilityDto>;
  completeOnboarding(
    input: CompleteOnboardingInput,
    context: RepositoryContext,
  ): Promise<ProfileDto>;
  updatePreferences(
    language: IdentityLanguage,
    preferences: NotificationPreferencesDto,
    context: RepositoryContext,
  ): Promise<ProfileDto>;
}

export interface FollowDto {
  readonly targetId: string;
  readonly createdAt: string;
}

export interface FollowRepository {
  followTeam(teamId: string, context: RepositoryContext): Promise<void>;
  unfollowTeam(teamId: string, context: RepositoryContext): Promise<void>;
  listTeams(page: CursorPageRequest, context: RepositoryContext): Promise<CursorPage<FollowDto>>;
  followCompetition(competitionId: string, context: RepositoryContext): Promise<void>;
  unfollowCompetition(competitionId: string, context: RepositoryContext): Promise<void>;
  listCompetitions(
    page: CursorPageRequest,
    context: RepositoryContext,
  ): Promise<CursorPage<FollowDto>>;
}

/**
 * Phase 2 defines the user-ownership contract but intentionally does not create
 * a weak article reference table. The Supabase implementation arrives with the
 * canonical article UUID in Phase 4; the frozen mock adapter remains active now.
 */
export interface SavedArticleRepository {
  save(articleId: string, context: RepositoryContext): Promise<void>;
  unsave(articleId: string, context: RepositoryContext): Promise<void>;
  list(page: CursorPageRequest, context: RepositoryContext): Promise<CursorPage<FollowDto>>;
}

export type SessionRevocationScope = "local" | "global" | "others";

export interface AccountDeletionRequestDto {
  readonly id: string;
  readonly status: "requested" | "cancelled" | "processing" | "completed" | "rejected";
  readonly requestedAt: string;
  readonly executeAfter: string;
  readonly updatedAt: string;
  readonly processedAt: string | null;
}

export interface AccountSecurityRepository {
  requestDeletion(context: RepositoryContext): Promise<string>;
  cancelDeletion(context: RepositoryContext): Promise<void>;
  listDeletionRequests(context: RepositoryContext): Promise<readonly AccountDeletionRequestDto[]>;
  recordSessionRevocation(scope: SessionRevocationScope, context: RepositoryContext): Promise<void>;
}
