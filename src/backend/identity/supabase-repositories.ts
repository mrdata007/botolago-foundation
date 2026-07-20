import type { PostgrestError } from "@supabase/supabase-js";
import type { CursorPage, CursorPageRequest, RepositoryContext } from "../contracts/repository";
import { identityApi } from "@/integrations/supabase/v2-client";
import type { Database } from "../generated/database.types";
import {
  type AccountDeletionRequestDto,
  type AccountSecurityRepository,
  type CompleteOnboardingInput,
  type FollowDto,
  type FollowRepository,
  type ProfileDto,
  type ProfileRepository,
  type SessionRevocationScope,
  type UsernameAvailabilityDto,
} from "./contracts";
import { IdentityError, mapIdentityError } from "./errors";
import { normalizeCanonicalUsername } from "./username";

type ProfileRow = Database["api"]["Views"]["my_profile"]["Row"];

function requireActor(context: RepositoryContext): void {
  if (!context.actorId) {
    throw new IdentityError("unauthorized", "Authentication is required.");
  }
}

function requireValue<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new IdentityError("internal", `The ${label} contract is incomplete.`);
  }
  return value;
}

function mapProfile(row: ProfileRow): ProfileDto {
  return {
    id: requireValue(row.id, "profile id"),
    username: row.username,
    displayName: row.display_name ?? "",
    avatarPath: row.avatar_url,
    preferredLanguage: row.preferred_language ?? "fr",
    favoriteTeamId: row.favorite_team_id,
    favoriteTeamReference: row.favorite_team_provisional_ref,
    onboardingCompletedAt: row.onboarding_completed_at,
    createdAt: requireValue(row.created_at, "profile creation timestamp"),
    updatedAt: requireValue(row.updated_at, "profile update timestamp"),
    notifications: {
      matchAlerts: row.match_alerts ?? true,
      breakingNews: row.breaking_news ?? true,
      fantasyDeadlines: row.fantasy_deadline_reminders ?? true,
    },
  };
}

function throwIfError(error: PostgrestError | null): void {
  if (error) throw mapIdentityError(error);
}

export class SupabaseProfileRepository implements ProfileRepository {
  async getMe(context: RepositoryContext): Promise<ProfileDto | null> {
    requireActor(context);
    const { data, error } = await identityApi.from("my_profile").select("*").maybeSingle();
    throwIfError(error);
    return data ? mapProfile(data) : null;
  }

  async checkUsername(
    candidate: string,
    _context: RepositoryContext,
  ): Promise<UsernameAvailabilityDto> {
    const { data, error } = await identityApi.rpc("username_availability", { candidate });
    throwIfError(error);
    const result = data?.[0];
    if (!result) throw new IdentityError("internal", "Username availability returned no result.");
    const reason = result.reason as UsernameAvailabilityDto["reason"];
    return {
      available: result.available,
      normalizedUsername: result.normalized_username,
      reason,
    };
  }

  async completeOnboarding(
    input: CompleteOnboardingInput,
    context: RepositoryContext,
  ): Promise<ProfileDto> {
    requireActor(context);
    const { error } = await identityApi.rpc("complete_onboarding", {
      display_name: input.displayName.trim(),
      username: normalizeCanonicalUsername(input.username),
      avatar_path: input.avatarPath as string,
      preferred_language: input.preferredLanguage,
      favorite_team_id: input.favoriteTeamId ?? undefined,
      favorite_team_provisional_ref: input.favoriteTeamReference ?? undefined,
      match_alerts: input.notifications.matchAlerts,
      breaking_news: input.notifications.breakingNews,
      fantasy_deadline_reminders: input.notifications.fantasyDeadlines,
    });
    throwIfError(error);
    const profile = await this.getMe(context);
    if (!profile) throw new IdentityError("not_found", "The profile was not found.");
    return profile;
  }

  async updatePreferences(
    language: "fr" | "ar",
    preferences: ProfileDto["notifications"],
    context: RepositoryContext,
  ): Promise<ProfileDto> {
    requireActor(context);
    const { error } = await identityApi.rpc("update_my_preferences", {
      preferred_language: language,
      match_alerts: preferences.matchAlerts,
      breaking_news: preferences.breakingNews,
      fantasy_deadline_reminders: preferences.fantasyDeadlines,
    });
    throwIfError(error);
    const profile = await this.getMe(context);
    if (!profile) throw new IdentityError("not_found", "The profile was not found.");
    return profile;
  }
}

interface FollowViewRow {
  readonly targetId: string | null;
  readonly createdAt: string | null;
}

