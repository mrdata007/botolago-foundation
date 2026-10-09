import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { UiAlert, UiIconButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { track, type AnalyticsEvent } from "@/lib/analytics";
import { useMyManagerCard } from "@/services/use-manager-card";

import { useMomentCopy } from "../copy";
import { DEVICE_KEYS, type DeviceKey } from "../storage";
import { claimHint } from "./hint-once";
import { hintEligible } from "./inline-model";

export type CardHintKind = "cap" | "sel" | "trf";

const DEVICE_KEY: Record<CardHintKind, DeviceKey> = {
  cap: DEVICE_KEYS.hintCap,
  sel: DEVICE_KEYS.hintSel,
  trf: DEVICE_KEYS.hintTrf,
};
const EVENT: Record<CardHintKind, AnalyticsEvent> = {
  cap: "card_hint_cap_view",
  sel: "card_hint_sel_view",
  trf: "card_hint_trf_view",
};

/**
 * One line that names the statistic a decision feeds (plan M3e): the captain choice counts for
 * CAP, the starting eleven for SEL, the transfers for TRF. An info alert directly above the
 * control being used (the captain's first action, the transfers' mode toggle, the substitution
 * bar's cancel button), dismissible, and it never blocks the deadline flow. The SEL one sits in a
 * bar that already floats over the pitch, so it adds one alert's height to that overlay for as
 * long as it is shown; the pitch scrolls under it.
 *
 * Each is shown once per phone: the device key is written when the hint first appears, so a
 * closed sheet that opens again does not repeat it, and a phone that cannot store anything counts
 * as having seen it (the PrizeWelcome rule), so it is never nagged. These are teaching lines, not
 * moments, so they are not acknowledged on the server. Only for a manager whose card exists and
 * has no number yet: once there is a number the decisions explain themselves.
 *
 * It decides after mount, never during the server render, so the markup matches on hydration.
 */
export function CardHint({ kind, className }: { kind: CardHintKind; className?: string }) {
  const { t } = useI18n();
  const moment = useMomentCopy();
  const query = useMyManagerCard();
  const eligible = hintEligible(query.data);
  const [shown, setShown] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (!eligible || shown) return;
    if (!claimHint(DEVICE_KEY[kind])) return;
    track(EVENT[kind]);
    setShown(true);
  }, [eligible, kind, shown]);

  if (!shown || closed || !eligible) return null;
  const text =
    kind === "cap" ? moment.m3.hintCap : kind === "sel" ? moment.m3.hintSel : moment.m3.hintTrf;
  return (
    <UiAlert
      tone="info"
      className={className}
      testId={`card-hint-${kind}`}
      action={
        <UiIconButton variant="ghost" aria-label={t("fpl.close")} onClick={() => setClosed(true)}>
          <X aria-hidden />
        </UiIconButton>
      }
    >
      {text}
    </UiAlert>
  );
}
