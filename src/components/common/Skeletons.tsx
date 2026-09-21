import { cn } from "@/lib/utils";
import { ui, UiSkeleton } from "@/components/ui-kit";

/**
 * Skeleton primitives that mirror the final layouts.
 *
 * Converted to the shared UI kit: each placeholder is the kit's `UiSkeleton`
 * (the `shimmer` sweep on `--ui-surface-sunken`) and every shell is the kit
 * card surface with the kit radii, so a skeleton and the content that
 * replaces it sit on exactly the same surface.
 *
 * Reduced motion is handled globally in `styles.css`.
 *
 * The public props of every export are unchanged.
 */

function Shimmer({ className }: { className?: string }) {
  return <UiSkeleton className={cn("block", className)} />;
}

export function HeroSkeleton() {
  return (
    <div className={cn(ui.surface.card, "relative min-w-0 overflow-hidden p-4")} aria-hidden>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0 space-y-2">
          <Shimmer className="h-3 w-24" />
          <Shimmer className="h-5 w-40" />
          <Shimmer className="h-3 w-28" />
        </div>
        <Shimmer className="h-7 w-24 rounded-full" />
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Shimmer key={i} className="h-14" />
        ))}
      </div>
      <Shimmer className="mt-4 h-[var(--ui-row-min)] w-full" />
    </div>
  );
}

export function MatchCardSkeleton() {
  return (
    <div className={cn(ui.surface.card, "flex min-w-0 items-center gap-3 p-3")} aria-hidden>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Shimmer className="h-7 w-7" />
        <Shimmer className="h-3 w-16" />
      </div>
      <div className="flex flex-col items-center gap-1 px-2">
        <Shimmer className="h-4 w-12" />
        <Shimmer className="h-2 w-8" />
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <Shimmer className="h-3 w-16" />
        <Shimmer className="h-7 w-7" />
      </div>
    </div>
  );
}

export function ArticleCardSkeleton({ variant = "row" }: { variant?: "row" | "lead" }) {
  return (
    <div className={cn(ui.surface.card, "min-w-0 overflow-hidden")} aria-hidden>
      <Shimmer
        className={cn(
          "w-full rounded-none",
          variant === "lead" ? "aspect-[16/10]" : "aspect-[16/8]",
        )}
      />
      <div className="space-y-2 p-4">
        <Shimmer className="h-3 w-20" />
        <Shimmer className={variant === "lead" ? "h-5 w-4/5" : "h-4 w-4/5"} />
        <Shimmer className="h-3 w-3/5" />
      </div>
    </div>
  );
}

export function PlayerRowSkeleton() {
  return (
    <div
      className={cn(ui.surface.card, "flex min-w-0 items-center gap-3 px-3 py-2.5", ui.space.row)}
      aria-hidden
    >
      <Shimmer className="h-7 w-7" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Shimmer className="h-3 w-32" />
        <Shimmer className="h-2.5 w-24" />
      </div>
      <Shimmer className="h-4 w-10" />
    </div>
  );
}

export function AlertRowSkeleton() {
  return (
    <div
      className={cn(
        "flex min-w-0 items-start gap-3 px-3 py-2.5",
        ui.radius.control,
        ui.rule.all,
        ui.surface.sunken,
      )}
      aria-hidden
    >
      <Shimmer className="h-4 w-4 rounded-full" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Shimmer className="h-3 w-24" />
        <Shimmer className="h-3 w-3/5" />
      </div>
    </div>
  );
}

export function StandingsRowSkeleton() {
  return (
    <div className={cn(ui.surface.card, "flex min-w-0 items-center gap-2.5 px-3 py-2")} aria-hidden>
      <Shimmer className="h-4 w-4" />
      <Shimmer className="h-7 w-7" />
      <Shimmer className="h-3 min-w-0 flex-1" />
      <Shimmer className="h-3 w-7" />
      <Shimmer className="h-3 w-8" />
      <Shimmer className="h-3 w-8" />
    </div>
  );
}

export function LeagueRowSkeleton() {
  return (
    <div className={cn(ui.surface.card, "flex min-w-0 items-center gap-3 px-3 py-3")} aria-hidden>
      <Shimmer className="h-10 w-10" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Shimmer className="h-3 w-32" />
        <Shimmer className="h-2.5 w-16" />
      </div>
      <Shimmer className="h-3 w-6" />
    </div>
  );
}

export function SkeletonList({
  count,
  children,
}: {
  count: number;
  children: (i: number) => React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="min-w-0">
          {children(i)}
        </div>
      ))}
    </div>
  );
}
