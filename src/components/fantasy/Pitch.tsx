import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Row {
  key: string;
  children: ReactNode[];
}

/**
 * Football pitch layout. Renders three outfield rows (DEF, MID, FWD) plus
 * a keeper row. The container is direction-agnostic — rows use flex-row
 * and mirror naturally in RTL. Formations don't lose meaning: the pitch
 * is symmetric top-to-bottom, and RTL only flips the horizontal ordering
 * of positional peers, which reads naturally in Arabic.
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
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        aria-hidden
        className="relative overflow-hidden rounded-3xl border border-white/40 shadow-inner"
        style={{
          background:
            "linear-gradient(180deg, #0f5132 0%, #1a7040 50%, #0f5132 100%)",
        }}
      >
        {/* Field lines */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-2 rounded-2xl border border-white/25" />
          <div className="absolute inset-x-2 top-1/2 h-px bg-white/25" />
          <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />
          <div className="absolute inset-x-16 top-2 h-10 rounded-b-xl border-b border-x border-white/25" />
          <div className="absolute inset-x-16 bottom-2 h-10 rounded-t-xl border-t border-x border-white/25" />
        </div>
        <div className="relative grid gap-3 px-2 py-4">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center justify-around gap-1">
              {r.children.map((c, i) => (
                <div key={i} className="flex-1 max-w-[80px]">{c}</div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {bench && bench.length > 0 && (
        <div className="glass-surface glass-regular rounded-2xl border border-[var(--glass-border)] p-2">
          {benchLabel && (
            <div className="mb-1 px-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              {benchLabel}
            </div>
          )}
          <div className="flex items-center justify-around gap-1">
            {bench.map((c, i) => (
              <div key={i} className="flex-1 max-w-[80px]">{c}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
