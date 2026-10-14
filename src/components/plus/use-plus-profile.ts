import { useMemo } from "react";

import { fromMyCard } from "@/components/manager-card/to-profile";
import type { CardProfile } from "@/components/manager-card/types";
import { useMyManagerCard } from "@/services/use-manager-card";

import { SAMPLE_CARD_PROFILE } from "./plus-sample";

/**
 * The card on the offer's first and last screens: the member's own, or the example when there is
 * none (a guest, an account without a team).
 */
export function usePlusProfile(): { profile: CardProfile; example: boolean } {
  const query = useMyManagerCard();
  const card = query.data ?? null;
  return useMemo(
    () =>
      card
        ? { profile: fromMyCard(card), example: false }
        : { profile: SAMPLE_CARD_PROFILE, example: true },
    [card],
  );
}
