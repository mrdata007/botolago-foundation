// Production Supabase-backed AuthService.
// Supabase Auth owns sessions; identity data is accessed only through the
// greenfield API schema and repository contracts.

import { supabase } from "@/integrations/supabase/client";
import {
  SupabaseAccountSecurityRepository,
  SupabaseProfileRepository,
} from "@/backend/identity/supabase-repositories";
import type { ProfileDto } from "@/backend/identity/contracts";
import { IdentityError, mapIdentityError } from "@/backend/identity/errors";
import type { RepositoryContext } from "@/backend/contracts/repository";
import type {
  AccountDeletionRequest,
  AuthErrorCode,
  AuthResult,
  AuthService,
  AuthSession,
  AuthUser,
  CompleteProfileInput,
  RegisterInput,
  SignOutOptions,
  UpdatePasswordInput,
} from "./auth-types";
import { defaultNotifications } from "./auth-types";
import {
  deleteAvatar,
  signedAvatarUrl,
  uploadAvatarFromDataUrl,
} from "./profiles-repo";
import type { AuthError, Session, User } from "@supabase/supabase-js";
import { sanitizeAuthCallbackNext } from "@/lib/auth-callback";
import { AsyncSessionFence } from "@/lib/async-session-fence";

const K_GUEST = "botolago.auth.guest";
const K_LEGACY_PREFIX = "botolago.auth.";
const profiles = new SupabaseProfileRepository();
const accountSecurity = new SupabaseAccountSecurityRepository();

function hasWindow() {
  return typeof window !== "undefined";
}

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `web-${Date.now().toString(36)}`;
}

function context(actorId: string | null): RepositoryContext {
  return { actorId, requestId: requestId() };
}

function getRedirectBase(): string {
  if (!hasWindow()) return "";
  return window.location.origin;
}

function getCallbackUrl(next?: string): string {
  const safeNext = sanitizeAuthCallbackNext(next ?? null);
  return `${getRedirectBase()}/auth/callback?next=${encodeURIComponent(safeNext)}`;
}

function mapAuthError(err: AuthError | null | undefined): AuthErrorCode {
  if (!err) return "generic";
  const msg = (err.message ?? "").toLowerCase();
  const status = err.status ?? 0;
  if (status === 429 || msg.includes("rate limit")) return "rate_limited";
  if (status === 401 || msg.includes("session_not_found"))
    return "session_expired";
  if (msg.includes("invalid login") || msg.includes("invalid credentials"))
    return "credentials";
  if (
    msg.includes("email not confirmed") ||
    msg.includes("email_not_confirmed")
  )
    return "email_unconfirmed";
  if (msg.includes("already registered") || msg.includes("user already"))
    return "email_taken";
  if (msg.includes("otp") && msg.includes("expired")) return "otp_expired";
  if (msg.includes("token has expired or is invalid")) return "otp_expired";
  if (msg.includes("token") && msg.includes("expired"))
    return "invalid_reset_token";
  if (msg.includes("invalid otp")) return "otp_invalid";
  if (msg.includes("invalid token")) return "invalid_reset_token";
  if (msg.includes("weak password") || msg.includes("password should"))
    return "weak_password";
  if (
    msg.includes("provider is not enabled") ||
    msg.includes("provider disabled")
  )
    return "provider_unavailable";
  if (msg.includes("failed to fetch") || msg.includes("network"))
    return "network";
  if (msg.includes("username_taken")) return "username_taken";
  if (msg.includes("reserved_username") || msg.includes("username_reserved"))
    return "reserved_username";
  if (msg.includes("invalid_username") || msg.includes("username_invalid"))
    return "invalid_username";
  return "generic";
}

function mapIdentityCode(error: unknown): AuthErrorCode {
  const code = mapIdentityError(error).code;
  switch (code) {
    case "username_taken":
    case "invalid_username":
    case "reserved_username":
    case "unauthorized":
    case "session_expired":
    case "invalid_reset_token":
    case "rate_limited":
    case "network":
      return code;
    case "email_unverified":
      return "email_unconfirmed";
    default:
      return "generic";
  }
}

export { mapAuthError as __mapAuthErrorForTests };

