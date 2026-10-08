import { useMemo } from "react";

import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { useMyManagerCard } from "@/services/use-manager-card";
import type { Gameweek } from "@/types/domain";

import { CardBornPanel } from "../moments/CardBornPanel";
import { fromMyCard } from "../to-profile";
import { firstCountedDeadline } from "./inline-model";

/**
 * Where the card's birth panel sits on `/fantasy/team` (plan M2): at the top of the content, under
 * the deadline strip and above the facts row, so the controls and the pitch stay one unit below
 * it, unchanged, and the squad just saved is the next thing a manager scrolls to.
 *
 * Whether the panel shows is the moment gate's call (`CardBornPanel surface="team"`: a pending
 * `card_created`, the launch gate, the session flag); this only places it, with the card and the
 * deadline of the first counted round while it is ahead. The wrapper carries the spacing and is
 * hidden while empty, so a panel that renders nothing leaves no gap.
 */
export function TeamBornSlot({ gameweek }: { gameweek: Gameweek | null }) {
  const query = useMyManagerCard();
  const card = query.data;
  const profile = useMemo(() => (card ? fromMyCard(card) : null), [card]);
  if (!card || !profile) return null;
  const round = gameweek ? { number: gameweek.number, deadline: gameweek.deadline } : null;
  return (
    <div className={cn("pt-3 empty:hidden", ui.space.gutter)} data-testid="team-card-born-slot">
      <CardBornPanel
        card={card}
        profile={profile}
        nextDeadline={firstCountedDeadline(card, round)}
        surface="team"
      />
    </div>
  );
}
