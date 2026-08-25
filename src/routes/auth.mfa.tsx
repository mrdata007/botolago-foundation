import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import {
  AuthFieldError,
  AuthPrimaryButton,
  AuthSecondaryButton,
  AuthShell,
} from "@/components/auth/AuthShell";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n/provider";
import {
  safeMfaReturnPath,
  selectVerifiedTotpFactor,
  type MfaFactorCandidate,
} from "@/lib/mfa-flow";

export const Route = createFileRoute("/auth/mfa")({
  head: () => ({ meta: [{ title: "Authentification multifacteur — BotolaGO" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    next: safeMfaReturnPath(search.next),
  }),
  component: MfaPage,
});

type Enrollment = {
  readonly factorId: string;
  readonly qrCode: string;
  readonly secret: string;
};

function MfaPage() {
  const { lang } = useI18n();
  const rtl = lang === "ar";
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [setupError, setSetupError] = useState(false);
  const [verificationError, setVerificationError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (cancelled) return;
      if (userError || !userData.user) {
        navigate({ to: "/auth/login", search: { next }, replace: true });
        return;
      }

      const { data: factorData, error: factorError } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      if (factorError) {
        setSetupError(true);
        setLoading(false);
        return;
      }

      const all = (factorData?.all ?? []) as readonly MfaFactorCandidate[];
      const verified = selectVerifiedTotpFactor(all);
      if (verified) {
        setFactorId(verified.id);
        setLoading(false);
        return;
      }

      // An abandoned enrollment must not consume the project's factor limit or
      // make the next enrollment attempt fail. It is not an authentication factor
      // until verified, so it is safe to remove before creating a replacement.
      const pending = all.filter(
        (factor) =>
          typeof factor.id === "string" &&
          factor.factor_type === "totp" &&
          factor.status === "unverified",
      );
      for (const factor of pending) {
        if (typeof factor.id !== "string") continue;
        const { error: removeError } = await supabase.auth.mfa.unenroll({
          factorId: factor.id,
        });
        if (cancelled) return;
        if (removeError) {
          setSetupError(true);
          setLoading(false);
          return;
        }
      }

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "BotolaGO Admin",
      });
      if (cancelled) return;
      if (
        enrollError ||
        !data ||
        data.type !== "totp" ||
        !data.id ||
        !data.totp.qr_code ||
        !data.totp.secret
      ) {
        setSetupError(true);
        setLoading(false);
        return;
      }
      setFactorId(data.id);
      setEnrollment({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, next]);

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || code.length !== 6 || !factorId) return;
    setSubmitting(true);
    setVerificationError(false);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    });
    setSubmitting(false);
    if (verifyError) {
      setVerificationError(true);
      setCode("");
      return;
    }
    navigate({ to: next, replace: true });
  };

  const title = rtl ? "المصادقة متعددة العوامل" : "Authentification multifacteur";
  const subtitle = enrollment
    ? rtl
      ? "اربط تطبيق المصادقة، ثم أدخل الرمز المكوّن من 6 أرقام."
      : "Ajoutez BotolaGO à votre application d’authentification, puis saisissez le code à 6 chiffres."
    : rtl
      ? "أدخل الرمز الظاهر في تطبيق المصادقة."
      : "Saisissez le code affiché dans votre application d’authentification.";

  return (
    <AuthShell title={title} subtitle={subtitle} showBack={false}>
      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        </div>
      ) : setupError ? (
        <div className="grid gap-4">
          <AuthFieldError id="mfa-setup-error">
            {rtl
              ? "تعذّر إعداد المصادقة متعددة العوامل. تحقق من إعدادات الحساب وحاول مرة أخرى."
              : "La configuration MFA est indisponible. Vérifiez les paramètres du compte et réessayez."}
          </AuthFieldError>
          <AuthSecondaryButton type="button" onClick={() => window.location.reload()}>
            {rtl ? "إعادة المحاولة" : "Réessayer"}
          </AuthSecondaryButton>
          <AuthSecondaryButton type="button" onClick={() => navigate({ to: "/" })}>
            {rtl ? "إلغاء" : "Annuler"}
          </AuthSecondaryButton>
        </div>
      ) : (
        <form onSubmit={verify} className="grid gap-4" dir={rtl ? "rtl" : "ltr"}>
          <div className="flex justify-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-600">
              <ShieldCheck className="h-7 w-7" aria-hidden />
            </div>
          </div>

          {enrollment ? (
            <div className="grid justify-items-center gap-3 rounded-xl border border-border bg-muted/30 p-4">
              <img
                src={enrollment.qrCode}
                alt={rtl ? "رمز QR لإعداد المصادقة" : "QR code de configuration MFA"}
                className="h-44 w-44 rounded-lg bg-white p-2"
              />
              <div className="w-full">
                <p className="text-center text-xs text-muted-foreground">
                  {rtl ? "أو أدخل المفتاح يدوياً" : "Ou saisissez la clé manuellement"}
                </p>
                <code className="mt-1 block break-all rounded-lg bg-background px-3 py-2 text-center text-xs">
                  {enrollment.secret}
                </code>
              </div>
            </div>
          ) : null}

          <div className="grid justify-items-center gap-2">
            <label className="text-sm font-semibold">
              {rtl ? "رمز التحقق" : "Code de vérification"}
            </label>
            <InputOTP
              maxLength={6}
              value={code}
              onChange={(value) => {
                setCode(value);
                setVerificationError(false);
              }}
              inputMode="numeric"
              pattern="[0-9]*"
            >
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <InputOTPSlot key={index} index={index} />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>

          {verificationError ? (
            <AuthFieldError id="mfa-error">
              {rtl
                ? "تعذّر التحقق. راجع الرمز وحاول مرة أخرى."
                : "La vérification a échoué. Vérifiez le code et réessayez."}
            </AuthFieldError>
          ) : null}

          <AuthPrimaryButton type="submit" disabled={submitting || code.length !== 6 || !factorId}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {rtl ? "تحقق ومتابعة" : "Vérifier et continuer"}
          </AuthPrimaryButton>
          <AuthSecondaryButton type="button" onClick={() => navigate({ to: "/" })}>
            {rtl ? "إلغاء" : "Annuler"}
          </AuthSecondaryButton>
        </form>
      )}
    </AuthShell>
  );
}
