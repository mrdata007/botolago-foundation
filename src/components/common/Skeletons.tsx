import { cn } from "@/lib/utils";

/**
 * Skeleton primitives that mirror final layouts (per Design System V2).
 *
 * All skeletons use a single shimmer utility driven by a keyframe defined
 * inline (see styles.css `bgdrift` isn't reused — we rely on Tailwind's
 * animate-pulse but soften opacity for a calmer, more editorial feel).
 * Respects prefers-reduced-motion globally.
 */

function Shimmer({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "block animate-pulse rounded-md motion-reduce:animate-none",
        "bg-[color:var(--border-subtle)]",
        className,
      )}
    />
  );
}

export function HeroSkeleton() {
  return (
    <div className="surface-4 relative overflow-hidden p-4" aria-hidden>
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
          <Shimmer key={i} className="h-14 rounded-xl" />
        ))}
      </div>
      <Shimmer className="mt-4 h-11 w-full rounded-2xl" />
    </div>
  );
}

export function MatchCardSkeleton() {
  return (
    <div className="surface-2 flex items-center gap-3 p-3" aria-hidden>
      <div className="flex flex-1 items-center gap-2">
        <Shimmer className="h-7 w-7 rounded-xl" />
        <Shimmer className="h-3 w-16" />
      </div>
      <div className="flex flex-col items-center gap-1 px-2">
        <Shimmer className="h-4 w-12" />
        <Shimmer className="h-2 w-8" />
      </div>
      <div className="flex flex-1 items-center justify-end gap-2">
        <Shimmer className="h-3 w-16" />
        <Shimmer className="h-7 w-7 rounded-xl" />
      </div>
    </div>
  );
}

export function ArticleCardSkeleton({ variant = "row" }: { variant?: "row" | "lead" }) {
  if (variant === "lead") {
    return (
      <div
        className="relative overflow-hidden rounded-[var(--radius-hero)] border border-[var(--border-subtle)] shadow-card"
        aria-hidden
      >
        <Shimmer className="aspect-[16/10] w-full rounded-none" />
        <div className="space-y-2 p-4">
          <Shimmer className="h-3 w-20 rounded-full" />
          <Shimmer className="h-5 w-4/5" />
          <Shimmer className="h-3 w-3/5" />
        </div>
      </div>
    );
  }
  return (
    <div className="surface-2 overflow-hidden p-0" aria-hidden>
      <Shimmer className="aspect-[16/8] w-full rounded-none" />
      <div className="space-y-2 p-4">
        <Shimmer className="h-3 w-20" />
        <Shimmer className="h-4 w-4/5" />
        <Shimmer className="h-3 w-3/5" />
      </div>
    </div>
  );
}

export function PlayerRowSkeleton() {
  return (
    <div className="surface-2 flex items-center gap-3 px-3 py-2.5" aria-hidden>
      <Shimmer className="h-7 w-7 rounded-xl" />
      <div className="flex-1 space-y-1.5">
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
      className="flex items-start gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[color:var(--surface)]/60 px-3 py-2.5"
      aria-hidden
    >
      <Shimmer className="h-4 w-4 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Shimmer className="h-3 w-24" />
        <Shimmer className="h-3 w-3/5" />
      </div>
    </div>
  );
}

export function LeagueRowSkeleton() {
  return (
    <div className="surface-2 flex items-center gap-3 px-3 py-3" aria-hidden>
      <Shimmer className="h-10 w-10 rounded-xl" />
      <div className="flex-1 space-y-1.5">
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
        <div key={i}>{children(i)}</div>
      ))}
    </div>
  );
}
