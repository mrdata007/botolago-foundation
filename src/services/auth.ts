// BotolaGO authentication service boundary.
//
// This module defines the AuthService interface and provides a local mock
// implementation backed by localStorage. It is intentionally shaped to be
// replaceable by a Supabase-based implementation later without touching pages.
//
// Passwords are never stored. The mock stores a non-cryptographic digest just
// so demo re-login works within the same device; real security lives at the
// service layer that will replace this file.

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
  avatarDataUrl?: string;
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

export interface AuthResult<T = void> {
  ok: boolean;
  data?: T;
  errorCode?:
    | "credentials"
    | "email_taken"
    | "username_taken"
    | "otp_invalid"
    | "otp_expired"
    | "generic";
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
  avatarDataUrl?: string;
  notifications?: Partial<NotificationPreferences>;
  language?: Language;
}

export interface AuthService {
  getSession(): AuthSession;
  subscribeToSession(listener: (s: AuthSession) => void): () => void;
  signInWithEmail(email: string, password: string): Promise<AuthResult<AuthUser>>;
  registerWithEmail(input: RegisterInput): Promise<AuthResult<{ email: string }>>;
  requestPasswordReset(email: string): Promise<AuthResult>;
  verifyCode(email: string, code: string): Promise<AuthResult<AuthUser>>;
  resendCode(email: string): Promise<AuthResult>;
  signInWithGoogle(): Promise<AuthResult<AuthUser>>;
  signInWithApple(): Promise<AuthResult<AuthUser>>;
  continueAsGuest(): Promise<AuthResult>;
  completeProfile(input: CompleteProfileInput): Promise<AuthResult<AuthUser>>;
  signOut(options?: { resetLocalData?: boolean }): Promise<void>;
}

// ---------- Local mock implementation ---------------------------------------

const NS = "botolago.";
const K_SESSION = `${NS}auth.session`;
const K_USERS = `${NS}auth.users`;
const K_PENDING = `${NS}auth.pending`;

interface StoredUserRecord extends AuthUser {
  passwordDigest: string; // NOT a password; opaque digest for mock re-login only
}

interface PendingRecord {
  email: string;
  code: string;
  expiresAt: number;
  draft: Omit<StoredUserRecord, "id" | "createdAt" | "verified">;
}

interface SessionRecord {
  kind: "user" | "guest";
  userId?: string;
  createdAt: string;
}

const DEMO_EMAIL = "demo@botolago.ma";
const DEMO_PASSWORD = "demo1234";
const DEMO_CODE = "123456";

function hasWindow() {
  return typeof window !== "undefined";
}

