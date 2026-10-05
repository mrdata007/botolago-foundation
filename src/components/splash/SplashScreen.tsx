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
// direction is favoured, and the fades are vertical. Each stripe blends into
// the next over a few pixels: a hard edge stair-steps once it is foreshortened.
const PITCH_STRIPES =
  "repeating-linear-gradient(to bottom, hsl(214 90% 55% / 0.13) 0 38px, hsl(214 90% 55% / 0.025) 46px 82px, hsl(214 90% 55% / 0.13) 90px)";
const PITCH_FADE = "linear-gradient(to top, black 15%, transparent 92%)";
// The same fade in the pitch's own plane, so the far end dissolves in
// perspective instead of stopping at a hard edge on the horizon.
const PITCH_FAR_FADE = "linear-gradient(to bottom, transparent 8%, black 34%)";
// The halfway line, faded out towards the touchlines. Symmetric.
const HALFWAY_LINE =
  "linear-gradient(to right, transparent, hsl(0 0% 100% / 0.3) 35%, hsl(0 0% 100% / 0.3) 65%, transparent)";

// A floodlight beam: bright at the lamp, gone by the far end.
const BEAM =
  "linear-gradient(to bottom, hsl(205 100% 88% / 0.34), hsl(212 100% 72% / 0.09) 55%, transparent)";

// The glow around a lamp bank.
const LAMP_HALO =
  "radial-gradient(closest-side, hsl(205 100% 90% / 0.55), hsl(212 100% 70% / 0.18) 45%, transparent)";

// The ball from the logo: the same path as the one in
// src/assets/brand/botolago-mark-light.svg, moved and scaled into a 32-unit
// box and rounded to two decimals (svgo, applyTransforms). Inline rather than
// an image, so it is painted with the server HTML and needs no request of its
// own. If the logo's ball changes, derive this again from that file.
const LOGO_BALL =
  "M16 0a16 16 0 1 0 0 32 16 16 0 0 0 0-32M5.37 8.64l.3.57c.48.9.98 1.82 1.65 2.62a20 20 0 0 0-1.65 6.31 10 10 0 0 0-2.5 1.82 7 7 0 0 1-1.02-3.33c-.1-1.81.34-5.12 1.38-6.36.23-.28 1.5-1.45 1.84-1.63M4.3 8.58c1.25-2.17 3.27-4 5.78-5.22l-.07.2a21 21 0 0 0-3.73 3.2q-.21.24-.43.55c-.16.22-.33.46-.46.57l-.32.18q-.22.1-.38.2zm3.76 3.5 5.25-1.87c.37.2 2.26 1.85 2.68 2.27.34.34 1.61 1.73 1.75 1.98-.53 1.87-.9 3.88-1.14 6.12q-2.58 1.49-4.66 1.69c-.25.02-1.03.1-1.26-.04L6.4 18.3c.23-2 .57-4.3 1.66-6.2M25.6 8.56c.84 0 1.94.11 2.58.68.24.21.69 1.25.93 1.91.6 1.67 1.36 5.48.46 7.15-.3.57-.36.63-1 .67a11 11 0 0 1-1.6-.05c-.06-.15-.2-.7-.29-1.03l-.18-.69a15 15 0 0 0-1.83-3.63l.23-.55q.2-.45.36-.96c.31-1.1.44-2.4.34-3.5m-.7 1.34a8 8 0 0 1-.87 3.22l-.92.08c-1.26.11-2.46.21-3.7.47l-.54.16c-.2.07-.49.17-.54.17-.13-.05-.58-.62-.77-.86l-.27-.32a27 27 0 0 0-3.55-3.15l1.16-4.55a14 14 0 0 1 5.06-.82q.16 0 .28-.04l.13-.03c.58.06 4.44 3.56 4.54 4.14.05.27.03.97 0 1.53m-4.39-6.7q-.1.16-.17.31c-1.37-.01-2.8.16-4.5.53q-.24.06-.58.18c-.27.1-.65.22-.76.21-.09 0-.44-.14-.67-.23q-.4-.16-.62-.23c-.83-.22-1.67-.39-2.4-.52l.04-.1c.06-.16.13-.36.2-.42.13-.1.97-.36 1.48-.5a14.4 14.4 0 0 1 8.15.35c.05.04-.1.3-.17.42M7.72 27.04a9 9 0 0 0 1.15.32c.13.03.41.05.71.07l.55.05.17.18q.24.26.36.36.62.5 1.44 1.01l1.07.5a14 14 0 0 1-5.45-2.5m2.89-.02a8 8 0 0 1 .13-1.1l.09-.62q.08-1.07.1-2.27c1.94.02 4-.61 5.97-1.83h.08q2.04 1.49 4.64 2.6c.12 1.13-.1 3.37-.99 4.12-.83.71-4.12 1.74-5.2 1.73-.3 0-1.47-.49-2.04-.75-.65-.3-2.66-1.55-2.78-1.88m11.73-3.3a13.4 13.4 0 0 0 4.47-4.07l.47.02c.56.02 1.14.05 1.73-.02v.5q.04.4 0 .72c-.27 1.82-3.1 5.06-4.53 6.12-.98.72-1.8.88-2.85.86.64-1.47.88-2.82.71-4.14";

