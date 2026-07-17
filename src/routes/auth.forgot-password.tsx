import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { AuthShell, AuthPrimaryButton, AuthSecondaryButton, AuthFieldError, AuthFieldLabel } from "@/components/auth/AuthShell";
import { useI18n } from "@/i18n/provider";
import { authService } from "@/services/auth";
import { validateEmail } from "@/lib/validation";
import type { TranslationKey } from "@/i18n/dictionaries";

export const Route = createFileRoute("/auth/forgot-password")({
  head: () => ({ meta: [{ title: "Mot de passe oublié — BotolaGO" }] }),
  component: ForgotPage,
});

function ForgotPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const emailId = useId();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<TranslationKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const err = validateEmail(email);
    setError(err);
    if (err) return;
    setSubmitting(true);
    await authService.requestPasswordReset(email);
    setSubmitting(false);
    setSent(true);
  };

  if (sent) {
    return (
      <AuthShell title={t("auth.forgot.success_title")} subtitle={t("auth.forgot.success_body")}>
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-600">
            <CheckCircle2 className="h-8 w-8" aria-hidden />
          </div>
          <AuthSecondaryButton onClick={() => navigate({ to: "/auth/login" })}>
            {t("auth.forgot.back_to_login")}
          </AuthSecondaryButton>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("auth.forgot.title")} subtitle={t("auth.forgot.subtitle")}>
      <form onSubmit={onSubmit} noValidate className="grid gap-3">
        <div>
          <AuthFieldLabel htmlFor={emailId}>{t("auth.email")}</AuthFieldLabel>
          <input id={emailId} type="email" autoComplete="email" inputMode="email"
            value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }}
            aria-invalid={!!error}
            className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm focus:border-[color:var(--brand-primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)]/40 outline-none"
          />
          <AuthFieldError id={`${emailId}-err`}>{error && t(error)}</AuthFieldError>
        </div>
        <AuthPrimaryButton type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {submitting ? t("auth.submitting") : t("auth.forgot.cta")}
        </AuthPrimaryButton>
      </form>
    </AuthShell>
  );
}
