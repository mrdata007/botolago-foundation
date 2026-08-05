// Local mock implementation of AuthService for deterministic unit tests
// and explicit mock mode (VITE_AUTH_MODE=mock). Not used in production.
//
// Passwords are never stored. This uses a non-cryptographic digest so that
// demo re-login works within the same device only.

import type {
  AuthService,
  AuthSession,
  AuthUser,
  CompleteProfileInput,
  RegisterInput,
  AuthResult,
  SignOutOptions,
  UpdatePasswordInput,
} from "./auth-types";
import { defaultNotifications } from "./auth-types";
import type { Language } from "@/types/domain";
import { validateCanonicalUsername } from "@/backend/identity/username";

const NS = "botolago.";
const K_SESSION = `${NS}auth.session`;
const K_USERS = `${NS}auth.users`;
const K_PENDING = `${NS}auth.pending`;
const K_DELETION = `${NS}auth.deletion-request`;

interface StoredUserRecord extends AuthUser {
  passwordDigest: string;
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

export const MOCK_DEMO_EMAIL = "demo@botolago.ma";
export const MOCK_DEMO_PASSWORD = "demo1234";
export const MOCK_DEMO_CODE = "123456";

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

export class LocalMockAuthService implements AuthService {
  private listeners = new Set<(s: AuthSession) => void>();
  private cachedSession: AuthSession = { user: null, status: "loading" };
  private initialized = false;

  private init() {
    if (this.initialized || !hasWindow()) return;
    this.initialized = true;
    const users = safeGet<StoredUserRecord[]>(K_USERS) ?? [];
    if (!users.find((u) => u.email.toLowerCase() === MOCK_DEMO_EMAIL)) {
      users.push({
        id: uid("usr"),
        email: MOCK_DEMO_EMAIL,
        displayName: "Rachid Demo",
        username: "rachid_demo",
        language: "fr",
        notifications: defaultNotifications(),
        profileComplete: true,
        createdAt: new Date().toISOString(),
        verified: true,
        provider: "email",
        favoriteClubId: "wac",
        passwordDigest: digest(MOCK_DEMO_PASSWORD),
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
    return () => {
      this.listeners.delete(listener);
    };
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
    const usernameValidation = validateCanonicalUsername(normalizedUsername);
    if (usernameValidation)
      return {
        ok: false,
        errorCode: usernameValidation === "reserved" ? "reserved_username" : "invalid_username",
      };
    if (users.some((u) => u.email.toLowerCase() === normalizedEmail))
      return { ok: false, errorCode: "email_taken" };
    if (users.some((u) => u.username.toLowerCase() === normalizedUsername))
      return { ok: false, errorCode: "username_taken" };
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
    safeSet(K_PENDING, {
      email: normalizedEmail,
      code: MOCK_DEMO_CODE,
      expiresAt: Date.now() + 10 * 60 * 1000,
      draft,
    });
    return { ok: true, data: { email: normalizedEmail } };
  }

  async requestPasswordReset(_email: string): Promise<AuthResult> {
    this.init();
    await simulateLatency();
    return { ok: true };
  }

  async reauthenticate(): Promise<AuthResult> {
    this.init();
    await simulateLatency();
    return this.readSession().status === "authenticated"
      ? { ok: true }
      : { ok: false, errorCode: "session_expired" };
  }

  async refreshSession(): Promise<AuthResult<AuthUser>> {
    this.init();
    await simulateLatency();
    const session = this.readSession();
    return session.status === "authenticated" && session.user
      ? { ok: true, data: session.user }
      : { ok: false, errorCode: "session_expired" };
  }

  async updatePassword(input: UpdatePasswordInput): Promise<AuthResult> {
    this.init();
    await simulateLatency();
    const session = this.readSession();
    if (session.status !== "authenticated" || !session.user)
      return { ok: false, errorCode: "session_expired" };
    const users = safeGet<StoredUserRecord[]>(K_USERS) ?? [];
    const user = users.find((candidate) => candidate.id === session.user!.id);
    if (!user) return { ok: false, errorCode: "session_expired" };
    user.passwordDigest = digest(input.password);
    safeSet(K_USERS, users);
    return { ok: true };
  }

  async verifyCode(email: string, code: string): Promise<AuthResult<AuthUser>> {
    this.init();
    await simulateLatency();
    const pending = safeGet<PendingRecord>(K_PENDING);
    if (!pending || pending.email.toLowerCase() !== email.trim().toLowerCase())
      return { ok: false, errorCode: "otp_invalid" };
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

  async resendCode(email: string, _next?: string): Promise<AuthResult> {
    this.init();
    await simulateLatency();
    const pending = safeGet<PendingRecord>(K_PENDING);
    if (!pending || pending.email.toLowerCase() !== email.trim().toLowerCase())
      return { ok: false, errorCode: "generic" };
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

  signInWithGoogle(_next?: string) {
    return this.signInWithProvider("google");
  }
  signInWithApple(_next?: string) {
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
    const username = input.username?.trim().toLowerCase() || users[idx].username;
    const usernameValidation = validateCanonicalUsername(username);
    if (usernameValidation)
      return {
        ok: false,
        errorCode: usernameValidation === "reserved" ? "reserved_username" : "invalid_username",
      };
    if (
      users.some(
        (candidate, candidateIndex) =>
          candidateIndex !== idx && candidate.username.toLowerCase() === username,
      )
    )
      return { ok: false, errorCode: "username_taken" };
    const merged: StoredUserRecord = {
      ...users[idx],
      username,
      displayName: input.displayName?.trim() || users[idx].displayName,
      favoriteClubId: input.favoriteClubId ?? users[idx].favoriteClubId,
      avatarDataUrl: input.removeAvatar
        ? undefined
        : (input.avatarDataUrl ?? users[idx].avatarDataUrl),
      language: input.language ?? users[idx].language,
      notifications: { ...users[idx].notifications, ...(input.notifications ?? {}) },
      profileComplete: true,
    };
    users[idx] = merged;
    safeSet(K_USERS, users);
    this.emit();
    return { ok: true, data: stripPassword(merged) };
  }

  async requestAccountDeletion(): Promise<AuthResult<{ requestId: string }>> {
    this.init();
    await simulateLatency();
    const session = this.readSession();
    if (session.status !== "authenticated" || !session.user)
      return { ok: false, errorCode: "unauthorized" };
    const existing = safeGet<{ requestId: string }>(K_DELETION);
    const request = existing ?? { requestId: `deletion-${session.user.id}` };
    safeSet(K_DELETION, request);
    return { ok: true, data: request };
  }

  async cancelAccountDeletion(): Promise<AuthResult> {
    this.init();
    await simulateLatency();
    if (this.readSession().status !== "authenticated")
      return { ok: false, errorCode: "unauthorized" };
    safeRemove(K_DELETION);
    return { ok: true };
  }

  async signOut(options?: SignOutOptions): Promise<void> {
    this.init();
    this.setSession(null);
    if (options?.resetLocalData && hasWindow()) {
      const keys = ["botolago.fantasy.team", "botolago.fantasy.bank", "botolago.fantasy.transfers"];
      keys.forEach(safeRemove);
    }
  }

  /** Test-only reset — clears all local mock state. */
  __reset() {
    if (!hasWindow()) return;
    safeRemove(K_SESSION);
    safeRemove(K_USERS);
    safeRemove(K_PENDING);
    safeRemove(K_DELETION);
    this.initialized = false;
    this.cachedSession = { user: null, status: "loading" };
    this.init();
  }
}

async function simulateLatency() {
  await new Promise((r) => setTimeout(r, 20));
}
