// Production Supabase-backed AuthService.
// Supabase Auth owns sessions; identity data is accessed only through the
// greenfield API schema and repository contracts.

import { supabase } from "@/integrations/supabase/client";
import {
  SupabaseAccountSecurityRepository,
  SupabaseProfileRepository,
} from "@/backend/identity/supabase-repositories";
import type {
  AccountSecurityRepository,
  ProfileDto,
  ProfileRepository,
} from "@/backend/identity/contracts";
import { IdentityError, mapIdentityError } from "@/backend/identity/errors";
import type { RepositoryContext } from "@/backend/contracts/repository";
import { sessionAssuranceOf } from "@/backend/auth/mfa";
import { sessionAccountId, sessionForAssurance } from "@/auth/second-factor";
import type {
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
import { deleteAvatar, signedAvatarUrl, uploadAvatarFromDataUrl } from "./profiles-repo";
import type { AuthError, Session, SupabaseClient, User } from "@supabase/supabase-js";
import { sanitizeAuthCallbackNext } from "@/lib/auth-callback";

const K_GUEST = "botolago.auth.guest";
const K_LEGACY_PREFIX = "botolago.auth.";
const defaultProfiles = new SupabaseProfileRepository();
const defaultAccountSecurity = new SupabaseAccountSecurityRepository();

type SupabaseAuthClient = SupabaseClient["auth"];

/**
 * What the service talks to, replaceable in tests. All default to the app's
 * own. `auth` is a thunk because the shared client is built on first touch and
 * throws there when the environment has no Supabase configuration.
 */
export interface SupabaseAuthDependencies {
  readonly auth?: () => SupabaseAuthClient;
  readonly profiles?: Pick<ProfileRepository, "getMe" | "completeOnboarding">;
  readonly accountSecurity?: AccountSecurityRepository;
}

function hasWindow() {
  return typeof window !== "undefined";
}

// A browser that blocks site data throws on the first touch of `localStorage`
// instead of returning null, and `hasWindow()` does not catch that. Reading the
// guest flag unguarded put the whole app on the error screen at start-up. Where
// storage is refused, "guest" simply lasts until the page is reloaded.
function readGuestFlag(): boolean {
  if (!hasWindow()) return false;
  try {
    return window.localStorage.getItem(K_GUEST) === "1";
  } catch {
    return false;
  }
}

function writeGuestFlag(guest: boolean): void {
  if (!hasWindow()) return;
  try {
    if (guest) window.localStorage.setItem(K_GUEST, "1");
    else window.localStorage.removeItem(K_GUEST);
  } catch {
    /* refused: see readGuestFlag */
  }
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
  if (status === 401 || msg.includes("session_not_found")) return "session_expired";
  if (msg.includes("invalid login") || msg.includes("invalid credentials")) return "credentials";
  if (msg.includes("email not confirmed") || msg.includes("email_not_confirmed"))
    return "email_unconfirmed";
  if (msg.includes("already registered") || msg.includes("user already")) return "email_taken";
  if (msg.includes("otp") && msg.includes("expired")) return "otp_expired";
  if (msg.includes("token has expired or is invalid")) return "otp_expired";
  if (msg.includes("token") && msg.includes("expired")) return "invalid_reset_token";
  if (msg.includes("invalid otp")) return "otp_invalid";
  if (msg.includes("invalid token")) return "invalid_reset_token";
  if (msg.includes("weak password") || msg.includes("password should")) return "weak_password";
  if (msg.includes("provider is not enabled") || msg.includes("provider disabled"))
    return "provider_unavailable";
  if (msg.includes("failed to fetch") || msg.includes("network")) return "network";
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
    case "mfa_required":
      return code;
    case "email_unverified":
      return "email_unconfirmed";
    default:
      return "generic";
  }
}

export { mapAuthError as __mapAuthErrorForTests };