// The flare along the ground line as the ball lands. Symmetric.
const FLARE = "linear-gradient(to right, transparent, hsl(205 100% 92%), transparent)";
// Its glow: each drop-shadow blurs everything before it, so three stack into
// a bright core and a wide bloom.
const FLARE_GLOW =
  "drop-shadow(0 0 4px hsl(205 100% 80%)) drop-shadow(0 0 12px hsl(210 100% 70%)) drop-shadow(0 0 24px hsl(214 100% 65% / 0.8))";

// One dot of the ball's tail: a soft spot of the floodlights' light.
const TAIL_DOT =
  "radial-gradient(closest-side, hsl(205 100% 92%), hsl(212 100% 72% / 0.6) 55%, transparent)";

// The tail's dots, nearest the ball first: how far behind it each one flies,
// and how big and how bright it is. They are close enough together to blur
// into one streak even at desktop speed, where the ball moves fastest.
const TAIL = Array.from({ length: 14 }, (_, i) => ({
  lag: (i + 1) * 10,
  size: 20 - i * 1.1,
  alpha: 0.5 - i * 0.032,
}));

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
 * the side the reader starts from, trailing light, and lands on the glowing
 * line, which flares; the landing sends a ripple across the turf, the
 * wordmark snaps into focus above it, and the ball sinks into the line.
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
      {/* Floodlights: a lamp bank high in each corner, tilted down at the
          pitch, and its beam. They flicker on together, as the lamps do. Each
          leans in towards the middle, so the lean follows the side it hangs
          from in both reading directions (`--splash-dir`). */}
      <div className="pointer-events-none absolute inset-0 motion-safe:animate-[splash-lights_900ms_steps(1,end)_both]">
        <Floodlight className="start-[9%]" lean="-1" />
        <Floodlight className="end-[9%]" lean="1" />
      </div>

      {/* the night pitch, seen at a low angle */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%] overflow-hidden [perspective:380px] [perspective-origin:50%_22%]"
        style={{ WebkitMaskImage: PITCH_FADE, maskImage: PITCH_FADE }}
      >
        <div
          className="absolute inset-x-[-150%] bottom-[-35%] h-[170%] origin-bottom [transform:rotateX(66deg)] motion-safe:animate-[splash-pitch_900ms_cubic-bezier(0.22,1,0.36,1)_both]"
          style={{ WebkitMaskImage: PITCH_FAR_FADE, maskImage: PITCH_FAR_FADE }}
        >
          <div className="absolute inset-0" style={{ backgroundImage: PITCH_STRIPES }} />
          {/* centre circle, spot and halfway line, in the pitch's own plane */}
          <span
            className="absolute inset-x-[34%] top-1/2 -mt-px h-0.5"
            style={{ background: HALFWAY_LINE }}
          />
          <span className="absolute start-1/2 top-1/2 -ms-48 -mt-48 h-96 w-96 rounded-full border-2 border-white/30" />
          <span className="absolute start-1/2 top-1/2 -ms-1.5 -mt-1.5 h-3 w-3 rounded-full bg-white/40" />
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
              className="absolute inset-y-0 -start-1/3 w-1/3 [transform:skewX(calc(-18deg*var(--splash-dir)))] motion-safe:animate-[splash-sweep_800ms_cubic-bezier(0.4,0,0.2,1)_1500ms_both]"
              style={{
                background:
                  "linear-gradient(to right, transparent, hsl(0 0% 100% / 0.55), transparent)",
                WebkitMaskImage: SHINE_BAND_FADE,
                maskImage: SHINE_BAND_FADE,
              }}
            />
          </span>
        </div>

        {/* The pitch's ground line: a glowing rule the ball lands on, which
            flares as it takes the ball's weight. The flare's glow is made of
            drop-shadows, which follow its faded ends; a box-shadow is never
            drawn under its own box, so it left a dark capsule where the
            gradient is clear. */}
        <span aria-hidden="true" className="relative flex">
          <span
            className="h-[3px] w-28 origin-center rounded-full shadow-[0_0_18px_hsl(214_100%_65%_/_0.7)] motion-safe:animate-[splash-bar_760ms_cubic-bezier(0.22,1,0.36,1)_300ms_both]"
            style={{
              // Symmetric, so `to right` is identical to the `90deg` it
              // replaces — but an angle is a physical direction and this file
              // renders in both.
              background:
                "linear-gradient(to right, transparent, hsl(214 100% 70%), hsl(224 92% 62%), transparent)",
            }}
          />
          <span
            className="pointer-events-none absolute inset-0 hidden rounded-full motion-safe:block motion-safe:animate-[splash-flare_900ms_cubic-bezier(0.22,1,0.36,1)_1000ms_both]"
            style={{ background: FLARE, filter: FLARE_GLOW }}
          />
        </span>

        {/* The landing: a ripple flattened onto the turf, at the ball's spot.
            `forwards`, not `both`: `both` would apply the first keyframe
            (opacity 0.75) during the delay, so the rings sat faintly under
            the line from the first frame. Before the delay ends, `opacity-0`
            keeps them hidden; the last keyframe keeps them hidden after. */}
        {[0, 160].map((delay) => (
          <span
            key={delay}
            aria-hidden="true"
            className="pointer-events-none absolute bottom-[-96px] start-1/2 -ms-24 h-48 w-48"
          >
            <span
              className="block h-full w-full rounded-full border border-[hsl(214_100%_78%_/_0.6)] opacity-0 motion-safe:animate-[splash-ground-ripple_1100ms_cubic-bezier(0.22,1,0.36,1)_forwards]"
              style={{ animationDelay: `${1000 + delay}ms` }}
            />
          </span>
        ))}

        {/*
          The ball's tail: soft dots that each replay the ball's own flight a
          few milliseconds late, so the tail lies along the arc the ball
          actually flew, at any screen width and in both reading directions.
          The old tail was a straight line fixed level behind the ball, so it
          pointed the wrong way for most of the flight. It fades out as the
          ball lands, before the dots catch up and bunch on the spot.
        */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[-2px] start-1/2 -ms-4 hidden h-8 w-8 motion-safe:block motion-safe:animate-[splash-tail_1100ms_linear_both]"
        >
          {TAIL.map(({ lag, size, alpha }) => (
            <span
              key={lag}
              className="absolute inset-0 motion-safe:animate-[splash-ball-x_1000ms_linear_both]"
              style={{ animationDelay: `${lag}ms` }}
            >
              <span
                className="absolute inset-0 flex items-center justify-center motion-safe:animate-[splash-ball-y_1600ms_linear_both]"
                style={{ animationDelay: `${lag}ms` }}
              >
                <span
                  className="rounded-full blur-[3px]"
                  style={{ width: size, height: size, opacity: alpha, background: TAIL_DOT }}
                />
              </span>
            </span>
          ))}
        </span>

        {/*
          The ball. Three layers, because three things move on different
          clocks: the fade (whole flight), the sideways travel (a steady
          1000ms in from the leading side) and the height (an arc, then a
          small bounce). Splitting them is what makes a straight-line slide
          read as a kick. Once it has settled, the outer layer sinks it into
          the line. It is the logo's own ball, and its spin ends where it
          started, so the ball that lands sits the same way up as the one in
          the wordmark above. It is `hidden` unless motion is allowed —
          mid-flight is not a frame worth freezing for reduced motion.
        */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[-2px] start-1/2 -ms-4 hidden h-8 w-8 origin-bottom motion-safe:block motion-safe:animate-[splash-ball-fade_1600ms_linear_both]"
        >
          <span className="block h-full w-full motion-safe:animate-[splash-ball-x_1000ms_linear_both]">
            <span className="relative block h-full w-full motion-safe:animate-[splash-ball-y_1600ms_linear_both]">
              <svg
                viewBox="0 0 32 32"
                className="relative h-full w-full drop-shadow-[0_0_10px_hsl(214_100%_75%_/_0.8)] motion-safe:animate-[splash-ball-spin_1000ms_linear_both]"
              >
                {/* The panels are holes in the logo's ball, so a disc behind
                    fills them: open, they would show the beams through it. */}
                <circle cx="16" cy="16" r="15" fill="#0b1630" />
                <path fill="#ffffff" d={LOGO_BALL} />
              </svg>
            </span>
          </span>
        </span>
      </div>
    </div>
  );
}

