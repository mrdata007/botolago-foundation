import { cn } from "@/lib/utils";

interface Props {
  name: string;
  metric?: string;
  fixture?: string;
  className?: string;
}

/**
 * Compact dark nameplate under a jersey with a separate lighter fixture/points
 * chip beneath. Widths are uniform so labels stack cleanly across a row.
 */
export function PlayerNameplate({ name, metric, fixture, className }: Props) {
  return (
    <div className={cn("flex w-full flex-col items-center gap-0.5", className)}>
      <div
        className="w-full max-w-[76px] truncate rounded-md px-1.5 py-0.5 text-center text-[10px] font-bold leading-tight text-white shadow-sm"
        style={{ background: "color-mix(in oklab, var(--brand-charcoal) 92%, black)" }}
        title={name}
      >
        {name}
      </div>
      {(metric || fixture) && (
        <div className="w-full max-w-[76px] truncate rounded-b-md bg-white/85 px-1.5 py-0.5 text-center text-[10px] font-black tabular-nums leading-tight text-foreground ring-1 ring-black/5">
          {metric ?? fixture}
        </div>
      )}
    </div>
  );
}
