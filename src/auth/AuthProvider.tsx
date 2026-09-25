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
import { useRouter } from "@tanstack/react-router";
import { authService, type AuthSession, type AuthStatus, type AuthUser } from "@/services/auth";
import { useI18n } from "@/i18n/provider";
import { fetchAccountStanding, rememberSuspension } from "@/services/account-standing";
import { claimGuestPredictionsOnSignIn } from "@/components/predictions/guest-claim";
import { forgetAccount, watchAccountSwitch } from "./account-queries";
import { challengeSearch, MFA_CHALLENGE_PATH, requireAuthStep } from "./second-factor";
import { SecondFactorGate } from "./SecondFactorGate";

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
  const { lang, t } = useI18n();
  const langRef = useRef(lang);
  langRef.current = lang;
  const tRef = useRef(t);
  tRef.current = t;
  const qc = useQueryClient();

  useEffect(() => {
    const unsub = authService.subscribeToSession(setSession);
    return () => {
      unsub();
    };
  }, []);

  // Sign-out / account-switch cleanup: purge owned Fantasy cache + drafts for
  // the outgoing UID, its Pronostics, and every other query keyed by it
  // (followed clubs, notification preferences, saved articles), in flight or
  // not. Public caches and guest local prototype data untouched. The same
  // account moving into a state that owes its second factor is NOT a leave:
  // see `watchAccountSwitch`.
  const watchAccount = useMemo(() => watchAccountSwitch((uid) => forgetAccount(qc, uid)), [qc]);
  useEffect(() => {
    watchAccount(session);
  }, [session, watchAccount]);

  // A banned account is signed out and sent to the sign-in page, which says
  // why. Asked on every sign-in and every load, then again whenever the tab
  // comes back into view (at most once a minute), so a ban placed while the
  // app is open takes effect the next time the person looks at it. An
  // unknown answer (offline, backend not updated) changes nothing: the
  // database refuses a banned account's writes on its own.
  const lastVisibilityCheck = useRef(0);
  const signedInUid = session.status === "authenticated" ? (session.user?.id ?? null) : null;
  useEffect(() => {
    if (!signedInUid) return;
    let cancelled = false;
    const check = async (throttled: boolean) => {
      const now = Date.now();
      if (throttled && now - lastVisibilityCheck.current < 60_000) return;
      lastVisibilityCheck.current = now;
      const standing = await fetchAccountStanding();
      if (cancelled || !standing?.banned) return;
      rememberSuspension(standing.bannedUntil);
      await authService.signOut();
      // A full navigation rather than a router push: it also drops every
      // cached query the banned session had loaded.
      window.location.assign("/auth/login");
    };
    // A new session is always asked, however recently the last one was: an
    // account banned while signed out must not get back in on a throttle.
    // Only the tab-returns check below is rate-limited.
    void check(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [signedInUid]);

  // Pronostics (BG-0146): the predictions a visitor made on this phone move to
  // the account whenever a session appears -- register, log-in and Google
  // alike. Nothing is sent when the phone holds none.
  useEffect(() => {
    if (!signedInUid) return;
    void claimGuestPredictionsOnSignIn({ queryClient: qc, lang: langRef.current, t: tRef.current });
  }, [signedInUid, qc]);

  // A password-only session of an account with a second factor is not signed
  // in for this purpose: it is sent to finish with its code, not offered the
  // sign-in prompt (it already has a password session) and never let through.
  const router = useRouter();
  const requireAuth = useCallback<AuthContextValue["requireAuth"]>(
    (action, opts) => {
      switch (requireAuthStep(authService.getSession().status)) {
        case "run":
          action();
          return;
        case "challenge": {
          const { pathname, searchStr } = router.state.location;
          void router.navigate({
            to: MFA_CHALLENGE_PATH,
            search: challengeSearch(pathname, searchStr),
          });
          return;
        }
        default:
          setPrompt({ open: true, reason: opts?.reason, onCancel: opts?.onCancel });
      }
    },
    [router],
  );

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

  return (
    <AuthContext.Provider value={value}>
      {children}
      <SecondFactorGate status={session.status} />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
