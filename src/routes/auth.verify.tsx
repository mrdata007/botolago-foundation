import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthShell, AuthPrimaryButton, AuthFieldError } from "@/components/auth/AuthShell";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useI18n } from "@/i18n/provider";
import { authService, IS_MOCK_AUTH } from "@/services/auth";
import { markWelcomeDone } from "@/lib/welcome";
import type { TranslationKey } from "@/i18n/dictionaries";
import { sanitizeAuthCallbackNext } from "@/lib/auth-callback";

export const Route = createFileRoute("/auth/verify")({
  head: () => ({ meta: [{ title: "Vérification — BotolaGO" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    email: typeof s.email === "string" ? s.email : "",
    next: sanitizeAuthCallbackNext(typeof s.next === "string" ? s.next : null),
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { email, next } = Route.useSearch();
  const [code, setCode] = useState("");
  const [error, setError] = useState<TranslationKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(30);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timer.current = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (submitting) return;
    if (code.length !== 6) {
      setError("auth.error.otp_required");
      return;
    }
    setSubmitting(true);
    const res = await authService.verifyCode(email, code);
    setSubmitting(false);
    if (!res.ok) {
      setError(
        res.errorCode === "otp_expired" ? "auth.error.otp_expired" : "auth.error.otp_invalid",
      );
      return;
    }
    markWelcomeDone();
    toast.success(t("auth.success.verify"));
    navigate({ to: "/auth/profile-setup", search: { next } });
  };

  const resend = async () => {
    if (cooldown > 0) return;
    const res = await authService.resendCode(email, next);
    if (res.ok) {
      setCooldown(30);
      toast.success(t("auth.verify.resend"));
    }
  };

  return (
    <AuthShell title={t("auth.verify.title")} subtitle={`${t("auth.verify.subtitle")} ${email}`}>
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <div className="flex flex-col items-center gap-3">
          <label className="sr-only">{t("auth.verify.code_label")}</label>
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
          <AuthFieldError id="otp-err">{error && t(error)}</AuthFieldError>
        </div>

        {IS_MOCK_AUTH && (
          <p className="text-center text-[11px] text-muted-foreground">
            {t("auth.verify.demo_hint")}
          </p>
        )}

        <AuthPrimaryButton type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {submitting ? t("auth.submitting") : t("auth.verify.cta")}
        </AuthPrimaryButton>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => navigate({ to: "/auth/register", search: { next } })}
            className="font-semibold hover:text-foreground"
          >
            {t("auth.verify.change_email")}
          </button>
          <button
            type="button"
            onClick={resend}
            disabled={cooldown > 0}
            className="font-semibold text-[color:var(--brand-primary)] disabled:text-muted-foreground"
          >
            {cooldown > 0 ? `${t("auth.verify.resend_in")} ${cooldown}s` : t("auth.verify.resend")}
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
