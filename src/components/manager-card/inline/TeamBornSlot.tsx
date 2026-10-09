import { useMemo } from "react";

import { useMyManagerCard } from "@/services/use-manager-card";
import type { Gameweek } from "@/types/domain";

import { CardBornPanel } from "../moments/CardBornPanel";
import { fromMyCard } from "../to-profile";
import { nextDeadline } from "./inline-model";

/**
 * Where the card's birth panel sits on `/fantasy/team` (plan M2): at the top of the content, under
 * the deadline strip and above the facts row, so the controls and the pitch stay one unit below
 * it, unchanged, and the squad just saved is the next thing a manager scrolls to.
 *
 * Whether the panel shows is the moment gate's call (`CardBornPanel surface="team"`: a pending
 * `card_created`, the launch gate, the session flag), and the panel brings its own spacing and
 * renders nothing when it is not due, so this only places it: the card, its profile and the next
 * deadline the page holds, while it is ahead.
 */
export function TeamBornSlot({ gameweek }: { gameweek: Gameweek | null }) {
  const query = useMyManagerCard();
  const card = query.data;
  const profile = useMemo(() => (card ? fromMyCard(card) : null), [card]);
  if (!card || !profile) return null;
  const round = gameweek ? { number: gameweek.number, deadline: gameweek.deadline } : null;
  return (
    <CardBornPanel
      card={card}
      profile={profile}
      nextDeadline={nextDeadline(round)}
      surface="team"
    />
  );
}
