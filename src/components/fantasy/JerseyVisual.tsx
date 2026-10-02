import { useId } from "react";

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

/**
 * The flat shirt's shadow: the A boards' soft 0 3px 3px lift, block-axis only
 * so it is the same in both directions, in the ink-deep the boards tint it
 * with rather than a literal.
 */
const FLAT_DROP_SHADOW =
  "drop-shadow-[0_2px_2px_color-mix(in_oklab,var(--ui-ink-deep)_30%,transparent)]";

/**
 * Option A's shirt (A-Team pitch, A-Players rows): one silhouette on a 24px
 * grid, filled with the club colour and outlined so it stays a shape on the
 * pastel turf, on a white row and on a club-colour sheet header.
 */
const FLAT_SHIRT =
  "M8 3 4 5.5 2.5 10l3 1.2V21h13v-9.8l3-1.2L20 5.5 16 3c-.8 1.4-2.3 2.3-4 2.3S8.8 4.4 8 3z";

/** The back of the collar, visible through the neck opening. */
const FLAT_BACK_COLLAR = "M8 3Q12 1.6 16 3c-.8 1.4-2.3 2.3-4 2.3S8.8 4.4 8 3z";

/** The outer edge of shirt plus back collar, so the outline wraps both. */
const FLAT_OUTLINE = "M8 3Q12 1.6 16 3l4 2.5 1.5 4.5-3 1.2V21h-13v-9.8l-3-1.2L4 5.5z";

