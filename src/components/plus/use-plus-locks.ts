import { PREMIUM_SURFACES } from "@/lib/feature-flags";
import { usePremium } from "@/services/use-premium";

/** Whether the lock chips show for this reader. */
export function usePlusLocksVisible(): boolean {
  const premium = usePremium();
  return PREMIUM_SURFACES && premium.ready && premium.enabled && !premium.isMember;
}
