import type { ReactNode } from "react";
import {
  CheckCircle2,
  Home,
  Link2Off,
  Loader2,
  MailX,
  RotateCcw,
  Settings2,
  WifiOff,
} from "lucide-react";

import { ui, UiButton, UiCard, UiLinkButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

export type UnsubscribeViewState =
  | "confirm"
  | "submitting"
  | "unsubscribed"
  | "already_unsubscribed"
  | "invalid"
  | "error";

/**
 * What `/unsubscribe` shows. A pure function of `state`, so every state can
 * be rendered in a test without the network.
 *
 * Nothing is sent on load. Mail security scanners open links, and some run
 * their scripts, so a page that unsubscribed on load would unsubscribe people
 * who never clicked. The reader confirms with a button; `submitting` is that
 * same screen with the button locked.
 *
 * Every string is looked up by a literal key, never by a variable: the i18n
 * gate can only check keys it can see.
 */
export function UnsubscribeView({
  state,
  topic = null,
  onUnsubscribe,
}: {
  state: UnsubscribeViewState;
  /**
   * `pepites_weekly`: the link turns off only the Pépites weekly email, and
   * every line says so. Null: all product email.
   */
  topic?: "pepites_weekly" | null;
  /** Confirm, and retry after a network failure. */
  onUnsubscribe: () => void;
}) {
  const { t } = useI18n();
  const pepites = topic === "pepites_weekly";

  const home = (
    <UiLinkButton to="/" variant="ghost">
      <Home className="h-4 w-4" aria-hidden />
      {t("state.go_home")}
    </UiLinkButton>
  );
  const manage = (
    <UiLinkButton to="/profile" variant="ink">
      <Settings2 className="h-4 w-4" aria-hidden />
      {t("unsubscribe.manage")}
    </UiLinkButton>
  );

  if (state === "confirm" || state === "submitting") {
    const submitting = state === "submitting";
    return (
      <StateCard
        testId="unsubscribe-confirm"
        icon={<MailX className={cn("h-7 w-7", ui.tone.muted)} aria-hidden />}
        title={pepites ? t("unsubscribe.pepites_confirm_title") : t("unsubscribe.confirm_title")}
        body={pepites ? t("unsubscribe.pepites_confirm_body") : t("unsubscribe.confirm_body")}
      >
        <UiButton onClick={onUnsubscribe} disabled={submitting} aria-busy={submitting || undefined}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
              {t("unsubscribe.loading")}
            </>
          ) : (
            t("unsubscribe.confirm_action")
          )}
        </UiButton>
        {home}
        <span role="status" className="sr-only">
          {submitting ? t("unsubscribe.loading") : null}
        </span>
      </StateCard>
    );
  }

  if (state === "error") {
    return (
      <StateCard
        testId="unsubscribe-error"
        alert
        icon={<WifiOff className={cn("h-7 w-7", ui.tone.negative)} aria-hidden />}
        title={t("unsubscribe.error_title")}
        body={t("unsubscribe.error_body")}
      >
        <UiButton variant="ink" onClick={onUnsubscribe}>
          <RotateCcw className="h-4 w-4" aria-hidden />
          {t("state.retry")}
        </UiButton>
        {home}
      </StateCard>
    );
  }

  if (state === "invalid") {
    return (
      <StateCard
        testId="unsubscribe-invalid"
        alert
        icon={<Link2Off className={cn("h-7 w-7", ui.tone.negative)} aria-hidden />}
        title={t("unsubscribe.invalid_title")}
        body={t("unsubscribe.invalid_body")}
      >
        {manage}
        {home}
      </StateCard>
    );
  }

  return (
    <StateCard
      testId={state === "unsubscribed" ? "unsubscribe-done" : "unsubscribe-already"}
      live
      icon={<CheckCircle2 className={cn("h-7 w-7", ui.tone.positive)} aria-hidden />}
      title={
        pepites
          ? state === "unsubscribed"
            ? t("unsubscribe.pepites_done_title")
            : t("unsubscribe.pepites_already_title")
          : state === "unsubscribed"
            ? t("unsubscribe.done_title")
            : t("unsubscribe.already_title")
      }
      body={pepites ? t("unsubscribe.pepites_reenable_hint") : t("unsubscribe.reenable_hint")}
    >
      {manage}
      {home}
    </StateCard>
  );
}

function StateCard({
  icon,
  title,
  body,
  alert = false,
  live = false,
  children,
  testId,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  /** A failure announces itself as an alert. */
  alert?: boolean;
  /** An outcome is polite status. The question the reader is asked is neither. */
  live?: boolean;
  children: ReactNode;
  testId: string;
}) {
  return (
    <UiCard padding="lg" className="mt-4 text-center" testId={testId}>
      <div role={alert ? "alert" : live ? "status" : undefined}>
        <div className="flex justify-center">{icon}</div>
        <h2 className={cn("mt-3 text-balance", ui.text.section, ui.tone.default)}>{title}</h2>
        <p className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>{body}</p>
      </div>
      <div className="mt-5 grid gap-2">{children}</div>
    </UiCard>
  );
}
