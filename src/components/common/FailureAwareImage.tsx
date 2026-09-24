import { useState, type CSSProperties, type ImgHTMLAttributes, type ReactNode } from "react";
import { responsiveMedia, type PhotoFrame, type ResponsiveMediaSource } from "@/lib/media";
import { cn } from "@/lib/utils";

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string;
  /** Wider-screen cuts of `src`, tried ahead of `srcSet` (see `responsiveMedia`). */
  sources?: readonly ResponsiveMediaSource[];
  /**
   * Called once when this attempt's `src` fails to load. The component already
   * removes the broken image from layout on its own; this reports the same
   * event outward so a caller can put something deliberate in the gap
   * (BG-0076) instead of inventing a second failure mechanism beside it.
   */
  onFailed?: (src: string) => void;
};

function ImageAttempt({
  src,
  srcSet,
  sizes,
  sources,
  decoding = "async",
  loading = "lazy",
  onFailed,
  ...props
}: ImageProps) {
  const [failed, setFailed] = useState(false);
  // `srcSet` holds resized copies of `src` (see `responsiveMedia`). If they
  // fail -- the image service is off in this environment -- the next try drops
  // them and loads `src` itself, and only that failing removes the picture.
  const [copiesFailed, setCopiesFailed] = useState(false);

  if (!src || failed) return null;
  const useCopies = srcSet !== undefined && !copiesFailed;

  const image = (
    <img
      {...props}
      src={src}
      srcSet={useCopies ? srcSet : undefined}
      sizes={useCopies ? sizes : undefined}
      decoding={decoding}
      loading={loading}
      onError={() => {
        if (useCopies) {
          setCopiesFailed(true);
          return;
        }
        setFailed(true);
        onFailed?.(src);
      }}
    />
  );
  if (!useCopies || !sources?.length) return image;

  // `contents`: the `<picture>` adds no box, so the image still sizes and
  // positions itself against the same parent as a bare `<img>` would.
  return (
    <picture className="contents">
      {sources.map((source) => (
        <source
          key={source.media}
          media={source.media}
          srcSet={source.srcSet}
          sizes={source.sizes}
        />
      ))}
      {image}
    </picture>
  );
}

/** Removes a failed image from layout and starts a fresh attempt whenever its URL changes. */
export function FailureAwareImage(props: ImageProps) {
  return <ImageAttempt key={props.src} {...props} />;
}

export function MediaImage({
  src,
  alt,
  fallback,
  placeholder,
  className,
  imageClassName,
  style,
  loading,
  fetchPriority,
  frame,
}: {
  src?: string;
  alt: string;
  fallback: string;
  /**
   * How the box is drawn: its width as a `sizes` value (`"88px"`,
   * `READING_COLUMN_SIZES`) and its shape, width / height, which must match
   * the box as drawn -- `smRatio` and `mdRatio` too when that shape changes
   * at `sm:` or `md:`. With it the photo is fetched as the resized WebP copy
   * that fits; without it, as the original file.
   */
  frame?: PhotoFrame;
  /**
   * Rendered inside this box, behind the photo, whenever there is no `src` or
   * the `src` that was given failed to load. It must position itself
   * (`absolute inset-0`) so the box keeps the aspect ratio `className` sets
   * and no variant of the card shifts. Without one the box shows `fallback`
   * alone, which is the previous behaviour.
   */
  placeholder?: ReactNode;
  className?: string;
  imageClassName?: string;
  style?: CSSProperties;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
}) {
  // Tracked as the failed URL rather than a boolean: `FailureAwareImage`
  // re-keys on `src` and retries when the URL changes, so a stale `true` here
  // would hide a hero that is in fact loading.
  const [failedSrc, setFailedSrc] = useState<string>();
  const showPlaceholder = !src || failedSrc === src;
  const photo = frame ? responsiveMedia(src, { kind: "photo", ...frame }) : {};

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ background: fallback, ...style }}
      data-media-state={showPlaceholder ? "placeholder" : "image"}
    >
      {showPlaceholder ? placeholder : null}
      <FailureAwareImage
        src={src}
        srcSet={photo.srcSet}
        sizes={photo.sizes}
        sources={photo.sources}
        alt={alt}
        loading={loading}
        fetchPriority={fetchPriority}
        onFailed={setFailedSrc}
        className={cn("absolute inset-0 h-full w-full object-cover", imageClassName)}
      />
    </div>
  );
}
