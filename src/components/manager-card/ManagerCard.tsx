import { useEffect, useMemo, useRef, useState } from "react";

import { UiSkeleton, ui } from "@/components/ui-kit";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { activeRenderer } from "./active-renderer";
import { cardLabel, useCardStrings } from "./copy";
import { cachedRender, widthBucket } from "./render-cache";
import { newIdScope, scopeSvgIds } from "./scope-ids";
import { useCardRenderer, useCardTheme } from "./use-card-renderer";
import type { BeatName, CardProfile } from "./types";

/**
 * The full card, client-only (plan section 6.5). The server and the first client render draw a
 * box that already has the card's shape (`activeRenderer.estimateAspect`) holding a skeleton and
 * a visually hidden sentence with the card's label; once the renderer's chunk has loaded the box
 * takes its exact markup. The rating line around a card is ordinary DOM, so the number is on
 * screen the moment the data is, before this chunk arrives.
 *
 * The markup is inserted with `dangerouslySetInnerHTML` and is the renderer's output and nothing
 * else: the renderer builds every attribute and text node through one escape, and the unit tests
 * feed it hostile names (`markup-safety.ts`).
 *
 * Ids inside the markup are made unique per mounted card (`scope-ids.ts`), since the cached markup
 * is shared. `sway` lets the renderer's pointer behaviour (`mount`) run on this card: Gradins'
 * home and card page ask for it, the sheets and panels do not. The box takes the markup's own
 * shape once it is in, so a card whose height changes (a forming card gaining its season stripes)
 * is never locked to the estimate it was reserved with.
 *
 * `beat` is passed to the renderer only when the reader has not asked for less motion, the page
 * is visible and the renderer supports it, and it is dropped after `renderer.beatMs(beat) + 50`
 * ms, so a later re-render does not replay it. Drop the prop and pass it again to replay.
 */
export function ManagerCard({
  profile,
  width,
  beat,
  className,
  testId,
  sway = false,
}: {
  profile: CardProfile;
  /** CSS px. */
  width: number;
  beat?: BeatName;
  className?: string;
  /** Set on the stage: `data-testid`, and `data-mc-ready="1"` once the card is in the page. */
  testId?: string;
  /** Let the renderer's pointer behaviour (the scarf's sway on a mouse or pen) run on this card. */
  sway?: boolean;
}) {
  const strings = useCardStrings();
  const renderer = useCardRenderer();
  const theme = useCardTheme();
  const [scope] = useState(newIdScope);
  const hostRef = useRef<HTMLDivElement>(null);

  // The beat whose time has run out. Dropping the prop re-arms it.
  const [played, setPlayed] = useState<BeatName | null>(null);
  useEffect(() => {
    if (!beat) setPlayed(null);
  }, [beat]);
  const playing: BeatName | undefined =
    renderer &&
    beat &&
    played !== beat &&
    renderer.beats.includes(beat) &&
    !prefersReducedMotion() &&
    !(typeof document !== "undefined" && document.hidden)
      ? beat
      : undefined;
  useEffect(() => {
    if (!renderer || !playing) return;
    const timer = window.setTimeout(() => setPlayed(playing), renderer.beatMs(playing) + 50);
    return () => window.clearTimeout(timer);
  }, [renderer, playing]);

  const html = useMemo(() => {
    if (!renderer) return null;
    const key = [
      renderer.id,
      strings.lang,
      theme,
      playing ?? "",
      widthBucket(width),
      JSON.stringify(profile),
    ].join("|");
    return scopeSvgIds(
      cachedRender(key, () => renderer.full(profile, { strings, theme, beat: playing })),
      scope,
    );
  }, [renderer, strings, theme, playing, width, profile, scope]);

  // The renderer's pointer behaviour, once the card is in the page; never for reduced motion.
  useEffect(() => {
    const host = hostRef.current;
    if (!sway || !renderer?.mount || !host || !html || prefersReducedMotion()) return;
    return renderer.mount(host);
  }, [sway, renderer, html]);

  const label = cardLabel(profile, strings);
  return (
    <div
      className={cn("mc-card", className)}
      style={{ width, maxWidth: "100%" }}
      data-testid={testId}
      data-mc-ready={html ? "1" : undefined}
    >
      {html ? (
        <div ref={hostRef} dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div style={{ aspectRatio: `1 / ${activeRenderer.estimateAspect(profile, strings.lang)}` }}>
          <UiSkeleton className={cn("h-full w-full", ui.radius.sheet)} />
          <span className="sr-only">{label}</span>
        </div>
      )}
    </div>
  );
}
