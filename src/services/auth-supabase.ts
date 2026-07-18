// Production Supabase-backed implementation of AuthService.
//
// Session state is driven by supabase.auth.onAuthStateChange plus an initial
// getSession() probe. Profile + preferences are loaded on authentication via
// the profiles-repo, with a bounded retry to wait for the signup trigger.

import { supabase } from "@/integrations/supabase/client";
import type {
  AuthService,
  AuthSession,
  AuthUser,
  AuthResult,
  CompleteProfileInput,
  RegisterInput,
  UpdatePasswordInput,
  AuthErrorCode,
} from "./auth-types";
import { defaultNotifications } from "./auth-types";
import {
  coerceLanguage,
  loadFullProfile,
  preferencesToNotifications,
  updatePreferences,
  updateProfile,
  uploadAvatarFromDataUrl,
  deleteAvatar,
  signedAvatarUrl,
  type FullProfile,
} from "./profiles-repo";
import type { Session, User, AuthError } from "@supabase/supabase-js";

const K_GUEST = "botolago.auth.guest";
const K_LEGACY_PREFIX = "botolago.auth."; // for cleanup of stale mock keys

function hasWindow() { return typeof window !== "undefined"; }

function sanitizeSameOriginPath(input: string | null | undefined, fallback: string): string {
  if (!input) return fallback;
  if (!input.startsWith("/") || input.startsWith("//")) return fallback;
  return input;
}

function getRedirectBase(): string {
  if (!hasWindow()) return "";
  return window.location.origin;
}

function mapAuthError(err: AuthError | null | undefined): AuthErrorCode {
  if (!err) return "generic";
  const msg = (err.message ?? "").toLowerCase();
  const status = err.status ?? 0;
  if (status === 429 || msg.includes("rate limit")) return "rate_limited";
  if (msg.includes("invalid login") || msg.includes("invalid credentials") || msg.includes("invalid_credentials")) return "credentials";
  if (msg.includes("email not confirmed") || msg.includes("email_not_confirmed")) return "email_unconfirmed";
  if (msg.includes("already registered") || msg.includes("user already") || msg.includes("already exists")) return "email_taken";
  if (msg.includes("otp") && msg.includes("expired")) return "otp_expired";
  if (msg.includes("token") && msg.includes("expired")) return "otp_expired";
  if (msg.includes("invalid otp") || msg.includes("invalid token") || msg.includes("token has expired or is invalid")) return "otp_invalid";
  if (msg.includes("weak password") || msg.includes("password should")) return "weak_password";
  if (msg.includes("provider is not enabled") || msg.includes("unsupported provider") || msg.includes("provider disabled")) return "provider_unavailable";
  if (msg.includes("failed to fetch") || msg.includes("network")) return "network";
  return "generic";
}

export { mapAuthError as __mapAuthErrorForTests };

async function buildAuthUser(u: User, full: FullProfile | null): Promise<AuthUser> {
  const profile = full?.profile;
  const displayName = (profile?.display_name?.trim() || (u.user_metadata?.display_name as string | undefined)?.trim() || "").toString();
  const username = (profile?.username?.trim() || (u.user_metadata?.username as string | undefined)?.trim() || "").toString();
  const avatarPath = profile?.avatar_url || undefined;
  let avatarDataUrl: string | undefined;
  if (avatarPath) {
    const url = await signedAvatarUrl(avatarPath).catch(() => null);
    if (url) avatarDataUrl = url;
  }
  const providerRaw = (u.app_metadata?.provider as string | undefined) ?? "email";
  const provider: AuthUser["provider"] = providerRaw === "google" ? "google" : providerRaw === "apple" ? "apple" : "email";

  const language = coerceLanguage(profile?.preferred_language ?? (u.user_metadata?.preferred_language as string | undefined) ?? "fr");

  return {
    id: u.id,
    email: u.email ?? "",
    displayName,
    username,
    avatarPath,
    avatarDataUrl,
    favoriteClubId: profile?.favorite_club_id ?? undefined,
    language,
    notifications: full ? preferencesToNotifications(full.preferences) : defaultNotifications(),
    profileComplete: displayName.trim().length >= 2 && /^[a-z0-9_-]{3,20}$/i.test(username),
    createdAt: u.created_at ?? new Date().toISOString(),
    verified: !!u.email_confirmed_at,
    provider,
  };
}

