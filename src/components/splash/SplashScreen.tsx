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

// The night pitch: mowing stripes running across it, fading into the dark
// towards the horizon. Stripes alternate light and dark, so neither reading
// direction is favoured, and the fade is vertical.
const PITCH_STRIPES =
  "repeating-linear-gradient(to bottom, hsl(214 90% 55% / 0.14) 0 44px, hsl(214 90% 55% / 0.02) 44px 88px)";
const PITCH_FADE = "linear-gradient(to top, black 15%, transparent 92%)";

// A floodlight beam: bright at the lamp, gone by the far end.
const BEAM =
  "linear-gradient(to bottom, hsl(205 100% 88% / 0.38), hsl(210 100% 75% / 0.10) 55%, transparent)";

// How long the splash is held, counted from its first paint. The choreography
// below runs about 2s: lights, the ball's flight, its landing, the wordmark.
const HOLD_MS = 2300;
const HOLD_REDUCED_MS = 250;

/**
 * The launch splash. It is in the server HTML on every load and shown only
 * when the head script marked this load (`launch-splash.ts`), so on a first
 * visit it is the first thing painted and its entrance plays from that paint.
 * This component only decides when it leaves.
 *
 * The story: the floodlights come on over a night pitch, a ball arcs in from
 * the side the reader starts from and lands on the glowing line, the landing
 * sends a ripple across the turf, and the wordmark snaps into focus above it.
 * Under reduced motion none of the moving parts render, and what is left is
 * the finished frame: pitch, lights, wordmark, line.
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
    // take over instead of holding it back any longer.
    const hold = Math.max(
      0,
      (prefersReduced ? HOLD_REDUCED_MS : HOLD_MS) - (performance.now() - shownAt),
    );
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
          "radial-gradient(120% 90% at 50% 0%, hsl(219 72% 18%) 0%, hsl(221 70% 10%) 50%, hsl(224 66% 5%) 100%)",
      }}
    >
      {/* floodlights: two beams from the top corners that flicker on, as the
          lamps do. Each leans in towards the middle, so the lean follows the
          side it hangs from in both reading directions (`--splash-dir`). */}
      <div className="pointer-events-none absolute inset-0 motion-safe:animate-[splash-lights_900ms_steps(1,end)_both]">
        <span
          className="absolute -top-8 start-[6%] h-[85%] w-28 origin-top blur-2xl"
          style={{
            background: BEAM,
            transform: "rotate(calc(24deg * var(--splash-dir)))",
          }}
        />
        <span
          className="absolute -top-8 end-[6%] h-[85%] w-28 origin-top blur-2xl"
          style={{
            background: BEAM,
            transform: "rotate(calc(-24deg * var(--splash-dir)))",
          }}
        />
      </div>

      {/* the night pitch, seen at a low angle */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%] overflow-hidden [perspective:380px]"
        style={{ WebkitMaskImage: PITCH_FADE, maskImage: PITCH_FADE }}
      >
        <div className="absolute inset-x-[-60%] bottom-[-35%] h-[170%] origin-bottom [transform:rotateX(66deg)] motion-safe:animate-[splash-pitch_900ms_cubic-bezier(0.22,1,0.36,1)_both]">
          <div className="absolute inset-0" style={{ backgroundImage: PITCH_STRIPES }} />
          {/* centre circle and halfway line, in the pitch's own plane */}
          <span className="absolute inset-x-0 top-1/2 border-t-2 border-white/30" />
          <span className="absolute start-1/2 top-1/2 -ms-48 -mt-48 h-96 w-96 rounded-full border-2 border-white/30" />
        </div>
      </div>

      {/* brand bloom and a vignette to hold the eye in the middle */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 45% at 18% 12%, hsl(210 90% 60% / 0.16) 0%, transparent 60%), radial-gradient(70% 50% at 82% 88%, hsl(224 90% 55% / 0.16) 0%, transparent 65%), radial-gradient(90% 80% at 50% 50%, transparent 55%, hsl(224 70% 3% / 0.55) 100%)",
        }}
      />

      <div className="relative flex flex-col items-center gap-5 px-8">
        {/* glow behind the mark, breathing gently */}
        <div
          className="pointer-events-none absolute -inset-x-10 -inset-y-14 rounded-full blur-2xl motion-safe:animate-[splash-breathe_2400ms_ease-in-out_infinite]"
          style={{
            background: "radial-gradient(closest-side, hsl(214 100% 75% / 0.42), transparent 75%)",
          }}
        />

        {/* The wordmark pulls into focus the moment the ball lands (1000ms). */}
        <div className="relative overflow-hidden motion-safe:animate-[splash-reveal_760ms_cubic-bezier(0.22,1,0.36,1)_980ms_both]">
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
          {/*
            A shine travelling across the wordmark. `-start-1/3` puts it
            outside the leading edge in both scripts, and `--splash-dir`
            carries the sign so the travel and the skew follow the reading
            direction. The gradient itself is symmetric (transparent to white
            to transparent), so `to right` is `90deg` to the pixel — but
            stating an angle at all is the thing rule 3 forbids.
          */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden"
            style={{ WebkitMaskImage: SHINE_WINDOW, maskImage: SHINE_WINDOW }}
          >
            <span
              className="absolute inset-y-0 -start-1/3 w-1/3 [transform:skewX(calc(-18deg*var(--splash-dir)))] motion-safe:animate-[splash-sweep_1100ms_cubic-bezier(0.4,0,0.2,1)_1500ms_both]"
              style={{
                background:
                  "linear-gradient(to right, transparent, hsl(0 0% 100% / 0.55), transparent)",
                WebkitMaskImage: SHINE_BAND_FADE,
                maskImage: SHINE_BAND_FADE,
              }}
            />
          </span>
        </div>

        {/* The pitch's ground line: a glowing rule the ball lands on. */}
        <span
          aria-hidden="true"
          className="h-[3px] w-28 origin-center rounded-full shadow-[0_0_18px_hsl(214_100%_65%_/_0.7)] motion-safe:animate-[splash-bar_760ms_cubic-bezier(0.22,1,0.36,1)_300ms_both]"
          style={{
            // Symmetric, so `to right` is identical to the `90deg` it
            // replaces — but an angle is a physical direction and this file
            // renders in both.
            background:
              "linear-gradient(to right, transparent, hsl(214 100% 70%), hsl(224 92% 62%), transparent)",
          }}
        />

        {/* The landing: a ripple flattened onto the turf, at the ball's spot. */}
        {[0, 160].map((delay) => (
          <span
            key={delay}
            aria-hidden="true"
            className="pointer-events-none absolute bottom-[-96px] start-1/2 -ms-24 h-48 w-48"
          >
            <span
              className="block h-full w-full rounded-full border border-[hsl(214_100%_78%_/_0.6)] opacity-0 motion-safe:animate-[splash-ground-ripple_1100ms_cubic-bezier(0.22,1,0.36,1)_both]"
              style={{ animationDelay: `${1000 + delay}ms` }}
            />
          </span>
        ))}

        {/*
          The ball. Three layers, because three things move on different
          clocks: the fade (whole flight), the sideways travel (a steady
          1000ms in from the leading side) and the height (an arc, then a
          small bounce). Splitting them is what makes a straight-line slide
          read as a kick. It is `hidden` unless motion is allowed — mid-flight
          is not a frame worth freezing for reduced motion.
        */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[-2px] start-1/2 -ms-4 hidden h-8 w-8 motion-safe:block motion-safe:animate-[splash-ball-fade_1600ms_linear_both]"
        >
          <span className="block h-full w-full motion-safe:animate-[splash-ball-x_1000ms_linear_both]">
            <span className="relative block h-full w-full motion-safe:animate-[splash-ball-y_1600ms_linear_both]">
              {/* the light trail, flipped so it always streams behind */}
              <span
                className="absolute end-full top-1/2 -mt-[1.5px] h-[3px] w-40 rounded-full [transform:scaleX(var(--splash-dir))] motion-safe:animate-[splash-trail_1000ms_ease-out_both]"
                style={{
                  background: "linear-gradient(to right, transparent, hsl(205 100% 85% / 0.9))",
                }}
              />
              <svg
                viewBox="0 0 32 32"
                className="relative h-full w-full drop-shadow-[0_0_10px_hsl(214_100%_75%_/_0.8)] motion-safe:animate-[splash-ball-spin_1000ms_linear_both]"
              >
                <defs>
                  <radialGradient id="splash-ball-shade" cx="35%" cy="30%" r="75%">
                    <stop offset="0" stopColor="#ffffff" />
                    <stop offset="0.6" stopColor="#e4ebf7" />
                    <stop offset="1" stopColor="#97accc" />
                  </radialGradient>
                </defs>
                <circle cx="16" cy="16" r="15" fill="url(#splash-ball-shade)" />
                <polygon points="16,10.5 21.2,14.3 19.2,20.4 12.8,20.4 10.8,14.3" fill="#0b1630" />
                <path
                  d="M16 10.5V3M21.2 14.3l7-2.2M19.2 20.4l4.3 5.9M12.8 20.4l-4.3 5.9M10.8 14.3l-7-2.2"
                  stroke="#0b1630"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            </span>
          </span>
        </span>
      </div>
    </div>
  );
}
