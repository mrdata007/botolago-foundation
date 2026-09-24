import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { authOtpSlotClass, authOutlineClass } from "@/components/auth/auth-classes";
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
import { ui, UiButton, UiCard, UiHeader, UiIconButton } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

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
    // A detail screen of Profile: its own bar replaces the global one — the
    // back pill to Profile, "PROFIL" as the kicker and a short title — and the
    // page's full name ("Authentification à deux facteurs") heads the card.
    <AppShell
      topBar={
        <UiHeader
          sticky
          kicker={t("profile.title")}
          title={t("profile.section.security")}
          backTo="/profile"
        />
      }
    >
      <p className={cn(ui.text.secondary, ui.tone.muted)}>{t("auth.mfa.subtitle")}</p>

      {IS_MOCK_AUTH ? (
        <UiCard padding="lg" className={cn("mt-5", ui.text.body, ui.tone.muted)}>
          {t("auth.mfa.demo_unavailable")}
        </UiCard>
      ) : loading ? (
        <div className={cn("mt-5 flex items-center gap-2", ui.text.body, ui.tone.muted)}>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t("auth.mfa.loading")}
        </div>
      ) : enrollment ? (
        <UiCard as="section" padding="lg" className="mt-5 overflow-hidden">
          <h2 className={cn(ui.display.header, ui.tone.default)}>{t("auth.mfa.scan_title")}</h2>
          <p className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>{t("auth.mfa.scan_body")}</p>

          <div className="mt-4 flex justify-center">
            <img
              src={toQrDataUrl(enrollment.qrCodeSvg)}
              alt={t("auth.mfa.scan_title")}
              className={cn(
                "h-44 w-44 border p-2",
                ui.radius.card,
                "border-[color:var(--ui-rule)] bg-[color:var(--ui-surface)]",
              )}
            />
          </div>

          <div className="mt-4">
            <div className={cn("mb-1", ui.text.label, ui.tone.muted)}>
              {t("auth.mfa.secret_label")}
            </div>
            <div className="flex items-center gap-2">
              {/* dir="ltr" so bidi reordering can never scramble the secret
                  for an Arabic (RTL) reader typing it in manually. The
                  `ltr:` prefix on the tracking is the BG-0069 rule: this
                  element is Latin-only, but the class must still say so. */}
              <code
                dir="ltr"
                className={cn(
                  "min-w-0 flex-1 truncate px-3 py-2.5 text-start font-mono ltr:tracking-wider",
                  ui.radius.card,
                  ui.rule.all,
                  ui.surface.sunken,
                  ui.text.meta,
                )}
              >
                {enrollment.secret}
              </code>
              {/* The round soft control, like every icon button in Option A. */}
              <UiIconButton onClick={copySecret} aria-label={t("auth.mfa.secret_copy")}>
                {copied ? (
                  <Check className="text-[color:var(--ui-positive)]" aria-hidden />
                ) : (
                  <Copy aria-hidden />
                )}
              </UiIconButton>
            </div>
            <p
              role="status"
              aria-live="polite"
              className={cn(
                "mt-1 min-h-[calc(var(--ui-text-micro)*var(--ui-leading-flat))]",
                ui.text.micro,
                "text-[color:var(--ui-positive)]",
              )}
            >
              {copied ? t("auth.mfa.secret_copied") : ""}
            </p>
          </div>

          <form onSubmit={submitVerification} noValidate className="mt-5 grid gap-3">
            <div className="flex flex-col items-center gap-2">
              <label htmlFor="mfa-enrol-code" className={cn(ui.text.label, ui.tone.muted)}>
                {t("auth.mfa.code_label")}
              </label>
              {/* The auth family's code slots: 44px wide on the row height
                  (these were the V1 36px slots, under the tap floor), the
                  filled look, and left to right in Arabic too — a code is
                  read first digit to last. */}
              <div dir="ltr">
                <InputOTP
                  id="mfa-enrol-code"
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
                    <InputOTPSlot index={0} className={authOtpSlotClass} />
                    <InputOTPSlot index={1} className={authOtpSlotClass} />
                    <InputOTPSlot index={2} className={authOtpSlotClass} />
                    <InputOTPSlot index={3} className={authOtpSlotClass} />
                    <InputOTPSlot index={4} className={authOtpSlotClass} />
                    <InputOTPSlot index={5} className={authOtpSlotClass} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              {error && (
                <p
                  role="alert"
                  aria-live="polite"
                  className={cn(
                    ui.text.meta,
                    "[font-weight:var(--ui-weight-heavy)] text-[color:var(--ui-negative)]",
                  )}
                >
                  {t(error)}
                </p>
              )}
            </div>

            <UiButton type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {t("auth.mfa.verify_cta")}
            </UiButton>
            <UiButton
              variant="outline"
              onClick={cancelEnrollment}
              disabled={submitting}
              className={authOutlineClass}
            >
              {t("auth.mfa.cancel_cta")}
            </UiButton>
          </form>
        </UiCard>
      ) : (
        <UiCard as="section" padding="lg" className="mt-5 overflow-hidden">
          <div className="flex items-start gap-3">
            {/* The status disc: round, like every glyph plate in Option A. */}
            <span
              className={cn(
                "grid h-10 w-10 shrink-0 place-items-center",
                ui.radius.full,
                enrolled
                  ? "bg-[color:color-mix(in_oklab,var(--ui-positive)_20%,transparent)] text-[color:var(--ui-positive)]"
                  : cn(ui.surface.sunken, ui.tone.muted),
              )}
              aria-hidden
            >
              {enrolled ? <ShieldCheck className="h-5 w-5" /> : <ShieldOff className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className={cn(ui.display.header, ui.tone.default)}>
                {enrolled ? t("auth.mfa.enabled_title") : t("auth.mfa.title")}
              </h2>
              <p className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>
                {enrolled ? t("auth.mfa.enabled_body") : t("auth.mfa.disabled_body")}
              </p>
              {enrolled && factors[0] && (
                <p className={cn("mt-1", ui.text.micro, ui.tone.muted)}>
                  {t("auth.mfa.enabled_since")}{" "}
                  {new Date(factors[0].createdAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>

          {levels && (
            <div
              className={cn(
                "mt-4 flex items-center justify-between gap-3 px-3 py-2.5",
                ui.radius.card,
                ui.surface.sunken,
                ui.text.meta,
              )}
            >
              <span className={ui.tone.muted}>{t("auth.mfa.aal_label")}</span>
              <span
                className={cn(
                  "[font-weight:var(--ui-weight-heavy)]",
                  sessionIsAal2 ? "text-[color:var(--ui-positive)]" : ui.tone.default,
                )}
              >
                {sessionIsAal2 ? t("auth.mfa.aal2_value") : t("auth.mfa.aal1_value")}
              </span>
            </div>
          )}

          {!enrolled && (
            <UiButton className="mt-4" onClick={startEnrollment} disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <KeyRound className="h-4 w-4" aria-hidden />
              )}
              {t("auth.mfa.enroll_cta")}
            </UiButton>
          )}
          {error && !enrolled && (
            <p
              role="alert"
              aria-live="polite"
              className={cn(
                "mt-2",
                ui.text.meta,
                "[font-weight:var(--ui-weight-heavy)] text-[color:var(--ui-negative)]",
              )}
            >
              {t(error)}
            </p>
          )}
        </UiCard>
      )}
    </AppShell>
  );
}
