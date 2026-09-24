import { useEffect, useRef, useState } from "react";
import lightWordmark from "@/assets/brand/botolago-wordmark-light.svg";
import { claimLaunchSplash, releaseLaunchSplash } from "./launch-splash";

interface SplashScreenProps {
  /** Called once the splash has faded out, or at once when this load has none. */
  onDone: () => void;
}

// The shine's soft edges. Only a mask's alpha counts, so the colour is moot.
// The band used to fill the logo's box edge to edge, so it read as a pale box
// with hard top and bottom edges, and the box's own edge cut it off square as
// it left, beside the ball. The window fades the band in and out at the ends
// of the logo; the band fades itself out towards its top and bottom. Two masks
// on two elements multiply, which one element would need `mask-composite` for.
// Both are symmetric, so `to right` names no reading direction (rule 3).
const SHINE_WINDOW = "linear-gradient(to right, transparent, black 15%, black 85%, transparent)";
const SHINE_BAND_FADE =
  "linear-gradient(to bottom, transparent, black 25%, black 75%, transparent)";

/**
 * The launch splash. It is in the server HTML on every load and shown only
 * when the head script marked this load (`launch-splash.ts`), so on a first
 * visit it is the first thing painted and its entrance plays from that paint.
 * This component only decides when it leaves.
 */
export function SplashScreen({ onDone }: SplashScreenProps) {
  const [leaving, setLeaving] = useState(false);

  // Read through a ref, so a parent re-render cannot restart the timers. It
  // did: the gate passed a new function on every render, the hold began again
  // each time, and a re-render during the fade put the language chooser back
  // by a whole hold and fade.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const shownAt = claimLaunchSplash();
    if (shownAt === null) {
      // Not a splash load: it was never on screen, so there is nothing to play.
      onDoneRef.current();
      return;
    }

    const prefersReduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;

    // The hold counts from the first paint, not from hydration. On a fast load
    // that is the choreography it always had; on a slow one the splash has
    // already been up for the whole load, and leaves as soon as the app can
    // take over instead of holding it back another 800ms.
    const hold = Math.max(0, (prefersReduced ? 250 : 800) - (performance.now() - shownAt));
    const fade = prefersReduced ? 200 : 350;

    const t1 = window.setTimeout(() => setLeaving(true), hold);
    const t2 = window.setTimeout(() => {
      releaseLaunchSplash();
      onDoneRef.current();
    }, hold + fade);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  return (
    <div
      aria-hidden={leaving}
      role="status"
      // No `flex` here: `launch-splash` (src/styles.css) owns the display,
      // `none` unless the head script marked this load.
      className={`launch-splash fixed inset-0 z-[9999] items-center justify-center overflow-hidden transition-all duration-[350ms] ease-out ${
        leaving ? "opacity-0 pointer-events-none -translate-y-1 scale-[1.01]" : "opacity-100"
      }`}
      style={{
        background:
          "radial-gradient(120% 90% at 50% 8%, hsl(219 72% 22%) 0%, hsl(220 68% 13%) 45%, hsl(223 62% 7%) 100%)",
      }}
    >
      {/* cool highlight + brand bloom */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 45% at 18% 12%, hsl(210 90% 60% / 0.20) 0%, transparent 60%), radial-gradient(70% 50% at 82% 88%, hsl(224 90% 55% / 0.16) 0%, transparent 65%)",
        }}
      />

      {/* faint stadium arcs */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.10]"
        viewBox="0 0 400 800"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <g fill="none" stroke="white" strokeWidth="1">
          <circle cx="200" cy="400" r="120" />
          <circle cx="200" cy="400" r="200" />
          <circle cx="200" cy="400" r="290" />
        </g>
      </svg>

      <div className="relative flex flex-col items-center gap-5 px-8">
        {/* glow behind the mark */}
        <div
          className="pointer-events-none absolute -inset-x-10 -inset-y-14 rounded-full blur-2xl"
          style={{
            background: "radial-gradient(closest-side, hsl(214 100% 75% / 0.45), transparent 75%)",
          }}
        />

        <div className="relative overflow-hidden motion-safe:animate-[splash-in_640ms_cubic-bezier(0.22,1,0.36,1)_both]">
          <img
            src={lightWordmark}
            alt="BotolaGO"
            width={1615}
            height={288}
            decoding="async"
            fetchPriority="high"
            className="h-14 max-w-full w-auto select-none object-contain drop-shadow-[0_6px_24px_hsl(214_100%_60%_/_0.45)] sm:h-20"
            style={{ filter: "brightness(1.18) saturate(1.1)" }}
            draggable={false}
          />
          {/* light sweep */}
          {/*
            A shine travelling across the wordmark. Everything about it was
            physical: it started outside the LEFT edge, translated +X, and
            skewed one way — so in Arabic it entered from the wrong side and
            leaned against the letterforms instead of with them.

            `-start-1/3` puts it outside the leading edge in both scripts, and
            `--splash-dir` carries the sign so the travel and the skew follow.
            The gradient itself is symmetric (transparent to white to
            transparent), so `to right` is `90deg` to the pixel — but stating
            an angle at all is the thing rule 3 forbids.
          */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden"
            style={{ WebkitMaskImage: SHINE_WINDOW, maskImage: SHINE_WINDOW }}
          >
            <span
              className="absolute inset-y-0 -start-1/3 w-1/3 [transform:skewX(calc(-18deg*var(--splash-dir)))] motion-safe:animate-[splash-sweep_1100ms_cubic-bezier(0.4,0,0.2,1)_220ms_both]"
              style={{
                background:
                  "linear-gradient(to right, transparent, hsl(0 0% 100% / 0.55), transparent)",
                WebkitMaskImage: SHINE_BAND_FADE,
                maskImage: SHINE_BAND_FADE,
              }}
            />
          </span>
        </div>

        {/* accent bar */}
        <span
          aria-hidden="true"
          className="h-[3px] w-24 origin-center rounded-full motion-safe:animate-[splash-bar_760ms_cubic-bezier(0.22,1,0.36,1)_180ms_both]"
          style={{
            // Symmetric, so `to right` is identical to the `90deg` it
            // replaces — but an angle is a physical direction and this file
            // renders in both.
            background:
              "linear-gradient(to right, transparent, hsl(214 100% 66%), hsl(224 92% 58%), transparent)",
          }}
        />
      </div>
    </div>
  );
}
