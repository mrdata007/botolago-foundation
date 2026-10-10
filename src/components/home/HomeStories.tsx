import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { homeStoriesRepository } from "@/backend/home-stories/repository";
import type { HomeStory } from "@/backend/home-stories/contracts";
import { getNewsDataMode } from "@/services/news";
import { FailureAwareImage } from "@/components/common/FailureAwareImage";
import { responsiveMedia, resolveMediaUrl } from "@/lib/media";
import { StoryViewer } from "./StoryViewer";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/** Published news images only. An empty feed does not become navigation. */
export function HomeStories() {
  const stories = useQuery({
    queryKey: ["home-stories"],
    queryFn: () =>
      getNewsDataMode() === "supabase" ? homeStoriesRepository.list() : Promise.resolve([]),
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: false,
  });
  return stories.data?.length ? <PublishedStories stories={stories.data} /> : null;
}

export function PublishedStories({ stories }: { stories: readonly HomeStory[] }) {
  const { lang, t } = useI18n();
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [view, setView] = useState<{ items: readonly HomeStory[]; index: number } | null>(null);
  if (stories.length === 0) return null;
  return (
    <>
      <section
        aria-label={t("home.highlights")}
        data-testid="home-stories"
        className="min-w-0 pb-3 pt-2 sm:pb-4 sm:pt-3"
      >
        <ul
          data-swipe-row
          className="flex snap-x snap-mandatory gap-1 overflow-x-auto overscroll-x-contain scroll-p-1 p-1 sm:gap-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {stories.map((story, index) => (
            <li key={story.id} className="w-20 shrink-0 snap-start sm:w-[5.5rem]">
              <button
                type="button"
                aria-haspopup="dialog"
                aria-label={lang === "ar" ? story.titleAr : story.titleFr}
                onFocus={(event) =>
                  event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })
                }
                onClick={(event) => {
                  trigger.current = event.currentTarget;
                  setView({ items: stories, index });
                }}
                className={cn(
                  "group flex min-h-[var(--ui-tap-min)] w-full flex-col items-center gap-1 rounded-[var(--ui-radius-card)]",
                  ui.focus,
                  ui.tone.default,
                )}
              >
                <span className="block size-[calc(var(--ui-tap-min)*1.6)] sm:size-[calc(var(--ui-tap-min)*1.8)] shrink-0 rounded-full bg-[image:var(--ui-grad-action)] p-1">
                  <span className="block size-full rounded-full bg-[color:var(--ui-page)] p-1">
                    <FailureAwareImage
                      {...responsiveMedia(resolveMediaUrl({ storagePath: story.storagePath }), {
                        kind: "photo",
                        ratio: 1,
                        sizes: "80px",
                      })}
                      alt=""
                      width={80}
                      height={80}
                      className="size-full rounded-full object-cover"
                      draggable={false}
                    />
                  </span>
                </span>
                <span
                  className={cn(
                    ui.text.micro,
                    "block w-full truncate text-center leading-4 [font-weight:var(--ui-weight-heavy)] group-hover:underline",
                  )}
                >
                  <bdi dir={story.generated ? "ltr" : undefined}>
                    {story.generated
                      ? story.railLabel === "ACTU" || !story.railLabel
                        ? lang === "ar"
                          ? "أخبار"
                          : "Actu"
                        : story.railLabel
                      : lang === "ar"
                        ? story.titleAr
                        : story.titleFr}
                  </bdi>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {view && (
        <StoryViewer
          stories={view.items}
          index={view.index}
          onIndexChange={(index) => setView({ ...view, index })}
          onClose={() => setView(null)}
          restoreFocus={() => trigger.current?.focus()}
        />
      )}
    </>
  );
}
