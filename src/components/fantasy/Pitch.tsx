import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Row {
  key: string;
  children: ReactNode[];
}

/**
 * Premium BotolaGO pitch surface.
 *
 * A deep green-to-teal trapezoidal turf with soft top-left stadium lighting,
 * a restrained vignette and crisp white markings (boundary, halfway, center
 * circle, penalty areas, six-yard boxes, goals, corner arcs). Very light
 * CSS-only turf pattern for depth. Player rows sit above the backdrop so
 * tap targets stay accurate and player names remain readable. RTL only
 * reorders horizontal peers within a row — the pitch itself is not mirrored.
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
        className="relative overflow-hidden rounded-[var(--radius-hero)] border border-white/20"
        style={{
          boxShadow:
            "0 30px 70px -30px rgba(6,20,40,0.55), 0 10px 30px -14px rgba(6,20,40,0.28), inset 0 0 60px rgba(0,0,0,0.30)",
        }}
      >
        {/* Trapezoidal turf backdrop */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            clipPath: "polygon(3% 0, 97% 0, 100% 100%, 0 100%)",
          }}
        >
          {/* Deep green → teal base, slightly darker at the top for depth */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, #0e5a3a 0%, #0f6a44 45%, #0d5f45 100%)",
            }}
          />
          {/* Alternating mow bands — very subtle */}
          <div
            className="absolute inset-0 opacity-[0.55] mix-blend-soft-light"
            style={{
              background:
                "repeating-linear-gradient(180deg, rgba(255,255,255,0.10) 0, rgba(255,255,255,0.10) 14%, rgba(0,0,0,0.10) 14%, rgba(0,0,0,0.10) 28%)",
            }}
          />
          {/* Top-left stadium lighting + bottom vignette */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 22% 8%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 55%), radial-gradient(ellipse at 50% 100%, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0) 65%)",
            }}
          />
          {/* Field markings */}
          <svg
            viewBox="0 0 100 130"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
          >
            <g fill="none" stroke="rgba(255,255,255,0.78)" strokeWidth="0.45">
              {/* Outer boundary */}
              <rect x="4" y="3" width="92" height="124" />
              {/* Halfway line */}
              <line x1="4" y1="65" x2="96" y2="65" />
              {/* Center circle */}
              <circle cx="50" cy="65" r="9" />
              <circle cx="50" cy="65" r="0.9" fill="rgba(255,255,255,0.85)" />
              {/* Top penalty area */}
              <rect x="26" y="3" width="48" height="16" />
              <rect x="38" y="3" width="24" height="6" />
              <rect x="45" y="1.5" width="10" height="2" />
              <circle cx="50" cy="12" r="0.8" fill="rgba(255,255,255,0.85)" />
              <path d="M 42 19 A 8 8 0 0 0 58 19" />
              {/* Bottom penalty area */}
              <rect x="26" y="111" width="48" height="16" />
              <rect x="38" y="121" width="24" height="6" />
              <rect x="45" y="126.5" width="10" height="2" />
              <circle cx="50" cy="118" r="0.8" fill="rgba(255,255,255,0.85)" />
              <path d="M 42 111 A 8 8 0 0 1 58 111" />
              {/* Corner arcs */}
              <path d="M 4 5 A 2 2 0 0 1 6 3" />
              <path d="M 96 3 A 2 2 0 0 1 98 5" />
              <path d="M 4 125 A 2 2 0 0 0 6 127" />
              <path d="M 98 125 A 2 2 0 0 1 96 127" />
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
            className="relative border-t border-white/15 px-2 pb-3 pt-2"
            style={{
              background:
                "linear-gradient(180deg, rgba(8,18,38,0.62) 0%, rgba(8,18,38,0.82) 100%)",
              backdropFilter: "blur(10px)",
            }}
          >
            {benchLabel && (
              <div className="mb-1.5 flex items-center gap-1.5 px-1">
                <span
                  aria-hidden
                  className="h-[2px] w-4 rounded-full"
                  style={{ background: "color-mix(in oklab, var(--brand-accent) 70%, transparent)" }}
                />
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-white/90">
                  {benchLabel}
                </span>
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
