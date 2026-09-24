// Password recovery completion. Reached from the callback handler after
// verifying a `type=recovery` link. Requires an authenticated Supabase
// session (from the recovery token exchange).

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";
import { Loader2, CheckCircle2, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  AuthShell,
  AuthPrimaryButton,
  AuthFormError,
  AuthPasswordToggle,
  AuthSecondaryButton,
} from "@/components/auth/AuthShell";
import { authFieldClass, authFieldIconClass } from "@/components/auth/auth-classes";
import { ui, UiInput } from "@/components/ui-kit";
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
      <AuthShell compact title={t("auth.update.title")} subtitle={t("auth.update.no_session")}>
        <AuthSecondaryButton onClick={() => navigate({ to: "/auth/forgot-password" })}>
          {t("auth.update.request_new_link")}
        </AuthSecondaryButton>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell
        compact
        title={t("auth.update.success_title")}
        subtitle={t("auth.update.success_body")}
      >
        <div className="flex flex-col items-center gap-5 py-2 text-center">
          {/* A round positive disc, like every glyph plate in Option A. */}
          <div
            className={cn(
              "grid h-14 w-14 place-items-center",
              ui.radius.full,
              "bg-[color:color-mix(in_oklab,var(--ui-positive)_18%,transparent)]",
              ui.tone.positive,
            )}
          >
            <CheckCircle2 className="h-7 w-7" aria-hidden />
          </div>
          <AuthSecondaryButton onClick={() => navigate({ to: "/" })}>
            {t("auth.update.continue")}
          </AuthSecondaryButton>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell compact title={t("auth.update.title")} subtitle={t("auth.update.subtitle")}>
      <form onSubmit={onSubmit} noValidate className="grid gap-3">
        <div>
          <UiInput
            id={pwId}
            label={t("auth.update.new_password")}
            type={showPw ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.pw ? t(errors.pw) : undefined}
            reserveError
            fieldClassName={authFieldClass(!!errors.pw)}
            leading={<Lock className={authFieldIconClass} aria-hidden />}
            trailing={<AuthPasswordToggle shown={showPw} onToggle={() => setShowPw((s) => !s)} />}
          />
          {/* The meter follows the field frame rather than sitting inside it:
              the frame owns label / box / error, and the error line is the
              one thing that must stay put under the box. Unlike register's,
              this meter has no label and is not described-by, so it stays
              decorative — matching what it did before. */}
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
        </div>

        <UiInput
          id={cpwId}
          label={t("auth.update.confirm_password")}
          type={showPw ? "text" : "password"}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.cpw ? t(errors.cpw) : undefined}
          reserveError
          fieldClassName={authFieldClass(!!errors.cpw)}
          leading={<Lock className={authFieldIconClass} aria-hidden />}
        />

        {errors.form && <AuthFormError>{t(errors.form)}</AuthFormError>}

        <AuthPrimaryButton type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {submitting ? t("auth.submitting") : t("auth.update.cta")}
        </AuthPrimaryButton>
      </form>
    </AuthShell>
  );
}
