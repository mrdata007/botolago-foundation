import type { MomentDto, MyCardDto } from "@/backend/manager-card/contracts";
import type { HeroSpec, LineSpec } from "../types";

/**
 * Picking the one hero (plan sections 5.3 and 7.6): STUB from WP1 (the foundation), replaced by
 * WP4 with the priority order, the coalescing, the deadline rule and the session flag. The
 * context type below is WP1's first reading of what the picker needs; WP4 owns it and may change
 * it, together with its callers in this folder. The result shape is the plan's.
 */
export interface PickHeroContext {
  card: MyCardDto;
  /** Minutes to the next Fantasy deadline, or null when it is not known. */
  minutesToDeadline: number | null;
  /** A hero or the born panel was already shown in this session. */
  heroShownThisSession: boolean;
  /** The splash is over, hydration is done and the language is chosen. */
  launchGateOpen: boolean;
  /** The latest journée the server has evaluated. */
  latestEvaluatedGameweekSeq: number | null;
}

export interface PickedMoments {
  hero: HeroSpec | null;
  lines: LineSpec[];
  ackOnDisplay: string[];
}

export function pickHero(moments: readonly MomentDto[], ctx: PickHeroContext): PickedMoments {
  void moments;
  void ctx;
  return { hero: null, lines: [], ackOnDisplay: [] };
}