async function buildAuthUser(
  user: User,
  profile: ProfileDto | null,
  profileAvailable = true,
): Promise<AuthUser> {
  const displayName =
    profile?.displayName.trim() ||
    String(
      user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? "",
    ).trim();
  const username =
    profile?.username?.trim() ||
    String(user.user_metadata?.username ?? "").trim();
  const avatarPath = profile?.avatarPath ?? undefined;
  const avatarDataUrl = avatarPath
    ? ((await signedAvatarUrl(avatarPath).catch(() => null)) ?? undefined)
    : undefined;
  const rawProvider = String(user.app_metadata?.provider ?? "email");
  const provider: AuthUser["provider"] =
    rawProvider === "google"
      ? "google"
      : rawProvider === "apple"
        ? "apple"
        : "email";

  return {
    id: user.id,
    email: user.email ?? "",
    displayName,
    username,
    avatarPath,
    avatarDataUrl,
    favoriteClubId:
      profile?.favoriteTeamReference ?? profile?.favoriteTeamId ?? undefined,
    language: profile?.preferredLanguage ?? "fr",
    notifications: profile?.notifications ?? defaultNotifications(),
    profileComplete: profileAvailable
      ? profile?.onboardingCompletedAt != null
      : true,
    profileAvailable,
    createdAt:
      profile?.createdAt ?? user.created_at ?? new Date().toISOString(),
    verified: !!user.email_confirmed_at,
    provider,
  };
}

export class SupabaseAuthService implements AuthService {
  private listeners = new Set<(session: AuthSession) => void>();
  private cachedSession: AuthSession = { user: null, status: "loading" };
  private initialized = false;
  private readonly sessionFence = new AsyncSessionFence();

  private emit(session: AuthSession) {
    this.cachedSession = session;
    for (const listener of this.listeners) listener(session);
  }

  private init() {
    if (this.initialized || !hasWindow()) return;
    this.initialized = true;
    const initialSnapshot = this.sessionFence.snapshot();
    void supabase.auth.getSession().then(({ data }) => {
      // A SIGNED_OUT/SIGNED_IN event can arrive before getSession resolves.
      // Never allow that older snapshot to overwrite the newer event.
      if (this.sessionFence.isCurrent(initialSnapshot))
        this.scheduleSession(data.session);
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      this.scheduleSession(session);
    });
  }

  private scheduleSession(session: Session | null): void {
    const revision = this.sessionFence.begin();
    void this.applySession(session, revision);
  }

