import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthShell, AuthPrimaryButton, AuthFieldError } from "@/components/auth/AuthShell";
import { authOtpSlotClass } from "@/components/auth/auth-classes";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { UiButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { listVerifiedTotpFactors, verifyTotpFactor } from "@/backend/auth/mfa";
import { MfaError, type MfaErrorCode } from "@/backend/auth/mfa-errors";
import { markWelcomeDone } from "@/lib/welcome";
import { sanitizeAuthCallbackNext } from "@/lib/auth-callback";
import type { TranslationKey } from "@/i18n/dictionaries";

export const Route = createFileRoute("/auth/mfa-challenge")({
  head: () => ({ meta: [{ title: "Vérification en deux étapes — BotolaGO" }] }),
  validateSearch: (s: Record<string, unknown>) => {
    const next = typeof s.next === "string" ? sanitizeAuthCallbackNext(s.next) : undefined;
    return next && next !== "/" ? { next } : {};
  },
  component: MfaChallengePage,
});

function errorKey(code: MfaErrorCode): TranslationKey {
  switch (code) {
    case "invalid_code":
      return "auth.mfa_challenge.error_invalid";
    case "challenge_expired":
      return "auth.mfa_challenge.error_expired";
    case "rate_limited":
      return "auth.mfa.error.rate_limited";
    case "network":
      return "auth.mfa.error.network";
    case "factor_not_found":
      return "auth.mfa_challenge.error_no_factor";
    default:
      return "auth.mfa_challenge.error_generic";
  }
}

function MfaChallengePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user, status } = useAuth();
  const { next = "/" } = Route.useSearch();

  const [factorId, setFactorId] = useState<string | null>(null);
  const [loadingFactor, setLoadingFactor] = useState(true);
  const [code, setCode] = useState("");
  const [error, setError] = useState<TranslationKey | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "guest" || status === "anonymous") {
      navigate({ to: "/auth/login", search: next === "/" ? {} : { next } });
    }
  }, [status, navigate, next]);

  useEffect(() => {
    // Wait for the session to hydrate: listing factors before AuthProvider has
    // a session returns nothing, which would otherwise leave this page stuck
    // with a disabled button and no explanation.
    if (status !== "authenticated") return;
    let cancelled = false;
    setLoadingFactor(true);
    (async () => {
      try {
        const factors = await listVerifiedTotpFactors(supabase.auth.mfa);
        if (cancelled) return;
        setFactorId(factors[0]?.id ?? null);
        if (factors.length === 0) setError("auth.mfa_challenge.error_no_factor");
      } catch (err) {
        if (!cancelled) setError(errorKey(err instanceof MfaError ? err.code : "internal"));
      } finally {
        if (!cancelled) setLoadingFactor(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, user?.id]);

  const continueAfterChallenge = () => {
    markWelcomeDone();
    toast.success(t("auth.success.login"));
    if (next !== "/" && user?.profileComplete) {
      window.location.href = next;
      return;
    }
    if (user?.profileComplete) {
      navigate({ to: "/" });
      return;
    }
    navigate({ to: "/auth/profile-setup", search: { next } });
  };

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (submitting || !factorId) return;
    if (code.length !== 6) {
      setError("auth.mfa_challenge.error_invalid");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await verifyTotpFactor(supabase.auth.mfa, factorId, code);
      continueAfterChallenge();
    } catch (err) {
      setError(errorKey(err instanceof MfaError ? err.code : "internal"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      compact
      title={t("auth.mfa_challenge.title")}
      subtitle={t("auth.mfa_challenge.subtitle")}
      showBack={false}
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <div className="flex flex-col items-center gap-3">
          <label htmlFor="mfa-challenge-code" className="sr-only">
            {t("auth.mfa_challenge.code_label")}
          </label>
          {/* Same slot treatment as `auth.verify`: left to right on both
              pages (a code is read first digit to last), the sheet's filled
              look, and the 44px floor (the V1 slots were 36px). The V1
              component keeps the keyboard model. */}
          <div dir="ltr">
            <InputOTP
              id="mfa-challenge-code"
              maxLength={6}
              value={code}
              onChange={(v) => {
                setCode(v);
                setError(null);
              }}
              disabled={loadingFactor || !factorId}
              inputMode="numeric"
              pattern="[0-9]*"
              aria-describedby="mfa-challenge-err"
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} className={authOtpSlotClass} />
                <InputOTPSlot index={1} className={authOtpSlotClass} />
                <InputOTPSlot index={2} className={authOtpSlotClass} />
                <InputOTPSlot index={3} className={authOtpSlotClass} />
                <InputOTPSlot index={4} className={authOtpSlotClass} />
                <InputOTPSlot index={5} className={authOtpSlotClass} />
              </InputOTPGroup>
            </InputOTP>
          </div>
          <AuthFieldError id="mfa-challenge-err">{error && t(error)}</AuthFieldError>
        </div>

        <AuthPrimaryButton type="submit" disabled={submitting || loadingFactor || !factorId}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {submitting ? t("auth.submitting") : t("auth.mfa_challenge.cta")}
        </AuthPrimaryButton>

        {/* Without a usable factor the form above is inert, so always leave a
            way out rather than stranding the user on a dead-end screen. */}
        {!loadingFactor && !factorId && (
          // Was a hand-rolled control with the ghost recipe spelled out —
          // 44px, control radius, meta at the heavy weight, focus ring. That
          // is `UiButton variant="ghost" size="sm"`, which also gives it the
          // brand foreground a control is supposed to read in rather than the
          // muted tone of body copy.
          <UiButton variant="ghost" size="sm" onClick={() => navigate({ to: "/" })}>
            {t("auth.mfa_challenge.continue_without")}
          </UiButton>
        )}
      </form>
    </AuthShell>
  );
}