interface JerseyVisualProps {
  kit: KitConfig;
  size?: number;
  imageUrl?: string;
  className?: string;
  ariaLabel?: string;
  /** When true, renders a soft brand ring behind the jersey (selected state). */
  selected?: boolean;
  /**
   * `dimensional` (default) is the lit garment; `flat` is the Option A
   * silhouette the A boards draw on the pitch and in player rows. `flat` is
   * square (`size` × `size`); `dimensional` is `size` wide and 7/6 as tall.
   */
  variant?: "dimensional" | "flat";
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
  variant = "dimensional",
}: JerseyVisualProps) {
  if (variant === "flat") {
    return (
      <FlatJersey
        kit={kit}
        size={size}
        imageUrl={imageUrl}
        className={className}
        ariaLabel={ariaLabel}
      />
    );
  }
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

/**
 * The pitch shirt. It keeps the Option A silhouette but is lit like an
 * object — a top-down light, shaded flanks, a chest sheen, sleeve seams,
 * the inside of the back collar and a contact shadow — so it reads as 3D.
 * Like the dimensional shirt above, those black/white stops are lighting,
 * not palette.
 *
 * The club's pattern survives in the flat form — stripes,
 * bands, a central stripe or contrasting sleeves in the kit's second colour —
 * clipped to the silhouette, because two red clubs are told apart by exactly
 * that.
 *
 * The outline is what keeps the shirt a shape wherever it lands: plain white
 * (the on-ink foreground, near-white in dark) around a dark kit, and a
 * translucent ink-deep around a light one — a white or yellow kit with a
 * white outline disappears on the white bench strip. "Light" is read off
 * `kit.ink`, which `getKitForClub` already picks by measured contrast.
 */
function FlatJersey({
  kit,
  size,
  imageUrl,
  className,
  ariaLabel,
}: {
  kit: KitConfig;
  size: number;
  imageUrl?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const clipId = `${uid}-flat`;
  const { primary, secondary, pattern } = kit;
  const lightKit = kit.ink !== "#ffffff";
  return (
    <span className={cn("relative inline-block shrink-0", className)}>
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox="0 0 24 24"
        width={size}
        height={size}
        className={cn("block select-none", FLAT_DROP_SHADOW)}
      >
        <defs>
          <clipPath id={clipId}>
            <path d={FLAT_SHIRT} />
          </clipPath>
          {/* Top-lit, darker toward the hem. */}
          <linearGradient id={`${uid}-v`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.38" />
            <stop offset="0.32" stopColor="#fff" stopOpacity="0.06" />
            <stop offset="0.7" stopColor="#000" stopOpacity="0.06" />
            <stop offset="1" stopColor="#000" stopOpacity="0.34" />
          </linearGradient>
          {/* Both flanks fall into shade, so the torso reads as round. */}
          <linearGradient id={`${uid}-h`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#000" stopOpacity="0.34" />
            <stop offset="0.26" stopColor="#000" stopOpacity="0" />
            <stop offset="0.62" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.4" />
          </linearGradient>
          {/* Soft sheen on the chest. */}
          <radialGradient id={`${uid}-s`} cx="0.38" cy="0.3" r="0.42">
            <stop offset="0" stopColor="#fff" stopOpacity="0.42" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Contact shadow on the surface below. */}
        <ellipse cx="12" cy="22.3" rx="6.8" ry="1" fill="#000" opacity="0.18" />

        {/* Inside of the back collar, seen through the neck opening. */}
        <path d={FLAT_BACK_COLLAR} fill={primary} />
        <path d={FLAT_BACK_COLLAR} fill="#000" opacity="0.45" />

        <path d={FLAT_SHIRT} fill={primary} />
        {pattern === "solid" ? null : (
          <g clipPath={`url(#${clipId})`} fill={secondary}>
            {pattern === "stripes-vertical" &&
              [7.8, 11.2, 14.6].map((x) => <rect key={x} x={x} y="0" width="1.6" height="24" />)}
            {pattern === "bands-horizontal" &&
              [8.6, 12.6, 16.6].map((y) => <rect key={y} x="0" y={y} width="24" height="1.6" />)}
            {pattern === "central-stripe" && <rect x="10.6" y="0" width="2.8" height="24" />}
            {pattern === "two-tone-sleeves" && (
              <>
                <rect x="0" y="0" width="5.5" height="12" />
                <rect x="18.5" y="0" width="5.5" height="12" />
              </>
            )}
          </g>
        )}

        <g clipPath={`url(#${clipId})`}>
          {/* Sleeves sit behind the torso: a shade darker, with a seam. */}
          <path d="M0 0H6.4L5.5 12H0Z M24 0H17.6L18.5 12H24Z" fill="#000" opacity="0.16" />
          <rect width="24" height="24" fill={`url(#${uid}-h)`} />
          <rect width="24" height="24" fill={`url(#${uid}-v)`} />
          <ellipse cx="11" cy="9.5" rx="6" ry="7" fill={`url(#${uid}-s)`} />
          <path
            d="M6.4 4.6 5.5 11.2M17.6 4.6l.9 6.6"
            stroke="#000"
            strokeOpacity="0.3"
            strokeWidth="0.45"
            fill="none"
          />
          {/* Cuffs and hem. */}
          <path d="M2.5 10l3 1.2M21.5 10l-3 1.2" stroke={secondary} strokeWidth="1.3" />
          <rect x="0" y="20" width="24" height="1" fill="#000" opacity="0.2" />
        </g>

        {/* Collar rim in the kit's second colour. */}
        <path
          d="M8 3c.8 1.4 2.3 2.3 4 2.3s3.2-.9 4-2.3"
          fill="none"
          stroke={secondary}
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <path
          d={FLAT_OUTLINE}
          fill="none"
          stroke={
            lightKit
              ? "color-mix(in oklab, var(--ui-ink-deep) 55%, transparent)"
              : "var(--ui-on-ink-plain)"
          }
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
      <FailureAwareImage
        src={imageUrl}
        alt={ariaLabel ?? ""}
        width={size}
        height={size}
        className={cn(
          "absolute inset-0 z-10 h-full w-full select-none object-contain",
          FLAT_DROP_SHADOW,
        )}
        draggable={false}
      />
    </span>
  );
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
