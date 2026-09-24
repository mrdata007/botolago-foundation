import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { AtSign, Loader2, Lock, Mail, User } from "lucide-react";
import {
  AuthShell,
  AuthPrimaryButton,
  AuthSecondaryButton,
  AuthDivider,
  AuthFormError,
  AuthPasswordToggle,
  GoogleGlyph,
  AppleGlyph,
} from "@/components/auth/AuthShell";
import { authFieldClass, authFieldIconClass, authLinkClass } from "@/components/auth/auth-classes";
import { ConsentLine } from "@/components/legal/ConsentLine";
import {
  noticeConsentSegments,
  registerConsentSegments,
} from "@/components/legal/consent-segments";
import { ui, UiButton, UiCheckbox, UiInput } from "@/components/ui-kit";
import { OAUTH_PROVIDERS_ENABLED } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";
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
import { markWelcomeDone } from "@/lib/welcome";
import { authNextSearch } from "@/lib/auth-callback";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/register")({
  head: () => ({ meta: [{ title: "Créer un compte — BotolaGO" }] }),
  validateSearch: (search: Record<string, unknown>) => authNextSearch(search.next),
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

/** The password meter, on the status tokens rather than Tailwind palette
 * literals, so it follows the theme like everything else. */
function strengthColor(strength: number): string {
  if (strength <= 1) return "bg-[color:var(--ui-negative)]";
  if (strength === 2) return "bg-[color:var(--ui-caution)]";
  return "bg-[color:var(--ui-positive)]";
}

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
      // A 429 here is usually the confirmation-email send limit, not the user
      // doing anything wrong -- saying so beats a blanket "an error occurred".
      else if (res.errorCode === "rate_limited") setErrors({ form: "auth.error.rate_limited" });
      else if (res.errorCode === "network") setErrors({ form: "auth.error.network" });
      else setErrors({ form: "auth.error.generic" });
      return;
    }
    toast.success(t("auth.success.register"));
    navigate({ to: "/auth/verify", search: { email: res.data!.email, next } });
  };

  const onSocial = async (provider: "google" | "apple") => {
    setSubmitting(true);
    const res =
      provider === "google"
        ? await authService.signInWithGoogle(next)
        : await authService.signInWithApple(next);
    setSubmitting(false);
    if (!res.ok) {
      setErrors({ form: "auth.error.generic" });
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
        <>
          <p
            className={cn(
              "flex flex-wrap items-center justify-center gap-x-1 text-center",
              ui.text.secondary,
              "[font-weight:var(--ui-weight-body)]",
              ui.tone.muted,
            )}
          >
            <span>{t("auth.register.have_account")}</span>
            <Link to="/auth/login" search={{ next }} className={authLinkClass.onSurface}>
              {t("auth.register.login_link")}
            </Link>
          </p>
          {/* The notice covers the provider buttons, which create an account
              without the checkbox above. `linkClassName`: the brand
              foreground, not `ConsentLine`'s default. The leading is the
              token, redeclared for Arabic (BG-0124). It used to end on a
              second "Se connecter" link, a copy of the one just above. */}
          <p
            className={cn(
              "text-center",
              ui.text.micro,
              "leading-[var(--ui-leading-copy)]",
              ui.tone.muted,
            )}
          >
            <ConsentLine
              segments={noticeConsentSegments(t)}
              linkClassName={authLinkClass.consent}
            />
          </p>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-3">
        <UiInput
          id={ids.name}
          label={t("auth.register.full_name")}
          type="text"
          autoComplete="name"
          placeholder={t("auth.register.full_name_placeholder")}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={errors.fullName ? t(errors.fullName) : undefined}
          reserveError
          fieldClassName={authFieldClass(!!errors.fullName)}
          leading={<User className={authFieldIconClass} aria-hidden />}
        />

        <UiInput
          id={ids.username}
          label={t("auth.register.username")}
          type="text"
          autoComplete="username"
          placeholder={t("auth.register.username_placeholder")}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={errors.username ? t(errors.username) : undefined}
          reserveError
          fieldClassName={authFieldClass(!!errors.username)}
          leading={<AtSign className={authFieldIconClass} aria-hidden />}
        />

        <UiInput
          id={ids.email}
          label={t("auth.email")}
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder={t("auth.email_placeholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email ? t(errors.email) : undefined}
          reserveError
          fieldClassName={authFieldClass(!!errors.email)}
          leading={<Mail className={authFieldIconClass} aria-hidden />}
        />

        <div>
          {/* The strength meter's id goes in `aria-describedby` and is KEPT:
              the kit composes what you pass with the field's own error id
              rather than replacing it, so this field still announces both.
              The meter itself sits after the field frame — the frame owns the
              order label / box / error, and the error line is the one that
              must not move. */}
          <UiInput
            id={ids.pw}
            label={t("auth.password")}
            type={showPw ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={`${ids.pw}-strength`}
            error={errors.password ? t(errors.password) : undefined}
            reserveError
            fieldClassName={authFieldClass(!!errors.password)}
            leading={<Lock className={authFieldIconClass} aria-hidden />}
            trailing={<AuthPasswordToggle shown={showPw} onToggle={() => setShowPw((s) => !s)} />}
          />
          {password && (
            <div id={`${ids.pw}-strength`} className="mt-1.5 flex items-center gap-2">
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
              {/* `ui.text.label` letter-spaces Latin only (BG-0069). */}
              <span className={cn(ui.text.label, ui.tone.muted)}>{t(strengthLabelKey)}</span>
            </div>
          )}
        </div>

        <UiInput
          id={ids.cpw}
          label={t("auth.register.confirm_password")}
          type={showPw ? "text" : "password"}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirmPassword ? t(errors.confirmPassword) : undefined}
          reserveError
          fieldClassName={authFieldClass(!!errors.confirmPassword)}
          leading={<Lock className={authFieldIconClass} aria-hidden />}
        />

        {/* The consent box was 16px painted and 16px targeted — a quarter of
            the 44px floor, on the control that gates the whole form.
            `UiCheckbox` keeps the ink at 16px and grows a transparent 44px
            target behind it (`ui.hitArea`), paints the checked plate in
            `--ui-ink` instead of the browser's own accent colour, and keeps
            the wrapping label, which is what lets this row carry links
            without the label stealing their clicks. */}
        <UiCheckbox
          checked={terms}
          onChange={(e) => setTerms(e.target.checked)}
          aria-invalid={!!errors.terms}
          label={
            <ConsentLine
              segments={registerConsentSegments(t)}
              linkClassName={authLinkClass.consent}
            />
          }
        />
        {errors.terms && (
          <p
            role="alert"
            className={cn(ui.text.meta, "[font-weight:var(--ui-weight-heavy)]", ui.tone.negative)}
          >
            {t(errors.terms)}
          </p>
        )}

        {errors.form && <AuthFormError>{t(errors.form)}</AuthFormError>}

        <AuthPrimaryButton type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {submitting ? t("auth.submitting") : t("auth.register.cta")}
        </AuthPrimaryButton>

        {/* BG-0111 — no OAuth provider is enabled on this project, so the
            divider goes with the buttons: an "ou continuer avec" rule with
            nothing under it reads as a broken screen. See
            `OAUTH_PROVIDERS_ENABLED`. Google is the white outline pill, Apple
            its own navy one (`ink`), as on login. */}
        {OAUTH_PROVIDERS_ENABLED && (
          <>
            <AuthDivider label={t("auth.or_continue_with")} />

            <div className="grid gap-2.5">
              <AuthSecondaryButton
                type="button"
                onClick={() => onSocial("google")}
                disabled={submitting}
              >
                <GoogleGlyph /> {t("auth.google")}
              </AuthSecondaryButton>
              <UiButton
                variant="ink"
                type="button"
                onClick={() => onSocial("apple")}
                disabled={submitting}
              >
                <AppleGlyph /> {t("auth.apple")}
              </UiButton>
            </div>
          </>
        )}
      </form>
    </AuthShell>
  );
}
