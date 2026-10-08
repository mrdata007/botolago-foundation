import type { MyCardDto } from "@/backend/manager-card/contracts";
import { useAckMoments } from "@/services/use-manager-card";
import type { HeroSpec, LineSpec } from "../types";

/**
 * What the moment gate hands a surface (plan sections 5.3 and 7.6): the one hero this session may
 * show, the one-line states, and the acknowledgement. STUB from WP1 (the foundation), replaced
 * by WP4, which adds the launch gate, the deadline rule, the session flag and the observer. It
 * keeps this signature. Until then there is never a hero or a line, and `ack` is the real,
 * optimistic acknowledgement.
 */
export function useMomentGate(
  surface: "gradins" | "team",
  card: MyCardDto | null,
): { hero: HeroSpec | null; lines: LineSpec[]; ack(keys: readonly string[]): void } {
  void surface;
  void card;
  const acknowledge = useAckMoments();
  return {
    hero: null,
    lines: [],
    ack: (keys) => {
      void acknowledge(keys);
    },
  };
}
