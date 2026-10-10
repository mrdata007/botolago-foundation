import { useMemo } from "react";

import { useI18n } from "@/i18n/provider";

import { fillText } from "./interpolate";
import type { Translate } from "./copy";

/**
 * The words of the card's motion work (the stage's « Retourner » and the rating change chip). Kept
 * in their own `card_motion.` group rather than in `copy.ts`'s Appendix A, whose key count is pinned
 * by the section's tests. Same rules as there: one literal translate call per key, never a built key
 * name, and a number is filled with `fillText` so Arabic isolates it.
 */
export function motionCopy(t: Translate) {
  return {
    flip: {
      label: t("card_motion.flip.label"),
      shownFront: t("card_motion.flip.shown_front"),
      shownBack: t("card_motion.flip.shown_back"),
      backLabel: t("card_motion.flip.back_label"),
    },
    /** « note en hausse de 3 »: the spoken form of the rating change chip (`n` is the size, never signed). */
    deltaA11y: (up: boolean, n: number) =>
      fillText(up ? t("card_motion.delta.up") : t("card_motion.delta.down"), { n }),
  };
}
export type MotionCopy = ReturnType<typeof motionCopy>;

export function useMotionCopy(): MotionCopy {
  const { t } = useI18n();
  return useMemo(() => motionCopy(t), [t]);
}
