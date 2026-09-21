// Password recovery completion. Reached from the callback handler after
// verifying a `type=recovery` link. Requires an authenticated Supabase
// session (from the recovery token exchange).

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";
import { Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  AuthShell,
  AuthPrimaryButton,
  AuthFieldError,
  AuthFieldLabel,
  AuthFormError,
  AuthSecondaryButton,
  authFieldClass,
} from "@/components/auth/AuthShell";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/provider";
import { authService, IS_MOCK_AUTH } from "@/services/auth";
import { supabase } from "@/integrations/supabase/client";
import { validatePassword, passwordStrength } from "@/lib/validation";
import type { TranslationKey } from "@/i18n/dictionaries";

export const Route = createFileRoute("/auth/update-password")({
  head: () => ({ meta: [{ title: "Nouveau mot de passe — BotolaGO" }] }),
  component: UpdatePasswordPage,
});

/** The password meter, on the status tokens rather than Tailwind palette
 * literals, so it follows the theme like everything else. */
function strengthColor(strength: number): string {
  if (strength <= 1) return "bg-[color:var(--ui-negative)]";
  if (strength === 2) return "bg-[color:var(--ui-caution)]";
  return "bg-[color:var(--ui-positive)]";
}

function UpdatePasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const pwId = useId();
  const cpwId = useId();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<{
    pw?: TranslationKey;
    cpw?: TranslationKey;
    form?: TranslationKey;
  }>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    if (IS_MOCK_AUTH) {
      setHasSession(true);
      return;
    }
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setHasSession(!!data.user);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const strength = passwordStrength(password);

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (submitting) return;
    const pwErr = validatePassword(password);
    const cpwErr =
      confirm !== password ? ("auth.error.password_mismatch" as TranslationKey) : undefined;
    setErrors({ pw: pwErr ?? undefined, cpw: cpwErr });
    if (pwErr || cpwErr) return;
    setSubmitting(true);
    const res = await authService.updatePassword({ password });
    setSubmitting(false);
    if (!res.ok) {
      setErrors({
        form: res.errorCode === "weak_password" ? "auth.error.password_weak" : "auth.error.generic",
      });
      return;
    }
    setDone(true);
    toast.success(t("auth.update.success"));
  };

  if (hasSession === false) {
    return (
      <AuthShell title={t("auth.update.title")} subtitle={t("auth.update.no_session")}>
        <AuthSecondaryButton onClick={() => navigate({ to: "/auth/forgot-password" })}>
          {t("auth.update.request_new_link")}
        </AuthSecondaryButton>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title={t("auth.update.success_title")} subtitle={t("auth.update.success_body")}>
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
          <AuthSecondaryButton onClick={() => navigate({ to: "/" })}>
            {t("auth.update.continue")}
          </AuthSecondaryButton>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("auth.update.title")} subtitle={t("auth.update.subtitle")}>
      <form onSubmit={onSubmit} noValidate className="grid gap-3">
        <div>
          <AuthFieldLabel htmlFor={pwId}>{t("auth.update.new_password")}</AuthFieldLabel>
          <div className="relative">
            <input
              id={pwId}
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.pw}
              aria-describedby={`${pwId}-err`}
              className={cn(authFieldClass, "pe-11")}
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              aria-label={showPw ? t("auth.hide_password") : t("auth.show_password")}
              className={cn(
                "absolute inset-y-0 end-1 grid place-items-center px-2",
                "min-w-[var(--ui-tap-min)]",
                ui.radius.control,
                ui.tone.muted,
                ui.focus,
                "hover:bg-[color:var(--ui-surface-sunken)]",
              )}
            >
              {showPw ? (
                <EyeOff className="h-4 w-4" aria-hidden />
              ) : (
                <Eye className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
          {password && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex flex-1 gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1 flex-1",
                      ui.radius.full,
                      i < strength ? strengthColor(strength) : "bg-[color:var(--ui-rule)]",
                    )}
                  />
                ))}
              </div>
            </div>
          )}
          <AuthFieldError id={`${pwId}-err`}>{errors.pw && t(errors.pw)}</AuthFieldError>
        </div>

        <div>
          <AuthFieldLabel htmlFor={cpwId}>{t("auth.update.confirm_password")}</AuthFieldLabel>
          <input
            id={cpwId}
            type={showPw ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={!!errors.cpw}
            aria-describedby={`${cpwId}-err`}
            className={authFieldClass}
          />
          <AuthFieldError id={`${cpwId}-err`}>{errors.cpw && t(errors.cpw)}</AuthFieldError>
        </div>

        {errors.form && <AuthFormError>{t(errors.form)}</AuthFormError>}

        <AuthPrimaryButton type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {submitting ? t("auth.submitting") : t("auth.update.cta")}
        </AuthPrimaryButton>
      </form>
    </AuthShell>
  );
}
