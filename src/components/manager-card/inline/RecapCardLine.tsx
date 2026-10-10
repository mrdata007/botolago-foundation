import type { MyCardDto } from "@/backend/manager-card/contracts";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { useMyManagerCard } from "@/services/use-manager-card";

import { useMomentCopy } from "../copy";
import { fill } from "../interpolate";
import { recapCounted } from "./inline-model";

/**
 * One line under the total of « Ma journée BotolaGO » (plan M3d): « Journée comptée pour votre
 * carte : 2/3 ». Private like the recap itself, shown only while the card has no number, and only
 * for a round the server lists as one of the counted ones and has evaluated: a round the card
 * does not count never says it did.
 */
export function RecapCardLine({ gameweek, className }: { gameweek: number; className?: string }) {
  const query = useMyManagerCard();
  const card = query.data;
  if (!card) return null;
  return <RecapCardLineView card={card} gameweek={gameweek} className={className} />;
}

export function RecapCardLineView({
  card,
  gameweek,
  className,
}: {
  card: MyCardDto;
  gameweek: number;
  className?: string;
}) {
  const moment = useMomentCopy();
  const counted = recapCounted(card, gameweek);
  if (!counted) return null;
  return (
    <p
      className={cn(
        ui.text.secondary,
        "[font-weight:var(--ui-weight-strong)]",
        ui.tone.default,
        className,
      )}
      data-testid="recap-card-line"
    >
      {/* « {k}/{n} » is one left-to-right run: two isolated numbers either side of a slash
          would read « 3/2 » in an Arabic line. */}
      {fill(moment.m3.recap.replace("{k}/{n}", "{kn}"), { kn: `${counted.k}/${counted.n}` })}
    </p>
  );
}