/**
 * One floodlight: a bank of six lamps and the beam it throws, both turned
 * about the lamps' centre. `lean` is the sign of the turn in a left-to-right
 * document; `--splash-dir` flips it for right-to-left, so a light always
 * points at the middle of the pitch from the side it hangs on. The wider the
 * screen, the further the middle is from the corner, so the steeper the turn
 * (`--splash-lean`): on a phone the beams cross on the wordmark, on a desktop
 * they meet on the pitch.
 */
function Floodlight({ className, lean }: { className: string; lean: "1" | "-1" }) {
  return (
    <span
      className={`absolute top-[4%] [--splash-lean:22deg] sm:[--splash-lean:30deg] lg:[--splash-lean:36deg] ${className}`}
      style={{ transform: `rotate(calc(${lean} * var(--splash-lean) * var(--splash-dir)))` }}
    >
      {/* The beam widens as it travels. The cone is cut in the child and
          blurred by the parent: a blur on the clipped element itself would
          be clipped back to hard edges. The cone is symmetric, so its
          polygon names no reading direction. */}
      <span className="absolute top-0 -ms-24 h-[80vh] w-48 blur-xl">
        <span
          className="block h-full w-full [clip-path:polygon(42%_0,58%_0,100%_100%,0_100%)]"
          style={{ background: BEAM }}
        />
      </span>
      <span
        className="absolute -ms-12 -mt-12 h-24 w-24 rounded-full"
        style={{ background: LAMP_HALO }}
      />
      <span className="absolute -ms-[13px] -mt-2 grid grid-cols-3 gap-[3px]">
        {[0, 1, 2, 3, 4, 5].map((lamp) => (
          <span
            key={lamp}
            className="h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_6px_1px_hsl(205_100%_82%_/_0.9)]"
          />
        ))}
      </span>
    </span>
  );
}
