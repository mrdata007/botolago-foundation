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

/** Home's Fantasy card while it loads: the card's shape (Option A, radius
 *  sheet) with the kicker, the rank line and the big figure. */
export function HeroSkeleton() {
  return (
    <div
      className={cn(
        ui.surface.card,
        ui.radius.sheet,
        "flex min-w-0 items-center gap-4 overflow-hidden px-5 py-6",
      )}
      aria-hidden
    >
      <div className="min-w-0 flex-1 space-y-2">
        <Shimmer className="h-3 w-40" />
        <Shimmer className="h-3 w-24" />
      </div>
      <Shimmer className="h-12 w-20" />
    </div>
  );
}

/**
 * A match row while it loads: the crest discs, the names and the time, at
 * the row's own height. `flat` for a row inside a card of rows (Home, the
 * Matches day list); otherwise the row is a card of its own.
 */
export function MatchCardSkeleton({ flat = false }: { flat?: boolean }) {
  return (
    <div
      className={cn("flex min-w-0 items-center gap-2.5 px-3.5 py-3.5", !flat && ui.surface.card)}
      aria-hidden
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Shimmer className={cn("h-8 w-8 shrink-0", ui.radius.full)} />
        <Shimmer className="h-3 w-16" />
      </div>
      <Shimmer className="h-5 w-12" />
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <Shimmer className="h-3 w-16" />
        <Shimmer className={cn("h-8 w-8 shrink-0", ui.radius.full)} />
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
      <Shimmer className={cn("h-8 w-8 shrink-0", ui.radius.full)} />
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
