import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { HomeStory } from "@/backend/home-stories/contracts";
import { ui, UiButton, UiSheet } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

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
  const { lang } = useI18n();
  const ar = lang === "ar";
  const story = stories[index];
  if (!story) return null;
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
      className="h-[100dvh] max-h-[100dvh] rounded-none sm:max-w-[var(--ui-column-max)] sm:rounded-t-[var(--ui-radius-sheet)]"
      footer={
        <div className="grid gap-3">
          {story.destination && (
            <Link
              to={story.destination}
              onClick={onClose}
              className={cn(
                "flex min-h-[var(--ui-tap-min)] items-center justify-center",
                ui.surface.selected,
                ui.radius.full,
                ui.text.bodyStrong,
                ui.focus,
              )}
            >
              {ar ? "اكتشف المزيد" : "En savoir plus"}
            </Link>
          )}
          <div className="flex items-center justify-between gap-3">
            <UiButton
              variant="outline"
              size="sm"
              disabled={index === 0}
              onClick={() => onIndexChange(index - 1)}
            >
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
              onClick={() => onIndexChange(index + 1)}
            >
              {ar ? "التالي" : "Suivant"}
              <ChevronRight className="size-4" aria-hidden />
            </UiButton>
          </div>
        </div>
      }
    >
      <figure
        className={cn("flex min-h-full flex-col justify-center gap-3 p-3", ui.surface.inkPlain)}
        data-testid="story-viewer"
      >
        <img
          key={story.id}
          src={resolveMediaUrl({ storagePath: story.storagePath })}
          alt={ar ? story.altAr : story.altFr}
          className="mx-auto max-h-[70dvh] w-full object-contain"
        />
        {story.credit && (
          <figcaption className={cn("text-center", ui.text.meta, ui.tone.onInkMuted)}>
            {story.credit}
          </figcaption>
        )}
      </figure>
    </UiSheet>
  );
}
