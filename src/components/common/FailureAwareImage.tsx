import { useState, type CSSProperties, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string;
};

function ImageAttempt({ src, decoding = "async", loading = "lazy", ...props }: ImageProps) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;

  return (
    <img
      {...props}
      src={src}
      decoding={decoding}
      loading={loading}
      onError={() => setFailed(true)}
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
  className,
  imageClassName,
  style,
  loading,
  fetchPriority,
}: {
  src?: string;
  alt: string;
  fallback: string;
  className?: string;
  imageClassName?: string;
  style?: CSSProperties;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
}) {
  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ background: fallback, ...style }}
    >
      <FailureAwareImage
        src={src}
        alt={alt}
        loading={loading}
        fetchPriority={fetchPriority}
        className={cn("absolute inset-0 h-full w-full object-cover", imageClassName)}
      />
    </div>
  );
}
