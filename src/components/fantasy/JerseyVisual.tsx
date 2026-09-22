import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import type { KitConfig } from "@/lib/kits";
import { FailureAwareImage } from "@/components/common/FailureAwareImage";

/**
 * The shadow the garment casts on whatever is behind it — the turf, a list
 * row, a sheet. Spelled once rather than twice because it is one decision, and
 * kept as a literal for the same reason as the `rgba(...)` stops below: it is
 * lighting, not palette. There is no `--ui-shadow-*` step that means "an
 * object casting on an unknown surface" — the four elevation tokens are card,
 * raised bar, overlay and desktop column — and a shadow that changed colour
 * with the theme is not how a shadow on an object works.
 */
const GARMENT_DROP_SHADOW = "drop-shadow-[0_4px_6px_rgba(0,0,0,0.35)]";

interface JerseyVisualProps {
  kit: KitConfig;
  size?: number;
  imageUrl?: string;
  className?: string;
  ariaLabel?: string;
  /** When true, renders a soft brand ring behind the jersey (selected state). */
  selected?: boolean;
}

/**
 * Dimensional SVG football jersey.
 *
 * Adds proper collar, sleeve seams, subtle top highlight and a rich bottom
 * shadow so the shirt reads as a garment rather than a flat icon. Supports
 * several deterministic kit patterns and an optional pixel image with
 * graceful fallback.
 *
 * The black/white `rgba(...)` stops below are deliberately literal and are
 * NOT a palette: they are the lighting on a garment — a highlight, a side
 * shade, a cuff, an outline — applied over whatever club colours
 * `getKitForClub` returns. Tokenising them would mean a "shadow colour" that
 * changes with the theme, which is not how a shadow on an object works, and
 * would make a light kit and a dark kit shade differently. The club colours
 * themselves live in `src/lib/kits.ts`.
 */
export function JerseyVisual({
  kit,
  size = 48,
  imageUrl,
  className,
  ariaLabel,
  selected,
}: JerseyVisualProps) {
  const { primary, secondary, pattern } = kit;
  const w = 48;
  const h = 56;
  const gid = `j${Math.abs(hash(`${primary}-${secondary}-${pattern}`))}`;
  return (
    <div className={cn("relative inline-block", className)}>
      {selected && (
        <span
          aria-hidden
          className={cn("absolute inset-0 -m-1", ui.radius.full)}
          style={{
            // A centred radial, so it does not mirror under `dir="rtl"`, in a
            // kit accent rather than the legacy `--brand-accent`.
            background:
              "radial-gradient(closest-side at 50% 50%, color-mix(in oklab, var(--ui-accent-sky) 55%, transparent), transparent 70%)",
            filter: "blur(2px)",
          }}
        />
      )}
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${w} ${h}`}
        width={size}
        height={size * (h / w)}
        className={cn("relative select-none", GARMENT_DROP_SHADOW)}
      >
        <defs>
          <linearGradient id={`${gid}-hi`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.42)" />
            <stop offset="35%" stopColor="rgba(255,255,255,0.08)" />
            <stop offset="65%" stopColor="rgba(0,0,0,0.05)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.32)" />
          </linearGradient>
          <linearGradient id={`${gid}-side`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(0,0,0,0.18)" />
            <stop offset="20%" stopColor="rgba(0,0,0,0)" />
            <stop offset="80%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.18)" />
          </linearGradient>
          <clipPath id={`${gid}-body`}>
            <path d="M8 10 L16 4 L20 6 Q24 9 28 6 L32 4 L40 10 L44 20 L38 22 L36 52 Q24 55 12 52 L10 22 L4 20 Z" />
          </clipPath>
        </defs>

        {/* Sleeves */}
        <g>
          <path
            d="M8 10 L4 20 L0 32 L8 36 L14 24 Z"
            fill={pattern === "two-tone-sleeves" ? secondary : primary}
          />
          <path
            d="M40 10 L44 20 L48 32 L40 36 L34 24 Z"
            fill={pattern === "two-tone-sleeves" ? secondary : primary}
          />
          {/* Sleeve cuffs */}
          <path d="M0 32 L8 36 L7 38 L-0.5 34 Z" fill="rgba(0,0,0,0.22)" />
          <path d="M48 32 L40 36 L41 38 L48.5 34 Z" fill="rgba(0,0,0,0.22)" />
        </g>

        {/* Torso base */}
        <g clipPath={`url(#${gid}-body)`}>
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

          {/* Side shading */}
          <rect x="0" y="0" width={w} height={h} fill={`url(#${gid}-side)`} />
          {/* Vertical highlight/shadow */}
          <rect x="0" y="0" width={w} height={h} fill={`url(#${gid}-hi)`} />
          {/* Hem accent */}
          <rect x="0" y="49" width={w} height="1.6" fill={secondary} opacity="0.9" />
        </g>

        {/* Body outline */}
        <path
          d="M8 10 L16 4 L20 6 Q24 9 28 6 L32 4 L40 10 L44 20 L38 22 L36 52 Q24 55 12 52 L10 22 L4 20 Z"
          fill="none"
          stroke="rgba(0,0,0,0.42)"
          strokeWidth="0.8"
        />

        {/* V-neck collar */}
        <path
          d="M20 6 Q24 12 28 6 L26 4 Q24 6 22 4 Z"
          fill={secondary}
          stroke="rgba(0,0,0,0.35)"
          strokeWidth="0.6"
        />
      </svg>
      <FailureAwareImage
        src={imageUrl}
        alt={ariaLabel ?? ""}
        width={size}
        height={size * (h / w)}
        className={cn(
          "absolute inset-0 z-10 h-full w-full select-none object-contain",
          GARMENT_DROP_SHADOW,
        )}
        draggable={false}
      />
    </div>
  );
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
