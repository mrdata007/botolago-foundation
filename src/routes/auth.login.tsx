import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useId } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AuthShell,
  AuthPrimaryButton,
  AuthSecondaryButton,
  AuthDivider,
  AuthFormError,
  authLinkClass,
  GoogleGlyph,
  AppleGlyph,
} from "@/components/auth/AuthShell";
import { ConsentLine } from "@/components/legal/ConsentLine";
import { OAUTH_PROVIDERS_ENABLED } from "@/lib/feature-flags";
import { noticeConsentSegments } from "@/components/legal/consent-segments";
import { ui, UiInput } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/provider";
import { authService, IS_MOCK_AUTH, type AuthErrorCode } from "@/services/auth";
import { validateEmail, validatePassword } from "@/lib/validation";
import { markWelcomeDone } from "@/lib/welcome";
import type { TranslationKey } from "@/i18n/dictionaries";
import { supabase } from "@/integrations/supabase/client";
import { getAssuranceLevels, requiresLoginChallenge } from "@/backend/auth/mfa";

function sanitizeNext(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  if (!raw.startsWith("/") || raw.startsWith("//")) return undefined;
  return raw;
}

export const Route = createFileRoute("/auth/login")({
  head: () => ({ meta: [{ title: "Se connecter — BotolaGO" }] }),
  validateSearch: (s: Record<string, unknown>) => {
    const next = sanitizeNext(s.next);
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
        <span>
          {t("auth.login.no_account")}{" "}
          <Link to="/auth/register" search={{ next: next ?? "/" }} className={authLinkClass.onMesh}>
            {t("auth.login.create_link")}
          </Link>
        </span>
      }
    >
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
        />

        <div>
          {/* The one field in this family that does NOT let `UiInput` render
              its own label. The "forgot password" link has to sit on the label
              row, and a link inside a `<label>` is folded into the input's
              accessible name — the field would announce as "Mot de passe Mot
              de passe oublié ?". So the label is placed here, drawn with the
              exact classes `UiInput` gives its own (`ui.text.meta` at the
              heavy weight), and the field is left unlabelled-by-prop and wired
              with `htmlFor`. Same treatment, different owner — not the 12px
              uppercase label this form used to carry. */}
          <div className="mb-1 flex items-center justify-between">
            <label
              htmlFor={passwordId}
              className={cn(ui.text.meta, "[font-weight:var(--ui-weight-heavy)]")}
            >
              {t("auth.password")}
            </label>
            <Link
              to="/auth/forgot-password"
              className={cn(
                "inline-flex items-center -me-2 px-2",
                ui.space.tap,
                ui.text.meta,
                "[font-weight:var(--ui-weight-heavy)]",
                ui.tone.default,
                "underline underline-offset-4",
              )}
            >
              {t("auth.login.forgot")}
            </Link>
          </div>
          <UiInput
            id={passwordId}
            type={showPw ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password ? t(errors.password) : undefined}
            reserveError
            trailing={
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? t("auth.hide_password") : t("auth.show_password")}
                className={cn(
                  "grid place-items-center px-2",
                  ui.space.tap,
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
            }
          />
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
            `OAUTH_PROVIDERS_ENABLED`. */}
        {OAUTH_PROVIDERS_ENABLED && (
          <>
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
          </>
        )}

        {/* `linkClassName` is passed rather than defaulted: `ConsentLine`'s
            own default paints the links in `--brand-primary` (= `--ui-ink`),
            a fill colour used as a foreground — BG-0083, and 1.25:1 on dark.
            `authLinkClass.consent` is the theme-correct brand foreground.
            `leading-relaxed` went the same way: a Tailwind literal on a line
            that wraps in both languages, where the leading token is
            redeclared for Arabic (BG-0124) and a bare 1.625 is not. */}
        <p
          className={cn(
            "mt-2 text-center",
            ui.text.micro,
            "leading-[var(--ui-leading-copy)]",
            ui.tone.muted,
          )}
        >
          <ConsentLine segments={noticeConsentSegments(t)} linkClassName={authLinkClass.consent} />
        </p>
      </form>
    </AuthShell>
  );
}
