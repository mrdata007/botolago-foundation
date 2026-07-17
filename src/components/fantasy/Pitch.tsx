import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Row {
  key: string;
  children: ReactNode[];
}

/**
 * Perspective-style football pitch. A trapezoidal SVG backdrop provides
 * alternating green bands and crisp white markings (boundary, halfway line,
 * center circle, penalty areas, six-yard boxes, goals). Player rows sit on
 * top of the backdrop untransformed so tap targets stay accurate and
 * readable. RTL only reorders horizontal peers within a row — the pitch
 * itself is not mirrored.
 */
export function Pitch({
  gk,
  def,
  mid,
  fwd,
  bench,
  benchLabel,
  className,
}: {
  gk: ReactNode;
  def: ReactNode[];
  mid: ReactNode[];
  fwd: ReactNode[];
  bench?: ReactNode[];
  benchLabel?: string;
  className?: string;
}) {
  const rows: Row[] = [
    { key: "fwd", children: fwd },
    { key: "mid", children: mid },
    { key: "def", children: def },
    { key: "gk", children: [gk] },
  ];

  return (
    <div className={cn("flex flex-col", className)}>
      <div
        className="relative overflow-hidden rounded-3xl border border-white/25 shadow-2xl"
        style={{
          boxShadow:
            "0 30px 60px -30px rgba(10,20,45,0.55), inset 0 0 60px rgba(0,0,0,0.25)",
        }}
      >
        {/* Trapezoidal pitch backdrop */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            clipPath: "polygon(3% 0, 97% 0, 100% 100%, 0 100%)",
          }}
        >
          {/* Alternating horizontal bands */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "repeating-linear-gradient(180deg, #14733f 0, #14733f 14%, #0f5c33 14%, #0f5c33 28%)",
            }}
          />
          {/* Vignette + stadium-light glow */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 50% 15%, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 55%), radial-gradient(ellipse at 50% 100%, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 60%)",
            }}
          />
          {/* Field markings */}
          <svg
            viewBox="0 0 100 130"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
          >
            <g fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="0.5">
              {/* Outer boundary */}
              <rect x="4" y="3" width="92" height="124" />
              {/* Halfway line */}
              <line x1="4" y1="65" x2="96" y2="65" />
              {/* Center circle */}
              <circle cx="50" cy="65" r="9" />
              <circle cx="50" cy="65" r="0.8" fill="rgba(255,255,255,0.75)" />
              {/* Top penalty area */}
              <rect x="26" y="3" width="48" height="16" />
              {/* Top six-yard */}
              <rect x="38" y="3" width="24" height="6" />
              {/* Top goal */}
              <rect x="45" y="1.5" width="10" height="2" />
              {/* Top penalty spot */}
              <circle cx="50" cy="12" r="0.7" fill="rgba(255,255,255,0.75)" />
              {/* Bottom penalty area */}
              <rect x="26" y="111" width="48" height="16" />
              {/* Bottom six-yard */}
              <rect x="38" y="121" width="24" height="6" />
              {/* Bottom goal */}
              <rect x="45" y="126.5" width="10" height="2" />
              {/* Bottom penalty spot */}
              <circle cx="50" cy="118" r="0.7" fill="rgba(255,255,255,0.75)" />
            </g>
          </svg>
        </div>

        {/* Player rows overlay */}
        <div className="relative grid gap-2 px-2 py-4 sm:gap-3 sm:py-6">
          {rows.map((r) => (
            <div key={r.key} className="flex items-start justify-around gap-1">
              {r.children.map((c, i) => (
                <div key={i} className="min-w-0 max-w-[92px] flex-1">
                  {c}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Bench enclosure — integrated inside the pitch frame */}
        {bench && bench.length > 0 && (
          <div
            className="relative border-t border-white/20 px-2 pb-3 pt-2"
            style={{
              background:
                "linear-gradient(180deg, rgba(10,20,45,0.55) 0%, rgba(10,20,45,0.75) 100%)",
              backdropFilter: "blur(10px)",
            }}
          >
            {benchLabel && (
              <div className="mb-1.5 px-1 text-[10px] font-black uppercase tracking-[0.15em] text-white/85">
                {benchLabel}
              </div>
            )}
            <div className="flex items-start justify-around gap-1">
              {bench.map((c, i) => (
                <div key={i} className="min-w-0 max-w-[92px] flex-1">
                  {c}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
