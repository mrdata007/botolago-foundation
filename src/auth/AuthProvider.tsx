import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authService, type AuthSession, type AuthStatus, type AuthUser } from "@/services/auth";
import { useI18n } from "@/i18n/provider";
import { cleanupOwnedFantasyOnSignOut } from "@/services/fantasy-signout-cleanup";

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
  // Seeded with what the SERVER renders, not with authService.getSession().
  //
  // getSession() has a guest fast-path: on the client it reads the guest flag
  // out of localStorage and reports "guest" straight away, so a returning guest
  // does not flash the signed-out UI while Supabase resolves. The server has no
  // localStorage and returns "loading". Calling it from a state initialiser --
  // which runs during the client's FIRST render -- therefore produced a tree
  // that disagreed with the server's, and React threw away the whole server
  // render and rebuilt it (hydration error #418, seen on /profile in guest
  // state: the server sent the signed-out card, the client drew the guest one).
  //
  // Nothing is lost by waiting. subscribeToSession below pushes the current
  // session synchronously on subscribe, effects run immediately after
  // hydration, and that first push takes the same fast-path -- so the guest
  // state still arrives without a round trip, one frame later, and this time
  // React keeps the markup it was given.
  const [session, setSession] = useState<AuthSession>({ user: null, status: "loading" });
  const [prompt, setPrompt] = useState<AuthPromptState>({ open: false });
  const { lang } = useI18n();
  const langRef = useRef(lang);
  langRef.current = lang;
  const qc = useQueryClient();
  const prevUidRef = useRef<string | null>(session.user?.id ?? null);

  useEffect(() => {
    const unsub = authService.subscribeToSession(setSession);
    return () => {
      unsub();
    };
  }, []);

  // Sign-out / account-switch cleanup: purge owned Fantasy cache + drafts for
  // the outgoing UID. Public caches and guest local prototype data untouched.
  useEffect(() => {
    const nextUid = session.user?.id ?? null;
    const prev = prevUidRef.current;
    if (prev && prev !== nextUid) {
      cleanupOwnedFantasyOnSignOut({ qc, uid: prev });
    }
    prevUidRef.current = nextUid;
  }, [session.user?.id, qc]);

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

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session.user,
      status: session.status,
      profileComplete: session.user?.profileComplete ?? false,
      requireAuth,
      prompt,
      closePrompt,
      signOut,
      refresh,
    }),
    [session, prompt, requireAuth, closePrompt, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
