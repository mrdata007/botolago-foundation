/**
 * The shared manager avatar, seen from behind in a bench jacket, hood up: faceless by design
 * (not a missing photo), neutral in gender and skin, unmistakably football. Only LEGEND uses it
 * (the supporter holding the scarf overhead). Hood up only: the bare head is not ported.
 */
import { f2 } from "./knit";

export const AVATAR = {
  viewBox: "0 0 200 240",
  torso: "M2 240C4 203 26 182 62 174L84 170H116L138 174C174 182 196 203 198 240Z",
  seam: "M22 214C64 199 136 199 178 214M66 176C58 196 50 218 46 240M134 176C142 196 150 218 154 240",
  hood: "M52 180C47 150 48 118 58 94C68 72 84 60 100 58C116 60 132 72 142 94C152 118 153 150 148 180C126 171 74 171 52 180Z",
  hoodSeam: "M100 60C100 100 100 140 100 173",
  hoodRim: "M56 178C80 170 120 170 144 178",
} as const;

export interface AvatarOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The jacket (and the hood). */
  torso: string;
  seam: string;
  cls?: string;
}

/** The avatar as a nested <svg>, hood up. */
export function avatarSvg(o: AvatarOptions): string {
  const A = AVATAR;
  return (
    `<svg x="${f2(o.x)}" y="${f2(o.y)}" width="${f2(o.w)}" height="${f2(o.h)}" viewBox="${A.viewBox}" preserveAspectRatio="xMidYMax meet"` +
    `${o.cls ? ` class="${o.cls}"` : ""} aria-hidden="true" focusable="false">` +
    `<path d="${A.torso}" fill="${o.torso}"/>` +
    `<path d="${A.seam}" stroke="${o.seam}" stroke-width="2.5" fill="none"/>` +
    `<path d="${A.hood}" fill="${o.torso}"/>` +
    `<path d="${A.hoodSeam}" stroke="${o.seam}" stroke-width="2.5" fill="none"/>` +
    `<path d="${A.hoodRim}" stroke="${o.seam}" stroke-width="2.5" fill="none"/>` +
    `</svg>`
  );
}
