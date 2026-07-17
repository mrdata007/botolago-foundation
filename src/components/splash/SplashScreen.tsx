import { useEffect, useState } from "react";
import logoAsset from "@/assets/botolago-logo.jpg.asset.json";

interface SplashScreenProps {
  onDone: () => void;
}

export function SplashScreen({ onDone }: SplashScreenProps) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const hold = prefersReduced ? 300 : 750;
    const fade = prefersReduced ? 150 : 350;

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
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-[350ms] ease-out ${
        leaving ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{
        background:
          "linear-gradient(160deg, hsl(215 70% 20%) 0%, hsl(220 65% 12%) 55%, hsl(222 60% 7%) 100%)",
      }}
    >
      <img
        src={logoAsset.url}
        alt="BotolaGO"
        draggable={false}
        className="h-14 w-auto select-none motion-safe:animate-[splash-in_600ms_ease-out_both]"
      />
      <style>{`
        @keyframes splash-in {
          0% { opacity: 0; transform: scale(0.96); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
