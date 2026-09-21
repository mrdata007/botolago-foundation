import { useState, type CSSProperties, type ImgHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string;
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
  decoding = "async",
  loading = "lazy",
  onFailed,
  ...props
}: ImageProps) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;

  return (
    <img
      {...props}
      src={src}
      decoding={decoding}
      loading={loading}
      onError={() => {
        setFailed(true);
        onFailed?.(src);
      }}
    />
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
}: {
  src?: string;
  alt: string;
  fallback: string;
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

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ background: fallback, ...style }}
      data-media-state={showPlaceholder ? "placeholder" : "image"}
    >
      {showPlaceholder ? placeholder : null}
      <FailureAwareImage
        src={src}
        alt={alt}
        loading={loading}
        fetchPriority={fetchPriority}
        onFailed={setFailedSrc}
        className={cn("absolute inset-0 h-full w-full object-cover", imageClassName)}
      />
    </div>
  );
}
