import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { AuthShell, AuthPrimaryButton, AuthSecondaryButton } from "@/components/auth/AuthShell";
import { ui, UiInput } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
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
    try {
      const result = await authService.requestPasswordReset(email);
      if (!result.ok) {
        setError(
          result.errorCode === "rate_limited"
            ? "auth.error.rate_limited"
            : result.errorCode === "network"
              ? "auth.error.network"
              : "auth.error.generic",
        );
        return;
      }
      setSent(true);
    } catch {
      setError("auth.error.network");
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <AuthShell title={t("auth.forgot.success_title")} subtitle={t("auth.forgot.success_body")}>
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <div
            className={cn(
              "grid h-14 w-14 place-items-center",
              ui.radius.control,
              "bg-[color:color-mix(in_oklab,var(--ui-positive)_18%,transparent)]",
              ui.tone.positive,
            )}
          >
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
        {/* The hand-rolled field used to render an error line the input was
            never described by: `aria-describedby` was missing here, so the
            message was visible and announced but not attached to the field.
            `UiInput` wires it from the same `error` prop that paints it. */}
        <UiInput
          id={emailId}
          label={t("auth.email")}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          error={error ? t(error) : undefined}
          reserveError
        />
        <AuthPrimaryButton type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {submitting ? t("auth.submitting") : t("auth.forgot.cta")}
        </AuthPrimaryButton>
      </form>
    </AuthShell>
  );
}