  private async loadProfile(
    userId: string,
  ): Promise<{ profile: ProfileDto | null; available: boolean }> {
    // The signup trigger commits before Auth returns. A small bounded retry also
    // handles the first OAuth callback racing the Data API replica.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const profile = await profiles.getMe(context(userId));
        if (profile) return { profile, available: true };
      } catch (error) {
        if (mapIdentityError(error).code !== "not_found") {
          // A provider/API outage is not a genuinely missing profile. Treating
          // it as missing would route an existing user into destructive setup.
          return { profile: null, available: false };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 150 + attempt * 100));
    }
    return { profile: null, available: true };
  }

  private async resolveAuthUser(user: User): Promise<AuthUser> {
    const result = await this.loadProfile(user.id);
    return buildAuthUser(user, result.profile, result.available);
  }

  private async applySession(session: Session | null, revision: number) {
    if (!this.sessionFence.isCurrent(revision)) return;
    if (!session?.user) {
      const guest = hasWindow() && window.localStorage.getItem(K_GUEST) === "1";
      if (this.sessionFence.isCurrent(revision)) {
        this.emit({ user: null, status: guest ? "guest" : "anonymous" });
      }
      return;
    }
    if (hasWindow()) window.localStorage.removeItem(K_GUEST);
    const user = await this.resolveAuthUser(session.user);
    if (this.sessionFence.isCurrent(revision)) {
      this.emit({ user, status: "authenticated" });
    }
  }

  getSession(): AuthSession {
    this.init();
    if (!hasWindow()) return { user: null, status: "loading" };
    if (
      this.cachedSession.status === "loading" &&
      window.localStorage.getItem(K_GUEST) === "1"
    )
      return { user: null, status: "guest" };
    return this.cachedSession;
  }

  subscribeToSession(listener: (session: AuthSession) => void): () => void {
    this.init();
    this.listeners.add(listener);
    listener(this.getSession());
    return () => void this.listeners.delete(listener);
  }

  async signInWithEmail(
    email: string,
    password: string,
  ): Promise<AuthResult<AuthUser>> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error || !data.user)
      return { ok: false, errorCode: mapAuthError(error) };
    const authUser = await this.resolveAuthUser(data.user);
    return { ok: true, data: authUser };
  }

  async registerWithEmail(
    input: RegisterInput,
  ): Promise<AuthResult<{ email: string }>> {
    const { data, error } = await supabase.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        emailRedirectTo: hasWindow() ? getCallbackUrl(input.next) : undefined,
        data: {
          display_name: input.fullName.trim(),
          username: input.username.trim(),
          preferred_language: input.language,
        },
      },
    });
    if (error) return { ok: false, errorCode: mapAuthError(error) };
    return {
      ok: true,
      data: { email: (data.user?.email ?? input.email).trim() },
    };
  }

  async requestPasswordReset(email: string): Promise<AuthResult> {
    const redirectTo = hasWindow()
      ? `${getRedirectBase()}/auth/callback?next=/auth/update-password`
      : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });
    // Prevent account enumeration while still surfacing transport failures.
    if (error && mapAuthError(error) === "network")
      return { ok: false, errorCode: "network" };
    if (error && mapAuthError(error) === "rate_limited")
      return { ok: false, errorCode: "rate_limited" };
    return { ok: true };
  }

  async reauthenticate(): Promise<AuthResult> {
    const { error } = await supabase.auth.reauthenticate();
    return error ? { ok: false, errorCode: mapAuthError(error) } : { ok: true };
  }

  async refreshSession(): Promise<AuthResult<AuthUser>> {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.user) return { ok: false, errorCode: "session_expired" };
    const user = await this.resolveAuthUser(data.user);
    return { ok: true, data: user };
  }

  async updatePassword(input: UpdatePasswordInput): Promise<AuthResult> {
    const { error } = await supabase.auth.updateUser({
      password: input.password,
      nonce: input.nonce,
      current_password: input.currentPassword,
    });
    return error ? { ok: false, errorCode: mapAuthError(error) } : { ok: true };
  }

  async verifyCode(email: string, code: string): Promise<AuthResult<AuthUser>> {
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    if (error || !data.user)
      return { ok: false, errorCode: mapAuthError(error) };
    const user = await this.resolveAuthUser(data.user);
    return { ok: true, data: user };
  }

  async resendCode(email: string, next?: string): Promise<AuthResult> {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: {
        emailRedirectTo: hasWindow() ? getCallbackUrl(next) : undefined,
      },
    });
    return error ? { ok: false, errorCode: mapAuthError(error) } : { ok: true };
  }

  private async signInWithOAuthProvider(
    provider: "google" | "apple",
    next?: string,
  ): Promise<AuthResult<AuthUser>> {
    if (!hasWindow()) return { ok: false, errorCode: "generic" };
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: getCallbackUrl(next) },
    });
    return error ? { ok: false, errorCode: mapAuthError(error) } : { ok: true };
  }

  signInWithGoogle(next?: string) {
    return this.signInWithOAuthProvider("google", next);
  }

  signInWithApple(next?: string) {
    return this.signInWithOAuthProvider("apple", next);
  }

  async continueAsGuest(): Promise<AuthResult> {
    if (hasWindow()) window.localStorage.setItem(K_GUEST, "1");
    this.sessionFence.invalidate();
    this.emit({ user: null, status: "guest" });
    return { ok: true };
  }

  async completeProfile(
    input: CompleteProfileInput,
  ): Promise<AuthResult<AuthUser>> {
    const current = this.cachedSession.user;
    if (this.cachedSession.status !== "authenticated" || !current)
      return { ok: false, errorCode: "unauthorized" };
    const actorId = current.id;
    const username = input.username?.trim() || current.username.trim();
    if (!username) return { ok: false, errorCode: "invalid_username" };

    const oldAvatarPath = current.avatarPath;
    let nextAvatarPath = input.removeAvatar ? null : (oldAvatarPath ?? null);
    let uploadedPath: string | null = null;
    if (!input.removeAvatar && input.avatarDataUrl?.startsWith("data:")) {
      const uploaded = await uploadAvatarFromDataUrl(
        current.id,
        input.avatarDataUrl,
      );
      if (!uploaded.ok) return { ok: false, errorCode: "generic" };
      uploadedPath = uploaded.path;
      nextAvatarPath = uploaded.path;
    }

    if (this.cachedSession.user?.id !== actorId) {
      if (uploadedPath && uploadedPath !== oldAvatarPath)
        await deleteAvatar(uploadedPath);
      return { ok: false, errorCode: "session_expired" };
    }

    try {
      const profile = await profiles.completeOnboarding(
        {
          displayName: input.displayName?.trim() || current.displayName,
          username,
          avatarPath: nextAvatarPath,
          preferredLanguage: input.language ?? current.language,
          favoriteTeamReference:
            input.favoriteClubId ?? current.favoriteClubId ?? null,
          notifications: {
            ...current.notifications,
            ...(input.notifications ?? {}),
          },
        },
        context(actorId),
      );
      if (oldAvatarPath && oldAvatarPath !== nextAvatarPath)
        await deleteAvatar(oldAvatarPath);
      const { data } = await supabase.auth.getUser();
      if (
        !data.user ||
        data.user.id !== actorId ||
        this.cachedSession.user?.id !== actorId
      ) {
        return { ok: false, errorCode: "session_expired" };
      }
      const user = await buildAuthUser(data.user, profile);
      this.sessionFence.invalidate();
      this.emit({ user, status: "authenticated" });
      return { ok: true, data: user };
    } catch (error) {
      // A newly-created path is safe to remove. If an existing deterministic
      // path was overwritten, retain it because the profile still references it.
      if (uploadedPath && uploadedPath !== oldAvatarPath)
        await deleteAvatar(uploadedPath);
      return { ok: false, errorCode: mapIdentityCode(error) };
    }
  }

  async requestAccountDeletion(): Promise<AuthResult<{ requestId: string }>> {
    const actorId = this.cachedSession.user?.id ?? null;
    try {
      const id = await accountSecurity.requestDeletion(context(actorId));
      return { ok: true, data: { requestId: id } };
    } catch (error) {
      return { ok: false, errorCode: mapIdentityCode(error) };
    }
  }

  async getAccountDeletionRequests(): Promise<
    AuthResult<readonly AccountDeletionRequest[]>
  > {
    const actorId = this.cachedSession.user?.id ?? null;
    try {
      const requests = await accountSecurity.listDeletionRequests(
        context(actorId),
      );
      return {
        ok: true,
        data: requests.map((request) => ({
          requestId: request.id,
          status: request.status,
          requestedAt: request.requestedAt,
          executeAfter: request.executeAfter,
          updatedAt: request.updatedAt,
          processedAt: request.processedAt,
        })),
      };
    } catch (error) {
      return { ok: false, errorCode: mapIdentityCode(error) };
    }
  }

  async cancelAccountDeletion(): Promise<AuthResult> {
    const actorId = this.cachedSession.user?.id ?? null;
    try {
      await accountSecurity.cancelDeletion(context(actorId));
      return { ok: true };
    } catch (error) {
      return { ok: false, errorCode: mapIdentityCode(error) };
    }
  }

  async signOut(options?: SignOutOptions): Promise<void> {
    const scope = options?.scope ?? "local";
    const actorId = this.cachedSession.user?.id ?? null;
    if (actorId) {
      await accountSecurity
        .recordSessionRevocation(scope, context(actorId))
        .catch(() => undefined);
    }
    const { error } = await supabase.auth.signOut({ scope });
    if (error) throw error;
    this.sessionFence.invalidate();
    if (hasWindow()) {
      window.localStorage.removeItem(K_GUEST);
      if (options?.resetLocalData) {
        [
          "botolago.fantasy.team",
          "botolago.fantasy.bank",
          "botolago.fantasy.transfers",
        ].forEach((key) => window.localStorage.removeItem(key));
      }
      try {
        Object.keys(window.localStorage)
          .filter((key) => key.startsWith(K_LEGACY_PREFIX) && key !== K_GUEST)
          .forEach((key) => window.localStorage.removeItem(key));
      } catch {
        // Browser privacy modes may deny localStorage enumeration.
      }
    }
    if (scope !== "others") this.emit({ user: null, status: "anonymous" });
  }
}

// Retained as a named export for tests and consumers that discriminate errors.
export { IdentityError };