async function buildAuthUser(user: User, profile: ProfileDto | null): Promise<AuthUser> {
  const displayName =
    profile?.displayName.trim() ||
    String(user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? "").trim();
  const username = profile?.username?.trim() || String(user.user_metadata?.username ?? "").trim();
  const avatarPath = profile?.avatarPath ?? undefined;
  const avatarDataUrl = avatarPath
    ? ((await signedAvatarUrl(avatarPath).catch(() => null)) ?? undefined)
    : undefined;
  const rawProvider = String(user.app_metadata?.provider ?? "email");
  const provider: AuthUser["provider"] =
    rawProvider === "google" ? "google" : rawProvider === "apple" ? "apple" : "email";

  return {
    id: user.id,
    email: user.email ?? "",
    displayName,
    username,
    avatarPath,
    avatarDataUrl,
    favoriteClubId: profile?.favoriteTeamReference ?? profile?.favoriteTeamId ?? undefined,
    language: profile?.preferredLanguage ?? "fr",
    notifications: profile?.notifications ?? defaultNotifications(),
    profileComplete: profile?.onboardingCompletedAt != null,
    createdAt: profile?.createdAt ?? user.created_at ?? new Date().toISOString(),
    verified: !!user.email_confirmed_at,
    provider,
  };
}

export class SupabaseAuthService implements AuthService {
  private listeners = new Set<(session: AuthSession) => void>();
  private cachedSession: AuthSession = { user: null, status: "loading" };
  private initialized = false;
  /**
   * Moves on every published session and every resolution that starts. A
   * resolution (profile read and avatar signing, both awaited) publishes
   * only if nothing moved it in the meantime. Without this a slow resolution
   * of account A -- its profile read retries for up to a second -- could land
   * after A signed out, or after B signed in, and put A back on screen. The
   * order resolutions start in is the order auth-js observed the sessions:
   * it answers session reads and emits its events behind one lock.
   */
  private revision = 0;

  constructor(private readonly deps: SupabaseAuthDependencies = {}) {}

  private get auth(): SupabaseAuthClient {
    return this.deps.auth ? this.deps.auth() : supabase.auth;
  }

  private get profiles(): Pick<ProfileRepository, "getMe" | "completeOnboarding"> {
    return this.deps.profiles ?? defaultProfiles;
  }

  private get accountSecurity(): AccountSecurityRepository {
    return this.deps.accountSecurity ?? defaultAccountSecurity;
  }

  private emit(session: AuthSession) {
    this.revision++;
    this.cachedSession = session;
    for (const listener of this.listeners) listener(session);
  }

  private init() {
    if (this.initialized || !hasWindow()) return;
    this.initialized = true;
    void this.auth.getSession().then(({ data }) => this.applySession(data.session));
    this.auth.onAuthStateChange((_event, session) => {
      void this.applySession(session);
    });
  }

