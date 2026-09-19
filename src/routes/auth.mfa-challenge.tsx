import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AuthShell, AuthPrimaryButton, AuthFieldError } from "@/components/auth/AuthShell";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useI18n } from "@/i18n/provider";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { listVerifiedTotpFactors, verifyTotpFactor } from "@/backend/auth/mfa";
import { MfaError, type MfaErrorCode } from "@/backend/auth/mfa-errors";
import type { TranslationKey } from "@/i18n/dictionaries";

function sanitizeNext(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  if (!raw.startsWith("/") || raw.startsWith("//")) return undefined;
  return raw;
}

export const Route = createFileRoute("/auth/mfa-challenge")({
  head: () => ({ meta: [{ title: "Vérification en deux étapes — BotolaGO" }] }),
  validateSearch: (s: Record<string, unknown>) => {
    const next = sanitizeNext(s.next);
    return next ? { next } : {};
  },
  component: MfaChallengePage,
});

function errorKey(code: MfaErrorCode): TranslationKey {
  switch (code) {
    case "invalid_code":
      return "auth.mfa_challenge.error_invalid";
    case "challenge_expired":
      return "auth.mfa_challenge.error_expired";
    default:
      return "auth.mfa_challenge.error_generic";
  }
}

function MfaChallengePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { next = "/" } = Route.useSearch();

  const [factorId, setFactorId] = useState<string | null>(null);
  const [loadingFactor, setLoadingFactor] = useState(true);
  const [code, setCode] = useState("");
  const [error, setError] = useState<TranslationKey | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const factors = await listVerifiedTotpFactors(supabase.auth.mfa);
        if (!cancelled) setFactorId(factors[0]?.id ?? null);
      } catch {
        // The submit handler below will surface a fresh error on attempt.
      } finally {
        if (!cancelled) setLoadingFactor(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const continueAfterChallenge = () => {
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
      title={t("auth.mfa_challenge.title")}
      subtitle={t("auth.mfa_challenge.subtitle")}
      showBack={false}
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <div className="flex flex-col items-center gap-3">
          <label className="sr-only">{t("auth.mfa_challenge.code_label")}</label>
          <InputOTP
            maxLength={6}
            value={code}
            onChange={(v) => {
              setCode(v);
              setError(null);
            }}
            inputMode="numeric"
            pattern="[0-9]*"
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
          <AuthFieldError id="mfa-challenge-err">{error && t(error)}</AuthFieldError>
        </div>

        <AuthPrimaryButton type="submit" disabled={submitting || loadingFactor || !factorId}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {submitting ? t("auth.submitting") : t("auth.mfa_challenge.cta")}
        </AuthPrimaryButton>
      </form>
    </AuthShell>
  );
}
