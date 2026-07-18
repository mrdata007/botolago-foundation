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
  | "otp_invalid"
  | "otp_expired"
  | "email_unconfirmed"
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
}

export interface AuthService {
  getSession(): AuthSession;
  subscribeToSession(listener: (s: AuthSession) => void): () => void;
  signInWithEmail(email: string, password: string): Promise<AuthResult<AuthUser>>;
  registerWithEmail(input: RegisterInput): Promise<AuthResult<{ email: string }>>;
  requestPasswordReset(email: string): Promise<AuthResult>;
  updatePassword(input: UpdatePasswordInput): Promise<AuthResult>;
  verifyCode(email: string, code: string): Promise<AuthResult<AuthUser>>;
  resendCode(email: string): Promise<AuthResult>;
  signInWithGoogle(): Promise<AuthResult<AuthUser>>;
  signInWithApple(): Promise<AuthResult<AuthUser>>;
  continueAsGuest(): Promise<AuthResult>;
  completeProfile(input: CompleteProfileInput): Promise<AuthResult<AuthUser>>;
  signOut(options?: { resetLocalData?: boolean }): Promise<void>;
}

export function defaultNotifications(): NotificationPreferences {
  return { matchAlerts: true, breakingNews: true, fantasyDeadlines: true };
}
