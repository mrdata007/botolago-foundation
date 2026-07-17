import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { authService, type AuthSession, type AuthStatus, type AuthUser } from "@/services/auth";
import { useI18n } from "@/i18n/provider";

interface AuthPromptState {
  open: boolean;
  reason?: string;
  onCancel?: () => void;
}

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  profileComplete: boolean;
  requireAuth: (action: () => void, opts?: { reason?: string; onCancel?: () => void }) => void;
  prompt: AuthPromptState;
  closePrompt: () => void;
  signOut: (opts?: { resetLocalData?: boolean }) => Promise<void>;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession>(() => authService.getSession());
  const [prompt, setPrompt] = useState<AuthPromptState>({ open: false });
  const { lang } = useI18n();
  const langRef = useRef(lang);
  langRef.current = lang;

  useEffect(() => {
    const unsub = authService.subscribeToSession(setSession);
    return () => { unsub(); };
  }, []);

  const requireAuth = useCallback<AuthContextValue["requireAuth"]>((action, opts) => {
    const s = authService.getSession();
    if (s.status === "authenticated") {
      action();
      return;
    }
    setPrompt({ open: true, reason: opts?.reason, onCancel: opts?.onCancel });
  }, []);

  const closePrompt = useCallback(() => setPrompt({ open: false }), []);

  const signOut = useCallback(async (opts?: { resetLocalData?: boolean }) => {
    await authService.signOut(opts);
  }, []);

  const refresh = useCallback(() => setSession(authService.getSession()), []);

  const value = useMemo<AuthContextValue>(() => ({
    user: session.user,
    status: session.status,
    profileComplete: session.user?.profileComplete ?? false,
    requireAuth,
    prompt,
    closePrompt,
    signOut,
    refresh,
  }), [session, prompt, requireAuth, closePrompt, signOut, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
