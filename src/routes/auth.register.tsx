import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import {
  AuthShell,
  AuthPrimaryButton,
  AuthSecondaryButton,
  AuthDivider,
  AuthFieldError,
  AuthFieldLabel,
} from "@/components/auth/AuthShell";
import { useI18n } from "@/i18n/provider";
import { authService } from "@/services/auth";
import {
  validateEmail,
  validateName,
  validatePassword,
  validateUsername,
  passwordStrength,
  normalizeUsername,
} from "@/lib/validation";
import type { TranslationKey } from "@/i18n/dictionaries";
import { HAS_SOCIAL_AUTH_PROVIDER, SOCIAL_AUTH_PROVIDERS } from "@/config/auth-providers";
import { markWelcomeDone } from "@/lib/welcome";
import { sanitizeAuthCallbackNext } from "@/lib/auth-callback";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/register")({
  head: () => ({ meta: [{ title: "Créer un compte — BotolaGO" }] }),
  validateSearch: (search: Record<string, unknown>) => {
    const next =
      typeof search.next === "string" ? sanitizeAuthCallbackNext(search.next) : undefined;
    return next && next !== "/" ? { next } : {};
  },
  component: RegisterPage,
});

type Errors = {
  fullName?: TranslationKey;
  username?: TranslationKey;
  email?: TranslationKey;
  password?: TranslationKey;
  confirmPassword?: TranslationKey;
  terms?: TranslationKey;
  form?: TranslationKey;
};

function RegisterPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { next = "/" } = Route.useSearch();
  const ids = {
    name: useId(),
    username: useId(),
    email: useId(),
    pw: useId(),
    cpw: useId(),
  };

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [terms, setTerms] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const strength = passwordStrength(password);
  const strengthLabelKey: TranslationKey =
    strength <= 1
      ? "auth.register.strength_weak"
      : strength === 2
        ? "auth.register.strength_medium"
        : "auth.register.strength_strong";

  const validate = (): Errors => {
    const e: Errors = {};
    e.fullName = validateName(fullName) ?? undefined;
    e.username = validateUsername(username) ?? undefined;
    e.email = validateEmail(email) ?? undefined;
    e.password = validatePassword(password) ?? undefined;
    if (!e.password && confirm !== password) e.confirmPassword = "auth.error.password_mismatch";
    if (!terms) e.terms = "auth.error.terms_required";
    return e;
  };

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (submitting) return;
    const eMap = validate();
    setErrors(eMap);
    if (Object.values(eMap).some(Boolean)) return;

    setSubmitting(true);
    const res = await authService.registerWithEmail({
      fullName,
      username: normalizeUsername(username),
      email,
      password,
      language: lang,
      next,
    });
    setSubmitting(false);

    if (!res.ok) {
      if (res.errorCode === "email_taken") setErrors({ email: "auth.error.email_taken" });
      else if (res.errorCode === "username_taken")
        setErrors({ username: "auth.error.username_taken" });
      else if (res.errorCode === "invalid_username" || res.errorCode === "reserved_username")
        setErrors({ username: "auth.error.username_invalid" });
      else setErrors({ form: "auth.error.generic" });
      return;
    }
    toast.success(t("auth.success.register"));
    navigate({ to: "/auth/verify", search: { email: res.data!.email, next } });
  };

  const onSocial = async (provider: "google" | "apple") => {
    if (!SOCIAL_AUTH_PROVIDERS[provider]) return;
    if (!terms) {
      setErrors({ terms: "auth.error.terms_required" });
      return;
    }
    setSubmitting(true);
    const res =
      provider === "google"
        ? await authService.signInWithGoogle(next)
        : await authService.signInWithApple(next);
    setSubmitting(false);
    if (!res.ok) {
      setErrors({
        form:
          res.errorCode === "provider_unavailable"
            ? "auth.error.provider_unavailable"
            : "auth.error.generic",
      });
      return;
    }
    markWelcomeDone();
    if (res.data?.profileComplete) {
      navigate({ to: next });
      return;
    }
    navigate({ to: "/auth/profile-setup", search: { next } });
  };

  return (
    <AuthShell
      title={t("auth.register.title")}
      subtitle={t("auth.register.subtitle")}
      footer={
        <span>
          {t("auth.register.have_account")}{" "}
          <Link
            to="/auth/login"
            search={{ next }}
            className="font-bold text-white underline-offset-4 hover:underline"
          >
            {t("auth.register.login_link")}
          </Link>
        </span>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-3">
        <div>
          <AuthFieldLabel htmlFor={ids.name}>{t("auth.register.full_name")}</AuthFieldLabel>
          <input
            id={ids.name}
            type="text"
            autoComplete="name"
            placeholder={t("auth.register.full_name_placeholder")}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            aria-invalid={!!errors.fullName}
            aria-describedby={`${ids.name}-err`}
            className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm focus:border-[color:var(--brand-primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)]/40 outline-none"
          />
          <AuthFieldError id={`${ids.name}-err`}>
            {errors.fullName && t(errors.fullName)}
          </AuthFieldError>
        </div>

        <div>
          <AuthFieldLabel htmlFor={ids.username}>{t("auth.register.username")}</AuthFieldLabel>
          <input
            id={ids.username}
            type="text"
            autoComplete="username"
            placeholder={t("auth.register.username_placeholder")}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            aria-invalid={!!errors.username}
            aria-describedby={`${ids.username}-err`}
            className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm focus:border-[color:var(--brand-primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)]/40 outline-none"
          />
          <AuthFieldError id={`${ids.username}-err`}>
            {errors.username && t(errors.username)}
          </AuthFieldError>
        </div>

        <div>
          <AuthFieldLabel htmlFor={ids.email}>{t("auth.email")}</AuthFieldLabel>
          <input
            id={ids.email}
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder={t("auth.email_placeholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email}
            aria-describedby={`${ids.email}-err`}
            className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm focus:border-[color:var(--brand-primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)]/40 outline-none"
          />
          <AuthFieldError id={`${ids.email}-err`}>{errors.email && t(errors.email)}</AuthFieldError>
        </div>

        <div>
          <AuthFieldLabel htmlFor={ids.pw}>{t("auth.password")}</AuthFieldLabel>
          <div className="relative">
            <input
              id={ids.pw}
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password}
              aria-describedby={`${ids.pw}-err ${ids.pw}-strength`}
              className="w-full rounded-xl border border-input bg-background px-3 py-3 pe-11 text-sm focus:border-[color:var(--brand-primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)]/40 outline-none"
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
          {password && (
            <div id={`${ids.pw}-strength`} className="mt-1.5 flex items-center gap-2">
              <div className="flex flex-1 gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={`h-1 flex-1 rounded-full ${i < strength ? (strength <= 1 ? "bg-red-500" : strength === 2 ? "bg-amber-500" : "bg-emerald-500") : "bg-muted"}`}
                  />
                ))}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t(strengthLabelKey)}
              </span>
            </div>
          )}
          <AuthFieldError id={`${ids.pw}-err`}>
            {errors.password && t(errors.password)}
          </AuthFieldError>
        </div>

        <div>
          <AuthFieldLabel htmlFor={ids.cpw}>{t("auth.register.confirm_password")}</AuthFieldLabel>
          <input
            id={ids.cpw}
            type={showPw ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={`${ids.cpw}-err`}
            className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm focus:border-[color:var(--brand-primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)]/40 outline-none"
          />
          <AuthFieldError id={`${ids.cpw}-err`}>
            {errors.confirmPassword && t(errors.confirmPassword)}
          </AuthFieldError>
        </div>

        <label className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <input
            type="checkbox"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-input"
            aria-invalid={!!errors.terms}
          />
          <span>{t("auth.register.accept_terms")}</span>
        </label>
        {errors.terms && (
          <p role="alert" className="text-xs font-semibold text-destructive">
            {t(errors.terms)}
          </p>
        )}

        {errors.form && (
          <p
            role="alert"
            aria-live="assertive"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
          >
            {t(errors.form)}
          </p>
        )}

        <AuthPrimaryButton type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {submitting ? t("auth.submitting") : t("auth.register.cta")}
        </AuthPrimaryButton>

        {HAS_SOCIAL_AUTH_PROVIDER ? (
          <>
            <AuthDivider label={t("auth.or_continue_with")} />

            <div className="grid gap-2">
              {SOCIAL_AUTH_PROVIDERS.google ? (
                <AuthSecondaryButton
                  type="button"
                  onClick={() => onSocial("google")}
                  disabled={submitting}
                >
                  <span>Google</span>
                </AuthSecondaryButton>
              ) : null}
              {SOCIAL_AUTH_PROVIDERS.apple ? (
                <AuthSecondaryButton
                  type="button"
                  onClick={() => onSocial("apple")}
                  disabled={submitting}
                >
                  <span>Apple</span>
                </AuthSecondaryButton>
              ) : null}
            </div>
          </>
        ) : null}

        <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
          {t("auth.terms_notice")}
        </p>
      </form>
    </AuthShell>
  );
}
