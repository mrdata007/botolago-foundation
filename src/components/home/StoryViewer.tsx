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
        className={cn(
          "relative mx-auto flex min-h-full w-full max-w-[28rem] flex-col justify-end overflow-hidden",
          ui.surface.inkPlain,
        )}
        data-testid="story-viewer"
      >
        <img
          key={story.id}
          src={resolveMediaUrl({ storagePath: story.storagePath })}
          alt={ar ? story.altAr : story.altFr}
          className="absolute inset-0 size-full object-cover"
        />
        <figcaption
          className={cn(
            "relative mt-64 grid gap-3 p-5 sm:mt-80 sm:p-6",
            ui.surface.inkPlain,
            ui.tone.onInkPlain,
          )}
        >
          {story.generated && (
            <span className={cn(ui.text.meta, ui.tone.onInkMuted)}>
              {ar ? "صورة توضيحية بالذكاء الاصطناعي" : "Illustration générée par IA"}
            </span>
          )}
          <p className={cn(ui.display.section, "break-words")} data-testid="story-headline">
            {ar ? story.titleAr : story.titleFr}
          </p>
          {story.credit && <p className={cn(ui.text.meta, ui.tone.onInkMuted)}>{story.credit}</p>}
        </figcaption>
      </figure>
    </UiSheet>
  );
}