export class SupabaseAuthService implements AuthService {
  private listeners = new Set<(s: AuthSession) => void>();
  private cachedSession: AuthSession = { user: null, status: "loading" };
  private initialized = false;

  private init() {
    if (this.initialized || !hasWindow()) return;
    this.initialized = true;

    // Initial state probe.
    void supabase.auth.getSession().then(async ({ data }) => {
      await this.applySession(data.session);
    });

    supabase.auth.onAuthStateChange(async (_event, session) => {
      await this.applySession(session);
    });
  }

  private async applySession(session: Session | null) {
    if (!session?.user) {
      // Preserve guest flag as a distinct local state.
      const guest = hasWindow() && window.localStorage.getItem(K_GUEST) === "1";
      this.cachedSession = { user: null, status: guest ? "guest" : "anonymous" };
    } else {
      // Clear any lingering guest flag once a real user is present.
      if (hasWindow()) window.localStorage.removeItem(K_GUEST);
      const full = await loadFullProfile(session.user.id).catch(() => null);
      const user = await buildAuthUser(session.user, full);
      this.cachedSession = { user, status: "authenticated" };
    }
    for (const l of this.listeners) l(this.cachedSession);
  }

  getSession(): AuthSession {
    this.init();
    if (!hasWindow()) return { user: null, status: "loading" };
    // Reflect guest even before the async probe resolves.
    if (this.cachedSession.status === "loading" && window.localStorage.getItem(K_GUEST) === "1") {
      return { user: null, status: "guest" };
    }
    return this.cachedSession;
  }

  subscribeToSession(listener: (s: AuthSession) => void): () => void {
    this.init();
    this.listeners.add(listener);
    listener(this.getSession());
    return () => { this.listeners.delete(listener); };
  }

