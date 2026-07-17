import { useEffect, useState } from "react";
import logoAsset from "@/assets/botolago-logo.jpg.asset.json";

interface SplashScreenProps {
  onDone: () => void;
  minDuration?: number;
  maxDuration?: number;
}

export function SplashScreen({ onDone, minDuration = 1500, maxDuration = 2000 }: SplashScreenProps) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const min = prefersReduced ? 400 : minDuration;
    const max = prefersReduced ? 600 : maxDuration;

    let doneCalled = false;
    const finish = () => {
      if (doneCalled) return;
      doneCalled = true;
      setLeaving(true);
      window.setTimeout(onDone, prefersReduced ? 150 : 400);
    };

    // Consider "ready" when window load fires or min has elapsed — whichever later.
    const start = Date.now();
    let ready = document.readyState === "complete";
    const onLoad = () => {
      ready = true;
      const elapsed = Date.now() - start;
      window.setTimeout(finish, Math.max(0, min - elapsed));
    };
    if (!ready) window.addEventListener("load", onLoad, { once: true });
    else window.setTimeout(finish, min);

    const hardStop = window.setTimeout(finish, max);
    return () => {
      window.removeEventListener("load", onLoad);
      window.clearTimeout(hardStop);
    };
  }, [onDone, minDuration, maxDuration]);

  return (
    <div
      aria-hidden={leaving}
      className={`fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden transition-opacity duration-500 ease-out ${
        leaving ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{
        background:
          "radial-gradient(1200px 700px at 20% 10%, hsl(215 60% 22%) 0%, transparent 60%)," +
          "radial-gradient(900px 600px at 80% 90%, hsl(220 70% 15%) 0%, transparent 55%)," +
          "linear-gradient(160deg, hsl(222 60% 8%) 0%, hsl(220 55% 12%) 55%, hsl(218 50% 9%) 100%)",
      }}
    >
      {/* Football-inspired curves */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.14] motion-safe:animate-[splash-drift_8s_ease-in-out_infinite]"
        viewBox="0 0 800 800"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="splashCurve" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#5aa9ff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#5aa9ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M-100,500 C200,300 500,700 900,400"
          stroke="url(#splashCurve)"
          strokeWidth="2"
          fill="none"
        />
        <path
          d="M-100,600 C250,450 550,780 900,520"
          stroke="url(#splashCurve)"
          strokeWidth="1.5"
          fill="none"
        />
        <circle cx="120" cy="140" r="140" stroke="url(#splashCurve)" strokeWidth="1" fill="none" />
        <circle cx="680" cy="660" r="180" stroke="url(#splashCurve)" strokeWidth="1" fill="none" />
      </svg>

      {/* Soft moving light */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(90,169,255,0.35),transparent_70%)] blur-2xl motion-safe:animate-[splash-glow_3.5s_ease-in-out_infinite]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[420px] w-[420px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(closest-side,rgba(120,90,255,0.25),transparent_70%)] blur-2xl motion-safe:animate-[splash-glow_5s_ease-in-out_infinite]" />

      {/* Logo assembly */}
      <div className="relative flex flex-col items-center motion-safe:animate-[splash-in_700ms_ease-out_both]">
        <div className="relative flex h-40 w-40 items-center justify-center">
          {/* Rotating light ring */}
          <div
            className="absolute inset-0 rounded-full motion-safe:animate-[splash-spin_6s_linear_infinite]"
            style={{
              background:
                "conic-gradient(from 0deg, rgba(90,169,255,0) 0deg, rgba(90,169,255,0.8) 60deg, rgba(255,255,255,0.6) 120deg, rgba(90,169,255,0) 200deg, rgba(90,169,255,0) 360deg)",
              WebkitMask:
                "radial-gradient(closest-side, transparent 63%, #000 65%, #000 72%, transparent 74%)",
              mask: "radial-gradient(closest-side, transparent 63%, #000 65%, #000 72%, transparent 74%)",
            }}
          />
          {/* Frosted glass circle */}
          <div
            className="relative flex h-32 w-32 items-center justify-center rounded-full border border-white/15 shadow-[0_10px_60px_-10px_rgba(90,169,255,0.55)] motion-safe:animate-[splash-pulse_2.2s_ease-in-out_infinite]"
            style={{
              background: "rgba(255,255,255,0.06)",
              backdropFilter: "blur(18px)",
              WebkitBackdropFilter: "blur(18px)",
            }}
          >
            <img
              src={logoAsset.url}
              alt="BotolaGO"
              draggable={false}
              className="h-16 w-auto select-none drop-shadow-[0_4px_20px_rgba(90,169,255,0.4)]"
            />
          </div>
        </div>
      </div>

      {/* Loading dots */}
      <div className="absolute bottom-16 flex items-center gap-1.5" aria-label="Loading">
        <span className="h-1.5 w-1.5 rounded-full bg-white/70 motion-safe:animate-[splash-dot_1.2s_ease-in-out_infinite]" />
        <span className="h-1.5 w-1.5 rounded-full bg-white/70 motion-safe:animate-[splash-dot_1.2s_ease-in-out_0.15s_infinite]" />
        <span className="h-1.5 w-1.5 rounded-full bg-white/70 motion-safe:animate-[splash-dot_1.2s_ease-in-out_0.3s_infinite]" />
      </div>

      <style>{`
        @keyframes splash-in {
          0% { opacity: 0; transform: scale(0.9); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes splash-pulse {
          0%, 100% { box-shadow: 0 10px 60px -10px rgba(90,169,255,0.35); }
          50% { box-shadow: 0 10px 80px -6px rgba(90,169,255,0.75); }
        }
        @keyframes splash-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes splash-dot {
          0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-3px); }
        }
        @keyframes splash-glow {
          0%, 100% { opacity: 0.7; transform: translate(-50%, 0) scale(1); }
          50% { opacity: 1; transform: translate(-50%, 10px) scale(1.05); }
        }
        @keyframes splash-drift {
          0%, 100% { transform: translate3d(0,0,0); }
          50% { transform: translate3d(-10px, 6px, 0); }
        }
      `}</style>
    </div>
  );
}
