import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";

import { ui, UiButton, UiCard } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { NOTIFICATIONS_PUSH_ENABLED } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";
import {
  disablePush,
  enablePush,
  pushKeyConfigured,
  readPushState,
  type PushState,
} from "@/services/web-push";

/** Phone alerts switch. Hidden unless the flag and the public key are both set. */
export function PushOptInCard() {
  const { t, lang } = useI18n();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const available = NOTIFICATIONS_PUSH_ENABLED && pushKeyConfigured();

  useEffect(() => {
    if (available) void readPushState().then(setState);
  }, [available]);

  if (!available || state === null || state === "unsupported") return null;

  const turnOn = async () => {
    setBusy(true);
    setFailed(false);
    const result = await enablePush(lang === "ar" ? "ar" : "fr");
    setState(result === "on" ? "on" : result === "blocked" ? "blocked" : "off");
    setFailed(result === "failed");
    setBusy(false);
  };
  const turnOff = async () => {
    setBusy(true);
    setFailed(!(await disablePush()));
    setState(await readPushState());
    setBusy(false);
  };

  const body =
    state === "on"
      ? t("notifications.push.on_body")
      : state === "blocked"
        ? t("notifications.push.blocked_body")
        : state === "needs_home_screen"
          ? t("notifications.push.ios_body")
          : t("notifications.push.off_body");

  return (
    <UiCard padding="lg" className="flex items-start gap-3">
      <BellRing className={cn("mt-0.5 h-5 w-5 shrink-0", ui.tone.ink)} aria-hidden />
      <div className="min-w-0 flex-1">
        <h2 className={cn(ui.display.section, ui.tone.default)}>{t("notifications.push.title")}</h2>
        <p className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>{body}</p>
        {failed ? (
          <p role="alert" className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>
            {t("notifications.push.failed")}
          </p>
        ) : null}
        {state === "off" || state === "on" ? (
          <UiButton
            className="mt-3"
            variant={state === "on" ? "outline" : "ink"}
            disabled={busy}
            onClick={() => void (state === "on" ? turnOff() : turnOn())}
          >
            {state === "on" ? t("notifications.push.turn_off") : t("notifications.push.turn_on")}
          </UiButton>
        ) : null}
      </div>
    </UiCard>
  );
}
