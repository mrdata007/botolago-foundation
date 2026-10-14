import { useImperativeHandle, useRef, type Ref } from "react";

import { prefersReducedMotion } from "@/lib/motion";

import { useCardOutline } from "../use-card-outline";

/**
 * A band of light that crosses the card once. Plain DOM over the card, outside its SVG and its
 * tilt tree (`tilt.ts` owns that): a clipped box holding one skewed band that moves by `transform`
 * and `opacity` on the compositor, drawn only while it plays. It never plays under reduced motion.
 * The clip is the card's own outline (`useCardOutline`: the renderer's), so the light never leaves the card.
 *
 * `play` is the whole interface: the entrance, the flip and the tier-up each call it when their
 * card is at the right place. `rainbow` is the Legend's full foil sweep.
 */
export interface GlintHandle {
  play: (options?: { delay?: number; duration?: number; rainbow?: boolean }) => Animation | null;
}

const WHITE =
  "linear-gradient(90deg, transparent 0%, rgb(255 255 255 / 0.12) 28%, rgb(255 255 255 / 0.62) 50%, rgb(255 255 255 / 0.12) 72%, transparent 100%)";
const RAINBOW =
  "linear-gradient(90deg, transparent 0%, rgb(255 77 109 / 0.7) 14%, rgb(255 190 70 / 0.78) 30%, rgb(70 224 150 / 0.78) 46%, rgb(70 190 255 / 0.8) 62%, rgb(150 110 255 / 0.78) 78%, transparent 100%)";

export function CardGlint({ ref, rtl = false }: { ref?: Ref<GlintHandle>; rtl?: boolean }) {
  const band = useRef<HTMLSpanElement | null>(null);
  const outline = useCardOutline(rtl);
  useImperativeHandle(
    ref,
    () => ({
      play: ({ delay = 0, duration = 560, rainbow = false } = {}) => {
        const el = band.current;
        if (!el || typeof el.animate !== "function" || prefersReducedMotion()) return null;
        const dir = document.documentElement.dir === "rtl" ? -1 : 1;
        el.style.backgroundImage = rainbow ? RAINBOW : WHITE;
        el.style.mixBlendMode = rainbow ? "screen" : "normal";
        return el.animate(
          [
            { opacity: 0, transform: `translateX(${-110 * dir}%) skewX(${-16 * dir}deg)` },
            { opacity: 1, offset: 0.2 },
            { opacity: 1, offset: 0.75 },
            { opacity: 0, transform: `translateX(${210 * dir}%) skewX(${-16 * dir}deg)` },
          ],
          { duration, delay, easing: "cubic-bezier(0.45, 0.05, 0.35, 1)", fill: "backwards" },
        );
      },
    }),
    [],
  );
  return (
    <span
      aria-hidden
      data-card-glint=""
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
      style={{ clipPath: outline }}
    >
      <span ref={band} className="absolute inset-y-[-8%] start-0 w-[52%] opacity-0" />
    </span>
  );
}
