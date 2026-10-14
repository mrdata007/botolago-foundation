import { useId, type CSSProperties } from "react";

import { WORDMARK_PATHS } from "@/assets/brand/wordmark-paths";
import { cn } from "@/lib/utils";

import "./plus.css";

/**
 * The BotolaGO+ logo: the official wordmark (`src/assets/brand/wordmark-paths.ts`) followed by a
 * mint "+" drawn in 3D (soft shadow, extruded side, lit face with a bevel and a gloss), in the
 * 1860 x 288 box of the approved sketch (`#bgPlusLogo`).
 *
 * BotolaGO+ is ALWAYS this logo on screen, never typed. The `aria-label` is the one place the
 * name is plain text (it is spoken, not drawn). The wordmark takes `currentColor`; the "+" keeps
 * its own mint. The "+" tilts gently like a coin catching the light, and is still under
 * `prefers-reduced-motion` (`plus.css`).
 *
 * Self-contained: gradient and clip ids are scoped per instance with `useId`, so several logos on
 * one page (the header, a chip, a title) never share or break each other's definitions.
 */

/** The "+" outline, in the sketch's coordinates. */
const PLUS_SHAPE =
  "M1732.0,87.0 L1792.0,87.0 L1781.0,142.0 L1836.0,142.0 L1824.0,202.0 L1769.0,202.0 L1758.0,257.0 L1698.0,257.0 L1709.0,202.0 L1654.0,202.0 L1666.0,142.0 L1721.0,142.0 Z";

/** Twelve extrusion layers, 1.3 apart on x and 1.7 on y, from the back to the front. */
const SIDE_LAYERS = Array.from({ length: 12 }, (_, i) => ({
  x: +(1.3 * (12 - i)).toFixed(1),
  y: +(1.7 * (12 - i)).toFixed(1),
}));

export function PlusLogo({
  label,
  decorative = false,
  className,
  style,
  height,
}: {
  /** The spoken name (`PLUS_NAME`). */
  label: string;
  /** Inside something that already says it (a chip with its own label): hidden from readers. */
  decorative?: boolean;
  className?: string;
  style?: CSSProperties;
  /** CSS height (e.g. `34`, `"1.15em"`); the width follows the aspect ratio. */
  height?: number | string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const face = `plusface${uid}`;
  const side = `plusside${uid}`;
  const shape = `plusshape${uid}`;
  const clip = `plusclip${uid}`;
  return (
    <svg
      className={cn("plus-logo", className)}
      viewBox="0 0 1860 288"
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      style={{ height, ...style }}
      // The logo reads left to right in every language.
      direction="ltr"
    >
      <defs>
        <linearGradient id={face} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#c8ffdf" />
          <stop offset="0.45" stopColor="#4be895" />
          <stop offset="1" stopColor="#1fae62" />
        </linearGradient>
        <linearGradient id={side} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#17804a" />
          <stop offset="1" stopColor="#0b4d2c" />
        </linearGradient>
        <path id={shape} d={PLUS_SHAPE} />
        <clipPath id={clip}>
          <use href={`#${shape}`} />
        </clipPath>
      </defs>
      {WORDMARK_PATHS.map((d, i) => (
        <path key={i} fill="currentColor" d={d} />
      ))}
      <g className="plus-logo__tilt">
        <use href={`#${shape}`} transform="translate(24 30)" fill="#000" opacity="0.35" />
        <g fill={`url(#${side})`}>
          {SIDE_LAYERS.map(({ x, y }) => (
            <use key={x} href={`#${shape}`} transform={`translate(${x} ${y})`} />
          ))}
        </g>
        <use href={`#${shape}`} fill={`url(#${face})`} />
        <g clipPath={`url(#${clip})`}>
          <use
            href={`#${shape}`}
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.55"
            strokeWidth="10"
            transform="translate(-3 -4)"
          />
          <path
            d="M1600,60 L1900,60 L1900,150 Q1750,185 1600,170 Z"
            fill="#ffffff"
            opacity="0.22"
          />
        </g>
      </g>
    </svg>
  );
}
