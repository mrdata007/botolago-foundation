import { useState } from "react";
import { cn } from "@/lib/utils";
import type { KitConfig } from "@/lib/kits";

interface JerseyVisualProps {
  kit: KitConfig;
  size?: number;
  imageUrl?: string;
  className?: string;
  ariaLabel?: string;
}

/**
 * SVG football jersey. Renders a torso with sleeves, neckline, subtle highlight
 * and shadow. Supports several deterministic kit patterns from KitConfig. When
 * `imageUrl` is set and loads, the pixel image is shown; on error, gracefully
 * falls back to the generated SVG jersey.
 */
export function JerseyVisual({ kit, size = 48, imageUrl, className, ariaLabel }: JerseyVisualProps) {
  const [imgFailed, setImgFailed] = useState(false);

  if (imageUrl && !imgFailed) {
    return (
      <img
        src={imageUrl}
        alt={ariaLabel ?? ""}
        width={size}
        height={size * 1.15}
        onError={() => setImgFailed(true)}
        className={cn("select-none drop-shadow-md", className)}
        draggable={false}
      />
    );
  }

  const { primary, secondary, pattern } = kit;
  const w = 48;
  const h = 56;
  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={size * (h / w)}
      className={cn("select-none drop-shadow-md", className)}
    >
      <defs>
        <linearGradient id="jerseyHighlight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
          <stop offset="45%" stopColor="rgba(255,255,255,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.22)" />
        </linearGradient>
        <clipPath id="jerseyBody">
          {/* Torso + shoulders shape */}
          <path d="M8 10 L16 4 L20 6 Q24 9 28 6 L32 4 L40 10 L44 20 L38 22 L36 52 Q24 55 12 52 L10 22 L4 20 Z" />
        </clipPath>
      </defs>

      {/* Sleeves (drawn behind torso) */}
      <path
        d="M8 10 L4 20 L0 32 L8 36 L14 24 Z"
        fill={pattern === "two-tone-sleeves" ? secondary : primary}
      />
      <path
        d="M40 10 L44 20 L48 32 L40 36 L34 24 Z"
        fill={pattern === "two-tone-sleeves" ? secondary : primary}
      />

      {/* Torso base */}
      <g clipPath="url(#jerseyBody)">
        <rect x="0" y="0" width={w} height={h} fill={primary} />

        {pattern === "stripes-vertical" && (
          <g fill={secondary}>
            {[10, 20, 30, 40].map((x) => (
              <rect key={x} x={x - 2} y="0" width="4" height={h} />
            ))}
          </g>
        )}

        {pattern === "bands-horizontal" && (
          <g fill={secondary}>
            {[14, 26, 38, 50].map((y) => (
              <rect key={y} x="0" y={y - 3} width={w} height="6" />
            ))}
          </g>
        )}

        {pattern === "central-stripe" && (
          <rect x={w / 2 - 5} y="0" width="10" height={h} fill={secondary} />
        )}

        {/* Highlight & shadow overlay for depth */}
        <rect x="0" y="0" width={w} height={h} fill="url(#jerseyHighlight)" />
      </g>

      {/* Body outline */}
      <path
        d="M8 10 L16 4 L20 6 Q24 9 28 6 L32 4 L40 10 L44 20 L38 22 L36 52 Q24 55 12 52 L10 22 L4 20 Z"
        fill="none"
        stroke="rgba(0,0,0,0.35)"
        strokeWidth="0.8"
      />

      {/* Neckline */}
      <path
        d="M20 6 Q24 12 28 6 L26 4 Q24 6 22 4 Z"
        fill={secondary}
        stroke="rgba(0,0,0,0.3)"
        strokeWidth="0.6"
      />
    </svg>
  );
}
