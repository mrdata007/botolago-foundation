import stadiumBand from "@/assets/brand/home-band-stadium.webp";
import stadiumBandSmall from "@/assets/brand/home-band-stadium-800.webp";
import { cn } from "@/lib/utils";

/**
 * The stands under floodlights (`home-band-stadium`, 800w and 1600w) as the
 * photograph of a dark band: behind everything in its band (which must be
 * `relative isolate`), covering it, hidden from assistive tech.
 *
 * Mirrored in Arabic, as Home's band, the matches date strip and
 * `PhotoPageHeader` mirror theirs: the photo's calm side then stays on the
 * inline-start side, under the content and the club edge, in both
 * languages. A photo is not an icon, so this is the one place a component
 * flips its own image (styles.css flips directional icons for every screen).
 *
 * `sizes` is the width the photo is DRAWN at, not the band's: under
 * `object-cover` the 8:3 photo is drawn at its height × 8/3 when the band is
 * taller than that, so a near-square phone band draws it about 2.7 times its
 * own width. Above the fold on every page that uses it, so fetched first.
 */
export function StadiumBandPhoto({ sizes, className }: { sizes: string; className?: string }) {
  return (
    <img
      src={stadiumBand}
      srcSet={`${stadiumBandSmall} 800w, ${stadiumBand} 1600w`}
      sizes={sizes}
      alt=""
      aria-hidden
      decoding="async"
      fetchPriority="high"
      className={cn(
        "absolute inset-0 -z-10 h-full w-full object-cover rtl:-scale-x-100",
        className,
      )}
    />
  );
}
