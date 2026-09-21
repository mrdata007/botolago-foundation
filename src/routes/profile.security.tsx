import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/shell/AppShell";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useI18n } from "@/i18n/provider";
import { useAuth } from "@/auth/AuthProvider";
import { IS_MOCK_AUTH } from "@/services/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  enrollTotpFactor,
  getAssuranceLevels,
  isAal2,
  listVerifiedTotpFactors,
  toQrDataUrl,
  unenrollFactor,
  verifyTotpFactor,
  type AssuranceLevels,
  type TotpEnrollment,
  type TotpFactorSummary,
} from "@/backend/auth/mfa";
import { MfaError, type MfaErrorCode } from "@/backend/auth/mfa-errors";
import type { TranslationKey } from "@/i18n/dictionaries";

export const Route = createFileRoute("/profile/security")({
  head: () => ({
    meta: [{ title: "Authentification à deux facteurs — BotolaGO" }],
  }),
  component: SecurityPage,
});

function errorKey(code: MfaErrorCode): TranslationKey {
  switch (code) {
    case "invalid_code":
      return "auth.mfa.error.invalid_code";
    case "challenge_expired":
      return "auth.mfa.error.challenge_expired";
    case "rate_limited":
      return "auth.mfa.error.rate_limited";
    case "network":
      return "auth.mfa.error.network";
    case "already_enrolled":
      return "auth.mfa.error.already_enrolled";
    default:
      return "auth.mfa.error.generic";
  }
}

