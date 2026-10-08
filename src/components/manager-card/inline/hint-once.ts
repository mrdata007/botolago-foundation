import { hasSeen, markSeen, type DeviceKey } from "../storage";

/**
 * Claim a once-only hint on this phone: true the first time, false ever after. The device key is
 * written at the moment the hint is claimed (before it is drawn), so a sheet that closes and opens
 * again does not repeat it. A phone that cannot store anything (private window, blocked site data)
 * counts as having seen it, so it is never nagged: `hasSeen` answers true when storage is
 * unreadable, and nothing is claimed.
 */
export function claimHint(key: DeviceKey): boolean {
  if (hasSeen(key)) return false;
  markSeen(key);
  return true;
}
