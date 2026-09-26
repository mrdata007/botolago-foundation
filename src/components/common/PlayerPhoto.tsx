import { useState } from "react";

import type { Club } from "@/types/domain";
import { responsiveMedia } from "@/lib/media";
import { cn } from "@/lib/utils";
import { ui } from "@/components/ui-kit";
import { crestStyle } from "./club-crest-style";
import { FailureAwareImage } from "./FailureAwareImage";

export type PlayerPhotoSize = "xs" | "sm" | "md" | "lg" | "xl";

/**
 * Disc diameter. The first four match `ClubCrest`, so a photo and a crest
 * side by side in a row are the same size.
 *
 * xs 28 — chips, the compare strip
 * sm 32 — list rows and tables
 * md 40 — cards, the ranking row
 * lg 56 — a profile card
 * xl 96 — the player page hero
 */
const SIZE: Record<PlayerPhotoSize, string> = {
  xs: "h-7 w-7",
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-14 w-14",
  xl: "h-24 w-24",
};

/** The same diameters as `sizes`, for picking a resized copy of the photo. */
const PHOTO_SIZES: Record<PlayerPhotoSize, string> = {
  xs: "28px",
  sm: "32px",
  md: "40px",
  lg: "56px",
  xl: "96px",
};

/**
 * A player's photo, as a DISC, with a silhouette when there is no photo.
 *
 * Most Botola players have no photo we may show: provider images are for
 * internal use, and a licensed photo exists only once the club and the player
 * (or a guardian, under 18) have signed a release (`PEPITES_ARCHITECTURE.md`
 * §3.3). The read RPCs return `null` for everyone else, so the silhouette is
 * the common case, not an error state. It is also what shows when a photo URL
 * fails to load; `FailureAwareImage` removes the broken image and reports it.
 *
 * The silhouette is a head and shoulders in the player's club shirt: the
 * shirt is the club fill (`--ui-club`) outlined in the club edge (≥ 3:1), so a
 * white or yellow kit stays a shape on a light card; the head is the strong
 * rule grey, which reads in both themes; the ground is the club tint. With no
 * club, `data-club` without values paints the brand ink, as `ClubCrest` does.
 * No theme is read in React, so the server render is already correct.
 *
 * While a photo loads, the disc shows the plain tint rather than the
 * silhouette, so a cut-out photo with a transparent background never has a
 * silhouette showing through it.
 *
 * Decorative, like `ClubCrest`: the player's name is always printed beside
 * the photo, so the disc is hidden from assistive tech.
 */
export function PlayerPhoto({
  photoUrl,
  club,
  size = "md",
  className,
  loading,
}: {
  /** A photo we are licensed to show, or null (the silhouette). */
  photoUrl?: string | null;
  /** The club whose shirt the silhouette wears. */
  club?: Club;
  size?: PlayerPhotoSize;
  className?: string;
  /** `"eager"` for a photo in the first screen, which should not wait. */
  loading?: "eager" | "lazy";
}) {
  // Tracked as the failed URL rather than a boolean, as `MediaImage` does:
  // `FailureAwareImage` retries when the URL changes, so a stale `true` would
  // cover a photo that is in fact loading.
  const [failedSrc, setFailedSrc] = useState<string>();
  const src = photoUrl || undefined;
  const showSilhouette = !src || failedSrc === src;
  const photo = responsiveMedia(src, { kind: "photo", sizes: PHOTO_SIZES[size], ratio: 1 });
  const { style, "data-club": dataClub } = club ? crestStyle(club) : { style: undefined };

  return (
    <div
      data-club={dataClub ?? ""}
      data-photo-state={showSilhouette ? "silhouette" : "photo"}
      style={style}
      className={cn(
        "relative shrink-0 overflow-hidden",
        ui.radius.full,
        ui.club.tint,
        "ring-1 ring-inset ring-[color:var(--ui-rule)]",
        SIZE[size],
        className,
      )}
      aria-hidden
    >
      {showSilhouette ? <PlayerSilhouette /> : null}
      <FailureAwareImage
        src={photo.src}
        srcSet={photo.srcSet}
        sizes={photo.sizes}
        loading={loading}
        onFailed={setFailedSrc}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full select-none object-cover"
        draggable={false}
      />
    </div>
  );
}

/**
 * Head and shoulders on a 64 grid, symmetrical so it needs no mirroring in
 * Arabic. The neck runs down into the V of the collar, and the shirt is drawn
 * last so it covers the rest of it.
 */
const HEAD = { cx: 32, cy: 24, rx: 10.5, ry: 12 } as const;
const NECK = "M27.5 31h9v16h-9z";
const SHIRT = "M6 66c0-14 9-23 20-26l6 7 6-7c11 3 20 12 20 26z";
const COLLAR = "M26 40l6 7 6-7";

function PlayerSilhouette() {
  return (
    <svg
      viewBox="0 0 64 64"
      className="absolute inset-0 h-full w-full select-none"
      data-player-silhouette=""
    >
      <path d={NECK} fill="var(--ui-rule-strong)" />
      <ellipse {...HEAD} fill="var(--ui-rule-strong)" />
      <path
        d={SHIRT}
        fill="var(--ui-club)"
        stroke="var(--ui-club-edge)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d={COLLAR}
        fill="none"
        stroke="var(--ui-on-club)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
    </svg>
  );
}
