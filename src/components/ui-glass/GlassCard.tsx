import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  intensity?: "soft" | "regular" | "strong";
  as?: "div" | "section" | "article" | "aside";
}

// Controlled glassmorphism surface with a solid fallback for browsers
// without backdrop-filter support.
export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(function GlassCard(
  { className, intensity = "regular", as: _as = "div", ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "glass-surface rounded-2xl border border-[var(--glass-border)]",
        intensity === "soft" && "glass-soft",
        intensity === "regular" && "glass-regular",
        intensity === "strong" && "glass-strong",
        className,
      )}
      {...rest}
    />
  );
});
