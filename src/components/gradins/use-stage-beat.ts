import { useEffect, useRef, useState } from "react";

import {
  DEVICE_KEYS,
  hasSeen,
  markSeen,
  readTick,
  writeDevice,
} from "@/components/manager-card/storage";
import type { BeatName } from "@/components/manager-card/types";

import { useLaunchGate } from "./use-launch-gate";

/* The beat the stage plays                                                                     */
/* ------------------------------------------------------------------------------------------ */

/**
 * The one beat the stage asks for on its own (plan section 5.4), decided once, after the launch
 * gate opens:
 *
 *   - a guest's base scarf is made (`make`) the first time on this phone;
 *   - a manager whose count of journées is above the phone's last (`readTick`) sees the newest
 *     stripe knitted (`tick`).
 *
 * A beat plays once. The decision is written down before the beat starts, and a phone that cannot
 * remember (blocked storage) never plays one: it must not be nagged. `suppress` holds it back while
 * a hero is showing its own beat on the card.
 */
export function useStageBeat(input: {
  kind: "guest" | "owner" | "none";
  counted: number | null;
  suppress?: boolean;
}): BeatName | undefined {
  const open = useLaunchGate();
  const [beat, setBeat] = useState<BeatName | undefined>(undefined);
  const decided = useRef(false);
  const { kind, counted, suppress = false } = input;
  useEffect(() => {
    if (!open || decided.current || suppress || kind === "none") return;
    decided.current = true;
    if (kind === "guest") {
      if (!hasSeen(DEVICE_KEYS.guestMake)) {
        markSeen(DEVICE_KEYS.guestMake);
        setBeat("make");
      }
      return;
    }
    if (counted !== null && counted > readTick()) {
      if (writeDevice(DEVICE_KEYS.tick, String(counted))) setBeat("tick");
    }
  }, [open, kind, counted, suppress]);
  return beat;
}
