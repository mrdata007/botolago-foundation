import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, ImageOff, Pause, Play, X } from "lucide-react";
import type { HomeStory } from "@/backend/home-stories/contracts";
import { ui, UiIconButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { FailureAwareImage } from "@/components/common/FailureAwareImage";
import { responsiveMedia, resolveMediaUrl } from "@/lib/media";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useDarkStatusBand } from "@/lib/system-bars";

const STORY_DURATION = 7000;

function StoryFrame({
  story,
  stories,
  index,
  ar,
  paused,
  onPause,
  onRead,
  onMove,
  onClose,
}: {
  story: HomeStory;
  stories: readonly HomeStory[];
  index: number;
  ar: boolean;
  paused: boolean;
  onPause: () => void;
  onRead: () => void;
  onMove: (delta: number) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [held, setHeld] = useState(false);
  const [reading, setReading] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [inactive, setInactive] = useState(() => document.hidden);
  const progress = useRef<HTMLSpanElement>(null);
  const elapsed = useRef(0);
  const gesture = useRef<{ x: number; y: number; at: number } | null>(null);
  const suppressClick = useRef(false);
  const advance = useRef(onMove);
  useEffect(() => {
    advance.current = onMove;
  }, [onMove]);
  useEffect(() => {
    const hidden = () => setInactive(document.hidden || !document.hasFocus());
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("blur", hidden);
    window.addEventListener("focus", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("blur", hidden);
      window.removeEventListener("focus", hidden);
    };
  }, []);
  const stopped = paused || held || reading || hovering || inactive || status !== "ready";
  useEffect(() => {
    if (stopped) return;
    let previous = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      elapsed.current = Math.min(STORY_DURATION, elapsed.current + now - previous);
      previous = now;
      const fraction = elapsed.current / STORY_DURATION;
      if (progress.current) {
        progress.current.style.transform = `scaleX(${fraction})`;
        progress.current.parentElement?.setAttribute(
          "aria-valuenow",
          String(Math.round(fraction * 100)),
        );
      }
      if (fraction === 1) advance.current(1);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [stopped]);
  const source = resolveMediaUrl({ storagePath: story.storagePath });
  const media = story.generated
    ? responsiveMedia(source, {
        kind: "photo",
        ratio: 2 / 3,
        sizes: "(min-width: 640px) 448px, 100vw",
      })
    : { src: source };
  const headline = ar ? story.titleAr : story.titleFr;
  return (
    <figure
      data-testid="story-viewer"
      data-paused={stopped}
      className="relative size-full overflow-hidden bg-black text-white"
    >
      <div data-testid="story-image-stage" className="absolute inset-0 overflow-hidden">
        <FailureAwareImage
          {...media}
          alt=""
          aria-hidden
          loading="eager"
          className="absolute inset-0 size-full scale-110 object-cover opacity-40 blur-2xl"
        />
        <FailureAwareImage
          {...media}
          loading="eager"
          data-testid="story-photo"
          alt={story.generated ? headline : ar ? story.altAr : story.altFr}
          className="absolute inset-0 size-full object-contain"
          draggable={false}
          onLoad={() => setStatus("ready")}
          onFailed={() => setStatus("error")}
        />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/80 to-transparent"
      />
      {status !== "ready" && (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 p-6 text-center"
        >
          {status === "error" && <ImageOff aria-hidden className="size-8" />}
          <p className={ui.text.secondary}>
            {status === "error"
              ? ar
                ? "تعذّر تحميل الصورة"
                : "Impossible de charger le visuel"
              : ar
                ? "جارٍ تحميل الصورة…"
                : "Chargement du visuel…"}
          </p>
        </div>
      )}
      <div className="absolute inset-0 flex" dir="ltr">
        {[-1, 1].map((physical) => {
          const delta = physical * (ar ? -1 : 1);
          const Icon = physical === -1 ? ChevronLeft : ChevronRight;
          return (
            <button
              key={physical}
              type="button"
              data-testid={delta === -1 ? "story-previous" : "story-next"}
              aria-label={delta === -1 ? (ar ? "السابق" : "Précédent") : ar ? "التالي" : "Suivant"}
              aria-disabled={delta === -1 && index === 0}
              className={cn(
                "group flex h-full w-1/2 touch-none items-center p-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white",
                physical === 1 && "justify-end",
              )}
              onPointerDown={(event) => {
                if (!event.isPrimary || event.button !== 0) return;
                gesture.current = { x: event.clientX, y: event.clientY, at: performance.now() };
                suppressClick.current = false;
                event.currentTarget.setPointerCapture(event.pointerId);
                setHeld(true);
              }}
              onPointerUp={(event) => {
                const start = gesture.current;
                gesture.current = null;
                setHeld(false);
                if (!start) return;
                const dx = event.clientX - start.x,
                  dy = event.clientY - start.y;
                const swipe = Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.3;
                const dismiss = dy >= 64 && dy > Math.abs(dx) * 1.3;
                suppressClick.current =
                  swipe ||
                  dismiss ||
                  performance.now() - start.at >= 180 ||
                  Math.hypot(dx, dy) > 12;
                if (dismiss) onClose();
                else if (swipe) onMove((dx < 0 ? 1 : -1) * (ar ? -1 : 1));
              }}
              onPointerCancel={() => {
                gesture.current = null;
                suppressClick.current = true;
                setHeld(false);
              }}
              onLostPointerCapture={() => {
                gesture.current = null;
                setHeld(false);
              }}
              onClick={(event) => {
                if (event.detail !== 0 && suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                suppressClick.current = false;
                onMove(delta);
              }}
            >
              <Icon
                aria-hidden
                className="hidden size-8 rounded-full bg-black/30 p-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 sm:block"
              />
            </button>
          );
        })}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 px-3 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)]">
        <div className="flex gap-1" aria-label={ar ? "تقدم القصص" : "Progression des stories"}>
          {stories.map((item, position) => (
            <div
              key={item.id}
              className="h-[3px] min-w-0 flex-1 overflow-hidden rounded-full bg-white/30"
              role={position === index ? "progressbar" : undefined}
              aria-label={position === index ? headline : undefined}
              aria-valuemin={position === index ? 0 : undefined}
              aria-valuemax={position === index ? 100 : undefined}
              aria-valuenow={position === index ? 0 : undefined}
            >
              <span
                ref={position === index ? progress : undefined}
                className={cn("block size-full bg-white", ar ? "origin-right" : "origin-left")}
                style={{ transform: `scaleX(${position < index ? 1 : 0})` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[image:var(--ui-grad-action)] text-sm font-black text-[color:var(--ui-ink-deep)]"
          >
            B
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">BotolaGO</p>
            <p className="text-xs text-white/75">
              <bdi>
                {index + 1} / {stories.length}
              </bdi>
            </p>
          </div>
          <UiIconButton
            variant="glass"
            className="pointer-events-auto text-white"
            aria-label={paused ? (ar ? "تشغيل" : "Lire") : ar ? "إيقاف مؤقت" : "Pause"}
            onClick={onPause}
          >
            {paused ? (
              <Play aria-hidden className="size-5" />
            ) : (
              <Pause aria-hidden className="size-5" />
            )}
          </UiIconButton>
          <UiIconButton
            variant="glass"
            className="pointer-events-auto text-white"
            aria-label={t("fpl.close")}
            onClick={onClose}
          >
            <X aria-hidden className="size-5" />
          </UiIconButton>
        </div>
      </div>
      <figcaption className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black via-black/85 to-transparent px-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-16 sm:px-6">
        <div
          tabIndex={0}
          className={cn("max-h-[30dvh] overflow-y-auto break-words rounded-sm", ui.focus)}
          onFocus={() => setReading(true)}
          onBlur={() => setReading(false)}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          onPointerDown={onRead}
        >
          <p
            data-testid="story-headline"
            className="text-xl font-extrabold leading-snug sm:text-2xl"
          >
            {headline}
          </p>
          {!story.generated && story.credit && (
            <p className="mt-2 text-xs leading-relaxed text-white/75">{story.credit}</p>
          )}
        </div>
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
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [paused, setPaused] = useState(prefersReducedMotion);
  const content = useRef<HTMLDivElement>(null);
  const move = (delta: number) => {
    const next = index + delta;
    if (next >= stories.length) onClose();
    else if (next >= 0) onIndexChange(next);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "Tab") setPaused(true);
      if (event.key === " " && event.target === content.current) {
        event.preventDefault();
        setPaused((value) => !value);
      }
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const delta = (event.key === "ArrowRight" ? 1 : -1) * (ar ? -1 : 1);
      const next = index + delta;
      if (next >= stories.length) onClose();
      else if (next >= 0) onIndexChange(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ar, index, stories.length, onIndexChange, onClose]);
  const story = stories[index];
  if (!story) return null;
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/95" />
        <Dialog.Content
          ref={content}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            content.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocus();
          }}
          className="fixed inset-0 z-50 m-auto h-[100dvh] w-full overflow-hidden bg-black outline-none sm:h-[calc(100dvh-2rem)] sm:w-[min(28rem,56.25dvh)] sm:rounded-2xl"
        >
          <Dialog.Title className="sr-only">{ar ? story.titleAr : story.titleFr}</Dialog.Title>
          <p
            className="sr-only"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            data-testid="story-announcement"
          >
            {index + 1} / {stories.length}. {ar ? story.titleAr : story.titleFr}
          </p>
          <StoryFrame
            key={story.id}
            story={story}
            stories={stories}
            index={index}
            ar={ar}
            paused={paused}
            onPause={() => setPaused((value) => !value)}
            onRead={() => setPaused(true)}
            onMove={move}
            onClose={onClose}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