function normalizePage(page: CursorPageRequest): { limit: number; cursor: FollowDto | null } {
  const limit = Math.min(Math.max(page.limit ?? 25, 1), 100);
  if (!page.cursor) return { limit, cursor: null };
  try {
    const decoded = decodeURIComponent(page.cursor);
    const divider = decoded.indexOf("|");
    const createdAt = decoded.slice(0, divider);
    const targetId = decoded.slice(divider + 1);
    if (divider < 1 || Number.isNaN(Date.parse(createdAt)) || !isUuid(targetId)) throw new Error();
    return { limit, cursor: { createdAt, targetId } };
  } catch {
    throw new IdentityError("invalid_profile", "The pagination cursor is invalid.");
  }
}

function toCursor(item: FollowDto): string {
  return encodeURIComponent(`${item.createdAt}|${item.targetId}`);
}

async function listFollows(
  kind: "team" | "competition",
  page: CursorPageRequest,
  context: RepositoryContext,
): Promise<CursorPage<FollowDto>> {
  requireActor(context);
  const { limit, cursor } = normalizePage(page);
  const relation = kind === "team" ? "my_followed_teams" : "my_followed_competitions";
  const idColumn = kind === "team" ? "team_id" : "competition_id";
  let query = identityApi
    .from(relation)
    .select("*")
    .order("created_at", { ascending: false })
    .order(idColumn, { ascending: false })
    .limit(limit + 1);
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},${idColumn}.lt.${cursor.targetId})`,
    );
  }
  const { data, error } = await query;
  throwIfError(error);
  const rows = (data ?? []).map((row) => ({
    targetId: "team_id" in row ? row.team_id : row.competition_id,
    createdAt: row.created_at,
  })) as FollowViewRow[];
  const mapped = rows.map((row) => ({
    targetId: requireValue(row.targetId, `${kind} id`),
    createdAt: requireValue(row.createdAt, "follow timestamp"),
  }));
  const hasMore = mapped.length > limit;
  const items = mapped.slice(0, limit);
  return { items, nextCursor: hasMore ? toCursor(items[items.length - 1]!) : null };
}

export class SupabaseFollowRepository implements FollowRepository {
  async followTeam(teamId: string, context: RepositoryContext): Promise<void> {
    requireActor(context);
    requireUuid(teamId, "team");
    const { error } = await identityApi.rpc("follow_team", { p_team_id: teamId });
    throwIfError(error);
  }
  async unfollowTeam(teamId: string, context: RepositoryContext): Promise<void> {
    requireActor(context);
    requireUuid(teamId, "team");
    const { error } = await identityApi.rpc("unfollow_team", { p_team_id: teamId });
    throwIfError(error);
  }
  listTeams(page: CursorPageRequest, context: RepositoryContext) {
    return listFollows("team", page, context);
  }
  async followCompetition(competitionId: string, context: RepositoryContext): Promise<void> {
    requireActor(context);
    requireUuid(competitionId, "competition");
    const { error } = await identityApi.rpc("follow_competition", {
      p_competition_id: competitionId,
    });
    throwIfError(error);
  }
  async unfollowCompetition(competitionId: string, context: RepositoryContext): Promise<void> {
    requireActor(context);
    requireUuid(competitionId, "competition");
    const { error } = await identityApi.rpc("unfollow_competition", {
      p_competition_id: competitionId,
    });
    throwIfError(error);
  }
  listCompetitions(page: CursorPageRequest, context: RepositoryContext) {
    return listFollows("competition", page, context);
  }
}

export class SupabaseAccountSecurityRepository implements AccountSecurityRepository {
  async requestDeletion(context: RepositoryContext): Promise<string> {
    requireActor(context);
    const { data, error } = await identityApi.rpc("request_account_deletion");
    throwIfError(error);
    return requireValue(data, "account deletion request id");
  }
  async cancelDeletion(context: RepositoryContext): Promise<void> {
    requireActor(context);
    const { error } = await identityApi.rpc("cancel_account_deletion");
    throwIfError(error);
  }
  async listDeletionRequests(
    context: RepositoryContext,
  ): Promise<readonly AccountDeletionRequestDto[]> {
    requireActor(context);
    const { data, error } = await identityApi
      .from("my_account_deletion_requests")
      .select("*")
      .order("requested_at", { ascending: false });
    throwIfError(error);
    return (data ?? []).map((row) => ({
      id: requireValue(row.id, "deletion request id"),
      status: requireValue(row.status, "deletion request status"),
      requestedAt: requireValue(row.requested_at, "deletion request timestamp"),
      updatedAt: requireValue(row.updated_at, "deletion request update timestamp"),
      processedAt: row.processed_at,
    }));
  }
  async recordSessionRevocation(
    scope: SessionRevocationScope,
    context: RepositoryContext,
  ): Promise<void> {
    requireActor(context);
    const { error } = await identityApi.rpc("record_session_revocation", { scope });
    throwIfError(error);
  }
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function requireUuid(value: string, label: string): void {
  if (!isUuid(value)) throw new IdentityError("invalid_profile", `The ${label} id is invalid.`);
}
