import { useMemo } from "react";

import { fromMyCard } from "@/components/manager-card/to-profile";
import type { CardProfile } from "@/components/manager-card/types";
import { useMyManagerCard } from "@/services/use-manager-card";

/**
 * The member's own card as a profile, and its edition: what the style row says and what the
 * picker starts from. Null without a card (an account with no team has nothing to restyle).
 */
export function usePlusMemberCard(): CardProfile | null {
  const query = useMyManagerCard();
  const card = query.data ?? null;
  return useMemo(() => (card ? fromMyCard(card) : null), [card]);
}
