import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { AuthPrimaryButton, AuthSecondaryButton } from "@/components/auth/AuthShell";
import { ui, UiAlert } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * Shown when the assurance lookup failed, so nobody can tell whether this
 * account owes a one-time code (`mfa_unconfirmed`). The sign-in is NOT treated
 * as done: the reader can try the lookup again, or sign out and leave. The
 * login page, the e-mail/OAuth callback and the challenge page all use it.
 *
 * The panel takes the place of the form whose button had focus, so focus
 * moves to the panel rather than falling back to the page. A retry that comes
 * back unknown again changes nothing else on screen, so `failedRetries` says
 * so in a polite status line: each failure is announced as a new line.
 */
export function AssuranceRetry({
  busy,
  onRetry,
  onSignOut,
  failedRetries = 0,
}: {
  busy: boolean;
  onRetry: () => void;
  onSignOut: () => void;
  /** Retries that came back unknown again since the panel appeared. */
  failedRetries?: number;
}) {
  const { t } = useI18n();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.focus();
  }, []);
  return (
    <div ref={panel} tabIndex={-1} className="grid gap-3 outline-none">
      <UiAlert
        tone="negative"
        title={t("auth.assurance.error_title")}
        testId="auth-assurance-error"
      >
        <p>{t("auth.assurance.error_body")}</p>
      </UiAlert>
      {/* Always in the tree (a live region that appears with its text is not
          reliably read); while empty it gives back the grid gap it sits in. */}
      <p role="status" className={cn("empty:-mt-3", ui.text.meta, ui.tone.muted)}>
        {failedRetries > 0 ? (
          <span key={failedRetries}>{t("auth.assurance.still_unconfirmed")}</span>
        ) : null}
      </p>
      <AuthPrimaryButton type="button" onClick={onRetry} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {t("state.retry")}
      </AuthPrimaryButton>
      <AuthSecondaryButton type="button" onClick={onSignOut} disabled={busy}>
        {t("profile.sign_out")}
      </AuthSecondaryButton>
    </div>
  );
}
