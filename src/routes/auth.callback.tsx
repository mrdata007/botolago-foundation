// Public callback landing page for Supabase auth redirects (email link,
// password recovery, OAuth). Parses URL params/hash, exchanges tokens, then
// scrubs sensitive query/hash data and navigates to a safe same-origin path.

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { AuthShell, AuthFieldError, AuthSecondaryButton } from "@/components/auth/AuthShell";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/provider";
import { supabase } from "@/integrations/supabase/client";
import { authService, IS_MOCK_AUTH, type AuthStatus } from "@/services/auth";
import { AssuranceRetry } from "@/auth/AssuranceRetry";
import { secondFactorStep } from "@/auth/second-factor";
import { cleanAuthCallbackUrl, sanitizeAuthCallbackNext } from "@/lib/auth-callback";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({ meta: [{ title: "Connexion — BotolaGO" }] }),
  component: CallbackPage,
});

/** Where the callback lands once the session is settled. */
interface Landing {
  /** The sanitised destination. */
  readonly to: string;
  /** A password-recovery link: straight to its destination, never profile setup. */
  readonly recovery: boolean;
}

function CallbackPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [error, setError] = useState<"callback_error" | "unconfirmed" | null>(null);
  const [busy, setBusy] = useState(true);
  const landing = useRef<Landing>({ to: "/", recovery: false });

  // The link has been exchanged for a session; where it goes now depends on
  // how far that session got. The callback used to navigate on as soon as the
  // refresh returned, so an e-mail or OAuth sign-in of an account with a
  // second factor reached the app without its code.
  const land = useCallback(
    (
      status: AuthStatus | undefined,
      profileComplete: boolean | undefined,
      isCancelled: () => boolean = () => false,
    ) => {
      if (isCancelled()) return;
      const { to, recovery } = landing.current;
      switch (secondFactorStep(status)) {
        case "challenge":
          navigate({ to: "/auth/mfa-challenge", search: { next: to } });
          return;
        case "retry":
          setError("unconfirmed");
          setBusy(false);
          return;
        case "proceed":
          if (!recovery && profileComplete === false) {
            navigate({ to: "/auth/profile-setup", search: { next: to } });
            return;
          }
      }
      navigate({ to });
    },
    [navigate],
  );

  const [failedRetries, setFailedRetries] = useState(0);
  const recheck = async () => {
    setBusy(true);
    try {
      const session = await authService.recheckSession();
      if (secondFactorStep(session.status) === "retry") setFailedRetries((n) => n + 1);
      else setError(null);
      land(session.status, session.user?.profileComplete);
    } catch {
      setFailedRetries((n) => n + 1);
      setError("unconfirmed");
      setBusy(false);
    }
  };

  const signOutUnconfirmed = async () => {
    setBusy(true);
    await authService.signOut();
    navigate({ to: "/auth/login" });
  };

  useEffect(() => {
    if (IS_MOCK_AUTH) {
      const next = sanitizeAuthCallbackNext(new URL(window.location.href).searchParams.get("next"));
      scrubUrl();
      navigate({ to: next });
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const url = new URL(window.location.href);
        const params = url.searchParams;
        const hash = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
        const hasProviderError = params.has("error_description") || hash.has("error_description");
        const next = sanitizeAuthCallbackNext(params.get("next"));
        landing.current = { to: next, recovery: false };
        const code = params.get("code");
        const tokenHash = params.get("token_hash");
        const type = params.get("type");
        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");

        // Capture all required values, then remove credentials before any
        // asynchronous work or failure branch can leave them in history.
        scrubUrl();

        if (hasProviderError) {
          setError("callback_error");
          setBusy(false);
          return;
        }

        let handled = false;

        if (code) {
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exErr) throw exErr;
          handled = true;
        } else if (tokenHash && type) {
          // Email confirmation / recovery / magiclink via token_hash.
          const otpType = type as
            | "signup"
            | "recovery"
            | "invite"
            | "email"
            | "magiclink"
            | "email_change";
          const { error: vErr } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType,
          });
          if (vErr) throw vErr;
          handled = true;
          if (otpType === "recovery" && next === "/") {
            // Land on update-password so the user completes the reset -- after
            // the one-time code, for an account that has one.
            landing.current = { to: "/auth/update-password", recovery: true };
          }
        } else if (accessToken && refreshToken) {
          const { error: sErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sErr) throw sErr;
          handled = true;
        }

        if (!handled) {
          // Nothing to exchange — probably already authenticated or a plain visit.
        }

        const session = await authService.refreshSession();
        land(
          session.ok ? session.status : undefined,
          session.data?.profileComplete,
          () => cancelled,
        );
      } catch {
        scrubUrl();
        setError("callback_error");
        setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, land]);

  return (
    <AuthShell compact title={t("auth.callback.title")} subtitle={t("auth.callback.subtitle")}>
      {busy && !error ? (
        // The spinner in the brand foreground, as the shared `LoadingState`
        // draws it, rather than muted: it is the one thing on the sheet.
        <div className={cn("flex items-center justify-center py-6", ui.tone.ink)}>
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        </div>
      ) : null}
      {error === "unconfirmed" && (
        <AssuranceRetry
          busy={busy}
          failedRetries={failedRetries}
          onRetry={() => void recheck()}
          onSignOut={() => void signOutUnconfirmed()}
        />
      )}
      {error === "callback_error" && (
        <div className="grid gap-3">
          {/* Kept on `AuthFieldError` rather than moved to `UiAlert`: this
              message announces politely (`role="alert" aria-live="polite"`),
              and `UiAlert tone="negative"` announces as a bare `role="alert"`
              — a different interruption for the same event. This lane changes
              styling, not announcements. */}
          <AuthFieldError id="cb-err">{t("auth.callback.error")}</AuthFieldError>
          <AuthSecondaryButton onClick={() => navigate({ to: "/auth/login" })}>
            {t("auth.forgot.back_to_login")}
          </AuthSecondaryButton>
        </div>
      )}
    </AuthShell>
  );
}

function scrubUrl() {
  try {
    window.history.replaceState({}, "", cleanAuthCallbackUrl(window.location.href));
  } catch {
    /* ignore */
  }
}
