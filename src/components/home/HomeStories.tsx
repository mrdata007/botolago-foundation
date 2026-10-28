import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { homeStoriesQuery } from "./home-stories-query";
import type { HomeStory } from "@/backend/home-stories/contracts";
import { getNewsDataMode } from "@/services/news";
import { FailureAwareImage } from "@/components/common/FailureAwareImage";
import { responsiveMedia, resolveMediaUrl } from "@/lib/media";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * The full-screen viewer opens on a tap, so its code is not part of the page's
 * first load: it is fetched once the rail is on screen and the browser is idle,
 * and at the latest on the first touch of a story, so the tap that opens it has
 * (nearly) nothing left to wait for.
 */
const loadStoryViewer = () => import("./StoryViewer").then((m) => ({ default: m.StoryViewer }));
const StoryViewer = lazy(loadStoryViewer);
const warmStoryViewer = () => void loadStoryViewer().catch(() => undefined);

/** Published news images only. An empty feed does not become navigation. */
export function HomeStories() {
  const stories = useQuery({
    ...homeStoriesQuery,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: false,
  });
  if (stories.data?.length) return <PublishedStories stories={stories.data} />;
  // Home's server render carries the rail (`warmHomeStories`), so an empty or
  // failed feed renders nothing from the first paint and nothing moves. When
  // that warm-up missed (slow read), the rail is read in the browser and lands
  // above the band; this box, the size of the rail it becomes, keeps the page
  // from dropping by its height when it arrives (the largest layout shift on
  // Home). The `home-stories` marker is the one Home's own spacing keys on, so
  // the page's padding does not change either.
  if (stories.isPending && getNewsDataMode() === "supabase") return <StoriesReserve />;
  return null;
}

/**
 * An empty, hidden box with the rail's own height: the section's `py-4`, the
 * row's `p-1` and one story (the ring at 1.6 times the tap target, 1.8 from
 * `sm`, a 4px gap and the 16px label line), from the same tokens
 * `PublishedStories` uses.
 */
function StoriesReserve() {
  return (
    <section aria-hidden data-testid="home-stories" data-pending className="min-w-0 py-4">
      <div className="p-1">
        <div className="h-[calc(var(--ui-tap-min)*1.6+20px)] sm:h-[calc(var(--ui-tap-min)*1.8+20px)]" />
      </div>
    </section>
  );
}

export function PublishedStories({ stories }: { stories: readonly HomeStory[] }) {
  const { lang, t } = useI18n();
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [view, setView] = useState<{ items: readonly HomeStory[]; index: number } | null>(null);
  const hasStories = stories.length > 0;
  useEffect(() => {
    if (!hasStories) return;
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(warmStoryViewer, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(warmStoryViewer, 1500);
    return () => window.clearTimeout(id);
  }, [hasStories]);
  if (!hasStories) return null;
  return (
    <>
      <section
        aria-label={t("home.highlights")}
        data-testid="home-stories"
        className="min-w-0 py-4"
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
                onFocus={(event) => {
                  event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
                  warmStoryViewer();
                }}
                onPointerDown={warmStoryViewer}
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
        <Suspense fallback={null}>
          <StoryViewer
            stories={view.items}
            index={view.index}
            onIndexChange={(index) => setView({ ...view, index })}
            onClose={() => setView(null)}
            restoreFocus={() => trigger.current?.focus()}
          />
        </Suspense>
      )}
    </>
  );
}
