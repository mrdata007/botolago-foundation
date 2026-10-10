import type { CardPalette } from "../renderer";
import type { TierCode } from "../types";
import { FOIL } from "./foil";

/** The foil ladder's row for a tier, as the renderer interface's `palette` hands it to the screens. */
export function tierPalette(tier: TierCode | null): CardPalette {
  const foil = FOIL[tier ?? "base"];
  return {
    plate: foil.plate,
    deep: foil.deep,
    glow: foil.glow,
    light: foil.light,
    label: foil.label,
    word: foil.wordFill ?? foil.light,
    metal: foil.metal,
    beam: foil.beamCol ?? foil.light,
    prism: foil.foil ?? null,
  };
}
