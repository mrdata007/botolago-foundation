import { cn } from "@/lib/utils";

/**
 * Design System V2 — Skeleton primitive.
 *
 * Uses the shared `shimmer` utility (soft light sweep) which
 * automatically becomes a static tone under prefers-reduced-motion.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("shimmer rounded-md", className)} {...props} />;
}

export { Skeleton };
