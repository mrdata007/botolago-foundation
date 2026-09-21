import { ui } from "@/components/ui-kit";
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
 * Two-line on-pitch label: an ink name plate over a metric chip.
 *
 * Both plates used to be hand-mixed gradients over `--brand-charcoal` and
 * `--brand-accent` with baked-in `rgba` shadows, so neither followed the
 * theme. They are now the kit's ink and card surfaces, and the metric keeps
 * the stat ramp because it is a figure a reader scans.
 */
export function PlayerNameplate({ name, metric, fixture, className, emphasize }: Props) {
  return (
    <div className={cn("flex w-full flex-col items-center", className)}>
      <div
        className={cn(
          "w-full max-w-[80px] truncate rounded-t-[var(--ui-radius-tight)] px-1.5 py-[3px] text-center leading-tight",
          ui.surface.inkPlain,
          ui.text.micro,
          "[font-weight:var(--ui-weight-heavy)]",
        )}
        title={name}
      >
        {name}
      </div>
      {(metric || fixture) && (
        <div
          className={cn(
            "w-full max-w-[80px] truncate rounded-b-[var(--ui-radius-tight)] px-1.5 py-[2px] text-center leading-tight",
            ui.stat.sm,
            emphasize
              ? "text-[color:var(--ui-ink-deep)]"
              : "bg-[color:var(--ui-surface)] text-[color:var(--ui-on-surface)]",
          )}
          style={emphasize ? { backgroundImage: "var(--ui-grad-action)" } : undefined}
        >
          {metric ?? fixture}
        </div>
      )}
    </div>
  );
}
