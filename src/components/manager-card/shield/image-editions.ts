/**
 * The paid editions' layers as one still frame in the share art (`image.ts`), after what
 * `editions.ts` puts in the live card. `under` goes inside the face's clip, over the band and
 * under nothing else (the text is drawn on the canvas afterwards); `over` goes after the card's
 * lines, outside the clip. Pure strings; no `<text>`, no `<image>`, no external reference.
 */
import { electricStill } from "./image-electric";
import { holoStill } from "./image-holo";
import { pixelStill } from "./image-pixel";
import type { PaidEdition } from "./metal";

export function editionStill(edition: PaidEdition | null, id: string): { under: string; over: string } {
  switch (edition) {
    case "holo":
      return holoStill(id);
    case "electric":
      return electricStill(id);
    case "pixel":
      return pixelStill();
    default:
      return { under: "", over: "" };
  }
}
