import type { CardPalette } from "./renderer";
import type { TierCode } from "./types";
import { useCardRenderer } from "./use-card-renderer";

/**
 * Until the renderer's chunk has loaded (the server, hydration, the first moments of a visit) a
 * face drawn in DOM has no tier material to read. It takes this neutral graphite, the base card's
 * own, and changes to the tier's the moment the renderer arrives.
 */
const NEUTRAL: CardPalette = {
  plate: "#12151B",
  deep: "#262B35",
  glow: "#6B7484",
  light: "#AAB3C0",
  label: "#A3ACB9",
  word: "#E6ECF3",
  metal: ["#22262D", "#4A515C", "#2B3038", "#575D67", "#30353D", "#555C67", "#1E2228"],
  beam: "#AAB3C0",
  prism: null,
};

/** The tier's material from the active renderer (`null`: the base card), or the neutral one before it loads. */
export function useCardPalette(tier: TierCode | null): CardPalette {
  const renderer = useCardRenderer();
  return renderer ? renderer.palette(tier) : NEUTRAL;
}
