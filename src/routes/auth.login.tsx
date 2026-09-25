import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useId } from "react";
import { Loader2, Lock, Mail } from "lucide-react";
import { toast } from "sonner";
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
import { OAUTH_PROVIDERS_ENABLED } from "@/lib/feature-flags";
import { noticeConsentSegments } from "@/components/legal/consent-segments";
import { ui, UiAlert, UiButton, UiInput } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/provider";
import { authService, IS_MOCK_AUTH, type AuthErrorCode } from "@/services/auth";
import { takeSuspensionNotice, type SuspensionNotice } from "@/services/account-standing";
import { validateEmail, validatePassword } from "@/lib/validation";
import { markWelcomeDone } from "@/lib/welcome";
import type { TranslationKey } from "@/i18n/dictionaries";
import { supabase } from "@/integrations/supabase/client";
import { getAssuranceLevels, requiresLoginChallenge } from "@/backend/auth/mfa";
import { authNextSearch, sanitizeAuthCallbackNext } from "@/lib/auth-callback";

export const Route = createFileRoute("/auth/login")({
  head: () => ({ meta: [{ title: "Se connecter — BotolaGO" }] }),
  // The shared sanitiser, as on every other auth route. This route had its
  // own prefix-only check, which `/\evil.example` and `/<TAB>/evil.example`
  // passed: browsers resolve both off-site (audit 2026-09-24, P1-1).
  validateSearch: (s: Record<string, unknown>) => authNextSearch(s.next),
  component: LoginPage,
});

/**
 * Shown once, right after the app has signed out a banned account: what
 * happened, until when, and where to write. Read in an effect, never during
 * render -- the server has no sessionStorage, and the notice is taken (read
 * and forgotten) so a refresh does not show it again.
 */
function SuspendedAccountNotice() {
  const { t, lang } = useI18n();
  const [notice, setNotice] = useState<SuspensionNotice | null>(null);
  useEffect(() => {
    const taken = takeSuspensionNotice();
    if (taken) setNotice(taken);
  }, []);
  if (!notice) return null;
  const message = notice.until
    ? t("auth.login.suspended_until").replace(
        "{date}",
        new Date(notice.until).toLocaleString(lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR", {
          dateStyle: "long",
          timeStyle: "short",
        }),
      )
    : t("auth.login.suspended_indefinite");
  const [before, after = ""] = t("auth.login.suspended_contact").split("{email}");
  return (
    <div className="mb-4">
      <UiAlert
        tone="negative"
        title={t("auth.login.suspended_title")}
        testId="auth-login-suspended"
      >
        <p>{message}</p>
        <p className="mt-1">
          {before}
          <bdi dir="ltr">support@botolago.com</bdi>
          {after}
        </p>
      </UiAlert>
    </div>
  );
}

function LoginPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const emailId = useId();
  const passwordId = useId();

  const goAfterLogin = (profileComplete: boolean | undefined) => {
    if (next && profileComplete) {
      // Sanitised again where it is used: a full navigation is the step that
      // would leave the site.
      window.location.href = sanitizeAuthCallbackNext(next);
      return;
    }
    if (profileComplete) {
      navigate({ to: "/" });
      return;
    }
    navigate({ to: "/auth/profile-setup", search: { next: next ?? "/" } });
  };

  // A password (or OAuth) sign-in only ever reaches AAL1. If this account
  // already has a verified TOTP factor enrolled, Supabase's own
  // getAuthenticatorAssuranceLevel() reports nextLevel: "aal2" -- route
  // through the login MFA challenge instead of straight into the app. If the
  // AAL check itself fails (e.g. offline), fail open rather than block sign-in.
  const continueAfterAuth = async (profileComplete: boolean | undefined) => {
    try {
      // The demo/mock backend has no Supabase project behind it, so skip the
      // round-trip entirely rather than relying on the catch below.
      if (IS_MOCK_AUTH) throw new Error("mock_auth_no_mfa");
      const levels = await getAssuranceLevels(supabase.auth.mfa);
      if (requiresLoginChallenge(levels)) {
        navigate({ to: "/auth/mfa-challenge", search: { next: next ?? "/" } });
        return;
      }
    } catch {
      // Fall through to normal post-login routing.
    }
    markWelcomeDone();
    toast.success(t("auth.success.login"));
    goAfterLogin(profileComplete);
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
      setErrors({
        form:
          res.errorCode === "rate_limited"
            ? "auth.error.rate_limited"
            : res.errorCode === "network"
              ? "auth.error.network"
              : res.errorCode === "email_unconfirmed"
                ? "auth.error.email_unconfirmed"
                : "auth.error.credentials",
      });
      return;
    }
    await continueAfterAuth(res.data?.profileComplete);
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
    await continueAfterAuth(res.data?.profileComplete);
  };

  return (
    <AuthShell
      title={t("auth.login.title")}
      subtitle={t("auth.login.subtitle")}
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
            <span>{t("auth.login.no_account")}</span>
            <Link
              to="/auth/register"
              search={{ next: next ?? "/" }}
              className={authLinkClass.onSurface}
            >
              {t("auth.login.create_link")}
            </Link>
          </p>
          {/* `linkClassName` is passed rather than defaulted: the brand
              foreground (`--ui-ink-fg`), heavy and underlined, as the board
              sets the two document names. The leading is the token, which is
              redeclared for Arabic (BG-0124); a bare `leading-relaxed` is not. */}
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
      <SuspendedAccountNotice />
      <form onSubmit={onSubmit} noValidate className="grid gap-3">
        <UiInput
          id={emailId}
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

        {/* The field renders its own label again. "Mot de passe oublié ?"
            used to share the label row, which is why this one field wired its
            label by hand; the board puts the link UNDER the field, at the
            inline end, so the frame can own label, box and error like every
            other field here. The link sits after the reserved error line: the
            error is the one thing that must not move. */}
        <div>
          <UiInput
            id={passwordId}
            label={t("auth.password")}
            type={showPw ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password ? t(errors.password) : undefined}
            reserveError
            fieldClassName={authFieldClass(!!errors.password)}
            leading={<Lock className={authFieldIconClass} aria-hidden />}
            trailing={<AuthPasswordToggle shown={showPw} onToggle={() => setShowPw((s) => !s)} />}
          />
          <div className="-mt-1 flex justify-end">
            <Link
              to="/auth/forgot-password"
              className={cn(
                "-me-2 inline-flex items-center px-2",
                ui.space.tap,
                ui.radius.full,
                ui.text.meta,
                "[font-weight:var(--ui-weight-heavy)]",
                ui.tone.ink,
                "transition-colors hover:bg-[color:var(--ui-surface-sunken)]",
                ui.focus,
              )}
            >
              {t("auth.login.forgot")}
            </Link>
          </div>
        </div>

        {errors.form && <AuthFormError>{t(errors.form)}</AuthFormError>}

        {IS_MOCK_AUTH && <p className={cn(ui.text.micro, ui.tone.muted)}>{t("auth.demo_hint")}</p>}

        <AuthPrimaryButton type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {submitting ? t("auth.submitting") : t("auth.login.cta")}
        </AuthPrimaryButton>

        {/* BG-0111 — no OAuth provider is enabled on this project, so the
            divider goes with the buttons: an "ou continuer avec" rule with
            nothing under it reads as a broken screen. See
            `OAUTH_PROVIDERS_ENABLED`. Google is the white outline pill, Apple
            its own navy one (`ink`), as the board draws them. */}
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
