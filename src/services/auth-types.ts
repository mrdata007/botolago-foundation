// Shared types for the BotolaGO auth service boundary.
// The route-facing contract (`AuthService`) lives here so both the mock
// implementation and the production Supabase implementation share it.

import type { Language } from "@/types/domain";

export type AuthStatus = "loading" | "authenticated" | "guest" | "anonymous";

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
  /** False only when the profile API is temporarily unavailable. */
  profileAvailable?: boolean;
  createdAt: string;
  verified: boolean;
  provider: "email" | "google" | "apple";
}

export interface AuthSession {
  user: AuthUser | null;
  status: AuthStatus;
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
  | "generic";

export interface AuthResult<T = void> {
  ok: boolean;
  data?: T;
  errorCode?: AuthErrorCode;
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

export interface AccountDeletionRequest {
  readonly requestId: string;
  readonly status: "requested" | "cancelled" | "processing" | "completed" | "rejected";
  readonly requestedAt: string;
  readonly updatedAt: string;
  readonly processedAt: string | null;
}

export interface AuthService {
  getSession(): AuthSession;
  subscribeToSession(listener: (s: AuthSession) => void): () => void;
  signInWithEmail(email: string, password: string): Promise<AuthResult<AuthUser>>;
  registerWithEmail(input: RegisterInput): Promise<AuthResult<{ email: string }>>;
  requestPasswordReset(email: string): Promise<AuthResult>;
  reauthenticate(): Promise<AuthResult>;
  refreshSession(): Promise<AuthResult<AuthUser>>;
  updatePassword(input: UpdatePasswordInput): Promise<AuthResult>;
  verifyCode(email: string, code: string): Promise<AuthResult<AuthUser>>;
  resendCode(email: string, next?: string): Promise<AuthResult>;
  signInWithGoogle(next?: string): Promise<AuthResult<AuthUser>>;
  signInWithApple(next?: string): Promise<AuthResult<AuthUser>>;
  continueAsGuest(): Promise<AuthResult>;
  completeProfile(input: CompleteProfileInput): Promise<AuthResult<AuthUser>>;
  requestAccountDeletion(): Promise<AuthResult<{ requestId: string }>>;
  getAccountDeletionRequests(): Promise<AuthResult<readonly AccountDeletionRequest[]>>;
  cancelAccountDeletion(): Promise<AuthResult>;
  signOut(options?: SignOutOptions): Promise<void>;
}

export function defaultNotifications(): NotificationPreferences {
  return { matchAlerts: true, breakingNews: true, fantasyDeadlines: true };
}