function safeGet<T>(key: string): T | null {
  if (!hasWindow()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function safeSet<T>(key: string, value: T): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function safeRemove(key: string): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// Non-cryptographic digest — string→string. Explicitly NOT a password hash.
// Its only role is letting the mock recognise the same password on re-login.
function digest(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return `mock:${h.toString(16)}`;
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function stripPassword(u: StoredUserRecord): AuthUser {
  const { passwordDigest: _pw, ...rest } = u;
  void _pw;
  return rest;
}

function defaultNotifications(): NotificationPreferences {
  return { matchAlerts: true, breakingNews: true, fantasyDeadlines: true };
}

class LocalMockAuthService implements AuthService {
  private listeners = new Set<(s: AuthSession) => void>();
  private cachedSession: AuthSession = { user: null, status: "loading" };
  private initialized = false;

  private init() {
    if (this.initialized || !hasWindow()) return;
    this.initialized = true;
    // Seed the demo account once so the login demo works out of the box.
    const users = safeGet<StoredUserRecord[]>(K_USERS) ?? [];
    if (!users.find((u) => u.email.toLowerCase() === DEMO_EMAIL)) {
      users.push({
        id: uid("usr"),
        email: DEMO_EMAIL,
        displayName: "Rachid Demo",
        username: "rachid_demo",
        language: "fr",
        notifications: defaultNotifications(),
        profileComplete: true,
        createdAt: new Date().toISOString(),
        verified: true,
        provider: "email",
        favoriteClubId: "wac",
        passwordDigest: digest(DEMO_PASSWORD),
      });
      safeSet(K_USERS, users);
    }
    this.cachedSession = this.readSession();
  }

  private readSession(): AuthSession {
    if (!hasWindow()) return { user: null, status: "loading" };
    const rec = safeGet<SessionRecord>(K_SESSION);
    if (!rec) return { user: null, status: "anonymous" };
    if (rec.kind === "guest") return { user: null, status: "guest" };
    const users = safeGet<StoredUserRecord[]>(K_USERS) ?? [];
    const found = users.find((u) => u.id === rec.userId);
    if (!found) {
      safeRemove(K_SESSION);
      return { user: null, status: "anonymous" };
    }
    return { user: stripPassword(found), status: "authenticated" };
  }

  private emit() {
    this.cachedSession = this.readSession();
    for (const l of this.listeners) l(this.cachedSession);
  }

  private setSession(rec: SessionRecord | null) {
    if (!rec) safeRemove(K_SESSION);
    else safeSet(K_SESSION, rec);
    this.emit();
  }

  private saveUser(u: StoredUserRecord) {
    const users = safeGet<StoredUserRecord[]>(K_USERS) ?? [];
    const idx = users.findIndex((x) => x.id === u.id);
    if (idx >= 0) users[idx] = u;
    else users.push(u);
    safeSet(K_USERS, users);
  }

  getSession(): AuthSession {
    this.init();
    return this.cachedSession;
  }

  subscribeToSession(listener: (s: AuthSession) => void): () => void {
    this.init();
    this.listeners.add(listener);
    listener(this.cachedSession);
    return () => this.listeners.delete(listener);
  }

  async signInWithEmail(email: string, password: string): Promise<AuthResult<AuthUser>> {
    this.init();
    await simulateLatency();
    const users = safeGet<StoredUserRecord[]>(K_USERS) ?? [];
    const found = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!found || found.passwordDigest !== digest(password) || !found.verified) {
      return { ok: false, errorCode: "credentials" };
    }
    this.setSession({ kind: "user", userId: found.id, createdAt: new Date().toISOString() });
    return { ok: true, data: stripPassword(found) };
  }

  async registerWithEmail(input: RegisterInput): Promise<AuthResult<{ email: string }>> {
    this.init();
    await simulateLatency();
    const users = safeGet<StoredUserRecord[]>(K_USERS) ?? [];
    const normalizedEmail = input.email.trim().toLowerCase();
    const normalizedUsername = input.username.trim().toLowerCase();
    if (users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
      return { ok: false, errorCode: "email_taken" };
    }
    if (users.some((u) => u.username.toLowerCase() === normalizedUsername)) {
      return { ok: false, errorCode: "username_taken" };
    }
    const draft: PendingRecord["draft"] = {
      email: normalizedEmail,
      displayName: input.fullName.trim(),
      username: normalizedUsername,
      language: input.language,
      notifications: defaultNotifications(),
      profileComplete: false,
      provider: "email",
      passwordDigest: digest(input.password),
    };
    const pending: PendingRecord = {
      email: normalizedEmail,
      code: DEMO_CODE,
      expiresAt: Date.now() + 10 * 60 * 1000,
      draft,
    };
    safeSet(K_PENDING, pending);
    return { ok: true, data: { email: normalizedEmail } };
  }

  async requestPasswordReset(_email: string): Promise<AuthResult> {
    this.init();
    await simulateLatency();
    // Intentionally always returns ok: never leak account existence.
    return { ok: true };
  }

  async verifyCode(email: string, code: string): Promise<AuthResult<AuthUser>> {
    this.init();
    await simulateLatency();
    const pending = safeGet<PendingRecord>(K_PENDING);
    if (!pending || pending.email.toLowerCase() !== email.trim().toLowerCase()) {
      return { ok: false, errorCode: "otp_invalid" };
    }
    if (pending.expiresAt < Date.now()) return { ok: false, errorCode: "otp_expired" };
    if (code.trim() !== pending.code) return { ok: false, errorCode: "otp_invalid" };

    const user: StoredUserRecord = {
      ...pending.draft,
      id: uid("usr"),
      createdAt: new Date().toISOString(),
      verified: true,
    };
    this.saveUser(user);
    safeRemove(K_PENDING);
    this.setSession({ kind: "user", userId: user.id, createdAt: new Date().toISOString() });
    return { ok: true, data: stripPassword(user) };
  }

  async resendCode(email: string): Promise<AuthResult> {
    this.init();
    await simulateLatency();
    const pending = safeGet<PendingRecord>(K_PENDING);
    if (!pending || pending.email.toLowerCase() !== email.trim().toLowerCase()) {
      return { ok: false, errorCode: "generic" };
    }
    pending.expiresAt = Date.now() + 10 * 60 * 1000;
    safeSet(K_PENDING, pending);
    return { ok: true };
  }

  private async signInWithProvider(provider: "google" | "apple"): Promise<AuthResult<AuthUser>> {
    this.init();
    await simulateLatency();
    const users = safeGet<StoredUserRecord[]>(K_USERS) ?? [];
    const email = `${provider}.user@botolago.demo`;
    let user = users.find((u) => u.email === email);
    if (!user) {
      user = {
        id: uid("usr"),
        email,
        displayName: provider === "google" ? "Google User" : "Apple User",
        username: `${provider}_user`,
        language: (safeGet<{ lang: Language }>(`${NS}language`)?.lang ?? "fr") as Language,
        notifications: defaultNotifications(),
        profileComplete: false,
        createdAt: new Date().toISOString(),
        verified: true,
        provider,
        passwordDigest: digest(`__oauth:${provider}`),
      };
      this.saveUser(user);
    }
    this.setSession({ kind: "user", userId: user.id, createdAt: new Date().toISOString() });
    return { ok: true, data: stripPassword(user) };
  }

  signInWithGoogle() {
    return this.signInWithProvider("google");
  }
  signInWithApple() {
    return this.signInWithProvider("apple");
  }

  async continueAsGuest(): Promise<AuthResult> {
    this.init();
    this.setSession({ kind: "guest", createdAt: new Date().toISOString() });
    return { ok: true };
  }

  async completeProfile(input: CompleteProfileInput): Promise<AuthResult<AuthUser>> {
    this.init();
    await simulateLatency();
    const s = this.readSession();
    if (s.status !== "authenticated" || !s.user) return { ok: false, errorCode: "generic" };
    const users = safeGet<StoredUserRecord[]>(K_USERS) ?? [];
    const idx = users.findIndex((u) => u.id === s.user!.id);
    if (idx < 0) return { ok: false, errorCode: "generic" };
    const merged: StoredUserRecord = {
      ...users[idx],
      displayName: input.displayName?.trim() || users[idx].displayName,
      favoriteClubId: input.favoriteClubId ?? users[idx].favoriteClubId,
      avatarDataUrl: input.avatarDataUrl ?? users[idx].avatarDataUrl,
      language: input.language ?? users[idx].language,
      notifications: { ...users[idx].notifications, ...(input.notifications ?? {}) },
      profileComplete: true,
    };
    users[idx] = merged;
    safeSet(K_USERS, users);
    this.emit();
    return { ok: true, data: stripPassword(merged) };
  }

  async signOut(options?: { resetLocalData?: boolean }): Promise<void> {
    this.init();
    this.setSession(null);
    if (options?.resetLocalData && hasWindow()) {
      // Only clear feature-scoped keys, never wipe language/session helpers.
      const keys = ["botolago.fantasy.team", "botolago.fantasy.bank", "botolago.fantasy.transfers"];
      keys.forEach(safeRemove);
    }
  }
}

async function simulateLatency() {
  await new Promise((r) => setTimeout(r, 220));
}

export const authService: AuthService = new LocalMockAuthService();

// Exposed for tests only.
export const __testing = {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  DEMO_CODE,
  reset() {
    if (!hasWindow()) return;
    safeRemove(K_SESSION);
    safeRemove(K_USERS);
    safeRemove(K_PENDING);
    // Force singleton to reseed and re-read on next getSession()
    const svc = authService as unknown as { initialized: boolean; cachedSession: AuthSession };
    svc.initialized = false;
    svc.cachedSession = { user: null, status: "loading" };
    // Trigger init to reseed demo user
    authService.getSession();
  },
  service: () => authService,
};
