import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/AuthProvider";
import { CARD_EDITIONS, type MyCardDto } from "@/backend/manager-card/contracts";

import { isManagerCardSampleData } from "./manager-card-mode";
import { premiumCardReadsService } from "./premium-card-reads";
import { managerCardKeys } from "./use-manager-card";

export type CardEditionCode = (typeof CARD_EDITIONS)[number];

/** The result a member's choice comes back with. */
export type ChooseDesignResult =
  | { status: "ok"; edition: CardEditionCode }
  | { status: "unavailable" };

export const isCardEdition = (value: string): value is CardEditionCode =>
  (CARD_EDITIONS as readonly string[]).includes(value);

/**
 * A member picks the edition their card is drawn in (`api.choose_card_design`). On success the
 * card the page holds is patched with the edition the database says it shows now, so the card
 * changes at once; a database read follows (a development fixture is not re-read: it would answer
 * with the standard card it was made with).
 */
export function useChooseCardDesign() {
  const queryClient = useQueryClient();
  const userId = useAuth().user?.id ?? null;
  return useMutation<ChooseDesignResult, Error, CardEditionCode>({
    mutationFn: async (code) => {
      const answer = await premiumCardReadsService.chooseCardDesign(code);
      return answer.available
        ? { status: "ok", edition: answer.edition }
        : { status: "unavailable" };
    },
    onSuccess: (result) => {
      if (result.status !== "ok") return;
      const key = managerCardKeys.me(userId ?? "local");
      queryClient.setQueryData<MyCardDto | null>(key, (card) =>
        card ? { ...card, edition: result.edition } : card,
      );
      if (!isManagerCardSampleData()) void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
