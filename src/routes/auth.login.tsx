import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useId } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AuthShell,
  AuthPrimaryButton,
  AuthSecondaryButton,
  AuthDivider,
  AuthFieldError,
  AuthFieldLabel,
  AuthLink,
} from "@/components/auth/AuthShell";
import { useI18n } from "@/i18n/provider";
import { authService, IS_MOCK_AUTH, type AuthErrorCode } from "@/services/auth";
import { validateEmail, validatePassword } from "@/lib/validation";
import { markWelcomeDone } from "@/lib/welcome";
import type { TranslationKey } from "@/i18n/dictionaries";
import { safeAuthRedirect } from "@/lib/safe-auth-redirect";

export const Route = createFileRoute("/auth/login")({
  head: () => ({ meta: [{ title: "Se connecter — BotolaGO" }] }),
  validateSearch: (s: Record<string, unknown>) => {
    const next = safeAuthRedirect(s.next);
    return next ? { next } : {};
  },
  component: LoginPage,
});

function LoginPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const emailId = useId();
  const passwordId = useId();

  const goAfterLogin = (profileComplete: boolean | undefined) => {
    if (next && profileComplete) {
      window.location.href = next;
      return;
    }
    navigate({ to: profileComplete ? "/" : "/auth/profile-setup" });
  };

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<{
    email?: TranslationKey;
    password?: TranslationKey;
    form?: TranslationKey;
  }>({});
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const emailErr = validateEmail(email);
    const pwErr = validatePassword(password);
    setErrors({ email: emailErr ?? undefined, password: pwErr ?? undefined });
    if (emailErr || pwErr) return;
    setSubmitting(true);
    const res = await authService.signInWithEmail(email, password);
    setSubmitting(false);
    if (!res.ok) {
      setErrors({ form: "auth.error.credentials" });
      return;
    }
    markWelcomeDone();
    toast.success(t("auth.success.login"));
    goAfterLogin(res.data?.profileComplete);
  };

  const onSocial = async (provider: "google" | "apple") => {
    setSubmitting(true);
    const res =
      provider === "google"
        ? await authService.signInWithGoogle()
        : await authService.signInWithApple();
    setSubmitting(false);
    if (!res.ok) {
      setErrors({ form: "auth.error.generic" });
      return;
    }
    markWelcomeDone();
    toast.success(t("auth.success.login"));
    goAfterLogin(res.data?.profileComplete);
  };

  return (
    <AuthShell
      title={t("auth.login.title")}
      subtitle={t("auth.login.subtitle")}
      footer={
        <span>
          {t("auth.login.no_account")}{" "}
          <AuthLink to="/auth/register">{t("auth.login.create_link")}</AuthLink>
        </span>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-3">
        <div>
          <AuthFieldLabel htmlFor={emailId}>{t("auth.email")}</AuthFieldLabel>
          <input
            id={emailId}
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder={t("auth.email_placeholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email}
            aria-describedby={`${emailId}-err`}
            className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none ring-0 focus:border-[color:var(--brand-primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)]/40"
          />
          <AuthFieldError id={`${emailId}-err`}>{errors.email && t(errors.email)}</AuthFieldError>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <AuthFieldLabel htmlFor={passwordId}>{t("auth.password")}</AuthFieldLabel>
            <Link
              to="/auth/forgot-password"
              className="text-xs font-semibold text-[color:var(--brand-primary)] hover:underline"
            >
              {t("auth.login.forgot")}
            </Link>
          </div>
          <div className="relative">
            <input
              id={passwordId}
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password}
              aria-describedby={`${passwordId}-err`}
              className="w-full rounded-xl border border-input bg-background px-3 py-3 pe-11 text-sm outline-none focus:border-[color:var(--brand-primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)]/40"
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              aria-label={showPw ? t("auth.hide_password") : t("auth.show_password")}
              className="absolute inset-y-0 end-2 my-1 grid place-items-center rounded-lg px-2 text-muted-foreground hover:bg-muted"
            >
              {showPw ? (
                <EyeOff className="h-4 w-4" aria-hidden />
              ) : (
                <Eye className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
          <AuthFieldError id={`${passwordId}-err`}>
            {errors.password && t(errors.password)}
          </AuthFieldError>
        </div>

        {errors.form && (
          <p
            role="alert"
            aria-live="assertive"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
          >
            {t(errors.form)}
          </p>
        )}

        {IS_MOCK_AUTH && <p className="text-[11px] text-muted-foreground">{t("auth.demo_hint")}</p>}

        <AuthPrimaryButton type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {submitting ? t("auth.submitting") : t("auth.login.cta")}
        </AuthPrimaryButton>

        <AuthDivider label={t("auth.or_continue_with")} />

        <div className="grid gap-2">
          <AuthSecondaryButton
            type="button"
            onClick={() => onSocial("google")}
            disabled={submitting}
          >
            <GoogleGlyph /> {t("auth.google")}
          </AuthSecondaryButton>
          <AuthSecondaryButton
            type="button"
            onClick={() => onSocial("apple")}
            disabled={submitting}
          >
            <AppleGlyph /> {t("auth.apple")}
          </AuthSecondaryButton>
        </div>

        <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
          {t("auth.terms_notice")}
        </p>
      </form>
    </AuthShell>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.4-1.7 4-5.5 4-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12S6.8 21.5 12 21.5c6.9 0 9.5-4.8 9.5-7.3 0-.5 0-.9-.1-1.4H12z"
      />
    </svg>
  );
}
function AppleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="currentColor"
        d="M16.4 12.7c0-2.4 2-3.5 2.1-3.6-1.1-1.7-2.9-1.9-3.6-2-1.5-.2-2.9.9-3.7.9-.8 0-2-.9-3.2-.8-1.7 0-3.2 1-4 2.5-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3.1 2.5 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.6-1-2.6-4.1zM14 5.5c.7-.8 1.1-1.9 1-3-.9 0-2.1.6-2.7 1.4-.6.7-1.2 1.9-1 3 1 0 2-.6 2.7-1.4z"
      />
    </svg>
  );
}
