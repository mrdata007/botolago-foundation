import { useEffect, useMemo, useState, type JSX, type ReactNode } from "react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { ui, UiButton, UiPill, UiSheet } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

import { ManagerCard } from "../ManagerCard";
import type { ReplayItem } from "../types";
import { momentWords, replayView } from "./moment-text";

/**
 * The replay sheet (plan section 4.6): « Revoir » on the card page and on « Vos saisons ». It
 * opens on a tap and never by itself, shows the full card drawn from that journée's stored values
 * (its stats, number, tier and season, on the manager's own name and club), plays that moment's
 * beat once over a number that is legible from the first frame, and says what it was and what it
 * is now: « À la J3 : 84. Aujourd'hui : 87. ». Close only. Static under reduced motion (the card
 * takes no beat then). Opening it counts `card_replay_open`.
 *
 * A moment is only ever replayed from what was stored: the founder mark from the card itself
 * (it is not a journée), a closed season from its last stored journée.
 */
export function ReplaySheet({
  open,
  onOpenChange,
  item,
  current,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  item: ReplayItem | null;
  current: MyCardDto;
}): JSX.Element {
  const { t, lang } = useI18n();
  const words = useMemo(() => momentWords(t, lang), [t, lang]);
  const shown = open && item !== null;

  useEffect(() => {
    if (shown) track("card_replay_open");
  }, [shown]);

  const view = item ? replayView(item, current, words) : null;
  const beat = useBeatAfterSheet(shown ? (item?.beat ?? null) : null);
  return (
    <UiSheet
      open={shown}
      onOpenChange={onOpenChange}
      title={view?.title ?? ""}
      footer={
        <UiButton variant="soft" data-testid="replay-close" onClick={() => onOpenChange(false)}>
          {t("common.close")}
        </UiButton>
      }
    >
      {item && view ? (
        <div
          className="flex flex-col items-center gap-3 px-4 py-5"
          data-testid="replay-sheet"
          data-replay-kind={item.kind}
        >
          {/* Keyed by the moment, so opening another one draws its card, and its beat, afresh. */}
          <ManagerCard
            key={`${item.kind}:${item.seasonId ?? ""}:${item.gameweekSeq ?? ""}:${item.tier ?? ""}`}
            profile={view.profile}
            width={224}
            beat={beat ?? undefined}
            testId="replay-card"
          />
          {view.profile.provisional && view.profile.ovr !== null ? (
            <UiPill tone="sunken" className="px-3 py-1">
              {words.card.provisional}
            </UiPill>
          ) : null}
          {view.lines.map((line, index) => (
            <p
              key={index}
              className={cn(
                "text-center text-balance",
                index === 0 ? ui.text.bodyStrong : ui.text.secondary,
                ui.tone.default,
              )}
            >
              {line}
            </p>
          ))}
        </div>
      ) : null}
    </UiSheet>
  );
}

/** The sheet's own slide-in (`--duration-sheet`, 320 ms) is over before the card moves. */
const SHEET_SETTLE_MS = 340;

/**
 * The beat to hand the card: `undefined` while the sheet is still arriving, then the moment's own
 * beat. One motion at a time: the card never knits while the sheet that holds it is moving.
 */
function useBeatAfterSheet(beat: ReplayItem["beat"]): ReplayItem["beat"] | undefined {
  const [ready, setReady] = useState<ReplayItem["beat"]>(null);
  useEffect(() => {
    if (!beat) {
      setReady(null);
      return;
    }
    const timer = window.setTimeout(() => setReady(beat), SHEET_SETTLE_MS);
    return () => {
      window.clearTimeout(timer);
      setReady(null);
    };
  }, [beat]);
  return ready ?? undefined;
}
