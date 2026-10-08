import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { UiAlert, UiIconButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { track, type AnalyticsEvent } from "@/lib/analytics";
import { useMyManagerCard } from "@/services/use-manager-card";

import { useMomentCopy } from "../copy";
import { DEVICE_KEYS, hasSeen, markSeen, type DeviceKey } from "../storage";
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
 * CAP, the starting eleven for SEL, the transfers for TRF. An inline info alert directly above
 * the control being used, dismissible; it never covers a control and never blocks the deadline
 * flow.
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
    if (hasSeen(DEVICE_KEY[kind])) return;
    markSeen(DEVICE_KEY[kind]);
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
        <UiIconButton
          variant="ghost"
          aria-label={t("common.close")}
          onClick={() => setClosed(true)}
        >
          <X aria-hidden />
        </UiIconButton>
      }
    >
      {text}
    </UiAlert>
  );
}
