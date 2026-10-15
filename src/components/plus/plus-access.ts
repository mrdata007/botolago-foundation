import { PREMIUM_SURFACES } from "@/lib/feature-flags";
import { usePremium } from "@/services/use-premium";

/**
 * What a reader sees of BotolaGO+ inside the normal screens:
 *   - `off`: nothing at all. The build switch is off, or the database's answer is not in yet, or
 *     the feature is not enabled. Every in-app surface renders null (no node, no request).
 *   - `locked`: the feature is on and the reader is not a member: the blurred example and the lock.
 *   - `member`: the sections, clear, from the member's own reads.
 */
export type PlusAccess = "off" | "locked" | "member";

/** The pure decision, so a test can walk every combination. */
export function plusAccess(input: {
  surfaces: boolean;
  ready: boolean;
  enabled: boolean;
  isMember: boolean;
}): PlusAccess {
  if (!input.surfaces || !input.ready || !input.enabled) return "off";
  return input.isMember ? "member" : "locked";
}

export function usePlusAccess(): PlusAccess {
  const premium = usePremium();
  return plusAccess({
    surfaces: PREMIUM_SURFACES,
    ready: premium.ready,
    enabled: premium.enabled,
    isMember: premium.isMember,
  });
}
