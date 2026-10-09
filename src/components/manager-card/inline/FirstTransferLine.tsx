import type { MyCardDto } from "@/backend/manager-card/contracts";
import { ui, UiAlert } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { useMyManagerCard } from "@/services/use-manager-card";

import { useCardCopy, useMomentCopy } from "../copy";
import { fill } from "../interpolate";
import { firstTransferEligible } from "./inline-model";

/**
 * The line on the transfer confirmation (plan M3f): « TRF mesurera ce transfert après 3 journées
 * terminées. » It is shown while TRF has no transfer to measure (its reason is `no_transfers`),
 * so a manager making their first transfer learns what it will count for, and never implies a
 * manager must transfer. The rounds are the TRF window; the contract has no field of its own for
 * it, so this reads the card's `minRated`, as the `window_open` reason does (`copy.ts`).
 *
 * It carries its own spacing and renders nothing otherwise, so the confirmation is exactly what it
 * was when there is nothing to say.
 */
export function FirstTransferLine() {
  const query = useMyManagerCard();
  const card = query.data;
  if (!firstTransferEligible(card)) return null;
  return <FirstTransferLineView card={card} />;
}

export function FirstTransferLineView({ card }: { card: MyCardDto }) {
  const moment = useMomentCopy();
  const copy = useCardCopy();
  return (
    <div className={cn("mt-3", ui.space.gutter)} data-testid="first-transfer-line">
      <UiAlert tone="info">
        {fill(moment.m3.firstTransfer, { final: copy.finalRounds(card.minRated) })}
      </UiAlert>
    </div>
  );
}
