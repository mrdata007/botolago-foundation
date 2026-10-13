// Public callback landing page for Supabase auth redirects (email link,
// password recovery, OAuth). Parses URL params/hash, exchanges tokens, then
// scrubs sensitive query/hash data and navigates to a safe same-origin path.

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AuthShell, AuthFieldError, AuthSecondaryButton } from "@/components/auth/AuthShell";
import { useI18n } from "@/i18n/provider";
import { supabase } from "@/integrations/supabase/client";
import { authService, IS_MOCK_AUTH } from "@/services/auth";
import { cleanAuthCallbackUrl, sanitizeAuthCallbackNext } from "@/lib/auth-callback";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({ meta: [{ title: "Connexion — BotolaGO" }] }),
  component: CallbackPage,
});

function CallbackPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

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
            // Land on update-password so the user completes the reset.
            if (!cancelled) navigate({ to: "/auth/update-password" });
            return;
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
        if (!session.ok || !session.data) {
          throw new Error("callback_session_unavailable");
        }
        if (!cancelled && !session.data.profileComplete) {
          navigate({ to: "/auth/profile-setup", search: { next } });
          return;
        }
        if (!cancelled) navigate({ to: next });
      } catch {
        scrubUrl();
        setError("callback_error");
        setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <AuthShell title={t("auth.callback.title")} subtitle={t("auth.callback.subtitle")}>
      {busy && !error ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        </div>
      ) : null}
      {error && (
        <div className="grid gap-3">
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