  private async loadProfile(userId: string): Promise<ProfileDto | null> {
    // The signup trigger commits before Auth returns. A small bounded retry also
    // handles the first OAuth callback racing the Data API replica.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const profile = await this.profiles.getMe(context(userId));
        if (profile) return profile;
      } catch (error) {
        if (attempt === 3 || mapIdentityError(error).code !== "not_found") return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 150 + attempt * 100));
    }
    return null;
  }

  /**
   * Who a Supabase session's user is and how far that session has got with
   * its second factor. Every path that publishes a signed-in session comes
   * through here: the password form, the e-mail code, the callback's refresh,
   * a token refresh, a restored session. The callback used to publish
   * "authenticated" straight from its refresh.
   *
   * Everything is read from `session` itself. The level used to come from
   * `mfa.getAuthenticatorAssuranceLevel()`, which judges whichever session
   * storage holds when it runs: with another tab signing in meanwhile, the
   * user of this session was published at the other session's level. The
   * profile read goes out with whatever token the client holds at that moment
   * too, so a profile that is not this user's is not used either.
   */
  private async resolveSignedIn(
    session: Session,
    knownProfile?: ProfileDto | null,
  ): Promise<{ authUser: AuthUser; session: AuthSession }> {
    const { user } = session;
    const assurance = sessionAssuranceOf(session);
    const read = knownProfile !== undefined ? knownProfile : await this.loadProfile(user.id);
    const profile = read?.id === user.id ? read : null;
    const authUser = await buildAuthUser(user, profile);
    return { authUser, session: sessionForAssurance(authUser, assurance) };
  }

  /**
   * Resolve, publish unless superseded, and return what this session resolved
   * to.
   *
   * A session for another account than the one on screen takes that account
   * off the screen at once, before anything is awaited: `loading`, with nobody
   * in it. Until 2026-09-25 nothing was published until the new account had
   * been resolved -- a profile read of up to four attempts of 10 s each, then
   * an avatar signing with no deadline -- and all that time the app showed
   * account A while every request already carried account B's token (another
   * tab had signed B in). A's Pronostics queue, asking whether the session was
   * still A's, heard yes and sent A's unsent picks as B's. Now the leave runs
   * straight away (AuthProvider forgets A, the owned queues stop), and B
   * follows once resolved. The same account's new token (a refresh, the code
   * entered) keeps its screen while it resolves, as before.
   */
  private async publishSignedIn(session: Session, knownProfile?: ProfileDto | null) {
    const shown = sessionAccountId(this.cachedSession);
    if (shown && shown !== session.user.id) this.emit({ user: null, status: "loading" });
    const revision = ++this.revision;
    const resolved = await this.resolveSignedIn(session, knownProfile);
    if (revision === this.revision) this.emit(resolved.session);
    return resolved;
  }

  /**
   * The session to resolve `userId` by, for a call that hands back a user and
   * (usually) its session: that session, or else the stored one when it is
   * the same account's. `null` when neither is: another account's session is
   * not this user's to be judged by, and its own auth event publishes it.
   */
  private async sessionFor(userId: string, session?: Session | null): Promise<Session | null> {
    if (session?.user?.id === userId) return session;
    const { data } = await this.auth.getSession();
    return data.session?.user?.id === userId ? data.session : null;
  }

  private async applySession(session: Session | null): Promise<AuthSession> {
    if (!session?.user) {
      const guest = readGuestFlag();
      const signedOut: AuthSession = { user: null, status: guest ? "guest" : "anonymous" };
      this.emit(signedOut);
      return signedOut;
    }
    writeGuestFlag(false);
    return (await this.publishSignedIn(session)).session;
  }

  getSession(): AuthSession {
    this.init();
    if (!hasWindow()) return { user: null, status: "loading" };
    if (this.cachedSession.status === "loading" && readGuestFlag())
      return { user: null, status: "guest" };
    return this.cachedSession;
  }

  subscribeToSession(listener: (session: AuthSession) => void): () => void {
    this.init();
    this.listeners.add(listener);
    listener(this.getSession());
    return () => void this.listeners.delete(listener);
  }

  async signInWithEmail(email: string, password: string): Promise<AuthResult<AuthUser>> {
    const { data, error } = await this.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error || !data.user) return { ok: false, errorCode: mapAuthError(error) };
    const signedIn = await this.sessionFor(data.user.id, data.session);
    if (!signedIn) return { ok: false, errorCode: "session_expired" };
    const { authUser, session } = await this.publishSignedIn(signedIn);
    return { ok: true, data: authUser, status: session.status };
  }

  async registerWithEmail(input: RegisterInput): Promise<AuthResult<{ email: string }>> {
    const { data, error } = await this.auth.signUp({
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
    return { ok: true, data: { email: (data.user?.email ?? input.email).trim() } };
  }

  async requestPasswordReset(email: string): Promise<AuthResult> {
    const redirectTo = hasWindow()
      ? `${getRedirectBase()}/auth/callback?next=/auth/update-password`
      : undefined;
    const { error } = await this.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    // Prevent account enumeration while still surfacing transport failures.
    if (error && mapAuthError(error) === "network") return { ok: false, errorCode: "network" };
    if (error && mapAuthError(error) === "rate_limited")
      return { ok: false, errorCode: "rate_limited" };
    return { ok: true };
  }

  async reauthenticate(): Promise<AuthResult> {
    const { error } = await this.auth.reauthenticate();
    return error ? { ok: false, errorCode: mapAuthError(error) } : { ok: true };
  }

  async refreshSession(): Promise<AuthResult<AuthUser>> {
    const { data, error } = await this.auth.refreshSession();
    if (error || !data.user) return { ok: false, errorCode: "session_expired" };
    const refreshed = await this.sessionFor(data.user.id, data.session);
    if (!refreshed) return { ok: false, errorCode: "session_expired" };
    const { authUser, session } = await this.publishSignedIn(refreshed);
    return { ok: true, data: authUser, status: session.status };
  }

  async recheckSession(options?: { refresh?: boolean }): Promise<AuthSession> {
    if (!hasWindow()) return this.cachedSession;
    this.init();
    if (options?.refresh) {
      // A new token brings the account's current factor list (one enrolled on
      // another device included). If the refresh fails, the session in hand
      // is still the one to judge.
      await this.auth.refreshSession().catch(() => undefined);
    }
    const { data } = await this.auth.getSession();
    return this.applySession(data.session);
  }

  async updatePassword(input: UpdatePasswordInput): Promise<AuthResult> {
    const { error } = await this.auth.updateUser({
      password: input.password,
      nonce: input.nonce,
      current_password: input.currentPassword,
    });
    return error ? { ok: false, errorCode: mapAuthError(error) } : { ok: true };
  }

  async verifyCode(email: string, code: string): Promise<AuthResult<AuthUser>> {
    const { data, error } = await this.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    if (error || !data.user) return { ok: false, errorCode: mapAuthError(error) };
    const verified = await this.sessionFor(data.user.id, data.session);
    if (!verified) return { ok: false, errorCode: "session_expired" };
    const { authUser, session } = await this.publishSignedIn(verified);
    return { ok: true, data: authUser, status: session.status };
  }

  async resendCode(email: string, next?: string): Promise<AuthResult> {
    const { error } = await this.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: hasWindow() ? getCallbackUrl(next) : undefined },
    });
    return error ? { ok: false, errorCode: mapAuthError(error) } : { ok: true };
  }

  private async signInWithOAuthProvider(
    provider: "google" | "apple",
    next?: string,
  ): Promise<AuthResult<AuthUser>> {
    if (!hasWindow()) return { ok: false, errorCode: "generic" };
    const { error } = await this.auth.signInWithOAuth({
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
    writeGuestFlag(true);
    this.emit({ user: null, status: "guest" });
    return { ok: true };
  }

  async completeProfile(input: CompleteProfileInput): Promise<AuthResult<AuthUser>> {
    const current = this.cachedSession.user;
    if (this.cachedSession.status !== "authenticated" || !current)
      return { ok: false, errorCode: "unauthorized" };
    const username = input.username?.trim() || current.username.trim();
    if (!username) return { ok: false, errorCode: "invalid_username" };

    const oldAvatarPath = current.avatarPath;
    let nextAvatarPath = input.removeAvatar ? null : (oldAvatarPath ?? null);
    let uploadedPath: string | null = null;
    if (!input.removeAvatar && input.avatarDataUrl?.startsWith("data:")) {
      const uploaded = await uploadAvatarFromDataUrl(current.id, input.avatarDataUrl);
      if (!uploaded.ok) return { ok: false, errorCode: "generic" };
      uploadedPath = uploaded.path;
      nextAvatarPath = uploaded.path;
    }

    try {
      const profile = await this.profiles.completeOnboarding(
        {
          displayName: input.displayName?.trim() || current.displayName,
          username,
          avatarPath: nextAvatarPath,
          preferredLanguage: input.language ?? current.language,
          favoriteTeamReference: input.favoriteClubId ?? current.favoriteClubId ?? null,
          notifications: { ...current.notifications, ...(input.notifications ?? {}) },
        },
        context(current.id),
      );
      if (oldAvatarPath && oldAvatarPath !== nextAvatarPath) await deleteAvatar(oldAvatarPath);
      // The account that completed its profile, and only if it is still the
      // one signed in: a session another tab switched in meanwhile is not
      // this profile's to publish (its own event publishes it).
      const stored = await this.sessionFor(current.id);
      if (!stored) return { ok: false, errorCode: "session_expired" };
      const { authUser, session } = await this.publishSignedIn(stored, profile);
      return { ok: true, data: authUser, status: session.status };
    } catch (error) {
      // A newly-created path is safe to remove. If an existing deterministic
      // path was overwritten, retain it because the profile still references it.
      if (uploadedPath && uploadedPath !== oldAvatarPath) await deleteAvatar(uploadedPath);
      return { ok: false, errorCode: mapIdentityCode(error) };
    }
  }

  async requestAccountDeletion(): Promise<AuthResult<{ requestId: string }>> {
    const actorId = this.cachedSession.user?.id ?? null;
    try {
      const id = await this.accountSecurity.requestDeletion(context(actorId));
      return { ok: true, data: { requestId: id } };
    } catch (error) {
      return { ok: false, errorCode: mapIdentityCode(error) };
    }
  }

  async cancelAccountDeletion(): Promise<AuthResult> {
    const actorId = this.cachedSession.user?.id ?? null;
    try {
      await this.accountSecurity.cancelDeletion(context(actorId));
      return { ok: true };
    } catch (error) {
      return { ok: false, errorCode: mapIdentityCode(error) };
    }
  }

  async getAccountDeletionStatus(): Promise<AuthResult<{ pending: boolean }>> {
    const actorId = this.cachedSession.user?.id ?? null;
    try {
      const requests = await this.accountSecurity.listDeletionRequests(context(actorId));
      return {
        ok: true,
        data: { pending: requests.some((request) => request.status === "requested") },
      };
    } catch (error) {
      return { ok: false, errorCode: mapIdentityCode(error) };
    }
  }

  async signOut(options?: SignOutOptions): Promise<void> {
    const scope = options?.scope ?? "local";
    // The account behind the session, owing its code or not. Leaving from the
    // challenge ends a real session too, and the database takes this record
    // at aal1 on purpose (the step-up migration leaves the security audit log
    // unguarded for it); with `user` alone, which is null while the code is
    // owed, that sign-out was never recorded.
    const actorId = sessionAccountId(this.cachedSession);
    if (actorId) {
      await this.accountSecurity
        .recordSessionRevocation(scope, context(actorId))
        .catch(() => undefined);
    }
    await this.auth.signOut({ scope }).catch(() => undefined);
    if (hasWindow()) {
      writeGuestFlag(false);
      try {
        if (options?.resetLocalData) {
          ["botolago.fantasy.team", "botolago.fantasy.bank", "botolago.fantasy.transfers"].forEach(
            (key) => window.localStorage.removeItem(key),
          );
        }
        Object.keys(window.localStorage)
          .filter((key) => key.startsWith(K_LEGACY_PREFIX) && key !== K_GUEST)
          .forEach((key) => window.localStorage.removeItem(key));
      } catch {
        // Browser privacy modes may deny localStorage outright, or only its
        // enumeration. Either way sign-out must still finish below, or the
        // UI stays signed in after Supabase has already ended the session.
      }
    }
    if (scope !== "others") this.emit({ user: null, status: "anonymous" });
  }
}

// Retained as a named export for tests and consumers that discriminate errors.
export { IdentityError };
