import { cn } from "@/lib/utils";

interface Props {
  name: string;
  metric?: string;
  fixture?: string;
  className?: string;
  /** Emphasises the metric chip when this player is captained. */
  emphasize?: boolean;
}

/**
 * Two-line on-pitch label with a dark name plate and a bright metric chip.
 *
 * The dark plate is drawn on a nearly-opaque BotolaGO charcoal so player
 * names remain readable against any turf mow band. The metric chip below
 * carries expected points or fixture context in tabular numerals. Widths
 * are uniform so labels stack cleanly across a row.
 */
export function PlayerNameplate({ name, metric, fixture, className, emphasize }: Props) {
  return (
    <div className={cn("flex w-full flex-col items-center", className)}>
      <div
        className="w-full max-w-[80px] truncate rounded-t-md px-1.5 py-[3px] text-center text-[10px] font-bold leading-tight text-white"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in oklab, var(--brand-charcoal) 90%, black) 0%, color-mix(in oklab, var(--brand-charcoal) 98%, black) 100%)",
          boxShadow: "0 1px 0 rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
        title={name}
      >
        {name}
      </div>
      {(metric || fixture) && (
        <div
          className={cn(
            "w-full max-w-[80px] truncate rounded-b-md px-1.5 py-[2px] text-center text-[10px] font-black tabular-nums leading-tight",
            emphasize ? "text-white" : "text-foreground",
          )}
          style={{
            background: emphasize
              ? "linear-gradient(180deg, color-mix(in oklab, var(--brand-accent) 92%, black) 0%, color-mix(in oklab, var(--brand-accent) 78%, black) 100%)"
              : "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(240,244,252,0.92) 100%)",
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)",
          }}
        >
          {metric ?? fixture}
        </div>
      )}
    </div>
  );
}
