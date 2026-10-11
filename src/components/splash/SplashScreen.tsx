import { useEffect, useRef, useState, type CSSProperties } from "react";
import { systemBars } from "@/lib/system-bars";
import { claimLaunchSplash, releaseLaunchSplash } from "./launch-splash";
import { startMagicRings } from "./magic-rings";
import {
  BALL,
  WORDMARK_GLYPHS,
  WORDMARK_HEIGHT,
  WORDMARK_WIDTH,
  type WordmarkGlyph,
} from "./wordmark-glyphs";

interface SplashScreenProps {
  /** Called once the splash has faded out, or at once when this load has none. */
  onDone: () => void;
}

// How long the splash is held, counted from its first paint. The choreography
// (src/styles.css, `.splash-*`) is done at about 1650ms; the rest is the
// finished logo, held long enough to be read before the fade.
const HOLD_MS = 2200;
const HOLD_REDUCED_MS = 250;
const FADE_MS = 450;
const FADE_REDUCED_MS = 200;

// Where the ball sits in the wordmark, as percentages of its box. The rings
// and the halo are centred on it with CSS alone, so they are right at first
// paint and at any size, with nothing measured.
const BALL_X = `${(BALL.cx / WORDMARK_WIDTH) * 100}%`;
const BALL_Y = `${(BALL.cy / WORDMARK_HEIGHT) * 100}%`;

const BOX_STYLE = {
  aspectRatio: `${WORDMARK_WIDTH} / ${WORDMARK_HEIGHT}`,
  "--ball-x": BALL_X,
  "--ball-y": BALL_Y,
} as CSSProperties;

/**
 * The launch splash. It is in the server HTML on every load and shown only
 * when the head script marked this load (`launch-splash.ts`), so on a first
 * visit it is the first thing painted and its entrance plays from that paint.
 * This component only decides when it leaves, and starts the rings.
 *
 * The story is the logo's own: the ball arrives first, alone and centred, with
 * a spring; the wordmark glides into place and the letters come in after it,
 * outward from the ball; blue rings pulse out from the ball. All of it but the
 * rings is CSS on this markup, so it needs no JS to start. Under reduced motion
 * none of it moves and there are no rings: what is left is the finished logo.
 */
export function SplashScreen({ onDone }: SplashScreenProps) {
  const [leaving, setLeaving] = useState(false);
  const ringsRef = useRef<HTMLCanvasElement>(null);

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

    // The splash is dark in both themes: light status-bar icons in the app
    // while it is up (BG-0154). Only on a load that shows it.
    const releaseBand = systemBars.holdDarkBand();

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
    const fade = prefersReduced ? FADE_REDUCED_MS : FADE_MS;

    const t1 = window.setTimeout(() => setLeaving(true), hold);
    const t2 = window.setTimeout(() => {
      releaseLaunchSplash();
      onDoneRef.current();
    }, hold + fade);

    // The rings join when the code arrives, and fade in. Not under reduced
    // motion; and where WebGL2 is missing this does nothing at all.
    const stopRings =
      !prefersReduced && ringsRef.current ? startMagicRings(ringsRef.current, shownAt) : undefined;

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      stopRings?.();
      releaseBand();
    };
  }, []);

  return (
    <div
      aria-hidden={leaving}
      role="status"
      // No `flex` here: `launch-splash` (src/styles.css) owns the display,
      // `none` unless the head script marked this load.
      className={`launch-splash fixed inset-0 z-[9999] items-center justify-center overflow-hidden transition-all duration-[450ms] ease-out ${
        leaving ? "opacity-0 pointer-events-none scale-[1.03]" : "opacity-100"
      }`}
      style={{
        background:
          "radial-gradient(120% 90% at 50% 0%, hsl(219 72% 18%) 0%, hsl(221 70% 10%) 50%, hsl(224 66% 5%) 100%)",
      }}
    >
      {/* The wordmark is a Latin logo: it keeps its order, left to right, in
          French and in Arabic, so it is `ltr` whatever the page is. It is one
          image to a screen reader. */}
      <div
        dir="ltr"
        role="img"
        aria-label="BotolaGO"
        className="splash-logo relative"
        style={BOX_STYLE}
      >
        {/* Everything that moves with the camera pan: the halo, the rings and
            the glyphs, which are stacked at the same size, one per layer. */}
        <div className="splash-pan absolute inset-0">
          <span aria-hidden="true" className="splash-halo" />
          <canvas ref={ringsRef} aria-hidden="true" className="splash-rings" />
          {WORDMARK_GLYPHS.map((glyph) => (
            <Glyph key={glyph.name} glyph={glyph} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * One glyph of the wordmark on its own layer, so each can be animated and
 * blurred as an element. `--n` is how many letters it is from the ball, which
 * sets when it appears.
 */
function Glyph({ glyph }: { glyph: WordmarkGlyph }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${WORDMARK_WIDTH} ${WORDMARK_HEIGHT}`}
      className="splash-glyph"
      data-glyph={glyph.kind}
      style={{ "--n": glyph.step } as CSSProperties}
    >
      <path fill="#fff" d={glyph.d} />
    </svg>
  );
}
