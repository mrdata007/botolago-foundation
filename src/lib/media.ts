export interface MediaLocation {
  readonly sourceUrl?: string | null;
  readonly storagePath?: string | null;
}

const STORAGE_BUCKETS = {
  football: "football-media",
  news: "news-media",
} as const;

function configuredSupabaseUrl(): string | undefined {
  return import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || undefined;
}

function validatedSourceUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function validatedSupabaseOrigin(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    const localHttp =
      url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !localHttp) || url.username || url.password) return undefined;
    if (url.pathname !== "/" || url.search || url.hash) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

function storageTarget(storagePath: string | null | undefined) {
  if (!storagePath || storagePath !== storagePath.trim() || storagePath.includes("\\")) {
    return undefined;
  }

  const segments = storagePath.split("/");
  const namespace = segments[0] as keyof typeof STORAGE_BUCKETS | undefined;
  if (
    !namespace ||
    !(namespace in STORAGE_BUCKETS) ||
    segments.length < 2 ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return undefined;
  }

  return {
    bucket: STORAGE_BUCKETS[namespace],
    path: segments.map((segment) => encodeURIComponent(segment)).join("/"),
  };
}

const OBJECT_ROUTE = "/storage/v1/object/public/";
const RENDER_ROUTE = "/storage/v1/render/image/public/";

/** Resolve validated editorial/provider media without requiring a Supabase client or API key. */
export function resolveMediaUrl(
  media: MediaLocation | null | undefined,
  supabaseUrl: string | null | undefined = configuredSupabaseUrl(),
): string | undefined {
  const sourceUrl = validatedSourceUrl(media?.sourceUrl);
  if (sourceUrl) return sourceUrl;

  const target = storageTarget(media?.storagePath);
  const origin = validatedSupabaseOrigin(supabaseUrl);
  if (!target || !origin) return undefined;

  return `${origin}${OBJECT_ROUTE}${target.bucket}/${target.path}`;
}

/**
 * The only widths, in pixels, each kind of picture is ever resized to.
 *
 * One short list per kind, rather than a size per call site, so every screen
 * that shows a crest shares the same few files in the browser and CDN caches.
 * The browser picks among them from the `sizes` the picture is drawn at.
 */
export const MEDIA_WIDTHS = {
  // Crests are drawn at 14-48 CSS px. 64 covers a 28px list crest on a 2x
  // screen, 96 the same crest on a 3x phone and the 48px match header on a 2x
  // one, 128 anything larger. All are under the smallest stored original
  // (150px), so a crest is never enlarged.
  crest: [64, 96, 128],
  // Editorial photos, from the 56px compact thumbnail to the 640px reading
  // column on a 2x screen.
  photo: [160, 320, 480, 640, 960, 1280],
} as const;

/**
 * What a picture is and how it is drawn.
 *
 * A crest keeps its whole shape inside a square. A photo is cut to the shape
 * of the box it fills (`ratio`, width / height), the same centred crop
 * `object-cover` makes, so no pixels are sent that the box then hides. The
 * image service needs both sides for that: asked for a width alone it keeps
 * the original height and returns a narrow slice of the photo.
 */
export type MediaFrame =
  | { readonly kind: "crest"; readonly sizes: string }
  | {
      readonly kind: "photo";
      readonly sizes: string;
      readonly ratio: number;
      /**
       * The box's width / height from Tailwind's `sm` breakpoint up, when its
       * aspect class changes there (`aspect-[4/3] sm:aspect-[16/10]`). That
       * shape gets its own cut: a copy cut for one shape and cropped again to
       * another shows a zoomed-in part of the photo, not what the box framed.
       */
      readonly smRatio?: number;
    };

/** Tailwind's default `sm` breakpoint, where cards change shape. */
const SM_MEDIA = "(min-width: 640px)";

/**
 * `sizes` for a picture as wide as the reading column. `UiScreen` caps the
 * column at 672px *including* its 16px gutters, so a full-width photo is 640px
 * on a wide screen and the viewport less both gutters on a phone.
 */
export const READING_COLUMN_SIZES = "(min-width: 672px) 640px, calc(100vw - 32px)";

function resizeQuery(frame: MediaFrame, width: number): string {
  if (frame.kind === "crest") return `width=${width}&height=${width}&resize=contain`;
  return `width=${width}&height=${Math.round(width / frame.ratio)}&resize=cover`;
}

/**
 * The object path of `url` if it is one of our own public Storage objects on
 * the configured project, as `resolveMediaUrl` builds them. Anything else --
 * a remote source, another host -- is not ours to resize.
 */
function ownObjectPath(url: string, origin: string): string | undefined {
  const prefix = `${origin}${OBJECT_ROUTE}`;
  if (!url.startsWith(prefix)) return undefined;
  const objectPath = url.slice(prefix.length);
  const segments = objectPath.split("/");
  const buckets: readonly string[] = Object.values(STORAGE_BUCKETS);
  if (!buckets.includes(segments[0] ?? "") || segments.length < 2) return undefined;
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return undefined;
  }
  if (/[?#\s,]/.test(objectPath)) return undefined;
  return objectPath;
}

export interface ResponsiveMediaSource {
  readonly media: string;
  readonly srcSet: string;
  readonly sizes: string;
}

export interface ResponsiveMedia {
  readonly src?: string;
  readonly srcSet?: string;
  readonly sizes?: string;
  /** Cuts for wider screens, as `<source>`s ahead of the `<img>` in a `<picture>`. */
  readonly sources?: readonly ResponsiveMediaSource[];
}

/**
 * `src`, `srcSet` and `sizes` for a picture drawn as `frame` describes.
 *
 * `srcSet` lists resized copies from Supabase's image service, which also
 * sends WebP to browsers that accept it. `src` stays the original file: a
 * browser that reads `srcset` never downloads it while the copies load, and
 * `FailureAwareImage` falls back to it if they do not -- so with the image
 * service switched off a picture costs more bytes, never disappears.
 *
 * A URL that is not one of our own Storage objects cannot be resized and comes
 * back as a plain `src`.
 */
export function responsiveMedia(
  url: string | null | undefined,
  frame: MediaFrame,
  supabaseUrl: string | null | undefined = configuredSupabaseUrl(),
): ResponsiveMedia {
  if (!url) return {};
  const origin = validatedSupabaseOrigin(supabaseUrl);
  const objectPath = origin ? ownObjectPath(url, origin) : undefined;
  if (!origin || !objectPath) return { src: url };

  const cuts = (shape: MediaFrame) =>
    MEDIA_WIDTHS[shape.kind]
      .map(
        (width) => `${origin}${RENDER_ROUTE}${objectPath}?${resizeQuery(shape, width)} ${width}w`,
      )
      .join(", ");
  const sources =
    frame.kind === "photo" && frame.smRatio !== undefined
      ? [{ media: SM_MEDIA, srcSet: cuts({ ...frame, ratio: frame.smRatio }), sizes: frame.sizes }]
      : undefined;
  return { src: url, srcSet: cuts(frame), sizes: frame.sizes, ...(sources && { sources }) };
}
