import { useI18n } from "@/i18n/provider";

import { useCardCopy } from "./copy";
import { tierNode } from "./tier-node";
import type { TierCode } from "./types";

/**
 * The tier's word in the interface's language, where a component shows it on its own (the rating
 * line, a ladder label, a table cell, a hub head). « LASTREET », the lowest tier's word, comes
 * isolated left to right so Arabic text around it cannot move it; the other tiers are plain text.
 * For a `{tier}` placeholder of a sentence, or where no hook can be called, use `tierNode`
 * (`tier-node.tsx`); the reasons are written there.
 */
export function TierWord({ tier }: { tier: TierCode }) {
  const { lang } = useI18n();
  const copy = useCardCopy();
  return <>{tierNode(tier, copy.tier[tier], lang)}</>;
}
