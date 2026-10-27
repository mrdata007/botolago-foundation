/**
 * Share-picture tags for pages whose own picture is a club crest (a club page,
 * a match page). Pure, so the rule is tested on its own.
 *
 * Link previews need an absolute https raster: WhatsApp, Facebook and X do not
 * draw SVG. A crest that is not one (none stored yet, a vector file, a local
 * URL) gives no tags, and the root's generic picture (`/og-image.jpg`, with its
 * own size and alt) stands.
 *
 * No `og:image:width` / `og:image:height` here, on purpose: a crest's size is
 * not recorded, and a wrong size is worse than none. The router merges heads
 * tag by tag, so the root's 1200x630 pair still comes out; see
 * `docs/seo/SHARE_IMAGES.md`.
 */
import { usableImageUrl } from "@/lib/image-fallback";

const VECTOR_OR_NON_RASTER = /\.(svg|svgz|gif|ico)(?:$|[?#])/i;

/** The crest's URL when it can stand as a share picture, else undefined. */
export function rasterShareImageUrl(src: string | null | undefined): string | undefined {
  const url = usableImageUrl(src);
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return undefined;
    if (VECTOR_OR_NON_RASTER.test(parsed.pathname)) return undefined;
    return parsed.href;
  } catch {
    return undefined;
  }
}

export interface CrestShareMeta {
  readonly property?: string;
  readonly name?: string;
  readonly content: string;
}

/**
 * `og:image`, `og:image:alt` and `twitter:image` for a crest, or nothing.
 * `twitter:card` is the page's own (`summary`, the square card, suits a crest).
 */
export function crestShareMeta(crestUrl: string | null | undefined, alt: string): CrestShareMeta[] {
  const url = rasterShareImageUrl(crestUrl);
  if (!url) return [];
  return [
    { property: "og:image", content: url },
    { property: "og:image:alt", content: alt },
    { name: "twitter:image", content: url },
    { name: "twitter:image:alt", content: alt },
  ];
}
