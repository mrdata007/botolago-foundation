import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff, X } from "lucide-react";
import type { HomeStory } from "@/backend/home-stories/contracts";
import { ui, UiButton, UiIconButton, UiSheet } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { FailureAwareImage } from "@/components/common/FailureAwareImage";
import { responsiveMedia, resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

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
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <figure
      data-testid="story-viewer"
      className={cn(
        "mx-auto flex h-full min-h-full w-full flex-col",
        ui.surface.inkPlain,
        ui.tone.onInkPlain,
      )}
    >
      <div
        data-testid="story-image-stage"
        className="relative min-h-[var(--ui-tap-min)] flex-1 touch-pan-y"
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
          alt={ar ? story.altAr : story.altFr}
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
      <figcaption className="shrink-0 space-y-2 px-4 py-3 sm:px-6 sm:py-4">
        <p
          className={cn(ui.text.section, "break-words")}
          data-testid="story-headline"
          aria-live="polite"
        >
          {ar ? story.titleAr : story.titleFr}
        </p>
        {story.generated ? (
          <p className={cn(ui.text.meta, ui.tone.onInkMuted)}>
            {ar ? "صورة توضيحية بالذكاء الاصطناعي" : "Illustration IA"}
          </p>
        ) : story.credit ? (
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
            "flex shrink-0 items-center justify-between gap-3 px-4 pb-2",
            ui.safe.top,
            ui.surface.inkPlain,
            ui.tone.onInkPlain,
          )}
        >
          <span className={ui.text.subtitle}>{ar ? "آخر الأخبار" : "À la une"}</span>
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
