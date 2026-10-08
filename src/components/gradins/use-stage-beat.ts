import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { momentStore } from "@/components/manager-card/moments/use-moment-gate";
import { fantasyService } from "@/services/fantasy-runtime";
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
  // The moment gate decides its hero once the next deadline is known (the shared `["gameweek"]`
  // read, same key and options as the gate's own). A manager's stage waits for that too: while a
  // hero is on screen it carries the card and the stage's own card is hidden, so a stripe knitted
  // there would be spent unseen.
  const gameweek = useQuery({
    queryKey: ["gameweek"],
    queryFn: () => fantasyService.getCurrentGameweek(),
    enabled: open && kind === "owner",
    staleTime: 60_000,
    retry: false,
  });
  const settled = kind !== "owner" || gameweek.isSuccess || gameweek.isError;
  useEffect(() => {
    if (!open || !settled || decided.current || kind === "none") return;
    // Read the gate's decision now, not the render's: it is made in a layout effect of this very
    // commit, after the render that produced `suppress`.
    if (kind === "owner" && (suppress || momentStore.get("gradins").hero !== null)) {
      // The hero's own beat is the stripe's: note the count so it is not knitted again tomorrow.
      decided.current = true;
      if (counted !== null && counted > readTick()) writeDevice(DEVICE_KEYS.tick, String(counted));
      return;
    }
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
  }, [open, settled, kind, counted, suppress]);
  return beat;
}