function SecurityPage() {
  const { t } = useI18n();
  const { status } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState<readonly TotpFactorSummary[]>([]);
  const [levels, setLevels] = useState<AssuranceLevels | null>(null);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (status === "guest" || status === "anonymous") {
      navigate({ to: "/auth/login", search: { next: "/profile/security" } });
    }
  }, [status, navigate]);

  const refreshStatus = async (isCancelled: () => boolean = () => false) => {
    const [nextFactors, nextLevels] = await Promise.all([
      listVerifiedTotpFactors(supabase.auth.mfa),
      getAssuranceLevels(supabase.auth.mfa),
    ]);
    if (isCancelled()) return;
    setFactors(nextFactors);
    setLevels(nextLevels);
  };

  useEffect(() => {
    if (status !== "authenticated" || IS_MOCK_AUTH) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await refreshStatus(() => cancelled);
      } catch {
        // Best-effort status load -- the page still renders the enroll CTA below.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const startEnrollment = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const result = await enrollTotpFactor(supabase.auth.mfa);
      setEnrollment(result);
    } catch (err) {
      setError(errorKey(err instanceof MfaError ? err.code : "internal"));
    } finally {
      setSubmitting(false);
    }
  };

  // enroll() has already created an unverified factor server-side, so dropping
  // local state alone would strand it on the account -- repeated start/cancel
  // cycles would pile up factors until GoTrue's per-user limit starts
  // rejecting new enrollments with a confusing "already enrolled".
  const cancelEnrollment = async () => {
    const abandoned = enrollment;
    setEnrollment(null);
    setCode("");
    setError(null);
    if (!abandoned) return;
    try {
      await unenrollFactor(supabase.auth.mfa, abandoned.factorId);
    } catch {
      // Best-effort cleanup: the user has already left the flow, and a
      // leftover unverified factor must not surface as an error to them.
    }
  };

  const submitVerification = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!enrollment || submitting) return;
    if (code.length !== 6) {
      setError("auth.mfa.error.invalid_code");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await verifyTotpFactor(supabase.auth.mfa, enrollment.factorId, code);
      await refreshStatus();
      setEnrollment(null);
      setCode("");
      toast.success(t("auth.mfa.success_toast"));
    } catch (err) {
      setError(errorKey(err instanceof MfaError ? err.code : "internal"));
    } finally {
      setSubmitting(false);
    }
  };

  const copySecret = async () => {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser; the field remains
      // visible for the user to select and copy manually.
    }
  };

  const enrolled = factors.length > 0;
  const sessionIsAal2 = levels ? isAal2(levels) : false;

  return (
    <AppShell>
      <h1 className="pt-2 text-2xl font-black tracking-tight text-foreground">
        <span className="text-brand whitespace-pre-wrap">{t("auth.mfa.title")}</span>
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("auth.mfa.subtitle")}</p>

      {IS_MOCK_AUTH ? (
        <div className="mt-6 rounded-2xl border border-[var(--glass-border)] bg-[color:var(--surface,#fff)]/85 p-5 text-sm text-muted-foreground shadow-sm">
          {t("auth.mfa.demo_unavailable")}
        </div>
      ) : loading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t("auth.mfa.loading")}
        </div>
      ) : enrollment ? (
        <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-[color:var(--surface,#fff)]/85 p-5 shadow-sm">
          <h2 className="text-sm font-bold text-foreground">{t("auth.mfa.scan_title")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("auth.mfa.scan_body")}</p>

          <div className="mt-4 flex justify-center">
            <img
              src={toQrDataUrl(enrollment.qrCodeSvg)}
              alt={t("auth.mfa.scan_title")}
              className="h-44 w-44 rounded-xl border border-[var(--border-subtle,rgba(0,0,0,0.06))] bg-white p-2"
            />
          </div>

          <div className="mt-4">
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t("auth.mfa.secret_label")}
            </div>
            <div className="flex items-center gap-2">
              {/* dir="ltr" so bidi reordering can never scramble the secret
                  for an Arabic (RTL) reader typing it in manually. */}
              <code
                dir="ltr"
                className="min-w-0 flex-1 truncate rounded-xl border border-input bg-muted/50 px-3 py-2 text-start text-xs font-mono tracking-wider"
              >
                {enrollment.secret}
              </code>
              <button
                type="button"
                onClick={copySecret}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-input bg-background text-foreground/80 hover:bg-muted"
                aria-label={t("auth.mfa.secret_copy")}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-600" aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden />
                )}
              </button>
            </div>
            <p
              role="status"
              aria-live="polite"
              className="mt-1 min-h-[14px] text-[11px] text-emerald-700"
            >
              {copied ? t("auth.mfa.secret_copied") : ""}
            </p>
          </div>

          <form onSubmit={submitVerification} noValidate className="mt-5 grid gap-3">
            <div className="flex flex-col items-center gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t("auth.mfa.code_label")}
              </label>
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
              {error && (
                <p
                  role="alert"
                  aria-live="polite"
                  className="text-xs font-semibold text-destructive"
                >
                  {t(error)}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl cta-brand px-4 text-sm font-bold transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {t("auth.mfa.verify_cta")}
            </button>
            <button
              type="button"
              onClick={cancelEnrollment}
              disabled={submitting}
              className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-input bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              {t("auth.mfa.cancel_cta")}
            </button>
          </form>
        </section>
      ) : (
        <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-[color:var(--surface,#fff)]/85 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                enrolled ? "bg-emerald-500/15 text-emerald-700" : "bg-muted text-foreground/70"
              }`}
              aria-hidden
            >
              {enrolled ? <ShieldCheck className="h-5 w-5" /> : <ShieldOff className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-foreground">
                {enrolled ? t("auth.mfa.enabled_title") : t("auth.mfa.title")}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {enrolled ? t("auth.mfa.enabled_body") : t("auth.mfa.disabled_body")}
              </p>
              {enrolled && factors[0] && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("auth.mfa.enabled_since")}{" "}
                  {new Date(factors[0].createdAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>

          {levels && (
            <div className="mt-4 flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2 text-xs">
              <span className="font-semibold text-muted-foreground">{t("auth.mfa.aal_label")}</span>
              <span
                className={`font-bold ${sessionIsAal2 ? "text-emerald-700" : "text-foreground"}`}
              >
                {sessionIsAal2 ? t("auth.mfa.aal2_value") : t("auth.mfa.aal1_value")}
              </span>
            </div>
          )}

          {!enrolled && (
            <button
              type="button"
              onClick={startEnrollment}
              disabled={submitting}
              className="mt-4 inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl cta-brand px-4 text-sm font-bold transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <KeyRound className="h-4 w-4" aria-hidden />
              )}
              {t("auth.mfa.enroll_cta")}
            </button>
          )}
          {error && !enrolled && (
            <p
              role="alert"
              aria-live="polite"
              className="mt-2 text-xs font-semibold text-destructive"
            >
              {t(error)}
            </p>
          )}
        </section>
      )}
    </AppShell>
  );
}
