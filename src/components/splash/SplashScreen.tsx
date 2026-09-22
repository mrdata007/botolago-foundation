import { useEffect, useState } from "react";
import lightWordmark from "@/assets/brand/botolago-wordmark-light.svg";

interface SplashScreenProps {
  onDone: () => void;
}

export function SplashScreen({ onDone }: SplashScreenProps) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const hold = prefersReduced ? 250 : 800;
    const fade = prefersReduced ? 200 : 350;

    const t1 = window.setTimeout(() => setLeaving(true), hold);
    const t2 = window.setTimeout(onDone, hold + fade);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [onDone]);

  return (
    <div
      aria-hidden={leaving}
      role="status"
      className={`fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden transition-all duration-[350ms] ease-out ${
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
            className="pointer-events-none absolute inset-y-0 -start-1/3 w-1/3 [transform:skewX(calc(-18deg*var(--splash-dir)))] motion-safe:animate-[splash-sweep_1100ms_cubic-bezier(0.4,0,0.2,1)_220ms_both]"
            style={{
              background:
                "linear-gradient(to right, transparent, hsl(0 0% 100% / 0.55), transparent)",
            }}
          />
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

      <style>{`
        @keyframes splash-in {
          0% { opacity: 0; transform: scale(0.97) translateY(6px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        /* --splash-dir is +1 in a left-to-right document and -1 in a
           right-to-left one, so the shine leaves the leading edge and
           travels with the reading direction in both. A backtick cannot
           appear in this block: it is inside a JSX template literal. */
        @keyframes splash-sweep {
          0% { transform: translateX(0) skewX(calc(-18deg * var(--splash-dir))); opacity: 0; }
          25% { opacity: 1; }
          100% { transform: translateX(calc(420% * var(--splash-dir))) skewX(calc(-18deg * var(--splash-dir))); opacity: 0; }
        }
        @keyframes splash-bar {
          0% { opacity: 0; transform: scaleX(0.1); }
          100% { opacity: 1; transform: scaleX(1); }
        }
      `}</style>
    </div>
  );
}
