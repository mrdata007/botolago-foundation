import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff, X } from "lucide-react";
import type { HomeStory } from "@/backend/home-stories/contracts";
import { ui, UiButton, UiIconButton, UiSheet } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { FailureAwareImage } from "@/components/common/FailureAwareImage";
import { responsiveMedia, resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";
import { useDarkStatusBand } from "@/lib/system-bars";

function StoryFrame({
  story,
  ar,
  onSwipe,
}: {
  story: HomeStory;
  ar: boolean;
  onSwipe: (delta: number) => void;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const figure = useRef<HTMLElement>(null);
  const caption = useRef<HTMLElement>(null);
  // Match the space above the image to its caption below, so the image stays
  // centered even when the localized headline wraps or the phone rotates.
  // The grid bounds that spacer to preserve a 10rem image on short screens;
  // exceptionally long captions can scroll without an initial blank gap.
  useLayoutEffect(() => {
    const element = caption.current;
    if (!element) return;
    const measure = () =>
      figure.current?.style.setProperty("--story-caption-height", `${element.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <figure
      ref={figure}
      data-testid="story-viewer"
      className={cn(
        "mx-auto grid h-full min-h-full w-full grid-rows-[min(var(--story-caption-height,5rem),max(0px,calc(100%_-_var(--story-caption-height,5rem)_-_10rem)))_minmax(10rem,1fr)_auto]",
        ui.surface.inkPlain,
        ui.tone.onInkPlain,
      )}
    >
      <div aria-hidden="true" />
      <div
        data-testid="story-image-stage"
        className="relative min-h-40 touch-pan-y"
        onPointerDown={(e) => {
          if (e.isPrimary) start.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerCancel={() => {
          start.current = null;
        }}
        onPointerUp={(e) => {
          const origin = start.current;
          start.current = null;
          if (!origin) return;
          const dx = e.clientX - origin.x,
            dy = e.clientY - origin.y;
          if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.3)
            onSwipe((dx < 0 ? 1 : -1) * (ar ? -1 : 1));
        }}
      >
        <FailureAwareImage
          {...(story.generated
            ? responsiveMedia(resolveMediaUrl({ storagePath: story.storagePath }), {
                kind: "photo",
                ratio: 2 / 3,
                sizes: "(min-width: 448px) 448px, 100vw",
              })
            : { src: resolveMediaUrl({ storagePath: story.storagePath }) })}
          loading="eager"
          alt={
            story.generated ? (ar ? story.titleAr : story.titleFr) : ar ? story.altAr : story.altFr
          }
          className="absolute inset-0 size-full object-contain"
          draggable={false}
          onLoad={() => setStatus("ready")}
          onFailed={() => setStatus("error")}
        />
        {status !== "ready" && (
          <div
            role="status"
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center",
              ui.surface.inkPlain,
              ui.text.meta,
            )}
          >
            {status === "error" && <ImageOff aria-hidden className="size-6" />}
            {status === "error"
              ? ar
                ? "تعذّر تحميل الصورة"
                : "Impossible de charger le visuel"
              : ar
                ? "جارٍ تحميل الصورة…"
                : "Chargement du visuel…"}
          </div>
        )}
      </div>
      <figcaption
        ref={caption}
        className="space-y-2 break-words px-4 py-3 text-center sm:px-6 sm:py-4"
      >
        <p
          className={cn(ui.text.section, "break-words")}
          data-testid="story-headline"
          aria-live="polite"
        >
          {ar ? story.titleAr : story.titleFr}
        </p>
        {!story.generated && story.credit ? (
          <p className={cn(ui.text.meta, ui.tone.onInkMuted)}>{story.credit}</p>
        ) : null}
      </figcaption>
    </figure>
  );
}

export function StoryViewer({
  stories,
  index,
  onIndexChange,
  onClose,
  restoreFocus,
}: {
  stories: readonly HomeStory[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  useDarkStatusBand();
  const { lang, t } = useI18n();
  const ar = lang === "ar";
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        !["ArrowLeft", "ArrowRight"].includes(event.key)
      )
        return;
      event.preventDefault();
      const delta = (event.key === "ArrowRight" ? 1 : -1) * (ar ? -1 : 1);
      const next = index + delta;
      if (next >= 0 && next < stories.length) onIndexChange(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ar, index, onIndexChange, stories.length]);
  const story = stories[index];
  if (!story) return null;
  const move = (delta: number) => {
    const next = index + delta;
    if (next >= 0 && next < stories.length) onIndexChange(next);
  };
  return (
    <UiSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={ar ? story.titleAr : story.titleFr}
      description={ar ? "قصة مصورة" : "Story en images"}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        restoreFocus();
      }}
      className="h-[100dvh] max-h-[100dvh] rounded-none sm:max-w-[28rem] sm:rounded-t-[var(--ui-radius-sheet)]"
      header={
        <div
          className={cn(
            "flex shrink-0 items-center justify-end px-4 pb-2 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]",
            ui.surface.inkPlain,
            ui.tone.onInkPlain,
          )}
        >
          <UiIconButton variant="glass" aria-label={t("fpl.close")} onClick={onClose}>
            <X className="size-5" aria-hidden />
          </UiIconButton>
        </div>
      }
      footer={
        <div className="flex items-center justify-between gap-3">
          <UiButton variant="outline" size="sm" disabled={index === 0} onClick={() => move(-1)}>
            <ChevronLeft className="size-4" aria-hidden />
            {ar ? "السابق" : "Précédent"}
          </UiButton>
          <span className={ui.stat.sm} aria-live="polite">
            <bdi dir="ltr">
              {index + 1} / {stories.length}
            </bdi>
          </span>
          <UiButton
            variant="outline"
            size="sm"
            disabled={index === stories.length - 1}
            onClick={() => move(1)}
          >
            {ar ? "التالي" : "Suivant"}
            <ChevronRight className="size-4" aria-hidden />
          </UiButton>
        </div>
      }
    >
      <StoryFrame key={story.id} story={story} ar={ar} onSwipe={move} />
    </UiSheet>
  );
}