  async signInWithEmail(email: string, password: string): Promise<AuthResult<AuthUser>> {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user) return { ok: false, errorCode: mapAuthError(error) };
    if (hasWindow()) window.localStorage.removeItem(K_GUEST);
    const full = await loadFullProfile(data.user.id).catch(() => null);
    const user = await buildAuthUser(data.user, full);
    this.cachedSession = { user, status: "authenticated" };
    for (const l of this.listeners) l(this.cachedSession);
    return { ok: true, data: user };
  }

  async registerWithEmail(input: RegisterInput): Promise<AuthResult<{ email: string }>> {
    const emailRedirectTo = hasWindow() ? `${getRedirectBase()}/auth/callback` : undefined;
    const { data, error } = await supabase.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        emailRedirectTo,
        data: {
          display_name: input.fullName.trim(),
          username: input.username.trim().toLowerCase(),
          preferred_language: input.language,
        },
      },
    });
    if (error) return { ok: false, errorCode: mapAuthError(error) };
    return { ok: true, data: { email: (data.user?.email ?? input.email).trim() } };
  }

  async requestPasswordReset(email: string): Promise<AuthResult> {
    const redirectTo = hasWindow() ? `${getRedirectBase()}/auth/callback?next=/auth/update-password` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    // Non-enumerating: always report success unless it's a hard network error.
    if (error && mapAuthError(error) === "network") return { ok: false, errorCode: "network" };
    return { ok: true };
  }

  async updatePassword(input: UpdatePasswordInput): Promise<AuthResult> {
    const { error } = await supabase.auth.updateUser({ password: input.password });
    if (error) return { ok: false, errorCode: mapAuthError(error) };
    return { ok: true };
  }

  async verifyCode(email: string, code: string): Promise<AuthResult<AuthUser>> {
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    if (error || !data.user) return { ok: false, errorCode: mapAuthError(error) };
    const full = await loadFullProfile(data.user.id).catch(() => null);
    const user = await buildAuthUser(data.user, full);
    this.cachedSession = { user, status: "authenticated" };
    for (const l of this.listeners) l(this.cachedSession);
    return { ok: true, data: user };
  }

  async resendCode(email: string): Promise<AuthResult> {
    const emailRedirectTo = hasWindow() ? `${getRedirectBase()}/auth/callback` : undefined;
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo },
    });
    if (error) return { ok: false, errorCode: mapAuthError(error) };
    return { ok: true };
  }

  private async signInWithOAuthProvider(provider: "google" | "apple"): Promise<AuthResult<AuthUser>> {
    if (!hasWindow()) return { ok: false, errorCode: "generic" };
    const redirectTo = `${getRedirectBase()}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) return { ok: false, errorCode: mapAuthError(error) };
    // Browser is redirecting; caller should treat this as pending.
    return { ok: true };
  }

  signInWithGoogle() { return this.signInWithOAuthProvider("google"); }
  signInWithApple() { return this.signInWithOAuthProvider("apple"); }

  async continueAsGuest(): Promise<AuthResult> {
    if (hasWindow()) window.localStorage.setItem(K_GUEST, "1");
    this.cachedSession = { user: null, status: "guest" };
    for (const l of this.listeners) l(this.cachedSession);
    return { ok: true };
  }

  async completeProfile(input: CompleteProfileInput): Promise<AuthResult<AuthUser>> {
    const s = this.cachedSession;
    if (s.status !== "authenticated" || !s.user) return { ok: false, errorCode: "generic" };
    const userId = s.user.id;

    // Avatar handling.
    let avatarPathPatch: string | null | undefined = undefined;
    if (input.removeAvatar) {
      if (s.user.avatarPath) await deleteAvatar(s.user.avatarPath);
      avatarPathPatch = null;
    } else if (input.avatarDataUrl && input.avatarDataUrl.startsWith("data:")) {
      const up = await uploadAvatarFromDataUrl(userId, input.avatarDataUrl);
      if (!up.ok) return { ok: false, errorCode: "generic" };
      avatarPathPatch = up.path;
    }

    const profileRes = await updateProfile(userId, {
      displayName: input.displayName,
      username: input.username,
      favoriteClubId: input.favoriteClubId ?? undefined,
      avatarPath: avatarPathPatch,
      preferredLanguage: input.language,
    });
    if (!profileRes.ok) return { ok: false, errorCode: profileRes.error === "username_taken" ? "username_taken" : "generic" };

    if (input.notifications) {
      await updatePreferences(userId, input.notifications);
    }

    // Re-load and emit.
    const full = await loadFullProfile(userId).catch(() => null);
    const { data: sessionData } = await supabase.auth.getUser();
    const supUser = sessionData.user;
    if (!supUser) return { ok: false, errorCode: "generic" };
    const user = await buildAuthUser(supUser, full);
    this.cachedSession = { user, status: "authenticated" };
    for (const l of this.listeners) l(this.cachedSession);
    return { ok: true, data: user };
  }

  async signOut(options?: { resetLocalData?: boolean }): Promise<void> {
    await supabase.auth.signOut().catch(() => undefined);
    if (hasWindow()) {
      window.localStorage.removeItem(K_GUEST);
      if (options?.resetLocalData) {
        const keys = ["botolago.fantasy.team", "botolago.fantasy.bank", "botolago.fantasy.transfers"];
        keys.forEach((k) => window.localStorage.removeItem(k));
      }
      // Sweep stale mock keys from previous local-only sessions.
      try {
        Object.keys(window.localStorage)
          .filter((k) => k.startsWith(K_LEGACY_PREFIX) && k !== K_GUEST)
          .forEach((k) => window.localStorage.removeItem(k));
      } catch { /* ignore */ }
    }
    this.cachedSession = { user: null, status: "anonymous" };
    for (const l of this.listeners) l(this.cachedSession);
  }
}
