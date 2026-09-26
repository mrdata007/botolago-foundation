// Shared types for the BotolaGO auth service boundary.
// The route-facing contract (`AuthService`) lives here so both the mock
// implementation and the production Supabase implementation share it.

import type { Language } from "@/types/domain";

/**
 * Where the visitor stands.
 *
 * `authenticated` means fully signed in: for an account with a second factor,
 * that includes the one-time code. The two `mfa_*` states hold a real Supabase
 * session that has NOT got that far, and everything that reads private data or
 * writes on the account's behalf treats them exactly like signed out -- the
 * session's `user` is null in both:
 *
 * - `mfa_required`: the password (or link) was accepted, the account has a
 *   verified factor, and the code has not been entered yet.
 * - `mfa_unconfirmed`: the assurance lookup failed, so it is not known whether
 *   a code is owed. Fail closed, offer a retry (`recheckSession`).
 */
export type AuthStatus =
  | "loading"
  | "authenticated"
  | "mfa_required"
  | "mfa_unconfirmed"
  | "guest"
  | "anonymous";

export interface NotificationPreferences {
  matchAlerts: boolean;
  breakingNews: boolean;
  fantasyDeadlines: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  username: string;
  /** Displayable URL for the avatar (signed storage URL, data URL, or undefined). */
  avatarDataUrl?: string;
  /** Object path in the private `avatars` bucket. Not displayable directly. */
  avatarPath?: string;
  favoriteClubId?: string;
  language: Language;
  notifications: NotificationPreferences;
  profileComplete: boolean;
  createdAt: string;
  verified: boolean;
  provider: "email" | "google" | "apple";
}

export interface AuthSession {
  user: AuthUser | null;
  status: AuthStatus;
  /**
   * In the two `mfa_*` states only: the Supabase account behind the session.
   * It is NOT a signed-in user -- nothing reads or writes on its behalf. It is
   * there so the app can tell "the same account now owes its code" from "a
   * different account, or nobody". The first must keep that account's Fantasy
   * drafts and cached answers for when the code is in (a save refused with
   * `PT403 mfa_required` leads straight here); only the second forgets them.
   */
  pendingAccountId?: string;
}

export type AuthErrorCode =
  | "credentials"
  | "email_taken"
  | "username_taken"
  | "invalid_username"
  | "reserved_username"
  | "otp_invalid"
  | "otp_expired"
  | "email_unconfirmed"
  | "unauthorized"
  | "session_expired"
  | "invalid_reset_token"
  | "rate_limited"
  | "network"
  | "provider_unavailable"
  | "weak_password"
  /** The server wants this session's second factor first (`PT403 mfa_required`). */
  | "mfa_required"
  | "generic";

export interface AuthResult<T = void> {
  ok: boolean;
  data?: T;
  errorCode?: AuthErrorCode;
  /**
   * Set by the calls that establish a session (sign-in, code verification,
   * refresh): how far THAT session got. A successful password sign-in of an
   * account with a second factor is `ok` with status `mfa_required`, and the
   * caller must send it to the challenge rather than into the app.
   */
  status?: AuthStatus;
}

export interface RegisterInput {
  fullName: string;
  username: string;
  email: string;
  password: string;
  language: Language;
  next?: string;
}

export interface CompleteProfileInput {
  displayName?: string;
  favoriteClubId?: string;
  /** Provide a data URL to upload as new avatar, or undefined to leave unchanged. */
  avatarDataUrl?: string;
  /** Explicit avatar removal. */
  removeAvatar?: boolean;
  notifications?: Partial<NotificationPreferences>;
  language?: Language;
  username?: string;
}

export interface UpdatePasswordInput {
  password: string;
  /** OTP returned by Supabase reauthentication when secure password changes require it. */
  nonce?: string;
  /** Used only when the hosted Auth setting requires the current password. */
  currentPassword?: string;
}

export type SignOutScope = "local" | "global" | "others";

export interface SignOutOptions {
  resetLocalData?: boolean;
  /** Defaults to local so signing out one device does not unexpectedly revoke every session. */
  scope?: SignOutScope;
}

export interface AuthService {
  getSession(): AuthSession;
  subscribeToSession(listener: (s: AuthSession) => void): () => void;
  signInWithEmail(email: string, password: string): Promise<AuthResult<AuthUser>>;
  registerWithEmail(input: RegisterInput): Promise<AuthResult<{ email: string }>>;
  requestPasswordReset(email: string): Promise<AuthResult>;
  reauthenticate(): Promise<AuthResult>;
  refreshSession(): Promise<AuthResult<AuthUser>>;
  /**
   * Re-read the current session and its second-factor assurance, publish the
   * result to subscribers, and return it. The retry behind `mfa_unconfirmed`,
   * and the step after a challenge is passed. `refresh` first asks the server
   * for a new token, whose user record lists factors enrolled elsewhere.
   */
  recheckSession(options?: { refresh?: boolean }): Promise<AuthSession>;
  updatePassword(input: UpdatePasswordInput): Promise<AuthResult>;
  verifyCode(email: string, code: string): Promise<AuthResult<AuthUser>>;
  resendCode(email: string, next?: string): Promise<AuthResult>;
  signInWithGoogle(next?: string): Promise<AuthResult<AuthUser>>;
  signInWithApple(next?: string): Promise<AuthResult<AuthUser>>;
  continueAsGuest(): Promise<AuthResult>;
  completeProfile(input: CompleteProfileInput): Promise<AuthResult<AuthUser>>;
  requestAccountDeletion(): Promise<AuthResult<{ requestId: string }>>;
  cancelAccountDeletion(): Promise<AuthResult>;
  /** Real backend-read state, not local UI state — survives reload/another device. */
  getAccountDeletionStatus(): Promise<AuthResult<{ pending: boolean }>>;
  signOut(options?: SignOutOptions): Promise<void>;
}

export function defaultNotifications(): NotificationPreferences {
  return { matchAlerts: true, breakingNews: true, fantasyDeadlines: true };
}
