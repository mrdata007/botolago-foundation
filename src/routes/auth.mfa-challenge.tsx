import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthShell, AuthPrimaryButton, AuthFieldError } from "@/components/auth/AuthShell";
import { authOtpSlotClass } from "@/components/auth/auth-classes";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { UiButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { useAuth } from "@/auth/AuthProvider";
import { AssuranceRetry } from "@/auth/AssuranceRetry";
import { authService, type AuthUser } from "@/services/auth";
import { supabase } from "@/integrations/supabase/client";
import { listVerifiedTotpFactors, verifyTotpFactor } from "@/backend/auth/mfa";
import { MfaError, type MfaErrorCode } from "@/backend/auth/mfa-errors";
import { markWelcomeDone } from "@/lib/welcome";
import { authNextSearch, sanitizeAuthCallbackNext } from "@/lib/auth-callback";
import type { TranslationKey } from "@/i18n/dictionaries";

export const Route = createFileRoute("/auth/mfa-challenge")({
  head: () => ({ meta: [{ title: "Vérification en deux étapes — BotolaGO" }] }),
  validateSearch: (s: Record<string, unknown>) => authNextSearch(s.next),
  component: MfaChallengePage,
});

function errorKey(code: MfaErrorCode): TranslationKey {
  switch (code) {
    case "invalid_code":
      return "auth.mfa_challenge.error_invalid";
    case "challenge_expired":
      return "auth.mfa_challenge.error_expired";
    case "rate_limited":
      return "auth.mfa.error.rate_limited";
    case "network":
      return "auth.mfa.error.network";
    case "factor_not_found":
      return "auth.mfa_challenge.error_no_factor";
    default:
      return "auth.mfa_challenge.error_generic";
  }
}

function MfaChallengePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user, status, signOut } = useAuth();
  const { next = "/" } = Route.useSearch();

  const [factorId, setFactorId] = useState<string | null>(null);
  const [loadingFactor, setLoadingFactor] = useState(true);
  const [code, setCode] = useState("");
  const [error, setError] = useState<TranslationKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  // Bumped to list the factors again after a recheck that still owes a code.
  const [factorsAsked, setFactorsAsked] = useState(0);
  // A code was accepted on this page, so leaving it announces the sign-in.
  const verifiedHere = useRef(false);
  const leaving = useRef(false);

  useEffect(() => {
    if (status === "guest" || status === "anonymous") {
      navigate({ to: "/auth/login", search: next === "/" ? {} : { next } });
    }
  }, [status, navigate, next]);

  // Nothing is owed any more -- the code was accepted here or in another tab,
  // or this account has no second factor -- so carry on to `next`. Only a
  // complete session gets here: the `mfa_*` states never carry a user.
  const leave = useCallback(
    (signedIn: AuthUser | null) => {
      if (leaving.current) return;
      leaving.current = true;
      markWelcomeDone();
      if (verifiedHere.current) toast.success(t("auth.success.login"));
      // A verified recovery callback must finish the password reset even when
      // the account has not completed profile setup yet. The code is already
      // accepted here; update-password still requires the authenticated session.
      if (next === "/auth/update-password" || (next !== "/" && signedIn?.profileComplete)) {
        window.location.href = sanitizeAuthCallbackNext(next);
        return;
      }
      if (signedIn?.profileComplete) {
        navigate({ to: "/" });
        return;
      }
      navigate({ to: "/auth/profile-setup", search: { next } });
    },
    [navigate, next, t],
  );

  useEffect(() => {
    if (status === "authenticated") leave(user);
  }, [status, user, leave]);

  useEffect(() => {
    // Wait for the session to hydrate: listing factors before AuthProvider has
    // a session returns nothing, which would otherwise leave this page stuck
    // with a disabled button and no explanation. Only a session that owes its
    // code has anything to list; the others leave or show the retry panel.
    if (status !== "mfa_required") return;
    let cancelled = false;
    setLoadingFactor(true);
    (async () => {
      try {
        // TOTP only: phone/WebAuthn MFA are off in supabase/config.toml, so a factor is TOTP.
        const factors = await listVerifiedTotpFactors(supabase.auth.mfa);
        if (cancelled) return;
        setFactorId(factors[0]?.id ?? null);
        // After "Vérifier à nouveau" came back still owing a code, say that
        // rather than repeat the first message as if nothing had happened.
        if (factors.length === 0)
          setError(
            factorsAsked > 0
              ? "auth.mfa_challenge.error_still_owed"
              : "auth.mfa_challenge.error_no_factor",
          );
      } catch (err) {
        if (!cancelled) setError(errorKey(err instanceof MfaError ? err.code : "internal"));
      } finally {
        if (!cancelled) setLoadingFactor(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, factorsAsked]);

  // Ask again how far the session has got. Behind the retry panel (the lookup
  // failed) and behind "Vérifier à nouveau" (the session says a code is owed
  // but no factor was listed): either way the reader goes on only if the
  // answer is that nothing is owed. `refresh` fetches a new token first, whose
  // factor list reflects a factor removed on another device.
  // Only the panel's own "Réessayer" counts as a retry that failed; "Vérifier
  // à nouveau" (the one that refreshes) landing on the panel is its first
  // appearance, and a failure there is said under the code field instead.
  const [failedRetries, setFailedRetries] = useState(0);
  const recheck = async (refresh: boolean) => {
    setRechecking(true);
    try {
      const session = await authService.recheckSession({ refresh });
      if (session.status === "authenticated") leave(session.user);
      else if (session.status === "mfa_required") {
        setError(null);
        setFactorsAsked((asked) => asked + 1);
      } else if (session.status === "mfa_unconfirmed" && !refresh) setFailedRetries((n) => n + 1);
    } catch {
      // Unchanged: the panel and the way out stay, and say the retry failed.
      if (refresh) setError("auth.mfa_challenge.error_generic");
      else setFailedRetries((n) => n + 1);
    } finally {
      setRechecking(false);
    }
  };

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (submitting || !factorId) return;
    if (code.length !== 6) {
      setError("auth.mfa_challenge.error_invalid");
      return;
    }
    setSubmitting(true);
    setError(null);
    verifiedHere.current = true;
    try {
      await verifyTotpFactor(supabase.auth.mfa, factorId, code);
      // The accepted code upgrades the session to AAL2. Read it back rather
      // than wait for the auth event, then carry on with the complete user.
      const session = await authService.recheckSession();
      if (session.status === "authenticated") leave(session.user);
      else if (session.status === "mfa_required") setError("auth.mfa_challenge.error_generic");
    } catch (err) {
      verifiedHere.current = false;
      setError(errorKey(err instanceof MfaError ? err.code : "internal"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      compact
      title={t("auth.mfa_challenge.title")}
      subtitle={t("auth.mfa_challenge.subtitle")}
      showBack={false}
    >
      {status === "mfa_unconfirmed" ? (
        <AssuranceRetry
          busy={rechecking}
          failedRetries={failedRetries}
          onRetry={() => void recheck(false)}
          onSignOut={() => void signOut()}
        />
      ) : (
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="flex flex-col items-center gap-3">
            <label htmlFor="mfa-challenge-code" className="sr-only">
              {t("auth.mfa_challenge.code_label")}
            </label>
            {/* Same slot treatment as `auth.verify`: left to right on both
              pages (a code is read first digit to last), the sheet's filled
              look, and the 44px floor (the V1 slots were 36px). The V1
              component keeps the keyboard model. */}
            <div dir="ltr">
              <InputOTP
                id="mfa-challenge-code"
                maxLength={6}
                value={code}
                onChange={(v) => {
                  setCode(v);
                  setError(null);
                }}
                disabled={loadingFactor || !factorId}
                inputMode="numeric"
                pattern="[0-9]*"
                aria-describedby="mfa-challenge-err"
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} className={authOtpSlotClass} />
                  <InputOTPSlot index={1} className={authOtpSlotClass} />
                  <InputOTPSlot index={2} className={authOtpSlotClass} />
                  <InputOTPSlot index={3} className={authOtpSlotClass} />
                  <InputOTPSlot index={4} className={authOtpSlotClass} />
                  <InputOTPSlot index={5} className={authOtpSlotClass} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <AuthFieldError id="mfa-challenge-err">{error && t(error)}</AuthFieldError>
          </div>

          <AuthPrimaryButton type="submit" disabled={submitting || loadingFactor || !factorId}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {submitting ? t("auth.submitting") : t("auth.mfa_challenge.cta")}
          </AuthPrimaryButton>

          {/* Without a usable factor the form above is inert, so always leave a
            way out rather than stranding the user on a dead-end screen. It
            no longer walks past the challenge ("Continuer sans vérification"
            did): it asks the server again, and goes on only if no code is
            owed after all (a factor removed on another device). */}
          {!loadingFactor && !factorId && (
            // Was a hand-rolled control with the ghost recipe spelled out —
            // 44px, control radius, meta at the heavy weight, focus ring. That
            // is `UiButton variant="ghost" size="sm"`, which also gives it the
            // brand foreground a control is supposed to read in rather than the
            // muted tone of body copy.
            <UiButton
              variant="ghost"
              size="sm"
              disabled={rechecking}
              onClick={() => void recheck(true)}
            >
              {t("auth.mfa_challenge.recheck")}
            </UiButton>
          )}

          {/* The other way out: the password session is ended, and the reader
            is signed out (and sent to the sign-in page) rather than left
            half signed in. */}
          <UiButton
            variant="ghost"
            size="sm"
            disabled={submitting || rechecking}
            onClick={() => void signOut()}
          >
            {t("profile.sign_out")}
          </UiButton>
        </form>
      )}
    </AuthShell>
  );
}
